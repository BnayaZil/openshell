import type { AgentResult } from "./loop.js";
import { isObject } from "./shared.js";
import { firstMeaningfulLine, truncateByChars } from "./text.js";

const PREVIEW_MAX_CHARS = 120;
const ROLLING_SUMMARY_ITEM_MAX_CHARS = 90;
const ROLLING_SUMMARY_MAX_CHARS = 1200;
const COMMAND_OUTPUT_STORE_MAX_CHARS = 5_000;
const RESPONSE_LINE_FALLBACK_MAX_CHARS = 240;
const RECENT_COMMAND_SUMMARY_COUNT = 3;
const RECENT_TURNS_FOR_SUMMARY = 3;
const DEFAULT_MAX_MESSAGES = 80;
const DEFAULT_MAX_TURNS = 20;
const DEFAULT_MAX_COMMANDS_PER_TURN = 80;

export type ChatRole = "user" | "assistant" | "system";
export type TurnStatus = "running" | "finished" | "maxStepsReached" | "cancelled" | "error";

export type ChatMessage = {
  id: number;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type CommandEntry = {
  id: number;
  step?: number;
  command: string;
  exitCode: number;
  timedOut: boolean;
  stdoutPreview: string;
  stderrPreview: string;
  stdout: string;
  stderr: string;
};

export type ChatTurn = {
  id: number;
  userMessageId: number;
  objective: string;
  status: TurnStatus;
  startedAt: number;
  finishedAt?: number;
  resultText?: string;
  commands: CommandEntry[];
};

export type AgentSessionState = {
  cwd: string;
  model: string;
  maxSteps?: number;
  isRunning: boolean;
  activeTurnId: number | undefined;
  rollingSummary: string;
  messages: ChatMessage[];
  turns: ChatTurn[];
  nextMessageId: number;
  nextTurnId: number;
  nextCommandId: number;
  maxMessages: number;
  maxTurns: number;
  maxCommandsPerTurn: number;
};

export type PersistedAgentSession = {
  rollingSummary: string;
  messages: ChatMessage[];
  turns: ChatTurn[];
  nextMessageId: number;
  nextTurnId: number;
  nextCommandId: number;
};

export type AgentLogEvent = {
  event: string;
  payload: unknown;
};

type StartPayload = {
  maxSteps?: number;
};

type ExecResultPayload = {
  step?: number;
  command?: string;
  commandResult?: {
    exitCode?: number;
    timedOut?: boolean;
    stdout?: string;
    stderr?: string;
  };
};

type RejectPayload = {
  step?: number;
  command?: string;
  reason?: string;
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  return value;
}

function parseStartPayload(value: unknown): StartPayload {
  const data = asObject(value);
  if (!data) {
    return {};
  }
  const maxSteps = data["maxSteps"];
  return typeof maxSteps === "number" ? { maxSteps } : {};
}

function parseExecResultPayload(value: unknown): ExecResultPayload {
  const data = asObject(value);
  if (!data) {
    return {};
  }
  const rawResult = asObject(data["commandResult"]);
  const step = data["step"];
  const command = data["command"];
  const commandResult = rawResult
    ? {
        ...(typeof rawResult["exitCode"] === "number" ? { exitCode: rawResult["exitCode"] } : {}),
        ...(typeof rawResult["timedOut"] === "boolean" ? { timedOut: rawResult["timedOut"] } : {}),
        ...(typeof rawResult["stdout"] === "string" ? { stdout: rawResult["stdout"] } : {}),
        ...(typeof rawResult["stderr"] === "string" ? { stderr: rawResult["stderr"] } : {}),
      }
    : undefined;
  return {
    ...(typeof step === "number" ? { step } : {}),
    ...(typeof command === "string" ? { command } : {}),
    ...(commandResult ? { commandResult } : {}),
  };
}

function parseRejectPayload(value: unknown): RejectPayload {
  const data = asObject(value);
  if (!data) {
    return {};
  }
  const step = data["step"];
  const command = data["command"];
  const reason = data["reason"];
  return {
    ...(typeof step === "number" ? { step } : {}),
    ...(typeof command === "string" ? { command } : {}),
    ...(typeof reason === "string" ? { reason } : {}),
  };
}

function safeStep(payload: unknown): number | undefined {
  const data = asObject(payload);
  const step = data?.["step"];
  return typeof step === "number" && Number.isInteger(step) && step > 0 ? step : undefined;
}

function pickPreview(stdout: string, stderr: string): { stdoutPreview: string; stderrPreview: string } {
  return {
    stdoutPreview: truncateByChars(firstMeaningfulLine(stdout), PREVIEW_MAX_CHARS),
    stderrPreview: truncateByChars(firstMeaningfulLine(stderr), PREVIEW_MAX_CHARS),
  };
}

function bounded<T>(value: T[], maxItems: number): T[] {
  if (value.length <= maxItems) {
    return value;
  }
  return value.slice(-maxItems);
}

function withMessages(state: AgentSessionState, messages: ChatMessage[]): AgentSessionState {
  return {
    ...state,
    messages: bounded(messages, state.maxMessages),
  };
}

function withTurns(state: AgentSessionState, turns: ChatTurn[]): AgentSessionState {
  return {
    ...state,
    turns: bounded(turns, state.maxTurns),
  };
}

function updateActiveTurn(state: AgentSessionState, updater: (turn: ChatTurn) => ChatTurn): AgentSessionState {
  if (!state.activeTurnId) {
    return state;
  }
  const index = state.turns.findIndex((turn) => turn.id === state.activeTurnId);
  if (index === -1) {
    return state;
  }
  const updatedTurns = [...state.turns];
  const currentTurn = updatedTurns[index];
  if (!currentTurn) {
    return state;
  }
  updatedTurns[index] = updater(currentTurn);
  return withTurns(state, updatedTurns);
}

function buildRecentCommandSummary(turn: ChatTurn | undefined): string {
  if (!turn || turn.commands.length === 0) {
    return "none";
  }
  return turn.commands
    .slice(-RECENT_COMMAND_SUMMARY_COUNT)
    .map((entry) => `${entry.command} (exit ${entry.exitCode})`)
    .join("; ");
}

function parseResponseLine(resultText: string): string {
  const line = resultText
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("Response:"));
  if (!line) {
    return truncateByChars(resultText, RESPONSE_LINE_FALLBACK_MAX_CHARS);
  }
  return line.replace(/^Response:\s*/, "");
}

