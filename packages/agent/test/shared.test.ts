import { describe, expect, it } from "vitest";
import { readGogIntegrationStatus } from "../src/shared";

describe("shared", () => {
  it("reads gog integration defaults", () => {
    const status = readGogIntegrationStatus({});
    expect(status.integrationStatus).toBe("unknown");
    expect(status.pullModeEnabled).toBe(true);
    expect(status.subscribeModeEnabled).toBe(false);
    expect(status.proxyUrl).toBeUndefined();
    expect(status.skillConfigured).toBe(false);
  });

  it("reads gog integration env flags", () => {
    const status = readGogIntegrationStatus({
      GOG_INTEGRATION_STATUS: "ready",
      GOG_PULL_MODE_ENABLED: "false",
      GOG_PROXY_SUBSCRIBE_ENABLED: "true",
      GOG_PROXY_URL: "http://127.0.0.1:8791",
      GOG_PROXY_SKILL_TEMPLATE: "Handle thread {{threadId}}",
    });
    expect(status.integrationStatus).toBe("ready");
    expect(status.pullModeEnabled).toBe(false);
    expect(status.subscribeModeEnabled).toBe(true);
    expect(status.proxyUrl).toBe("http://127.0.0.1:8791");
    expect(status.skillConfigured).toBe(true);
  });
});
