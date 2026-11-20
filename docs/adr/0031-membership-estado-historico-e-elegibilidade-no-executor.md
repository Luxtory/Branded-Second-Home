# 0031. Membership: estado com histórico escrito pelo banco e elegibilidade verificada no executor

- **Date**: 2026-11-19
- **Status**: Accepted (plano da W15 aprovado pelo fundador e pela auditoria independente em 2026-11-19; C1 aprovado;
  E3 + E4 em PR draft, parada no C2)
- **Deciders**: Fundador (Luxtory), auditoria independente, agente de engenharia
- **Tags**: architecture, security, database, identity, W15

## Context

A W15 entrega REQ-011, REQ-050 e PD-001 (`02` v4.6), com TECH-030, TECH-050 e TECH-055 (`03` v3.18). Fatos do código
e dos canônicos que moldam a decisão:

- o `03` §3.1 define `membership` com `party_id UNIQUE`, plano opcional e estado; a TECH-055 fixa `active ↔ suspended`,
  `active|suspended → ended` e `ended → active`; a TECH-053 trava `membership` por `party_id` (classe 3);
- a tabela de commands da TECH-051 é fechada e não lista o ciclo de vida do Membership: ele é das "demais operações do
  REQ-095" (mesmo guard, base registrada e auditoria, sem efeito econômico novo); o faturamento de Membership está fora
  de escopo (`03` §15) e a TECH-090 não tem job de Membership;
- o registro de commands já tem a coluna "Membership" da TECH-051 (`eligible` / `not_required` / `not_applicable`) e a
  classe de trava `membership`, sem nenhum consumidor; `ERR_MEMBERSHIP_INELIGIBLE` já está no catálogo e no OpenAPI;
- o slice `ownership` importa o `identity`: o `identity` não pode importar o `ownership` sem ciclo.

## Decision

1. **Sem plano, preço, prazo ou cobrança (D1, D3).** Nem `membership_plan_version` nem coluna de plano: nenhum plano,
   benefício, prioridade ou preço está aprovado (P-5; TECH-030 "planos não são inventados"). Sem validade, renovação,
   job ou cobrança; a não renovação (BR-320) pode ser a base registrada de um encerramento administrativo, sem
   expiração automática. A BR-141 continua vigente; a W15 não fatura.
2. **Estado atual + histórico escrito pelo banco.** `app.membership` guarda o estado atual (uma linha por party,
   `conflict_membership_party`); `app.membership_transition` é o histórico append-only, uma linha por mudança com a
   operação como chave, escrita por um gatilho `AFTER` a partir da linha já validada. O papel da aplicação não tem
   INSERT no histórico; a função do gatilho é `SECURITY DEFINER` com `search_path = pg_catalog, pg_temp` e sem EXECUTE
   para PUBLIC. A reativação depois do encerramento (`ended → active`) reusa a mesma linha: nunca há segundo Membership.
3. **Procedência e autoridade no banco (padrão da W14).** O gatilho `BEFORE` de `app.membership` exige: par da TECH-055;
   operação `pending` da transação corrente (`app.assert_operation_in_transaction`); o command da transição
   (`activate_membership` na criação, `suspend_membership`, `reactivate_membership`, `end_membership`); operação sem
   Second Home e sem party representada; atribuição Admin ativa do autor, revalidada com trava compartilhada
   (`app.lock_own_use_admin_authority`, W13/W14); operação nova a cada mudança. Autor, autoridade e instante vêm da
   operação e de `clock_timestamp()`, nunca da entrada: o papel da aplicação só grava `state`, `basis` e `operation_id`
   (privilégio por coluna), não apaga nada e não altera party nem origem. O down recusa com linhas.
