# 0027. Ciclo da reserva de uso próprio: transições só-inserção, chaves K1/K2 e autorização independente

- **Date**: 2026-11-03
- **Status**: Accepted (2026-11-03, no merge do PR documental da E0, #80 → `5d9b636`). Antes: Proposed (E0 documental
  aprovada pelo fundador para auditoria; aceite no merge; E1 não autorizada). E1 autorizada pelo fundador em 2026-11-03.
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: booking, inventory, calendar, identity, postgresql, security, github-actions

## Context

A W13 entrega cancelamento, no-show, recuperação e exceção da reserva de uso próprio (`02` REQ-080, REQ-081, REQ-083,
PD-010; `03` TECH-043, TECH-046, TECH-055, TECH-060, TECH-090), a correção do Direito de Uso (emenda D2 da W11) e o
remédio para reserva não autorizada (R4 do ADR-0026). O planejamento passou por quatro rodadas de auditoria do fundador
(2026-11-03); este ADR registra só o que foi aprovado. Plano:
[`docs/plan/w13-cancelamento-no-show-recuperacao-e-excecao.md`](../plan/w13-cancelamento-no-show-recuperacao-e-excecao.md).

Forças:

- Pela condição de resolução do ADR-0024 §3 e do ADR-0025 §8, cada transição de custódia, liberação de ocupação,
  `restore` e `correction` só é habilitada com regra de autorização no banco decidida pela wave dona.
- O `luxtory_app` tem `SELECT, INSERT` em `app.operation`, `SELECT` em `app.staff_role` e `INSERT` em `app.audit_log`
  (migrations da W1/W2): com a credencial, monta uma operação em nome de qualquer Admin ativo. O MFA existe só no
  servidor (TECH-050). Dois Admins distintos não protegem contra esse comprometimento.
- O `db:check` recria bancos descartáveis com todo o histórico de migrations: uma migration de dados presa a uma reserva
  que só existe em Production não é reprodutível.
- A tabela da TECH-022 não previa a reversão de reserva não autorizada; o `02` §15 não a cobria. O fundador autorizou a
  revisão `02` v4.4 (REQ-084, edge case 16) e `03` v3.16 (TECH-022, TECH-026, TECH-051, §7), sem alterar Business Rule.
- O repositório é público: entradas e logs de workflow são públicos.

## Decision

1. **Autorização no banco por transição (A1 estendido, ADR-0026).** Toda escrita da W13 pelo papel da aplicação fica
   presa à operação pendente da transação (`app.assert_operation_in_transaction`), ao `command` dela e à transição de
   estado que essa operação gravou para a reserva. Condições temporais no instante de cada escrita (`clock_timestamp()`,
   T3). Titular: delegação ativa travada (`FOR SHARE`) e holding vigente igual a `booking.holding_id`. Admin: `staff_role`
   ativo travado (padrão W8) — consistência, não autenticidade (item 4). Os gates de criação da W12 ficam intactos; tudo
   que não estiver listado no item 3 continua no gate da W10/W11.

2. **Estados só-inserção com projeção controlada.**
   - `app.booking_state_transition`: `from_state`, `to_state`, tipo, operação, instante gravado pelo banco, classificação
     e termos (cancelamento do Titular e P-A), `previous_transition_id`. O `luxtory_app` só tem `INSERT`.
   - Cadeia linear: índice único parcial `(booking_id) WHERE previous_transition_id IS NULL` (uma raiz por reserva, que
     parte de `confirmed`); FK composta `(previous_transition_id, booking_id) → (id, booking_id)`; `UNIQUE
     (previous_transition_id)`; gatilho `BEFORE INSERT` que trava a reserva (`FOR NO KEY UPDATE`) e exige
     `previous_transition_id IS NOT DISTINCT FROM booking.last_transition_id`, `from_state = booking.state` e par permitido
     pela TECH-055. Os índices protegem mesmo com os gatilhos contornados (R3).
   - Projeção por gatilho `AFTER INSERT` `SECURITY DEFINER` com as restrições de `app.use_right_balance_apply` (W11):
     confere `TG_TABLE_NAME`/`TG_WHEN`/`TG_OP`/`TG_LEVEL`, deriva só de `NEW`, sem parâmetro nem SQL dinâmico,
     `search_path` vazio, `REVOKE ALL FROM PUBLIC` (sem `EXECUTE`, ninguém cria outro gatilho com ela; o PostgreSQL recusa
     chamada direta de função de gatilho). Guarda `BEFORE UPDATE` em `app.booking` para todos os papéis: só `state`,
     `last_transition_id` e `cancellation_class` mudam, coerentes com a transição referenciada; classe gravada uma vez.
     `luxtory_app` continua sem `UPDATE` em `app.booking`.
   - Invariante no COMMIT e `app.booking_invariant_breaches()`: estado = `to_state` da folha; uma folha;
     `in_exception` ⇔ exatamente uma exceção aberta.
   - Ordem de travas (TECH-053 não lista `booking`): delegação/`staff_role` → classe 4 (Ação) → classe 5 (noites) →
     reserva `FOR NO KEY UPDATE` → classe 6 (custódia, saldo, ocupação). `NO KEY UPDATE` não conflita com o `KEY SHARE`
     das FKs; uma transferência futura (W28) que trave Ação → reservas não inverte a ordem.

