import "dotenv/config";
import { runAgent } from "./loop.js";
import { createZenThink } from "./llmClient.js";
import { parseErrorMessage, readEnv, readGogIntegrationStatus, readObservationMode } from "./shared.js";

function createLogger(enabled: boolean): (event: string, payload: unknown) => void {
  return (event, payload) => {
    if (!enabled) {
      return;
    }
    process.stdout.write(`[agent-log] ${event} ${JSON.stringify(payload)}\n`);
  };
}

async function main(): Promise<void> {
  const objective = process.env["AGENT_OBJECTIVE"] ?? "make my computer screen kept on, prevent sleeping mode";
  const debugEnabled = process.env["AGENT_DEBUG"] === "1";
  const logger = createLogger(debugEnabled);

  const think = createZenThink({
    apiKey: readEnv("OPENCODE_ZEN_API_KEY"),
    baseURL: readEnv("OPENCODE_ZEN_BASE_URL"),
    model: process.env["OPENCODE_ZEN_MODEL"] ?? "gpt-4.1-mini",
    cwd: process.cwd(),
    observationMode: readObservationMode(process.env, "summary"),
    gogStatus: readGogIntegrationStatus(),
    logger,
  });

  const result = await runAgent({
    objective,
    cwd: process.cwd(),
    think,
    logger,
  });

  const output = {
    status: result.status,
    result: result.result,
    steps: result.steps,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${parseErrorMessage(error)}\n`);
  process.exitCode = 1;
});
