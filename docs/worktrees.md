# Git Worktrees for Parallel Feature Development

This repository uses one canonical checkout and sibling worktrees for feature branches.

## Layout

- Canonical checkout (main): `/Users/bnayaz/git/openshell`
- Worktrees root: `/Users/bnayaz/git/openshell-worktrees`
- Worktree folder naming: `<ticket-or-scope>-<short-purpose>`
- Branch naming: `feat/<ticket-or-scope>-<short-purpose>`

Example:
- Folder: `agent-hooks`
- Branch: `feat/agent-hooks`

## One-time setup

From canonical repo:

```bash
mkdir -p /Users/bnayaz/git/openshell-worktrees
npm run wt:sync-main
```

## Daily commands

Create a new task worktree:

```bash
npm run wt:new -- agent-hooks
```

Create from natural-language objective (auto-slug name):

```bash
npm run wt:new:objective -- "add streaming response support in agent"
```

List worktrees:

```bash
npm run wt:ls
```

Remove merged task worktree and local branch:

```bash
npm run wt:rm -- agent-hooks
```

## Feature workflow

1. Create worktree and branch from `origin/main`.
2. Enter worktree, match Node version, and install deps.
3. Implement + test in isolation.
4. Push branch and open PR.
5. After merge, remove worktree and delete local branch.

Example:

```bash
npm run wt:new -- agent-hooks
cd /Users/bnayaz/git/openshell-worktrees/agent-hooks
nvm use
npm install
npm run build
npm run test
git push -u origin feat/agent-hooks
```

Cleanup after PR merge:

```bash
cd /Users/bnayaz/git/openshell
npm run wt:rm -- agent-hooks
git worktree prune
```

## Important rules

- Treat each worktree as isolated state (`node_modules`, build outputs, temp files).
- Keep one branch per worktree; avoid branch hopping inside a worktree.
- Use canonical checkout for `main` maintenance and worktree create/remove operations.
