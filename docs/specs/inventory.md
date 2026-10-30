# Inventário — custódia por noite, ocupação e Inventário Central (W10)

## 1. Fontes e escopo

Fontes: 01 BR-052, BR-151, BR-160–BR-167, BR-270, BR-283, BR-284; 02 REQ-037, REQ-039, REQ-040, REQ-041, REQ-042,
INV-1, INV-2, INV-3; 03 ADR-003, ADR-004, TECH-002, TECH-021, TECH-022, TECH-023, TECH-053, TECH-054, TECH-056,
TECH-110, §13. Esta spec aplica essas regras; não substitui o texto canônico. Decisão: [ADR-0024](../adr/0024-custodia-selagem-e-fronteira-de-confianca.md);
plano: [`docs/plan/w10-custodia-e-selagem.md`](../plan/w10-custodia-e-selagem.md). A selagem das noites está em
[`calendar.md`](calendar.md) §5.

Dona na W10: REQ-040 (parte estrutural), INV-2 (parte estrutural), INV-3. Fora: commands que reservam, cancelam,
selecionam, depositam ou recuperam capacidade (W12–W25); Créditos, políticas, pagamentos e settlements; telas; leituras
do Titular; INV-1 (o índice nasce aqui, a dona é a W12).

## 2. Modelo (03 §3.2)

- `second_home_date` (calendar): a noite selada. Sem ela não existe custódia nem ocupação (FKs `custody_night_sealed`
  e `custody_occupancy_night_sealed` → ERR_CAPACITY_UNAVAILABLE): operação sobre noite não selada falha fechada.
- `date_custody`: DDL do 03 com listas fechadas por `CHECK IN` e FKs que amarram à mesma Second Home a Ação
  (`custody_stake_same_second_home`, sobre o novo `UNIQUE(id, second_home_id)` de `stake`) e a custódia mãe
  (`custody_parent_same_night`). `uq_custody_active`: no máximo uma ativa por noite.
- `date_occupancy`: DDL do 03 mais `stake_id` (Ação cujo Direito de Uso fundamenta a ocupação), `opened_by_operation` e
  `released_by_operation` — exigidas pela TECH-023 ("mesma Ação", "mesma operação"). `booking_id` sem FK até a W12.
  `release_reason` só aceita `ceded` (o único nomeado pelo 03); cada wave acrescenta os motivos do próprio fluxo.
  `uq_occupancy_active`: no máximo uma ativa por noite.
- Projeções (ADR-004): `central_inventory` = noite selada + custódia ativa + ocupação ativa; `luxtory_inventory` =
  custódia ativa `luxtory/inventory`. Sem segunda fonte mutável de disponibilidade.

## 3. Barreiras (TECH-021, TECH-022, TECH-023)

| Regra | Mecanismo | Recusa |
| --- | --- | --- |
| Noite selada termina a transação com exatamente uma custódia ativa | `uq_custody_active` + gatilho no COMMIT | ERR_CAPACITY_UNAVAILABLE |
| INV-3: só as três origens; inventário exige origem e autorização | `CHECK` do 03 + gatilho da TECH-022 | ERR_CAPACITY_UNAVAILABLE |
| Raiz: primeira custódia da noite, segue a modalidade, aberta por `open_exercise` | gatilho de abertura | ERR_CAPACITY_UNAVAILABLE |
| Transição: mãe fechada pela mesma operação, dentro da tabela fechada | gatilho de abertura | ERR_CAPACITY_UNAVAILABLE |
| `luxtory/inventory → pai` repete a custódia anterior ao inventário (BR-163) | gatilho de abertura | ERR_CAPACITY_UNAVAILABLE |
| Cadeia linear, sem bifurcação | `UNIQUE(parent_custody_id)` | ERR_CAPACITY_UNAVAILABLE |
| Histórico não reescrito: só fechamento/liberação, uma vez | gatilhos de UPDATE; sem DELETE/TRUNCATE | ERR_CAPACITY_UNAVAILABLE / erro |
| Ocupação sobre custódia ativa da mesma noite, par da matriz | FK composta + gatilho (`FOR SHARE` na custódia) | ERR_CAPACITY_UNAVAILABLE |
| Custódia ocupada só fecha depois da liberação | gatilho no fechamento | ERR_CAPACITY_UNAVAILABLE |
| `ceded` só libera own_use Co-Owner sobre reserved_right da mesma Ação | `CHECK` + gatilho de liberação | erro |
| Segunda ocupação ativa da noite | `uq_occupancy_active` | ERR_BOOKING_CONFLICT |
| Fato de inventário pertence à operação da transação (`pending`) | gatilhos | erro (não é recusa funcional) |

