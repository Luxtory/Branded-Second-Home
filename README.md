> **Luxtory Branded Second Home** — este repositório é a base do site e do software da Luxtory.
> Comece por [`CLAUDE.md`](CLAUDE.md) (contexto, restrições e stack) e pelos documentos canônicos
> em [`docs/specs/canonical/`](docs/specs/canonical/) (01 → 02 → 03).
> As instruções de instanciação do template que removem arquivos (`rm …`) **não se aplicam** a
> este repositório. O conteúdo abaixo é o README original do template, preservado.

---

# Claude Code Bootstrap Pro

> Your professional Claude Code project starter.
> Included as a bonus with the **Curso Claude Code Architect** by Bruno Bracaioli.

Thanks for grabbing this. **Claude Code Bootstrap Pro** is the same `.claude/`
baseline I use to start every serious project: Spec-Driven Development,
Vertical Slice + DDD architecture, API-First, ADRs, Diátaxis docs, DevSecOps,
and a NOTES.md living-memory workflow that keeps Claude Code context-aware
across sessions — all wired up so you skip the first two days of bikeshedding
on every new repo.

This is **not** an open-source template. It's a private deliverable
licensed to you under [`LICENSE`](LICENSE). Quick summary: use it on as
many of your own projects as you want; do not republish, resell, or repackage
the template itself. Full terms in the file.

## How you received this

You received Claude Code Bootstrap Pro through **one or both** of these
channels:

1. **A watermarked zip download.** A snapshot of the template tagged with
   your purchase fingerprint — see [`NOTICE.md`](NOTICE.md). This is the
   **official licensed deliverable**. It arrived via email or your
   checkout's file-delivery feature.
2. **Read-only access to a private GitHub repository.** Optional. If you
   provided a GitHub username at checkout, you'll receive a collaboration
   invite at that account. Use the repo to browse the template's history,
   pull future updates, or click "Use this template" to spin up a fresh
   project repo of your own.

> ⚠️ **Do not use the GitHub Releases page as your download source.**
> If you have repo access, you'll see a "Source code (zip)" link on the
> Releases tab. That is the unstamped master, **not your licensed copy**.
> Your licensed copy is the watermarked zip emailed to you — it carries
> your name, order id, and fingerprint inside `NOTICE.md`. Always start
> from the watermarked zip; use the GitHub repo for browsing, updates,
> or "Use this template", not for downloading.

Either channel is sufficient to start. The repo is just a convenience for
git-native workflows.

---

## What you got

