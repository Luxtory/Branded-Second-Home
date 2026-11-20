# 0032. PRL por data com autoridade no banco, parâmetros econômicos globais e contrato de snapshot

- **Date**: 2026-11-20
- **Status**: Accepted (plano da W16 aprovado pelo fundador e pela auditoria independente em 2026-11-20; E0–E2 em PR
  draft, parada no C1)
- **Deciders**: Fundador (Luxtory), auditoria independente, agente de engenharia
- **Tags**: architecture, security, database, pricing, admin, W16

## Context

A W16 entrega REQ-013 e REQ-052 (`02` v4.6), com TECH-030, TECH-031 e TECH-033 (`03` v3.18). Fatos do código (main
`108d6f5`) e dos canônicos que moldam a decisão:

- o `01` §19 dá um PRL a cada data de cada Second Home e define o PRL do período como a soma das datas; a BR-181 reserva
  ao Super Admin a alteração do PRL publicado e a BR-182 torna toda alteração prospectiva; o `02` (REQ-052) exige que
  data sem PRL aplicável não seja ofertável;
- a TECH-051 já está no registro: `publish_initial_prl` (Admin ou Super Admin) e `change_published_prl` (Super Admin),
  no módulo `pricing`; `set_parameter` (Admin), no módulo `admin`; o guard aceita os papéis `admin` e `super_admin`, com
  MFA e sem hierarquia (ADR-0008);
- o gatilho de autoridade do banco usado até a W15 (`app.lock_own_use_admin_authority`) só aceita `admin`;
- `app.parameter` (W14, ADR-0030 §3) é só por inserção, com vigência D3, mas só tem a chave `guest_rules`, por Second
  Home (`second_home_id NOT NULL`); a ADR-0030 prevê que a W16 amplie a lista de chaves por migration própria;
- `app.second_home_date` (W10) é a Data da Second Home selada, com chave `(second_home_id, stay_date)`;
- nenhuma operação com efeito econômico existe: os primeiros consumidores são a W17 (validade dos Créditos), a W19
  (Fee), a W20 (Créditos do depósito) e a W21 (Request, PD-007, EC-9); o REQ-097 não lista evento de PRL ou parâmetro.

## Decision

1. **PRL por (Second Home, data), cabeçalho + linhas.** `app.prl_publication` registra o ato autorizado (tipo, início
   de vigência, autoridade, base, autor, instante, operação) e `app.prl` registra uma versão do PRL de uma data (valor
   em unidade mínima + `BRL`). A FK composta `(publication_id, second_home_id, effective_from)` impede linha com Second
   Home ou vigência diferente da publicação, e a FK `(second_home_id, stay_date)` → `app.second_home_date` só admite
   noite selada. O período não é escopo versionado: é a soma das noites `[checkin, checkout)`.
2. **Publicado = registrado; a regra inicial/alteração é decidida por data no banco.** Não existe rascunho no `01/02`
   (criá-lo seria funcionalidade nova, `03` §13). Uma publicação `initial` (command `publish_initial_prl`, papel `admin`
   ou `super_admin`) só aceita datas sem PRL; uma `change` (command `change_published_prl`, papel `super_admin`) só
   aceita datas já publicadas. Mistura é recusada. Isso fecha o atalho de "republicar como inicial" uma data publicada.
3. **Procedência e autoridade revalidadas na transação.** O gatilho do cabeçalho exige a operação `pending` da
   transação, o command correspondente ao tipo, a Second Home, o papel e o autor da operação, e revalida a atribuição de
   staff ativa do papel exercido sob trava compartilhada (`app.lock_prl_authority`, mesma chave da revogação). As linhas
   só entram enquanto a operação da publicação está `pending`. Um gatilho adiado recusa no commit publicação sem linhas
   ou com mais de 366 noites: publicação e linhas são atômicas.
4. **Vigência D3 reaproveitada, sem fim explícito.** O início é carimbado pelo banco depois da trava (`clock_timestamp`),
   nunca retroativo, e estritamente posterior ao último início da mesma data (inclusive versão futura agendada). O
   `effective_to` da TECH-030 é derivado: na view `app.prl_version` ele é o início da versão seguinte da mesma data
   (`NULL` = sem sucessora). Gravá-lo na antecessora exigiria UPDATE em versão (TECH-052); como o canônico não prevê
   retirada de PRL, não há término explícito. A semântica é a mesma: `[effective_from, effective_to)` disjuntos por
   construção.
5. **Trava por Second Home.** Publicação: `app.prl:<second_home_id>` exclusiva; leitura em vigor
   (`app.prl_period_in_force`): a mesma trava compartilhada, com o instante de resolução lido do banco depois dela.
   Nenhuma leitura em vigor vê uma publicação pela metade nem resolve num instante coberto por publicação ainda não
   confirmada. Na ordem de travas, `prl` fica depois de `parameter` (extensão da TECH-053, como na ADR-0030).
