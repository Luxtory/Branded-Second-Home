# Spec: admin

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `admin` do TECH-011 (`src/features/admin/`). A W2 entrega só a estrutura da superfície Admin (`02` §2); as
telas de operação chegam com cada wave (W3: catálogo).

## 1. Goal

Uma área `/admin` que só abre para staff autenticado com MFA (TECH-050) e que as waves seguintes preenchem.

## 2. Non-goals

- Nenhuma tela de operação, lista ou formulário do Admin (W3 em diante); nenhum componente novo no Design System.
  **Revisão W2B ([ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md))**: o Admin passa a ser o primeiro
  consumidor do App Shell do DS; lista, tabela, filtros e formulários continuam na W3.
  **Revisão W3 ([ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md))**: o Admin ganha a seção Catálogo
  (spec [`catalog`](catalog.md)) com lista de registros (`lx-record-list`) e formulários; tabela e filtros continuam
  fora (sem consumidor).
- Logo no cabeçalho do Admin: os arquivos do kit só são servidos pelo Lab; a exposição do logo entra com as páginas
  públicas (W4).

## 3. Users / actors

- Staff com papel `admin` e/ou `super_admin` e sessão AAL2 (spec [`identity`](identity.md)).

## 4. User stories

- Como membro do staff, quero ver que entrei no Admin, com os papéis que posso exercer, e poder sair.
- W3: como Admin, quero chegar ao Catálogo pela navegação e pelo início do Admin.
- W5: como Admin, quero chegar à visão de Interesses pela navegação e pelo início do Admin.

## 5. Contracts

### HTTP API

- Nenhuma. `/admin` é tela; o acesso é resolvido pelo módulo `identity` (API pública do slice).
- W3: as operações e telas do Catálogo estão na spec [`catalog`](catalog.md). O `admin` só compõe o shell: item
  "Catálogo" (só para quem tem o papel Admin ativo) e o atalho no início.
- W5: a visão de Interesses está na spec [`ownership`](ownership.md) §5. O `admin` acrescenta o item "Interesses"
  (`/admin/interesses`, só com o papel Admin ativo) e o atalho no início, com a mesma regra do Catálogo.

### Events (if any)

- Nenhum.

### Domain model

- Nenhum estado próprio na W2.

## 6. Acceptance criteria

- [x] Sem sessão → `/entrar`; sessão AAL1 → `/entrar/mfa`; sessão AAL2 sem papel de staff → tela 403 sem dado; staff
      AAL2 → início do Admin com os papéis ativos e "Sair".
- [x] Sem banco ou sem Auth no ambiente (Preview, ADR-0007) → tela "indisponível", sem erro 500.
- [x] Textos pela camada i18n; classes `lx-*`; axe 0 em 390 e 1440 px (E2E).
- [x] W2B: `/admin` no App Shell (`AppShell` + `PageHeader`) — abaixo de `lg`, barra com logo e gaveta; a partir de
      `lg`, navegação lateral com o item atual (`aria-current`) e o bloco de conta (papéis ativos + "Sair"). Itens de
      navegação só para seções com tela (`admin-shell.tsx`); início com "Sua sessão" (papéis e segundo fator) e
      "Módulos" (estado vazio honesto). Fluxo principal a 390 px com toque; sem overflow de 320 a 1920 px.
- [x] W2B: tela 403 no layout focado (rótulo "Acesso negado" em Hanken, título, texto e "Sair"), sem dado.
- [x] W3: navegação com "Início" e "Catálogo" (item só com o papel Admin ativo; `aria-current` na seção atual);
      "Módulos" do início leva ao Catálogo; staff só Super Admin não vê o item e recebe 403 nas telas do Catálogo.

## 7. Edge cases

- Papel revogado com a sessão aberta → a próxima navegação cai na tela 403.

## 8. Security considerations

- Authorization: toda página do Admin passa pela resolução de acesso do `identity` no servidor, a cada request.
- Threat model: [`docs/security/threats/identity-admin.md`](../security/threats/identity-admin.md).

## 9. Observability

- Sem logs próprios; os do `identity` cobrem sessão e indisponibilidade.

## 10. Rollout plan

- Junto com o `identity` (runbook "Preparar a W2").

## 11. Open questions

- Nenhuma.

## 12. References

- `02` §2 (superfície Admin), REQ-095. `03`: TECH-050. ADR-0003 (Design System), ADR-0008.

## 13. Parâmetros: `set_parameter` e `parameter` (W14)

Plano: [`w14-selecao-luxtory-parametros-e-convidados.md`](../plan/w14-selecao-luxtory-parametros-e-convidados.md);
decisão: [ADR-0030](../adr/0030-selecao-luxtory-parametros-e-convidados.md) §3. Dona da parte de parâmetros do REQ-095
(autoridade, histórico e vigência); PRL na W16, demais parâmetros na W15/W16 — o REQ-095 não é declarado integralmente
coberto pela W14.

- **Tabela `app.parameter`** (TECH-030): chave, Second Home, valor, `effective_from`, `effective_to` opcional,
  autoridade, base (`authorization_ref`), `created_at`, `created_by`, operação. Lista fechada de chaves na W14: só
  `guest_rules` (texto por Second Home, 1–20 000 caracteres, exibido como texto puro; conteúdo em P-5). Nenhum valor
  presumido: sem versão vigente, quem depende recusa com `ERR_PARAMETER_MISSING`.
- **Command `set_parameter`** (Admin + base registrada, TECH-051). Autoridade e autor vêm da operação (guard do
  servidor, atribuição Admin revalidada no banco), nunca da entrada.
- **Vigência (D3).** Só por inserção; nenhuma linha muda depois (TECH-052). Uma versão nova do escopo só é aceita se
  começar depois de todos os inícios existentes, não antes do instante da gravação e não antes do `effective_to`
  explícito da versão mais recente (começar exatamente nele é aceito; intervalos `[início, fim)`). Sem `effective_to`,
  a versão vale até o início da seguinte (`app.parameter_version.effective_until`). Sem início informado, vale no
  instante da gravação. Com uma versão futura agendada, uma nova só pode começar depois dela. Vigente no instante:
  `app.parameter_at` (nenhuma linha = ausente). Recusas: retroativo, mesmo início, início anterior ou antecipação de
  término → `ERR_STATE_TRANSITION`.
- **Concorrência.** Trava exclusiva por escopo no gatilho; a declaração de convidados toma a mesma em modo
  compartilhado: nenhuma versão nova começa antes de uma declaração já gravada.
- **Leitura.** Admin: histórico completo pelo servidor. Titular: versões da Second Home da holding vigente que
  representa, sem base, autoridade, autor ou operação (RLS + privilégio de coluna).
- **Entrada.** Server Action sobre o executor (D5); a rota REST `POST /v1/admin/parameters` fica adiada.

- **E3/E4 (implementação).** `admin/domain/parameter.ts` (D3 pura: `successorConflict`, `versionInForce`),
  `admin/application/set-parameter.ts`, `admin/infrastructure/postgres-parameter-store.ts`, entrada de servidor
  `admin/parameters.ts`. Trava `parameter` na ordem de travas (depois de `booking`). Recusas: Second Home inexistente →
  `ERR_NOT_FOUND`; vigência → `ERR_STATE_TRANSITION`; entrada (texto, base, término antes do início) →
  `ERR_VALIDATION`. Tela `/admin/catalogo/second-homes/[id]/regras-de-convidados`: em vigor, histórico (início, fim
  efetivo, autoridade, base, publicação, texto) e publicação; datas no horário da Second Home (`datetime-local`,
  horário inexistente ou ambíguo recusado).
