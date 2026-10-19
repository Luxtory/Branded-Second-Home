# Spec: ownership — Interesse (W5)

> Status: W5 — Interesse (núcleo), em implementação (2026-10-19)
> Owner: Luxtory
> Related ADRs: [ADR-0017](../adr/0017-idempotencia-de-mutacoes-publicas-nao-criticas.md),
> [ADR-0014](../adr/0014-discovery-publico-leitura-anonima-csp-e-publicacao.md),
> [ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md) §7, [ADR-0006](../adr/0006-acesso-a-dados.md)
> Threat model: [`docs/security/threats/ownership.md`](../security/threats/ownership.md)
> Plano: [W5 em `implementation-waves.md`](../plan/implementation-waves.md#wave-5--interesse-núcleo), com a revisão
> aprovada pelo fundador em 2026-10-19.

Módulo `ownership` do TECH-011. A W5 entrega só a manifestação de interesse; formalização, Ação, holding e Direito de
Uso chegam nas W8 em diante. Esta spec cita os canônicos (`01` v10.1, `02` v4.2, `03` v3.14) e não os parafraseia.

## 1. Goal

Registrar a manifestação de interesse com os campos canônicos do `03` §3.1 (`interest`) — Concept, Edition opcional,
modalidade, região, `approx_days` e origem — sem gerar direito, prerrogativa nem efeito econômico, e dar ao Admin a
visão agrupada que orienta a Luxtory (BR-062).

- **Dona**: REQ-023 (origem e parceiro registrados sem prerrogativa).
- **Complementa**: REQ-022 (interesse antes da Edition), REQ-024 (interesse Owner não é aquisição), REQ-025 (dias são
  preferência; só a formalização cria Ação e Direito de Uso).
- **TECH**: TECH-001, TECH-056 (`POST` + `Idempotency-Key`), TECH-100 (validação, rate limit, PII fora dos logs, CSRF),
  TECH-092 (auditoria da leitura administrativa).
- **BR**: BR-030, BR-032, BR-040–BR-043, BR-050, BR-060, BR-062, BR-065.

## 2. Non-goals

- Formulário público, campos de contato e qualificação, consentimento e aviso de privacidade: W6, bloqueada por `P-3`.
  A W5 grava só os campos canônicos — nenhum dado de contato.
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

- Como visitante, quero manifestar interesse num Concept publicado — com ou sem Edition — como Owner ou Co-Owner,
  informando a região e, como Co-Owner, a necessidade aproximada de dias, sem que isso me conceda qualquer direito.
- Como Admin, quero ver os interesses agrupados por Concept, região e modalidade, com os dias aproximados exatos
  informados pelos Co-Owners, para que a Luxtory avalie composições (BR-062–BR-064).

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
   true`); conteúdo diferente → `409 ERR_IDEMPOTENCY_CONFLICT`. O replay não reavalia o Concept.
9. **Alvo público** — Concept visível no Discovery (leitura como `anon` sob RLS, ADR-0014: Brand Partner com exposição
   autorizada e não encerrada + versão aprovada — BR-015, BR-021, REQ-096). Edition, se informada, visível e do mesmo
   Concept. Senão → `404 ERR_NOT_FOUND` (inexistente e não publicado respondem igual). Modalidade não oferecida pela
   Edition → `400` (`modality: not_allowed`).
10. **Escrita atômica** — numa transação: reserva da chave (`app.public_idempotency_key`) + inserção em `app.interest`.
    Corrida com a mesma chave → uma única linha; a outra tentativa vira replay ou conflito.
11. **Resposta** — `201 { "status": "registered" }`, sem identificador interno.

| HTTP | Código | Condição |
|---|---|---|
| 201 | — | Interesse registrado, ou replay da mesma tentativa (`idempotency-replayed: true`) |
| 400 | `ERR_VALIDATION` | JSON/schema/campo/chave inválidos; F2a/F2b violadas (`fields` só com nome e código) |
| 403 | `ERR_PERMISSION` | `Origin` ausente ou de outro host |
| 404 | `ERR_NOT_FOUND` | Escrita fechada neste ambiente; Concept ou Edition não publicados, inexistentes ou de outro Concept |
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
| `concept_id` | uuid, obrigatório | BR-030, `03` §3.1 |
| `edition_id` | uuid, opcional (ausente ou `null` = interesse no Concept) | REQ-022, BR-030 |
| `modality` | `owner` ou `co_owner`, obrigatório; com Edition, entre as modalidades que ela oferece (F2a) | BR-032 |
| `region` | texto obrigatório, 1–200 | REQ-024, REQ-025 |
| `approx_days` | `co_owner`: obrigatório, inteiro positivo, sem teto de negócio (limite de representação: inteiro de 32 bits); `owner`: ausente ou `null` (F2b) | REQ-025, BR-060 |
| `origin` | texto opcional, até 200; vazio = ausente | REQ-023, BR-040–BR-043 |
| `partner_ref` | texto opcional, até 200; vazio = ausente | REQ-023, BR-042 |

Códigos de campo: `required`, `too_long`, `invalid`, `not_allowed` (`approx_days` para Owner; modalidade que a Edition
não oferece).

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
| `concept_id` | FK `app.concept` |
| `edition_id` | opcional; FK composta (`edition_id`, `concept_id`) → `app.edition (id, concept_id)` |
| `modality` | `owner` ou `co_owner` |
| `region`, `origin`, `partner_ref` | texto já normalizado; `region` 1–200, os outros nulos ou 1–200 |
| `approx_days` | `integer > 0`; não nulo **se e somente se** `modality = 'co_owner'` |
| `created_at` | instante do `Clock` da aplicação (TECH-110) |

Invariantes:

- **Nunca gera direito** (REQ-025, BR-060, BR-065, REQ-024/BR-050): nenhuma tabela de aquisição, Ação, Direito de
  Uso, holding, party, calendário, inventário, booking, Crédito ou efeito econômico referencia ou é alterada pelo
  interesse. Só a formalização (W8) cria Ação e Direito de Uso.
- **Sem prerrogativa** (REQ-023): `origin` e `partner_ref` não entram em nenhuma regra, ordenação, autorização ou
  agrupamento.
- **F2a no banco**: gatilho `interest_modality_offered` recusa, na inserção, modalidade que a Edition não oferece.
- **Imutável**: `UPDATE`, `DELETE` e `TRUNCATE` recusados.
- **Acesso**: RLS ligada, política só para `luxtory_app` (ADR-0010 §7); `anon` e `authenticated` não leem nem gravam.
  Fora do PostgREST (Data API desligada, ADR-0006).

`app.public_idempotency_key` (`platform`, ADR-0017): `surface` (`interest`), chave UUID em minúsculas, hash SHA-256
do conteúdo validado e normalizado, `created_at`. Chave primária (`surface`, `idempotency_key`); só inserção; nenhum
dado do visitante além do hash.

### Admin — visão agrupada

`/admin/interesses`, papel Admin exercido (`adminRoleGate('admin')`). Leitura como `luxtory_app` na mesma transação que
grava o `admin_read` (TECH-092, ADR-0010 §7; objeto `interest`, `*`).

- Agrupamento não destrutivo: **Concept → região → modalidade** e, dentro de `co_owner`, os **valores exatos de
  `approx_days`** com a contagem de cada valor (BR-062: Concept, região e necessidade aproximada de uso; modalidade
  pedida pelo plano). Sem faixas, buckets ou algoritmo. `owner` não tem `approx_days`.
- Região agrupada pelo texto registrado (já normalizado); nenhuma taxonomia de regiões.
- Concept identificado pelo título e pela marca (consulta pública do módulo `catalog`, sem acesso às tabelas dele).
- A visão não mostra registros individuais, `origin` nem `partner_ref` (nenhum uso definido na W5).
- Estado vazio explícito; nenhum valor presumido (TECH-001).

## 6. Acceptance criteria

- [ ] `[REQ-023]` origem e `partner_ref` registrados como metadados, sem prerrogativa: o registro altera só `interest`
      e a chave de idempotência pública; não cria Brand Partner, grant, vínculo nem ordem.
- [ ] `[REQ-025]` `approx_days` nunca vira Ação nem Direito de Uso: nenhuma tabela de direitos, calendário, inventário,
      booking, Créditos ou economia é alterada; obrigatório para `co_owner`, recusado para `owner`.
- [ ] `[REQ-022]` interesse sem Edition é aceito; com Edition, a modalidade precisa ser oferecida (F2a).
- [ ] `[TECH-100]` excesso de requisições → `429` sem efeito; limitador indisponível → `503` sem efeito; `origin`,
      `partner_ref` e região nunca em logs ou mensagens de erro.
- [ ] `[TECH-056]` replay com a mesma chave e o mesmo conteúdo; conflito com conteúdo diferente; concorrência com a
      mesma chave → exatamente um interesse.
- [ ] `[TECH-092]` a leitura do Admin grava `admin_read`.
- [ ] Contrato OpenAPI `createInterest`; `npm run trace -- --expect REQ-023`.

(Suíte da W5: `tests/features/ownership/`, `tests/migrations/ownership.db.test.ts` e
`tests/e2e/interest.spec.ts`.)

## 7. Edge cases

- Concept sem Edition → aceito (REQ-022). Edition de outro Concept → `404`.
- Edition `owner` com interesse `co_owner` (ou o inverso) → `400 modality: not_allowed`; o interesse no Concept sem
  Edition continua possível (BR-030).
- Concept que deixa de ser público (encerramento, BR-021) → novas manifestações `404`; replays de tentativas já
  registradas seguem `201`. Corrida entre a checagem pública e a inserção é benigna: interesse não é uso de marca nem
  direito; a modalidade da Edition é revalidada pelo gatilho na inserção.
- Recusas (validação, alvo, conflito) não consomem a chave: só o sucesso a grava, na transação do interesse.
- Mesma chave em paralelo → uma linha; as demais tentativas recebem replay (mesmo conteúdo) ou `409`.
- Corpo sem `Content-Length` ou com valor falso → limite pelos bytes recebidos.
- `approx_days` `0`, negativo, decimal, texto ou acima do inteiro de 32 bits → `invalid`.
- `region` só com espaços → `required`; com controle C0 → `invalid`.
- Preview: sem `DATABASE_URL` (ADR-0007), a escrita responde `503` — validação em PostgreSQL local e na CI.

## 8. Security considerations

STRIDE completo em [`docs/security/threats/ownership.md`](../security/threats/ownership.md).

- **Authn/Authz**: escrita pública sem conta; leitura só staff Admin AAL2 com `admin_read`.
- **Input validation**: schema fechado (Zod) no servidor, corpo limitado, UUIDs, texto normalizado; o banco reforça
  enums, limites, F2a/F2b e a relação Edition–Concept.
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

- `P-3` (W6): campos de contato/qualificação, base LGPD, consentimento e aviso — decisão de produto do fundador.
- Exibição de `origin`/`partner_ref` ao Admin e retenção das chaves de idempotência pública: sem uso definido na W5.

## 12. References

- Canônicos: `01` BR-030–BR-033, BR-040–BR-043, BR-050, BR-060–BR-065; `02` REQ-022–REQ-025; `03` §3.1 (`interest`),
  TECH-001, TECH-002, TECH-056, TECH-092, TECH-100, ADR-006.
- ADR-0017 (idempotência pública não crítica), ADR-0014, ADR-0010 §7, ADR-0008, ADR-0006, ADR-0004 (Upstash).
- Spec `catalog` §13 (visibilidade pública) e §14.4 (borda das escritas públicas da BP1).
