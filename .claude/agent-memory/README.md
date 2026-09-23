# Agent Memory

Project-scoped memory for subagents that declare `memory: project` in their
frontmatter (e.g. `code-reviewer`, `test-runner`, `threat-modeler`).

Each agent gets its own subdirectory here, e.g. `code-reviewer/`. Files inside
are written by the agent itself across sessions and **are committed to the
repo** so the memory travels with the project.

## Variants

| Path                             | Scope    | Committed? |
|----------------------------------|----------|------------|
| `.claude/agent-memory/<name>/`   | project  | ✅          |
| `.claude/agent-memory-local/<name>/` | local | ❌ (gitignored) |
| `~/.claude/agent-memory/<name>/` | user     | n/a (in your home) |

## Tips

- If memory grows noisy, prune entries that are no longer relevant — they're
  just markdown files.
- Don't put secrets here. The agent might write log lines that get committed.
- The `agent-creation.md` rule explains how to enable memory on a new agent.
