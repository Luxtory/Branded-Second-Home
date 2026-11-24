# W21 — Luxchange Request: envio — plano

IDs (dona): REQ-062, PD-005, PD-007 e, se aprovado, o envio do PD-012. TECH: TECH-024, TECH-031, TECH-043, TECH-044,
TECH-061, TECH-071, TECH-072, TECH-073 (proposto), TECH-082, TECH-090 (com TECH-001, TECH-002, TECH-025, TECH-051–TECH-056,
TECH-070, TECH-080, TECH-091). Complementos: REQ-096, REQ-097, REQ-098, REQ-100, REQ-101, INV-6, EC-6 a EC-9 e EC-17 a
EC-21, CONC-5, CONC-8, CONC-12 e CONC-13 a CONC-18 (propostos). Base: `main` `9a55ffb` (W20 #109 `5b8a047` + #110,
catalog). Canônicos vigentes: `01` v10.8 · `02` v4.6 · `03` v3.19. Propostos nesta E0, **não vigentes até aprovação
expressa do fundador**: `01` v10.9 · `02` v4.7 · `03` v3.20. Decisão: [ADR-0037](../adr/0037-request-lastro-complemento-por-datas-e-encerramentos.md)
(Proposed) e emenda proposta na [ADR-0036](../adr/0036-deposito-luxchange-cessao-snapshot-por-noite-e-k6.md).

## Autorização (fundador, 2026-11-24)

E0 exclusivamente documental, numa única branch da W21 (`feat/w21-luxchange-request-envio`), a partir da `main` atual.
**Não autorizado:** E1, migrations, implementação econômica, merge, deploy, escrita em Production, ativação de K1–K7,
publicação de PRL, parâmetros ou políticas reais, pagamentos reais ou simulados em Production, antecipação da W22. Nenhuma
proposta desta E0 é decisão aprovada antes da autorização expressa do fundador no checkpoint C0.

## Decisões do fundador já tomadas (rodadas de 2026-11-24)

- Direção funcional: **complemento por datas** sob a condição do aceite (alternativa B), como modalidade adicional da
  Request; depósito da W20 preservado como cessão definitiva independente.
- Composição: o membro escolhe as datas; o sistema calcula `G = max(0, N − P)`; FEFO entre os lotes elegíveis; Créditos
  potenciais nunca são saldo antes do aceite.
- Divisão: W21 = envio, compromissos, Garantia e encerramentos; W22 = aceite composto e recusa; W23 = Direct.
- Interface: "Taxa de intermediação"; `Luxchange Fee` permanece como nome técnico e econômico interno. O alinhamento da
  página pública é PR de comunicação separado.

## Pendente do fundador (C0)

1. Aprovação dos textos de `01` v10.9, `02` v4.7, `03` v3.20, ADR-0037 e da emenda da ADR-0036.
2. `01` v10.9 — **mudança de alcance a sinalizar:** os esclarecimentos delimitam, para a oferta sob condição, o alcance de
   "outro compromisso econômico incompatível" (BR-170, BR-171) e de "compromissos anteriormente constituídos" (BR-344),
   preservando as obrigações já constituídas pela Request. Sem nova BR.
3. **Hipótese de produto (PD-007 ampliado), ainda não ratificada:** Créditos do membro solicitado = Σ PRL das noites
   solicitadas × multiplicador, ambos do envio, ainda que o PRL mude depois; originados no aceite, com validade desse
   instante; conhecidos por ele antes de aceitar; conferidos pelo banco pela fórmula do PRL
   (`app.luxchange_deposit_quantity_matches`, já existente), não por igualdade com o débito.

## Diagnóstico E0

