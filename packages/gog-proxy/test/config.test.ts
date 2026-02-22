import { describe, expect, it } from "vitest";
import { readGogProxyConfig } from "../src/config";

describe("gog-proxy config", () => {
  it("reads defaults with subscribe disabled", () => {
    const config = readGogProxyConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8791);
    expect(config.subscribeEnabled).toBe(false);
    expect(config.webhookPath).toBe("/webhooks/gmail");
  });

  it("requires skill template and agent server url when subscribe is enabled", () => {
    expect(() =>
      readGogProxyConfig({
        GOG_PROXY_SUBSCRIBE_ENABLED: "true",
      }),
    ).toThrow("GOG_PROXY_SUBSCRIBE_ENABLED=true requires GOG_PROXY_SKILL_TEMPLATE.");

    expect(() =>
      readGogProxyConfig({
        GOG_PROXY_SUBSCRIBE_ENABLED: "true",
        GOG_PROXY_SKILL_TEMPLATE: "Handle {{threadId}}",
      }),
    ).toThrow("GOG_PROXY_SUBSCRIBE_ENABLED=true requires AGENT_SERVER_URL.");
  });
});
