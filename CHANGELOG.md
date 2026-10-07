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
- Como funciona (`/como-funciona`) na Especificação Visual e Copy do fundador: Hero fotográfico com o índice dos três
  capítulos, a jornada do lifestyle ao Luxtory Club, Patrimônio, Liberdade (com as quatro configurações Co-Owner),
  Gestão, Luxtory Club e Pertencimento respondendo às perguntas do leitor com Owner e Co-Owner no mesmo peso, condições
  sempre visíveis, "Faz sentido para a sua vida?" e o CTA por disponibilidade sobre a fotografia de fechamento
  (`D-B2C-20`); o mesmo header da Home; scrim uniforme no Hero e no CTA final (`lx-hero--uniform`, token
  `scrim.display-alpha`); complementos do Core com esse consumidor (Answer Rows, Figures, índice de capítulos do Hero).
- Wave 4 — Discovery público no Core Design System (CP2): Home conforme a Especificação Visual Final do fundador
  (Cinematic Hero, Problem/Triad Comparison, Panel Switch das alternativas, Text + Diagram e Triad Statement, Editorial
  Splits com imagens conceituais do Kaizen, Owner | Co-Owner com o mesmo peso, PUSH com o CTA por disponibilidade sobre
  a fotografia de fechamento, FAQ), copy do GATE-COPY-W4 (`D-B2C-19`); Como funciona, Coleção, Concept e 404 nas
  receitas do Core; header, menu e rodapé do site no Core.
- Core Design System Luxtory (CP1, `docs/specs/design-system.md` §13): superfícies `white`/`wash`/`sand`/`blue`/`deep`
  (`data-surface`), papéis de tipo `type.*`, ritmo, layout, motion e foco como tokens; primitives e componentes
  reexpressos e patterns oficiais (Cinematic Hero, Problem/Triad Comparison, Triad Statement, Editorial e Panel
  Comparison, Numbered Editorial List, Editorial Split) atrás do flag `data-lx="core"` — nenhuma página do produto o
  liga ainda; diagramas originais adaptados em `public/diagrams/core/`; Lab do Core (Public, Auth, Admin) e contratos
  de teste (matriz papel × superfície, radius/sombra, contexto sem foundations, flag, assinatura dos diagramas).
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
- W2B — fundação de UI de produto (ADR-0009): regra global mobile-first com paridade funcional; App Shell das áreas
  logadas (barra com o logo oficial e gaveta no celular, navegação lateral a partir de 64rem), cabeçalho e seções de
  página; logo servido pela chave do manifest (`/brand/logo/<chave>`). O Admin é o primeiro consumidor. Layout
  focado para login, segundo fator, acesso negado, indisponível e erro inesperado (com "Tentar de novo").
- W3 — Catálogo no Admin (ADR-0010): Brand Partner (autorização de exposição e encerramento), Residence Concept com
  versões e aprovação como controle editorial, Edition (região, modalidade e condições comerciais registradas),
  autorização de Investor (sem dado pessoal, revogável) e Residence — cujo registro é a aprovação comercial e fixa a
  versão vigente do Concept. Telas mobile-first no App Shell (lista de registros, cabeçalho com contexto e ações,
  ação destrutiva discreta) e API `POST /v1/admin/*` (9 operações) com o mesmo pipeline auditado e o papel Admin
  exercido; checagem de terminologia nos textos registrados.

### Changed
- ...
- Cadastro do segundo fator (`/entrar/mfa`) guiado em três passos: aplicativo autenticador (links oficiais), QR Code
  com chave manual opcional e botão "Copiar chave", e o código de 6 dígitos do aplicativo — diferente do código do
  e-mail. Segurança inalterada (TOTP padrão, AAL2).
- Login (`/entrar`): botão "Reenviar código" no passo do código, com aviso de envio e, se o limite de envio for
  atingido, o pedido para aguardar antes de tentar de novo — o formulário do código continua na tela.
- Checagem de terminologia do catálogo (Admin): passa a recusar também disponibilidade ou uso garantidos, irrestritos
  ou ilimitados (REQ-101; Framework B2C §14, ADR-0012). As varreduras de `src/` e do Design System usam os mesmos
  padrões do catálogo.
- Checagem de terminologia do catálogo (Admin): passa a recusar também receita, vendas, demanda, escala, royalty ou
  remuneração garantidas ou asseguradas (REQ-101, BR-374; Framework Brand Partners §8, ADR-0013), com as mesmas
  varreduras de `src/` e do Design System.

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
