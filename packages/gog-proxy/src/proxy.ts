import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { GogProxyConfig } from "./config.js";
import { normalizeIncomingGogEvent, renderObjectiveFromTemplate } from "./events.js";
import { publishObjectiveToAgent } from "./agentApi.js";

export type RunningGogProxyServer = {
  url: string;
  close: () => Promise<void>;
};

class DedupeWindow {
  private readonly seenAt = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  public hasRecent(key: string): boolean {
    const now = Date.now();
    this.prune(now);
    const existing = this.seenAt.get(key);
    return typeof existing === "number" && now - existing < this.windowMs;
  }

  public remember(key: string): void {
    this.seenAt.set(key, Date.now());
  }

  private prune(now: number): void {
    for (const [key, timestamp] of this.seenAt.entries()) {
      if (now - timestamp >= this.windowMs) {
        this.seenAt.delete(key);
      }
    }
  }
}

function parsePath(urlValue: string): string {
  return (urlValue.split("?")[0] ?? "").trim();
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

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
        resolve(text.length > 0 ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export async function startGogProxyServer(config: GogProxyConfig): Promise<RunningGogProxyServer> {
  const dedupe = new DedupeWindow(config.dedupeWindowMs);

  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const path = parsePath(req.url ?? "/");

      if (method === "GET" && path === config.healthPath) {
        sendJson(res, 200, {
          ok: true,
          subscribeEnabled: config.subscribeEnabled,
          webhookPath: config.webhookPath,
        });
        return;
      }

      if (method === "POST" && path === config.webhookPath) {
        if (!config.subscribeEnabled) {
          sendJson(res, 503, { error: "Subscribe mode is disabled." });
          return;
        }
        const payload = await parseJsonBody(req);
        const event = normalizeIncomingGogEvent(payload, req.headers);
        const dedupeKey = `${event.threadId}:${event.eventKey}`;
        if (dedupe.hasRecent(dedupeKey)) {
          sendJson(res, 202, { ok: true, deduped: true, sessionId: event.threadId });
          return;
        }
        dedupe.remember(dedupeKey);
        const objective = renderObjectiveFromTemplate(config.skillTemplate, {
          threadId: event.threadId,
          payload: event.rawPayload,
        });
        await publishObjectiveToAgent({
          agentServerUrl: config.agentServerUrl,
          sessionId: event.threadId,
          objective,
        });
        sendJson(res, 202, { ok: true, deduped: false, sessionId: event.threadId });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine proxy server address.");
  }

  return {
    url: `http://${address.address}:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
