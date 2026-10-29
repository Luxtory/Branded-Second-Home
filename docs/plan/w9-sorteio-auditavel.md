# W9 — execução do plano aprovado

Data: 2026-10-28. Base: `75cb0caf044610251892a6a41ddefa726f5b41e1` (main = Production, CI210 verde, 42/0).
Plano final e cuidados adicionais aprovados pelo fundador no chat em 2026-10-28; este documento organiza a execução,
sem substituir os canônicos. Spec: ownership §16 e platform (W9). ADR-0022. W9 sem closeout até merge autorizado.

## Decisões do fundador

- D1: evidência completa ao Titular, com Ações por identificador não pessoal e a sua destacada, sem identificar os
  demais Co-Owners.
- D2: `drand-client` 1.4.2 do ADR-0004, usado por `fetchBeacon` com `ChainClient` próprio (recomendação técnica
  coincidente; vetores reais e adulterados obrigatórios).
- D3: W9 e W10 sequenciais (o roadmap previa paralelismo, mas ambas tocam `database/schema.ts` e
  `jobs/job-registry.ts`).
- D4: conferência exclusivamente agregada e somente leitura de Production antes do merge (contagens de aquisições e
  de eventos de sorteio por igualdade exata de tipo); sem contornar bloqueio de acesso.
- D5: limitações de auditabilidade anteriores à W30 aceitas provisoriamente, com gates fechados e sem uso real.

## Restrições globais

- Canônicos e migrations aplicadas intocados; W8 preservada; nenhum command nem job novo (TECH-051, TECH-090).
- Production, gates (`ACQUISITION_WRITES`, `INTEREST_WRITES`, `PII_*`), identidades, segredos e dados reais intocados;
  variáveis `DRAW_*` não criadas em Production. W10/W11 não iniciadas. Parar antes do squash merge.
- Anterioridade imposta pelo banco no COMMIT efetivo; orçamento total do beacon menor que o `transaction_timeout`;
  progresso do outbox sob eventos futuros, falhas recorrentes e falhas no COMMIT.

## Etapas

| Etapa | Entregáveis | Estado |
|---|---|---|
| E0 | worktree `/home/rjr-idb/luxtory-w9`, `npm ci`, `npm run verify` na base (1.158/1.158, 42 up/down/up) | ✅ |
| E1 | spec ownership §16 e platform W9, ADR-0022 (+ adendo ao ADR-0021), AsyncAPI, STRIDE, referência de verificação → C1 | ✅ `a8e6013` |
| E2 | `fy-v1`, rodadas e compromisso (TDD, vetor fixo independente) | ✅ `45392b1` |
| E3 | adaptador quicknet (`fetchBeacon` + `ChainClient`), rodadas reais gravadas e adulteradas | ✅ `45392b1` |
| E4 | migrations `platform_outbox_available_at` e `ownership_initial_draw`; codegen; testes db | ✅ `9dceb5a` (+ tratamento do `error` do pool pg) |
| E5 | seams do outbox, dispatcher, três consumidores, registro e configuração | ✅ `f579959`, `7c51eb8`, `0c88836` |
| E6 | leituras, Admin, Titular, i18n, E2E → C2 | ✅ `ba2f94b`, `3a696d0` (E2E no bloco serial Co-Owner da W8) |
| E7 | runbook, catálogo de ambiente, CHANGELOG, gates integrais | ✅ `0c5a2b0`; verify, E2E, trace e títulos AC verdes |
| E8 | D4 → PR draft → CI → C3 (parar antes do merge) | em andamento |

## Conferência D4 (somente leitura, agregada)

```sql
SELECT event_type,
       count(*) FILTER (WHERE delivered_at IS NULL) AS pending,
       count(*) AS total
FROM app.outbox
WHERE event_type IN ('ownership.initial_draw_scheduled',
                     'ownership.initial_draw_committed',
                     'ownership.initial_draw_completed')
GROUP BY event_type;

SELECT count(*) AS acquisitions FROM app.acquisition;
```

Esperado: nenhuma linha na primeira consulta e `0` na segunda. Qualquer valor diferente: parar e reportar antes do
merge.
