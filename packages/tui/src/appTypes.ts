import type { GogIntegrationStatus } from "@openshell/agent/shared";

export type AgentTuiAppProps = {
  initialObjective: string;
  autoStart: boolean;
  cwd: string;
  model: string;
  observationMode: "summary" | "full";
  apiKey: string | undefined;
  baseURL: string | undefined;
  serverUrl: string | undefined;
  gogStatus?: GogIntegrationStatus;
};
