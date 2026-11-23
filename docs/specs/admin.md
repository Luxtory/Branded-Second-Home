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

## 14. Parâmetros econômicos globais (W16)

Plano: [`w16-prl-parametros-e-snapshot.md`](../plan/w16-prl-parametros-e-snapshot.md); decisão:
[ADR-0032](../adr/0032-prl-parametros-economicos-e-contrato-de-snapshot.md) §6–§7. Amplia o §13 sem alterar suas
regras: mesma tabela `app.parameter`, mesmo command `set_parameter` (Admin + base), mesma vigência D3. O PRL fica na
spec [`pricing`](pricing.md).

- **Escopo global.** `second_home_id` nulo para as chaves econômicas; `guest_rules` continua a única chave por Second
  Home (CHECK de escopo). Trava do escopo `app.parameter:<chave>:global`; vigência, unicidade do início
  (`NULLS NOT DISTINCT`) e `app.parameter_at(chave, NULL, instante)` tratam o escopo global como um escopo próprio.
- **Chaves (lista fechada) e tipos no banco** — valor em texto canônico, validado por CHECK:

  | Chave | Base | Tipo | Consumidor |
  |---|---|---|---|
  | `credit_multiplier` | `01` §20 | decimal > 0, até 6 casas, sem zero à direita | W20 |
  | `credit_validity_months` | BR-191, TECH-044 | inteiro de meses ≥ 1 | W17 |
  | `luxchange_fee_rate` | `01` §24, BR-232 | fração em (0, 1], até 6 casas | W19, W21 |
  | `luxchange_fee_minimum` | `01` §24, BR-232 | dinheiro: unidade mínima ≥ 1 + `currency = 'BRL'` | W19, W21 |
  | `request_deadline_hours` | PD-005 | inteiro de horas ≥ 1 | W21 |
  | `membership_base_annual_price` | BR-141 | dinheiro: unidade mínima ≥ 1 + `currency = 'BRL'`, por ano por titular | — (registro) |

  Zero e negativo são recusados (BR-361); limites superiores são técnicos. `currency` só existe nas chaves monetárias.
- **Valor-base do Membership.** Só registro e histórico: não cria cobrança, renovação, faturamento, plano nem integração
  financeira, e não toca `app.membership` (D1–D4 da W15).
- **Adiados (D1).** Taxa de Administração, descontos Luxplus, taxas e comissões de locação: entram por migration
  própria quando a Luxtory definir a forma e houver consumidor.
- **Ausência.** Sem versão vigente, quem depende recusa com `ERR_PARAMETER_MISSING`; nenhum valor padrão no código,
  seed, migration ou teste. Valores iniciais da TECH-030 só pelo runbook, com autorização operacional (D4).
- **Leitura.** Admin pelo servidor; o Titular não lê parâmetros globais (a política de leitura do §13 só alcança
  versões de uma Second Home).
- **Entrada.** Server Action sobre o executor; rota REST continua adiada (ADR-0030, D5). `set_parameter` aceita
  `second_home_id: null` só nas chaves econômicas (escopo validado no Zod e no banco); valor canônico validado pelo
  mesmo formato do CHECK; a auditoria grava o valor e a moeda das chaves econômicas (não pessoais) e só o tamanho do
  texto de `guest_rules`.
- **Tela `/admin/parametros`** (Admin): cada chave ausente, vigente ou agendada, histórico imutável (valor, vigência,
  autoridade, base, registro) e nova versão com revisão antes de confirmar (vigente agora, agendados, "anterior → novo",
  vigência, término, base e autoridade, calculados no servidor; a confirmação refaz a validação); valor no formato da tela (reais com até 2 casas, percentual com até 4,
  multiplicador com até 6, meses e horas inteiros), convertido em texto para o valor canônico, sem `number`; horários em
  UTC (parâmetros globais não têm fuso de Second Home).
  Apresentação (C2): um cartão por chave (dois por linha quando cabem, DS `lx-parameters`) com nome, finalidade em
  linguagem operacional e a referência canônica numa linha própria (`01`/BR/TECH/PD por ID, fora do texto corrido);
  situação e valor vigente em destaque; vigência e próxima versão em fatos curtos; histórico e "Publicar nova versão"
  sob demanda. A revisão abre com "antes da nova vigência → novo" (o mesmo padrão da revisão do PRL).
- **W18 — políticas comerciais:** a seção "Políticas comerciais" (`/admin/politicas`, só Admin) pertence ao módulo
  `pricing`; contrato em [`pricing.md`](pricing.md) §5 "Políticas comerciais" e [ADR-0034](../adr/0034-politicas-comerciais-esquema-fechado-e-avaliacao.md).
