import type { ActionExecution, Observation } from "./contracts.js";
import { firstMeaningfulLine, listPreview, truncateByChars } from "./text.js";

const EXECUTION_PREVIEW_MAX_CHARS = 90;

type AgentStepLogLike = {
  type: "agent_response" | "observation" | "finish";
  commands?: string[];
  exitCode?: number;
};

export function formatFinishStepSummary(result: string): string {
  return `Finished: ${truncateByChars(result, 140)}`;
}

function summarizeExecutionOutput(execution: ActionExecution): string {
  const command = execution.command.trim();
  const status = execution.result.exitCode === 0 ? "ok" : `err(${execution.result.exitCode})`;

  if (/^git status --porcelain$/.test(command)) {
    const porcelain = execution.result.stdout.trim();
    const summary =
      porcelain.length === 0 ? "clean working tree" : `changes: ${truncateByChars(listPreview(porcelain), EXECUTION_PREVIEW_MAX_CHARS)}`;
    return `${command} => ${summary}`;
  }

  if (/^ls(\s|$)/.test(command)) {
    return `${command} => files: ${truncateByChars(listPreview(execution.result.stdout), EXECUTION_PREVIEW_MAX_CHARS)}`;
  }

  const excerpt = firstMeaningfulLine(execution.result.stderr || execution.result.stdout) || "no output";
  return `${command} => ${status}, ${truncateByChars(excerpt, EXECUTION_PREVIEW_MAX_CHARS)}`;
}

function formatLatestOutputs(observations: Observation[]): string {
  const latest = observations[observations.length - 1];
  if (!latest || latest.raw.executions.length === 0) {
    return "- No command outputs captured.";
  }
  return latest.raw.executions.map((execution) => `- ${summarizeExecutionOutput(execution)}`).join("\n");
}

function formatWorkSummary(stepLogs: AgentStepLogLike[]): string {
  const actionSteps = stepLogs.filter((log) => log.type === "agent_response" && Array.isArray(log.commands));
  if (actionSteps.length === 0) {
    return "No action steps executed.";
  }
  const observations = stepLogs.filter((log) => log.type === "observation");
  const successful = observations.filter((log) => log.exitCode === 0).length;
  return `${actionSteps.length} action step(s) executed; ${successful} observation(s) succeeded.`;
}

export function formatFinishResult(
  objective: string,
  modelResult: string,
  stepLogs: AgentStepLogLike[],
  observations: Observation[],
): string {
  return [
    `Objective: ${objective}`,
    `Response: ${modelResult}`,
    `Work summary: ${formatWorkSummary(stepLogs)}`,
    "Key outputs:",
    formatLatestOutputs(observations),
  ].join("\n");
}

export function formatMaxStepsResult(
  objective: string,
  maxSteps: number,
  stepLogs: AgentStepLogLike[],
  observations: Observation[],
): string {
  return [
    `Objective: ${objective}`,
    `Response: Incomplete; step budget exhausted (${maxSteps}).`,
    `Work summary: ${formatWorkSummary(stepLogs)}`,
    "Key outputs:",
    formatLatestOutputs(observations),
  ].join("\n");
}

export function formatCancelledResult(
  objective: string,
  stepLogs: AgentStepLogLike[],
  observations: Observation[],
): string {
  return [
    `Objective: ${objective}`,
    "Response: Cancelled by user.",
    `Work summary: ${formatWorkSummary(stepLogs)}`,
    "Key outputs:",
    formatLatestOutputs(observations),
  ].join("\n");
}
