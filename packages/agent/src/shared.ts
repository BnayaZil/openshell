export type ObservationMode = "summary" | "full";
export type GogIntegrationStatus = {
  integrationStatus: string;
  pullModeEnabled: boolean;
  subscribeModeEnabled: boolean;
  proxyUrl: string | undefined;
  skillConfigured: boolean;
};

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

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value || value.trim().length === 0) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
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

export function readGogIntegrationStatus(env: NodeJS.ProcessEnv = process.env): GogIntegrationStatus {
  const integrationStatus = env["GOG_INTEGRATION_STATUS"]?.trim() || "unknown";
  const subscribeModeEnabled = readBoolean(env["GOG_PROXY_SUBSCRIBE_ENABLED"] ?? env["GOG_SUBSCRIBE_MODE_ENABLED"], false);
  const proxyUrl = env["GOG_PROXY_URL"]?.trim() || undefined;
  const skillConfigured = Boolean(
    env["GOG_PROXY_SKILL_TEMPLATE"]?.trim() ||
      env["GOG_SUBSCRIBE_SKILL_TEMPLATE"]?.trim() ||
      env["GOG_SUBSCRIBE_SKILL_PATH"]?.trim(),
  );

  return {
    integrationStatus,
    pullModeEnabled: readBoolean(env["GOG_PULL_MODE_ENABLED"], true),
    subscribeModeEnabled,
    proxyUrl,
    skillConfigured,
  };
}