```
<project-root>/
├── CLAUDE.md                  # Project memory — auto-loaded by Claude Code
├── README.md                  # You are here (replace with your project's README)
├── LICENSE                    # Your license to use this template (do not delete)
├── NOTICE.md                  # Your delivery fingerprint (do not redistribute)
├── SUPPORT.md                 # How to reach me if you need help with the template
├── CONTRIBUTING.md            # Template — for YOUR project's contributors (customize)
├── SECURITY.md                # Template — for YOUR project's vuln disclosure (customize)
├── CHANGELOG.md               # Template — for YOUR project's changelog (customize)
├── NOTES.example.md           # Skeleton for NOTES.md — living working memory (copy + customize)
├── .editorconfig              # Cross-editor formatting baseline
├── .gitignore                 # Sensible defaults for many stacks
├── .env.example               # Template env file (copy to .env locally)
├── .mcp.json                  # MCP servers (empty by default)
├── .mcp.json.example          # Reference: how to configure GitHub/Postgres/etc.
├── .claude/
│   ├── settings.json          # Team-shared settings
│   ├── agents/                # Generic, language-agnostic subagents
│   │   ├── code-reviewer.md
│   │   ├── test-runner.md
│   │   ├── threat-modeler.md
│   │   └── web-researcher.md
│   ├── skills/                # Auto-discoverable skills
│   │   ├── babysit-pr/        # Monitor a PR under /loop (review comments + CI)
│   │   ├── commit/            # Conventional Commits helper
│   │   ├── fix-issue/         # Triage + fix from a GitHub issue
│   │   ├── frontend-design/   # Distinctive UI generation
│   │   ├── review/            # PR review skill
│   │   ├── security-scan/     # DevSecOps audit pipeline
│   │   ├── spec/              # Author/refresh feature specs
│   │   ├── ux-designer/       # UX best-practices reference
│   │   ├── verify/            # End-to-end change verification (evidence, not opinion)
│   │   ├── vertical-slice/    # Scaffold a VSA + DDD slice
│   │   └── waves/             # Wave plan from a spec (+ per-wave /goal command)
│   ├── commands/deploy.md     # /deploy — stack-agnostic deploy runbook
│   ├── hooks/                 # Lifecycle hooks (wired in settings.json)
│   │   ├── block-secrets.sh          # PreToolUse — blocks .env & sensitive-path access
│   │   ├── validate-bash.sh          # (optional, unwired) PreToolUse — blocks destructive commands
│   │   ├── format-on-save.sh         # PostToolUse — auto-formats edited files
│   │   ├── docs-reminder.js          # PostToolUse — nudges doc updates when src changes
│   │   ├── session-start-context.sh  # SessionStart — injects repo snapshot into context
│   │   ├── session-start-compact-resume.sh  # SessionStart(compact) — post-compact continuity protocol
│   │   ├── pre-compact-snapshot.sh   # PreCompact — git snapshot + summary guidance before compaction
│   │   ├── stop-notes-reminder.sh    # Stop — NOTES.md continuity check + wave-completion protocol
│   │   ├── task-completed.sh         # (optional, unwired) deterministic quality gate (Agent Teams / loops)
│   │   └── teammate-idle.sh          # (optional, unwired) Agent Teams — idle checklist
│   ├── output-styles/tactical.md
│   ├── rules/                 # Standing instructions for Claude
│   └── agent-memory/          # Per-agent project memory
├── docs/
│   ├── specs/_template.md             # Spec-Driven Development template
│   ├── specs/loop-engineering.md      # Worked example: the template's own loop-primitives spec
│   ├── plan/implementation-waves.md   # Worked example: wave plan derived with /waves
│   ├── how-to/loops.md                # Run Claude Code in loops (turn/goal/time/proactive)
│   ├── adr/0001-record-architecture-decisions.md  # Meta-ADR
│   ├── adr/_template.md               # Nygard ADR template
│   ├── api/openapi.yaml               # API-First REST contract skeleton
│   ├── api/asyncapi.yaml              # API-First event contract skeleton
│   ├── security/threats/_template.md  # STRIDE threat model template
│   └── {tutorials,how-to,reference,explanation}/   # Diátaxis sections
└── .github/
    ├── pull_request_template.md       # Mirrors CLAUDE.md > Definition of Done
    ├── ISSUE_TEMPLATE/{bug,feature}.md
    ├── workflows/ci.yml               # Lint / typecheck / test / security skeleton
    └── dependabot.yml                 # Multi-ecosystem (trim to your stack)
```

---

## Start a new project

You have two equally valid starting points. Pick the one that matches your
workflow.

### Option 1 — From the zip (works without GitHub)

```bash
# 1. Extract the zip you received and copy it to your new project folder
cp -r claude-code-bootstrap-pro-<your-order-id>-<short-fp>/ my-new-project
cd my-new-project

# 2. Drop the bootstrap's metadata that doesn't belong to your new project
rm LICENSE NOTICE.md SUPPORT.md README.md   # you'll write your own
# Keep CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, CLAUDE.md — they're templates.

# 3. Initialize a fresh git repo for YOUR project
git init && git checkout -b main

# 4. Make hooks executable
chmod +x .claude/hooks/*.sh

# 5. Walk through the instantiation checklist below

# 6. First commit
git add .
git commit -m "chore: bootstrap from claude-code-bootstrap-pro"
```

### Option 2 — From the private GitHub repo

After accepting the collaboration invite emailed to your GitHub account:

```bash
# 1. Click "Use this template" on the master repo's GitHub page,
#    then clone YOUR new repo:
git clone git@github.com:<your-handle>/<your-new-project>.git
cd <your-new-project>

# 2. Drop bootstrap-only metadata as in Option 1
rm LICENSE NOTICE.md SUPPORT.md README.md
chmod +x .claude/hooks/*.sh

# 3. (Optional) Add the master as a remote so you can pull future updates
git remote add bootstrap https://github.com/brunobracaioli/claude-code-bootstrap-pro.git
git fetch bootstrap

# When a new template version drops:
#   git fetch bootstrap
#   git merge bootstrap/main --allow-unrelated-histories
# Resolve conflicts on files you've customized; ignore the rest.
```

