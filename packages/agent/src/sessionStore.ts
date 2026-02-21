import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PersistedAgentSession } from "./session.js";
import { isObject } from "./shared.js";

export const DEFAULT_SESSION_FILE_NAME = ".openshell-tui-session.json";
export const SESSIONS_DIRECTORY = "sessions";

export type SessionLoadResult = {
  session?: PersistedAgentSession;
  warning?: string;
};

function isPersistedSession(value: unknown): value is PersistedAgentSession {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value["rollingSummary"] === "string" &&
    Array.isArray(value["messages"]) &&
    Array.isArray(value["turns"]) &&
    typeof value["nextMessageId"] === "number" &&
    typeof value["nextTurnId"] === "number" &&
    typeof value["nextCommandId"] === "number"
  );
}

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return isObject(value) && typeof value["code"] === "string";
}

function resolveSessionFileName(sessionId?: string): string {
  if (!sessionId || sessionId === "default") {
    return DEFAULT_SESSION_FILE_NAME;
  }
  return `.openshell-session-${sessionId}.json`;
}

function sessionPath(cwd: string, sessionId?: string): string {
  return join(cwd, SESSIONS_DIRECTORY, resolveSessionFileName(sessionId));
}

export async function loadSessionFile(cwd: string, sessionId?: string): Promise<SessionLoadResult> {
  const target = sessionPath(cwd, sessionId);
  try {
    const content = await readFile(target, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!isPersistedSession(parsed)) {
      return { warning: "Saved chat history is invalid. Starting a fresh session." };
    }
    return { session: parsed };
  } catch (error) {
    if (isErrnoException(error) && error["code"] === "ENOENT") {
      return {};
    }
    return { warning: "Could not load saved chat history. Starting a fresh session." };
  }
}

export async function saveSessionFile(cwd: string, session: PersistedAgentSession, sessionId?: string): Promise<void> {
  const target = sessionPath(cwd, sessionId);
  await mkdir(join(cwd, SESSIONS_DIRECTORY), { recursive: true });
  await writeFile(target, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}
