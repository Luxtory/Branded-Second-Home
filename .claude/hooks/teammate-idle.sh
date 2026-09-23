#!/usr/bin/env bash
# =============================================================================
# teammate-idle.sh — TeammateIdle hook for the experimental Agent Teams
# feature. Runs when a teammate is about to go idle.
#
# Exit code 0 = allow idle. Exit code 2 = send feedback and keep working.
#
# NOT wired up in settings.json by default. See task-completed.sh header for
# activation steps.
#
# [CUSTOMIZE] Adjust the conditions for keeping teammates active.
# =============================================================================
set -euo pipefail

INPUT=$(cat)
TEAMMATE_NAME=$(echo "$INPUT" | jq -r '.agent_name // "unknown"')
PENDING_TASKS=$(echo "$INPUT" | jq -r '.pending_tasks // 0')

if [ "$PENDING_TASKS" -gt 0 ] 2>/dev/null; then
  echo "{\"decision\":\"continue\",\"reason\":\"There are still $PENDING_TASKS pending tasks. Pick up the next one.\"}"
  exit 2
fi

echo "{\"decision\":\"allow\"}"
exit 0
