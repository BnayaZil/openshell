import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import type { Observation } from "./contracts.js";
import type { ThinkFn } from "./loop.js";
import { parseErrorMessage } from "./shared.js";

const decisionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("action"),
    commands: z.array(z.string().min(1, "commands must be non-empty")).min(1, "at least one command is required"),
  }),
  z.object({
    type: z.literal("finish"),
    result: z.string().min(1, "result must be non-empty"),
  }),
]);

export type ZenThinkConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  cwd?: string;
  maxObservationsForPrompt?: number;
  observationMode?: "summary" | "full";
  systemPrompt?: string;
  logger?: (event: string, payload: unknown) => void;
};

export type ThinkInput = {
  objective: string;
  step: number;
  maxSteps: number;
  observations: Observation[];
};

function loadDefaultSystemPrompt(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    join(moduleDir, "systemPrompt.txt"),
    join(process.cwd(), "packages/agent/src/systemPrompt.txt"),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const content = readFileSync(candidatePath, "utf8").trim();
      if (content.length > 0) {
        return content;
      }
    } catch {
      // Try the next path candidate.
    }
  }

  throw new Error("Failed to load system prompt from packages/agent/src/systemPrompt.txt.");
}

const defaultSystemPrompt = loadDefaultSystemPrompt();

type DynamicEnvironmentInput = {
  model: string;
  cwd: string;
  platform?: NodeJS.Platform;
  shell?: string;
  now?: Date;
};

function isGitRepo(cwd: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return false;
  }
  return result.stdout.trim().toLowerCase() === "true";
}

export function buildDynamicEnvironmentPrompt(input: DynamicEnvironmentInput): string {
  const platform = input.platform ?? process.platform;
  const shell = input.shell ?? process.env["SHELL"] ?? "unknown";
  const now = input.now ?? new Date();
  const inGitRepo = isGitRepo(input.cwd) ? "yes" : "no";

  return [
    `You are powered by the model named ${input.model}.`,
    "Here is some useful information about the environment you are running in:",
    "<env>",
    `  Working directory: ${input.cwd}`,
    `  Is directory a git repo: ${inGitRepo}`,
    `  Platform: ${platform}`,
    `  Shell: ${shell}`,
    `  Today's date: ${now.toDateString()}`,
    "</env>",
  ].join("\n");
}

export function buildSystemPrompt(baseSystemPrompt: string, input: DynamicEnvironmentInput): string {
  return [baseSystemPrompt.trim(), buildDynamicEnvironmentPrompt(input)].join("\n\n");
}

function trimBlock(text: string): string {
  const value = text.trim();
  return value.length === 0 ? "(empty)" : value;
}

function formatObservationSummary(observation: Observation, stepIndex: number): string {
  const signals = observation.signals.length > 0 ? observation.signals.join(", ") : "none";
  return `obs_${stepIndex}: summary="${observation.summary}" exitCode=${observation.exitCode} signals=[${signals}]`;
}

function formatObservationFull(observation: Observation, stepIndex: number): string {
  const signals = observation.signals.length > 0 ? observation.signals.join(", ") : "none";
  const executionLines =
    observation.raw.executions.length === 0
      ? "  - no command executions"
      : observation.raw.executions
          .map((execution, idx) => {
            const stdout = trimBlock(execution.result.stdout);
            const stderr = trimBlock(execution.result.stderr);
            return [
              `  - cmd_${idx + 1}: ${execution.command}`,
              `    exitCode=${execution.result.exitCode} timedOut=${execution.result.timedOut} durationMs=${execution.result.durationMs}`,
              `    stdout=${JSON.stringify(stdout)}`,
              `    stderr=${JSON.stringify(stderr)}`,
            ].join("\n");
          })
          .join("\n");

  return [
    `obs_${stepIndex}: summary="${observation.summary}" exitCode=${observation.exitCode} signals=[${signals}]`,
    "executions:",
    executionLines,
    `aggregateStdout=${JSON.stringify(trimBlock(observation.raw.stdout))}`,
    `aggregateStderr=${JSON.stringify(trimBlock(observation.raw.stderr))}`,
  ].join("\n");
}

export function formatObservationWindow(
  observations: Observation[],
  count: number,
  mode: "summary" | "full" = "summary",
): string {
  if (observations.length === 0) {
    return "No observations yet.";
  }

  const startIndex = observations.length - Math.min(count, observations.length) + 1;
  return observations
    .slice(-count)
    .map((observation, idx) => {
      const stepIndex = startIndex + idx;
      return mode === "full"
        ? formatObservationFull(observation, stepIndex)
        : formatObservationSummary(observation, stepIndex);
    })
    .join("\n\n");
}

export function buildUserPrompt(
  input: ThinkInput,
  maxObservationsForPrompt: number,
  observationMode: "summary" | "full" = "summary",
): string {
  return [
    `Objective: ${input.objective}`,
    `CurrentStep: ${input.step}`,
    `MaxSteps: ${input.maxSteps}`,
    `ObservationMode: ${observationMode}`,
    "",
    "RecentObservations:",
    formatObservationWindow(input.observations, maxObservationsForPrompt, observationMode),
  ].join("\n");
}

export function createZenThink(config: ZenThinkConfig): ThinkFn {
  const logger = config.logger ?? (() => undefined);
  const provider = createOpenAICompatible({
    name: "opencode-zen",
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  const model = provider(config.model);
  const maxObservationsForPrompt = config.maxObservationsForPrompt ?? 5;
  const observationMode = config.observationMode ?? "summary";
  const cwd = config.cwd ?? process.cwd();
  const system = buildSystemPrompt(config.systemPrompt ?? defaultSystemPrompt, {
    model: config.model,
    cwd,
  });

  return async (input) => {
    const userPrompt = buildUserPrompt(input, maxObservationsForPrompt, observationMode);
    logger("llm.request", {
      step: input.step,
      model: config.model,
      baseURL: config.baseURL,
      observationMode,
      system,
      prompt: userPrompt,
    });

    try {
      const { text } = await generateText({
        model,
        system,
        prompt: userPrompt,
        temperature: 0,
      });
      logger("llm.response", {
        step: input.step,
        text,
      });
      const jsonText = extractFirstJsonObject(text);
      const parsed = JSON.parse(jsonText);
      return decisionSchema.parse(parsed);
    } catch (error) {
      logger("llm.error", {
        step: input.step,
        error: parseErrorMessage(error),
      });
      throw error;
    }
  };
}

function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Model did not return a JSON object. Raw output: ${text}`);
  }
  return text.slice(start, end + 1);
}
