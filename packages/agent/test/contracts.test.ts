import { describe, expect, it } from "vitest";
import {
  assertCommandRequest,
  assertCommandResult,
  assertModelDecision,
  assertObservation,
} from "../src/contracts";

describe("contracts", () => {
  it("accepts valid action and finish decisions", () => {
    expect(assertModelDecision({ type: "action", commands: ["pwd"] })).toEqual({
      type: "action",
      commands: ["pwd"],
    });
    // Backwards compatible parsing for old single-command format.
    expect(assertModelDecision({ type: "action", command: "pwd" })).toEqual({
      type: "action",
      commands: ["pwd"],
    });
    expect(assertModelDecision({ type: "finish", result: "done" })).toEqual({
      type: "finish",
      result: "done",
    });
  });

  it("rejects malformed model decisions", () => {
    expect(() => assertModelDecision({ type: "action", commands: [] })).toThrow();
    expect(() => assertModelDecision({ type: "something-else" })).toThrow();
  });

  it("validates command request/result and observation", () => {
    const request = assertCommandRequest({
      command: "ls",
      cwd: "/tmp",
      timeoutMs: 1000,
    });

    const result = assertCommandResult({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      durationMs: 12,
      timedOut: false,
    });

    const observation = assertObservation({
      summary: "all good",
      exitCode: 0,
      signals: [],
      raw: {
        executions: [{ command: "ls", result }],
        aggregateExitCode: 0,
        allSucceeded: true,
        anyTimedOut: false,
        stdout: "ok",
        stderr: "",
        durationMs: 12,
      },
    });

    expect(request.command).toBe("ls");
    expect(observation.raw.executions[0]!.result.stdout).toBe("ok");
  });
});
