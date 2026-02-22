import React, { useCallback, useMemo, useRef, useState } from "react";
import { useApp } from "ink";
import type { RunningAgentServer } from "@openshell/agent/server";
import { appendSystemMessage, createInitialSessionState, type AgentSessionState } from "@openshell/agent/session";
import { AgentTuiView } from "./tuiComponents.js";
import type { AgentTuiAppProps } from "./appTypes.js";
import { useAgentActions } from "./hooks/useAgentActions.js";
import { useAgentHotkeys } from "./hooks/useAgentHotkeys.js";
import { useSessionBootstrap } from "./hooks/useSessionBootstrap.js";
import { useSessionEventStream } from "./hooks/useSessionEventStream.js";
import { parseErrorMessage } from "./protocol.js";

const DEFAULT_GOG_STATUS = {
  integrationStatus: "unknown",
  pullModeEnabled: true,
  subscribeModeEnabled: false,
  proxyUrl: undefined,
  skillConfigured: false,
} as const;

export function AgentTuiApp(props: AgentTuiAppProps): React.JSX.Element {
  const { exit } = useApp();
  const [inputDraft, setInputDraft] = useState(props.initialObjective);
  const [showTechnical, setShowTechnical] = useState(false);
  const initialState = useMemo(
    () =>
      createInitialSessionState({
        cwd: props.cwd,
        model: props.model,
      }),
    [props.cwd, props.model],
  );
  const [state, setState] = useState<AgentSessionState>(initialState);
  const [sessionId, setSessionId] = useState("default");
  const [serverUrl, setServerUrl] = useState<string | undefined>(props.serverUrl);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const localServerRef = useRef<RunningAgentServer | undefined>(undefined);
  const streamAbortRef = useRef<AbortController | undefined>(undefined);
  const sessionIdRef = useRef(sessionId);
  const serverUrlRef = useRef(serverUrl);
  const stateRef = useRef(state);
  const inputDraftRef = useRef(inputDraft);

  sessionIdRef.current = sessionId;
  serverUrlRef.current = serverUrl;
  stateRef.current = state;
  inputDraftRef.current = inputDraft;

  const reportError = useCallback((prefix: string, error: unknown): void => {
    setState((current) => appendSystemMessage(current, `${prefix}${parseErrorMessage(error)}`));
  }, []);

  const { submitCurrentInput, cancelActiveTurn, startNewSession, initiateGogSetup } = useAgentActions({
    refs: {
      sessionIdRef,
      serverUrlRef,
      stateRef,
      inputDraftRef,
    },
    setInputDraft,
    setSessionId,
    setState,
  });

  const gogStatus = props.gogStatus ?? DEFAULT_GOG_STATUS;
  const gogNeedsSetup = gogStatus.integrationStatus !== "ready" || !gogStatus.skillConfigured || !gogStatus.proxyUrl;

  const toggleTechnicalOutput = useCallback(() => {
    setShowTechnical((current) => !current);
  }, []);

  useSessionBootstrap({
    props,
    setState,
    setSessionId,
    setServerUrl,
    setSessionLoaded,
    setInputDraft,
    localServerRef,
    onError: reportError,
  });

  useSessionEventStream({
    serverUrl,
    sessionId,
    sessionLoaded,
    setState,
    streamAbortRef,
    onError: reportError,
  });

  useAgentHotkeys({
    exit,
    toggleTechnicalOutput,
    cancelActiveTurn,
    startNewSession,
    initiateGogSetup,
    canInitiateGogSetup: gogNeedsSetup,
    onError: reportError,
  });

  return (
    <AgentTuiView
      state={state}
      inputValue={inputDraft}
      onInputChange={setInputDraft}
      onSubmitInput={submitCurrentInput}
      showTechnical={showTechnical}
      gogStatus={gogStatus}
    />
  );
}
