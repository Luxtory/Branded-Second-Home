# 0026. Reserva de uso próprio: autorização no banco presa à reserva, ativação privilegiada e instante de aceite

- Date: 2026-10-31
- Status: Accepted (arquitetura); risco residual **pendente de ratificação** pelo fundador, na auditoria da implementação
- Deciders: Luxtory (fundador), Engenharia
- Tags: booking, inventory, calendar, identity, postgresql, security

## Context

A W12 entrega a reserva de uso próprio (`02` REQ-034, REQ-035, REQ-037, PD-002, INV-1; `03` TECH-023, TECH-045,
TECH-051, TECH-055). Pela condição de resolução do ADR-0024 §3 e do ADR-0025 §8, antes de habilitar a transição
`spe_pool → use_right/reserved_right`, o consumo do Direito de Uso e a ocupação, a wave dona decide com o fundador a
autorização no banco; as ratificações da W10 e da W11 não se estendem. A diferença central da W12: a reserva depende da
**intenção do Titular**, que o banco não autentica (o servidor verifica a sessão ES256; o `luxtory_app` cria e ativa
delegações, grava operação, auditoria, notificação e outbox). Plano:
[`docs/plan/w12-reserva-de-uso-proprio.md`](../plan/w12-reserva-de-uso-proprio.md).

## Decision

1. **Fronteira do servidor + regra no banco presa à reserva (A1).** O guard do Titular autoriza
   (`user → party_delegation → party → holding`, TECH-050) e o handler revalida na transação. Os gates da W10/W11 deixam
   de valer para o papel da aplicação **só** em três casos, todos da mesma operação `create_own_use_booking` e da
   reserva que ela abriu: fechar `spe_pool` e abrir `use_right/reserved_right` da Ação da reserva; `consume` dessa
   `reserved_right`; ocupação `own_use` da reserva. Toda outra transição, fechamento, ocupação, a liberação, `restore` e
   `correction` continuam fechados. A reserva (`app.booking`, uma por operação) só nasce com: operação pendente do
   command e do papel `titular`; delegação ativa do usuário para a party (travada em `FOR SHARE` contra a revogação);
   holding vigente da party na Second Home, com a Ação dela; ≥ 1 noite, todas seladas e futuras (TECH-043); no
   Co-Owner, ≤ 14 noites e janela aberta de cada exercício e do 29/02 (função SQL gêmea da TypeScript, equivalência
   testada); só o canal `own_use`. No COMMIT (constraint triggers disparadas pela reserva, pela ocupação e pelo
   consumo): cada noite tem exatamente uma ocupação da reserva; no Co-Owner, a custódia `reserved_right` e um consumo da
   operação; no Owner, nada além da ocupação; e a sequência de noites consecutivas da Ação com `own_use` ativa que toca a
   reserva não passa de 14 (BR-112: preencher o intervalo entre duas soma as três). `SET CONSTRAINTS … IMMEDIATE` só
   antecipa: a FK obriga a reserva antes da ocupação, então a checagem antecipada falha; inserções seguintes disparam
   de novo. Um consumo por (operação, Ação, noite) impede o reaproveitamento de operação `pending`.
2. **Ativação privilegiada.** `app.capability_activation` (`own_use_booking`), que só o dono do schema escreve; o
   `luxtory_app` só lê. Sem a linha, cada escrita da W12 pelo papel da aplicação é recusada (`booking_not_activated`),
   inclusive SQL direto. A W12 cria a tabela vazia; a ativação é migration própria, depois da W13 em Production e de
   autorização específica do fundador. Desativação: migration com `LOCK … ACCESS EXCLUSIVE` + `DELETE` (espera as
   reservas em curso, que seguram a tabela em modo compartilhado, e barra as novas). Break-glass manual só documentado,
   nunca pré-autorizado: exige decisão expressa, registro da exceção ao ADR-0006 item 4 e reconciliação por migration
   espelho. O handler confere a ativação **dentro** da transação, depois da consulta de idempotência: o replay de uma
   chave já confirmada continua possível com a ativação removida (só lê a resposta gravada). A ausência é
   funcionalidade fechada (`OwnUseBookingNotActivatedError`): rollback sem recusa gravada; a Server Action responde e
   registra "não ativada", nunca "auth unavailable". A variável de ambiente prevista no plano inicial foi descartada:
   não protegia a escrita direta.
