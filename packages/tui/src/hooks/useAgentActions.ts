import type React from "react";
import { useCallback } from "react";
import { randomUUID } from "node:crypto";
import { appendSystemMessage, type AgentSessionState } from "@openshell/agent/session";
import { cancelTurn, openSession, submitPrompt } from "../api.js";
import { parseErrorMessage } from "../protocol.js";

type AgentActionRefs = {
  sessionIdRef: React.MutableRefObject<string>;
  serverUrlRef: React.MutableRefObject<string | undefined>;
  stateRef: React.MutableRefObject<AgentSessionState>;
  inputDraftRef: React.MutableRefObject<string>;
};

type UseAgentActionsInput = {
  refs: AgentActionRefs;
  setInputDraft: React.Dispatch<React.SetStateAction<string>>;
  setSessionId: React.Dispatch<React.SetStateAction<string>>;
  setState: React.Dispatch<React.SetStateAction<AgentSessionState>>;
};

export function useAgentActions(input: UseAgentActionsInput): {
  submitCurrentInput: () => void;
  cancelActiveTurn: () => Promise<void>;
  startNewSession: () => Promise<void>;
} {
  const { refs, setInputDraft, setSessionId, setState } = input;

  const reportError = useCallback(
    (prefix: string, error: unknown) => {
      setState((current) => appendSystemMessage(current, `${prefix}${parseErrorMessage(error)}`));
    },
    [setState],
  );

  const submitPromptText = useCallback(
    async (rawContent: string): Promise<boolean> => {
      const currentUrl = refs.serverUrlRef.current;
      const currentSessionId = refs.sessionIdRef.current;
      const currentState = refs.stateRef.current;
      if (!currentUrl || currentState.isRunning) {
        return false;
      }
      return submitPrompt(currentUrl, currentSessionId, rawContent);
    },
    [refs.serverUrlRef, refs.sessionIdRef, refs.stateRef],
  );

  const submitCurrentInput = useCallback(() => {
    void (async () => {
      try {
        const submitted = await submitPromptText(refs.inputDraftRef.current);
        if (submitted) {
          setInputDraft("");
        }
      } catch (error) {
        reportError("", error);
      }
    })();
  }, [refs.inputDraftRef, reportError, setInputDraft, submitPromptText]);

  const cancelActiveTurn = useCallback(async (): Promise<void> => {
    const currentUrl = refs.serverUrlRef.current;
    const currentSessionId = refs.sessionIdRef.current;
    const currentState = refs.stateRef.current;
    if (!currentUrl || !currentState.isRunning) {
      return;
    }
    await cancelTurn(currentUrl, currentSessionId);
  }, [refs.serverUrlRef, refs.sessionIdRef, refs.stateRef]);

  const startNewSession = useCallback(async (): Promise<void> => {
    if (refs.stateRef.current.isRunning || !refs.serverUrlRef.current) {
      return;
    }

    try {
      const nextSessionId = randomUUID();
      const result = await openSession(refs.serverUrlRef.current, nextSessionId);
      setSessionId(result.sessionId);
      setState(result.state);
      setInputDraft("");
    } catch (error) {
      reportError("Failed starting new session: ", error);
    }
  }, [refs.serverUrlRef, refs.stateRef, reportError, setInputDraft, setSessionId, setState]);

  return {
    submitCurrentInput,
    cancelActiveTurn,
    startNewSession,
  };
}