3. **Commands e efeitos.** O command segue o objeto econômico; o registro fechado da TECH-051 não muda.

   | Command | Desfecho | Escritas permitidas | Autorização independente |
   |---|---|---|---|
   | `cancel_own_use_booking` (Titular) | `cancelled` | Co-Owner tempestivo: libera todas, `reserved_right → spe_pool`, `restore`; tardio: libera futuras, futuras `→ forfeited_right`. Owner: libera futuras, `owner` | não (ato do próprio Titular) |
   | `declare_no_show` | `no_show` | libera futuras; futuras `→ forfeited_right` (Owner: `owner`) | `no_show` |
   | `open_exception` | `in_exception` | nenhuma | não |
   | `resolve_exception` → `confirmed`/`completed` | estado | nenhuma | não |
   | `resolve_exception` → `cancelled`, P-A | `cancelled` | classificação no instante (REQ-080): tempestiva = efeitos da BR-280; tardia = futuras `→ forfeited_right`, consumo mantido; Owner: libera, `owner` | `exception_cancellation` |
   | `resolve_exception` → `cancelled`, P-B Owner | `cancelled` | libera futuras; `owner` | `invalidation` |
   | `correct_use_right`, P-B Co-Owner | `cancelled` | libera futuras; `reserved_right → spe_pool`; `correction` por data | `invalidation` |
   | `recover_future_capacity` | — | `forfeited_right` futura `→ luxtory/inventory/recovered_future_capacity` | `recovery` |
   | `advance_booking_states` (sistema) | `in_use`/`completed` | nenhuma | não |

   - `resolve_exception → cancelled` em P-B de Co-Owner é sempre recusado (a invalidação reverte o consumo na mesma
     operação); `correct_use_right` fora de P-B de Co-Owner autorizada é recusado.
   - Dois regimes, ambos conferidos no banco. **Cancelamento pelo Titular**: representação (delegação ativa e holding da
     reserva), command `cancel_own_use_booking`, K2, prazo e guard — **sem** autorização independente. **Operações
     administrativas com efeito econômico** (`declare_no_show`, `recover_future_capacity`, `resolve_exception →
     cancelled`, invalidação): as proteções aplicáveis (command, `staff_role`, K2, instante) **mais** a linha de uso da
     autorização da mesma operação, sempre exigida. Cada escrita que movimenta uma noite (liberação, custódia,
     `restore`, `correction`) exige também a noite no escopo autorizado e ainda não iniciada. Um `declare_no_show` sem
     noite futura (reserva de uma noite, ausência constatada na última noite) usa a autorização do evento de ausência
     (finalidade `no_show`, item 4) sem exigir noite. A exigência da linha de uso depende do command e do desfecho da
     operação e nunca alcança o cancelamento do Titular.
   - `resolve_exception → completed` só com `at ≥ checkout_at` e `→ confirmed` só com `at < checkout_at`, como o job e
     "Concluída = período encerrado" (item 7): uma resolução não encerra estadia em curso nem retira do Titular o
     cancelamento.
   - Uma única transação por operação: falha desfaz tudo, inclusive o uso da autorização; replay pela chave do executor
     devolve o resultado gravado; a auditoria registra cada noite como revertida, liberada ou mantida (iniciada).
   - Cancelamento do Titular durante exceção grava, na mesma transação, a resolução (`resolution_source =
     titular_cancellation`). P-A: regras normais. P-B: Co-Owner só tempestivo; Owner a qualquer tempo, só sobre datas não
     iniciadas (REQ-081, REQ-084).
   - P-A tardia vai a `forfeited_right` (TECH-022, §7): nenhuma terceira consequência; a recuperação nunca é automática
     (BR-123) e exige autorização `recovery` com atestação de disponibilidade e compatibilidade com a situação do bloqueio.

