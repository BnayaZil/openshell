import "dotenv/config";
import React from "react";
import { render } from "ink";
import { createZenThink } from "@openshell/agent/llmClient";
import { runAgent } from "@openshell/agent/loop";
import { readGogIntegrationStatus } from "@openshell/agent/shared";
import { AgentTuiApp } from "./AgentTuiApp.js";
import { readEnv, readInitialObjective, readObservationMode } from "./config.js";
import { parseErrorMessage } from "./protocol.js";

async function main(): Promise<void> {
  try {
    const initialObjective = readInitialObjective();
    const gogStatus = readGogIntegrationStatus();
    if (!process.stdin.isTTY) {
      const think = createZenThink({
        apiKey: readEnv("OPENCODE_ZEN_API_KEY"),
        baseURL: readEnv("OPENCODE_ZEN_BASE_URL"),
        model: process.env["OPENCODE_ZEN_MODEL"] ?? "gpt-4.1-mini",
        cwd: process.cwd(),
        observationMode: readObservationMode(),
        gogStatus,
      });

      const result = await runAgent({
        objective: initialObjective.value,
        cwd: process.cwd(),
        think,
      });

      process.stdout.write(`${result.result}\n`);
      process.exitCode = result.status === "finished" ? 0 : 1;
      return;
    }

    const app = render(
      <AgentTuiApp
        initialObjective={initialObjective.value}
        autoStart={initialObjective.autoStart}
        cwd={process.cwd()}
        model={process.env["OPENCODE_ZEN_MODEL"] ?? "gpt-4.1-mini"}
        observationMode={readObservationMode()}
        apiKey={process.env["AGENT_SERVER_URL"] ? undefined : readEnv("OPENCODE_ZEN_API_KEY")}
        baseURL={process.env["AGENT_SERVER_URL"] ? undefined : readEnv("OPENCODE_ZEN_BASE_URL")}
        serverUrl={process.env["AGENT_SERVER_URL"]}
        gogStatus={gogStatus}
      />,
    );

    await app.waitUntilExit();
  } catch (error) {
    process.stderr.write(`${parseErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

void main();
