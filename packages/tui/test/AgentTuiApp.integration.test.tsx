import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { createInitialSessionState } from "@openshell/agent/session";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

async function waitForFrameContains(app: ReturnType<typeof render>, text: string): Promise<string> {
  for (let index = 0; index < 20; index += 1) {
    const frame = app.lastFrame();
    if (frame.includes(text)) {
      return frame;
    }
    await flush();
  }
  return app.lastFrame();
}

describe("AgentTuiApp integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads session, streams updates, and auto-starts initial objective", async () => {
    vi.mock("@openshell/agent/server", () => ({
      startAgentServer: vi.fn(),
    }));
    const { AgentTuiApp } = await import("../src/AgentTuiApp");

    const state = createInitialSessionState({ cwd: "/tmp/work", model: "gpt-4.1-mini" });
    const streamedState = {
      ...state,
      messages: [{ id: 1, role: "assistant" as const, content: "stream says hi", createdAt: Date.now() }],
      nextMessageId: 2,
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "session.snapshot", sessionId: "default", state: streamedState })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        return new Response(JSON.stringify({ sessionId: "default", state }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/events")) {
        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      if (url.endsWith("/messages") && init?.method === "POST") {
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const app = render(
      <AgentTuiApp
        initialObjective="auto prompt"
        autoStart={true}
        cwd="/tmp/work"
        model="gpt-4.1-mini"
        observationMode="full"
        apiKey={undefined}
        baseURL={undefined}
        serverUrl="http://localhost:3001"
      />,
    );

    const output = await waitForFrameContains(app, "stream says hi");

    expect(output).toContain("stream says hi");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/sessions/default/messages",
      expect.objectContaining({ method: "POST" }),
    );

    app.unmount();
  });
});