4. **Autorização independente do `luxtory_app`.**
   - Papel `luxtory_booking_authorizer`: criado por migration, `LOGIN` sem senha, `NOINHERIT`, `CONNECTION LIMIT 1`,
     nenhum privilégio em tabela; `EXECUTE` só em `app.authorize_booking_action(...)` e
     `app.revoke_booking_authorization(...)` (`SECURITY DEFINER`, `search_path` vazio, `REVOKE ALL FROM PUBLIC`). A senha
     é definida pelo fundador pelo procedimento já usado para o `luxtory_app` (`docs/how-to/operacao.md`) e fica só num
     GitHub Environment com revisor obrigatório, restrito à `main`. Nunca no Vercel.
   - Solicitação opaca: o Admin registra `app.booking_authorization_request` (só-inserção, operação Admin não crítica,
     sem efeito econômico) com reserva, exceção ou incidente, finalidade e escopo esperado. O workflow recebe só o id da
     solicitação e a referência do run: nenhuma reserva, data ou evidência em entrada ou log público. O detalhe é
     conferido na área Admin, protegida.
   - A função deriva o escopo dos fatos, confere o esperado e grava `app.booking_authorization` (só-inserção):
     reserva, solicitação, incidente, finalidade, noites/custódias, classificação esperada (P-A de Co-Owner), validade e
     referência da aprovação. Revogação e uso em tabelas só-inserção (`…_revocation`, `…_use`), com PK no id da
     autorização. Trava consultiva por reserva em autorizar, revogar e usar; o uso trava a autorização em `FOR SHARE`, a
     revogação em `FOR UPDATE`.

   | Finalidade | Emissão | Escopo gravado | Validade | Execução |
   |---|---|---|---|---|
   | `no_show` | `1º checkin_at ≤ now < checkout_at`, reserva `confirmed`/`in_use` | evento de ausência; noites não iniciadas na emissão (pode ser vazio) | `≤ checkout_at` | na janela; afeta todas as não iniciadas (zero na última noite ou em reserva de 1 noite) |
   | `recovery` | custódias `forfeited_right` ativas e futuras com linhagem à reserva; origem P-A exige atestação | essas custódias | `≤ checkin_at` da última | só as gravadas ainda futuras e ativas |
   | `exception_cancellation` | P-A aberta, ≥ 1 noite não iniciada | noites não iniciadas + classificação esperada (Co-Owner) | `≤ checkin_at` da última | afetadas ⊆ gravadas, não vazio, classificação igual |
   | `invalidation` | P-B aberta, ≥ 1 noite não iniciada | noites não iniciadas | `≤ checkin_at` da última | afetadas ⊆ gravadas, não vazio |

   - Sequência no-show → recuperação: autorizações separadas; a de recuperação só é emitida depois do no-show commitado,
     sobre as custódias efetivamente `forfeited_right`. Não há autorização conjunta.
   - Credencial comprometida com autorização legítima: o atacante só consegue executar exatamente o ato autorizado, no
     escopo e na validade gravados, e uma única vez. A classificação esperada impede que a escolha do instante piore a
     P-A do Co-Owner.
   - A solicitação, gravada pelo papel da aplicação, não é evidência de legitimidade. O aprovador verifica os
     fundamentos por fontes próprias antes de aprovar: no-show — registro de não comparecimento da administração
     profissional ou contato com a party por canal próprio; invalidação — declaração da party por canal verificado e
     análise de fontes que o `luxtory_app` não escreve (logs do Vercel e do Supabase Auth); cancelamento P-A — o evento
     extraordinário; recuperação de origem P-A — disponibilidade e compatibilidade com o bloqueio. O workflow só confere
     escopo e validade; o roteiro por finalidade fica no runbook do autorizador.
   - Com o servidor da aplicação inteiro comprometido, a tela que o aprovador consulta deixa de ser confiável: limite da
     fronteira existente (ADR-0024 §3, R1), não resolvido por este mecanismo.

