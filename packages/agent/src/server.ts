import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createZenThink } from "./llmClient.js";
import { runAgent } from "./loop.js";
import { isObject, parseErrorMessage, readEnv, readGogIntegrationStatus, readObservationMode } from "./shared.js";
import {
  appendSystemMessage,
  applyTurnError,
  applyTurnResult,
  beginTurn,
  createInitialSessionState,
  hydrateFromSession,
  reduceAgentLogEvent,
  toPersistedSession,
  type AgentSessionState,
} from "./session.js";
import { loadSessionFile, saveSessionFile } from "./sessionStore.js";

type SessionEvent =
  | { type: "session.snapshot"; sessionId: string; state: AgentSessionState }
  | { type: "agent.log"; sessionId: string; event: string; payload: unknown }
  | { type: "turn.started"; sessionId: string; turnId: number }
  | { type: "turn.cancelled"; sessionId: string; turnId: number }
  | { type: "turn.completed"; sessionId: string; turnId: number }
  | { type: "turn.failed"; sessionId: string; turnId: number; error: string };

type SessionRecord = {
  id: string;
  state: AgentSessionState;
  subscribers: Set<(event: SessionEvent) => void>;
  activeRun: {
    turnId: number;
    controller: AbortController;
  } | undefined;
};

export type AgentServerOptions = {
  cwd: string;
  model: string;
  apiKey: string;
  baseURL: string;
  observationMode: "summary" | "full";
  port?: number;
  host?: string;
};

export type RunningAgentServer = {
  url: string;
  close: () => Promise<void>;
};

const SSE_HEARTBEAT_MS = 15_000;
const DEFAULT_SERVER_PORT = 8787;

function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        const text = Buffer.concat(chunks).toString("utf8").trim();
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function parsePath(urlValue: string): string[] {
  return (urlValue.split("?")[0] ?? "").split("/").filter(Boolean);
}

function readOptionalStringField(body: unknown, field: string): string | undefined {
  if (!isObject(body)) {
    return undefined;
  }
  const value = body[field];
  return typeof value === "string" ? value : undefined;
}

