import { useCallback } from "react";
import { useInput } from "ink";

type UseAgentHotkeysInput = {
  exit: () => void;
  toggleTechnicalOutput: () => void;
  cancelActiveTurn: () => Promise<void>;
  startNewSession: () => Promise<void>;
  initiateGogSetup: () => Promise<void>;
  canInitiateGogSetup: boolean;
  onError: (prefix: string, error: unknown) => void;
};

export function useAgentHotkeys(input: UseAgentHotkeysInput): void {
  const { cancelActiveTurn, canInitiateGogSetup, exit, initiateGogSetup, onError, startNewSession, toggleTechnicalOutput } = input;

  const handleInput = useCallback(
    (value: string, key: { ctrl: boolean }) => {
      if (key.ctrl && value === "c") {
        exit();
        return;
      }

      if (key.ctrl && value === "q") {
        exit();
        return;
      }

      if (key.ctrl && value === "t") {
        toggleTechnicalOutput();
        return;
      }

      if (key.ctrl && value === "k") {
        void cancelActiveTurn().catch((error) => onError("Cancel failed: ", error));
        return;
      }

      if (key.ctrl && value === "n") {
        void startNewSession();
        return;
      }

      if (key.ctrl && value === "g" && canInitiateGogSetup) {
        void initiateGogSetup().catch((error) => onError("Gog setup shortcut failed: ", error));
      }
    },
    [cancelActiveTurn, canInitiateGogSetup, exit, initiateGogSetup, onError, startNewSession, toggleTechnicalOutput],
  );

  useInput(handleInput);
}
