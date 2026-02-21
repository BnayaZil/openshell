import { useEffect } from "react";
import type React from "react";
import { startAgentServer, type RunningAgentServer } from "@openshell/agent/server";
import type { AgentSessionState } from "@openshell/agent/session";
import { openSession, submitPrompt } from "../api.js";
import type { AgentTuiAppProps } from "../appTypes.js";

type UseSessionBootstrapInput = {
  props: AgentTuiAppProps;
  setState: React.Dispatch<React.SetStateAction<AgentSessionState>>;
  setSessionId: React.Dispatch<React.SetStateAction<string>>;
  setServerUrl: React.Dispatch<React.SetStateAction<string | undefined>>;
  setSessionLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  setInputDraft: React.Dispatch<React.SetStateAction<string>>;
  localServerRef: React.MutableRefObject<RunningAgentServer | undefined>;
  onError: (prefix: string, error: unknown) => void;
};

export function useSessionBootstrap(input: UseSessionBootstrapInput): void {
  const { props, setInputDraft, setServerUrl, setSessionId, setSessionLoaded, setState, localServerRef, onError } = input;

  // Must remain a useEffect: bootstrap opens sessions/servers that are external side effects
  // tied to mount/config lifecycle, and local server resources require unmount cleanup.
  useEffect(() => {
    let cancelled = false;

    const runAutoStart = async (baseUrl: string, activeSessionId: string): Promise<void> => {
      if (!props.autoStart) {
        return;
      }
      await submitPrompt(baseUrl, activeSessionId, props.initialObjective);
      if (!cancelled) {
        setInputDraft("");
      }
    };

    const load = async (): Promise<void> => {
      if (props.serverUrl) {
        const result = await openSession(props.serverUrl, "default");
        if (cancelled) {
          return;
        }
        setServerUrl(props.serverUrl);
        setSessionId(result.sessionId);
        setState(result.state);
        setSessionLoaded(true);
        await runAutoStart(props.serverUrl, result.sessionId);
        return;
      }

      const apiKey = props.apiKey;
      const baseURL = props.baseURL;
      if (!apiKey || !baseURL) {
        throw new Error("Missing API credentials for local server startup.");
      }
      const localServer = await startAgentServer({
        cwd: props.cwd,
        model: props.model,
        apiKey,
        baseURL,
        observationMode: props.observationMode,
      });
      localServerRef.current = localServer;
      const result = await openSession(localServer.url, "default");
      if (cancelled) {
        return;
      }
      setServerUrl(localServer.url);
      setSessionId(result.sessionId);
      setState(result.state);
      setSessionLoaded(true);
      await runAutoStart(localServer.url, result.sessionId);
    };

    void load().catch((error) => {
      if (!cancelled) {
        onError("Startup failed: ", error);
      }
    });

    return () => {
      cancelled = true;
      if (localServerRef.current) {
        void localServerRef.current.close();
        localServerRef.current = undefined;
      }
    };
  }, [
    localServerRef,
    onError,
    props.apiKey,
    props.autoStart,
    props.baseURL,
    props.cwd,
    props.initialObjective,
    props.model,
    props.observationMode,
    props.serverUrl,
    setInputDraft,
    setServerUrl,
    setSessionId,
    setSessionLoaded,
    setState,
  ]);
}