> Keep the original watermarked zip somewhere safe even if you used Option 2.
> The zip's `NOTICE.md` is your proof of license.

## Instantiation checklist

Walk through this once per new project. The order matters — earlier steps
define vocabulary later ones rely on.

1. **`CLAUDE.md`** — replace `<project-name>`, fill in `## Stack` with pinned
   versions, fill in `## Commands` with your real dev/test/lint/build/deploy
   commands. Adjust the i18n locales. Remove the instantiation block at the top.
   Then `cp NOTES.example.md NOTES.md` to start your project's living working
   memory (gitignored by default — see CLAUDE.md → "NOTES.md — living document").
2. **`.claude/settings.json`** — uncomment the stack-specific allowlists you
   need (Node, Python, Go, Rust, etc.). The deny list is generic; leave it.
3. **`.mcp.json`** — currently empty. Copy entries from `.mcp.json.example`
   for the MCP servers your project needs. Never hardcode tokens —
   use `${ENV_VAR}` interpolation.
4. **`.env.example`** — list the env vars your app uses; commit only this
   example. Real values go in `.env`, which is gitignored.
5. **`docs/api/openapi.yaml`** (and/or `asyncapi.yaml`) — replace the
   placeholder header with your project name and a real description.
6. **`SECURITY.md`** — replace contact placeholders with your project's
   real reporting channel.
7. **`CONTRIBUTING.md`** — replace `[CUSTOMIZE]` markers with your project's
   real setup commands. If your project is solo / closed-source, you can
   delete this file.
8. **`CHANGELOG.md`** — leave for the first release; just update the repo URL
   in the bottom links.
9. **`.github/ISSUE_TEMPLATE/config.yml`** and **`.github/dependabot.yml`** —
   replace `<owner>/<repo>`. Trim Dependabot ecosystems to those you actually use.
10. **`.github/workflows/ci.yml`** — replace `[CUSTOMIZE]` placeholders with
    real lint/typecheck/test/build commands.
11. **Write your project's own `README.md`** — replace this file with one
    that describes *your* project.
12. **Write your own `LICENSE`** for the project you're shipping — this
    template's `LICENSE` is about the bootstrap itself, not about whatever
    you build with it.

## Precedence (Claude Code settings)

Highest → lowest:

1. **Enterprise managed** — `managed-settings.json`
2. **CLI args** — `--allowedTools`, `--model`, etc.
3. **Local project** — `.claude/settings.local.json` (gitignored)
4. **Shared project** — `.claude/settings.json` (committed)
5. **User global** — `~/.claude/settings.json`

## Operational notes

- `commands/` is **legacy** but still works. Anthropic recommends `skills/`
  (bundled scripts, frontmatter, auto-load).
- `settings.local.json` is auto-added to `.gitignore` by Claude Code on
  creation. It's **not** in this template — start fresh per machine.
- `.mcp.json` lives at the **repo root**, not inside `.claude/`.
- `--add-dir` only loads `skills/` from extra directories. `agents/`,
  `commands/`, and `output-styles/` do not load from `--add-dir`.

## What's intentionally **not** included

- No `src/` — pick your stack first, then build.
- No language-specific `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml`.
- No CI service other than GitHub Actions (port the workflow if you use
  GitLab CI / CircleCI / Cloud Build).
- No pre-commit framework — run hooks via `.claude/hooks/` and the
  format-on-save hook. Add [pre-commit](https://pre-commit.com/) yourself
  if you want extra gates.

## Updates

You receive future versions through whichever channel(s) you have:

- **Zip channel**: a refreshed download is sent through the same purchase
  channel (course platform, email). Each version comes with release notes
  describing what changed and which files are likely to need a re-merge.
- **GitHub channel**: new commits and tags appear on the master repo
  automatically. Run `git fetch bootstrap` (assuming you set up the remote
  as in Option 2) and merge what you want.

Most upgrades are diff-merge-friendly because the heavy customization
happens in `CLAUDE.md` and the `[CUSTOMIZE]` markers, both of which evolve
slowly in the master.

## Need help?

See [`SUPPORT.md`](SUPPORT.md).

## License

This template is provided under a single-buyer commercial license.
**Do not** redistribute or resell. Full terms: [`LICENSE`](LICENSE).

Your copy is identified in [`NOTICE.md`](NOTICE.md) by a delivery
fingerprint tied to your purchase. The fingerprint is for traceability
only — the template doesn't transmit anything at runtime.
