#!/usr/bin/env bash
# pre-compact-snapshot.sh
# `PreCompact` hook: runs before every compaction (manual /compact or auto).
#
# The compaction summary is lossy by nature, so this hook:
#   1. Saves a git continuity snapshot to a state file that
#      session-start-compact-resume.sh (SessionStart, matcher "compact")
#      re-injects as context right after the compaction — continuity is
#      guaranteed regardless of summary quality.
#   2. Prints preservation guidance to stdout (mirrors
#      .claude/rules/git-workflow.md → "When Compacting").
#   3. Flags a stale NOTES.md (work in the tree, NOTES.md untouched).
set -uo pipefail

INPUT=$(cat)
TRIGGER=$(echo "$INPUT" | jq -r '.trigger // "unknown"')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

DIR_KEY=$(echo "$PROJECT_DIR" | sha1sum | cut -c1-12)
SNAPSHOT_FILE="${TMPDIR:-/tmp}/.claude-compact-snapshot-${DIR_KEY}"

BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
CHANGES=$(git status --porcelain 2>/dev/null)

{
  echo "Pre-compact snapshot — trigger: ${TRIGGER}, taken: $(date -u +'%Y-%m-%d %H:%M UTC')"
  echo "- Branch: ${BRANCH}"
  echo "- Recent commits:"
  git log --oneline -5 2>/dev/null | sed 's/^/  - /'
  if [ -n "$CHANGES" ]; then
    echo "- Working tree (git status --porcelain):"
    echo "$CHANGES" | sed 's/^/  /'
  else
    echo "- Working tree: clean"
  fi
} > "$SNAPSHOT_FILE" 2>/dev/null || true

# Stale-NOTES check: real work in the tree but NOTES.md untouched.
# NOTES.md is typically gitignored (absent from `git status`), so freshness
# is judged by mtime, with the status grep as fallback for tracked setups.
NOTES_FRESH_WINDOW_MIN=30
NOTES_FRESH=$(find NOTES.md -mmin -"$NOTES_FRESH_WINDOW_MIN" 2>/dev/null)
if [ -n "$CHANGES" ] && [ -f NOTES.md ] && [ -z "$NOTES_FRESH" ] \
   && ! echo "$CHANGES" | grep -q 'NOTES\.md'; then
  echo "⚠ NOTES.md was NOT updated alongside the current working-tree changes — whatever context is not in the summary below is lost." >> "$SNAPSHOT_FILE" 2>/dev/null || true
  echo "⚠ NOTES.md may be stale relative to the working tree — preserve this session's context carefully in the summary."
fi

# Preservation guidance for the compaction summary.
echo "When compacting, preserve: (1) the full list of files modified this session, (2) current branch and recent commit hashes, (3) failing test names and exact error messages, (4) pending decisions or blockers, (5) current wave status and the next step (see NOTES.md)."
exit 0
