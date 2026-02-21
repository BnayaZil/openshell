import { describe, expect, it } from "vitest";
import { readEnv, readInitialObjective, readObservationMode } from "../src/config";

describe("config", () => {
  it("prefers argv objective and enables autoStart", () => {
    const objective = readInitialObjective(["node", "tui.js", "ship", "it"], {});
    expect(objective).toEqual({ value: "ship it", autoStart: true });
  });

  it("uses AGENT_OBJECTIVE when argv objective is absent", () => {
    const objective = readInitialObjective(["node", "tui.js"], { AGENT_OBJECTIVE: "from env" });
    expect(objective).toEqual({ value: "from env", autoStart: false });
  });

  it("defaults objective when args and env are empty", () => {
    const objective = readInitialObjective(["node", "tui.js"], {});
    expect(objective.autoStart).toBe(false);
    expect(objective.value.length).toBeGreaterThan(0);
  });

  it("reads valid observation mode values", () => {
    expect(readObservationMode({ OPENCODE_ZEN_OBSERVATION_MODE: "summary" })).toBe("summary");
    expect(readObservationMode({ OPENCODE_ZEN_OBSERVATION_MODE: "FULL" })).toBe("full");
    expect(readObservationMode({})).toBe("full");
  });

  it("throws for invalid observation mode", () => {
    expect(() => readObservationMode({ OPENCODE_ZEN_OBSERVATION_MODE: "bad" })).toThrow(
      'Invalid OPENCODE_ZEN_OBSERVATION_MODE: bad. Use "summary" or "full".',
    );
  });

  it("reads required env values and throws on empty", () => {
    expect(readEnv("TOKEN", { TOKEN: "abc" })).toBe("abc");
    expect(() => readEnv("TOKEN", { TOKEN: "" })).toThrow("Missing required environment variable: TOKEN");
  });
});
