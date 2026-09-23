#!/usr/bin/env bash
# stop-notes-reminder.sh
# `Stop` hook: continuity guard at the end of each response turn.
#
# Responsibilities:
#   1. Wave-completion protocol — when a roadmap row flips to ✅ in NOTES.md,
#      block once so Claude does a final continuity pass on NOTES.md; on the
#      following stop, show the user a systemMessage suggesting /compact
#      (pre-compact-snapshot.sh + session-start-compact-resume.sh make the
#      compaction lossless).
#   2. Continuity-docs reminder — if the turn produced real (non-doc) changes
#      and NOTES.md / docs/specs/ / CHANGELOG.md were not touched, block once
#      and ask Claude to update them.
#
# Stop-hook contract (stdout JSON):
#   - silent exit 0                      → turn ends normally
#   - {"decision":"block","reason":...}  → injects reason, forces one more turn
#   - {"systemMessage": "..."}           → visible note to the user, no block
# Loop guard: when stop_hook_active=true, never block again (prevents loops).
set -uo pipefail

INPUT=$(cat)
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Only act inside a git repository.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

DIR_KEY=$(echo "$PROJECT_DIR" | sha1sum | cut -c1-12)
STATE_DIR="${TMPDIR:-/tmp}"
WAVE_COUNT_FILE="$STATE_DIR/.claude-wave-count-${DIR_KEY}"
WAVE_PENDING_FILE="$STATE_DIR/.claude-wave-pending-${DIR_KEY}"
REMINDER_STATE_FILE="$STATE_DIR/.claude-notes-reminder-${DIR_KEY}"

# ---------------------------------------------------------------------------
# 1) Wave-completion protocol (runs regardless of stop_hook_active).
#    "Completed waves" = table rows in NOTES.md marked ✅ (roadmap table).
# ---------------------------------------------------------------------------
if [ -f NOTES.md ]; then
  DONE_COUNT=$(grep -cE '^\|.*✅' NOTES.md 2>/dev/null || true)
  DONE_COUNT=${DONE_COUNT:-0}

  if [ -f "$WAVE_PENDING_FILE" ]; then
    # Previous stop forced the final NOTES.md pass; it just finished →
    # surface the /compact suggestion to the user and end quietly.
    rm -f "$WAVE_PENDING_FILE"
    echo "$DONE_COUNT" > "$WAVE_COUNT_FILE" 2>/dev/null || true
    jq -n '{systemMessage: "🌊 Wave complete and NOTES.md final pass done. Good moment to run /compact before the next wave — the PreCompact hook snapshots git state and the SessionStart(compact) hook restores continuity automatically."}'
    exit 0
  fi

  if [ -f "$WAVE_COUNT_FILE" ]; then
    PREV_COUNT=$(cat "$WAVE_COUNT_FILE" 2>/dev/null || echo 0)
    case "$PREV_COUNT" in *[!0-9]*|"") PREV_COUNT=0 ;; esac

    if [ "$DONE_COUNT" -gt "$PREV_COUNT" ]; then
      echo "$DONE_COUNT" > "$WAVE_COUNT_FILE" 2>/dev/null || true
      if [ "$STOP_ACTIVE" != "true" ]; then
        touch "$WAVE_PENDING_FILE" 2>/dev/null || true
        REASON=$(cat <<'EOF'
🌊 Wave completion detected: a roadmap row in NOTES.md flipped to ✅ this turn.

Before ending, do the final continuity pass on NOTES.md (it must survive a /compact and a fresh session):
 1. "Current status" + roadmap table reflect reality (wave done, branch/PR/merge state).
 2. Technical discoveries and gotchas from this wave are recorded (anything that cost >15 minutes).
 3. Decisions taken during the wave are listed (promote architectural ones to docs/adr/).
 4. "Next wave" section has concrete steps and acceptance criteria.
 5. Mirror the wave status in docs/plan/implementation-waves.md if it exists.

If the pass is already complete, say so explicitly and finish the turn.
EOF
)
        jq -n --arg r "$REASON" '{decision: "block", reason: $r}'
        exit 0
      else
        # Already inside a hook-forced continuation — cannot block again.
        jq -n '{systemMessage: "🌊 Wave marked ✅ in NOTES.md. Double-check the final continuity pass (status, discoveries, next wave), then consider running /compact before the next wave."}'
        exit 0
      fi
    elif [ "$DONE_COUNT" -ne "$PREV_COUNT" ]; then
      # Count decreased (row reset/removed) — just re-baseline.
      echo "$DONE_COUNT" > "$WAVE_COUNT_FILE" 2>/dev/null || true
    fi
  else
    # First run in this project: initialize the baseline, never fire.
    echo "$DONE_COUNT" > "$WAVE_COUNT_FILE" 2>/dev/null || true
  fi
fi

# ---------------------------------------------------------------------------
# 2) Continuity-docs reminder.
# ---------------------------------------------------------------------------
# Loop guard — if we are already continuing because of this hook, stop here.
[ "$STOP_ACTIVE" = "true" ] && exit 0

# Any uncommitted work right now? (modified + staged + untracked)
CHANGES=$(git status --porcelain 2>/dev/null)
[ -z "$CHANGES" ] && exit 0   # nothing changed → read-only/Q&A turn

# Continuity docs already touched alongside the work? Assume it is documented.
# NOTES.md is typically gitignored and never shows in `git status`, so a
# recent mtime is the "touched this turn" signal for it.
NOTES_FRESH_WINDOW_MIN=10
if [ -n "$(find NOTES.md -mmin -"$NOTES_FRESH_WINDOW_MIN" 2>/dev/null)" ]; then
  exit 0
fi
if echo "$CHANGES" | grep -qE 'NOTES\.md|docs/specs/|CHANGELOG\.md'; then
  exit 0
fi

# De-dup — do not repeat the warning while the changeset stays the same.
HASH=$(echo "$CHANGES" | sha1sum | cut -d' ' -f1)
if [ -f "$REMINDER_STATE_FILE" ] && [ "$(cat "$REMINDER_STATE_FILE" 2>/dev/null)" = "$HASH" ]; then
  exit 0
fi
echo "$HASH" > "$REMINDER_STATE_FILE" 2>/dev/null || true

REASON=$(cat <<'EOF'
📝 Continuity reminder (Stop hook): the working tree has uncommitted changes, but NOTES.md, docs/specs/ and CHANGELOG.md were not touched this turn.

Before finishing, check and, where it makes sense:
 1. Update NOTES.md (TL;DR, decisions, next step) so it survives a /compact.
 2. Update the feature/wave spec in docs/specs/ if contracts, edge cases or acceptance criteria changed.
 3. Add a CHANGELOG.md entry if the wave moved forward.

If none of this is needed (trivial change, no-impact refactor, intentional WIP), say explicitly "no docs update needed" and finish.
EOF
)

jq -n --arg r "$REASON" '{decision: "block", reason: $r}'
exit 0
