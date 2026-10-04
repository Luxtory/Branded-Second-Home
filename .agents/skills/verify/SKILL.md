---
name: verify
description: Verify a change end-to-end before reporting it done — run the project's gates and exercise the changed behavior with tools. Use before marking any task, wave, or PR complete, or whenever about to report work as finished.
allowed-tools: Read, Bash, Grep, Glob
---

# Verifying a change end-to-end

Never report a change as complete just because the edit succeeded. A check made
with a tool is **evidence**; a check without a tool is an **opinion**. Verify
like a human reviewer would:

## 1. Scope the change

Run `git status` and `git diff` (or `git diff <base>` on a branch). Know
exactly what changed before deciding how to exercise it.

## 2. Static gates

Run the project's gates from `AGENTS.md → ## Commands`, in this order:

1. Test
2. Lint
3. Typecheck (if the stack has one)

If `## Commands` still contains `<placeholders>` (project not instantiated
yet), say explicitly which gates you skipped and why — and do NOT report the
change as fully verified.

## 3. Behavioral check

Exercise the changed behavior the way a user or caller would. Pick the row
that matches the project — [CUSTOMIZE] this table to your stack once, so every
future verification runs the same way (Luxtory: see the first row):

| Project type | How to exercise the change |
|--------------|---------------------------|
| **Luxtory (Next.js + PostgreSQL)** | `npm run build && npx next start -p 3100`, then `curl -si` the changed `/v1/*` route (happy path + one invalid input → the TECH-056 `ERR_*` code, never 500) and open the changed page with Playwright (zero console errors, axe 0). Domain changes: run the tagged `db` tests and `npm run trace -- --expect <IDs>` |
| Web frontend | Start the dev server, open/curl the changed page, interact with the change (new control: click it, confirm the state change), confirm zero new console errors/warnings |
| HTTP API | Start the server, hit the changed endpoint with `curl` — happy path AND one failure path (bad input → expected 4xx, not 500) |
| CLI | Run the changed command with real arguments; check exit code and output |
| Library | Run an example or consumer test that goes through the changed code path |
| Worker / job | Trigger one execution with a representative payload; inspect the structured logs it emits |

## 4. Evidence rule

Every claim in your final report must trace to observed output: a test run, a
command's exit code, an HTTP response, a log line. If you did not observe it,
do not claim it.

## 5. Failure rule

If ANY step fails: fix the problem, then **restart from step 1** — the fix may
have invalidated earlier checks. Never hand back partially verified work.
