# 0023. Carimbo de COMMIT do servidor na anterioridade do sorteio (T-910)

- Date: 2026-10-29
- Status: Accepted
- Deciders: Luxtory (fundador), Engenharia
- Tags: ownership, security, postgresql, randomness

## Context

A anterioridade do compromisso do sorteio (TECH-093, ADR-0022 §4) era imposta por um gatilho diferido no COMMIT e pelo
`transaction_timeout`, ambos dependentes do comportamento do código da aplicação. A investigação de 2026-10-29
classificou o limite como T-910 (HIGH, não coberto pela D5, bloqueante da ativação); o relatório técnico está em
Security Advisory privado. O fundador aprovou a opção 2 e a mitigação por carimbo de COMMIT do servidor, em entrega
própria, sem reabrir a W9, sem novos mecanismos de recuperação ou repetição e com Production inalterado até uma mudança
planejada de configuração.

## Decision

1. A revelação exige uma evidência imutável do COMMIT do compromisso, `initial_draw_commit_evidence`, cujo
   `committed_at` é calculado por gatilho não diferível a partir do carimbo que o servidor registra para a transação do
   compromisso (`track_commit_timestamp`). O valor enviado pela aplicação nunca prevalece; carimbo indisponível ou
   posterior ao `commit_deadline` → recusa.
2. Recusa segura: com `track_commit_timestamp` desligado, o banco recusa compromissos e evidências. Nenhum compromisso
   nasce sem poder ser comprovado depois.
3. Um consumidor próprio grava a evidência na primeira entrega do evento de revelação, antes da revelação e mesmo com o
   beacon fora do ar, para que sorteios pendentes por muito tempo não dependam da retenção dos carimbos.
4. O PostgreSQL de teste sobe com `track_commit_timestamp=on`; um servidor desligado prova a recusa segura. Production
   (Supabase) só habilita a configuração com autorização do fundador, janela e testes posteriores, antes de qualquer
   ativação do sorteio.

## Consequences

### Positive

- A anterioridade passa a depender de um registro do servidor, fora do alcance do papel da aplicação.
- A evidência imutável torna a revelação independente da retenção dos carimbos.
- Sem a configuração, o sistema falha fechado, sem resultado parcial.

### Negative

- Exige reinício do banco no Supabase para habilitar a configuração.
- Compromisso sem evidência cujo carimbo tenha sido descartado (congelamento do cluster além da transação, restauração
  lógica, migração de servidor) fica pendente sem caminho técnico; exige decisão do fundador.
- Superusuário do banco continua fora do alcance da mitigação (D5); a ancoragem externa da W30 complementa.

## Alternatives considered

- Selagem em transação própria antes da rodada: não oferece garantia contra o mesmo ator.
- Ancoragem externa imediata: dependência externa e latência; escopo da W30.
- Aceitar o risco: rejeitado pelo fundador.

## References

- Spec [`ownership` §16.3 e §16.8](../specs/ownership.md), [ADR-0022](0022-sorteio-auditavel-e-elegibilidade-temporal-do-outbox.md),
  STRIDE T-910 em [`docs/security/threats/ownership.md`](../security/threats/ownership.md)
- `docs/specs/canonical/03-technical-spec.md`: TECH-093, TECH-110; `02`: PD-011; `01`: BR-100
