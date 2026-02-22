import { afterEach, describe, expect, it, vi } from "vitest";
import { startGogProxyServer } from "../src/proxy";
import type { GogProxyConfig } from "../src/config";

describe("gog-proxy server", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards normalized events to agent endpoints", async () => {
    const config: GogProxyConfig = {
      host: "127.0.0.1",
      port: 0,
      webhookPath: "/webhooks/gmail",
      healthPath: "/health",
      agentServerUrl: "http://agent.local",
      subscribeEnabled: true,
      skillTemplate: "Handle {{threadId}} with {{payload}}",
      dedupeWindowMs: 1_000,
    };

    const nativeFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "http://agent.local/sessions") {
        return new Response(JSON.stringify({ sessionId: "thread-1" }), { status: 200 });
      }
      if (url === "http://agent.local/sessions/thread-1/messages") {
        return new Response("{}", { status: 202 });
      }
      return nativeFetch(input, init);
    });

    const server = await startGogProxyServer(config);
    try {
      const response = await fetch(`${server.url}/webhooks/gmail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: "thread-1", eventId: "evt-1" }),
      });
      const body = await response.json();

      expect(response.status).toBe(202);
      expect(body.sessionId).toBe("thread-1");
      const agentCalls = fetchSpy.mock.calls.map((call) => String(call[0])).filter((url) => url.startsWith("http://agent.local"));
      expect(agentCalls).toEqual(["http://agent.local/sessions", "http://agent.local/sessions/thread-1/messages"]);
    } finally {
      await server.close();
    }
  });

  it("dedupes repeated events in dedupe window", async () => {
    const config: GogProxyConfig = {
      host: "127.0.0.1",
      port: 0,
      webhookPath: "/webhooks/gmail",
      healthPath: "/health",
      agentServerUrl: "http://agent.local",
      subscribeEnabled: true,
      skillTemplate: "Handle {{threadId}}",
      dedupeWindowMs: 10_000,
    };

    const nativeFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "http://agent.local/sessions") {
        return new Response(JSON.stringify({ sessionId: "thread-2" }), { status: 200 });
      }
      if (url === "http://agent.local/sessions/thread-2/messages") {
        return new Response("{}", { status: 202 });
      }
      return nativeFetch(input, init);
    });

    const server = await startGogProxyServer(config);
    try {
      const payload = { threadId: "thread-2", eventId: "evt-dupe" };
      const first = await fetch(`${server.url}/webhooks/gmail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const second = await fetch(`${server.url}/webhooks/gmail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      const agentCalls = fetchSpy.mock.calls.map((call) => String(call[0])).filter((url) => url.startsWith("http://agent.local"));
      expect(agentCalls).toEqual(["http://agent.local/sessions", "http://agent.local/sessions/thread-2/messages"]);
      const secondBody = await second.json();
      expect(secondBody.deduped).toBe(true);
    } finally {
      await server.close();
    }
  });
});
