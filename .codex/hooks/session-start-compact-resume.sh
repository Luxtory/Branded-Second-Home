#!/usr/bin/env bash
# session-start-compact-resume.sh
# `SessionStart` hook, matcher "compact": fires right after a compaction.
# Stdout is injected into Claude's context — it restores the continuity
# protocol automatically (no manual "paste the last message" ritual).
#
# Pairs with pre-compact-snapshot.sh, which saved a git snapshot just before
# the compaction; re-injecting it here means continuity does not depend on
# the quality of the compaction summary.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

echo "## Post-compact continuity protocol"
echo
echo "The conversation was just compacted. Before resuming any work:"
echo "1. Read NOTES.md in full — it is the source of truth for current status, the wave roadmap, decisions and gotchas."
echo "2. Cross-check reality: current branch, \`git status\`, recent commits."
echo "3. Tell the user, in two or three sentences, the current wave status and the next step — then continue the task."
echo

DIR_KEY=$(echo "$PROJECT_DIR" | sha1sum | cut -c1-12)
SNAPSHOT_FILE="${TMPDIR:-/tmp}/.claude-compact-snapshot-${DIR_KEY}"
if [ -f "$SNAPSHOT_FILE" ]; then
  echo "### Snapshot taken just before this compact"
  echo
  cat "$SNAPSHOT_FILE" 2>/dev/null || true
fi

exit 0
