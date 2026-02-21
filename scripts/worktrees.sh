#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREES_ROOT="${WORKTREES_ROOT:-${REPO_ROOT}-worktrees}"

usage() {
  cat <<'EOF'
Usage:
  scripts/worktrees.sh new <name> [base]
  scripts/worktrees.sh objective "<prompt objective>" [base]
  scripts/worktrees.sh ls
  scripts/worktrees.sh rm <name>
  scripts/worktrees.sh sync-main

Examples:
  scripts/worktrees.sh new feat-agent-hooks
  scripts/worktrees.sh objective "add streaming response support in agent"
  scripts/worktrees.sh new fix-agent-timeout origin/main
  scripts/worktrees.sh ls
  scripts/worktrees.sh rm feat-agent-hooks
EOF
}

require_name() {
  if [[ $# -lt 1 || -z "${1}" ]]; then
    echo "Missing <name>." >&2
    usage
    exit 1
  fi
}

branch_for_name() {
  local name="$1"
  printf 'feat/%s' "${name}"
}

path_for_name() {
  local name="$1"
  printf '%s/%s' "${WORKTREES_ROOT}" "${name}"
}

name_from_objective() {
  local objective="$1"
  local name

  if [[ -z "${objective// }" ]]; then
    echo "Objective must not be empty." >&2
    exit 1
  fi

  # Convert free text into a deterministic, filesystem-safe slug.
  name="$(printf '%s' "${objective}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"

  if [[ -z "${name}" ]]; then
    echo "Objective did not contain usable characters." >&2
    exit 1
  fi

  # Keep branch/path names compact and readable.
  name="${name:0:56}"
  name="$(printf '%s' "${name}" | sed -E 's/-+$//')"
  printf '%s' "${name}"
}

sync_main() {
  git -C "${REPO_ROOT}" fetch --prune origin
  git -C "${REPO_ROOT}" pull --ff-only origin main
}

new_worktree() {
  require_name "${@}"
  local name="$1"
  local base="${2:-origin/main}"
  local branch
  local path

  branch="$(branch_for_name "${name}")"
  path="$(path_for_name "${name}")"

  mkdir -p "${WORKTREES_ROOT}"

  if git -C "${REPO_ROOT}" show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "Branch already exists: ${branch}" >&2
    exit 1
  fi

  if [[ -e "${path}" ]]; then
    echo "Directory already exists: ${path}" >&2
    exit 1
  fi

  git -C "${REPO_ROOT}" worktree add -b "${branch}" "${path}" "${base}"

  cat <<EOF
Created worktree:
  branch: ${branch}
  path:   ${path}

Next steps:
  cd "${path}"
  nvm use
  npm install
EOF
}

list_worktrees() {
  git -C "${REPO_ROOT}" worktree list
}

remove_worktree() {
  require_name "${@}"
  local name="$1"
  local branch
  local path

  branch="$(branch_for_name "${name}")"
  path="$(path_for_name "${name}")"

  if [[ -d "${path}" ]]; then
    git -C "${REPO_ROOT}" worktree remove "${path}"
  else
    echo "Worktree path not found (skip remove): ${path}"
  fi

  if git -C "${REPO_ROOT}" show-ref --verify --quiet "refs/heads/${branch}"; then
    git -C "${REPO_ROOT}" branch -d "${branch}"
  else
    echo "Branch not found (skip delete): ${branch}"
  fi
}

objective_worktree() {
  local objective="${1:-}"
  local base="${2:-origin/main}"
  local name

  if [[ -z "${objective}" ]]; then
    echo "Missing objective text." >&2
    usage
    exit 1
  fi

  name="$(name_from_objective "${objective}")"
  echo "Derived worktree name: ${name}"
  new_worktree "${name}" "${base}"
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    new)
      shift
      new_worktree "${@}"
      ;;
    objective)
      shift
      objective_worktree "${@}"
      ;;
    ls)
      list_worktrees
      ;;
    rm)
      shift
      remove_worktree "${@}"
      ;;
    sync-main)
      sync_main
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${@}"
