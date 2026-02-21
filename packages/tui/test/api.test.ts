import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialSessionState } from "@openshell/agent/session";
import { cancelTurn, openSession, submitPrompt } from "../src/api";

describe("api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a session from valid response JSON", async () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "default", state }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await openSession("http://localhost:3001", "default");
    expect(result.sessionId).toBe("default");
    expect(result.state.cwd).toBe("/tmp");
  });

  it("fails opening session when API is non-ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    await expect(openSession("http://localhost:3001", "default")).rejects.toThrow("Failed opening session (500).");
  });

  it("submits prompt and surfaces server payload error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response('{"error":"bad prompt"}', { status: 400 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await expect(submitPrompt("http://localhost:3001", "default", "hello")).rejects.toThrow("bad prompt");
    await expect(submitPrompt("http://localhost:3001", "default", "  ")).resolves.toBe(false);
    await expect(submitPrompt("http://localhost:3001", "default", "go")).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("cancels turn and reports API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"error":"cannot cancel"}', { status: 409 }));
    await expect(cancelTurn("http://localhost:3001", "default")).rejects.toThrow("cannot cancel");
  });
});
