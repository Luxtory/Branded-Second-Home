#!/usr/bin/env bash
# .claude/hooks/session-start-context.sh
# SessionStart hook — injects operational context at the start of the session.
#
# Stdout is sent to Claude as additional context. Keep it concise.
#
# ref: docs.claude.com/en/docs/claude-code/hooks

set -euo pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 0

echo "## Repository snapshot"
echo

# Branch and status (only if it's a git repo)
if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
  AHEAD_BEHIND=$(git status -sb 2>/dev/null | head -1)
  DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

  echo "- Branch: \`$BRANCH\`"
  echo "- Status: $AHEAD_BEHIND"
  echo "- Modified files: $DIRTY_COUNT"

  echo "- Recent commits:"
  git log --oneline -3 2>/dev/null | sed 's/^/  - /' || true
fi

echo

# CI status (if gh CLI is available and authenticated)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  CI_STATUS=$(gh run list --limit 1 --json status,conclusion,name 2>/dev/null || echo "")
  if [[ -n "$CI_STATUS" ]]; then
    echo "- Last CI run: $CI_STATUS"
  fi

  OPEN_COUNT=$(gh issue list --state open --json number 2>/dev/null | jq 'length' 2>/dev/null || echo "?")
  echo "- Open issues: $OPEN_COUNT"
fi

echo

# [CUSTOMIZE] Project-specific reminders.
# Replace these examples with rules pulled from your project's CLAUDE.md
# (## Anti-patterns and ## Workflow sections). The reminders below are
# generic, stack-agnostic safety rails — keep them or replace them.
echo "## Reminders"
echo "- ✓ Run the project test suite before opening a PR (see CLAUDE.md → ## Commands)"
echo "- ✓ Use Conventional Commits (feat:, fix:, chore:, refactor:, test:, docs:)"
echo "- ❌ No production deploys from local — CI only"
echo "- ❌ No edits to applied migrations — create a new migration instead"
echo "- ❌ No secrets, tokens, or PII in code, logs, or commits"

exit 0
