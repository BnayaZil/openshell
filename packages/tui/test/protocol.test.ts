import { describe, expect, it } from "vitest";
import { createInitialSessionState } from "@openshell/agent/session";
import {
  isAgentSessionState,
  parseErrorMessage,
  parseErrorPayload,
  parseOpenSessionResult,
  parseSessionEvent,
} from "../src/protocol";

describe("protocol", () => {
  it("validates agent session state payload shape", () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    expect(isAgentSessionState(state)).toBe(true);
    expect(isAgentSessionState({ ...state, maxMessages: "80" })).toBe(false);
  });

  it("parses open session response and rejects malformed payload", () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    const result = parseOpenSessionResult({ sessionId: "default", state });
    expect(result.sessionId).toBe("default");
    expect(result.state.cwd).toBe("/tmp");

    expect(() => parseOpenSessionResult({ sessionId: "default", state: {} })).toThrow(
      "Open session response is missing required fields.",
    );
  });

  it("extracts string error payload when present", () => {
    expect(parseErrorPayload({ error: "boom" })).toBe("boom");
    expect(parseErrorPayload({ error: 42 })).toBeUndefined();
    expect(parseErrorPayload(null)).toBeUndefined();
  });

  it("parses known session events and ignores unknown shapes", () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    const snapshot = parseSessionEvent({ type: "session.snapshot", sessionId: "s1", state });
    expect(snapshot?.type).toBe("session.snapshot");

    const failed = parseSessionEvent({ type: "turn.failed", sessionId: "s1", turnId: 2, error: "x" });
    expect(failed).toEqual({ type: "turn.failed", sessionId: "s1", turnId: 2, error: "x" });

    expect(parseSessionEvent({ type: "turn.failed", sessionId: "s1", turnId: 2 })).toBeUndefined();
    expect(parseSessionEvent({ type: "unknown", sessionId: "s1" })).toBeUndefined();
  });

  it("formats unknown errors safely", () => {
    expect(parseErrorMessage(new Error("fail"))).toBe("fail");
    expect(parseErrorMessage("text failure")).toBe("text failure");
  });
});