| Item | Estado |
|---|---|
| `main` | `9a55ffb`; desde a W20 entrou só o #110 (catalog, sem migration nem canônico) |
| Production (só leitura, 2026-11-24) | 71 migrations (md5 `c9064352…` = local), `capability_activation` vazia (CHECK K1–K7), tabelas econômicas vazias, invariantes de credits, luxchange e billing vazias, sem `app.luxchange_request` |
| Prontos para reuso | W16 `resolveEconomicTerms` (conjunto de noites, política), `creditsForPrl`, `luxchangeFee`; W17 `holdCredits`/`releaseHold`, FEFO; W18 política e `PolicyAcceptance`; W19 `initiatePayment`, `chargeLuxchangeFee`, `reverseLuxchangeFee`, `processRefund`, `reconcilePayment`; W20 `cession`, snapshot por noite, `xmin`, calendário do depósito; registro com `send_request`/`withdraw_request`; job `expire_requests` no TECH-090 |
| Lacunas | K4/K5/K7 prendem encerramentos; guard sem `requester` e sem Titular fora da própria Second Home; banco sem a Request (cobertura, vínculo Fee ↔ noites, liberação só por retirada/recusa); `held → consumed` e apuração aceitam qualquer `accept_request`; `credit_lot_originate` sem caminho para originar ao solicitante no aceite |
| Infra | Vercel Hobby (Cron diário); outbox por `after()`; PSP não contratado (P-2); D2 pendente |
| Pipeline (Vercel #17514) | o marcador `[SENSITIVE]` do `vercel pull` não leva segredo ao build: toda página é dinâmica (`connection()` no layout raiz), variáveis lidas em runtime por acesso dinâmico, sem `env` no `next.config`; nenhuma mudança de pipeline |

## Escopo

| W21 | W22 | W23 |
|---|---|---|
| tabelas da Request, noites, complemento, consentimento e política no snapshot; lastro e completude do envio; encerramentos com prova; predicado de compromisso efetivo; ramos de recusa nas funções das W12/W13/W20; contrato das capabilities; termos vinculantes do aceite gravados e conferidos no envio | aceitação; cessão do complemento e da capacidade solicitada; lotes do solicitante e do cedente; consumo da Garantia e de `C`; reserva; apuração do Fee; encerramento das concorrentes; recusa; troca da regra "aceite só com a K7" pelo lastro | Direct |
| `send_request`, `withdraw_request`, `expire_requests` e `close_ineligible_request` (job + consumidor); guard; orquestração do pagamento; eventos, notificações, auditoria | `accept_request`, `reject_request`; telas do detentor | `create_direct` |
| telas: nova solicitação, complemento por datas, revisão e aceites, pagamento, resultado, minhas solicitações, recebidas (só leitura), "comprometida" nas telas de reserva e depósito, Carteira com Créditos potenciais | — | — |

Fora de todas: ativação, PSP real, cancelamento pós-aceite (⛔ P-11), dados econômicos reais.

## Etapas e checkpoints

| Etapa | Conteúdo | Checkpoint |
|---|---|---|
| E0 | esta entrega documental: canônicos propostos, ADR-0037, emenda da ADR-0036, índice de ADRs, este plano, W20 ✅ e emenda proposta no plano de waves, nota de proposta no `CLAUDE.md` | **C0:** aprovação expressa dos textos; só então os status mudam de "PROPOSTA" para "final" e as referências do `CLAUDE.md` passam às novas versões |
| E0b | documental, depois do C0 e antes da migration: spec `luxchange` (Request e complemento), STRIDE `luxchange` | revisão junto do C1 |
| E1 | migration única (72) + testes de banco, corrida, tempo, forja e preservação + `db:check` | **C1:** revisão da migration antes de qualquer código de aplicação |
| E2 | domínio, commands, guard, pagamento, job, consumidor, eventos, notificações, auditoria | **C2** |
| E3 | OpenAPI/AsyncAPI → rotas → telas; E2E 390/1440 | **C3:** revisão renderizada |
| E4 | `verify`, `test:e2e`, `trace --expect REQ-062,PD-005,PD-007,PD-012`, CHANGELOG, runbook, NOTES; PR draft; CI | **C4:** GO/HOLD |

## Critérios de aceite da W21

- `[PD-005][PD-012]` envio exige Membership, lastro exato (`N`, `P`, `G`, `C`, `E`) e Fee pago; Requests coexistem.
- `[PD-007][EC-9][EC-18]` PRL, multiplicador, validade ou política publicados depois do envio não alteram a Request.
- `[REQ-062]` Taxa de intermediação separada dos Créditos; Créditos potenciais nunca como saldo; as seis informações
  visíveis antes do envio; datas "a comprometer" antes do COMMIT.
- `[PD-012]` consentimento gravado com valores iguais aos da Request; consentimento divergente recusado.
- `[EC-6]` lote que vence antes do prazo não lastreia; FEFO com vários lotes, empate e lote não elegível.
- `[PD-012][TECH-043]` antecedência do complemento em `expires_at`, ao segundo.
- `[PD-012]` seleção com sobra evitável recusada.
- `[PD-012][EC-17][EC-20]` data comprometida recusa cancelamento, depósito, reserva própria e outro complemento; ato
  administrativo encerra a Request.
- `[EC-7][TECH-024]` inelegibilidade encerra, libera Garantia e compromissos e reverte o Fee, com prova no banco.
- `[TECH-044][EC-21]` expiração vale sem o job; compromisso vencido não bloqueia; reutilização materializa sob trava.
- `[TECH-072]` lote vencido em Garantia volta como `expired`.
- `[ADR-0037 §10]` com K4, K5 e K7 fechadas, encerramentos e estornos concluem; envios, Garantias e compromissos novos são
  recusados.
- `[ADR-0037 §9]` termos vinculantes do aceite gravados no envio (`N`, `G`, `P`, `C`, `E`, noites com custódia e PRL,
  multiplicador e validade) iguais ao recálculo do banco e suficientes para recompor os efeitos do aceite nos três
  cenários (`G > 0` com `E = 0`; `G = 0` com `E > 0`; sem complemento); a quantidade do cedente é conferida pela fórmula
  do PRL, não por igualdade com o débito.
- `[CONC-13]`…`[CONC-18]` e os critérios da ADR-0037 §6: intercalações controladas com PostgreSQL real e duas ou mais
  conexões; nenhuma dupla cessão, originação, utilização, encerramento ou estorno; nenhuma data recusada depois de perder
  a eficácia do compromisso; nenhuma confirmação parcial; estado final e invariantes corretos inclusive depois do retry do
  executor.

## Riscos

| Risco | Mitigação |
|---|---|
| Regressão nas funções das W12/W13/W17/W19/W20 | ramos antes dos caminhos atuais; provas de preservação; `db:check` |
| Forja pelo `luxtory_app` | regras nos gatilhos, completude no COMMIT, `xmin`, testes adversariais |
| Corrida no limite do prazo | predicado efetivo pelo relógio do banco; trava da Request e da noite; critérios do §6 da ADR |
| Pagamento aprovado e envio recusado | `reconcilePayment` imediato + job `reconciliation`; estado visível "devolução em processamento" |
| Estorno de Request vencida sem nenhuma ação | recuperação diária; Vercel Schedules só se a latência exigir, antes da ativação |
