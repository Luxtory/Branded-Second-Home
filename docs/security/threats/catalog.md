# Threat Model: catalog

- **Date**: 2026-09-27
- **Author(s)**: Engenharia
- **Status**: Reviewed
- **Scope**: W3 — tabelas do catálogo, 9 operações do Admin (`POST /v1/admin/*` e Server Actions das telas), telas
  `/admin/catalogo/**` e leituras administrativas
- **Linked spec**: `docs/specs/catalog.md`, `docs/specs/admin.md`
- **Linked ADR(s)**: ADR-0006, ADR-0008, ADR-0010

## 1. Overview

O staff com papel Admin (AAL2) registra Brand Partners, Concepts e versões, Editions, autorizações de Investor e
Residences. Toda mutação passa pelo guard e pelo executor (TECH-054) e grava `operation` + `audit_log`; toda leitura das
telas grava `admin_read`. Dados: nomes de marca, textos do Concept e da Edition, referências de instrumentos e rótulos
internos — nenhum dado pessoal. A superfície nova reusa sessão, guard e CSRF da W2 (`identity-admin`).

## 2. Assets

- Integridade do catálogo: vínculo Concept → Edition → Residence, versão fixada (BR-025), autorização do Investor.
- Histórico: versões aprovadas, encerramento, exposição e auditoria (sem `UPDATE`/`DELETE` funcional).
- Conformidade editorial dos textos (REQ-100/101) antes da exposição pública (W4).

## 3. Actors

| Actor | Trust level | Notes |
|---|---|---|
| Visitante anônimo | untrusted | alcança as rotas; sem sessão → 401 / redirect para `/entrar` |
| Usuário autenticado sem papel, AAL1 ou só Super Admin | low | 403 nas telas e nos `POST` do catálogo |
| Staff Admin AAL2 | medium | opera o catálogo, sempre pelo guard, com papel exercido auditado |
| Site de terceiros | hostile | tenta CSRF contra os `POST` e as Server Actions |

## 4. Data flow diagram

```
Navegador (staff) ──HTTPS──> Next (gru1) ──Server Action / POST /v1/admin/*──> guard (identity) ──> executor
                                          └─ telas (Server Components) ──> leitura como luxtory_app + admin_read
executor / leitura ──TLS verify-full──> PostgreSQL (schema app, RLS, gatilhos)
```

## 5. STRIDE analysis

| Component | S | T | R | I | D | E | Notes |
|---|---|---|---|---|---|---|---|
| `POST /v1/admin/*` do catálogo | — | C-001 | C-003 | — | C-006 | C-002 | origem, sessão, guard, idempotência |
| Server Actions das telas | — | C-001 | C-003 | — | — | C-002 | mesma entrada da API (ADR-0010 §6) |
| Tabelas do catálogo | — | C-004 | C-003 | C-005 | — | C-004 | RLS só `luxtory_app`; gatilhos de imutabilidade |
| Textos registrados | — | C-007 | — | — | — | — | checagem lexical + aprovação humana |
| Telas de leitura | — | — | C-003 | C-005 | — | C-002 | acesso relido a cada request; `admin_read` |

## 6. Threats (prioritized)

### C-002 [HIGH] Elevation — Operar o catálogo sem papel Admin ou sem MFA

- **Mitigação**: guard nega por padrão; autoridade `admin` aceita só o papel Admin ativo com AAL2, relido a cada
  command e a cada tela; papel exercido explícito (ADR-0008). Testes: sem sessão 401, AAL1/sem papel/só Super Admin 403.

### C-001 [HIGH] Tampering — CSRF contra `POST` e Server Actions

- **Mitigação**: `Origin` igual ao host nos `POST` (403); Server Actions comparam `Origin` e `Host`; cookies
  `SameSite=Lax`. Teste: `POST` com origem inválida → 403.

### C-004 [MEDIUM] Tampering — Reescrever a versão fixada, uma versão aprovada ou o histórico

- **Mitigação**: `luxtory_app` sem `DELETE`; `UPDATE` só nas colunas de transição (aprovação, exposição, encerramento,
  revogação), cada uma de vazio a preenchido uma vez; gatilhos recusam o resto; FKs compostas amarram Edition, versão e
  autorização ao mesmo Concept. Testes de banco para cada gatilho.

### C-007 [MEDIUM] Tampering — Texto com terminologia vedada ou promessa de retorno chegando ao público

- **Mitigação**: checagem lexical no command (recusa com o campo); aprovação humana da versão como gate editorial; a
  exposição pública só na W4. Risco residual: paráfrases não detectadas por padrão lexical.

### C-003 [MEDIUM] Repudiation — Mudança ou leitura sem rastro

- **Mitigação**: `operation` + `audit_log` com antes/depois e papel exercido em toda mutação (sem auditoria o commit é
  recusado); `admin_read` em cada leitura das telas.

### C-005 [LOW] Information disclosure — Catálogo lido por `anon`/`authenticated`

- **Mitigação**: RLS ligada com política só para `luxtory_app`; nenhum grant para `anon`/`authenticated`. Teste de RLS.
  Não há dado pessoal no catálogo; rótulo da Residence orientado a não conter nome nem endereço.

### C-006 [LOW] Denial of service — Volume de `POST` autenticados

- **Mitigação**: só staff AAL2 alcança; limites de tamanho em toda entrada. Rate limit chega com o port da W5 (P-10).

## 7. Abuse cases

- Staff tenta registrar Residence com a autorização de outro Concept → recusada (FK composta e command).
- Staff tenta aprovar uma versão antiga para "voltar" o Concept → recusada (só versão maior que a vigente).
- Depois do encerramento, staff tenta criar uma Edition com data retroativa no corpo → o instante vem do servidor.

## 8. Residual risk

- Sem rate limit nas rotas do Admin até a W5 (aceito: superfície só de staff AAL2).
- Checagem de terminologia é lexical (aceito: gate editorial humano).
- Encerramento sem exceção para bases sobreviventes (limitação temporária, ADR-0010 §4).

## 9. References

- `docs/security/threats/identity-admin.md` (sessão, guard, CSRF da W2)
- `03`: TECH-050…054, TECH-092, TECH-100, §13