4. **D2 — só party Titular passa a `active`.** Decisão de elegibilidade da W15 aprovada pelo fundador, não texto
   literal dos canônicos (que definem Membership como associação de "CPF ou CNPJ titular" e "condição do Titular").
   Garantida no mesmo gatilho: toda passagem a `active` exige holding vigente da party no instante. Só a validade da
   holding é lida, como nas políticas de leitura do Titular (W8) e nos gatilhos da reserva (W12) — sem função nova no
   `ownership` nem importação entre slices. O Membership continua da party, nunca da holding: perder a holding não
   encerra nem suspende (efeitos prospectivos, BR-320). A regra não se estende a modelos futuros de participação no
   Club ainda não definidos (por exemplo, proprietários de empreendimentos parceiros).
5. **Elegibilidade verificada no instante da ação, no executor (E3).** O executor ganha uma verificação transacional
   para os commands com Membership `eligible` na TECH-051: o handler a chama no ponto certo da sua sequência de
   travas, ela trava `membership` com `FOR SHARE` por `party_id` (classe 3 da TECH-053, mantida até o commit) e recusa
   com `ERR_MEMBERSHIP_INELIGIBLE` se o estado não for `active`. O executor confere no fim do handler, nos dois
   sentidos: um command `eligible` que não comprovou a elegibilidade da party que age falha fechado (rollback); um
   command `not_required` ou `not_applicable` que chama a verificação também falha — uso próprio e indicação de
   convidados ficam estruturalmente independentes de Membership. Commands que não chamam a verificação não mudam de
   comportamento. Elegível = `active`; a verificação recebe a especificação do command para que restrições aplicáveis
   ao mecanismo (inadimplência BR-290, conformidade BR-020) entrem no mesmo ponto nas suas waves. Obrigação futura
   registrada: o aceite de Request (REQ-064) verifica as duas parties.
6. **Sem capability nova (D4).** Operação Admin sem efeito econômico e sem mecanismo do Club existente; K1/K2/K3
   continuam fechadas. Depois do deploy, criar ou alterar Membership real em Production exige autorização operacional
   expressa do fundador.

## Consequences

- PD-001 é garantido pelo banco (party única por CPF/CNPJ na W7 + `conflict_membership_party`), inclusive entre
  transações concorrentes; transições fora da TECH-055 e escritas forjadas são recusadas pelo banco.
- A suspensão concorrente respeita a TECH-053: uma ação com `FOR SHARE` segura a mudança até o commit; uma mudança em
  curso faz a ação esperar e reler o estado confirmado (READ COMMITTED).
- O Membership não tem FK nem gatilho para holding, Ação, Direito de Uso, rotação, reserva ou custódia; a migration só
  acrescenta objetos (prova de preservação do catálogo).
- Risco residual: um servidor comprometido com a credencial do `luxtory_app` pode gravar uma operação citando uma
  atribuição Admin ativa real (o banco não autentica a sessão) — o mesmo da W14; o histórico e a auditoria registram.
- O fechamento de Requests pendentes por perda de elegibilidade (TECH-024, `03` §3.2) entra nos commands de suspensão
  e encerramento quando a Request existir (W21/W22), não antes.

## Alternatives considered

- **Histórico só por inserção, estado derivado (sem UPDATE).** Igual ao padrão da W14, mas exige ordem total entre
  mudanças (cadeia ou relógio) e trava consultiva no lugar da trava de linha da TECH-053. Rejeitada: o estado atual
  numa coluna é mais simples de travar e de ler, e o histórico continua imutável.
- **Ler a auditoria como histórico.** Acopla a tela ao `audit_log` e não dá garantia no banco. Rejeitada.
- **Verificação de elegibilidade só por convenção nos handlers.** Uma wave futura poderia esquecê-la. Rejeitada em favor
  da pós-condição no executor, com custo pequeno.
- **K4 fechada.** Plumbing sem proteção real (nenhum efeito econômico). Rejeitada (D4), com a ressalva operacional.
- **Checar a titularidade no handler via porta do `ownership`.** Exigiria compor fora do `identity` (ciclo de
  importação) e repetiria no app o que o banco já garante. Rejeitada.
