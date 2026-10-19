# Threat Model: ownership — Interesse (W5)

- **Date**: 2026-10-19
- **Author(s)**: Engenharia (W5)
- **Status**: Reviewed (W5)
- **Scope**: `POST /v1/interests` (escrita pública sem conta), `app.interest`, `app.public_idempotency_key` e a visão
  `/admin/interesses`
- **Linked spec**: [`docs/specs/ownership.md`](../../specs/ownership.md)
- **Linked ADR(s)**: [ADR-0017](../../adr/0017-idempotencia-de-mutacoes-publicas-nao-criticas.md),
  [ADR-0014](../../adr/0014-discovery-publico-leitura-anonima-csp-e-publicacao.md),
  [ADR-0010](../../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md) §7, ADR-0004 (Upstash)

## 1. Overview

A W5 abre a primeira escrita pública **persistida** sem conta: o visitante registra uma manifestação de interesse num
Concept publicado (campos canônicos do `03` §3.1). Não há dado de contato (W6, `P-3`), mas há campos de texto livre
(`region`, `origin`, `partner_ref`) que podem receber texto pessoal digitado. A escrita passa por portão, origem,
limites de corpo, rate limit distribuído (Upstash, reutilizado da BP1) e idempotência atômica no PostgreSQL. A leitura
é só do staff Admin, auditada.

## 2. Assets

- Integridade do registro de interesse e das invariantes "interesse nunca gera direito" (REQ-025) e "sem
  prerrogativa" (REQ-023).
- Disponibilidade do banco e da aplicação diante de escrita anônima (custo do Supabase Free, D2).
- Texto livre do visitante (possível PII digitada) — fora de logs, erros e respostas.
- Segredo da pseudonimização da origem de rede (`BRAND_PARTNERS_CONTACT_HMAC_SECRET`) e credenciais Upstash.
- Confidencialidade da existência de Concepts não publicados (BR-015) e da demanda agregada (só staff).

## 3. Actors

| Actor | Trust level | Notes |
|---|---|---|
| Visitante anônimo | untrusted | alcança só `POST /v1/interests`; todo campo é não confiável |
| Bot / atacante externo | hostile | volume, enumeração, injeção, replay de chaves |
| Admin (AAL2, papel exercido) | medium | lê a visão agrupada; cada leitura grava `admin_read` |
| Vercel (plataforma) | high | escreve `x-real-ip`; fonte única da origem de rede |
| Upstash Redis | medium | só contadores com expiração; nunca decide estado |

## 4. Data flow diagram

```mermaid
flowchart LR
  visitor[Visitante] -.trust boundary.-> route[POST /v1/interests]
  route -.trust boundary.-> redis[(Upstash: contadores)]
  route --> catalog[catalog: leitura pública como anon]
  route -.trust boundary.-> db[(PostgreSQL: interest + public_idempotency_key)]
  admin[Admin AAL2] -.trust boundary.-> page[/admin/interesses]
  page --> db
```

## 5. STRIDE analysis

| Component | S | T | R | I | D | E | Notes |
|---|---|---|---|---|---|---|---|
| `POST /v1/interests` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | anônimo por definição (S aceito); origem do mesmo host contra CSRF |
| Rate limit (Upstash) | ✓ | — | — | ✓ | ✓ | — | identidade de rede só da plataforma; pseudônimo HMAC com separação de domínio |
| `app.interest` | — | ✓ | ✓ | ✓ | ✓ | ✓ | constraints, gatilhos, só inserção, RLS só `luxtory_app` |
| `app.public_idempotency_key` | — | ✓ | — | ✓ | ✓ | — | só hash; chave UUID; só inserção |
| `/admin/interesses` | ✓ | — | ✓ | ✓ | — | ✓ | guard AAL2 + papel Admin; `admin_read` |

## 6. Threats (prioritized)

### T-401 [MEDIUM] Denial of service — inundação de registros anônimos

- **Vector**: bot envia manifestações em volume para encher o banco (plano Free) ou degradar a aplicação.
- **Likelihood**: Medium · **Impact**: Medium · **Risk**: Medium
- **Mitigation**:
  - Code: limite por origem de rede (IPv6 reduzido ao /64) e global, contando também as tentativas recusadas depois;
    limitador antes de qualquer acesso ao banco; falha fechada (`503`) sem Redis, com timeout próprio; corpo limitado a
    8 KiB pelos bytes recebidos; recusas não gravam nada (ADR-0017).
  - Config: limites e prazos sem default (TECH-001), definidos pela operação; portão `INTEREST_WRITES` fechado em
    Production até a ativação; proteção de borda da Vercel.
  - Process: D2 (Supabase Pro) antes da coleta produtiva.
- **Owner**: Engenharia · **Tracking**: W5

### T-402 [MEDIUM] Tampering / Elevation — interesse usado como direito ou prerrogativa

- **Vector**: cliente envia `approx_days`, `origin` ou `partner_ref` para obter prioridade, atribuição comercial ou
  vínculo (REQ-023, REQ-025).
- **Likelihood**: Medium · **Impact**: High · **Risk**: Medium
- **Mitigation**:
  - Code: nenhuma tabela de direitos, calendário, inventário, booking, Créditos ou economia referencia `interest`; o
    registro altera só `interest` e a chave pública (teste `[REQ-023]`/`[REQ-025]` por diferença de tabelas);
    `origin`/`partner_ref` sem FK, sem enum, fora de qualquer regra, ordenação ou agrupamento; `approx_days` só para
    `co_owner` (CHECK + schema).
  - Process: BP2/W8 não podem usar esses campos como fonte (spec `ownership` §5.1).
