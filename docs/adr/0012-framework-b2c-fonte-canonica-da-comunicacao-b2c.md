# 0012. Framework B2C como fonte canônica principal da comunicação B2C

- **Date**: 2026-10-01
- **Status**: Accepted — complementado pelo [ADR-0013](0013-framework-brand-partners-fonte-canonica.md) (Brand Partners; `P-LX-05` resolvida)
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: communication, documentation, frontend

## Context

O [ADR-0011](0011-camada-de-comunicacao-publica.md) criou a camada de comunicação das páginas públicas: um Framework
Mestre genérico (método) e preenchimentos aprovados em 2026-09-29 — base Luxtory, B2C e Brand Partners. Em 2026-09-30 a
Luxtory entregou o **Framework Mestre de Estratégia de Comunicação B2C**, já preenchido, cuja estratégia diverge do
preenchimento B2C: Protagonista, posicionamento (tríade Patrimônio + Liberdade + Pertencimento), Antagonista e Vilão,
crenças (MCR), escala de conscientização (Schwartz + Disposição para mudança), personalidade e tom do Mentor, mapa da
Home e CTA. O fundador decidiu que esse Framework é a **fonte canônica principal da comunicação B2C** e que todo
documento ou código divergente é ajustado, ou substituído quando não fizer sentido coexistir. O Framework B2B (Brand
Partners) será entregue depois.

A restrição permanece: a comunicação não redefine o modelo de negócio. Os canônicos `01 → 02 → 03` prevalecem em fatos
(BR-380, REQ-104) e não são editados.

## Decision

1. **Arquivo congelado.** O Framework entra byte a byte em
   [`docs/specs/communication/framework-b2c.md`](../specs/communication/framework-b2c.md) — recebido em 2026-09-30,
   sha256 `7b0ec6c1b8eb828f509b46e77c1c8f2205825190412c9f4aa5176e7a4dab5577`, fixado em `tests/communication.test.ts`.
   Nunca é editado; muda só por nova versão da Luxtory, que troca o arquivo inteiro e o sha256 no mesmo PR.
2. **Hierarquia.** Fatos: `01 → 02 → 03`. Comunicação B2C: Framework B2C > [`b2c.md`](../specs/communication/b2c.md) >
   brief da página > i18n. O Framework orienta o que dizer; os canônicos limitam o que pode ser afirmado.
3. **Aplicação sem paráfrase.** `b2c.md` deixa de ser um preenchimento e passa a ser a aplicação rastreável do Framework:
   ancora em IDs canônicos o que o Framework afirma sobre o modelo (limites L1–L9), responde às objeções com IDs, mapeia
   as páginas e registra o que o Framework não decide. Os demais documentos citam o Framework pela marca
   `[FW-B2C: §8 P4]` e nunca o reescrevem.
4. **Substituição com trilha.** O conteúdo B2C divergente sai do corpo dos documentos. As linhas de registro ficam,
   com status `substituída em 2026-09-30 → <destino>`. A versão anterior é o commit `846b2e8`. Exceção à regra de
   instância "conteúdo existente só é estendido", autorizada pelo fundador e registrada no `CLAUDE.md`.
5. **Brand Partners intacto até o Framework B2B.** `framework-mestre.md` e `luxtory.md` §1–§3 (princípios,
   personalidade, tom) passam a valer só para Brand Partners (`P-LX-05`). Os guardrails e fatos transversais de
   `luxtory.md` §4–§5 seguem valendo para todas as jornadas.
6. **Imposição mecânica.** O teste da camada verifica o sha256, resolve toda referência `[FW-B2C: …]`, exige as seções
   de `b2c.md` e impede citar decisão ou hipótese substituída fora dos registros. As guardas lexicais de `src/`, do
   Design System e do catálogo ganham os padrões das regras 11 e 13 do Framework §14.

## Consequences

### Positive

- Uma IA que constrói uma página B2C lê só o Framework (o que e como comunicar) e o `b2c.md` (limites canônicos,
  respostas, mapa de páginas), sem estratégia concorrente em outro arquivo.
- O que o Framework afirma sobre propriedade, Club, gestão, convidados e transferência fica preso aos BRs que o
  sustentam.
- Mudança silenciosa no Framework quebra o teste.

### Negative

- Até o Framework B2B, o Mentor tem dois perfis documentados: o do Framework B2C e o de `luxtory.md` §2–§3, só para
  Brand Partners.
- Nova versão do Framework exige troca de arquivo, novo sha256 e revisão de `b2c.md` no mesmo PR.

### Neutral / follow-ups

- W4 constrói as páginas pelo mapa de `b2c.md` §8; a Home segue estritamente o Framework §12.
- Framework B2B (`P-LX-05`): harmoniza `luxtory.md` e `brand-partners.md` quando chegar.
- Revisão jurídica da comunicação pública (`P-LX-03`), ampliada para o termo "posse" e a menção comparativa a
  categorias.

## Alternatives considered

- **Substituir o conteúdo de `framework-mestre.md`.** Brand Partners perderia o método em que foi preenchido antes de o
  Framework B2B existir. Rejeitada.
- **Reescrever o Framework no formato dos preenchimentos.** Seria paráfrase de uma fonte canônica: duas versões e drift.
  Rejeitada.
- **Manter o preenchimento B2C anterior em anexo.** Coexistência de estratégias contraria a decisão do fundador; o
  histórico fica no Git e nos registros. Rejeitada.
- **Mover o Framework para `docs/specs/canonical/`.** Misturaria comunicação com a hierarquia de definições de negócio
  (mesmo motivo do ADR-0011). Rejeitada.
- **Sem hash fixado (como no ADR-0011).** Para um método versionado, o Git bastava; para uma fonte canônica congelada,
  edição silenciosa não pode passar — mesmo padrão do kit de logo em `src/design-system/scripts/brand.test.mjs`. O
  ADR-0011 continua valendo para o Mestre genérico.

## References

- [ADR-0011](0011-camada-de-comunicacao-publica.md), [ADR-0003](0003-design-system-camada-compartilhada.md)
- Contrato: [`docs/specs/communication.md`](../specs/communication.md)
- Canônicos: `01` §1, §2, §8, §37 (BR-373, BR-374, BR-380) · `02` §1, §2, §16 (REQ-100…REQ-104) · `03` §13
- [`docs/plan/implementation-waves.md`](../plan/implementation-waves.md) → Wave 3C

## Versões do Framework

- **2026-10-01 (fundador, `D-B2C-17`):** no §2, a lista de alternativas passa a dizer "outros clubes de second homes,
  intercâmbio ou hospitalidade" — a Luxtory se apresenta como clube de Branded Second Homes. Única alteração; sha256
  `bf1a7f74f8cc2faf02236eeec17864ae5920b31248ca60fb12acec2177c5f6f3` (antes `7b0ec6c1…dab5577`).
