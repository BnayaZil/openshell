import React, { createContext, memo, useContext, useMemo } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { AgentSessionState, ChatMessage, ChatTurn, CommandEntry } from "@openshell/agent/session";
import type { GogIntegrationStatus } from "@openshell/agent/shared";

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "user") {
    return "You";
  }
  if (role === "assistant") {
    return "Agent";
  }
  return "System";
}

function roleColor(role: ChatMessage["role"]): "green" | "cyan" | "yellow" {
  if (role === "user") {
    return "green";
  }
  if (role === "assistant") {
    return "cyan";
  }
  return "yellow";
}

function commandColor(entry: CommandEntry): "green" | "yellow" {
  if (entry.exitCode === 0) {
    return "green";
  }
  return "yellow";
}

function compactPreview(value: string): string {
  return value.length > 0 ? value : "-";
}

type ViewInputContextValue = {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmitInput: () => void;
};

const SessionStateContext = createContext<AgentSessionState | undefined>(undefined);
const ViewInputContext = createContext<ViewInputContextValue | undefined>(undefined);
const TechnicalOutputContext = createContext<boolean | undefined>(undefined);
const GogStatusContext = createContext<GogIntegrationStatus | undefined>(undefined);

function useSessionState(): AgentSessionState {
  const value = useContext(SessionStateContext);
  if (!value) {
    throw new Error("SessionStateContext provider is missing.");
  }
  return value;
}

function useViewInput(): ViewInputContextValue {
  const value = useContext(ViewInputContext);
  if (!value) {
    throw new Error("ViewInputContext provider is missing.");
  }
  return value;
}

function useTechnicalOutput(): boolean {
  const value = useContext(TechnicalOutputContext);
  if (value === undefined) {
    throw new Error("TechnicalOutputContext provider is missing.");
  }
  return value;
}

function useGogStatus(): GogIntegrationStatus {
  const value = useContext(GogStatusContext);
  if (!value) {
    throw new Error("GogStatusContext provider is missing.");
  }
  return value;
}

const NO_MESSAGES_PLACEHOLDER = <Text color="gray">No messages yet. Type a request below.</Text>;
const NO_COMMANDS_PLACEHOLDER = <Text color="gray">No commands yet.</Text>;
const WAITING_COMMAND_OUTPUT_PLACEHOLDER = <Text color="gray">Waiting for command output...</Text>;
const INPUT_LOCKED_PLACEHOLDER = (
  <Text color="gray">Assistant is running. Wait for completion to send another prompt.</Text>
);
const BASE_HELP_TEXT =
  "Enter: send prompt | Ctrl+K: cancel run | Ctrl+T: toggle full stdout/stderr | Ctrl+N: new chat | Ctrl+Q: quit";
const VISIBLE_TRANSCRIPT_MESSAGES = 12;
const VISIBLE_TURN_COMMANDS = 12;
const DEFAULT_GOG_STATUS: GogIntegrationStatus = {
  integrationStatus: "unknown",
  pullModeEnabled: true,
  subscribeModeEnabled: false,
  proxyUrl: undefined,
  skillConfigured: false,
};

function gogSetupReady(status: GogIntegrationStatus): boolean {
  return status.integrationStatus === "ready" && status.skillConfigured && Boolean(status.proxyUrl);
}

function gogSetupSummary(status: GogIntegrationStatus): string {
  if (gogSetupReady(status)) {
    return "ready";
  }
  const missing: string[] = [];
  if (status.integrationStatus !== "ready") {
    missing.push("status");
  }
  if (!status.proxyUrl) {
    missing.push("proxy");
  }
  if (!status.skillConfigured) {
    missing.push("skill");
  }
  return `setup required (${missing.join(", ")})`;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={0} marginBottom={1}>
      <Text color="cyan">{title}</Text>
      {children}
    </Box>
  );
}

const HeaderView = memo(function HeaderView({
}: Record<string, never>): React.JSX.Element {
  const state = useSessionState();
  const gogStatus = useGogStatus();
  const lastTurn = state.turns[state.turns.length - 1];
  return (
    <SectionCard title="Chat Session">
      <Text>
        <Text color="cyan">Assistant:</Text> {state.model}
      </Text>
      <Text>
        <Text color="cyan">Turns:</Text> {state.turns.length} <Text color="cyan">Messages:</Text> {state.messages.length}
      </Text>
      <Text>
        <Text color="cyan">Status:</Text> {state.isRunning ? "running" : "ready"}{" "}
        {lastTurn ? `| last turn: ${lastTurn.status}` : ""}
      </Text>
      <Text>
        <Text color="cyan">Gog Setup:</Text> {gogSetupSummary(gogStatus)}
      </Text>
      <Text>
        <Text color="cyan">Gog Runtime:</Text> pull {gogStatus.pullModeEnabled ? "enabled" : "disabled"} | subscribe{" "}
        {gogStatus.subscribeModeEnabled ? "enabled" : "disabled"} | proxy {gogStatus.proxyUrl ?? "not set"}
      </Text>
    </SectionCard>
  );
});