- **Owner**: Engenharia · **Tracking**: W5

### T-403 [MEDIUM] Information disclosure — texto pessoal em logs e erros

- **Vector**: visitante digita nome/telefone em `region`, `origin` ou `partner_ref`; o valor vaza por log, erro ou
  resposta.
- **Likelihood**: Medium · **Impact**: Medium · **Risk**: Medium
- **Mitigation**:
  - Code: log só com `stage`, `status`, `duration_ms` e código de motivo; `ERR_VALIDATION` só com nome e código do
    campo; resposta `201` sem eco nem id; teste de log sem valores; `no-store`.
  - Config: leitura restrita ao Admin AAL2; a visão agrupada não mostra registros individuais nem `origin`/`partner_ref`.
- **Owner**: Engenharia · **Tracking**: W5

### T-404 [LOW] Information disclosure — enumeração de Concepts não publicados

- **Vector**: atacante varia `concept_id`/`edition_id` para descobrir Concepts ou Editions não publicados (BR-015).
- **Likelihood**: Low · **Impact**: Medium · **Risk**: Low
- **Mitigation**:
  - Code: alvo resolvido pela leitura pública como `anon` sob RLS (ADR-0014); inexistente, não publicado e de outro
    Concept respondem o mesmo `404`; ids são UUID; rate limit.
- **Owner**: Engenharia · **Tracking**: W5

### T-405 [LOW] Tampering — reuso ou colisão de `Idempotency-Key`

- **Vector**: sem ator, o escopo é a superfície; uma chave previsível de um visitante colidiria com a de outro, ou um
  atacante reusaria a chave alheia.
- **Likelihood**: Low · **Impact**: Low · **Risk**: Low
- **Mitigation**:
  - Code: chave UUID obrigatória (imprevisível, gerada pelo cliente); replay só com o mesmo conteúdo validado (devolve
    apenas `{status: registered}`, sem dado); conteúdo diferente → `409`; reserva atômica no índice único.
- **Owner**: Engenharia · **Tracking**: W5

### T-406 [LOW] Spoofing — CSRF e origem de rede forjada

- **Vector**: página de terceiro submete em nome do visitante; cliente forja `x-forwarded-for` para fugir do limite.
- **Likelihood**: Low · **Impact**: Low · **Risk**: Low
- **Mitigation**:
  - Code: `Origin` do mesmo host (`isSameOrigin`); sem CORS; origem de rede só do `x-real-ip` escrito pela Vercel
    (ausente/malformado → `503`); fora da Vercel, origem única `local`.
- **Owner**: Engenharia · **Tracking**: W5

### T-407 [LOW] Information disclosure — linkagem entre superfícies pelo pseudônimo de rede

- **Vector**: reutilizar o mesmo segredo HMAC da BP1 faria o mesmo IP gerar o mesmo pseudônimo no contato Brand Partners
  e no interesse, permitindo correlacionar as jornadas pelas chaves do Redis.
- **Likelihood**: Low · **Impact**: Low · **Risk**: Low
- **Mitigation**:
  - Code: separação de domínio — o pseudônimo do interesse é HMAC de `interest` + origem de rede
    (`pseudonymizeNetwork(…, 'interest')`), diferente do pseudônimo da BP1 para o mesmo IP; namespaces distintos no
    Redis; chaves com expiração. **Conclusão**: não há necessidade demonstrada de segredo novo — o segredo existente,
    com separação de domínio, atende (decisão do fundador de 2026-10-19).
- **Owner**: Engenharia · **Tracking**: W5

### T-408 [LOW] Repudiation — escrita anônima sem `audit_log`

- **Vector**: sem ator, não há quem auditar; disputa sobre "quem registrou".
- **Likelihood**: Low · **Impact**: Low · **Risk**: Low
- **Mitigation**: registro imutável com `created_at` do `Clock`; logs com `correlation_id`; a leitura do Admin grava
  `admin_read` (TECH-092). Interesse não é mutação crítica (TECH-002), por isso fica fora do `audit_log` de command.

## 7. Abuse cases

- Bot repete o mesmo corpo com chaves novas → contado pelo limitador; cada registro é uma manifestação (sem direito).
- Visitante tenta `approx_days` para Owner ou `0`/negativo → `400`; banco recusa por CHECK em qualquer caminho.
- Cliente envia `edition_id` de outro Concept ou de modalidade incompatível → `404` / `400`; gatilho revalida F2a.
- Atacante injeta HTML/script em `region` → texto simples, controles recusados; React escapa na visão do Admin.
- Upstash fora do ar → `503` antes do banco; nenhuma escrita sem limitador.

## 8. Residual risk

- Retenção sem expurgo das chaves de idempotência públicas e dos interesses (sem PII de contato) — follow-up de
  operação; aceito na W5 (Engenharia).
- Rate limit da aplicação continua ausente nas rotas do Admin e no login (superfície só de staff AAL2 e Supabase Auth
  com limites próprios). A W5 aplica o limitador só à escrita pública de interesse, conforme o plano; reavaliar na W7
  (login de Titulares) e na W30.
- Campos livres podem conter texto pessoal digitado: armazenados, nunca logados; a W6 (`P-3`) define base LGPD e aviso.

## 9. References

- OWASP Top 10 — https://owasp.org/Top10/
- OWASP ASVS — https://owasp.org/asvs/
- Microsoft STRIDE — https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool
- `03`: TECH-056, TECH-092, TECH-100, ADR-006; `02`: REQ-022–REQ-025; `01`: BR-015, BR-040–BR-043, BR-060.
