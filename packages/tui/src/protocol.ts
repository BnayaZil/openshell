import type { AgentSessionState } from "@openshell/agent/session";

export type SessionEvent =
  | { type: "session.snapshot"; sessionId: string; state: AgentSessionState }
  | { type: "agent.log"; sessionId: string; event: string; payload: unknown }
  | { type: "turn.started"; sessionId: string; turnId: number }
  | { type: "turn.cancelled"; sessionId: string; turnId: number }
  | { type: "turn.completed"; sessionId: string; turnId: number }
  | { type: "turn.failed"; sessionId: string; turnId: number; error: string };

export type OpenSessionResult = {
  sessionId: string;
  state: AgentSessionState;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAgentSessionState(value: unknown): value is AgentSessionState {
  if (!isObject(value)) {
    return false;
  }

  const activeTurnId = value["activeTurnId"];
  const hasValidActiveTurn = activeTurnId === undefined || typeof activeTurnId === "number";

  return (
    typeof value["cwd"] === "string" &&
    typeof value["model"] === "string" &&
    typeof value["isRunning"] === "boolean" &&
    hasValidActiveTurn &&
    typeof value["rollingSummary"] === "string" &&
    Array.isArray(value["messages"]) &&
    Array.isArray(value["turns"]) &&
    typeof value["nextMessageId"] === "number" &&
    typeof value["nextTurnId"] === "number" &&
    typeof value["nextCommandId"] === "number" &&
    typeof value["maxMessages"] === "number" &&
    typeof value["maxTurns"] === "number" &&
    typeof value["maxCommandsPerTurn"] === "number"
  );
}

export function parseOpenSessionResult(value: unknown): OpenSessionResult {
  if (!isObject(value)) {
    throw new Error("Invalid open session response.");
  }
  if (typeof value["sessionId"] !== "string" || !isAgentSessionState(value["state"])) {
    throw new Error("Open session response is missing required fields.");
  }
  return { sessionId: value["sessionId"], state: value["state"] };
}

export function parseErrorPayload(value: unknown): string | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  return typeof value["error"] === "string" ? value["error"] : undefined;
}

export function parseSessionEvent(value: unknown): SessionEvent | undefined {
  if (!isObject(value) || typeof value["type"] !== "string" || typeof value["sessionId"] !== "string") {
    return undefined;
  }

  const type = value["type"];
  const sessionId = value["sessionId"];
  const turnId = value["turnId"];

  switch (type) {
    case "session.snapshot":
      return isAgentSessionState(value["state"]) ? { type: "session.snapshot", sessionId, state: value["state"] } : undefined;
    case "turn.started":
      return typeof turnId === "number" ? { type: "turn.started", sessionId, turnId } : undefined;
    case "turn.cancelled":
      return typeof turnId === "number" ? { type: "turn.cancelled", sessionId, turnId } : undefined;
    case "turn.completed":
      return typeof turnId === "number" ? { type: "turn.completed", sessionId, turnId } : undefined;
    case "turn.failed":
      return typeof turnId === "number" && typeof value["error"] === "string"
        ? { type: "turn.failed", sessionId, turnId, error: value["error"] }
        : undefined;
    case "agent.log":
      return typeof value["event"] === "string" ? { type: "agent.log", sessionId, event: value["event"], payload: value["payload"] } : undefined;
    default:
      return undefined;
  }
}