function buildRollingSummary(state: AgentSessionState): string {
  const recentTurns = state.turns.filter((turn) => turn.status !== "running").slice(-RECENT_TURNS_FOR_SUMMARY);
  if (recentTurns.length === 0) {
    return "";
  }

  const items = recentTurns.map((turn) => {
    const userMessage = state.messages.find((msg) => msg.id === turn.userMessageId)?.content ?? "";
    const assistantMessage =
      [...state.messages]
        .reverse()
        .find((msg) => msg.role === "assistant" && msg.createdAt >= turn.startedAt)?.content ?? "";
    return `- User: ${truncateByChars(userMessage, ROLLING_SUMMARY_ITEM_MAX_CHARS)} | Result: ${truncateByChars(assistantMessage, ROLLING_SUMMARY_ITEM_MAX_CHARS)} | Commands: ${buildRecentCommandSummary(turn)}`;
  });

  return truncateByChars(items.join("\n"), ROLLING_SUMMARY_MAX_CHARS);
}

export function createInitialSessionState(input: {
  cwd: string;
  model: string;
  maxMessages?: number;
  maxTurns?: number;
  maxCommandsPerTurn?: number;
}): AgentSessionState {
  return {
    cwd: input.cwd,
    model: input.model,
    isRunning: false,
    activeTurnId: undefined,
    rollingSummary: "",
    messages: [],
    turns: [],
    nextMessageId: 1,
    nextTurnId: 1,
    nextCommandId: 1,
    maxMessages: input.maxMessages ?? DEFAULT_MAX_MESSAGES,
    maxTurns: input.maxTurns ?? DEFAULT_MAX_TURNS,
    maxCommandsPerTurn: input.maxCommandsPerTurn ?? DEFAULT_MAX_COMMANDS_PER_TURN,
  };
}

