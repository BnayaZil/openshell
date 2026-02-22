import { describe, expect, it } from "vitest";
import {
  applyTurnError,
  applyTurnResult,
  beginTurn,
  createInitialSessionState,
  hydrateFromSession,
  reduceAgentLogEvent,
  toPersistedSession,
} from "../src/session";

describe("session core", () => {
  it("starts a turn and builds objective", () => {
    const state = createInitialSessionState({
      cwd: process.cwd(),
      model: "test-model",
    });

    const started = beginTurn(state, "hello world");

    expect(started.state.isRunning).toBe(true);
    expect(started.state.turns).toHaveLength(1);
    expect(started.objective).toContain("Latest user request:");
    expect(started.objective).toContain("hello world");
  });

  it("captures command execution logs into active turn", () => {
    const state = createInitialSessionState({
      cwd: process.cwd(),
      model: "test-model",
    });
    const started = beginTurn(state, "run command");

    const reduced = reduceAgentLogEvent(started.state, {
      event: "agent.step.exec.result",
      payload: {
        step: 1,
        command: "echo hi",
        commandResult: {
          exitCode: 0,
          timedOut: false,
          stdout: "hi\n",
          stderr: "",
        },
      },
    });

    expect(reduced.turns[0]!.commands).toHaveLength(1);
    expect(reduced.turns[0]!.commands[0]!.command).toBe("echo hi");
    expect(reduced.turns[0]!.commands[0]!.exitCode).toBe(0);
  });

  it("finalizes successful turn and appends assistant message", () => {
    const state = createInitialSessionState({
      cwd: process.cwd(),
      model: "test-model",
    });
    const started = beginTurn(state, "say hi");

    const next = applyTurnResult(started.state, started.turnId, {
      status: "finished",
      result: "Objective: x\nResponse: hello there\nWork summary: y",
      steps: [],
      observations: [],
    });

    expect(next.isRunning).toBe(false);
    expect(next.turns[0]!.status).toBe("finished");
    expect(next.messages[next.messages.length - 1]!.role).toBe("assistant");
    expect(next.messages[next.messages.length - 1]!.content).toBe("hello there");
  });

  it("keeps multi-line response block in assistant message", () => {
    const state = createInitialSessionState({
      cwd: process.cwd(),
      model: "test-model",
    });
    const started = beginTurn(state, "show full response");

    const next = applyTurnResult(started.state, started.turnId, {
      status: "finished",
      result:
        "Objective: x\nResponse: line one\n\nline two\nline three\nWork summary: y\nKey outputs:\n- out",
      steps: [],
      observations: [],
    });

    expect(next.messages[next.messages.length - 1]!.content).toBe("line one\n\nline two\nline three");
  });

  it("marks cancelled turn status from agent result", () => {
    const state = createInitialSessionState({
      cwd: process.cwd(),
      model: "test-model",
    });
    const started = beginTurn(state, "cancel me");

    const next = applyTurnResult(started.state, started.turnId, {
      status: "cancelled",
      result: "Objective: x\nResponse: Cancelled by user.\nWork summary: y",
      steps: [],
      observations: [],
    });

    expect(next.turns[0]!.status).toBe("cancelled");
    expect(next.messages[next.messages.length - 1]!.content).toBe("Cancelled by user.");
  });

  it("marks running turns as interrupted when persisting/hydrating", () => {
    const state = createInitialSessionState({
      cwd: process.cwd(),
      model: "test-model",
    });
    const started = beginTurn(state, "long run");

    const persisted = toPersistedSession(started.state);
    expect(persisted.turns[0]!.status).toBe("error");
    expect(persisted.turns[0]!.resultText).toContain("Interrupted");

    const hydrated = hydrateFromSession(
      createInitialSessionState({
        cwd: process.cwd(),
        model: "test-model",
      }),
      persisted,
    );
    expect(hydrated.turns[0]!.status).toBe("error");
    expect(hydrated.isRunning).toBe(false);
    expect(hydrated.activeTurnId).toBeUndefined();
  });

  it("finalizes failed turn with fallback assistant message", () => {
    const state = createInitialSessionState({
      cwd: process.cwd(),
      model: "test-model",
    });
    const started = beginTurn(state, "break it");

    const next = applyTurnError(started.state, started.turnId, new Error("boom"));

    expect(next.isRunning).toBe(false);
    expect(next.turns[0]!.status).toBe("error");
    expect(next.messages[next.messages.length - 1]!.content).toContain("Run failed: boom");
  });
});