3. **Instante de aceite (T3).** O banco não garante o instante físico do COMMIT. `confirmed_at` é um único
   `clock_timestamp()` capturado no gatilho que valida a reserva — o instante de aceite pelo mecanismo de reserva, não o
   do COMMIT nem o da visibilidade —, e todas as checagens da linha usam esse instante (janela aberta, representação
   vigente, noites futuras). Cada escrita seguinte (custódia, consumo, ocupação) revalida representação e noite futura
   no próprio instante. O fechamento da custódia é carimbado pelo banco. W10 e W11 seguem com `now()`.
4. **Travas (TECH-053).** Autoridade primeiro (`FOR SHARE` na delegação, precedente ADR-0021); classe 4 = trava
   consultiva `app.stake:<id>` (Co-Owner; o gatilho da reserva a toma de novo, então saldo e permanência concorrentes se
   serializam no banco); classe 5 = travas consultivas `app.second_home_date:<home>:<data>` em ordem crescente; classe 6
   = custódia e saldo noite a noite. Consultivas porque `stake` e `second_home_date` são imutáveis e sem UPDATE para a
   aplicação (precedente `app.party:`); nenhuma invariante depende delas, salvo a permanência, protegida pela trava do
   gatilho.
5. **Leitura do Titular.** Linhas por RLS (holding vigente representada, política da W8); campos por privilégio de
   coluna: a própria reserva e o próprio saldo, as noites seladas da Second Home, a disponibilidade como fato (custódia
   e ocupação ativas, sem Ação nem reserva de terceiros) e as próprias notificações (`app.notification` ganha RLS).
6. **Notificação (REQ-097).** `booking.own_use_confirmed` com a party que reservou fixada no evento; a notificação fica
   com ela numa transferência futura (W28 decide avisar o novo titular).

## Risco residual da W12 (ratificação pendente)

R1 reserva forjada canonicamente válida em nome de Titular vigente, só com a ativação presente (Co-Owner até o saldo das
janelas abertas em permanências ≤ 14; Owner, todas as noites seladas livres; notificação gerada ou suprimida); R2 COMMIT
de transação forjada depois do check-in, com as escritas validadas antes; R3 dono/superusuário contornam gatilhos,
sessão pendurada atrasa a desativação, credencial comprometida exige troca de senha; R4 reserva forjada a menos de 15
dias do check-in não volta por cancelamento tempestivo (a W13 decide antes da ativação); R5 trilhas não provam
autenticidade até o selo da W30. Provas: `tests/migrations/booking.db.test.ts` e
`tests/features/booking/own-use-booking.db.test.ts` (privilégios reais).

## Consequences

- O guard do Titular passa a existir (`authority: 'titular'`), com o diretório de holdings injetado por quem executa
  (identity não importa ownership).
- A W13 recebe: cancelamento e restauração (substituindo o gate de `restore` e a liberação da ocupação), o remédio de R4
  e a pré-condição da migration de ativação. A W21/W22 abre o `reserved_right` devolvido com o teste da TECH-023. A W28
  serializa a transferência contra a reserva (classe 4 para Co-Owner; a definir para Owner).
- Fixtures de inventário que gravam ocupação criam uma reserva-fixture pelo dono em modo réplica, fora das invariantes
  da reserva.

## Alternatives considered

- **Função `SECURITY DEFINER` como único caminho:** não autentica a intenção (identidade continua parâmetro), duplica o
  command em PL/pgSQL e transforma bug em privilégio de dono.
- **Papel ou credencial separada para reservas:** as duas credenciais ficam no mesmo servidor; exige segundo pool, senha
  fora das migrations e o executor inteiro sob o novo papel. Registrada como endurecimento possível no R4 do roadmap.
- **Intenção assinada pelo usuário:** ES256 não é verificável em PL/pgSQL; passkey seria UX nova fora do `02`.
- **PostgREST com o token do usuário:** vedado pelo `03` §13.
- **Checagem temporal no COMMIT por gatilho diferido:** `SET CONSTRAINTS … IMMEDIATE` a antecipa e o COMMIT não reavalia.
- **`now()` em tudo:** uma transação aberta cedo poderia escrever depois do check-in com o relógio congelado.
- **Carimbo de COMMIT (`track_commit_timestamp`):** só detecta depois e exige reinício do banco; opção da W30.
- **Variável de ambiente como gate:** não protege a escrita direta pelo papel do banco.
- **Seleção de várias datas em uma confirmação atômica (legado Luxtory2.0):** a reserva canônica tem um período; o tudo
  ou nada perde todos os períodos num conflito na abertura da janela; fica como oportunidade futura.