function sseWrite(res: ServerResponse, event: SessionEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function isRoute(parts: string[], expected: readonly string[]): boolean {
  if (parts.length !== expected.length) {
    return false;
  }
  return expected.every((part, index) => part === "*" || parts[index] === part);
}

export async function startAgentServer(options: AgentServerOptions): Promise<RunningAgentServer> {
  const sessions = new Map<string, SessionRecord>();

  const getOrCreateSession = async (sessionId = "default"): Promise<SessionRecord> => {
    const existing = sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const base = createInitialSessionState({
      cwd: options.cwd,
      model: options.model,
    });
    const loaded = await loadSessionFile(options.cwd, sessionId);
    const hydrated = loaded.session ? hydrateFromSession(base, loaded.session) : base;
    const state = loaded.warning ? appendSystemMessage(hydrated, loaded.warning) : hydrated;
    const record: SessionRecord = {
      id: sessionId,
      state,
      subscribers: new Set(),
      activeRun: undefined,
    };
    sessions.set(sessionId, record);
    return record;
  };

  const emitSessionSnapshot = (record: SessionRecord): void => {
    const event: SessionEvent = {
      type: "session.snapshot",
      sessionId: record.id,
      state: record.state,
    };
    for (const subscriber of record.subscribers) {
      subscriber(event);
    }
  };

  const emitEvent = (record: SessionRecord, event: SessionEvent): void => {
    for (const subscriber of record.subscribers) {
      subscriber(event);
    }
  };

  const runTurn = (record: SessionRecord, turnId: number, objective: string): void => {
    const controller = new AbortController();
    record.activeRun = { turnId, controller };
    const logger = (event: string, payload: unknown): void => {
      record.state = reduceAgentLogEvent(record.state, { event, payload });
      emitEvent(record, { type: "agent.log", sessionId: record.id, event, payload });
      emitSessionSnapshot(record);
    };

    void (async () => {
      try {
        const think = createZenThink({
          apiKey: options.apiKey,
          baseURL: options.baseURL,
          model: options.model,
          cwd: options.cwd,
          observationMode: options.observationMode,
          gogStatus: readGogIntegrationStatus(),
          logger,
        });
        const result = await runAgent({
          objective,
          cwd: options.cwd,
          think,
          logger,
          signal: controller.signal,
        });
        record.state = applyTurnResult(record.state, turnId, result);
        emitEvent(record, {
          type: result.status === "cancelled" ? "turn.cancelled" : "turn.completed",
          sessionId: record.id,
          turnId,
        });
      } catch (error) {
        const wrappedError = error instanceof Error ? error : new Error(String(error));
        record.state = applyTurnError(record.state, turnId, wrappedError);
        emitEvent(record, {
          type: "turn.failed",
          sessionId: record.id,
          turnId,
          error: wrappedError.message,
        });
      } finally {
        record.activeRun = undefined;
        emitSessionSnapshot(record);
        await saveSessionFile(options.cwd, toPersistedSession(record.state), record.id);
      }
    })();
  };

  const handleCreateSession = async (req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> => {
    if (req.method !== "POST" || !isRoute(parts, ["sessions"])) {
      return false;
    }

    const body = await parseJsonBody(req);
    const requestedSessionId = readOptionalStringField(body, "sessionId");
    const sessionId = (requestedSessionId?.trim() || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    const record = await getOrCreateSession(sessionId);
    sendJson(res, 200, { sessionId: record.id, state: record.state });
    return true;
  };

  const handleGetSession = async (req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> => {
    if (req.method !== "GET" || !isRoute(parts, ["sessions", "*"])) {
      return false;
    }

    const sessionId = parts[1];
    if (!sessionId) {
      sendJson(res, 404, { error: "Not found" });
      return true;
    }
    const record = await getOrCreateSession(sessionId);
    sendJson(res, 200, { sessionId: record.id, state: record.state });
    return true;
  };

  const handleSessionEvents = async (req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> => {
    if (req.method !== "GET" || !isRoute(parts, ["sessions", "*", "events"])) {
      return false;
    }

    const sessionId = parts[1];
    if (!sessionId) {
      sendJson(res, 404, { error: "Not found" });
      return true;
    }

    const record = await getOrCreateSession(sessionId);
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    sseWrite(res, { type: "session.snapshot", sessionId: record.id, state: record.state });

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, SSE_HEARTBEAT_MS);

    const subscriber = (event: SessionEvent) => {
      sseWrite(res, event);
    };
    record.subscribers.add(subscriber);

    req.on("close", () => {
      clearInterval(heartbeat);
      record.subscribers.delete(subscriber);
      res.end();
    });
    return true;
  };

  const handlePostMessage = async (req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> => {
    if (req.method !== "POST" || !isRoute(parts, ["sessions", "*", "messages"])) {
      return false;
    }

    const sessionId = parts[1];
    if (!sessionId) {
      sendJson(res, 404, { error: "Not found" });
      return true;
    }
    const record = await getOrCreateSession(sessionId);
    if (record.state.isRunning) {
      sendJson(res, 409, { error: "Session is already running." });
      return true;
    }

    const body = await parseJsonBody(req);
    const content = readOptionalStringField(body, "content")?.trim() ?? "";
    if (!content) {
      sendJson(res, 400, { error: "Message content is required." });
      return true;
    }

    const startedTurn = beginTurn(record.state, content);
    record.state = startedTurn.state;
    emitEvent(record, { type: "turn.started", sessionId: record.id, turnId: startedTurn.turnId });
    emitSessionSnapshot(record);
    runTurn(record, startedTurn.turnId, startedTurn.objective);
    sendJson(res, 202, { sessionId: record.id, turnId: startedTurn.turnId, state: record.state });
    return true;
  };

  const handleControlAction = async (req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> => {
    if (req.method !== "POST" || !isRoute(parts, ["sessions", "*", "control"])) {
      return false;
    }

    const sessionId = parts[1];
    if (!sessionId) {
      sendJson(res, 404, { error: "Not found" });
      return true;
    }
    const record = await getOrCreateSession(sessionId);
    const body = await parseJsonBody(req);

    if (readOptionalStringField(body, "action") !== "cancel") {
      sendJson(res, 400, { error: "Supported actions: cancel" });
      return true;
    }
    if (!record.activeRun) {
      sendJson(res, 409, { error: "No running turn to cancel." });
      return true;
    }

    record.activeRun.controller.abort();
    sendJson(res, 202, { ok: true, turnId: record.activeRun.turnId });
    return true;
  };

  const server = createServer(async (req, res) => {
    try {
      const pathSegments = parsePath(req.url ?? "/");
      if (await handleCreateSession(req, res, pathSegments)) return;
      if (await handleGetSession(req, res, pathSegments)) return;
      if (await handleSessionEvents(req, res, pathSegments)) return;
      if (await handlePostMessage(req, res, pathSegments)) return;
      if (await handleControlAction(req, res, pathSegments)) return;

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 500, { error: parseErrorMessage(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine server address.");
  }
  const url = `http://${address.address}:${address.port}`;

  return {
    url,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function main(): Promise<void> {
  const running = await startAgentServer({
    cwd: process.cwd(),
    model: process.env["OPENCODE_ZEN_MODEL"] ?? "gpt-4.1-mini",
    apiKey: readEnv("OPENCODE_ZEN_API_KEY"),
    baseURL: readEnv("OPENCODE_ZEN_BASE_URL"),
    observationMode: readObservationMode(),
    port: process.env["AGENT_SERVER_PORT"] ? Number(process.env["AGENT_SERVER_PORT"]) : DEFAULT_SERVER_PORT,
    host: "127.0.0.1",
  });
  process.stdout.write(`Agent server listening at ${running.url}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("/server.js")) {
  void main();
}
