import {
  assertActionResult,
  assertCommandRequest,
  assertCommandResult,
  assertModelDecision,
  assertObservation,
  type ActionResult,
  type CommandResult,
  type Observation,
} from "./contracts.js";
import type { AgentConfig } from "./config.js";
import type { AgentHooks, HookResult } from "./hooks.js";
import { parseErrorMessage } from "./shared.js";
import { firstMeaningfulLine, truncateByBytes, truncateByChars } from "./text.js";

const PREVIEW_COMMAND_MAX_CHARS = 44;
const PREVIEW_OUTPUT_MAX_CHARS = 64;

function signalFromResult(result: ActionResult): string[] {
  const signals = new Set<string>();
  const combined = `${result.stdout}\n${result.stderr}\n${result.executions
    .map((execution) => `${execution.result.stdout}\n${execution.result.stderr}`)
    .join("\n")}`.toLowerCase();

  if (result.aggregateExitCode !== 0) {
    signals.add("error");
  }
  if (result.anyTimedOut) {
    signals.add("timedOut");
  }
  if (/no such file|not found|enoent/.test(combined)) {
    signals.add("missingFile");
  }
  if (/permission denied|eacces|operation not permitted/.test(combined)) {
    signals.add("permission");
  }
  if (/command denied by policy/.test(combined)) {
    signals.add("commandDenied");
  }
  if (/test(s)? failed|failing|assertionerror/.test(combined)) {
    signals.add("testFail");
  }

  return [...signals];
}

function normalizeBatch(commands: string[]): string[] {
  return commands.map((command) => command.trim());
}

function extractCommandsFromObservation(observation: Observation): string[] {
  return observation.raw.executions.map((execution) => execution.command.trim());
}

function sameCommandBatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((command, index) => command === right[index]);
}

function trailingRepeatedBatchCount(observations: Observation[], commands: string[]): number {
  const normalized = normalizeBatch(commands);
  let repeats = 0;

  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const observation = observations[index];
    if (!observation) {
      break;
    }
    const previous = extractCommandsFromObservation(observation);
    if (previous.length === 0 || !sameCommandBatch(previous, normalized)) {
      break;
    }
    repeats += 1;
  }

  return repeats;
}

function actionResultSignature(result: ActionResult): string {
  return result.executions
    .map((execution) => {
      const line = firstMeaningfulLine(execution.result.stderr || execution.result.stdout);
      return `${execution.command.trim()}|${execution.result.exitCode}|${line}`;
    })
    .join("||");
}

function summarizeObservation(observation: Observation): string {
  const status = observation.exitCode === 0 ? "ok" : "error";
  const signalText = observation.signals.length > 0 ? ` signals=${observation.signals.join(",")}` : "";
  const commandCount = observation.raw.executions.length;
  const previews = observation.raw.executions.slice(0, 3).map((execution, idx) => {
    const commandStatus = execution.result.exitCode === 0 ? "ok" : `err(${execution.result.exitCode})`;
    const excerpt = firstMeaningfulLine(execution.result.stderr || execution.result.stdout) || "no-output";
    return `cmd${idx + 1}:${commandStatus}:${truncateByChars(execution.command, PREVIEW_COMMAND_MAX_CHARS)}=>${truncateByChars(excerpt, PREVIEW_OUTPUT_MAX_CHARS)}`;
  });
  const moreText = commandCount > previews.length ? ` (+${commandCount - previews.length} more)` : "";
  const previewText = previews.length > 0 ? ` ${previews.join(" | ")}${moreText}` : "";
  return `batch=${status} exitCode=${observation.exitCode} commands=${commandCount}${signalText}${previewText}`;
}

function reject(reason: string, code?: string): HookResult<never> {
  if (code === undefined) {
    return { status: "reject", reason };
  }
  return { status: "reject", reason, code };
}

export function createDefaultHooks(config: AgentConfig): AgentHooks {
  return {
    preThink: [
      (context) => {
        if (context.observations.length <= config.historyWindow) {
          return { status: "ok" };
        }

        return {
          status: "modify",
          value: {
            ...context,
            observations: context.observations.slice(-config.historyWindow),
          },
        };
      },
    ],
    postThink: [
      (context, decision) => {
        try {
          const normalized = assertModelDecision(decision);
          if (normalized.type === "action") {
            const repeats = trailingRepeatedBatchCount(context.observations, normalized.commands);
            if (repeats >= config.maxRepeatedActionBatches) {
              return reject(
                `Repeated command batch detected ${repeats + 1} times. Choose different commands or finish.`,
                "duplicateAction",
              );
            }
          }
          return { status: "modify", value: normalized };
        } catch (error) {
          return reject(parseErrorMessage(error), "invalidModelDecision");
        }
      },
    ],
    preAction: [
      (_context, request) => {
        try {
          const normalized = assertCommandRequest(request);

          for (const deniedPattern of config.deniedCommandPatterns) {
            if (deniedPattern.test(normalized.command)) {
              return reject(`Command denied by policy: ${deniedPattern.source}`, "commandDenied");
            }
          }

          const timeoutMs = Math.min(normalized.timeoutMs, config.defaultTimeoutMs);
          return {
            status: "modify",
            value: {
              ...normalized,
              timeoutMs,
            },
          };
        } catch (error) {
          return reject(parseErrorMessage(error), "invalidCommandRequest");
        }
      },
    ],
    postAction: [
      (_context, result) => {
        try {
          const normalized = assertCommandResult(result);
          return {
            status: "modify",
            value: {
              ...normalized,
              stdout: truncateByBytes(normalized.stdout, config.maxStdoutBytes, "[output truncated by postAction hook]"),
              stderr: truncateByBytes(normalized.stderr, config.maxStderrBytes, "[output truncated by postAction hook]"),
            },
          };
        } catch (error) {
          return reject(parseErrorMessage(error), "invalidCommandResult");
        }
      },
    ],
    preObserve: [
      (_context, result) => {
        try {
          return { status: "modify", value: assertActionResult(result) };
        } catch (error) {
          return reject(parseErrorMessage(error), "invalidObserveInput");
        }
      },
    ],
    postObserve: [
      (context, observation) => {
        try {
          const normalized = assertObservation(observation);
          const mergedSignals = new Set([...normalized.signals, ...signalFromResult(normalized.raw)]);
          const previous = context.observations[context.observations.length - 1];
          if (
            previous &&
            previous.exitCode === normalized.exitCode &&
            sameCommandBatch(extractCommandsFromObservation(previous), extractCommandsFromObservation(normalized)) &&
            actionResultSignature(previous.raw) === actionResultSignature(normalized.raw)
          ) {
            mergedSignals.add("noProgress");
          }
          const updated: Observation = {
            ...normalized,
            signals: [...mergedSignals],
          };
          return {
            status: "modify",
            value: {
              ...updated,
              summary: summarizeObservation(updated),
            },
          };
        } catch (error) {
          return reject(parseErrorMessage(error), "invalidObservation");
        }
      },
    ],
  };
}
