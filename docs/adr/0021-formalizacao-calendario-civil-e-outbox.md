# 0021. Formalização atômica, base civil e outbox consumer-aware

- Date: 2026-10-23
- Status: Accepted
- Deciders: Luxtory (fundador), Engenharia
- Tags: ownership, calendar, postgresql, security

## Context

W7 resolveu identidade e representação. W8 cria relações patrimoniais por Second Home via formalize_acquisition (TECH-020/051/054), com configuração e grants iniciais conforme TECH-026.
Plano consolidado e adendo foram aprovados antes desta implementação. A classificação abaixo separa requisito de escolha de implementação.

## Decision

1. CANÔNICA: somente formalização cria holding/Ação/Direito de Uso; Owner integral; configurações imutáveis, igualdade, SPE S.A. fechada, Luxtory não acionista, administração durante operação, calendário e ledger inicial.
2. DERIVAÇÃO NECESSÁRIA: N Co-Owners significa N parties distintas com uma Ação simultânea por Second Home; pessoa jurídica da SPE resolve para party CNPJ no modelo W7.
3. HERDADA: representação vigente, Admin AAL2 sem hierarquia implícita, executor/idempotência/auditoria/outbox, SQL direto, RLS, menor privilégio e temporal-polyfill 1.0.5.
4. PROPOSTA W8: operation_start_date DATE civil e timezone imutável fundamentam o exercício; congelamento da base com a formalização protege grants contra reinterpretação. operation_start_registered_at é o instante UTC da declaração posterior. Início efetivo divergente falha fechado, sem recalcular.
5. PROPOSTA W8: alocação persiste quantidades por posição/Ação e categoria, capacidade Luxtory e base/exercício; enumera datas em memória. Não há fonte pré-formalização de compromisso de datas na base atual. Não criar tabela paralela de disponibilidade.
6. PROPOSTA W8: administração é cobertura por vigências explícitas; a união deve conter todo período operacional representado. Como só existe registro de início, esse período tem extremo final aberto: cadeias finitas precisam de cobertura final realmente sem termo. Sem presumir renovação/perpetuidade; somente contratos finitos não habilitam início. Lock da raiz + constraint diferível mantêm a cobertura após substituições.
7. PROPOSTA W8: ownership possui luxtory_legal_identity, singleton vazio na migration, FK party CNPJ, referência de base e operação. Nenhum identificador em env, documento copiado ou party automática. Provisionamento real posterior por procedimento restrito/auditado; ausência => ERR_PARAMETER_MISSING 422 no Co-Owner.
8. PROPOSTA W8: ACQUISITION_WRITES protege somente mutations novas; Production só open, local/CI explicitamente controlados, Preview sem banco produtivo. Checagem depois da autorização e antes de idempotência/efeitos; 503 REST/indisponível na ação. Não criar variável ou habilitar Production na W8.
9. PROPOSTA W8: sincronização consultiva da staff_role exata autorizadora fecha autorização → espera de locks → revogação → escrita. Compartilhada no command; exclusiva no revoke_staff_role antes do FOR UPDATE; releitura de user/role/revoked_at. Sem nova autoridade ou grants e sem mudar commands anteriores.
10. PROPOSTA W8: consumer-aware substitui a política W1 que marcava evento sem consumer como entregue. Registry fornece tipos elegíveis; store filtra no SQL antes de LIMIT/locks. Sem consumer: pending, attempts/last_error inalterados, sem receipt. Consumers futuros tornam eventos pendentes processáveis; eventos historicamente entregues não são reabertos.
11. PROPOSTA W8: RLS de Titular por delegação + holding aplicáveis; SELECT por coluna. Bases, operações e referências institucionais/administrativas ficam fora das projeções do Titular.
12. Não modelar condições comerciais financeiras sem semântica no 01/02. A base registrada do ato não é um JSON de termos nem comprova pagamento. Essa delimitação especializa a entrega anunciada no ADR-0019 §2: fatos definidos chegam na W8; valores/fluxos financeiros não definidos seguem TECH-001 e suas waves.

## Compatibilidade do outbox

Na origin/main 6ee4ae8: nenhum handler funcional chama emit; outboxConsumers está vazio. O caminho genérico de emissão está no executor/store. platform.test_happened e platform.test_widget_changed são fixtures de testes.
Um teste de infraestrutura de lote exige descarte sem consumer: será substituído explicitamente por retenção, preservando os testes de retry/recibo/concorrência. Nenhum fluxo funcional depende desse descarte.

## Consequences

Formalização é indivisível, estrutura fica verificável no PostgreSQL e o evento agendado sobrevive até W9. Não há migração de negócio mutável ou ativação produtiva.
O modelo não registra início com cobertura exclusivamente finita e não corrige base temporal divergente: limitações conservadoras explícitas, sem inventar encerramento/suspensão.
W9 implementa consumidor/sorteio; W10 possui calendário selado/custódia/Inventário; W11 expande o mesmo ledger com balances/movimentos/janelas/rotações. W8 só grant inicial, sem declarar IDs dessas waves entregues.

## Alternatives considered

Base timestamptz: adicionaria precisão de início não definida pelo domínio. Datas por alocação: pareceriam outra fonte de disponibilidade. Identidade Luxtory em env: referência efêmera sem integridade relacional.
Validar administração só no início/por cron: permitiria estado operacional descoberto após expiração. Inventar encerramento automático: sem autorização normativa.
Exceção de evento de sorteio no platform: acoplamento desnecessário; seleção genérica resolve o mesmo problema.

## Concretização técnica da W8 (2026-10-25)

- `acquisition` e `second_home_operation_start` são extensões relacionais imutáveis 1:1 da raiz Second Home já
  imutável do catálogo. Evitam conceder UPDATE na raiz; os fatos definitivos continuam pertencendo à Second Home.
  A seam pública catalog escreve essas extensões; ownership conduz a transação e escreve as relações patrimoniais.
- Datas PostgreSQL são projetadas como ISO civil textual nas consultas, sem reinterpretar `DATE` pelo timezone do
  processo JavaScript. Instantes de auditoria permanecem UTC.
- As rotas novas limitam JSON efetivo a 32 KiB, com 413/415 contratados. A leitura limitada opt-in fica depois da
  sessão verificada na entrada Admin compartilhada, preservando o parser dos endpoints anteriores e o mesmo executor.
- Rollbacks que verificam ausência de fatos adquirem locks de escrita antes do `EXISTS`, mantidos na transação.
  A regressão concorrente comprova escritor pendente → commit → recusa do down; não há janela para descartar fatos
  que se tornem visíveis durante a espera de DDL.
- A leitura Admin usa snapshot `repeatable read`, mantendo a auditoria na mesma transação. O aviso de conclusão
  consulta uma operação W8 commitada da mesma Second Home; um parâmetro de URL não comprova execução. O resultado
  dessa verificação é apenas booleano, sem ampliar campos ou privilégios do Titular.

Estas são escolhas de implementação, sem nova regra de negócio. A reconciliação com `main` b7b42a7 após o hotfix
\#65 preservou o inventário de eventos descrito acima: o hotfix alterou somente Zod/manifests, sem produtor adicional.
