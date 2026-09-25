# Implementation waves — Luxtory Branded Second Home

> Fonte de verdade do roadmap de implementação; a tabela de `NOTES.md` espelha a coluna Status.
> Derivado com `/waves`. O plano original do template foi preservado verbatim no
> [Anexo A](#anexo-a--plano-do-template-concluído).

## Design System (DS) — `docs/specs/design-system.md`

Implementação tecnologicamente neutra (ADR-0003): tokens + CSS `lx-*` + Lab estático + docs.
Todas as ondas são **sequenciais**: compartilham `tokens.json` e `styles/index.css`.
Commit Conventional por onda, push em `claude/busy-edison-h75ufo`.

| Wave | Deliverable | Depends on | Parallel with | Status |
|------|-------------|------------|---------------|--------|
| DS-0 | Spec + ADR-0003 + wave plan + NOTES sync | — | — | ✅ |
| DS-1 | Foundations: tokens, fontes OFL, base, scripts de teste | DS-0 | — | ✅ |
| DS-2 | Layout e narrativa: Container, Grid, Scene, Marker, Frame, Sequence, Evidence | DS-1 | — | ✅ |
| DS-3 | Interação e formulário: Button, Link, Field, Choice Group, Message, States | DS-2 | — | ✅ |
| DS-4 | Navegação, Coleção e marca: Header, Mobile Nav, Footer, Collection Card, Credit, Logo slot | DS-3 | — | ✅ |
| DS-5 | Design System Lab + três composições R1 | DS-4 | — | ✅ |
| DS-6 | Documentação normativa + contexto para IAs | DS-5 | — | ✅ |
| DS-7 | QA visual, acessibilidade, `/verify` | DS-6 | — | ✅ |

### DS-0 — Governança e spec

- **Goal**: contrato antes do código.
- **Scope (files)**: `docs/specs/design-system.md`, `docs/adr/0003-design-system-camada-compartilhada.md`, este
  arquivo, `docs/adr/README.md`, `docs/specs/README.md`, `NOTES.md` (local).
- **Acceptance criteria**: spec segue `docs/specs/_template.md`; o Anexo A é idêntico ao plano anterior.
- **Goal command**: `/goal docs/specs/design-system.md and ADR-0003 exist and the Anexo A section of docs/plan/implementation-waves.md is byte-identical to the previous plan, stop after 2 tries`

### DS-1 — Foundations

- **Goal**: tokens, fontes e base prontos e verificados por teste.
- **Scope (files)**: `src/design-system/{tokens,fonts,styles/base.css,styles/fonts.css,styles/index.css,scripts}`.
- **Acceptance criteria**: `node --test src/design-system/scripts/*.test.mjs` verde; paleta imutável exata; contraste por
  fundo e scrim aprovado; zero literais proibidos; fontes ≤ 220KB total e ≤ 100KB com preload; `OFL.txt` presentes.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0, stop after 4 tries`

### DS-2 — Layout e narrativa

- **Goal**: a gramática LUXURY + STORY (Scene, Marker, Frame, Sequence, Evidence) disponível como classes `lx-*`.
- **Scope (files)**: `src/design-system/styles/layout.css`, `styles/components/{typography,marker,frame,scene,sequence,evidence,motion}.css`.
- **Acceptance criteria**: testes verdes; Frames com proporção declarada; drift ≤ 4.8s e 1×; reduced motion
  sem transform.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and every DS-2 component class listed in the spec exists in styles/, stop after 3 tries`

### DS-3 — Interação e formulário

- **Goal**: controles acessíveis para o formulário de interesse.
- **Scope (files)**: `styles/components/{button,link,field,choice,message,states}.css`, `src/design-system/icons/`.
- **Acceptance criteria**: testes verdes; controles ≥ 48px; erro com ícone + texto; foco visível por fundo.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and every DS-3 component class listed in the spec exists in styles/, stop after 3 tries`

### DS-4 — Navegação, Coleção e marca

- **Goal**: estrutura de navegação e vitrine de Concepts.
- **Scope (files)**: `styles/components/{header,mobile-nav,footer,collection,credit,logo}.css`, `src/design-system/brand/logo/README.md`.
- **Acceptance criteria**: testes verdes; nenhum logo provisório versionado; card sem caixa nem sombra.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and every DS-4 component class listed in the spec exists in styles/, stop after 3 tries`

### DS-5 — Design System Lab

- **Goal**: página de referência visual e de regressão.
- **Scope (files)**: `src/design-system/lab/{index.html,lab.css,lab.js}`.
- **Acceptance criteria**: todas as seções da spec §6 presentes; três composições R1; `check-hardcodes` cobre o Lab.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and lab/index.html contains the three R1 compositions, stop after 3 tries`

### DS-6 — Documentação e contexto para IAs

- **Goal**: qualquer IA ou dev encontra e segue o sistema.
- **Scope (files)**: `docs/reference/design-system.md`, `.claude/skills/frontend-design/SKILL.md` (seção
  `[CUSTOMIZE]`), `CLAUDE.md`, `AGENTS.md`, `docs/reference/README.md`, `docs/README.md`, `CHANGELOG.md`.
- **Acceptance criteria**: links internos resolvem; somente adições em `CLAUDE.md` e `AGENTS.md`; canônicos intactos.
- **Goal command**: `/goal every relative link in docs/reference/design-system.md resolves and git diff --stat docs/specs/canonical is empty, stop after 2 tries`

### DS-7 — QA visual, acessibilidade e `/verify`

- **Goal**: evidência de qualidade antes do GO/NO-GO.
- **Scope (files)**: correções pontuais apontadas pelo QA.
- **Acceptance criteria**: axe sem violações; sem overflow horizontal em 320–1920px; teclado completo; reduced
  motion; `/verify` executado.
- **Goal command**: `/goal axe reports 0 violations on the Lab at 390 and 1440px and no viewport from 320 to 1920 has horizontal overflow, stop after 4 tries`

### Execution notes

- O W0 (scaffold Next.js, CI, `## Commands`) é pré-requisito dos wrappers React do DS, não destas ondas.
- Pendência externa: kit oficial de logos (commit aditivo em `src/design-system/brand/logo/`).

---

## Anexo A — plano do template (concluído)

# Implementation waves — Loop engineering primitives

> Source spec: `docs/specs/loop-engineering.md`. This file is the source of
> truth for the wave roadmap; the NOTES.md table mirrors the Status column.
>
> Worked example: this plan was derived with `/waves` and executed wave by wave
> on the template itself.

| Wave | Deliverable | Depends on | Parallel with | Status |
|------|-------------|------------|---------------|--------|
| 0 | Spec + wave plan + NOTES sync | — | — | ✅ |
| 1 | `/verify` skill | 0 | 2, 3 | ✅ |
| 2 | `/waves` emits per-wave `Goal command` | 0 | 1, 3 | ✅ |
| 3 | `/babysit-pr` skill | 0 | 1, 2 | ✅ |
| 4 | `docs/how-to/loops.md` + generic task-completed gate | 1, 2, 3 | — | ✅ |
| 5 | Sync README + CLAUDE.md + final pass | 1–4 | — | ✅ |

## Wave 0 — Spec + wave plan

- **Goal**: the spec and this plan exist and the NOTES.md roadmap mirrors it.
- **Scope (files)**: `docs/specs/loop-engineering.md`, `docs/plan/implementation-waves.md`, `NOTES.md` (local).
- **Depends on / parallel with**: — (foundation, always sequential).
- **Acceptance criteria**: spec follows `docs/specs/_template.md` sections; this
  plan follows the `/waves` output format; NOTES.md table matches this table.
- **Goal command**: `/goal docs/specs/loop-engineering.md and docs/plan/implementation-waves.md exist and the NOTES.md roadmap table matches the plan table, stop after 2 tries`

## Wave 1 — `/verify` skill (turn-based lever)

- **Goal**: Claude can verify its own change end-to-end instead of the user
  reviewing by eye.
- **Scope (files)**: `.claude/skills/verify/SKILL.md` (new).
- **Depends on / parallel with**: depends on 0; parallel with 2 and 3 (disjoint
  files, no shared interface).
- **Acceptance criteria**: skill has valid frontmatter (`name`, `description`,
  `allowed-tools`); body covers scope → static gates from `CLAUDE.md → ## Commands`
  → behavioral check per project type (`[CUSTOMIZE]`) → evidence rule →
  restart-from-step-1 failure rule; degrades with an explicit warning when
  `## Commands` still has placeholders.
- **Goal command**: `/goal .claude/skills/verify/SKILL.md exists with valid frontmatter and covers all five steps listed in the spec's file contract, stop after 3 tries`

## Wave 2 — `/waves` emits per-wave `Goal command` (goal-based lever)

- **Goal**: every generated wave plan ships a ready-made `/goal` invocation
  derived from that wave's acceptance criteria, cap included.
- **Scope (files)**: `.claude/skills/waves/SKILL.md` (edit).
- **Depends on / parallel with**: depends on 0; parallel with 1 and 3.
- **Acceptance criteria**: Process derives the command from acceptance criteria
  and requires verifiable conditions (command exits green / score / count) plus
  an explicit cap; Output format shows the `**Goal command**` line; Execution
  notes explain running a sequential wave as a goal loop and closing it with
  `/verify`.
- **Goal command**: `/goal .claude/skills/waves/SKILL.md output format includes a Goal command line and the process section requires a verifiable condition with an explicit cap, stop after 3 tries`

## Wave 3 — `/babysit-pr` skill (time-based lever)

- **Goal**: a skill designed for `/loop 5m /babysit-pr <n>` that addresses
  review comments and fixes failing CI, acting only when something changed.
- **Scope (files)**: `.claude/skills/babysit-pr/SKILL.md` (new).
- **Depends on / parallel with**: depends on 0; parallel with 1 and 2.
- **Acceptance criteria**: frontmatter has `argument-hint` and
  `disable-model-invocation: true`; body covers PR resolution (argument or
  current branch), state gathering via `gh`, cheap no-change turns, acting on
  review comments and failing CI, merged/closed stop condition, and an explicit
  never-force-push rule; local gates referenced via `## Commands` with
  `[CUSTOMIZE]`.
- **Goal command**: `/goal .claude/skills/babysit-pr/SKILL.md exists and covers resolve/gather/idle/act/stop plus the never-force-push rule, stop after 3 tries`

## Wave 4 — Loops how-to guide + generic quality gate (proactive, doc-only)

- **Goal**: a how-to that maps the four loop types to the template's assets,
  with recipes and cost rules; `task-completed.sh` presented as the
  deterministic stop-condition reference.
- **Scope (files)**: `docs/how-to/loops.md` (new), `.claude/hooks/task-completed.sh`
  (header comment edit), `docs/how-to/README.md` (index, if it lists content).
- **Depends on / parallel with**: depends on 1, 2, 3 (references their names);
  sequential.
- **Acceptance criteria**: guide contains the four-type table with a template
  asset per row, at least three recipes with explicit stop conditions/caps, the
  cost rules, and the composition example; every referenced file exists;
  `task-completed.sh` stays unwired by default.
- **Goal command**: `/goal docs/how-to/loops.md exists, every file it references exists in the repo, and every example carries a stop condition, stop after 3 tries`

## Wave 5 — Sync pass (README, CLAUDE.md, NOTES)

- **Goal**: no divergence between shipped reality and the documents that
  describe it.
- **Scope (files)**: `README.md`, `CLAUDE.md`, this file (statuses → ✅),
  `NOTES.md` (final continuity pass, local).
- **Depends on / parallel with**: depends on 1–4; sequential (touches the files
  the parallel waves deliberately avoided).
- **Acceptance criteria**: README skills tree lists `verify/` and `babysit-pr/`
  and the hooks list reflects the task-completed reframing; CLAUDE.md
  Definition of Done includes end-to-end verification via `/verify`; wave table
  here and in NOTES.md all ✅ and identical.
- **Goal command**: `/goal README tree matches the actual .claude/skills contents and CLAUDE.md Definition of Done mentions /verify, stop after 2 tries`

## Execution notes

- Sequential waves run in the main session, one atomic Conventional Commit per
  wave (this repo is trunk-based on `main`; push only on request).
- Waves 1–3 are parallelizable (disjoint files, no shared public interface) —
  they may run as subagents in isolated worktrees; all README/CLAUDE.md
  touchpoints are deferred to wave 5 precisely to keep 1–3 conflict-free.
- When a wave completes, mark it ✅ here AND in NOTES.md — the Stop hook then
  forces the final NOTES.md continuity pass and suggests /compact.
