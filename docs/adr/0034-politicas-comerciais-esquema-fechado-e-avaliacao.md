# 0034. Políticas comerciais: esquema fechado por mecanismo, versões append-only e avaliação pura

- **Date**: 2026-11-22
- **Status**: Accepted (W18 iniciada pelo fundador em 2026-11-22; PR draft)
- **Deciders**: Fundador (Luxtory), agente de engenharia
- **Tags**: architecture, security, database, pricing, W18

## Context

A W18 entrega REQ-082, REQ-104 e PD-009 (`02` v4.6) com TECH-030, TECH-031, TECH-032 e TECH-051 (`03` v3.18). Fatos:

- TECH-032: política versionada com **schema fechado** para `luxchange_request · luxchange_direct · luxplus ·
  rental_external`; a avaliação recebe snapshot + evento e produz somente efeitos normalizados sobre `capacity · credits
  · fee · money · remuneration`; os commands aplicam os efeitos pelos mesmos eixos/ledgers; política nunca contorna
  BR-163 ou INV; sem política vigente o compromisso não confirma.
- PD-009: a política define prazo e efeitos; valores e regras são configuração comercial versionada; na Request é aceita
  antes do envio, nos demais antes da confirmação; fica vinculada à operação. Limite: nenhuma política contraria a BR-163
  nem um INV (BR-360, BR-361).
- BR-163: cancelamento, reversão ou liberação devolve a capacidade à origem econômica imediatamente anterior, salvo
  exceção expressa no `01`. A única exceção é a BR-284 (uso próprio Co-Owner), fora dos quatro mecanismos.
- TECH-070: reversão de consumo de Créditos só por política aplicável; nunca cria quantidade, muda party ou transfere.
  Não há movimento que desfaça uma originação. TECH-082: Fee nunca vira Crédito.
- `03` §7: Request aceite = cessão + reserva + consumo da Garantia + Créditos ao cedente; Direct = Inventário + Créditos
  + Fee; Luxplus = Inventário + pagamento (receita Luxtory, REQ-070); locação = reserva externa + settlement do Titular.
- TECH-030: `commercial_policy` é append-only/versionada com `scope · value/config · effective_from/effective_to ·
  authority · authorization_ref · created_at · created_by`; versões vigentes do mesmo escopo não se sobrepõem.
- TECH-051: `publish_policy` = Admin + base registrada. `ERR_POLICY_MISSING` está no catálogo (`03` §6).
- Nenhuma operação dos quatro mecanismos existe antes da W21. P-11: o TECH-051 não tem command de cancelamento para os
  mecanismos do Club.
- Precedentes: `app.parameter` (W14/W16, ADR-0030 §3, ADR-0032 §6–§7); `EconomicTerms` e snapshot nascendo com o
  primeiro efeito (ADR-0032 §8, ADR-0033 §4).

## Decision

1. **Esquema fechado v1.** `config` é um objeto JSON com exatamente `cancellation`, `no_show` e `exception`:

   ```json
   {
     "cancellation": [
       { "min_notice_hours": 720, "effects": { "capacity": "return_to_origin", "credits": "1", "fee": "0" } },
       { "min_notice_hours": 0,   "effects": { "capacity": "return_to_origin", "credits": "0", "fee": "0" } }
     ],
     "no_show":   { "capacity": "return_to_origin", "credits": "0", "fee": "0" },
     "exception": { "capacity": "return_to_origin", "credits": "1", "fee": "1" }
   }
   ```

   - Faixas de cancelamento: 1 a 5, `min_notice_hours` inteiro em [0, 8760], estritamente decrescente, a última igual a
     0. Antecedência = horas inteiras entre o evento e o check-in do snapshot; a última faixa cobre também o evento após
     o check-in. Cobertura completa: nenhum instante cai fora de faixa (nenhum padrão implícito).
   - Eixos por mecanismo (conjunto exato, nem mais nem menos):

     | Mecanismo | capacity | credits | fee | money | remuneration |
     |---|---|---|---|---|---|
     | `luxchange_request` | ✓ | ✓ | ✓ | — | — |
     | `luxchange_direct` | ✓ | ✓ | ✓ | — | — |
     | `luxplus` | ✓ | — | — | ✓ | — |
     | `rental_external` | ✓ | — | — | ✓ | ✓ |

     Request e Direct não têm valor monetário além do Fee; Luxplus não remunera o cedente (REQ-070); os Créditos do
     cedente na Request têm originação própria e o TECH-070 não tem movimento que desfaça originação, por isso a
     Request não tem `remuneration`. Ampliação só por nova versão do esquema (migration + ADR).
   - Semântica: `capacity` é sempre `return_to_origin` — noites não iniciadas voltam à origem imediatamente anterior
     (BR-163); `credits` = fração dos Créditos consumidos revertida aos lotes de origem (TECH-070); `fee` = fração do
     Fee devolvida em dinheiro (TECH-082); `money` = fração do valor pago devolvida; `remuneration` = fração da
     remuneração do beneficiário mantida. Frações canônicas em [0, 1] (`0`, `1` ou `0.` + até 6 casas sem zero final).
   - Regras estruturais (REQ-104): fração > 1 cria valor (INV-6, PD-010) e é recusada. Frações de eixos diferentes
     **não se somam**: na locação, `money` incide sobre o valor bruto pago pelo locatário e `remuneration` sobre a
     receita líquida do Titular (BR-253/BR-260: bruto menos gestão, comissões, tributos e taxas). A conservação é
     conferida na avaliação, com os valores de cada base (§5).
   - **Emenda (2026-11-22, auditoria do fundador):** a versão inicial exigia `money + remuneration ≤ 1`, removida por
     somar frações de bases distintas — recusava políticas economicamente possíveis (ex.: bruto R$ 10.000, líquido
     R$ 6.000; devolver 50% e manter 75% retém R$ 5.000 e mantém R$ 4.500, sem valor criado) e não protegia BR-163
     (capacidade, eixo fixo) nem BR-270/INV-2 (decididos pela custódia na aplicação, W25).
