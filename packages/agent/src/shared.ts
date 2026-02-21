export type ObservationMode = "summary" | "full";

export function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function readObservationMode(
  env: NodeJS.ProcessEnv = process.env,
  defaultMode: ObservationMode = "full",
): ObservationMode {
  const raw = env["OPENCODE_ZEN_OBSERVATION_MODE"]?.trim().toLowerCase();
  if (!raw || raw.length === 0) {
    return defaultMode;
  }
  if (raw === "summary" || raw === "full") {
    return raw;
  }
  throw new Error(`Invalid OPENCODE_ZEN_OBSERVATION_MODE: ${raw}. Use "summary" or "full".`);
}
