# Changelog

> **Template file.** This is a starter `CHANGELOG.md` for **your own
> project's** releases — not the changelog of the `claude_bootstrap`
> template. The bootstrap's own version notes are delivered by the
> purchase channel where you got the download.

All notable user-facing changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Design System Luxtory (LUXURY + STORY): tokens DTCG (`src/design-system/tokens/tokens.json`), grounds
  paper/wash/night, three free OFL fonts (Newsreader, Hanken Grotesk, Courier Prime), CSS components `lx-*` for R1
  (Scene, Scene Marker, Frame, Sequence, Evidence, Button, Link, Field, Choice Group, Message, States, Header,
  Mobile Nav, Footer, Coleção, Concept Credit, Logo slot), Design System Lab, zero-dependency checks
  (contrast WCAG 2.2 AA, hardcodes, fonts, terminology). Spec `docs/specs/design-system.md`, ADR-0003.
- Official Luxtory logo kit (horizontal, vertical, icon × Moroccan Blue / Warm Sand) organized via
  `src/design-system/brand/logo/manifest.json` (sha256-pinned, `brand.test.mjs`), wired into header, menu, footer and Lab.
- W0 — fundação: app Next.js 16 (App Router, TypeScript strict) com `GET /v1/health` e `GET /v1/version`
  (`x-correlation-id` em toda resposta), página 404 em pt-BR com o Design System, favicon do kit oficial e Design
  System Lab interno em
  `/lab` (fora de produção). Harness de testes com PostgreSQL 17 real (ADR-0005), E2E com axe, `npm run verify`,
  `npm run trace` e CI/CD com produção só pela CI (ADR-0004). ADRs 0004–0006.
- W1 — núcleo de commands: pipeline único e idempotente (TECH-054) com `operation`, auditoria só de inserção sem
  dado pessoal bruto, outbox com entrega ao menos uma vez e notificações dentro do app; registro fechado de commands
  (TECH-051); códigos de erro TECH-056 com causa funcional em pt-BR (REQ-098) no contrato OpenAPI; job `outbox` em
  `GET /api/jobs/{job}` (Vercel Cron, `CRON_SECRET`); papel de aplicação `luxtory_app` com TLS verify-full; runbook
  `docs/how-to/operacao.md`. ADR-0007 (sem staging antes do lançamento — decisão D3 adiada).
- W2 — acesso administrativo: login da equipe Luxtory por código enviado por e-mail (`/entrar`) com segundo fator
  TOTP obrigatório (`/entrar/mfa`, AAL2) e estrutura do Admin (`/admin`); papéis Admin e Super Admin sem hierarquia,
  atribuídos e revogados só pelo runbook, com auditoria; guard que nega por padrão (TECH-050/051);
  `authorization_grant` revogável e `POST /v1/admin/authorization-grants` com CSRF por origem (REQ-014); leituras
  sob RLS e leitura administrativa auditada. Auth real só em Production (ADR-0008; reavaliação da D3 no ADR-0007).

### Changed
- ...

### Deprecated
- ...

### Removed
- ...

### Fixed
- ...

### Security
- ...

---

## [0.1.0] - YYYY-MM-DD

Initial release.

[Unreleased]: https://github.com/<owner>/<repo>/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<owner>/<repo>/releases/tag/v0.1.0
