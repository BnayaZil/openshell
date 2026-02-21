import { describe, expect, it } from "vitest";
import {
  buildDynamicEnvironmentPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  formatObservationWindow,
} from "../src/llmClient";

describe("llmClient prompt helpers", () => {
  it("formats empty observation windows", () => {
    expect(formatObservationWindow([], 5)).toBe("No observations yet.");
  });

  it("formats non-empty observation windows", () => {
    const output = formatObservationWindow(
      [
        {
          summary: "Command succeeded.",
          exitCode: 0,
          signals: [],
          raw: {
            executions: [{ command: "echo ok", result: { stdout: "ok", stderr: "", exitCode: 0, durationMs: 2, timedOut: false } }],
            aggregateExitCode: 0,
            allSucceeded: true,
            anyTimedOut: false,
            stdout: "ok",
            stderr: "",
            durationMs: 2,
          },
        },
      ],
      5,
    );

    expect(output).toContain('summary="Command succeeded."');
    expect(output).toContain("exitCode=0");
  });

  it("can format full observation windows including command output", () => {
    const output = formatObservationWindow(
      [
        {
          summary: "Command succeeded.",
          exitCode: 0,
          signals: [],
          raw: {
            executions: [{ command: "echo ok", result: { stdout: "ok", stderr: "", exitCode: 0, durationMs: 2, timedOut: false } }],
            aggregateExitCode: 0,
            allSucceeded: true,
            anyTimedOut: false,
            stdout: "ok",
            stderr: "",
            durationMs: 2,
          },
        },
      ],
      5,
      "full",
    );

    expect(output).toContain("executions:");
    expect(output).toContain("cmd_1: echo ok");
    expect(output).toContain('stdout="ok"');
  });

  it("builds a deterministic prompt shape", () => {
    const prompt = buildUserPrompt(
      {
        objective: "Run tests",
        step: 2,
        maxSteps: 10,
        observations: [],
      },
      5,
    );

    expect(prompt).toContain("Objective: Run tests");
    expect(prompt).toContain("CurrentStep: 2");
    expect(prompt).toContain("ObservationMode: summary");
    expect(prompt).not.toContain("Rules:");
  });

  it("builds prompt with full observation mode", () => {
    const prompt = buildUserPrompt(
      {
        objective: "Inspect output",
        step: 1,
        maxSteps: 5,
        observations: [
          {
            summary: "Saw output",
            exitCode: 0,
            signals: [],
            raw: {
              executions: [{ command: "echo ok", result: { stdout: "ok", stderr: "", exitCode: 0, durationMs: 2, timedOut: false } }],
              aggregateExitCode: 0,
              allSucceeded: true,
              anyTimedOut: false,
              stdout: "ok",
              stderr: "",
              durationMs: 2,
            },
          },
        ],
      },
      5,
      "full",
    );

    expect(prompt).toContain("ObservationMode: full");
    expect(prompt).toContain("cmd_1: echo ok");
  });

  it("builds a dynamic environment prompt block", () => {
    const prompt = buildDynamicEnvironmentPrompt({
      model: "gpt-4.1-mini",
      cwd: process.cwd(),
      platform: "darwin",
      shell: "/bin/zsh",
      now: new Date("2026-02-20T00:00:00Z"),
    });

    expect(prompt).toContain("You are powered by the model named gpt-4.1-mini.");
    expect(prompt).toContain("<env>");
    expect(prompt).toContain(`Working directory: ${process.cwd()}`);
    expect(prompt).toContain("Platform: darwin");
    expect(prompt).toContain("Shell: /bin/zsh");
    expect(prompt).toContain("Today's date:");
  });

  it("appends environment data to base system prompt", () => {
    const system = buildSystemPrompt("base rules", {
      model: "gpt-4.1-mini",
      cwd: process.cwd(),
      now: new Date("2026-02-20T00:00:00Z"),
    });

    expect(system).toContain("base rules");
    expect(system).toContain("<env>");
    expect(system).toContain("You are powered by the model named gpt-4.1-mini.");
  });
});