2. **Validação em três camadas.** Zod (forma), `validatePolicyConfig` no domínio (regras e códigos de recusa) e
   `app.commercial_policy_config_valid(mechanism, config)` (IMMUTABLE) no CHECK da tabela. As três aplicam o mesmo
   esquema; o banco é a última palavra.
3. **Versões append-only.** `app.commercial_policy(id, mechanism, schema_version, config, effective_from, effective_to,
   authority, authorization_ref, created_at, created_by, operation_id)`: procedência pela operação `publish_policy`
   `pending` da transação (command, papel, autor), autoridade de staff revalidada (`lock_own_use_admin_authority`),
   trava `app.commercial_policy:<mecanismo>`, início carimbado pelo banco e nunca retroativo, depois de todos os inícios
   e nunca antes de término explícito; `forbid_change` em UPDATE/DELETE/TRUNCATE; leitura só pelo `luxtory_app` (RLS).
   `app.commercial_policy_at(mecanismo, instante)` devolve a versão vigente ou nada. Rollback recusado com histórico.
4. **Ordem de locks.** Classe `commercial_policy` em `LOCK_ORDER` depois de `luxtory_capacity` e antes de `parameter`:
   resolução toma a trava compartilhada antes de ler o instante do banco; publicação, a exclusiva.
5. **Avaliação pura.** `evaluatePolicy(policy, snapshot, event)` (`event`: `cancellation` com instante, `no_show`,
   `exception`) exige que o snapshot traga exatamente os valores dos eixos do mecanismo e o check-in; devolve
   `{ policyId, mechanism, event, minNoticeHours, capacity: 'return_to_origin', credits?, fee?, money?, remuneration? }`
   com parte devolvida/mantida. Na locação, a avaliação exige líquido ≤ bruto no snapshot (BR-253/BR-260) e
   remuneração mantida ≤ valor retido do locatário (o excedente seria compensação não prevista, PD-010); a partilha do
   retido entre Titular e deduções é do settlement (W19/W25). Dinheiro: devolução = `HALF_UP` (unidade mínima) uma única vez, mantido = total −
   devolução; Créditos: exatos. Determinística: mesmos dados, mesmo resultado; sem relógio implícito.
6. **Resolução e aceite.** `resolveEconomicTerms` aceita `policy: { mechanism, acceptedPolicyId }`, trava em
   compartilhado, e devolve `terms.policy` vigente no `resolvedAt`; sem versão vigente, ou com `acceptedPolicyId`
   diferente da vigente (política mudou entre a apresentação e a confirmação), `ERR_POLICY_MISSING`. O vínculo
   persistente da versão ao snapshot da operação é criado pela W21, na mesma transação do primeiro efeito, com FK e
   gatilho de vigência (mesmo padrão de `economic_snapshot_parameter`).
7. **Eventos e commands.** Cancelamento nos mecanismos do Club: avaliado só no domínio até P-11 (D6), nenhum command
   novo. No-show e exceção: avaliados pelos commands existentes quando a reserva for de mecanismo do Club (W22–W25);
   reserva de uso próprio não tem política (W13 inalterada).
8. **Nada ativado.** Sem capability nova; nenhuma política por migration ou seed; publicar política não ativa
   mecanismo.

## Consequences

- **Positivas:** REQ-104 garantido também contra o servidor (CHECK no banco); avaliação testável sem operação;
  mecanismos W21–W25 recebem política e efeitos prontos pelo mesmo contrato `EconomicTerms`.
- **Negativas:** o esquema v1 é deliberadamente estreito (frações por evento, faixas por antecedência); política com
  forma diferente exige nova versão do esquema. A validação existe em TypeScript e em PL/pgSQL (duplicação controlada
  por testes que exercitam as duas com os mesmos casos).
- **Riscos:** P-11 segue aberta — o evento de cancelamento só é aplicável quando o `03` ganhar o command.

## Alternatives considered

- **Motor genérico de regras / DSL:** rejeitado — contraria "schema fechado" e torna REQ-104 inverificável.
- **Capacidade configurável (reter noites após cancelamento):** rejeitado — contraria a BR-163 sem exceção no `01`.
- **Tabela de vínculo política × operação já na W18:** rejeitada — sem operação real seria tabela sem consumidor
  (ADR-0032 §8) ou operação fictícia.
- **Política por Second Home:** não prevista no `02/03`; o escopo do TECH-032 é o mecanismo.

## References

`01` BR-161, BR-163, BR-284, BR-360, BR-361 · `02` PD-009, PD-010, REQ-070, REQ-082, REQ-083, REQ-098, REQ-104, INV-2,
INV-6 · `03` TECH-001, TECH-030–033, TECH-051–054, TECH-070, TECH-082, §6 (erros), §7 · ADR-0030, ADR-0032, ADR-0033.
