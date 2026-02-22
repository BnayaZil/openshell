export type GogProxyConfig = {
  host: string;
  port: number;
  webhookPath: string;
  healthPath: string;
  agentServerUrl: string;
  subscribeEnabled: boolean;
  skillTemplate: string;
  dedupeWindowMs: number;
};

function parseBoolean(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (!rawValue) {
    return defaultValue;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${rawValue}`);
}

function parseInteger(rawValue: string | undefined, defaultValue: number, envName: string): number {
  if (!rawValue) {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${envName}: ${rawValue}. Must be a positive integer.`);
  }
  return parsed;
}

export function readGogProxyConfig(env: NodeJS.ProcessEnv = process.env): GogProxyConfig {
  const subscribeEnabled = parseBoolean(env["GOG_PROXY_SUBSCRIBE_ENABLED"], false);
  const skillTemplate = env["GOG_PROXY_SKILL_TEMPLATE"]?.trim() ?? "";
  const agentServerUrl = env["AGENT_SERVER_URL"]?.trim() ?? "";

  if (subscribeEnabled && skillTemplate.length === 0) {
    throw new Error("GOG_PROXY_SUBSCRIBE_ENABLED=true requires GOG_PROXY_SKILL_TEMPLATE.");
  }
  if (subscribeEnabled && agentServerUrl.length === 0) {
    throw new Error("GOG_PROXY_SUBSCRIBE_ENABLED=true requires AGENT_SERVER_URL.");
  }

  return {
    host: env["GOG_PROXY_HOST"]?.trim() || "127.0.0.1",
    port: parseInteger(env["GOG_PROXY_PORT"], 8791, "GOG_PROXY_PORT"),
    webhookPath: env["GOG_PROXY_WEBHOOK_PATH"]?.trim() || "/webhooks/gmail",
    healthPath: env["GOG_PROXY_HEALTH_PATH"]?.trim() || "/health",
    agentServerUrl,
    subscribeEnabled,
    skillTemplate,
    dedupeWindowMs: parseInteger(env["GOG_PROXY_DEDUPE_WINDOW_MS"], 120_000, "GOG_PROXY_DEDUPE_WINDOW_MS"),
  };
}
