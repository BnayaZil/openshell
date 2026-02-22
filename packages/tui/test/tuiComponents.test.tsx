import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { createInitialSessionState } from "@openshell/agent/session";
import { AgentTuiView } from "../src/tuiComponents";

describe("tuiComponents", () => {
  it("renders gog integration status in header", () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    const view = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={false}
        gogStatus={{
          integrationStatus: "ready",
          pullModeEnabled: true,
          subscribeModeEnabled: true,
          proxyUrl: "http://127.0.0.1:8791",
          skillConfigured: true,
        }}
      />,
    );

    expect(view.lastFrame()).toContain("Gog: ready");
    expect(view.lastFrame()).toContain("Gog Proxy:");
    expect(view.lastFrame()).not.toContain("Ctrl+G: gog setup");
  });

  it("shows gog setup shortcut hint when gog is not configured", () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    const view = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={false}
        gogStatus={{
          integrationStatus: "unknown",
          pullModeEnabled: true,
          subscribeModeEnabled: false,
          proxyUrl: undefined,
          skillConfigured: false,
        }}
      />,
    );

    expect(view.lastFrame()).toContain("Ctrl+G: gog setup");
  });
});
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { AgentTuiView } from "../src/tuiComponents";

type TuiState = React.ComponentProps<typeof AgentTuiView>["state"];

function buildState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    cwd: "/tmp/work",
    model: "gpt-4.1-mini",
    maxSteps: 10,
    isRunning: false,
    rollingSummary: "",
    messages: [
      { id: 1, role: "user", content: "prepare weekly report", createdAt: Date.now() - 3000 },
      { id: 2, role: "assistant", content: "Report draft is ready.", createdAt: Date.now() - 1000 },
    ],
    turns: [
      {
        id: 1,
        userMessageId: 1,
        objective: "prepare weekly report",
        status: "finished",
        startedAt: Date.now() - 3000,
        finishedAt: Date.now() - 500,
        commands: [
          {
            id: 1,
            step: 1,
            command: "echo report",
            exitCode: 0,
            timedOut: false,
            stdoutPreview: "report",
            stderrPreview: "",
            stdout: "report",
            stderr: "",
          },
        ],
      },
    ],
    nextMessageId: 3,
    nextTurnId: 2,
    nextCommandId: 2,
    maxMessages: 80,
    maxTurns: 20,
    maxCommandsPerTurn: 80,
    ...overrides,
  };
}

describe("AgentTuiView", () => {
  it("renders compact chat sections", () => {
    const state = buildState();
    const app = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={false}
      />,
    );
    const output = app.lastFrame();

    expect(output).toContain("Chat Session");
    expect(output).toContain("Transcript");
    expect(output).toContain("Commands");
    expect(output).toContain("Input");
    expect(output).toContain("Help");
    expect(output).toContain("prepare weekly report");
    app.unmount();
  });

  it("renders command output details", () => {
    const state = buildState({
      isRunning: true,
      activeTurnId: 1,
    });
    const app = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={false}
      />,
    );
    const output = app.lastFrame();

    expect(output).toContain("$ echo report");
    expect(output).toContain("stdout: report");
    app.unmount();
  });

  it("renders technical command output when enabled", () => {
    const state = buildState({ activeTurnId: 1 });
    const app = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={true}
      />,
    );
    const output = app.lastFrame();

    expect(output).toContain("stdout full: report");
    expect(output).toContain("stderr full: -");
    app.unmount();
  });

  it("prefers active turn over latest turn in commands section", () => {
    const state = buildState({
      activeTurnId: 1,
      turns: [
        buildState().turns[0]!,
        {
          id: 2,
          userMessageId: 2,
          objective: "new objective",
          status: "running",
          startedAt: Date.now() - 100,
          commands: [],
        },
      ],
    });
    const app = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={false}
      />,
    );
    const output = app.lastFrame();

    expect(output).toContain("turn #1 (finished)");
    expect(output).toContain("$ echo report");
    app.unmount();
  });

  it("renders empty state placeholders", () => {
    const state = buildState({
      messages: [],
      turns: [],
      isRunning: false,
      activeTurnId: undefined,
    });
    const app = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={false}
      />,
    );
    const output = app.lastFrame();

    expect(output).toContain("No messages yet. Type a request below.");
    expect(output).toContain("No commands yet.");
    app.unmount();
  });

  it("renders only the last 12 messages and commands", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      role: (index % 2 === 0 ? "user" : "assistant") as const,
      content: `message-${index + 1}`,
      createdAt: Date.now() - (20 - index),
    }));
    const commands = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      step: index + 1,
      command: `echo cmd-${index + 1}`,
      exitCode: 0,
      timedOut: false,
      stdoutPreview: `cmd-${index + 1}`,
      stderrPreview: "",
      stdout: `cmd-${index + 1}`,
      stderr: "",
    }));
    const state = buildState({
      messages,
      turns: [
        {
          id: 1,
          userMessageId: 1,
          objective: "bulk messages and commands",
          status: "finished",
          startedAt: Date.now() - 5000,
          finishedAt: Date.now() - 1000,
          commands,
        },
      ],
      activeTurnId: 1,
    });
    const app = render(
      <AgentTuiView
        state={state}
        inputValue=""
        onInputChange={() => undefined}
        onSubmitInput={() => undefined}
        showTechnical={false}
      />,
    );
    const output = app.lastFrame();

    expect(output).not.toMatch(/\bmessage-1\b/);
    expect(output).toContain("message-20");
    expect(output).not.toContain("$ echo cmd-1 ");
    expect(output).toContain("$ echo cmd-20");
    app.unmount();
  });
});
