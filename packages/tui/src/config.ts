const DEFAULT_OBJECTIVE = "make my computer screen kept on, prevent sleeping mode";

export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function readInitialObjective(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): { value: string; autoStart: boolean } {
  const fromArgs = argv.slice(2).join(" ").trim();
  if (fromArgs.length > 0) {
    return { value: fromArgs, autoStart: true };
  }

  const fromEnv = env["AGENT_OBJECTIVE"]?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return { value: fromEnv, autoStart: false };
  }

  return { value: DEFAULT_OBJECTIVE, autoStart: false };
}

export function readObservationMode(env: NodeJS.ProcessEnv = process.env): "summary" | "full" {
  const raw = env["OPENCODE_ZEN_OBSERVATION_MODE"]?.trim().toLowerCase();
  if (!raw || raw.length === 0) {
    return "full";
  }
  if (raw === "summary" || raw === "full") {
    return raw;
  }
  throw new Error(`Invalid OPENCODE_ZEN_OBSERVATION_MODE: ${raw}. Use "summary" or "full".`);
}
