#!/usr/bin/env bash
# .claude/hooks/format-on-save.sh
# PostToolUse hook — auto-formats a file after Edit/Write/MultiEdit.
#
# Runs the appropriate formatter per extension. Fails silently: if the
# formatter is missing or errors out, Claude's flow is never blocked.
#
# ref: docs.claude.com/en/docs/claude-code/hooks

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# No path: nothing to do
[[ -z "$FILE_PATH" ]] && exit 0
[[ ! -f "$FILE_PATH" ]] && exit 0

# Only format files inside the project
case "$FILE_PATH" in
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

# Utility: run the command if it exists, ignore failures
run_if_exists() {
  if command -v "$1" >/dev/null 2>&1; then
    "$@" >/dev/null 2>&1 || true
  fi
}

# Dispatch by extension
case "$FILE_PATH" in
  *.py)
    run_if_exists ruff format "$FILE_PATH"
    run_if_exists ruff check --fix "$FILE_PATH"
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    run_if_exists npx --no-install prettier --write "$FILE_PATH"
    ;;
  *.json|*.jsonc)
    run_if_exists npx --no-install prettier --write "$FILE_PATH"
    ;;
  *.md|*.mdx)
    run_if_exists npx --no-install prettier --write "$FILE_PATH"
    ;;
  *.tf|*.tfvars)
    run_if_exists terraform fmt "$FILE_PATH"
    ;;
  *.sh|*.bash)
    run_if_exists shfmt -w -i 2 "$FILE_PATH"
    ;;
  *.go)
    run_if_exists gofmt -w "$FILE_PATH"
    ;;
  *.rs)
    run_if_exists rustfmt "$FILE_PATH"
    ;;
esac

exit 0