5. **Chaves e contenção.** K1 `own_use_booking` (criação, ADR-0026) e K2 `own_use_lifecycle`: toda escrita do papel da
   aplicação nos commands `cancel_own_use_booking`, `declare_no_show`, `open_exception`, `resolve_exception`,
   `recover_future_capacity` e `correct_use_right`. Jobs fora da K2 (só o que o instante permite, sem efeito econômico).
   Autorização e K2 são cumulativas. A W13 só amplia o `CHECK` de `app.capability_activation`; a tabela continua vazia.
   Contenção: (1) troca da senha do `luxtory_app` e término das sessões dele (fundador, console); (2) migration da CI com
   `LOCK … ACCESS EXCLUSIVE`, `lock_timeout` e `DELETE` de K1 e K2; (3) redeploy com a senha nova, reativação autorizada
   da K2 assim que o vetor estiver fechado, remediação.

6. **Prazo.** Tempestivo ⇔ `cancelled_at ≤ checkin_at − 360 h`: `checkin_at` é o instante gravado na selagem (14:00 locais,
   fuso IANA) da primeira noite; 360 h = 15 × 24 h sobre instantes (TECH-040; precedente TECH-044); `cancelled_at` é o
   instante do banco na escrita da transição. Implementação: `interval '360 hours'` (nunca `'15 days'`, que usa o fuso
   da sessão) e `Instant.subtract({ hours: 360 })`. Exibido no fuso local.

7. **No-show.** Janela estrita `[1º checkin_at, checkout_at)` (checkout 10:00 locais), conferida pelo instante. A lista
   "A verificar comparecimento" é calculada na hora pelo mesmo predicado SQL; o job `flag_no_show_candidates` só registra
   a identificação. "Concluída" significa período encerrado sem declaração; o produto não afirma presença.

8. **Correção.** Só reversão de `consume` de data não iniciada de reserva invalidada (`quantity` igual à do consumo,
   efeito `consumed − quantity`, exclusiva com `restore`). A correção de expiração permanece estrutural e fechada
   (emenda de escopo do roadmap): o banco grava `expire` exato só depois do fim efetivo, recusa `consume`/`restore`/
   `correction` depois dele, a reversão deixaria saldo inutilizável e o aumento é impossível.

9. **Entradas.** Só Server Actions sobre handlers de `application/`; as seis rotas REST previstas no roadmap ficam
   adiadas até existir consumidor externo (emenda do roadmap). Contratos AsyncAPI dos eventos dos commands no início da
   E2, antes do primeiro handler que emite evento; a E3 fica com jobs e consumidores.

10. **Prontidão.** `app.assert_own_use_activation_ready()` (W13) verifica invariantes: gatilhos presentes e habilitados,
    privilégios efetivos (`has_*_privilege`), RLS, consultas de violação vazias e nenhuma chave presente. Referências de
    integridade só no PR de ativação: a CI monta um PostgreSQL descartável com as migrations do commit e extrai SHA-256
    do `prosrc` das funções críticas e a estrutura de gatilhos e privilégios; os valores ficam versionados na migration
    de ativação, conferidos pela CI e comparados com Production em falha fechada. O hash do banco é só a medição; a
    confiança vem do Git e da CI; não protege contra o dono depois (R3).

## Risco residual (sem ratificação)

R1–R5 do ADR-0026 seguem pendentes. Acrescentam-se R6 (cancelamento forjado com K2 presente: tardio irreversível), R7
(atos Admin forjados sem autorização independente — abertura de exceção e resolução `confirmed`/`completed`: não alteram
saldo nem custódia, mas uma P-B indevida suspende o cancelamento tardio do Co-Owner e o no-show enquanto durar; os atos
econômicos exigem autorização independente), R8 (Admin interno: mitigado pela autorização independente), R4b (reserva não autorizada já
cancelada com atraso, com no-show ou com datas iniciadas: irremediável sem alterar BR-281/282 e TECH-060) e C1 (prazo
vencido durante indisponibilidade ou contenção: pendente de decisão operacional/contratual antes da ativação; nenhuma
compensação automática; a PD-010 não é exclusão genérica). Detalhe por estado operacional no STRIDE `booking` (W13).
A W13 não ativa reservas.

