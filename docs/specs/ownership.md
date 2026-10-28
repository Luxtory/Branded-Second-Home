# Spec: ownership — Interesse (W5)

> Status: W5 — Interesse (núcleo), em implementação (2026-10-19)
> Owner: Luxtory
> Related ADRs: [ADR-0017](../adr/0017-idempotencia-de-mutacoes-publicas-nao-criticas.md),
> [ADR-0014](../adr/0014-discovery-publico-leitura-anonima-csp-e-publicacao.md),
> [ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md) §7, [ADR-0006](../adr/0006-acesso-a-dados.md)
> Threat model: [`docs/security/threats/ownership.md`](../security/threats/ownership.md)
> Plano: [W5 em `implementation-waves.md`](../plan/implementation-waves.md#wave-5--interesse-núcleo), com a revisão
> aprovada pelo fundador em 2026-10-19; correção estrutural da W4.2 na [§13](#13-w42--interesse-a-partir-da-home-edition).
> W6 (2026-10-20): solicitação de conversa na Home Edition, contato e pré-qualificação na
> [§14](#14-w6--solicitação-de-conversa-na-home-edition); [ADR-0018](../adr/0018-contato-e-pre-qualificacao-do-interesse.md).
> W9 (2026-10-28): sorteio auditável da ordem inicial na
> [§16](#16-w9--sorteio-auditável-da-ordem-inicial); [ADR-0022](../adr/0022-sorteio-auditavel-e-elegibilidade-temporal-do-outbox.md).

Módulo `ownership` do TECH-011. A W5 entrega só a manifestação de interesse; formalização, Ação, holding e Direito de
Uso chegam nas W8 em diante. Esta spec cita os canônicos (`01` v10.2, `02` v4.3, `03` v3.15) e não os parafraseia.

## 1. Goal

Registrar a manifestação de interesse com os campos canônicos do `03` §3.1 (`interest`) — Home Edition (obrigatória;
o Home Concept vem dela), modalidade desejada, localização pretendida (`desired_location`), `approx_days` só para
Co-Owner e origem — sem gerar direito, prerrogativa nem efeito econômico, e dar ao Admin a visão agrupada que orienta
a Luxtory (BR-062).

- **Dona**: REQ-023 (origem e parceiro registrados sem prerrogativa).
- **Complementa**: REQ-022 (a manifestação parte de uma Home Edition publicada), REQ-024 (interesse Owner não é
  aquisição), REQ-025 (dias são preferência; só a formalização cria Ação e Direito de Uso).
- **TECH**: TECH-001, TECH-056 (`POST` + `Idempotency-Key`), TECH-100 (validação, rate limit, PII fora dos logs, CSRF),
  TECH-092 (auditoria da leitura administrativa).
- **BR**: BR-030, BR-032, BR-040–BR-043, BR-050, BR-060, BR-062, BR-065.

## 2. Non-goals

- Formulário público, `interest_contact` (nome, telefone, e-mail), `interest_qualification`, HMAC de PII, Aviso de
  Privacidade e Budget Fit: W6 (`02` v4.3 REQ-022; `03` v3.15 §3.1). Aqui ficam só os campos canônicos do `interest` —
  nenhum dado de contato.
- Formalização, Ação (`stake`), `holding`, Direito de Uso, calendário, reserva, Créditos ou qualquer efeito econômico.
- Entidade de parceiro, autorização de parceiro local (BR-042/043) ou atribuição comercial à Brand Partner (BP2,
  REQ-029). `origin` e `partner_ref` são metadados declarados e nunca alimentam essas capacidades.
- Pipeline de commands críticos (TECH-002/TECH-054): interesse não é mutação econômica nem de estado crítico — sem
  `operation`, `audit_log` de command, `idempotency_record`, `CRITICAL_COMMANDS` ou ator público (ADR-0017).
- Edição, exclusão ou exportação de interesses; contato da Luxtory com interessados (BR-064) — sem dado de contato na W5.
- Faixas, buckets, ranking ou algoritmo de agrupamento comercial: a Luxtory agrupa (BR-062, BR-063); o software só
  apresenta os valores registrados.

## 3. Users / actors

- **Visitante anônimo** (sem conta): envia a manifestação pela API pública. Entrada não confiável.
- **Admin** (staff com o papel Admin exercido, AAL2 — ADR-0008): consulta a visão agrupada. Super Admin sozinho não a
  vê (sem hierarquia, como o Catálogo).

## 4. User stories

- Como visitante, quero manifestar interesse numa Home Edition publicada, como Owner ou Co-Owner, informando a
  localização pretendida e, como Co-Owner, a necessidade aproximada de dias, sem que isso me conceda qualquer direito.
- Como Admin, quero ver os interesses agrupados por Home Edition (com o seu Home Concept), localização pretendida e
  modalidade, com os dias aproximados exatos informados pelos Co-Owners, para que a Luxtory avalie composições
  (BR-062–BR-064).

## 5. Contracts

### HTTP API

`POST /v1/interests` — operationId `createInterest` em [`docs/api/openapi.yaml`](../api/openapi.yaml) (o contrato é a
fonte; esta seção resume). Público, sem conta, sem CORS, toda resposta `Cache-Control: no-store`.

Ordem de processamento (cada etapa recusa antes da seguinte; nenhuma recusa anterior ao banco toca o banco):

1. **Portão** — `isInterestWriteOpen`: site público aberto (`PUBLIC_SITE`, ADR-0014) **e** escrita de interesse aberta
   (`INTEREST_WRITES`: `open`/`closed`; ausente = fechada em Production, aberta fora dela). Fechado → `404`.
2. **Configuração** (TECH-001) — limites e prazo do limitador, segredo da pseudonimização, Upstash (ou o modo `fake` de
   local/CI) e banco. Ausente/inválida → `503` nomeando só as chaves no log.
3. **Origem** (CSRF, TECH-100) — `Origin` do mesmo host (`isSameOrigin`, a regra das mutações do Admin). Ausente ou
   diferente → `403`.
4. **Tipo e corpo** — `application/json` UTF-8 (`415`), até 8 KiB efetivos (`413`).
5. **Origem de rede** — só o metadado da plataforma (`trustedClientAddress`); ausente na Vercel → `503`.
6. **Rate limit** (TECH-100) — o `RateLimiter` da BP1 com namespace próprio `luxtory:interest:<ambiente>`: por origem
   de rede pseudonimizada e global. Conta toda tentativa que chega aqui, inclusive as recusadas depois. Excesso → `429`
   com `Retry-After`; limitador sem resposta no prazo, falha de rede ou de Redis → `503`. Redis nunca decide estado.
7. **Validação** — JSON, schema fechado (§5.1) e `Idempotency-Key` UUID. Inválido → `400` com `fields` (nome e código,
   nunca o valor).
8. **Idempotência** (ADR-0017) — chave já usada: mesmo conteúdo validado → replay (`201` + `idempotency-replayed:
   true`); conteúdo diferente → `409 ERR_IDEMPOTENCY_CONFLICT`. O replay não reavalia a Home Edition.
9. **Alvo público** — Home Edition publicada e visível no Discovery (leitura como `anon` sob RLS, ADR-0014: Home
   Edition com `visibility = 'public'` — o que exige definição material finalizada — de Home Concept público: Brand
   Partner com exposição autorizada e não encerrada + versão aprovada; BR-015, BR-021, BR-030, REQ-096). Senão →
   `404 ERR_NOT_FOUND` (inexistente, em preparação, fora do público e de Home Concept não público respondem igual;
   `02` §15, item 15). A Home Edition não restringe modalidade (BR-032): não há validação
   de modalidade contra ela.
10. **Escrita atômica** — numa transação: reserva da chave (`app.public_idempotency_key`) + inserção em `app.interest`.
    Corrida com a mesma chave → uma única linha; a outra tentativa vira replay ou conflito.
11. **Resposta** — `201 { "status": "registered" }`, sem identificador interno.

| HTTP | Código | Condição |
|---|---|---|
| 201 | — | Interesse registrado, ou replay da mesma tentativa (`idempotency-replayed: true`) |
| 400 | `ERR_VALIDATION` | JSON/schema/campo/chave inválidos; F2b violada (`fields` só com nome e código) |
| 403 | `ERR_PERMISSION` | `Origin` ausente ou de outro host |
| 404 | `ERR_NOT_FOUND` | Escrita fechada neste ambiente; Home Edition fora do público ou inexistente |
| 409 | `ERR_IDEMPOTENCY_CONFLICT` | Mesma chave com outro conteúdo |
| 413 | `ERR_PAYLOAD_TOO_LARGE` | Corpo acima de 8 KiB |
| 415 | `ERR_UNSUPPORTED_MEDIA_TYPE` | Corpo não é `application/json` |
| 429 | `ERR_RATE_LIMITED` | Limite por origem de rede ou global excedido (`Retry-After`) |
| 503 | `ERR_UNAVAILABLE` | Configuração ausente/inválida, limitador ou banco indisponível |
| 500 | `ERR_INTERNAL` | Erro inesperado; resposta genérica e log sanitizado |

#### 5.1 Corpo

JSON fechado (campo extra → `400`). Textos: espaços das pontas removidos e sequências internas de espaço reduzidas a
um; limites em pontos de código Unicode; controles C0/DEL recusados. Limites de texto são técnicos (TECH-100), não
regra de negócio.

| Campo | Regra | Base |
|---|---|---|
| `home_edition_id` | uuid, obrigatório — a Home Edition publicada da página; o Home Concept vem dela | REQ-022, BR-030, `03` §3.1 |
| `modality` | `owner` ou `co_owner`, obrigatório (modalidade desejada) | BR-030, BR-032 |
| `desired_location` | texto obrigatório, 1–200 — localização pretendida | REQ-022, REQ-024, REQ-025, BR-030 |
| `approx_days` | `co_owner`: obrigatório, inteiro positivo, sem teto de negócio (limite de representação: inteiro de 32 bits); `owner`: ausente ou `null` (F2b) | REQ-025, BR-060 |
| `origin` | texto opcional, até 200; vazio = ausente | REQ-023, BR-040–BR-043 |
| `partner_ref` | texto opcional, até 200; vazio = ausente | REQ-023, BR-042 |

Códigos de campo: `required`, `too_long`, `invalid`, `not_allowed` (`approx_days` para Owner).

`origin` e `partner_ref` (decisão do fundador, 2026-10-19): metadados textuais declarados pelo cliente e **não
confiáveis**. Sem enum, sem FK para `brand_partner` e sem entidade de parceiro. Nunca concedem acesso, autorização,
representação, comissão, titularidade da demanda ou atribuição comercial, e não são fonte da atribuição da BP2. Um
modelo canônico futuro de parceiros evolui por migration própria.

### Events (if any)

Nenhum. O registro de interesse não publica evento no outbox (`docs/api/asyncapi.yaml` inalterado).

### Domain model

`app.interest` (`03` §3.1), só inserção:

| Coluna | Regra |
|---|---|
| `id` | uuid gerado no servidor |
| `home_edition_id` | obrigatório; FK `app.home_edition` (o Home Concept é o da Home Edition, sem coluna própria) |
| `modality` | `owner` ou `co_owner` (desejada) |
| `desired_location`, `origin`, `partner_ref` | texto já normalizado; `desired_location` 1–200, os outros nulos ou 1–200 |
| `approx_days` | `integer > 0`; não nulo **se e somente se** `modality = 'co_owner'` |
| `created_at` | instante do `Clock` da aplicação (TECH-110) |

Invariantes:

- **Nunca gera direito** (REQ-025, BR-060, BR-065, REQ-024/BR-050): nenhuma tabela de aquisição, Ação, Direito de
  Uso, holding, party, calendário, inventário, booking, Crédito ou efeito econômico referencia ou é alterada pelo
  interesse. Só a formalização (W8) cria Ação e Direito de Uso.
- **Sem prerrogativa** (REQ-023): `origin` e `partner_ref` não entram em nenhuma regra, ordenação, autorização ou
  agrupamento.
- **Imutável**: `UPDATE`, `DELETE` e `TRUNCATE` recusados.
- **Acesso**: RLS ligada, política só para `luxtory_app` (ADR-0010 §7); `anon` e `authenticated` não leem nem gravam.
  Fora do PostgREST (Data API desligada, ADR-0006).

`app.public_idempotency_key` (`platform`, ADR-0017): `surface` (`interest`), chave UUID em minúsculas, hash SHA-256
do conteúdo validado e normalizado, `created_at`. Chave primária (`surface`, `idempotency_key`); só inserção; nenhum
dado do visitante além do hash.

### Admin — visão agrupada

`/admin/interesses`, papel Admin exercido (`adminRoleGate('admin')`). Leitura como `luxtory_app` na mesma transação que
grava o `admin_read` (TECH-092, ADR-0010 §7; objeto `interest`, `*`).

- Agrupamento não destrutivo: **Home Edition (com o seu Home Concept) → localização pretendida → modalidade** e,
  dentro de `co_owner`, os **valores exatos de `approx_days`** com a contagem de cada valor (BR-062: Home Edition,
  localização pretendida e necessidade aproximada de uso; modalidade pedida pelo plano). Sem faixas, buckets ou
  algoritmo. `owner` não tem `approx_days`.
- Localização pretendida agrupada pelo texto registrado (já normalizado); nenhuma taxonomia de localizações.
- Home Edition identificada pelo nome, pelo título do Home Concept e pela marca (consulta do módulo `catalog`, sem
  acesso às tabelas dele).
- A visão não mostra registros individuais, `origin` nem `partner_ref` (nenhum uso definido na W5).
- Estado vazio explícito; nenhum valor presumido (TECH-001).

## 6. Acceptance criteria

- [x] `[REQ-023]` origem e `partner_ref` registrados como metadados, sem prerrogativa: o registro altera só `interest`
      e a chave de idempotência pública; não cria Brand Partner, grant, vínculo nem ordem.
- [x] `[REQ-025]` `approx_days` nunca vira Ação nem Direito de Uso: nenhuma tabela de direitos, calendário, inventário,
      booking, Créditos ou economia é alterada; obrigatório para `co_owner`, recusado para `owner`.
- [x] `[REQ-022]` a manifestação exige uma Home Edition publicada (W4.2: sem `concept_id`, sem F2a; ver §13).
- [x] `[REQ-024]` interesse Owner não constitui aquisição: só `interest` e a chave pública mudam.
- [x] `[TECH-100]` excesso de requisições → `429` sem efeito; limitador indisponível → `503` sem efeito; `origin`,
      `partner_ref` e localização pretendida nunca em logs ou mensagens de erro.
- [x] `[TECH-056]` replay com a mesma chave e o mesmo conteúdo; conflito com conteúdo diferente; concorrência com a
      mesma chave → exatamente um interesse.
- [x] `[TECH-092]` a leitura do Admin grava `admin_read`.
- [x] Contrato OpenAPI `createInterest`; `npm run trace -- --expect REQ-023`.

(Suíte da W5: `tests/features/ownership/`, `tests/migrations/ownership.db.test.ts` e
`tests/e2e/interest.spec.ts`.)

## 7. Edge cases

- Sem `home_edition_id` → `400 required`; Home Edition em preparação, fora do público ou inexistente → `404` (BR-030).
- Qualquer modalidade desejada é aceita: a Home Edition não restringe modalidade (BR-032).
- Home Edition retirada do público ou Home Concept que deixa de ser público (encerramento, BR-021) → novas manifestações `404`
  (`02` §15, item 15); replays de tentativas já registradas seguem `201`. Corrida entre a checagem pública e a
  inserção é benigna: interesse não é uso de marca nem direito.
- Recusas (validação, alvo, conflito) não consomem a chave: só o sucesso a grava, na transação do interesse.
- Mesma chave em paralelo → uma linha; as demais tentativas recebem replay (mesmo conteúdo) ou `409`.
- Corpo sem `Content-Length` ou com valor falso → limite pelos bytes recebidos.
- `approx_days` `0`, negativo, decimal, texto ou acima do inteiro de 32 bits → `invalid`.
- `desired_location` só com espaços → `required`; com controle C0 → `invalid`.
- Preview: sem `DATABASE_URL` (ADR-0007), a escrita responde `503` — validação em PostgreSQL local e na CI.

## 8. Security considerations

STRIDE completo em [`docs/security/threats/ownership.md`](../security/threats/ownership.md).

- **Authn/Authz**: escrita pública sem conta; leitura só staff Admin AAL2 com `admin_read`.
- **Input validation**: schema fechado (Zod) no servidor, corpo limitado, UUIDs, texto normalizado; o banco reforça
  enums, limites, F2b e a FK da Home Edition.
- **Abuse**: rate limit distribuído por origem de rede e global; falha fechada; CSRF por origem do mesmo host; portão
  `INTEREST_WRITES` fechado em Production até a ativação.
- **PII**: nenhum dado de contato. Campos livres podem receber texto pessoal digitado pelo visitante: nunca em logs,
  erros, métricas ou respostas; hash de idempotência sem o conteúdo em claro.
- **Pseudonimização da origem de rede**: reutiliza o segredo existente (`BRAND_PARTNERS_CONTACT_HMAC_SECRET`) com
  separação de domínio por superfície (`pseudonymizeNetwork(…, 'interest')`); sem segredo novo (ver STRIDE).

## 9. Observability

- Log estruturado `event: interest_registration` com `correlation_id`, `stage` (conjunto fechado), `status`,
  `duration_ms` e, em falha técnica, `reason` (código). Nunca corpo, campos, IP, pseudônimo, chave ou hash.
- `5xx` → `log.error`; demais → `log.info`.

## 10. Rollout plan

- Merge só no checkpoint do fundador; migrations pela CI (`migrate`) e deploy pela CI.
- Production fica **fechada** (`INTEREST_WRITES` ausente → `404`) até os pré-requisitos operacionais: D2 (Supabase Pro
  antes de dados reais), variáveis `INTEREST_*` e decisão explícita de abertura. Lista em
  [`docs/how-to/operacao.md`](../how-to/operacao.md). Nada é configurado por inferência.
- Rollback: as migrations têm `down` testado (`npm run db:check`).

## 11. Open questions

- `P-3` (W6): campos de contato/qualificação definidos pelo `02` v4.3 (REQ-022); base LGPD, Aviso de Privacidade e
  desenho da pré-qualificação ficam na spec da W6.
- Exibição de `origin`/`partner_ref` ao Admin e retenção das chaves de idempotência pública: sem uso definido na W5.

## 12. References

- Canônicos: `01` BR-030–BR-036, BR-040–BR-043, BR-050, BR-060–BR-065; `02` REQ-022–REQ-025; `03` §3.1 (`interest`),
  TECH-001, TECH-002, TECH-056, TECH-092, TECH-100, ADR-006.
- ADR-0017 (idempotência pública não crítica), ADR-0014, ADR-0010 §7, ADR-0008, ADR-0006, ADR-0004 (Upstash).
- Spec `catalog` §13 e §17 (visibilidade pública da Home Edition) e §14.4 (borda das escritas públicas da BP1).

## 13. W4.2 — Interesse a partir da Home Edition

Correção estrutural aprovada pelo fundador (2026-10-19), aplicada na W4.2 sem antecipar a W6 (`01` v10.2 BR-030,
BR-032, BR-062; `02` v4.3 REQ-022; `03` v3.15 §3.1 `interest`):

- `home_edition_id` obrigatório; `concept_id` sai (o Home Concept é o da Home Edition); nenhuma manifestação comercial
  genérica no Home Concept.
- `region` → `desired_location` (localização pretendida ≠ localização concreta da Second Home).
- Sai a F2a (gatilho `interest_modality_offered` e a recusa `modality: not_allowed`): a Home Edition não tem modalidade.
- Visão do Admin: Home Edition → localização pretendida → modalidade → dias aproximados.
- Migration `ownership_interest_home_edition` (estratégia e precondição fail-closed em
  [`docs/plan/w4-2-ontologia.md`](../plan/w4-2-ontologia.md) §3): `ALTER` preserva os registros que já tenham Home
  Edition; aborta se houver interesse sem Home Edition.
- Ficam para a W6: `interest_contact`, `interest_qualification`, telefone, HMAC de PII, Aviso de Privacidade,
  formulário na página da Home Edition, pré-qualificação e Budget Fit. A escrita continua fechada em Production
  (`INTEREST_WRITES`).

## 14. W6 — Solicitação de conversa na Home Edition

> Decisões do fundador: P-3 (2026-10-19, vigente onde não superada), plano executivo da W6 (D-W6-1 a D-W6-3,
> 2026-10-19), correção do modelo da Home Edition (2026-10-19, noite) e checkpoint da dimensão de investimento
> (2026-10-20, alternativa A com ajustes), **revisto pelo fundador em 2026-10-21** (pré-qualificação como BANT
> adaptado: faixa de recursos para iniciar, `reference_fit` só para Owner com média apresentada, horizonte com
> "imediatamente"; sai a variante `investment_definition`; formulário em etapas), com os **ajustes finais do mesmo dia**
> (horizonte com "Imediatamente" separado de "Nos próximos 30 dias"; faixas sem sobreposição; 4 etapas). Esta seção
> prevalece sobre as
> anteriores onde diferir.
> [ADR-0018](../adr/0018-contato-e-pre-qualificacao-do-interesse.md) · STRIDE `ownership`
> [§W6](../security/threats/ownership.md#w6--solicitação-de-conversa-na-home-edition-2026-10-20) ·
> [inventário LGPD](../security/lgpd-interesse.md). A branch provisória `feat/w6-interesse-formulario` (`9e41101`) é
> só referência histórica: o que valia foi portado conceitualmente; a página separada de Interesse foi descartada.

### 14.1 Goal

Na própria página pública da Home Edition, receber a **solicitação de conversa** do interessado: a manifestação de
interesse (§5, §13), o contato (`interest_contact`) e a pré-qualificação comercial estruturada
(`interest_qualification`) do `03` v3.15 §3.1 — e dar ao Admin uma leitura mínima e auditada desse material
(BR-041, BR-062, BR-064). A coleta continua **fechada** em Production até os gates de go-live (§14.12).

- **IDs (complementa)**: REQ-022, REQ-024, REQ-025, REQ-100, REQ-101 (e REQ-103 no formulário); `02` §15, itens 14 e
  15. A W6 não é dona de REQ.
- **TECH**: TECH-001, TECH-033, TECH-056 (ADR-006), TECH-092, TECH-100, TECH-110. **BR**: BR-030–BR-036, BR-041,
  BR-050, BR-060–BR-065.

Jornada: **Home Edition → manifestação de interesse e pré-qualificação → solicitação de conversa**. O envio não é
aquisição, agendamento, criação de Titular, conta ou cadastro, reserva, prioridade nem classificação (REQ-022, REQ-024,
REQ-025, BR-050, BR-065).

### 14.2 Non-goals

- Rota ou página pública de Interesse separada; escolha de Home Edition ou de região no formulário; Home Concept no
  `interest` (vem da Home Edition, §13).
- Consentimento: sem checkbox, sem botão "consentir", sem consentimento presumido. Transparência pelo Aviso de
  Privacidade da jornada (§14.11); a base legal proposta é **hipótese** sujeita à validação jurídica. Marketing e
  newsletter não fazem parte da submissão.
- Qualquer outro dado: CPF, documentos, dados bancários, saldo, renda, patrimônio, patrimônio líquido, capacidade de
  crédito, financiamento, comprovação financeira, valor exato em reais, valor de Ação, mensagem ou campo livre,
  motivação ou "dor", dados de parceiro, família ou terceiros. A faixa **autodeclarada** de recursos para iniciar
  (§14.5) supera a decisão anterior que listava "entrada"/valor disponível como non-goal (fundador, 2026-10-21) — ela
  não é renda, patrimônio, comprovação nem financiamento (`02` REQ-022), e "entrada" não é termo de produto: não existe
  estrutura comercial de entrada + saldo.
- Score, Hot/Warm/Cold, prioridade, aprovação, roteamento, atribuição, agenda, CRM, pipeline comercial, exportação,
  busca por e-mail/telefone, edição, eliminação pela aplicação (D-W6-2 = A), workflow de direitos do titular, expurgo
  automático, notificação por e-mail.
- Diferença econômica entre Owner e Co-Owner que não exista no `01`; valor individual derivado da média projetada
  (BR-034); divisão da média por qualquer configuração.
- Titular, conta, `party`, `holding`, Ação, Direito de Uso (W7/W8).
- Captura de `origin`/`partner_ref` pelo formulário (seguem metadados da API, §5.1, sem fonte definida).

### 14.3 Página e brief — solicitação de conversa na Home Edition

A página da Home Edition (`catalog` §17.8) ganha, **depois** de "Para quem", a seção **Solicitar uma conversa**
(`#solicitar-conversa`), renderizada pelo módulo `ownership` num espaço que a página do `catalog` oferece ao shell
(`src/app/`), sem import entre slices. Nada mais da página muda. Sem a coleta disponível (§14.9) a seção não existe e
a página fica como na W4.2 (`D-B2C-10`: sem CTA para destino inexistente).

1. **Jornada:** `b2c.md` §8, linhas "Home Edition" e "Interesse — na página da Home Edition" (`D-B2C-27`, `D-B2C-28`).
2. **Função:** registrar a solicitação de conversa sobre aquela Home Edition com uma pré-qualificação útil ao SDR.
   **Schwartz:** Most Aware → ação. **5Ps:** PUSH.
3. **Composição (Core DS):** `lx-section` + `lx-container` + `lx-columns--aside` (abertura | formulário, o mesmo split
   editorial no desktop); `lx-form` com `lx-field`, `lx-input`, `lx-choice-group`/`lx-choice` (Owner e Co-Owner com o
   mesmo peso, REQ-103), `lx-hint`, `lx-error`, `lx-message`, `lx-button--primary` e `lx-button--secondary`.
   Mobile-first, paridade funcional a partir de 320 px (ADR-0009).

**Fluxo progressivo em 4 etapas, na mesma seção e sem URL nova:**

| Etapa | Conteúdo | Ações | Fatos e limites |
|---|---|---|---|
| 1 de 4 — Sua Second Home | modalidade desejada (Owner · Co-Owner, descrições de `D-B2C-19`); localização pretendida; dias aproximados **só para Co-Owner**, com a microcopy da P-3 | Continuar | BR-030, BR-032, REQ-025, BR-060 |
| 2 de 4 — Investimento | faixa de recursos para iniciar; comparação com a média apresentada (só Owner com média); nota do Co-Owner quando a página mostrou a média | Voltar · Continuar | REQ-022, BR-034, BR-063 |
| 3 de 4 — Decisão | unidade de decisão; horizonte | Voltar · Continuar | REQ-022 |
| 4 de 4 — Contato | Nome, Telefone ou WhatsApp, E-mail (todos obrigatórios); "Manifestar interesse não é uma aquisição." e a microcopy D4 com o link para o Aviso de Privacidade | Voltar · Solicitar uma conversa | REQ-022, P-3, D4, BR-050 |

- **Nada é enviado nem persistido antes do envio final**: os dados ficam só na memória do componente — sem URL, cookie,
  `localStorage` ou `sessionStorage`. "Continuar" valida só a etapa atual, no navegador; "Voltar" preserva tudo.
- **Troca de modalidade** invalida só o que ficou incompatível: Co-Owner descarta a comparação com a média; Owner
  descarta os dias. Faixa, unidade de decisão, horizonte e contato ficam.
- **Foco e leitores de tela:** cada etapa abre com um título "N de 4 — …" que recebe o foco na troca de etapa; erros com
  resumo acessível (`role="alert"`) e foco no primeiro campo inválido; o sucesso recebe o foco. Teclado em todo o
  fluxo (Enter avança; setas nas opções).
- **Erros do servidor** num campo de etapa anterior levam de volta àquela etapa, com o erro no campo.

**Não afirmar:** aquisição, agendamento, reserva de dias, Direito de Uso, prioridade, aprovação, disponibilidade, prazo
de resposta, garantia de contato ou retorno, localização, preço, valor por modalidade ou por Ação (REQ-101, L10); nunca
"cota"/"diárias" (REQ-100); nunca "entrada".

**Estados:** etapa → validação no cliente (o mesmo schema; o servidor decide) → enviando (campos somente leitura, botão
desabilitado, sem envio concorrente) → sucesso (a confirmação substitui o formulário e recebe o foco) | inválido | falha
por código: `429` limite, `409` conflito (a próxima tentativa usa chave nova), `404` Home Edition indisponível (com link
para a Coleção), contexto de apresentação recusado (pede para atualizar a página), `403`/`413`/`415` recusado,
`503`/`500`/rede **não confirmado** (dados e chave preservados só em memória para repetir). Telefone com `type="tel"` e
`autocomplete="tel"`; dias com `type="text" inputmode="numeric"`; e-mail com `type="email"`.

**Copy (pt-BR; Terminologia do `02` §1).** Perguntas, respostas, ajuda, abertura, botões e sucesso são literais do
fundador (2026-10-21, §14.5); as microcopies da P-3 e a D4, de 2026-10-19:

| Texto | Valor |
|---|---|
| Título | Solicite uma conversa sobre esta Home Edition |
| Apoio | Conte como você imagina sua Second Home. Com essas informações, podemos preparar uma conversa mais objetiva sobre esta Home Edition. |
| Etapas | 1 de 4 — Sua Second Home · 2 de 4 — Investimento · 3 de 4 — Decisão · 4 de 4 — Contato |
| Modalidade | "Como você imagina ter sua Second Home?" — Owner: "Você como proprietário do imóvel."; Co-Owner: "Você como acionista da SPE proprietária do imóvel." (`D-B2C-19`) |
| Localização pretendida | "Onde você imagina sua Second Home?" — dica: "Cidade, região ou destino, do jeito que preferir." |
| Dias (Co-Owner) | "Quantos dias por ano, aproximadamente?" — dica: "Para Co-Owner, os dias informados representam apenas uma preferência e não criam Direito de Uso." (P-3) |
| Contato | "Nome" · "Telefone ou WhatsApp" (dica: "Com DDD. Fora do Brasil, inclua o código do país.") · "E-mail" |
| Transparência | "Manifestar interesse não é uma aquisição." (P-3) · "Usaremos seus dados para responder à sua solicitação de conversa e conduzir a pré-qualificação comercial relacionada a esta Home Edition. Saiba mais no Aviso de Privacidade." (D4) |
| Botões | Continuar · Voltar · Solicitar uma conversa |
| Sucesso | Recebemos sua solicitação de conversa. |

### 14.4 Contrato — `POST /v1/interests` (mudanças)

Mesma operação `createInterest` ([OpenAPI](../api/openapi.yaml)); a ordem do §5 vale com estas mudanças:

- **Etapa 1 — Portão** — além de `PUBLIC_SITE` e `INTEREST_WRITES`, em Production o Aviso de Privacidade precisa estar
  `approved` (§14.9). Fechado → `404`.
- **Etapa 2 — Configuração** — acrescenta `INTEREST_REQUEST_HMAC_SECRET` e `INTEREST_CONTEXT_HMAC_SECRET` (segredos próprios,
  ≥ 32 caracteres, sem default — TECH-001). Ausente → `503`.
- **Etapa 4 — Corpo** — até **16 KiB** efetivos: o pior caso válido (todos os textos no limite, escapados em JSON como
  `\uXXXX`) passa de 8 KiB; o teste do pior caso comprova o limite.
- **Etapa 7 — Validação** — corpo da §14.4.1, contexto de apresentação verificado (§14.6) e a variante da dimensão de
  investimento conferida contra a modalidade e o contexto (§14.5).
- **Etapa 8 — Idempotência** — hash chaveado com esquema por registro (§14.8). Registro com chave desconhecida → `503` sem
  efeito.
- **Etapa 9 — Alvo público** — inalterado (leitura como `anon`, ADR-0014) **e** revalidado dentro da transação de escrita
  (§14.8): Home Edition que deixou de ser pública → `404`, nada gravado (`02` §15, item 15).
- **Etapa 10 — Escrita atômica** — reserva da chave → revalidação do alvo → `interest` → `interest_contact` →
   `interest_qualification`, numa transação.

#### 14.4.1 Corpo

Fechado (campo extra → `400`). Textos como no §5.1. A resposta continua `201 { "status": "registered" }`, sem
identificador interno.

| Campo | Regra | Base |
|---|---|---|
| `home_edition_id`, `modality`, `desired_location`, `approx_days`, `origin`, `partner_ref` | como no §5.1 | §5.1, §13 |
| `available_to_start_band` | obrigatório; uma faixa da §14.5 (`up_to_250k` … `not_defined`); nunca valor em reais | REQ-022 |
| `reference_fit` | `within`, `could_consider` ou `above` — **obrigatório** só para Owner quando o contexto traz média apresentada; para Co-Owner ou sem média, ausente ou `null` (senão `not_allowed`) | REQ-022, BR-034 |
| `decision_unit` | `self`, `with_partner_or_family` ou `with_others` | REQ-022 |
| `decision_horizon` | `immediate`, `within_30_days`, `one_to_three_months`, `three_to_six_months`, `six_to_twelve_months`, `over_twelve_months` ou `exploring` | REQ-022 |
| `name` | texto obrigatório, 1–200, mesma normalização de `desired_location` | REQ-022, `03` §3.1 |
| `phone` | obrigatório; até 32 caracteres digitados; aceita formatos humanos — o servidor remove espaços, parênteses, hífens e pontos; depois só `+` inicial opcional e 8–15 dígitos (limite técnico E.164); DDI nunca inferido, Brasil nunca presumido | REQ-022, D-W6 (telefone) |
| `email` | obrigatório; pontas sem espaço; até 254; formato `local@domínio` com ponto no domínio; domínio em minúsculas, parte local preservada | REQ-022 |
| `presentation_context` | obrigatório; até 512 caracteres; contexto assinado emitido pela página (§14.6); assinatura, versão, chave ou Home Edition divergentes → `invalid` | `02` §15, item 14 |

Códigos de campo: `required`, `too_long`, `invalid`, `not_allowed`. A validação do telefone é de formato: não confirma
a existência do número. Erros trazem só nomes e códigos, nunca valores.

### 14.5 Pré-qualificação — Need, Budget, Authority, Timeline

Contexto estruturado para o SDR (BR-041, BR-064), inspirado em BANT adaptado a B2C high-ticket — o termo nunca aparece ao
visitante. **Não** produz score, Hot/Warm/Cold, prioridade, aprovação, aquisição nem agendamento, e nenhuma regra,
ordenação ou agrupamento do software o usa: o SDR interpreta. Códigos semânticos estáveis, independentes da copy, na
**versão 1** da pré-qualificação (`qualification_version = 1`; faixas em reais) — uma mudança de faixas ou de códigos
exige versão nova, para que os registros antigos continuem interpretáveis.

**Need** — já capturado por Home Edition, modalidade desejada, localização pretendida e, no Co-Owner, dias
aproximados. Nenhuma pergunta de motivação nesta wave.

**Budget** — duas perguntas:

- **Faixa de recursos para iniciar** (`available_to_start_band`, Owner e Co-Owner, obrigatória): "Se decidir avançar,
  qual faixa de recursos você teria disponível para iniciar o investimento?" — ajuda: "Essa referência nos ajuda a
  preparar uma conversa mais adequada ao seu momento. Não é uma proposta nem condição comercial."

  | Código | Resposta |
  |---|---|
  | `up_to_250k` | Até R$ 250 mil |
  | `from_250k_to_500k` | Mais de R$ 250 mil até R$ 500 mil |
  | `from_500k_to_1m` | Mais de R$ 500 mil até R$ 1 milhão |
  | `from_1m_to_2_5m` | Mais de R$ 1 milhão até R$ 2,5 milhões |
  | `from_2_5m_to_5m` | Mais de R$ 2,5 milhões até R$ 5 milhões |
  | `above_5m` | Acima de R$ 5 milhões |
  | `not_defined` | Ainda não defini |

  **Semântica da versão 1** (fronteiras sem sobreposição; nenhum valor é armazenado — isto só torna a interpretação
  histórica dos códigos inequívoca): `up_to_250k` ≤ R$ 250 mil · `from_250k_to_500k` > R$ 250 mil e ≤ R$ 500 mil ·
  `from_500k_to_1m` > R$ 500 mil e ≤ R$ 1 milhão · `from_1m_to_2_5m` > R$ 1 milhão e ≤ R$ 2,5 milhões ·
  `from_2_5m_to_5m` > R$ 2,5 milhões e ≤ R$ 5 milhões · `above_5m` > R$ 5 milhões · `not_defined` sem faixa definida.

  Faixa autodeclarada do que o próprio interessado pretende alocar para iniciar: não é renda, patrimônio, comprovação,
  financiamento, preço, aprovação nem capacidade financeira comprovada; nenhum valor exato é gravado. Comercialmente
  corresponde ao capital disponível para iniciar, mas "entrada" não é termo de produto.
- **Comparação com a média apresentada** (`reference_fit`) — **só** para Owner quando a página efetivamente mostrou a
  média projetada (contexto da §14.6), e então obrigatória: "Considerando a média projetada de R$ X desta Home Edition,
  como ela se compara ao investimento total que você considera?" — `within` "Está dentro do que considero investir." ·
  `could_consider` "Posso considerar, mas preciso entender melhor o investimento." · `above` "Está acima do que
  considero investir hoje." Junto, a explicação da média: "Referência aproximada do investimento total projetado para
  materializar uma Second Home desta Home Edition. Não é preço, proposta ou condição comercial." (BR-034). É só uma
  comparação declarada com a referência que o interessado viu — nunca preço Owner.

| Modalidade | Média apresentada | Perguntas de Budget |
|---|---|---|
| `owner` | sim | faixa para iniciar + `reference_fit` |
| `owner` | não | faixa para iniciar |
| `co_owner` | sim ou não | faixa para iniciar (nunca `reference_fit` contra a média total) |

**Co-Owner:** nunca se converte a média total em valor individual nem se divide por qualquer configuração (2, 4, 8,
10). Com média apresentada na página, a etapa 2 mostra a nota: "No Co-Owner, o investimento individual depende da
configuração da Second Home, definida pela Luxtory durante a estruturação. A média projetada da Home Edition não
representa o valor de uma Ação." (BR-034, BR-063). A faixa é informação do interessado, não valor derivado pela Luxtory.
A média apresentada fica registrada também no Co-Owner (edge 14).

**Authority** — `decision_unit`, "Quem participa dessa decisão com você?": `self` "A decisão é minha." ·
`with_partner_or_family` "Decido em conjunto com meu parceiro, parceira ou família." · `with_others` "Outras pessoas
também participam da decisão." Nenhum dado das outras pessoas.

**Timeline** — `decision_horizon`, "Se encontrar uma opção que faça sentido, quando você estaria pronto para avançar?":
`immediate` "Imediatamente" · `within_30_days` "Nos próximos 30 dias" · `one_to_three_months` "Entre 1 e 3 meses" · `three_to_six_months`
"Entre 3 e 6 meses" · `six_to_twelve_months` "Entre 6 e 12 meses" · `over_twelve_months` "Mais de 12 meses" ·
`exploring` "Ainda estou explorando possibilidades". Quem está pronto para avançar agora fica separado de quem pensa em
algumas semanas.

### 14.6 Contexto de apresentação assinado (`02` §15, item 14)

A página emite, no servidor, um **contexto de apresentação** para o formulário — prova de qual referência ela mostrou.
O navegador só o devolve; nunca é confiado como dado do cliente.

- **Conteúdo** (JSON canônico, sem PII): versão do esquema (`v: 1`), id da chave (`k`), `home_edition_id` (`h`) e o id
  da média projetada apresentada ou ausência explícita (`p: null`). Nada de valor, instante ou dado do visitante.
- **Formato:** `<payload base64url>.<assinatura base64url>`; assinatura HMAC-SHA-256 com o segredo próprio
  `INTEREST_CONTEXT_HMAC_SECRET` (`k = "v1"`), sobre um rótulo de domínio fixo + o payload. Comparação em tempo
  constante. Separado do segredo do hash de idempotência e do da pseudonimização de rede: cada segredo, uma finalidade.
- **Emissão:** a mesma leitura pública que desenha o bloco "Média projetada de investimento" da página fornece o id ao
  contexto — o que a página mostra é o que o contexto assina. Sem média vigente → `p: null`.
- **Envio:** assinatura válida, versão `1`, chave conhecida e `h` igual a `home_edition_id`; senão
  `presentation_context: invalid` (a interface pede para atualizar a página). A referência apresentada é registrada
  como veio no contexto: **nunca** substituída pela vigente nem recalculada. Se a média mudou depois da exibição, fica
  a anterior; se nenhuma foi apresentada e uma passou a existir antes do envio, fica "sem referência".
- **Integridade no banco:** `presented_projected_investment_id` é FK para `app.home_edition_projected_investment`, cujas
  linhas não aceitam `DELETE`/`TRUNCATE` e só mudam o fim da vigência (W4.2) — o valor apresentado é reconstruível
  pela FK, sem cópia de `amount_minor`. Um gatilho confere que a referência é da mesma Home Edition do `interest`.
- **Sem validade temporal:** o contexto atesta o que a página apresentou; não expira (não há valor canônico de prazo,
  TECH-001). Reenviar um contexto antigo só registra a referência que de fato foi apresentada naquela Home Edition.
- **Rotação:** possível no futuro com nova chave para emitir e a antiga para verificar; não implementada (sem KMS).

### 14.7 Modelo de dados

`app.interest_contact` — só o necessário ao contato comercial:

| Coluna | Regra |
|---|---|
| `interest_id` | uuid, chave primária e FK `app.interest (id)` — 1:1 |
| `name` | texto normalizado, 1–200 |
| `phone` | obrigatório, `^\+?[0-9]{8,15}$` |
| `email` | texto normalizado, 3–254, `local@domínio` |
| `created_at` | o mesmo instante do `interest` (`Clock`, TECH-110) |

`app.interest_qualification`:

| Coluna | Regra |
|---|---|
| `interest_id` | uuid, chave primária e FK `app.interest (id)` — 1:1 |
| `qualification_version` | `1` — versão dos códigos e das faixas (§14.5) |
| `available_to_start_band` | código de faixa da §14.5 |
| `reference_fit` | nulo ou `within`/`could_consider`/`above`; só com média apresentada |
| `presented_projected_investment_id` | nulo ou FK `app.home_edition_projected_investment (id)` |
| `decision_unit`, `decision_horizon` | códigos da §14.5 |
| `created_at` | o mesmo instante do `interest` |

- Gatilho de inserção (`interest_qualification_guard`): a referência apresentada é da mesma Home Edition do `interest`,
  e `reference_fit` existe **se e somente se** a modalidade do `interest` é Owner e houve média apresentada — em
  qualquer caminho de escrita.
- Ambas: **sem FK** para `party`, `holding`, `membership`, Brand Partner ou parceiro; nada as referencia. `UPDATE` e
  `TRUNCATE` recusados por gatilho; **`DELETE` estruturalmente possível** (sem gatilho), mas **não concedido** ao papel
  de aplicação (D-W6-2 = A). Eliminar uma delas não altera `interest`, a outra nem `public_idempotency_key`.
- RLS ligada; `SELECT` e `INSERT` só para `luxtory_app`; `anon` e `authenticated` sem acesso; fora do PostgREST.
- `app.public_idempotency_key` ganha `hash_scheme` (`sha256` | `hmac_sha256`) e `hash_key_id` (nulo se e somente se
  `sha256`). Linhas existentes ficam `sha256` (W5). Nenhuma chave, segredo ou conteúdo em claro no banco.
- Migrations com timestamp posterior a `20261019210007` (última da W4.2), em ordem: `platform` (esquema do hash) →
  `ownership` (contato) → `ownership` (pré-qualificação).

### 14.8 Idempotência, atomicidade e revalidação

- **Conteúdo do hash:** JSON canônico de `{ surface, input: { interest, contact, qualification } }`, já normalizado,
  com a referência apresentada (não o contexto bruto). Mesma chave + mesmo conteúdo completo → replay; qualquer
  diferença, inclusive só em contato ou em pré-qualificação → `409 ERR_IDEMPOTENCY_CONFLICT`.
- **Esquema (D-W6-1, ADR-0018):** novos registros `hmac_sha256` com `hash_key_id = 'v1'`
  (`INTEREST_REQUEST_HMAC_SECRET`). A verificação usa o esquema e a chave do registro gravado: `sha256` (legado da W5)
  pela semântica do ADR-0017 — o conteúdo agora sempre difere, logo `409`; `hmac_sha256` pela chave de mesmo id; chave
  desconhecida → tentativa não verificável → `503` sem efeito. HMAC é pseudonimização, não anonimização; rotação ou
  descarte do segredo não é eliminação.
- **Transação (`READ COMMITTED`):** reserva da chave → revalidação da Home Edition **dentro da transação**, com trava
  de leitura da linha (`FOR SHARE`) e a visibilidade lida pela própria RLS pública (como `anon`, sem repetir a regra) —
  uma retirada concorrente espera ou é vista → `interest` → `interest_contact` → `interest_qualification`. Home
  Edition fora do público na revalidação → a transação é desfeita (inclusive a chave) e a resposta é `404`: nada é
  gravado. Falha em qualquer etapa → nenhum efeito. Concorrência com a mesma chave → exatamente um `interest`, um
  contato e uma pré-qualificação.
- **Replay** não reavalia a Home Edition (§5, etapa 8) e, depois da eliminação do contato ou da pré-qualificação,
  responde como replay **sem recriar** nada: a manifestação estatística permanece; replay não é caminho para recriar
  PII; nova manifestação = nova tentativa, nova `Idempotency-Key`.
- **Cliente:** a chave acompanha exatamente o conteúdo enviado (padrão da BP1); `409` descarta a chave; falha não
  confirmada preserva dados e chave só em memória.

### 14.9 Portões (defesa em profundidade)

Abrir a coleta exige **todos** ao mesmo tempo; nenhum sozinho abre:

1. site público aberto (`PUBLIC_SITE`, ADR-0014);
2. `INTEREST_WRITES=open` (ausente = fechado em Production);
3. em Production, Aviso de Privacidade `approved` e estruturalmente completo (§14.11);
4. configuração completa (limites, prazo e Upstash ou modo `fake` local, os segredos) e banco permitido no ambiente.

| Superfície | Fechada quando | Efeito |
|---|---|---|
| `POST /v1/interests` | 1–3 | `404`; 4 → `503` |
| Seção "Solicitar uma conversa" na Home Edition | 1–4 | ausente (página como na W4.2) |
| `/privacidade` | Production com site fechado ou Aviso não `approved` | `404` |

Fora de Production (Development, CI), o Aviso `pending` aparece como pendência técnica. O Preview não tem banco
(ADR-0007): a seção não aparece e a escrita responde `503`. Nada é configurado na W6.

### 14.10 Admin — drill-down

Papel Admin exercido com AAL2 (`adminRoleGate('admin')`), como na W5; Super Admin sozinho não acessa. Toda leitura roda
como `luxtory_app` na transação que grava o `admin_read` (TECH-092); o `audit_log` leva só ids, nunca PII.

| Nível | Rota | Mostra | `admin_read` |
|---|---|---|---|
| Agregado (W5/W4.2) | `/admin/interesses` | Home Edition → localização pretendida → modalidade → dias exatos (BR-062), com link para a Home Edition | `interest`, `*` |
| Home Edition | `/admin/interesses/home-editions/[homeEditionId]` | os interesses da Home Edition por localização pretendida → modalidade: data, dias e link — **sem PII** | `interest_group`, id da Home Edition |
| Interesse | `/admin/interesses/[interestId]` | campos do interesse e a ação "Ver contato e pré-qualificação" — **sem PII** | `interest`, id do interesse |
| Contato e pré-qualificação | `/admin/interesses/[interestId]/contato` | **Second Home desejada** (Home Edition, localização pretendida, modalidade, dias no Co-Owner) · **Pré-qualificação** (Recursos para iniciar, Compatibilidade com a média projetada — só quando aplicável, com o valor apresentado —, Decisão, Momento) · **Contato** (nome, telefone, e-mail); "indisponível" quando eliminados | `interest_contact` e `interest_qualification`, id do interesse |

Sem busca, filtro por contato, exportação, edição, eliminação, status, anotação, score ou atribuição — visão
operacional mínima, não um CRM. A localização pretendida não vai à URL (URLs entram nos logs da plataforma); `origin` e
`partner_ref` seguem fora da visão.

### 14.11 Aviso de Privacidade da jornada (`/privacidade`)

1. **Função:** informar o tratamento dos dados da solicitação de conversa; página informativa, sem conversão, na casca
   B2C; acesso pelo link da transparência do formulário.
2. **Conteúdo:** só o texto entregue pela Luxtory depois da validação jurídica — nada inventado (controlador,
   finalidades, bases legais, categorias, retenção, acesso, operadores, compartilhamentos, transferências
   internacionais, direitos do titular, canal).
3. **Modelo:** objeto tipado `pending` | `approved`. `approved` carrega versão, data de aprovação e uma seção por
   tópico; só muda para `approved` depois do checkpoint jurídico/fundador, por commit.
4. **Testes:** um Aviso `approved` tem os 11 tópicos, títulos e parágrafos não vazios, link no canal e nenhum marcador
   de rascunho. **Nunca** afirmam suficiência jurídica: estrutura completa não é validação.
5. **`pending`:** só fora de Production, como pendência técnica; em Production, `404` e coleta fechada (§14.9).

### 14.12 Privacidade, LGPD e go-live

- **Finalidade:** responder à solicitação de conversa e conduzir a pré-qualificação comercial relacionada à Home
  Edition (D4; BR-041, BR-064). Sem marketing, newsletter, campanha, compartilhamento com Brand Partners ou parceiros,
  venda ou cessão; finalidade futura exige nova análise.
- **Base legal:** hipótese LGPD art. 7º, V, a validar pelo jurídico; nada no software a declara correta.
- **Retenção proposta:** até 12 meses sem relação comercial ativa, depois da última interação relevante ou do
  encerramento da oportunidade; depois, eliminação ou anonimização conforme a LGPD, preservadas as hipóteses legais.
  Sem promessa de exclusão imediata nem expurgo automático na W6.
- **PII fora de logs, erros, métricas, respostas e `audit_log`.** Erros do banco nunca são registrados com mensagem
  ou detalhe (o PostgreSQL inclui a linha recusada no detalhe).
- **Inventário técnico** para a revisão jurídica: [`lgpd-interesse.md`](../security/lgpd-interesse.md) — não é
  parecer.
- **Gates de go-live (nenhum feito na W6):** (1) validação jurídica da base; (2) Aviso final `approved`; (3) canal de
  direitos; (4) procedimento operacional de retenção e de exercício de direitos (quem executa, fundamento, verificação
  de identidade quando necessária, auditoria, backups, eliminação × conservação legal) — nunca `DELETE` manual não
  auditado; (5) D2; (6) reavaliação formal da D3 (ADR-0007) antes de PII real; (7) variáveis operacionais, inclusive
  `INTEREST_REQUEST_HMAC_SECRET` e `INTEREST_CONTEXT_HMAC_SECRET`; (8) smoke seguro antes da abertura.

### 14.13 Observabilidade

Evento `interest_registration` (§9) com os mesmos campos; `stage` ganha `idempotency` (registro não verificável →
`503`, `reason: hash_key_unavailable`). Nome, E-mail, Telefone, pré-qualificação, contexto, valores, hash, chave e
mensagens de erro do banco nunca entram no log. A página registra só falhas técnicas de leitura, sem dado.

### 14.14 Acceptance criteria (W6)

- [ ] `[REQ-022]` a solicitação parte da página da Home Edition publicada; contato (nome, telefone, e-mail) e as três
      dimensões obrigatórios; sem página de Interesse separada.
- [ ] `[REQ-022]` faixa de recursos para iniciar obrigatória para Owner e Co-Owner; `reference_fit` obrigatório só
      para Owner com média apresentada e recusado (`not_allowed`) nos demais casos; nenhum valor derivado ou exato.
- [ ] `[REQ-022]` horizonte com `immediate` separado de `within_30_days` e de `one_to_three_months`.
- [ ] Formulário em 4 etapas: Continuar valida a etapa, Voltar preserva, troca de modalidade invalida só o
      incompatível, nada enviado antes do envio final, foco no título da etapa.
- [ ] `[REQ-022]` edge 14: média alterada depois da exibição → a pré-qualificação guarda a apresentada; sem média
      apresentada → fica sem referência mesmo que uma passe a existir; contexto adulterado → `400`.
- [ ] `[REQ-022]` edge 15: Home Edition retirada entre a página e o envio (inclusive dentro da transação) → `404`,
      nenhum `interest`, contato, pré-qualificação ou chave.
- [ ] `[REQ-025]` E2E: o campo de dias aparece só para Co-Owner e é apresentado como preferência.
- [ ] `[REQ-024]` E2E: o sucesso só informa o recebimento da solicitação de conversa — sem aquisição nem agendamento.
- [ ] `[REQ-100]`/`[REQ-101]` formulário e confirmação sem termos proibidos e sem promessa de retorno.
- [ ] `[TECH-056]` replay com o mesmo conteúdo completo; `409` por qualquer campo de contato ou de pré-qualificação;
      falha no contato ou na pré-qualificação → nada; concorrência → 1 + 1 + 1.
- [ ] `[TECH-100]` nenhuma PII, pré-qualificação ou contexto em logs ou erros; corpo de 16 KiB comprovado pelo pior
      caso escapado.
- [ ] Eliminar contato ou pré-qualificação não altera `interest`; replay depois disso não recria.
- [ ] `[TECH-092]` cada leitura do drill-down grava `admin_read`; `audit_log` sem PII.
- [ ] Portões: Production sem Aviso `approved` fica fechada mesmo com `INTEREST_WRITES=open`; Aviso `approved`
      sozinho não abre.
- [ ] Testes do Aviso: estrutura sim, suficiência jurídica nunca.
- [ ] UI: axe 0 a 390 e 1440 px; sem overflow de 320 a 1920 px; teclado; fluxo a 390 px com toque; checklist de
      `communication.md`.

### 14.15 Edge cases (W6)

- Telefone "(61) 99999-9999" → `61999999999`; "+55 61 99999-9999" → `+5561999999999`; letras, `+` no meio ou menos de
  8 / mais de 15 dígitos → `invalid`; vazio ou só espaços → `required`.
- E-mail com domínio em maiúsculas → domínio em minúsculas; dois envios que diferem só nisso na mesma chave → replay.
- Owner com média apresentada sem `reference_fit` → `required`; Owner sem média ou Co-Owner enviando `reference_fit` →
  `not_allowed`; faixa fora da lista ou valor numérico → `invalid`.
- Contexto de outra Home Edition, com assinatura alterada, versão ou chave desconhecidas → `presentation_context:
  invalid`, nada gravado.
- Média projetada encerrada e substituída entre a página e o envio → registra a apresentada (FK preservada).
- Home Edition retirada do público (ou Home Concept que deixa de ser público) entre a página e o envio → `404`; a
  interface informa e oferece a Coleção.
- Registro de idempotência `sha256` (W5) com a mesma chave → conteúdo diferente → `409`.
- Contato eliminado + replay da mesma tentativa → `201` replay; o Admin mostra "Contato indisponível".

### 14.16 Rollout

- Merge só no checkpoint do fundador; migrations e deploy pela CI. Production continua fechada: nenhuma variável,
  segredo ou Aviso `approved` é criado na W6.
- Ativação: runbook em [`docs/how-to/operacao.md`](../how-to/operacao.md) depois dos gates da §14.12.
- Rollback: `down` das migrations testado (`npm run db:check`), fail-closed se houver contato ou pré-qualificação.

## 15. W8 — Formalização e calendário civil

### 15.1 Autoridade e rastreabilidade

Entrega própria: REQ-010/022/024/025/026 e PD-003 (calendar). Fontes: 01 BR-025/032/033/050–054/060–083/107–109; 03 TECH-001/020/026/040/041/051–056/110. Plano e adendo aprovados; execução em docs/plan/w8-formalizacao-calendario-civil.md; ADR-0021.
CANÔNICA é a estrutura e o ato criador; N parties distintas e a resolução CNPJ da SPE são DERIVAÇÕES NECESSÁRIAS; schema, base civil congelada e barreiras são PROPOSTAS W8. Infraestrutura W1/W2/W7 é HERDADA.

### 15.2 Modelo e commands

formalize_acquisition exige Admin AAL2 + basis_ref registrada e usa o executor existente. Owner: exatamente uma party e holding 100%, sem SPE/Ação artificial. Co-Owner: party CNPJ da SPE, forma S.A. fechada, configuração 10/8/4/2, N Ações/holdings/parties distintas equivalentes; identidade institucional registrada excluída dos adquirentes.
N Ações nunca significam N posições para a mesma party. A mesma party pode ser Owner de A e Co-Owner de B. Exclusões temporais por Second Home/party e Ação impedem sobreposições incompatíveis.
Antes do ato, interesse/alocação/administração não criam holdings, Ações ou grants.

Concretização W8: `acquisition` é a extensão 1:1 imutável dos fatos definitivos da Second Home. A seam pública
`AcquisitionCatalog` é a única escritora dessa extensão e do registro posterior `second_home_operation_start`;
ownership orquestra a formalização e persiste SPE/Ações/holdings/grants na mesma transação. A raiz do catálogo não
recebe UPDATE, e os fatos não são duplicados em duas tabelas. A posição de alocação da Ação é técnica, sem determinar
o sorteio W9 ou as rotações W11.

Second Home conserva Home Edition finalizada e versão de Home Concept fixadas na aprovação comercial. A formalização registra localização concreta, modalidade/configuração definitivas e operation_start_date civil; nenhuma dessas informações migra para Home Edition. Campos originais e fatos formalizados são imutáveis. Publicação da Home Edition não é condição para formalizar.
Sem condições financeiras genéricas, preços, descontos, parcelamento, quitação ou dados de contrato digital. basis_ref referencia a evidência do ato e não substitui semântica financeira ausente.

API-first: POST /v1/admin/acquisitions; POST /v1/admin/second-homes/{id}/initial-allocation; /administration; /operation-start. Auxiliares REQ-095 no registro não crítico, mesmo guard/executor/auditoria. Respostas mínimas: id, second_home_id e operation_id.
Inputs estritos; CPF/CNPJ nunca atravessa esses payloads. Erros existentes e mensagens i18n; não incluir bases, payload ou detalhes PostgreSQL em log/erro.

### 15.3 Base civil e primeiro exercício

operation_start_date DATE local usa o timezone IANA já imutável da Second Home. O ano define o primeiro exercício; início após 01/01 exige alocação inicial explícita antes da formalização Co-Owner. Sua proteção após grants é escolha conservadora W8, não nova Business Rule.
Alocação tem configuração, base/exercício, itens por posição técnica 1..N e categorias alta/media, capacidade Luxtory por categoria, basis/operação. É snapshot imutável sem linhas por noite; posição não é ordem de sorteio.
Direitos são iguais em cada categoria. Total N × quantidade por Ação + capacidade Luxtory <= capacidade civil futura da categoria, respeitando limites anuais da configuração. Quantidades são explícitas; zero nunca é inferido, categorias não se compensam e nenhuma proporcionalidade é calculada. Não é obrigatório esgotar toda capacidade parcial.
Calendar enumera noites futuras do exercício desde a base, exclui leap e usa check-in 14h local; ownership relê relógio após locks. Não há fonte de compromisso de noites pré-formalização na base atual. W8 não cria prova externa, Inventário ou calendário paralelo.

### 15.4 Grants

use_right_ledger append-only é CANÔNICO (TECH-026). Subconjunto W8: movement=grant; source=configuration|initial_allocation; stake_id, exercício, categoria alta/media, quantidade e operation_id. FKs/constraint agregada verificam fonte/quantidade e pertencimento à mesma Second Home.
Grant inicial é único por Ação/exercício/categoria e só nasce no ato formalize_acquisition. Owner tem propriedade/capacidade integral pela holding, sem fabricar Ação para encaixá-lo no ledger Co-Owner. 29/02 não recebe grant W8.

### 15.5 Administração e início

second_home_administration registra provider_party_id existente, professional, escopo explicitamente de administração, basis_ref e vigência civil [valid_from,valid_until). Os escopos suportados são professional_administration e full_luxtory_administration, separados de Property Services/Membership. O segundo exige prestador igual à referência institucional Luxtory.
Substituição: novo registro referencia replaces_id; o anterior permanece no histórico, com cobertura efetiva limitada ao início do sucessor. A mesma cobertura não tem dois sucessores. Não há DELETE funcional nem reescrita da base anterior.
Administração profissional em operação Co-Owner: união das coberturas válidas, considerando substituições, contém o período aberto desde operation_start_date. Constraint trigger diferível e lock da raiz protegem início e alterações contra lacunas. Cadeias contínuas são aceitas; somente coberturas finitas não habilitam início, pois W8 não modela encerramento. Extremo aberto requer base real sem termo final; não pressupõe renovação/perpetuidade.
register_second_home_operation_start exige formalização, basis_ref e declaração effective_start_date igual à base congelada, não futura em relação à data local do registro. Preenche uma única vez operation_start_registered_at UTC, referência de base e operation_id. Data divergente falha fechado, sem recalcular/redistribuir grants. O instante do registro não é um instante físico presumido de início.
Não abre reserva/calendário, não sela, não cria custódia, encerramento ou suspensão. Falta de administração não cria consequência econômica.

### 15.6 Identidade institucional e rollout

ownership possui app.luxtory_legal_identity singleton: party CNPJ existente, basis_ref, operação e data; imutável. Migration vazia; provisionamento real posterior restrito/auditado. Nenhum nome/documento/env identifica Luxtory. Ausência em Co-Owner => ERR_PARAMETER_MISSING 422 pelo pipeline; nenhuma titularidade é criada.
ACQUISITION_WRITES: somente open habilita; closed/ausente/valor inválido fecham. Local/CI abertura explícita por configuração injetada; Preview permanece sem banco canônico. Política única opt-in na entrada compartilhada Admin, depois da autorização e antes de idempotência/efeitos. REST 503 ERR_UNAVAILABLE, Server Action indisponível. Sem variável criada/aberta nesta Wave.
Leituras e register_second_home anterior independem do gate. Production não recebe dados reais/sintéticos, PII_*, identidade institucional ou convites.

### 15.7 Banco, concorrência e leitura

Formalização all-or-nothing na mesma transação para fatos definitivos, aquisição, SPE/Ações/holdings, grants, auditoria e evento ownership.initial_draw_scheduled. Falha desfaz efeitos; executor preserva seu registro separado de recusa funcional. Replay não duplica efeito nem evento; outra chave concorrente não formaliza novamente.
Preâmbulo: trava compartilhada consultiva da staff_role exata que autorizou, releitura de user/admin/revogação; revogação obtém exclusiva correspondente antes do FOR UPDATE. Chave app.staff_role:<id>, hashtextextended(...,0), sem UPDATE/EXEC de staff concedido à aplicação.
Depois: preâmbulo do catálogo Brand Partner/autorização Investor; raiz Second Home; Ações em ordem quando existentes, respeitando subconjunto TECH-053. Deadlock/timeout segue retry vigente. Não mudar semântica de commands anteriores.
RLS exige representação vigente + holding aplicável. Grants SELECT por coluna e consultas explícitas; bases/operation_id/refs administrativas/institucional e outros Co-Owners não são dados do Titular. PII permanece na W7; não replicar cifra ou HMAC. Sem grants de escrita authenticated/anon.

A projeção Admin auditada usa `repeatable read` para apresentar fatos do mesmo snapshot, sem locks de formalização.
O parâmetro de navegação de sucesso só indica qual operação verificar: o aviso exige `operation` commitada, de um dos
quatro commands W8 e da mesma Second Home. UUID desconhecido, ato rejeitado, outro command ou outra Second Home não
produzem confirmação. Nenhum identificador adicional de operação integra a projeção do Titular.

### 15.8 Fronteiras e aceite

W9: consumidor do evento/sorteio/PD-011/aleatoriedade/evidências. W10: second_home_date, selagem, custódia e Inventário/REQ-040/INV-2/3. W11: balance/consume/restore/expire/correction, grants operacionais futuros/leap, janelas e rotações/REQ-030/031/032/033/039/PD-004/INV-4/5. A validação parcial referencia REQ-033, sem declarar sua entrega operacional.
Testes: REQ-010 mesma party em papéis por Second Home; REQ-024 único Owner/100%/derivação; REQ-025 ausência prévia/ato criador; REQ-026 equivalência/cardinalidade/imutabilidade/distinção de entidades; REQ-022 trava de modalidade; PD-003/EC-3 e TECH-110 calendário até 2100/fusos/administração/alocação.
PostgreSQL real comprova rollback, cardinalidade, CPF-SPE, Luxtory, RLS de linhas e colunas, TOCTOU nas duas ordens, duas formalizações, replay/conflito, administração sem lacunas. UI Admin com origem/localização/modalidade/configuração/adquirentes/SPE/base/admin/alocação/basis; DS/i18n, checkpoint 390/1440, axe 0 e overflow 0 320..1920.
Gates integrais: npm run verify; npm run test:e2e; npm run trace -- --expect REQ-010,REQ-022,REQ-024,REQ-025,REQ-026,PD-003. Status W8 somente no closeout após merge autorizado.

## 16. W9 — Sorteio auditável da ordem inicial

### 16.1 Autoridade e rastreabilidade

Dona: PD-011 (metade do sorteio; a auditoria de commands veio da W1) e TECH-093. Fontes: 01 BR-100, BR-102, BR-104,
BR-106, BR-109; 02 PD-011, REQ-032 (dona W11), REQ-097 (dona W30); 03 TECH-001, TECH-002, TECH-020, TECH-051,
TECH-052, TECH-090–TECH-093, TECH-100, TECH-110. Plano aprovado pelo fundador em 2026-10-28; execução em
[`docs/plan/w9-sorteio-auditavel.md`](../plan/w9-sorteio-auditavel.md); decisão em
[ADR-0022](../adr/0022-sorteio-auditavel-e-elegibilidade-temporal-do-outbox.md). A formação da operação de BR-100 é a
formalização (TECH-020, BR-109): o sorteio não espera o registro de início da operação.

Escopo: o sorteio agendado por `formalize_acquisition` em toda Second Home Co-Owner — compromisso, beacon, `fy-v1`,
posição inicial por Ação, evidência no Admin e na Área do Titular e registro da notificação do resultado. Fora:
rotação, janelas e abertura em 15/09 (W11), selagem e custódia (W10), selo e ancoragem da auditoria (W30), interface e
catálogo de notificações (W30), novo sorteio, correção manual de resultado e Owner (sem sorteio). Nenhum command ou job
novo (TECH-051, TECH-090): o sorteio é o efeito agendado da formalização, concluído por consumidores do outbox.

### 16.2 Protocolo (TECH-093)

Três transações, cada uma um consumidor idempotente do outbox (recibo na mesma transação):

1. `ownership_initial_draw_commit` recebe `ownership.initial_draw_scheduled` (W8). Congela os participantes — as N
   Ações da aquisição na ordem crescente de `allocation_position`, que é a ordem determinística do passo 1 —, gera
   `seed` de 32 bytes por CSPRNG, grava `commitment = SHA-256(seed)`, a rodada alvo `R` do beacon e o prazo de commit,
   audita e enfileira `ownership.initial_draw_committed`, elegível só depois da rodada.
2. `ownership_initial_draw_reveal` recebe `ownership.initial_draw_committed`. Obtém a rodada `R` verificada, calcula
   `key = SHA-256(seed ‖ randomness)`, aplica `fy-v1`, grava a revelação e as posições, audita e enfileira
   `ownership.initial_draw_completed`.
3. `ownership_initial_draw_notification` recebe `ownership.initial_draw_completed` e registra a notificação do
   resultado (REQ-097) para cada pessoa ou empresa titular vigente das Ações sorteadas.

Uma aquisição tem no máximo um sorteio (`UNIQUE`), sem caminho de novo sorteio. Seed e `R` ficam fixos no compromisso:
toda retentativa da revelação recalcula o mesmo resultado.

**`fy-v1`** (definição fixa; mudança exige `fy-v2`). Participantes `P[0..n−1]`; `seed` S; `B` = `randomness` da rodada
verificada (32 bytes, `SHA-256` da assinatura); `K = SHA-256(S ‖ B)`. Começa com `a = [0..n−1]`; para `i` de `n−1` até
`1`: `j = U(K, i, i+1)` e troca `a[i]` com `a[j]`. `U(K, i, m)`: `c = 0`; repete `h = HMAC-SHA256(K, u32be(i) ‖ u32be(c))`,
`x` = `h` como inteiro sem sinal big-endian; se `x < 2²⁵⁶ − (2²⁵⁶ mod m)` devolve `x mod m`, senão `c = c + 1`. O
contador recomeça em 0 a cada posição. A posição `p` (1..n) é da Ação `P[a[p−1]]`. Vetor fixo calculado por uma
implementação independente: [referência de verificação](../reference/sorteio-inicial.md).

**Beacon.** Port `RandomnessBeacon`; adaptador da rede drand quicknet com `ChainInfo` fixado no código (chain hash
`52db9ba7…e971`, chave pública, `genesis_time` 1692803367, período 3 s, esquema `bls-unchained-g1-rfc9380`), nunca
obtido de um relay. A verificação usa `fetchBeacon` do `drand-client` 1.4.2 (ADR-0004) com um `ChainClient` próprio:
`fetch` nativo com prazo e relays públicos em sequência fixa, que não precisam ser confiáveis. A biblioteca confere
rodada, `randomness = SHA-256(assinatura)` e a assinatura BLS; o adaptador confere ainda rodada igual a `R`, tamanhos e
constantes. Rodada futura (`425`/`404`), erro de rede, `5xx`, prazo esgotado ou assinatura inválida deixam o sorteio
pendente, sem nada gravado. O adaptador é testado com rodadas reais gravadas e suas versões adulteradas; os testes de
banco dos consumidores injetam pelo port um beacon que só existe no código de teste (o banco exige rodada futura pelo
seu próprio relógio). Nenhum adaptador falso existe no código de produção.

### 16.3 Anterioridade do compromisso e limites de tempo

O compromisso, os participantes e `R` precisam estar duráveis antes de a rodada existir. Garantias da W9:

- O consumidor de commit arma `transaction_timeout = DRAW_TRANSACTION_TIMEOUT_MS` na própria transação, lê o relógio do
  banco e define `commit_deadline` = esse instante + o mesmo prazo; `R` é a primeira rodada com
  `t(R) ≥ commit_deadline + DRAW_BEACON_LEAD_SECONDS`, `t(R) = genesis + (R − 1) × 3 s`.
- O banco recusa o compromisso fora destas regras, independentemente do código da aplicação: `t(R)` igual à fórmula;
  `recorded_at < commit_deadline < t(R)`; `recorded_at` dentro da transação; prazo ainda não vencido na inserção; e um
  gatilho diferido **no COMMIT efetivo** recusa o commit se `clock_timestamp() > commit_deadline`. Uma transação lenta
  não torna durável um compromisso tardio; o `transaction_timeout` libera conexão e locks como salvaguarda operacional.
- A revelação só é aceita com `clock_timestamp() ≥ t(R)`, rodada igual a `R`, `randomness = SHA-256(assinatura)` e
  `SHA-256(seed) = commitment`; as posições formam uma permutação exata dos participantes.

Limites residuais até a W30 (aceitos pelo fundador, D5): essas são garantias do banco controlado pela Luxtory, não prova
independente. Um superusuário pode contornar gatilhos e reescrever um compromisso ainda não revelado; o compromisso não
é notificado (o REQ-097 só lista o resultado); seed fica legível para quem opera o banco antes da revelação (sem permitir
enviesar o resultado); quicknet descontinuado deixa o sorteio pendente.

Orçamentos (runbook, sem default — TECH-001; lidos só ao processar o evento, ausentes ou inválidos deixam o evento
pendente sem efeito):

| Variável | Uso |
|---|---|
| `DRAW_TRANSACTION_TIMEOUT_MS` | `transaction_timeout` das transações de commit e revelação; largura do prazo de commit |
| `DRAW_BEACON_TIMEOUT_MS` | orçamento total de obtenção e verificação da rodada, somando os relays; deve ser menor que o anterior |
| `DRAW_BEACON_LEAD_SECONDS` | folga mínima entre o prazo de commit e `t(R)` (latência final do commit e diferença de relógio) |

Durante a chamada ao beacon a transação mantém só a linha do próprio evento (`FOR UPDATE`; os demais despachantes
pulam com `SKIP LOCKED`) e o recibo; nenhum lock de domínio nem do TECH-053. Depois de uma falha do beacon, as
obtenções seguintes falham sem rede pelo mesmo orçamento, para que uma varredura não multiplique o tempo de espera.

### 16.4 Evolução do outbox (platform, ADR-0022)

- `app.outbox.available_at` (nulo = imediato; todas as linhas e produtores anteriores inalterados). O store seleciona só
  eventos com `available_at` nulo ou vencido, no SQL antes de ORDER/LIMIT/locks, como o filtro de tipos do ADR-0021:
  evento futuro fica pendente sem tentativa, erro, recibo nem vaga no lote.
- Ordem de seleção: `attempts`, `occurred_at`, `id`. Um evento que falha repetidamente cede a vez a eventos com menos
  tentativas; nenhuma falha recorrente impede indefinidamente eventos independentes.
- Falha que ocorre no COMMIT da transação do evento (por exemplo, constraint diferida) é registrada em transação própria
  (`attempts`, `last_error`) e a varredura continua; sem evento travado, o erro continua propagando (banco indisponível).
- Seams para consumidores, no molde de `recordNotification`: `enqueueOutboxEvent` (mesma deduplicação dos commands,
  `availableAt` opcional, `operation_id` obrigatório) e `recordSystemAudit` (papel `system`, `event_type 'command'`).
  Commands e executor não mudam.

### 16.5 Dados, RLS e evidência

Migrations `platform_outbox_available_at` e `ownership_initial_draw`. Tabelas só de inserção (`forbid_change`, sem
TRUNCATE), `luxtory_app` com SELECT/INSERT: `initial_draw` (aquisição única, Second Home, `operation_id` da formalização,
evento de origem, `fy-v1`, chain, N, `commitment`, `R`, `t(R)`, `recorded_at`, `commit_deadline`),
`initial_draw_participant` (ordinal = `allocation_position`, Ação), `initial_draw_seed`, `initial_draw_reveal`
(rodada, assinatura, `randomness`, `revealed_at`, evento de origem) e `initial_draw_position` (posição → Ação). O
rollback recusa descartar sorteios ou eventos agendados.

Titular (RLS de delegação vigente + holding da Second Home, SELECT por coluna): vê o sorteio da Second Home de que é
titular — participantes como Ações por identificador não pessoal com a sua destacada, método, compromisso, `R`, `t(R)`,
prazo de commit e, só depois da revelação, seed, beacon e resultado completo (D1). Nunca vê pessoas ou empresas de
outros Co-Owners, `operation_id` nem eventos. Admin: a mesma evidência na página de formalização, com a leitura
auditada (`admin_read`). Página do Titular: `/titular/sorteios/{drawId}`, com entrada na Área do Titular.

Notificação: `ownership.initial_draw_result` em `app.notification`, um registro por pessoa ou empresa titular vigente,
dados só com ids. A interface de notificações é da W30.

### 16.6 Edge cases

Owner nunca gera sorteio. Evento duplicado ou reentregue não cria segundo compromisso, revelação ou notificação. Beacon
fora do ar, relay adulterado ou rodada ainda não publicada mantêm o sorteio pendente. Configuração ausente mantém o
evento agendado pendente, sem compromisso. Compromisso que perde o prazo de commit é desfeito e o evento é tentado de
novo com outra seed e outra rodada (nenhuma informação da rodada existia). Eventos pendentes anteriores ao deploy
(conferência D4 antes do merge) seriam processados normalmente pelo consumidor.

### 16.7 Acceptance criteria (W9)

Títulos exatos, conferidos como aprovados em `reports/vitest.json` e `reports/playwright.json` no fechamento:

| Critério | Arquivo | Título |
|---|---|---|
| AC1 `[PD-011]` | `tests/features/ownership/initial-draw-read.db.test.ts` | `[PD-011][TECH-093] a evidência mostra participantes, método e resultado ao Admin e ao Titular, sem identificar outros Co-Owners` |
| AC1 `[PD-011]` | `tests/e2e/initial-draw.spec.ts` | `[PD-011] Admin e Titular veem a evidência do sorteio inicial em 390 px com toque` |
| AC2 `[TECH-093]` | `tests/features/ownership/application/initial-draw-algorithm.test.ts` | `[TECH-093] vetor fixo reproduz exatamente fy-v1` |
| AC2 `[TECH-093]` | `tests/features/ownership/application/initial-draw-algorithm.test.ts` | `[TECH-093] índice uniforme por rejection sampling, sem viés de módulo` |
| AC3 `[TECH-110]` | `tests/features/ownership/initial-draw-consumers.db.test.ts` | `[TECH-110][TECH-093] beacon fora do ar deixa o sorteio pendente, sem resultado parcial` |

Complementares: anterioridade sob atraso transacional (`[TECH-093] o compromisso só se torna durável antes do prazo que
antecede a rodada`), rodadas reais e adulteradas, despachantes paralelos (`[CONC-12]`), elegibilidade temporal, ordem por
tentativas e falha no COMMIT do outbox, Owner sem sorteio, configuração ausente, RLS, imutabilidade e rollback.

Gates: `npm run verify`; `npm run test:e2e`; `npm run trace -- --expect PD-011,TECH-093` e conferência dos títulos acima.
Status W9 só no fechamento, após merge autorizado.