export function appendSystemMessage(state: AgentSessionState, content: string): AgentSessionState {
  const nextMessage: ChatMessage = {
    id: state.nextMessageId,
    role: "system",
    content,
    createdAt: Date.now(),
  };
  return {
    ...withMessages(state, [...state.messages, nextMessage]),
    nextMessageId: state.nextMessageId + 1,
  };
}

export function buildObjectiveForTurn(state: AgentSessionState, userMessage: string): string {
  const latestTurn = state.turns[state.turns.length - 1];
  const latestCommands = buildRecentCommandSummary(latestTurn);
  const summary = state.rollingSummary.trim();

  const parts = [
    "Continue helping the user in this terminal workspace.",
    summary ? `Prior session summary:\n${summary}` : "",
    latestCommands !== "none" ? `Recent terminal activity:\n${latestCommands}` : "",
    `Latest user request:\n${userMessage}`,
  ].filter((part) => part.length > 0);

  return parts.join("\n\n");
}

export function beginTurn(
  state: AgentSessionState,
  userMessage: string,
): { state: AgentSessionState; turnId: number; objective: string } {
  const content = userMessage.trim();
  if (content.length === 0) {
    throw new Error("Cannot start a turn with an empty message.");
  }

  const userMsg: ChatMessage = {
    id: state.nextMessageId,
    role: "user",
    content,
    createdAt: Date.now(),
  };
  const withUser = {
    ...withMessages(state, [...state.messages, userMsg]),
    nextMessageId: state.nextMessageId + 1,
  };
  const objective = buildObjectiveForTurn(withUser, content);
  const turn: ChatTurn = {
    id: withUser.nextTurnId,
    userMessageId: userMsg.id,
    objective,
    status: "running",
    startedAt: Date.now(),
    commands: [],
  };
  const withTurn = withTurns(withUser, [...withUser.turns, turn]);

  return {
    state: {
      ...withTurn,
      isRunning: true,
      activeTurnId: turn.id,
      nextTurnId: withUser.nextTurnId + 1,
    },
    turnId: turn.id,
    objective,
  };
}

export function reduceAgentLogEvent(state: AgentSessionState, event: AgentLogEvent): AgentSessionState {
  if (!state.activeTurnId) {
    return state;
  }

  if (event.event === "agent.start") {
    const payload = parseStartPayload(event.payload);
    if (typeof payload.maxSteps === "number") {
      return { ...state, maxSteps: payload.maxSteps };
    }
    return state;
  }

  if (event.event === "agent.step.exec.result") {
    const payload = parseExecResultPayload(event.payload);
    const stdout = payload.commandResult?.stdout ?? "";
    const stderr = payload.commandResult?.stderr ?? "";
    const previews = pickPreview(stdout, stderr);
    const entry: CommandEntry = {
      id: state.nextCommandId,
      command: payload.command?.trim() || "<unknown>",
      exitCode: typeof payload.commandResult?.exitCode === "number" ? payload.commandResult.exitCode : 1,
      timedOut: payload.commandResult?.timedOut === true,
      stdoutPreview: previews.stdoutPreview,
      stderrPreview: previews.stderrPreview,
      stdout: truncateByChars(stdout, COMMAND_OUTPUT_STORE_MAX_CHARS),
      stderr: truncateByChars(stderr, COMMAND_OUTPUT_STORE_MAX_CHARS),
      ...(typeof payload.step === "number" ? { step: payload.step } : {}),
    };
    const updated = updateActiveTurn(state, (turn) => ({
      ...turn,
      commands: bounded([...turn.commands, entry], state.maxCommandsPerTurn),
    }));
    return {
      ...updated,
      nextCommandId: state.nextCommandId + 1,
    };
  }

  if (event.event === "agent.step.preAction.reject" || event.event === "agent.step.postAction.reject") {
    const payload = parseRejectPayload(event.payload);
    const reason = payload.reason ?? "Action rejected by policy.";
    const step = safeStep(event.payload);
    const entry: CommandEntry = {
      id: state.nextCommandId,
      command: payload.command?.trim() || "<blocked>",
      exitCode: 1,
      timedOut: false,
      stdoutPreview: "",
      stderrPreview: truncateByChars(reason, PREVIEW_MAX_CHARS),
      stdout: "",
      stderr: reason,
      ...(step !== undefined ? { step } : {}),
    };
    const updated = updateActiveTurn(state, (turn) => ({
      ...turn,
      commands: bounded([...turn.commands, entry], state.maxCommandsPerTurn),
    }));
    return {
      ...updated,
      nextCommandId: state.nextCommandId + 1,
    };
  }

  return state;
}

