import { useCallback } from "react";
import { useInput } from "ink";

type UseAgentHotkeysInput = {
  exit: () => void;
  toggleTechnicalOutput: () => void;
  cancelActiveTurn: () => Promise<void>;
  startNewSession: () => Promise<void>;
  onError: (prefix: string, error: unknown) => void;
};

export function useAgentHotkeys(input: UseAgentHotkeysInput): void {
  const { cancelActiveTurn, exit, onError, startNewSession, toggleTechnicalOutput } = input;

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
      }
    },
    [cancelActiveTurn, exit, onError, startNewSession, toggleTechnicalOutput],
  );

  useInput(handleInput);
}