A tabela fechada da TECH-022 está em `app.custody_transition_valid`; a matriz da TECH-023, em
`app.occupancy_pair_valid` — as mesmas funções servem aos gatilhos e à consulta de invariantes. `use_right/delinquency`
e `luxtory/{finalidade ≠ inventory}` não têm saída na TECH-022: pendências P-12 (W14) e P-13 (W27) no roadmap.
Condições de tempo (capacidade futura, prazos) ficam nos commands, com relógio injetável, nunca nos gatilhos.

## 4. Três camadas e fronteira de confiança (ADR-0024 §3–§4)

1. **Estrutural** — completa na W10 (§3).
2. **Operação concreta** — toda linha aponta para a operação `pending` da própria transação; na raiz, do command de
   sistema `open_exercise`. O banco não prova que o guard rodou (o papel da aplicação pode inserir operações): a raiz é
   autorizada pelos fatos, então uma operação forjada só obtém a selagem canônica; transições e ocupações ficam
   fechadas por duas travas — sem privilégio para o papel da aplicação e o gate `app.assert_inventory_transition_enabled`,
   que recusa todo papel que não seja o dono do schema mesmo com privilégio concedido. A wave do command substitui o
   gate pela regra de autorização decidida com o fundador, antes da primeira wave que habilitar cada transição. A
   trilha do executor (idempotência e auditoria) é gravável pelo mesmo papel: ausência = sinal de anomalia, nunca a
   presença como prova de autenticidade.
3. **Prova econômica** — fora da W10: capacidade anual Luxtory (W14, com INV-4 da W11), Créditos ao cedente (W17/W20),
   ausência de compensação na recuperação (W13), settlements apontando à ocupação/custódia (W19). A W10 garante que
   origem, autorização e tratamento sejam identificáveis (BR-161), não que o tratamento foi aplicado.

## 5. Privilégios e RLS

`luxtory_app`: SELECT nas três tabelas e nas projeções; INSERT em `second_home_date` e `date_custody`. Sem UPDATE em
`date_custody`, sem INSERT/UPDATE em `date_occupancy`, sem DELETE/TRUNCATE em nenhuma. `authenticated` e `anon`: nada.
Escrita só no servidor por SQL direto (ADR-002 do 03).

## 6. Concorrência (TECH-053)

Commands travam a noite (classe 5) antes da custódia (classe 6). Os gatilhos nunca travam a noite — um gatilho BEFORE
UPDATE trava a linha-alvo antes de rodar, e travar a noite ali inverteria a ordem. A inserção de ocupação faz
`FOR SHARE` na custódia; fechamento único, `uq_custody_active` e `uq_occupancy_active` fecham as corridas restantes.

## 7. Aceite (W10)

- [INV-3] quarta origem falha; inventário sem origem ou autorização falha (gatilho e, sem gatilhos, as constraints).
- [INV-2] par ocupação/custódia fora da matriz falha com ERR_CAPACITY_UNAVAILABLE — proteção estrutural; os Créditos e
  settlements que apontam à custódia complementam na W17/W19.
- [REQ-040] parte estrutural: entrada no Inventário Luxtory sem origem, sem autorização ou com origem incompatível com a
  custódia anterior é recusada; nenhuma entrada é executável pelo papel da aplicação sem o command da wave dona;
  reversão só volta à custódia anterior; capacidade Co-Owner nasce `spe_pool` e lá fica. Prova econômica: W13/W14/W20.
- [TECH-022] cadeias `spe_pool → reserved_right → spe_pool → reserved_right` e `owner → luxtory/inventory → owner →
  luxtory/inventory` auditáveis; bifurcação e transição concorrente da mesma custódia recusadas.
- [TECH-053] duas conexões reais, nas duas ordens: sem dupla custódia e sem ocupação sobre custódia fechada.
- Consultas de invariantes (`app.inventory_invariant_breaches`) vazias após todo teste db.