const TranscriptView = memo(function TranscriptView({}: Record<string, never>): React.JSX.Element {
  const state = useSessionState();
  const messages = state.messages;
  const visibleMessages = useMemo(() => messages.slice(-VISIBLE_TRANSCRIPT_MESSAGES), [messages]);
  return (
    <SectionCard title="Transcript">
      {visibleMessages.length === 0 ? (
        NO_MESSAGES_PLACEHOLDER
      ) : (
        <Box flexDirection="column">
          {visibleMessages.map((message) => (
            <Text key={message.id}>
              <Text color={roleColor(message.role)}>{roleLabel(message.role)}:</Text> {message.content}
            </Text>
          ))}
        </Box>
      )}
    </SectionCard>
  );
});

const CommandLogView = memo(function CommandLogView({
}: Record<string, never>): React.JSX.Element {
  const state = useSessionState();
  const showTechnical = useTechnicalOutput();
  const turns = state.turns;
  const activeTurnId = state.activeTurnId;
  const turnById = useMemo(() => {
    const map = new Map<number, ChatTurn>();
    for (const turn of turns) {
      map.set(turn.id, turn);
    }
    return map;
  }, [turns]);
  const activeTurn = (activeTurnId ? turnById.get(activeTurnId) : undefined) ?? turns[turns.length - 1];
  const visibleCommands = useMemo(() => activeTurn?.commands.slice(-VISIBLE_TURN_COMMANDS) ?? [], [activeTurn]);

  return (
    <SectionCard title="Commands">
      {!activeTurn ? (
        NO_COMMANDS_PLACEHOLDER
      ) : (
        <Box flexDirection="column">
          <Text color="gray">
            turn #{activeTurn.id} ({activeTurn.status})
          </Text>
          {visibleCommands.length === 0 ? (
            WAITING_COMMAND_OUTPUT_PLACEHOLDER
          ) : (
            visibleCommands.map((entry) => (
              <Box key={entry.id} flexDirection="column" marginBottom={1}>
                <Text color={commandColor(entry)}>
                  {entry.step ? `step ${entry.step} ` : ""}$ {entry.command}
                  {" -> "}exit {entry.exitCode}
                  {entry.timedOut ? " (timeout)" : ""}
                </Text>
                <Text color="gray">stdout: {compactPreview(entry.stdoutPreview)}</Text>
                <Text color="gray">stderr: {compactPreview(entry.stderrPreview)}</Text>
                {showTechnical ? (
                  <Box flexDirection="column">
                    <Text color="gray">stdout full: {compactPreview(entry.stdout)}</Text>
                    <Text color="gray">stderr full: {compactPreview(entry.stderr)}</Text>
                  </Box>
                ) : null}
              </Box>
            ))
          )}
        </Box>
      )}
    </SectionCard>
  );
});

const InputView = memo(function InputView({
}: Record<string, never>): React.JSX.Element {
  const state = useSessionState();
  const { inputValue, onInputChange, onSubmitInput } = useViewInput();
  const isRunning = state.isRunning;
  return (
    <SectionCard title="Input">
      {isRunning ? (
        INPUT_LOCKED_PLACEHOLDER
      ) : (
        <Box>
          <Text color="green">You: </Text>
          <TextInput value={inputValue} onChange={onInputChange} onSubmit={onSubmitInput} />
        </Box>
      )}
    </SectionCard>
  );
});

const FooterView = memo(function FooterView({}: Record<string, never>): React.JSX.Element {
  const technicalOutput = useTechnicalOutput();
  const gogStatus = useGogStatus();
  const showGogShortcut = !gogSetupReady(gogStatus);
  return (
    <SectionCard title="Help">
      <Text color="gray">{showGogShortcut ? `${BASE_HELP_TEXT} | Ctrl+G: gog setup` : BASE_HELP_TEXT}</Text>
      <Text color="gray">Technical output: {technicalOutput ? "on" : "off"}</Text>
    </SectionCard>
  );
});

export function AgentTuiView({
  state,
  inputValue,
  onInputChange,
  onSubmitInput,
  showTechnical,
  gogStatus,
}: {
  state: AgentSessionState;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmitInput: () => void;
  showTechnical: boolean;
  gogStatus?: GogIntegrationStatus;
}): React.JSX.Element {
  const inputContext = useMemo<ViewInputContextValue>(
    () => ({
      inputValue,
      onInputChange,
      onSubmitInput,
    }),
    [inputValue, onInputChange, onSubmitInput],
  );

  return (
    <SessionStateContext.Provider value={state}>
      <ViewInputContext.Provider value={inputContext}>
        <TechnicalOutputContext.Provider value={showTechnical}>
          <GogStatusContext.Provider value={gogStatus ?? DEFAULT_GOG_STATUS}>
            <Box flexDirection="column">
              <HeaderView />
              <TranscriptView />
              <CommandLogView />
              <InputView />
              <FooterView />
            </Box>
          </GogStatusContext.Provider>
        </TechnicalOutputContext.Provider>
      </ViewInputContext.Provider>
    </SessionStateContext.Provider>
  );
}