## Consequences

### Positive

- Nenhum ato administrativo com efeito econômico irreversível ou transferência de capacidade à Luxtory depende só da
  credencial da aplicação.
- Estado com histórico imutável e cadeia provada no banco; classificação gravada uma vez.
- Contenção completa das escritas de reserva com duas chaves; `db:check` continua determinístico.

### Negative

- Uma aprovação no GitHub por no-show, recuperação, cancelamento P-A e invalidação; a espera reduz noites recuperáveis
  (sem prejuízo ao Titular).
- Papel e workflow novos a operar e testar; configuração real (Environment, senha) é decisão futura do fundador.
- Invalidação depende da emissão canônica (`02` v4.4, `03` v3.16) no merge desta E0.

## Alternatives considered

- **Dois Admins distintos:** a credencial forja os dois. Recusada.
- **Migration de dados por incidente:** quebra a reprodução do `db:check`. Recusada pelo fundador.
- **Token HMAC conferido no banco:** segredo no banco configurado no console, rotação manual, sem trilha de aprovação.
- **Workflow com a credencial do dono:** viola o menor privilégio.
- **Três chaves ou chave única:** sob comprometimento, as três caem juntas; a única perde o cancelamento com a criação
  desligada (estado C).
- **Classificar a P-A pela abertura da exceção:** muda o instante de referência da BR-280, que está no `01`; o `02` não
  pode redefinir BR (REQ-104). Não adotada.
- **P-A tardia mantendo `reserved_right`:** terceira consequência, reutilizável sem novo consumo na W22 (TECH-023).
- **Autorização conjunta no-show + recuperação:** a capacidade ainda não é `forfeited_right`; complexidade para poupar
  uma aprovação.
- **Fila de cancelamentos durante a contenção:** instante forjável com a credencial comprometida.
- **Rotas REST agora:** sem consumidor; mais superfície e contrato.

## Notas de implementação da E1 (2026-11-04, ambiente isolado; sem mudança de decisão)

1. **Trava da reserva (§2).** O `luxtory_app` não tem `UPDATE` em `app.booking`, e o PostgreSQL exige esse privilégio
   para `SELECT … FOR NO KEY UPDATE`. O gatilho trava a reserva por trava consultiva `app.booking:<id>` (precedida da
   `app.stake:<id>` no Co-Owner, reentrante), na mesma posição da ordem; a linha é travada em `NO KEY UPDATE` pela
   projeção na mesma transação. Autorizar, revogar e usar usam a mesma chave consultiva; a revogação ainda trava a linha
   da autorização em `FOR UPDATE`, e o uso a referencia por FK (`KEY SHARE`). Com os gatilhos contornados (R3), o índice de
   raiz única, a FK composta e o `UNIQUE (previous_transition_id)` seguem protegendo a cadeia.
2. **Papel autorizador e `USAGE` no schema `app` (§4).** Para chamar as duas funções, o papel recebe `USAGE` no schema.
   Com isso enxerga funções que as waves anteriores deixaram executáveis por `PUBLIC`: 18 funções de gatilho (o
   PostgreSQL recusa a chamada direta) e o validador `app.is_text_list` (IMMUTABLE, sem acesso a dados). Nenhuma lê ou
   grava dados; a prontidão e os testes conferem que as únicas funções chamáveis com acesso a dados são as duas. Revogar
   `EXECUTE` de `PUBLIC` nessas funções antigas é endurecimento separado, fora da E1 (mexe em privilégios das W1–W7).
3. **Solicitação (§4).** Gravada pelo command Admin não crítico `request_booking_authorization`, fora da K2 (o §5 lista
   só os seis commands; a solicitação não tem efeito sem a autorização, e a execução exige a K2).
4. **Natureza do evento e efeitos no COMMIT (§2, §3).** A transição registra a natureza econômica (`advance`,
   `cancellation`, `no_show`, `exception_opening`, `exception_resolution`, `invalidation`); constraints diferidas conferem
   no COMMIT os efeitos completos do fechamento e da recuperação e que todo uso de autorização acompanha o ato da mesma
   operação. Detalhes e nomes de recusa: spec `booking` §10.11.
