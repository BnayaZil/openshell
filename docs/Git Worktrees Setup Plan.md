Git Worktrees Setup Plan

Target Outcome





Use one main checkout for main and multiple sibling worktrees for active features.



Make branch/worktree names deterministic so switching tasks is fast and low-risk.



Keep each worktree self-sufficient for your npm workspaces flow.

Proposed Layout





Keep canonical repo at /Users/bnayaz/git/zilbercode on main.



Create sibling root: /Users/bnayaz/git/zilbercode-worktrees/.



Name each worktree directory as <ticket-or-scope>-<short-purpose> (example: feat-agent-hooks).



Map each worktree to branch feat/<ticket-or-scope>-<short-purpose>.

Standard Worktree Lifecycle





Create new task





From canonical repo: fetch/prune and ensure main is current.



Create branch + worktree in one step:





git worktree add -b feat/<name> ../zilbercode-worktrees/<name> origin/main



Start work in that task





In worktree: run npm install once to materialize local deps/lock state for that checkout.



Use existing scripts from [/Users/bnayaz/git/zilbercode/package.json](/Users/bnayaz/git/zilbercode/package.json): npm run build, npm run test, or package-scoped scripts.



Rebase/sync periodically





In task worktree: git fetch origin && git rebase origin/main (or merge if that is your preference).



Finish task





Merge PR, then cleanup:





git worktree remove ../zilbercode-worktrees/<name>



git branch -d feat/<name>



Occasionally run git worktree prune in canonical repo.

Operational Conventions (Important for Monorepo)





Respect Node version via [/Users/bnayaz/git/zilbercode/.nvmrc](/Users/bnayaz/git/zilbercode/.nvmrc) before installs/builds in each worktree.



Treat each worktree as isolated runtime state (node_modules, build output, temp files).



Keep only one branch per worktree (no branch hopping in-place).



Reserve canonical repo for main maintenance and creating/removing worktrees.

Optional Quality-of-Life Layer (Phase 2)





Add shell aliases/functions for:





wt-new <name> (create)



wt-ls (list)



wt-rm <name> (remove + branch delete)



Add short team doc section under [/Users/bnayaz/git/zilbercode/docs/planning.md](/Users/bnayaz/git/zilbercode/docs/planning.md) or a dedicated workflow doc for repeatability.

Rollout Sequence





Phase 1: adopt naming + lifecycle commands manually for 2-3 feature branches.



Phase 2: add aliases/functions once naming is validated.



Phase 3: document final conventions and cleanup policy.

