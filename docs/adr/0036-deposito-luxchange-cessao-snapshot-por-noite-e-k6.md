# 0036. Depósito Luxchange: cessão integral da reserva, snapshot por noite, completude no banco e K6

- **Date**: 2026-11-23
- **Status**: Accepted (W20 iniciada pelo fundador em 2026-11-23; branch isolada, PR draft)
- **Deciders**: Fundador (Luxtory), agente de engenharia
- **Tags**: architecture, security, database, luxchange, inventory, booking, credits, W20

## Context

A W20 entrega REQ-051 e REQ-060 (`02` v4.6) com TECH-022, TECH-023, TECH-043 e TECH-051 (`03` v3.19). Fatos que moldam a
decisão:

- O depósito troca, num só resultado, capacidade elegível por Créditos (BR-200–BR-203, `03` §7 "Depósito: capacidade
  elegível → `luxchange_cession` + Créditos"). Owner: capacidade própria disponível e não comprometida; Co-Owner: só data
  já reservada no seu Direito de Uso, que **permanece consumida** (REQ-060). Antecedência: `now ≤ checkin_at − 14 dias`
  (TECH-043). Membership elegível (BR-146, TECH-051). Créditos da data = PRL da data × multiplicador (`01` §20).
- TECH-023: "`ceded` só libera `own_use` Co-Owner sobre `reserved_right` da mesma Ação. Reserva Owner precisa ser
  cancelada antes de cessão/locação." Créditos apontam às custódias que os originaram.
- A W10 já fechou a tabela de transições (`owner | reserved_right → luxtory/inventory/luxchange_cession` presente) e a
  matriz de ocupação; a W13 prende cada transição de estado da reserva a um command, com efeitos completos conferidos no
  COMMIT; a W16 resolve PRL por período contínuo; a W17 persiste o snapshot (instante + parâmetros) e decide a originação
  no banco, deixando para a W20 as noites de PRL, o multiplicador e o vínculo com a custódia (ADR-0033, follow-ups).
- O cancelamento convencional não serve: o tempestivo restaura o Direito de Uso e o tardio cria `forfeited_right`.
- A reserva tem um único estado (TECH-055) e o W13 deriva classe, no-show, avanço e invariantes do período inteiro.

## Decision

1. **Natureza de transição `cession`.** `app.booking_state_transition.kind` ganha `cession`, só `confirmed → cancelled`,
   sem classe de cancelamento e sem base. Só uma operação `deposit_capacity` a grava, com a K6, o Titular que representa
   a party da holding da reserva (mesma trava do cancelamento), Membership `active` (`FOR SHARE`), reserva Co-Owner, todas
   as noites ainda não iniciadas e `clock_timestamp() ≤ 1º checkin_at − 336 h`. A unicidade "um evento por operação"
   continua para as outras naturezas; na cessão vale uma transição por (operação, reserva), para que um depósito ceda
   várias reservas da mesma holding.
2. **Cessão integral.** O Co-Owner cede reservas inteiras (todas as noites). Ceder parte deixaria uma reserva `confirmed`
   com noites no Inventário, quebrando avanço, no-show, cancelamento e invariantes da W13; segmentar a reserva seria
   funcionalidade nova. BR-151 é atendida: o Co-Owner reserva as noites que quiser ceder (mínimo 1).
3. **Regras de escrita do depósito no banco (`app.luxchange_deposit_write`).** Toda escrita da cessão pelo papel da
   aplicação exige: K6; operação `pending` da transação, command `deposit_capacity`, papel Titular, Second Home da
   operação; representação travada da party que age; Membership `active` `FOR SHARE`; noite selada com antecedência de
   14 dias; noite presente no snapshot da operação. Ramos próprios, antes dos da W13, em `date_custody_close` (origem
   `owner` da holding Owner vigente, sem ocupação; ou `reserved_right` da reserva cedida na mesma operação),
   `date_custody_open` (sucessora `luxtory/inventory/luxchange_cession` com `authorization_ref = 'deposit_capacity:<op>'`)
   e `date_occupancy_release` (só `ceded`, da reserva cedida na mesma operação). Uma operação de depósito nunca usa os
   caminhos da W13 e vice-versa. **Toda escrita do depósito e toda noite do snapshot acontecem na transação do próprio
   snapshot** (`economic_snapshot.created_at ≥ now()`): uma operação `pending` reaproveitada noutra transação (o papel
   da aplicação consegue comitar sem marcar a operação, ADR-0024 §3) não acrescenta noites nem cessões a um depósito
   já conferido no COMMIT (auditoria da W20).
4. **Snapshot por noite.** `app.economic_snapshot_night(operation_id, second_home_id, stay_date, prl_id)`, só-inserção,
   FK para a versão imutável de `app.prl` e para a noite selada; o banco confere que a versão é a vigente
   (`app.prl_at`) no `resolved_at` do snapshot e que todas as noites são da mesma Second Home. O resolvedor
   `EconomicTerms` aceita um conjunto explícito de noites: uma leitura do intervalo que as cobre (mesma trava e instante)
   e só as noites pedidas entram no total; noite intermediária não é precificada.
5. **Quantidade decidida no banco.** Na originação de `deposit_capacity`, o gatilho do lote exige multiplicador e noites
   no snapshot e `quantidade × 100 = Σ PRL (unidade mínima) × multiplicador` (exato, `numeric`; BRL com 2 casas). O
   servidor calcula com `creditsForPrl` e o banco confere — nenhum arredondamento, padrão ou valor do cliente.
6. **Completude no COMMIT.** Um gatilho de constraint adiado em `app.economic_snapshot` chama
   `app.assert_luxchange_deposit_complete(op)` para operações `deposit_capacity`: noites do snapshot = custódias
   `luxchange_cession` abertas pela operação (cada uma sucedendo `owner` ou `reserved_right` fechada por ela, nada mais
   aberto ou fechado), exatamente um lote da party que age com a quantidade do item 5, toda reserva de origem cedida por
   inteiro com transição `cession` da operação e ocupações liberadas com `ceded`, nenhum movimento do ledger do Direito de
   Uso, nenhuma outra transição ou liberação. Toda escrita do depósito exige o snapshot, então nenhum fato de cessão ou
   lote de depósito escapa da verificação. `app.luxchange_invariant_breaches()` repete as regras após todo teste `db` e
   para a reconciliação futura.
7. **K6 `luxchange_deposit` e K7 `luxchange_exchange` fechadas.** O CHECK de `app.capability_activation` ganha as duas,
   sem linha. K6 abre a cessão do depósito; o lote continua exigindo a K4. **K7 abre os movimentos de Créditos de
   Request e Direct** — originação no aceite, Garantia (`send_request`), consumo (`accept_request`, `create_direct`) e
   liberação (`withdraw_request`, `reject_request`): a W17 deixou esses mecanismos prontos sem o lastro no banco, que
   chega nas W21–W23; com a K4 ligada só para o depósito, um servidor comprometido poderia originar Créditos por um
   aceite forjado ou gastar Créditos por Garantia/Direct forjados (reproduzido na auditoria). Depósito = K4 + K6;
   intercâmbio = K4 + K7, só depois do lastro da wave dona. Ativar exige migration e autorização do fundador; o rollback
   é recusado com fato de depósito ou sob ativação.
8. **Termos revisados = o que o Titular viu.** O command recebe o total de Créditos e a validade (meses) que o Titular
   revisou e os compara, por igualdade exata, com o recálculo no instante transacional; diferença → recusa com
   `ERR_DEPOSIT_TERMS_CHANGED`, sem efeito (precedente D7 da W13). O contrato é a igualdade dos termos apresentados, não
   a identidade das versões: o Titular nunca vê o PRL (REQ-100), e nenhum canônico exige versões idênticas no depósito.
   Uma publicação que não muda o total nem a validade (ex.: alterações que se compensam entre noites) confirma, e o
   snapshot registra as versões efetivamente usadas (REQ-052, TECH-031). Nada é originado com termos que o Titular não
   viu.
9. **Sem PRL em dinheiro para o Titular.** A jornada mostra Créditos por noite e o total; nunca o PRL em reais (REQ-100,
   ADR-0032 §10). A prévia é leitura do servidor; o command é a única fonte de efeito.

## Consequences

### Positive

- REQ-060, INV-2, INV-3 e INV-6 garantidos pelo PostgreSQL mesmo com servidor comprometido: cessão sem Créditos,
  Créditos sem cessão, quantidade divergente, noite alheia, `forfeited_right`, `spe_pool`, restituição do Direito de Uso
  e uso de caminho da W13 são recusados.
- Procedência rastreável: lote, custódias e noites do snapshot ligados pela mesma operação; a custódia leva a referência
  do depósito.
- Commands e efeitos das W12–W19 inalterados (ramos novos antes dos caminhos existentes; provas de preservação).

### Negative

- O Co-Owner não cede parte de uma reserva de várias noites (precisa reservar exatamente o que quer ceder).
- A regra de completude percorre os fatos da operação no COMMIT (custo proporcional às noites, até 366).
- A originação por `accept_request` continua só com a regra da W17 até a W22 (K4 fechada).

### Neutral / follow-ups

- W21: depósito encerra Requests pendentes incompatíveis (TECH-024) — gatilho da wave dona; Garantia com a K7 e o
  lastro da Request no banco; a recusa de uma Request nunca desfaz um depósito anterior (definitivo, BR-171).
- W22: originação pelo aceite exige, no banco, cessão da capacidade do cedente, consumo da Garantia e encerramento das
  concorrentes na mesma operação (substitui a regra atual de "só com a K7"); reutiliza `cession` e o snapshot por noite.
- W23: Direct consome `luxtory/inventory/luxchange_cession` com a K7 e as regras do Inventário.

## Alternatives considered

- **Usar `cancel_own_use_booking`.** Restauraria o Direito de Uso (tempestivo) ou criaria `forfeited_right` (tardio).
  Rejeitada (REQ-060, TECH-022).
- **Relaxar a validação de transições da W13.** Abriria caminhos não autorizados. Rejeitada.
- **Cessão parcial com segmentação da reserva.** Estrutura nova (nova reserva, religação de consumo e convidados) sem base
  canônica. Rejeitada.
- **Tabela de cabeçalho do depósito.** Redundante: operação, snapshot por noite, custódias e lote já formam o vínculo.
  Rejeitada.
- **Só a K4.** Ativar Créditos para Request/Direct abriria a entrada no Inventário por cessão. Rejeitada.
- **Banco calculando os Créditos sozinho.** O servidor apresentaria um valor e o banco gravaria outro sem conferência.
  Rejeitada em favor do cálculo no servidor conferido pelo banco (mesmo padrão da validade, ADR-0033).
- **Uma consulta de PRL por noite.** Vários instantes de resolução e travas repetidas. Rejeitada.
