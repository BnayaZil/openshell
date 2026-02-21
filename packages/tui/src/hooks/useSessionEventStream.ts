import { useEffect } from "react";
import type React from "react";
import { appendSystemMessage, type AgentSessionState } from "@openshell/agent/session";
import { streamSessionEvents } from "../eventStream.js";
import type { SessionEvent } from "../protocol.js";

type UseSessionEventStreamInput = {
  serverUrl: string | undefined;
  sessionId: string;
  sessionLoaded: boolean;
  setState: React.Dispatch<React.SetStateAction<AgentSessionState>>;
  streamAbortRef: React.MutableRefObject<AbortController | undefined>;
  onError: (prefix: string, error: unknown) => void;
};

function applyStreamEvent(event: SessionEvent, setState: React.Dispatch<React.SetStateAction<AgentSessionState>>): void {
  if (event.type === "session.snapshot") {
    setState(event.state);
    return;
  }

  if (event.type === "turn.cancelled") {
    setState((current) => appendSystemMessage(current, `Turn ${event.turnId} cancelled.`));
  }
}

export function useSessionEventStream(input: UseSessionEventStreamInput): void {
  const { onError, serverUrl, sessionId, sessionLoaded, setState, streamAbortRef } = input;

  // Must remain a useEffect: event streaming is an external subscription that must
  // attach/detach based on server/session identity with AbortController cleanup.
  useEffect(() => {
    const currentServerUrl = serverUrl;
    if (!currentServerUrl || !sessionLoaded) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    streamAbortRef.current?.abort();
    streamAbortRef.current = controller;

    const connect = async (): Promise<void> => {
      await streamSessionEvents({
        baseUrl: currentServerUrl,
        sessionId,
        signal: controller.signal,
        onEvent: (event) => {
          if (!cancelled) {
            applyStreamEvent(event, setState);
          }
        },
      });
    };

    void connect().catch((error) => {
      if (!cancelled) {
        onError("Event stream error: ", error);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [onError, serverUrl, sessionId, sessionLoaded, setState, streamAbortRef]);
}