6. **Parâmetros econômicos no mesmo `app.parameter`, escopo global.** Seis chaves, sem Second Home:
   `credit_multiplier` (`01` §20), `credit_validity_months` (BR-191, TECH-044), `luxchange_fee_rate` e
   `luxchange_fee_minimum` (`01` §24, BR-232), `request_deadline_hours` (PD-005) e `membership_base_annual_price`
   (BR-141). `guest_rules` continua a única chave por Second Home. Valores tipados no banco por CHECK, em texto decimal
   canônico (inteiros positivos; decimais sem zero à direita; percentual em (0, 1]; dinheiro em unidade mínima com
   `currency = 'BRL'`). Zero e negativo são recusados: neutralizariam a regra que o parâmetro serve (BR-361). Limites
   superiores são técnicos. As funções da W14 viram seguras para NULL (`IS NOT DISTINCT FROM`, chave de trava
   `global`) e a unicidade passa a `NULLS NOT DISTINCT`; o resto da W14 fica idêntico (prova de catálogo).
7. **Adiados** (cada um por migration própria quando houver definição e consumidor): Taxa de Administração (o `01` não
   define base, periodicidade nem forma), descontos Luxplus (variam por Membership, BR-244, e não há planos — W23),
   taxas e comissões de locação (estrutura indefinida — W25). O valor-base do Membership é só registro e histórico: não
   autoriza cobrança, renovação, faturamento, plano ou integração financeira (D1–D4 da W15 preservadas).
8. **Snapshot = contrato agora, persistência com o primeiro efeito econômico.** A W16 define `EconomicTerms`
   (instante de resolução do banco; por noite, id da versão do PRL, valor em unidade mínima e moeda; por parâmetro, id
   da versão e valor canônico com unidade). Versões são imutáveis e referenciáveis por FK. A tabela persistente nasce na
   primeira wave que produzir o efeito econômico aplicável, na mesma transação dele (TECH-031). O REQ-052 não é
   declarado integralmente coberto pela W16.
9. **Interface.** Rotas `POST /v1/admin/prl` (inicial) e `POST /v1/admin/prl/changes` (alteração) como adaptadores
   mínimos sobre os mesmos handlers das Server Actions (TECH-056, `Idempotency-Key`). `set_parameter` segue só por
   Server Action (adiamento da ADR-0030, D5). Valores monetários trafegam como string em unidade mínima; Créditos, como
   decimal em string.
10. **Leitura só pelo servidor; nada ativado.** PRL sem GRANT a `authenticated`/`anon` (REQ-100: nenhum preço por noite
    ao Co-Owner); parâmetros globais invisíveis ao Titular. Sem evento, notificação ou capability nova; K1/K2/K3
    fechadas. Nenhum PRL ou parâmetro econômico real em Production sem autorização operacional do fundador.

## Consequences

### Positive

- Autoridade da BR-181, prospectividade da BR-182 e ausência explícita (TECH-001) garantidas pelo PostgreSQL, mesmo com
  servidor comprometido.
- Uma única estrutura de parâmetros; consumidores futuros resolvem PRL e parâmetros pelo mesmo contrato e travas.
- Nenhuma tabela sem consumidor; nenhuma superfície ao Titular.

### Negative

- Corrigir um PRL inicial com início futuro exige o Super Admin (publicado = registrado).
- Com uma versão futura agendada para a data, nova alteração só começa depois dela.
- Sem Super Admin ativo em Production, a alteração fica operacionalmente indisponível (atribuição pelo runbook).
- O REQ-052 só se completa quando a primeira wave consumidora persistir o snapshot.

### Neutral / follow-ups

- E3: slice `pricing` (calculadoras com `decimal.js` 10.6.0, handlers, resolvedor `EconomicTerms`), trava `prl` no
  `LOCK_ORDER`, extensão do `set_parameter`, mapeamento de erros. E4: telas Admin, rotas, E2E.
- Obrigação registrada para W17/W19/W20/W21/W23: persistir o snapshot com FK para as versões usadas, na transação do
  efeito.

## Alternatives considered

- **Tabela própria de parâmetros econômicos:** duplicaria a vigência D3, a trava e o histórico da W14 para o mesmo
  conceito da TECH-030.
- **Colunas tipadas novas no `app.parameter`:** quebrariam o `value text NOT NULL` da W14 ou duplicariam o valor; o
  texto canônico com CHECK por chave já tipa no banco, é exato e lido como string sem perda.
- **Uma tabela de PRL sem cabeçalho:** cada linha carimbaria seu próprio instante; as noites de uma publicação teriam
  vigências diferentes.
- **`effective_to` explícito no PRL:** seria retirada de PRL, que o canônico não prevê, e aumentaria a superfície de
  alteração.
- **Tabela de snapshot agora:** estrutura sem consumidor, exercitada só por operações forjadas até a W17.
- **Parâmetros adiados agora com forma presumida:** inventaria estrutura (TECH-001, BR-352).
