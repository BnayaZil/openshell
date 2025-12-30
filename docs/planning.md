# Code Agent Planning

### Open questions & thoughts
- What if our agent will be a CLI orianted in terms of tools?

### Code agents lifecycle

- Initialization:
  - The agent is initialized with a set of tools and a set of policies.
  - System prompt is set to the agent.
  - Any persistent state is loaded.
  - Codebase summaries are loaded.
- Thought:
  - Process the user prompt and generate planning steps.
  - Explaining and reasoning about the planning steps.
- Action:
  - Code generation.
  - Tool execution.
- Observation:
  - The agent observes the results of the action.
  - The agent updates the persistent state.
- Iteration:
  - The agent repeats the thought, action, and observation steps until the user prompt is satisfied.
- Completion:
  - The agent completes the user prompt.
  - The agent updates the persistent state.
  - The agent returns the result to the user.
  

### Agent permission
- type Permission = ask | allow | deny

### Tools
- data structure (WIP): ```
  {
    id: string,
    permission: Permission
    ...
  }
  ```
- Is there a reason to not expose to agent the computer's installed CLIs?