export function applyTurnResult(state: AgentSessionState, turnId: number, result: AgentResult): AgentSessionState {
  const resultStatus: TurnStatus =
    result.status === "finished" ? "finished" : result.status === "cancelled" ? "cancelled" : "maxStepsReached";
  const updatedTurns = state.turns.map((turn) =>
    turn.id === turnId
      ? {
          ...turn,
          status: resultStatus,
          finishedAt: Date.now(),
          resultText: result.result,
        }
      : turn,
  );
  const assistantMessage: ChatMessage = {
    id: state.nextMessageId,
    role: "assistant",
    content: parseResponseLine(result.result),
    createdAt: Date.now(),
  };
  const withMessagesState = {
    ...withTurns(state, updatedTurns),
    isRunning: false,
    activeTurnId: undefined,
    nextMessageId: state.nextMessageId + 1,
    messages: bounded([...state.messages, assistantMessage], state.maxMessages),
  };
  return {
    ...withMessagesState,
    rollingSummary: buildRollingSummary(withMessagesState),
  };
}

export function applyTurnError(state: AgentSessionState, turnId: number, error: Error): AgentSessionState {
  const updatedTurns = state.turns.map((turn) =>
    turn.id === turnId
      ? {
          ...turn,
          status: "error" as const,
          finishedAt: Date.now(),
          resultText: error.message,
        }
      : turn,
  );
  const assistantMessage: ChatMessage = {
    id: state.nextMessageId,
    role: "assistant",
    content: `Run failed: ${error.message}`,
    createdAt: Date.now(),
  };
  const withMessagesState = {
    ...withTurns(state, updatedTurns),
    isRunning: false,
    activeTurnId: undefined,
    nextMessageId: state.nextMessageId + 1,
    messages: bounded([...state.messages, assistantMessage], state.maxMessages),
  };
  return {
    ...withMessagesState,
    rollingSummary: buildRollingSummary(withMessagesState),
  };
}

export function toPersistedSession(state: AgentSessionState): PersistedAgentSession {
  const safeTurns = state.turns.map((turn) =>
    turn.status === "running"
      ? {
          ...turn,
          status: "error" as const,
          finishedAt: turn.finishedAt ?? Date.now(),
          resultText: turn.resultText ?? "Interrupted before completion.",
        }
      : turn,
  );

  return {
    rollingSummary: state.rollingSummary,
    messages: state.messages,
    turns: safeTurns,
    nextMessageId: state.nextMessageId,
    nextTurnId: state.nextTurnId,
    nextCommandId: state.nextCommandId,
  };
}

export function hydrateFromSession(base: AgentSessionState, persisted: PersistedAgentSession): AgentSessionState {
  const messages = bounded(persisted.messages ?? [], base.maxMessages);
  const turns = bounded(
    (persisted.turns ?? []).map((turn) =>
      turn.status === "running"
        ? {
            ...turn,
            status: "error" as const,
            finishedAt: turn.finishedAt ?? Date.now(),
            resultText: turn.resultText ?? "Interrupted before completion.",
          }
        : turn,
    ),
    base.maxTurns,
  );

  return {
    ...base,
    messages,
    turns,
    rollingSummary: persisted.rollingSummary ?? "",
    nextMessageId: Math.max(persisted.nextMessageId ?? 1, messages.length + 1),
    nextTurnId: Math.max(persisted.nextTurnId ?? 1, (turns[turns.length - 1]?.id ?? 0) + 1),
    nextCommandId: Math.max(
      persisted.nextCommandId ?? 1,
      turns.flatMap((turn) => turn.commands).reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
    ),
    isRunning: false,
    activeTurnId: undefined,
  };
}
