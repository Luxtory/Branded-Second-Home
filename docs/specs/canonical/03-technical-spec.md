# 03 — Technical Spec — Luxtory Branded Second Home

2026-10-09 · **Versão 3.14 — FINAL** · Base normativa: `01` v10.1 final · `02` v4.2 final

Cobertura normativa: **65 REQ · 6 INV · 11 PD**

Revisão BP0 autorizada pelo fundador: TECH-057 implementa o contrato do REQ-028; TECH-058 delimita a evolução
planejada do REQ-029. Demais regras da v3.13 preservadas. Impacto e aceite em
[`catalog` §14](../catalog.md#14-discovery-público-b2b-brand-partners-bp1); BP0 não entrega código nem migrations.

## 1. Autoridade

Hierarquia: **01 → 02 → 03 → Software.** O `03` define como construir e NÃO redefine regra superior.

**TECH-001 — Nada é presumido.** Valor, prazo, percentual ou regra econômica ausente no `01/02` não recebe default técnico. Zero nunca é presumido. Ausência bloqueia a função dependente com erro explícito. Timeouts, retries, cadência de jobs e RPO/RTO pertencem ao runbook.

**TECH-002 — Operação.** Toda mutação econômica ou de estado crítico possui:

`operation(id, command, actor_user_id, acting_party_id, role, residence_id, idempotency_key, correlation_id, authorization_ref, state)`

`state ∈ {pending, committed, failed, compensated}`.

`authorization_ref` identifica autorização ou base normativa/contratual registrada; não cria aprovação adicional inexistente no `01/02`.

Nenhuma escrita em capacidade, Direito de Uso, Créditos ou dinheiro existe sem `operation_id`.

---

## 2. Arquitetura

**ADR-001 — Monólito modular + PostgreSQL único.** PostgreSQL é a fonte de verdade para Inventário, Direito de Uso, Créditos, pagamentos e efeitos econômicos. Decisões críticas ocorrem em transação ACID.

Frontend, cache, jobs, canais e provedores externos não decidem disponibilidade, saldo, preço, autorização ou efeito econômico.

**ADR-002 — Escrita.** Commands executam no servidor por conexão PostgreSQL direta/pool. PostgREST/`supabase-js` não executam mutations críticas. Browser nunca recebe credencial privilegiada.

**TECH-010 — Stack.** TypeScript `strict`; Next.js; Supabase Auth/PostgreSQL/Storage privado; migrations SQL versionadas; adaptadores substituíveis para pagamentos, notificações e aleatoriedade. ORM/query builder só pode ser usado sem geração de schema e com transações/locks explícitos.

**TECH-011 — Módulos.**

`identity · catalog · ownership · calendar · inventory · booking · luxchange · credits · pricing · billing · admin · platform`

Cada módulo altera seu próprio estado; coordenação ocorre por interfaces de aplicação dentro da mesma transação.

---

## 3. Modelo de dados

### 3.1. Entidades principais

| Entidade | Regra mínima |
|---|---|
| `party` | CPF/CNPJ cifrado + HMAC normalizado `UNIQUE` |
| `party_delegation` | usuário → party, escopo e vigência |
| `membership` | `party_id UNIQUE`, plano opcional, estado |
| `membership_plan_version` | vigência, preço, benefícios, descontos e condições autorizadas |
| `brand_partner` | encerramento, direitos sobreviventes e restrições de marca |
| `concept_version` | elementos essenciais, `approval_refs`, versão e estado |
| `edition` | Concept, região, modalidade e lock da estrutura |
| `residence` | Edition, Concept version imutável, timezone, configuração, conformidade e início da operação |
| `residence_administration` | Residence, prestador/base, caráter profissional, escopo e vigência |
| `spe` | uma SPE por Residence Co-Owner |
| `stake` | Ação permanente; participação igual conforme configuração |
| `holding` | party, Residence, papel, Ação e vigência; sem sobreposição incompatível |
| `authorization_grant` | comandos/leituras explícitos, escopo, vigência e concedente |
| `interest` | Concept, Edition opcional, modalidade, região, `approx_days`, origem; nunca gera Direito de Uso |
| `edition_initial_allocation` | primeiro exercício parcial: grants por Ação/categoria + capacidade Luxtory |
| `booking` | canal, Titular, Ação, período, estado, política e cancelamento |
| `luxchange_request` | solicitante, detentor, noites, estado, expiração, política e Fee |
| `rental_offer` | capacidade, ofertante, política, estado e período |
| `guest`, `rental_contract` | vinculados à estadia; sem direitos recorrentes |

Co-Owner é sempre modelado/comunicado como **Ação + Direito de Uso**. “Cota” e derivados não são termos de domínio.

**TECH-020 — Aquisição, administração e conformidade.**

`formalize_acquisition` cria `holding`; no Co-Owner também registra SPE e Ações, exige `edition_initial_allocation` no primeiro exercício parcial e agenda o sorteio.

Administração profissional é obrigatória enquanto a Residence Co-Owner estiver em operação. O modelo impede período operacional Co-Owner sem cobertura válida de `residence_administration`, sem criar consequência econômica adicional. Isso NÃO significa administração integral obrigatória pela Luxtory. No Owner, administração integral Luxtory é opcional e Property Services permanecem separados.

`edition_initial_allocation` só admite datas futuras disponíveis, Direito de Uso igual entre Ações da mesma configuração, distribuição sazonal equivalente e capacidade inicial Luxtory por categoria. Nenhuma fórmula proporcional é presumida.

Conformidade distingue:

- Owner: personalização de elemento não essencial permitida;
- elemento essencial: exige aprovação aplicável registrada;
- Co-Owner: personalização individual incompatível com a padronização é recusada;
- não conformidade material: pode suspender Club, certificação e uso comercial de marcas conforme BR-020, sem alterar propriedade, Direito de Uso ou compromissos existentes.

Encerramento de Brand Partner bloqueia novos Concepts, Editions e usos de marca após sua eficácia, preservando direitos sobreviventes registrados.

Antes da formalização não existem Ação nem Direito de Uso. Não existe retrofit, adaptação ou imóvel preexistente.

### 3.2. Data-Residence, Inventário e ocupação

**ADR-003 — Grão = noite.**

`residence_date(residence_id, stay_date, exercise_year, season, is_leap_day, checkin_at, sealed_at)`

PK `(residence_id, stay_date)`.

Check-in 14:00 local; check-out 10:00 local.

Estadia ocupa `[checkin_date, checkout_date)` e exige ao menos uma noite.

**ADR-004 — Inventário Central.** É a projeção de `residence_date + custódia ativa + ocupação ativa`. Não existe segunda fonte mutável de disponibilidade.

**Inventário Luxtory** = custódia ativa `luxtory/inventory`.

Locação externa não integra Inventário Luxtory.

```sql
CREATE TABLE date_custody (
  id uuid PRIMARY KEY,
  residence_id uuid NOT NULL,
  stay_date date NOT NULL,

  holder_kind text NOT NULL, -- owner | spe_pool | use_right | luxtory
  stake_id uuid,
  basis text,                -- reserved_right | forfeited_right | delinquency
  purpose text,              -- maintenance | marketing | promotion | production | inventory
  inventory_origin text,     -- annual_allocation | luxchange_cession | recovered_future_capacity

  authorization_ref text,
  parent_custody_id uuid,

  opened_by_operation uuid NOT NULL,
  closed_by_operation uuid,
  closed_at timestamptz,

  FOREIGN KEY (residence_id, stay_date) REFERENCES residence_date,

  CHECK ((holder_kind = 'use_right') = (stake_id IS NOT NULL)),
  CHECK ((holder_kind = 'use_right') = (basis IS NOT NULL)),
  CHECK ((holder_kind = 'luxtory') = (purpose IS NOT NULL)),
  CHECK ((holder_kind = 'luxtory' AND purpose = 'inventory')
         = (inventory_origin IS NOT NULL)),
  CHECK (inventory_origin IS NULL OR authorization_ref IS NOT NULL)
);

CREATE UNIQUE INDEX uq_custody_active
ON date_custody(residence_id, stay_date)
WHERE closed_at IS NULL;

CREATE TABLE date_occupancy (
  id uuid PRIMARY KEY,
  residence_id uuid NOT NULL,
  stay_date date NOT NULL,
  booking_id uuid NOT NULL,
  channel text NOT NULL,
  custody_id uuid NOT NULL REFERENCES date_custody,
  released_at timestamptz,
  release_reason text,

  FOREIGN KEY (residence_id, stay_date) REFERENCES residence_date,

  CHECK (release_reason <> 'ceded' OR channel = 'own_use')
);

CREATE UNIQUE INDEX uq_occupancy_active
ON date_occupancy(residence_id, stay_date)
WHERE released_at IS NULL;
```

Enums usam listas fechadas por `CHECK IN`.

**TECH-021 — Barreiras.**

- `uq_occupancy_active` → INV-1.
- `uq_custody_active` + origens fechadas → INV-3.
- toda `residence_date` selada termina a transação com exatamente uma custódia ativa;
- ocupação referencia custódia ativa da mesma noite;
- custódia ocupada só fecha após liberação da ocupação na mesma transação;
- histórico não é reescrito.

`open_exercise` cria a custódia raiz de cada nova noite selada:

Owner → `owner`  
Co-Owner → `spe_pool`.

Inventário Luxtory:

`annual_allocation` → capacidade anual Luxtory  
`luxchange_cession` → Créditos ao cedente  
`recovered_future_capacity` → sem nova compensação.

**TECH-022 — Transições.**

| Origem | Destino | Evento |
|---|---|---|
| `spe_pool` | `use_right/reserved_right` | reserva Co-Owner |
| `spe_pool` | `use_right/delinquency` | inadimplência autorizada |
| `spe_pool` | `luxtory/{purpose}` | seleção Luxtory |
| `use_right/reserved_right` | `spe_pool` | cancelamento tempestivo |
| `use_right/reserved_right` | `use_right/forfeited_right` | futuro de cancelamento tardio/no-show |
| `owner` ou `use_right/reserved_right` | `luxtory/inventory/luxchange_cession` | depósito ou Request aceita |
| `use_right/forfeited_right` | `luxtory/inventory/recovered_future_capacity` | BR-283 |
| `luxtory/inventory` | pai | regra/política aplicável ou correção compensatória válida |

Na seleção Luxtory:

`purpose=inventory ⇔ inventory_origin=annual_allocation`.

Outras finalidades usam `inventory_origin=NULL`.

`authorization_ref` sozinho nunca autoriza reversão.

`forfeited_right` representa Direito consumido e não reutilizável; somente capacidade futura pode seguir BR-283.

**TECH-023 — INV-2.**

| Ocupação | Custódia válida |
|---|---|
| `own_use` | `owner` ou `use_right/reserved_right` da mesma Ação |
| `luxtory_use` | `luxtory`, finalidade ≠ `inventory` |
| `luxchange_request` | `luxtory/inventory/luxchange_cession` da mesma operação |
| `luxchange_direct`, `luxplus` | `luxtory/inventory` |
| `rental_external` | `owner`, `use_right/reserved_right` da Ação ofertante ou `use_right/delinquency` |

Trigger rejeita pares diferentes.

Créditos apontam às custódias que os originaram; settlements apontam à ocupação/custódia correspondente.

`ceded` só libera `own_use` Co-Owner sobre `reserved_right` da mesma Ação. Reserva Owner precisa ser cancelada antes de cessão/locação.

`reserved_right` devolvido por política/reversão pode receber nova `own_use` sem novo consumo do Direito de Uso.

**TECH-024 — Concorrência multicanal.** `rental_offer` e Request pendente não alteram custódia/ocupação.

Confirmação incompatível fecha ofertas no mesmo commit e encerra Requests concorrentes idempotentemente, liberando Garantia e revertendo Fee.

Qualquer mudança de Membership, custódia ou outro requisito que torne capacidade, solicitante ou detentor inelegível encerra a Request pendente com o mesmo efeito.

Aceite sempre revalida; primeiro aceite válido confirma.

**TECH-025 — Unicidade econômica.**

`credit_lot UNIQUE(origin_operation_id, party_id)`  
`fee_charge UNIQUE(operation_id)`  
`settlement UNIQUE(operation_id, kind, beneficiary_party_id)`  
`refund UNIQUE(payment_id, operation_id)`.

Retry não duplica efeito.

### 3.3. Direito de Uso

**TECH-026 — INV-4/INV-5.**

`residence_configuration` contém somente as quatro configurações canônicas e é imutável.

Por categoria:

`N × limite_por_Ação + capacidade_Luxtory = capacidade ordinária`.

Alta/Super Alta = 103.  
Média/Baixa = 262.

`use_right_ledger` é append-only:

`grant · consume · restore · expire · correction`.

`use_right_balance(stake_id, exercise_year, bucket)`

`bucket ∈ {alta, media, leap}`.

`grant` vem somente da configuração ou `edition_initial_allocation`.

`consume` aumenta consumo; `restore` desfaz consumo previamente registrado. Projeções nunca ficam negativas.

`correction` só corrige consumo/expiração comprovados e nunca altera `grant`.

Buckets não se compensam. Saldo de um exercício nunca atende outro.

**TECH-027 — 29/02.** É `season=media`, mas usa bucket extraordinário `leap`, `grant=1`, apenas para a Ação contemplada. Não integra limites ordinários nem capacidade ordinária Luxtory; conta para permanência/adjacência e, se não usado, expira sem Inventário Luxtory.

### 3.4. Configuração, PRL, Membership e políticas

**TECH-030 — Versionamento.**

`prl`, `parameter`, `membership_plan_version` e `commercial_policy` são append-only/versionados.

Toda versão possui:

`scope · value/config · effective_from/effective_to · authority · authorization_ref · created_at · created_by`.

Versões vigentes do mesmo scope não se sobrepõem.

PRL inicial: Admin ou Super Admin autorizado.  
Alteração de PRL publicado: somente Super Admin.

Parâmetros incluem somente valores autorizados no `01/02`, inclusive:

Membership · Taxa de Administração · multiplicador · validade dos Créditos · Fee · descontos Luxplus · taxas/comissões de locação · `guest_rules` por Residence.

Valores iniciais:

- Membership base: R$ 790/ano;
- multiplicador: 10;
- Crédito: 24 meses;
- Fee: 10% do PRL, mínimo R$ 120;
- Request: 24 horas.

São versões iniciais, não regras imutáveis.

Planos Membership são opcionais e não são inventados. Não podem alterar propriedade, Ação, Direito de Uso ou rotação.

**TECH-031 — Snapshot.** Antes de efeito econômico registra-se versão/valor efetivamente usado:

PRL · multiplicador · validade do Crédito originado · Fee · plano · desconto · política · taxas/comissões · beneficiários.

Request fixa PRL, Créditos necessários e Fee no envio.

**TECH-032 — Políticas.** Política versionada com schema fechado para:

`luxchange_request · luxchange_direct · luxplus · rental_external`.

Avaliação recebe snapshot + evento e produz somente efeitos normalizados sobre:

`capacity · credits · fee · money · remuneration`.

Commands aplicam esses efeitos pelos mesmos eixos/ledgers. Política nunca contorna BR-163 ou INV.

Sem política vigente, o respectivo compromisso não confirma.

**TECH-033 — Valores.** Dinheiro = unidade mínima (`bigint`) + moeda. `HALF_UP` uma vez no valor monetário final aplicável. Créditos usam `numeric` exato.

---

## 4. Tempo e calendário

**TECH-040 — Fuso.** Instantes em UTC; regras civis usam timezone IANA da Residence. Exercício = ano civil local da noite. Períodos cruzando temporada/exercício são validados noite a noite.

**TECH-041 — Carnaval.** Terça de Carnaval = Páscoa gregoriana − 47 dias. Início = sexta anterior; se cair em janeiro, 01/02.

Selecionam-se as 10 primeiras datas válidas excluindo 29/02 e datas já Alta/Super Alta pelo mês.

Selagem exige 103 Alta/Super Alta + 262 Média/Baixa + 29/02 em ano bissexto.

Data selada não é reclassificada.

**TECH-042 — Janelas e rotações.**

Posição `p`:

`base + (p−1) × 7 dias`

`base = 15/09 00:00 local` do ano anterior ou formalização, se posterior.

Luxtory = posição `N+1`.

Abertura cumulativa.

Rotação ordinária segue BR-101.

Na primeira ocorrência de 29/02 posterior ao início da operação, a lista bissexta copia a ordem ordinária daquele exercício; depois avança uma posição por ano bissexto e nunca é rederivada.

29/02 abre para a Ação contemplada em `base`.

Posições pertencem à Ação.

**TECH-043 — Prazos.**

Cancelamento tempestivo:

`cancelled_at ≤ checkin_at − 15 dias`

Depósito:

`now ≤ checkin_at − 14 dias`

Noite futura:

`now < checkin_at`

Classificação é persistida e nunca recalculada.

**TECH-044 — Validade.**

Crédito:

`originated_at + credit_validity_months`

por adição calendárica em UTC, ajustada ao último dia válido do mês.

Request:

`sent_at + request_expiry_hours`.

Uso exige `now < expires_at`, independentemente de job. `expires_at` nunca é prorrogado.

**TECH-045 — Permanência.** Uso próprio Co-Owner: mínimo 1 e máximo 14 noites consecutivas por Ação/Residence. Reservas adjacentes somam. Outros canais não usam esse limite.

**TECH-046 — No-show.** Só por command autorizado e após check-in da primeira noite. Job apenas identifica candidatos.

---

## 5. Identidade e autorização

**TECH-050 — Identidade.** Supabase Auth autentica. Admin/Super Admin exigem MFA.

Autorização resolve:

`user → party_delegation → party → holding/Ação ou authorization_grant → condições da ação`.

Owner/Co-Owner são relações por Residence, não roles globais.

Membership elegível = ativo e sem restrição aplicável ao mecanismo.

Suspensão/encerramento afetam prospectivamente novos commands dependentes; não removem direitos, Créditos ou compromissos confirmados.

**TECH-051 — Commands críticos.**

| Command | Autoridade | Membership |
|---|---|---|
| `create_own_use_booking`, `cancel_own_use_booking`, `nominate_guest` | Titular | não |
| `deposit_capacity`, `send_request`, `create_direct`, `buy_luxplus`, `authorize_rental` | Titular | elegível |
| `accept_request` | detentor | elegível |
| `reject_request` | detentor | não |
| `withdraw_request` | solicitante | não |
| `withdraw_rental_offer` | ofertante | não |
| `formalize_acquisition`, `select_luxtory_capacity`, `declare_no_show`, `recover_future_capacity`, `confirm_rental`, `transfer_holding`, `register_debt`, `apply_delinquency_restriction`, `authorize_delinquency_commercialization`, `open_exception`, `resolve_exception`, `correct_use_right`, `reverse_credit`, `publish_policy`, `set_parameter` | Admin + base registrada | — |
| publicar PRL inicial | Admin ou Super Admin | — |
| alterar PRL publicado | Super Admin | — |

A tabela é fechada para commands econômicos/estado crítico.

Demais operações do REQ-095 usam o mesmo guard, base registrada e auditoria, sem criar efeito econômico novo.

Brand Partner, Investor e parceiros só executam o que constar em `authorization_grant`.

**TECH-052 — Camadas.** Guard de domínio autoriza. RLS protege leitura. Papel de servidor nunca é exposto ao cliente. Ledgers, snapshots, versões e auditoria não admitem UPDATE/DELETE funcional.

---

## 6. Transações, concorrência e API

**ADR-005 — `READ COMMITTED` + locks explícitos em ordem total + constraints.**

**TECH-053 — Ordem de locks.**

1. `luxchange_request` por `id`;
2. `rental_offer` por `id`;
3. `membership` por `party_id`;
4. `stake` por `id`;
5. `residence_date` por `(residence_id, stay_date)`;
6. balances e custódias pela mesma ordem de Data-Residence;
7. `credit_lot` por `(expires_at, originated_at, id)`;
8. `payment` por `id`.

Múltiplas linhas da mesma classe são bloqueadas em ordem crescente da chave indicada.

Todo command toca apenas o subconjunto necessário, preservando essa ordem.

Deadlock/timeout → retry limitado com a mesma `idempotency_key`.

**TECH-054 — Protocolo.**

autoriza → idempotência → `BEGIN` → locks → revalidação integral → estados/ledgers/snapshot/audit → `COMMIT|ROLLBACK` → outbox.

UI, disponibilidade exibida, oferta, Request pendente ou pagamento aprovado nunca garantem confirmação.

**ADR-006 — Idempotência.**

Mesma key + ator + payload → replay.  
Mesma key + payload diferente → `ERR_IDEMPOTENCY_CONFLICT`.

`outbox`: at-least-once + consumidor idempotente.  
`webhook_inbox`: `UNIQUE(provider,event_id)`.

Jobs e consumers invocam os mesmos domain commands; não escrevem estado crítico diretamente.

**TECH-055 — Estados mínimos.**

Reserva:

`confirmed → in_use | cancelled | no_show | in_exception`  
`in_use → completed | cancelled | no_show | in_exception`  
`in_exception → confirmed | cancelled | completed`

Request:

`pending → accepted | declined | expired | cancelled_pre_accept`

Membership:

`active ↔ suspended`  
`active|suspended → ended`  
`ended → active`

Crédito é derivado dos buckets; “Indisponível por Membership” = saldo válido com uso bloqueado.

**TECH-056 — API/erros.** REST `/v1`; mutations usam `POST` + `Idempotency-Key`; consultas são read-only.

Códigos mínimos:

`ERR_PERMISSION · ERR_MEMBERSHIP_INELIGIBLE · ERR_WINDOW_NOT_OPEN · ERR_CAPACITY_UNAVAILABLE · ERR_BOOKING_CONFLICT · ERR_USE_RIGHT_BALANCE · ERR_STAY_LENGTH · ERR_MIN_NOTICE · ERR_CREDITS_INSUFFICIENT · ERR_CREDIT_HOLD_INVALID · ERR_PRL_MISSING · ERR_POLICY_MISSING · ERR_PARAMETER_MISSING · ERR_PAYMENT_FAILED · ERR_STATE_TRANSITION · ERR_IDEMPOTENCY_CONFLICT · ERR_CONCURRENT_CONFIRMATION · ERR_COMPLIANCE_SUSPENDED · ERR_DELINQUENCY_RESTRICTED`

Constraint de ocupação → `ERR_BOOKING_CONFLICT`.  
Custódia/TECH-023 → `ERR_CAPACITY_UNAVAILABLE`.  
Saldo → `ERR_USE_RIGHT_BALANCE`.  
Créditos → `ERR_CREDITS_INSUFFICIENT`.

---

### 6.1. Brand Partners público e fronteira do portal

**TECH-057 — Contato público Brand Partners (REQ-028, BP1).** `POST /v1/brand-partner-contacts`, sem login,
recebe os campos autorizados em REQ-028. Contrato OpenAPI antes do handler. Rotas Next delegam ao módulo
`catalog`; validação server-side com schema fechado e limites de corpo/campos; honeypot; verificação de origem;
rate limit distribuído por origem de rede e global via Upstash. Falha do limitador recusa o envio.

Um port de envio em `catalog` tem adapter server-side para a API HTTP do Resend. Destinatário e remetente são
configuração do servidor; o e-mail validado do visitante é apenas `Reply-To`. Credenciais em secrets por ambiente,
nunca no client. Segredos da aplicação não são presumidos a partir do SMTP do Supabase Auth. Timeout, limites
e configuração operacional pertencem ao runbook; o contrato detalhado está em `catalog` §14.

`Idempotency-Key` é obrigatório: mesma tentativa e conteúdo preservam chave e payload enviado ao provedor;
conteúdo diferente com a mesma chave resulta em conflito dentro da janela garantida pelo Resend. O adapter usa
a idempotência do provedor, sem prometer deduplicação ilimitada ou entrega exatamente uma vez. Timeout não é
sucesso nem prova de que o provedor não aceitou; retry preserva a chave dentro daquela janela.

Sucesso só após aceite confirmado do provedor. Indisponibilidade de configuração, proteção ou envio retorna
erro controlado, sem fallback silencioso, fila ou sucesso simulado. Logs contêm somente metadados operacionais
seguros, sem payload, PII, segredos ou resposta bruta do provedor. Nenhum contato é persistido no PostgreSQL,
Redis, logs ou armazenamento do browser; Redis guarda apenas contadores técnicos com expiração e identificadores
pseudonimizados. Dados do formulário permanecem apenas na memória da interação e no tratamento necessário pelo
provedor e pela caixa corporativa, com acesso/retenção definidos antes do go-live.

Não há migration, CRM, `interest`, `brand_partner`, conta, `operation` ou outbox criado por essa submissão.
É envio sem mutação econômica/estado crítico; TECH-054 e as notificações do TECH-091 não se aplicam a esse fluxo.
Não altera o registro fechado de TECH-051. As páginas `/brand-partner` e `/brand-partner/como-funciona` recebem
CSP/nonce pelo proxy; a exclusão atual de prefixos `brand` deve ser restringida aos assets reais de branding na
BP1. Não há correção de código na BP0.

**TECH-058 — Portal Brand Partner planejado (REQ-029, BP2).** Reutiliza Supabase Auth e a cadeia
`user → party_delegation → party → authorization_grant` com escopo da Brand Partner, vigência e revogação.
O vínculo explícito entre parte e marca e as permissões de leitura serão concretizados a partir do contrato da
BP2; não há tabela paralela de identidade nem papel Admin para parceiros. Guard autoriza e RLS restringe os
objetos da própria marca, inclusive em consultas diretas; campos retornados são explicitamente permitidos.

Leituras usam interfaces públicas dos módulos donos de catálogo e aquisições, sobre fatos canônicos verificáveis,
sem tabela paralela de vendas ou integração presumida. W7 é a dependência planejada de representação; W8 é a
dependência de formalização no domínio atual, sujeita à definição funcional do evento de venda e da atribuição.
Nenhuma delas é antecipada por BP0/BP1. Especificação testável de isolamento é critério de entrada; comprovação
por testes de autorização/RLS, incluindo revogação, marca A × B, usuário sem vínculo, delegação expirada,
manipulação de IDs, consulta direta e colunas não permitidas, é gate de disponibilização da BP2.
Domínio de e-mail não estabelece representação; preço de referência e aprovação comercial não são venda.

## 7. Fluxos críticos

Todos seguem TECH-053/054.

| Fluxo | Efeito principal |
|---|---|
| Uso Co-Owner | `spe_pool → reserved_right`; consume; ocupação |
| Uso Owner | ocupação sobre `owner` |
| Cancelamento tempestivo Co-Owner | libera ocupação; `reserved_right → spe_pool`; restore |
| Tardio/no-show Co-Owner | libera só futuro; `reserved_right → forfeited_right`; sem restore |
| Cancelamento/no-show Owner | libera ocupação; permanece `owner` |
| Recuperação BR-283 | `forfeited_right → luxtory/inventory/recovered_future_capacity` |
| Seleção Luxtory | `spe_pool → luxtory` dentro de categoria/limite |
| Depósito | capacidade elegível → `luxchange_cession` + Créditos |
| Request envio | snapshot + Garantia + Fee; sem bloqueio de capacidade |
| Request aceite | cessão + reserva + consumo Garantia + Créditos cedente |
| Request pré-aceite encerrada | libera Garantia + reversão integral Fee |
| Direct | Inventário + Créditos + Fee → reserva |
| Luxplus | Inventário + pagamento → reserva + settlement Luxtory |
| Locação | oferta → reserva externa + settlement Titular |
| Transferência | holding muda; Ação, saldo remanescente, rotações, reservas/compromissos e obrigações do Concept permanecem; Membership/Créditos não se transferem |
| Exceção | `in_exception`; nenhuma restituição, Crédito, indenização, compensação ou transferência econômica não prevista |

**TECH-060 — Capacidade perdida.** `forfeited_right` não é reservável, depositável ou locável. Direito permanece consumido. Capacidade futura só entra no Inventário Luxtory por `recover_future_capacity`; caso contrário encerra com o exercício.

**TECH-061 — Luxchange.**

Todas as noites no Inventário Luxtory → Direct.

Todas as noites elegíveis de um mesmo outro Titular → Request.

Mistura → `ERR_CAPACITY_UNAVAILABLE`.

Primeiro aceite válido confirma.

**TECH-062 — Inadimplência.** Restrição nunca é automática; só afeta novas ações autorizadas pelos instrumentos. Reservas confirmadas e rotação permanecem.

Comercialização exige autorização expressa, débito vencido/exigível, exercício atual, saldo/limites e apenas o necessário à dívida.

Usa `use_right/delinquency`; não gera Créditos nem entra no Inventário Luxtory.

Settlement quita dívida/custos antes do excedente. Quitação encerra autorização/restrição.

**TECH-063 — Owner sem Membership.** Capacidade continua `owner`. Atividade independente não é produto Luxtory. Retorno aos mecanismos Luxtory exige ato expresso e revalidação.

**TECH-064 — Paridade.** Owner e Co-Owner compartilham mecanismos; diferenças derivam somente do `01`.

---

## 8. Créditos

**ADR-007 — Lote + ledger.**

`credit_lot(party_id, quantity, held, consumed, expired, available GENERATED, originated_at, expires_at, origin_operation_id)`

`party_id` é imutável.

`available = quantity − held − consumed − expired`.

Buckets nunca ficam negativos.

`credit_entry(lot_id, operation_id, movement, quantity, created_at)` é append-only.

**TECH-070 — Movimentos.**

`external → available`  
`available → held`  
`held → available`  
`held|available → consumed`  
`available → expired`  
`held → expired` somente ao liberar Garantia vencida.

Reversão de consumo:

antes de `expires_at` → `consumed → available`  
depois → `consumed → expired`.

Somente por política aplicável ou correção compensatória válida.

Nunca cria quantidade, muda party ou transfere Crédito livremente.

**TECH-071 — FEFO/Garantia.**

`ORDER BY expires_at, originated_at, id`.

Somente lotes com `now < expires_at`.

Garantia exige:

`lot.expires_at ≥ request.expires_at`.

Aceite: `held → consumed`.

Encerramento pré-aceite libera Garantia.

**TECH-072 — Membership/expiração.** Membership não altera lote nem validade.

Job materializa expiração do saldo disponível.

Lote vencido pode permanecer temporariamente `held` enquanto a Request ainda estiver pendente; não é utilizável.

Ao liberar Garantia vencida: `held → expired`.

---

## 9. Pagamentos e apuração

**ADR-008 — Pagamento não reserva capacidade.**

**TECH-080 — Sequência.**

1. pré-validação + `operation(pending)`;
2. cobrança PSP fora da transação de domínio;
3. confirmação financeira;
4. transaction + locks + revalidação;
5. sucesso → commit;
6. falha → estorno/void.

Estado financeiro é monotônico. Duplicidade/ordem inversa não regride estado.

**TECH-081 — PSP.** Adaptador suporta idempotência, webhook autenticado/replay-safe, consulta e estorno/void. Fornecedor é decisão de contratação.

**TECH-082 — Fee.** Um `fee_charge` por operação. Request paga antes do envio; Direct antes da confirmação. Desfechos pré-aceite do PD-006 revertem integralmente. Fee nunca vira Crédito.

**TECH-083 — Settlement.** Append-only por natureza e beneficiário, distinguindo ao menos:

Membership · Taxa de Administração · despesas da Residence · Design & Build · Property Services · Luxchange Fee · Luxplus · locação · estruturação/comercialização · obrigação Brand Partner · margem Investor.

Brand Partner e margem Investor nunca são automaticamente receita Luxtory.

Categorias permanecem separadas; relatório não as consolida como receita única.

Valor líquido devido ao Titular permanece obrigação apurada.

---

## 10. Jobs, notificações, auditoria e sorteio

**TECH-090 — Jobs.**

`open_exercise · close_exercise · expire_requests · expire_credit_lots · advance_booking_states · flag_no_show_candidates · close_delinquency_authorization · reconciliation · outbox`

Execução/item é idempotente. Job nunca é única proteção de validade ou INV.

**TECH-091 — Notificações.** Eventos do REQ-097 saem via outbox com deduplicação. Falha de entrega não desfaz domínio.

**TECH-092 — Auditoria.**

`audit_log` append-only registra, quando aplicável:

ator · parte representada · papel · instante · objeto · operation · autorização/base · antes/depois.

Leituras administrativas são eventos próprios. PII bruta/segredos não entram no log.

`audit_log` nunca é alterado.

`audit_seal(audit_log_id UNIQUE, seal_seq UNIQUE, previous_hash, hash)` também é append-only.

Selador lógico sob lock processa somente registros commitados e ainda não selados.

Payload usa JSON Canonicalization Scheme RFC 8785, `schema_version='audit-v1'`.

Primeiro `previous_hash` = 32 bytes zero.

Demais:

`hash = SHA-256(previous_hash_bytes || UTF8(JCS(payload)))`.

Último hash é periodicamente ancorado em storage imutável.

**TECH-093 — Sorteio.**

1. participantes congelados em ordem determinística;
2. `seed` aleatório de 32 bytes por CSPRNG;
3. publica-se `SHA-256(seed)` + rodada futura do `RandomnessBeacon`;
4. após o beacon: `key = SHA-256(seed || beacon_value)`;
5. Fisher-Yates `v1`;
6. para cada posição usa HMAC-SHA256 + rejection sampling para obter índice uniforme sem modulo bias;
7. publica seed, participantes, beacon, algoritmo e resultado.

Implementação fixa counter inicial `0`, incrementado a cada rejeição, e interpreta o HMAC como inteiro unsigned big-endian.

Beacon é público, verificável e desconhecido no commitment.

---

## 11. Segurança e recuperação

**TECH-100 — Segurança.** TLS; secrets server-side; chaves em KMS; CPF/CNPJ/documentos cifrados; HMAC com segredo separado; PII fora de logs; Storage privado; validação de input; CSRF quando aplicável; rate limit; SAST e scanning de dependências/segredos.

**TECH-101 — Recuperação.** PITR com restore testado. Reconciliações executam antes da reabertura de writes.

| Falha | Tratamento |
|---|---|
| pagamento aprovado + domínio falha | estorno |
| queda após pagamento | reconciliação confirma ou estorna |
| timeout pós-commit | replay idempotente |
| webhook duplicado/fora de ordem | inbox + estado monotônico |
| estorno falha | retry + alerta |
| job/outbox duplicado | no-op |
| drift | bloqueio do agregado + correção compensatória |

Alertas:

`invariant_breach · drift · audit_chain_failure · payment_without_outcome · open_exercise_failure`.

---

## 12. QA

**TECH-110 — Camadas.**

Unit · PostgreSQL real · contratos API/PSP/webhook · E2E · concorrência · autorização/RLS · falhas · tempo.

Relógio é injetável.

| INV | Proteção | Teste mínimo |
|---|---|---|
| INV-1 | occupancy única | concorrentes → exatamente uma |
| INV-2 | custódia + matriz + lineage | combinação inválida falha |
| INV-3 | origem fechada | quarta origem falha |
| INV-4 | configuração + balances | excesso/bucket errado falha |
| INV-5 | exercício | saldo N não atende N+1 |
| INV-6 | lote + ledger + party | double spend/transferência/origem inválida falha |

Concorrência:

reserva×reserva · bucket×bucket · adjacência · aceite×aceite · aceite×retirada/expiração · confirmação×rental_offer · Direct×Luxplus · mesmos Créditos · Request×Direct · depósito×cancelamento · seleção Luxtory×reserva · retries/jobs paralelos.

Tempo:

14h/10h · 1 noite · 14/15 dias · `expires_at` · job atrasado · reversão após expiração · 29/02 · 31/01 · Carnaval · 2100 · troca de exercício · fusos.

Regras estruturais:

- Residence Co-Owner operacional sem administração profissional válida falha;
- alocação inicial com data passada, desigualdade ou distribuição sazonal inválida falha;
- personalização Co-Owner incompatível falha;
- perda de elegibilidade encerra Request e libera Garantia/Fee;
- inadimplência não altera reserva confirmada nem rotação;
- Data-Residence selada exige custódia ativa;
- seleção Luxtory para Inventário exige `annual_allocation`;
- 29/02 é Média/Baixa, mas não consome bucket ordinário.

Um teste por edge case do `02 §15`.

Auditoria: commits concorrentes → exatamente um seal por evento, cadeia válida e nenhum UPDATE em `audit_log`.

Sorteio: vetor fixo reproduz exatamente `fy-v1`.

**Gate global do produto:** 65/65 REQ cobertos · 11/11 PD cobertos · 6/6 INV protegidos/testados · migrations esperadas · reconciliação sem drift.

Esse é o alvo global de implementação, não uma declaração de testes já aprovados. BP0 usa somente gates
documentais; BP1 comprova REQ-028/TECH-057; REQ-029/TECH-058 só recebe evidência de implementação na BP2.
Critérios do envio incluem validação, abuso, falhas, idempotência, ausência de PII nos logs e sucesso apenas
após aceite. Os critérios de isolamento do portal não são satisfeitos por testes do catálogo público.

---

## 13. Guardrails

A implementação NÃO pode:

- decidir disponibilidade/economia no frontend;
- escrever estado crítico via PostgREST/cliente;
- manter segunda fonte mutável de disponibilidade;
- usar CRUD genérico em estado crítico;
- reescrever histórico econômico/auditoria;
- depender de job para validade;
- bloquear capacidade por Request pendente ou pagamento;
- criar quarta origem de Inventário Luxtory;
- aceitar par econômico fora da TECH-023;
- tratar `forfeited_right` como reutilizável;
- alterar `grant`, limite sazonal ou rotação por correção;
- alterar Direito de Uso/rotação por Membership ou inadimplência;
- inventar valor ausente;
- transferir Créditos livremente;
- criar diferença Owner/Co-Owner ausente no `01`;
- confundir administração profissional Co-Owner com administração integral Luxtory;
- violar terminologia do `02`;
- apresentar Co-Owner como compra de diárias;
- prometer rentabilidade, valorização, liquidez ou renda garantida;
- implementar funcionalidade fora do §15 sem atualizar primeiro o `02`.

---

## 14. Rastreabilidade

Números sem prefixo = `TECH-xxx`.

| REQ | Cobertura | REQ | Cobertura |
|---|---|---|---|
| 010 | 050–051 | 050 | 030, 050, 055 |
| 011 | 050 | 051 | 051, 064 |
| 012 | §3.1 | 052 | 030–031 |
| 013 | 030, 051 | 053 | 070–072 |
| 014 | §3.1, 051 | 054 | 070 |
| 015 | 002, 092 | 060 | 022–023, §7 |
| 016 | 026 | 061 | 061 |
| 020 | §3.1 | 062 | 031–032, 071, 082 |
| 021 | §3.1, 020 | 063 | 024, 061 |
| 022 | §3.1, 020 | 064 | 024, 061, §7 |
| 023 | §3.1 | 065 | 082, §7 |
| 024 | 020 | 066 | 021, 023 |
| 025 | §3.1, 020 | 070 | 031–033, 083, §7 |
| 026 | §3.1, 020, 026 | 071 | 023, 063, §7 |
| 027 | §3.1, 051, 083 | 072 | 023, §7 |
| 028 | 057, 100 |  |  |
| 029 | 050, 052, 058 |  |  |
| 030 | 026, 041 | 073 | 023 |
| 031 | 027, 042 | 080 | 022, 043, 060 |
| 032 | 042, 093 | 081 | §7 |
| 033 | §3.1, 020, 042 | 082 | 032 |
| 034 | 040, 045 | 083 | §7 Exceção |
| 035 | 045 | 090 | 062 |
| 036 | 022, 026 | 091 | §3.1, 020 |
| 037 | ADR-004, §7 | 092 | 030, §3.1 |
| 038 | 020, §3.1 | 093 | §7, 042 |
| 039 | 021–022 | 094 | 001, 030, 083 |
| 040 | ADR-004, 021–022 | 095 | 030, 051 |
| 041 | ADR-004, 023–024 | 096 | 055 |
| 042 | 021, 024, 054 | 097 | 091 |
| 043 | 024 | 098 | 056 |
|  |  | 100–101 | §13 |
|  |  | 102 | 021, 023 |
|  |  | 103 | 064 |
|  |  | 104 | 001, 032 |

| INV | Cobertura | PD | Cobertura |
|---|---|---|---|
| INV-1 | ADR-004, 021 | PD-001 | §3.1, 050 |
| INV-2 | ADR-004, 023 | PD-002 | ADR-003 |
| INV-3 | ADR-004, 021–022 | PD-003 | 041 |
| INV-4 | 026 | PD-004 | 027, 042 |
| INV-5 | 026 | PD-005 | §7, 082 |
| INV-6 | 070–072 | PD-006 | 024, 061, 071 |
|  |  | PD-007 | 031 |
|  |  | PD-008 | 071 |
|  |  | PD-009 | 032 |
|  |  | PD-010 | §7 Exceção |
|  |  | PD-011 | 002, 092, 093 |

**Rastreabilidade normativa: 65/65 REQ · 6/6 INV · 11/11 PD.** Não equivale à cobertura executada de testes.

---

## 15. Fora de escopo

Comportamento não autorizado no `01/02` não existe no produto.

**Repasse bancário ao Titular:** sistema apura obrigação; pagamento bancário, periodicidade, contestação e repasse não estão definidos no `02`.

**Emissão de cobrança:** sistema pode registrar valores/débitos necessários ao domínio; faturamento operacional de Membership, administração e despesas não está definido no `02`.

Gestão detalhada de obra/Design & Build não é requisito do `02`.

Nova funcionalidade entra primeiro no `02`.

**Recorte BP1:** portal, CRM, histórico de contatos, automação comercial e dados financeiros de parceiros não
integram a entrega pública. O portal do REQ-029 é evolução planejada, com implementação condicionada; sua
existência no roadmap não autoriza construir login específico, dashboard vazio, vendas fictícias ou RLS antecipada.

---

## 16. Prontidão

**READY FOR DEVELOPMENT.**

`01 v10.1 + 02 v4.2 + 03 v3.14` definem o escopo atual; BP1 pode ser implementada pelo contrato do TECH-057.
BP2 permanece condicionada ao REQ-029/TECH-058, sem prontidão de implementação presumida.

Pré-requisitos de operação, não de desenvolvimento:

políticas comerciais vigentes · parâmetros necessários publicados · PRL aplicável · PSP contratado.

Para BP1: remetente/destinatário e secrets de envio/proteção configurados; acesso e retenção das mensagens
definidos operacionalmente e sujeitos à validação jurídica aplicável; revisão da comunicação em P-LX-03 antes
do go-live das afirmações abrangidas. P-LX-03 não bloqueia a implementação técnica da BP1.

Mudança normativa no `01/02` exige análise de impacto e atualização da rastreabilidade.

**STATUS: FINAL · 10/10 · FREEZE**
