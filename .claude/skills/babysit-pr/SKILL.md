---
name: babysit-pr
description: Monitor a pull request — address new review comments and fix failing CI, acting only when something changed. Designed to run on an interval, e.g. `/loop 5m /babysit-pr 123`.
argument-hint: "[pr-number]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Babysit pull request: $ARGUMENTS

## 1. Resolve the PR

- If `$ARGUMENTS` is a number, use it. Otherwise use the PR of the current
  branch (`gh pr view`).
- If `gh` is missing or unauthenticated, stop and tell the user to run
  `gh auth login` — do not keep looping into the same failure.

## 2. Gather state

```bash
gh pr view <n> --json state,mergeable,reviewDecision,reviews,comments,statusCheckRollup
gh pr checks <n>
```

Compare against the last check in this conversation: any NEW review comments,
NEW check failures, or a state change?

## 3. Nothing changed → cheap turn

If there is nothing new, report "no change" in one line and end the turn.
Acting (or re-analyzing) on every tick is the main cost failure mode of a
time-based loop.

## 4. Act on what changed

- **New review comments**: address each one — make the change or reply with
  reasoning. Group related fixes into atomic Conventional Commits.
- **Failing CI**: inspect with `gh run view --log-failed`, reproduce locally
  when possible, fix, and push.
- Before any push, run the project's gates from `CLAUDE.md → ## Commands`
  ([CUSTOMIZE] — at minimum Test and Lint for the files you touched).
- **Merge conflict**: report it and stop — resolving is the author's call.
- **Never force-push.** Not to fix CI, not to resolve conflicts, not for any
  reason inside this skill.

## 5. Stop condition

When the PR is **merged** or **closed**: give a final one-paragraph report
(what was addressed across the loop's lifetime) and tell the user to cancel
the `/loop` — the skill cannot stop the loop by itself.
