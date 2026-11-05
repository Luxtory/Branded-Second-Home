# Reserva de uso próprio (W12)

## 1. Fontes e escopo

Fontes: 01 BR-052, BR-103–BR-112, BR-151, BR-162, BR-163, BR-165, BR-166; 02 REQ-030–REQ-035, REQ-037, REQ-039, REQ-042,
REQ-097, REQ-098, REQ-100, PD-002, INV-1, §15 itens 1, 2 e 4; 03 ADR-003, TECH-021–TECH-023, TECH-026, TECH-027,
TECH-040, TECH-042, TECH-043, TECH-045, TECH-050–TECH-056, TECH-110, §13. Esta spec aplica essas regras; não substitui o
texto canônico. Decisão: [ADR-0026](../adr/0026-reserva-de-uso-proprio-autorizacao-no-banco-e-ativacao.md); plano:
[`docs/plan/w12-reserva-de-uso-proprio.md`](../plan/w12-reserva-de-uso-proprio.md); ameaças:
[`booking`](../security/threats/booking.md).

Dona: REQ-034, REQ-035, REQ-037, PD-002, INV-1 (com TECH-023, TECH-045, TECH-051 `create_own_use_booking`, TECH-055
estado `confirmed`; EC-1, EC-2, EC-4 na parte de reserva; CONC-1, CONC-2, CONC-3). Fora: cancelamento, no-show,
`restore`, liberação de ocupação, `advance_booking_states` e `correct_use_right` (W13); seleção Luxtory e convidados
(W14); fechar ofertas e Requests concorrentes (TECH-024, W17+); `reserved_right` devolvido (W21/W22, D4); transferência
(W28); reconciliação (W30); telas Admin de reserva. W13: §10.

## 2. Modelo

- `app.booking` (`03` §3.1): `channel` (lista fechada dos seis canais; só `own_use` aceito na W12), `holding_id` (a
  holding da época, imutável: identifica quem reservou mesmo depois de uma transferência), `stake_id` (Co-Owner) ou nulo
  (Owner), período `[checkin_date, checkout_date)` (ADR-003, PD-002), `state` (lista do TECH-055; nasce `confirmed`),
  `opened_by_operation` (uma reserva por operação) e `confirmed_at` — instante de aceite pelo mecanismo de reserva
  (`clock_timestamp()` na validação da linha), nunca o instante físico do COMMIT nem garantia de visibilidade. Sem
  UPDATE nem DELETE na W12; política e cancelamento chegam com a W13.
- `app.date_occupancy.booking_id` ganha a FK para a reserva da mesma Second Home.
- `app.capability_activation` (`own_use_booking`): ativação privilegiada, só o dono do schema escreve; nasce vazia.

## 3. Command `create_own_use_booking`

Entrada: `second_home_id`, `checkin_date`, `checkout_date`; a party representada vem do ator (TECH-050). Autoridade
Titular, sem Membership (TECH-051, REQ-034). Uma única entrada: a Server Action da Área do Titular (emenda D6 do
roadmap; uma rota REST seria adaptador fino sobre o mesmo handler quando houver consumidor fora da web).

Ordem (TECH-054/TECH-053): guard → idempotência → `BEGIN` → ativação (fechada: rollback, sem recusa gravada) → noites
(0 → `ERR_STAY_LENGTH`) → representação revalidada e travada (`FOR SHARE` na delegação; holding vigente) → Co-Owner com
mais de 14 noites → `ERR_STAY_LENGTH` → trava da Ação (classe 4) → travas das noites em ordem crescente (classe 5) →
revalidação → reserva → por noite, em ordem crescente: Co-Owner fecha `spe_pool`, abre `reserved_right` e consome;
ocupação `own_use` → auditoria → `COMMIT` → outbox.

Regras: noites seladas e futuras (`now < checkin_at`, TECH-043); custódia `spe_pool` (Co-Owner) ou `owner` (Owner) livre;
Co-Owner com janela aberta para cada exercício e para o 29/02 (abre na base, TECH-042), saldo do bucket e do exercício
de cada noite (REQ-030, TECH-027) e permanência: a sequência de noites consecutivas da Ação com `own_use` ativa que toca
a reserva tem no máximo 14 (BR-111, BR-112 — uma reserva que preenche o intervalo entre duas soma as três; o 29/02 conta,
REQ-031). Owner: sem janela, rotação, saldo nem limite de permanência (REQ-035, REQ-037).

Horizonte (P-14, D3): só noites seladas existem como capacidade — exercício corrente e seguinte (ADR-0024). Para o Owner
é limite técnico transitório, não regra de produto: a tela diz "calendário aberto até DD/MM/AAAA", nunca uma proibição.

Recusas (REQ-098, TECH-056), na ordem: `ERR_VALIDATION` · `ERR_PERMISSION` · indisponível (ativação ausente, banco) ·
`ERR_STAY_LENGTH` (0 noites; Co-Owner > 14) · `ERR_CAPACITY_UNAVAILABLE` (não selada, passada, custódia inelegível) ·
`ERR_BOOKING_CONFLICT` (noite reservada) · `ERR_WINDOW_NOT_OPEN` · `ERR_USE_RIGHT_BALANCE` (o 29/02 de quem não foi
contemplado cai aqui) · `ERR_STAY_LENGTH` (adjacência). Constraints: `stay_*` → `ERR_STAY_LENGTH`; `window_*` →
`ERR_WINDOW_NOT_OPEN`; `permission_*` → `ERR_PERMISSION`; `custody_*` → `ERR_CAPACITY_UNAVAILABLE`;
`uq_occupancy_active` → `ERR_BOOKING_CONFLICT`; `balance_*` → `ERR_USE_RIGHT_BALANCE`; `booking_*` (vínculo, ativação)
não é recusa funcional — só bug ou forja chegam lá.

Resultado: `booking_id`, datas, noites, `confirmed_at`, consumo por categoria (nulo no Owner). Evento
`booking.own_use_confirmed` (AsyncAPI) com a party que reservou; o consumidor registra a notificação para ela.

## 4. Banco (ADR-0026)

O banco recusa, mesmo por SQL direto do papel da aplicação: qualquer escrita sem a ativação; reserva de outro command,
canal, party sem delegação, holding de outra party ou Second Home; noite passada, não selada, 0 noites ou Co-Owner > 14;
janela fechada; consumo, transição ou ocupação sem a reserva da mesma operação, Ação e noite; reserva incompleta no
COMMIT; adjacência > 14; consumo repetido pela operação; ocupação sobre `reserved_right` aberta por outra operação (D4);
`restore`, liberação, correção, outras transições e escrita em reserva, ledger ou saldo. Condições temporais no instante
de cada escrita (T3); o COMMIT não é reavaliado.

## 5. Idempotência e resultado incerto (D6)

A chave nasce na prévia e acompanha o formulário (padrão W7): duplo clique e reenvio na mesma página devolvem o mesmo
resultado; recusa gravada troca a chave; datas alteradas voltam à prévia, que emite chave nova. O guard continua antes do
replay (executor intocado): com a representação perdida, a mesma chave devolve `ERR_PERMISSION`. A ativação é conferida
dentro da transação, então o replay de chave confirmada funciona mesmo depois de uma desativação.

**Resultado incerto (corrigido na auditoria do PR #78, 2026-11-02).** A recuperação é só a idempotência do executor,
presa à chave da operação e à autoridade vigente: resposta perdida, indisponibilidade ou funcionalidade fechada mantêm a
chave no formulário, e o reenvio é replay da mesma reserva (redireciona ao detalhe) ou recusa do guard antes do replay
(representação revogada → `ERR_PERMISSION`). Recusa gravada troca a chave. Não há consulta por Second Home e datas: a
versão anterior a fazia e, com um usuário representando duas holdings, apresentava como "já confirmada" a reserva de
outra holding numa tentativa que colidiu (reproduzido em `own-use-booking.db.test.ts`, "resultado incerto: só a
idempotência do executor"). Tradução pura em `presentation/own-use-outcome.ts`. Nenhum caminho cria uma segunda reserva:
mesma chave → replay ou recusa antes de executar; chave nova → `ERR_BOOKING_CONFLICT`; no banco, ocupação única e consumo
único.

**Limite: perda completa do estado da página.** A chave vive só no formulário. Se ela se perde (aba fechada, recarga,
outro aparelho), não há replay automático garantido, e nada a recupera por coincidência de datas nem por estado
persistido novo. A consulta substitui o replay: a página nova lê o banco, então uma reserva que chegou a ser confirmada já
aparece no calendário como reserva do Owner/desta Ação (o toque mostra tipo, período e situação), em `/titular/reservas`
e no detalhe, e a prévia sobre as mesmas noites diz "Já há reserva … em …" e não oferece confirmação. Uma tentativa
nova, numa aba antiga, só pode receber `ERR_BOOKING_CONFLICT` ("Uma ou mais noites já foram reservadas."), sem segunda
reserva. Se a primeira não chegou a gravar, as noites seguem livres e a prévia oferece a confirmação de novo. Prova: E2E
de confirmação (`own-use-booking.spec.ts`): a página reaberta, sem a chave, mostra a reserva e a prévia com o motivo.

## 6. Leitura do Titular (TECH-052)

Linhas por RLS (holding vigente representada); campos por privilégio de coluna: `booking` (id, Second Home, canal,
datas, estado, `confirmed_at`), `use_right_balance` (a própria Ação), `second_home_date` (noites seladas), `date_custody`
(`holder_kind` e fechamento) e `date_occupancy` (noite e liberação) — disponibilidade como fato, sem Ação nem reserva de
terceiros —, e `notification` (a party representada).

**Reserva pertence à holding da época (E5b, 2026-11-01).** A política de `booking` é
`EXISTS (holding h WHERE h.id = booking.holding_id)` sob a RLS da W8 em `app.holding` (delegação ativa e vigente do
usuário + holding vigente): o Titular lê só as reservas da holding que representa agora — nunca as de outra Ação da mesma
Second Home, as de um titular anterior da Ação (transferência) nem reservas sem Ação da Second Home do Owner; o ex-titular
perde o acesso quando a holding termina. `channel` entrou no `GRANT` de coluna por decisão do fundador (opção 1):
revela só o tipo das próprias reservas. Holding, Ação e operação seguem sem `GRANT` (nem para filtrar). Provas:
`own-use-booking.db.test.ts` ("o canal persistido aparece só nas reservas da própria holding…": canal, id forjado, SQL
direto como `authenticated`, filtro por coluna sem `GRANT`, transferência de Co-Owner e de Owner).

**Transferência e dependência da W28 (BR-344 a BR-346, REQ-093).** A W12 não transfere; a política acima só decide
leitura. A mudança de holding não toca reserva, ocupação nem consumo (BR-344: a reserva não se extingue): o teste de
transferência confere reserva `confirmed`, noites ocupadas e consumo da operação intactos, e o calendário do adquirente
mostra essas noites como indisponíveis — sem expor a reserva nem dados do transmitente. O saldo remanescente já é líquido
do consumido (BR-345), e as posições de rotação seguem na Ação (BR-346), sem mudança na W12. Fica para a W28 (registrado
no roadmap): quem vê e exerce, depois da transferência, as reservas futuras que sobrevivem (REQ-093), sem expor dados
pessoais do transmitente ao adquirente; até lá, nenhuma tela da W12 promete esse acesso.

**Calendário (E5b).** Uma única transação só de leitura, `REPEATABLE READ` (`withUserThenServerRead`): primeiro, como
`authenticated` e com as claims do usuário, a RLS prova a holding; depois, no mesmo snapshot, o papel da aplicação lê só
o que a RLS não alcança (janela, ativação). A página lê sob essa RLS as noites seladas, a custódia aberta, a ocupação ativa, as reservas e os
saldos da holding e entrega a situação de cada noite já resolvida no servidor (`started` · `mine` · `unavailable` ·
`closed` · `leap-other` · `available`). A janela da Ação vem da mesma função de domínio do command, com os fatos da
formalização e do sorteio lidos pelo servidor só depois de a RLS provar a representação; a saída é só a janela desta Ação.
O 29/02 aparece como noite adicional apenas com saldo `leap` > 0 da Ação, janela aberta e custódia elegível.

**Reservas fechadas (ADR-0026, auditoria do PR #78).** A fonte da apresentação é a própria ativação privilegiada
(`BookingStore.isActivated`), lida pelo servidor no mesmo snapshot (`bookingOpen`); a interface nunca decide. Sem a
ativação, calendário, disponibilidade, prévia e reservas seguem consultáveis; um aviso informa que novas reservas ainda
não estão abertas e nenhuma confirmação é oferecida ("Noites livres. Novas reservas ainda não estão abertas."). A prévia
devolve `bookingOpen` a cada pedido, então uma mudança da ativação aparece na próxima prévia ou recarga. O command
continua conferindo a ativação dentro da transação (fechada → nada gravado).

**Prévia (E5b).** Server Action `previewOwnUseBookingAction`: a RLS prova a holding e o servidor confere as regras do
command (`previewOwnUseBooking`, mesmas portas e funções de domínio) no mesmo snapshot `REPEATABLE READ` só de leitura
(`withUserThenServerRead`), sem travas nem escrita, reunindo todos os motivos; intervalo limitado a 800 noites; a chave de
idempotência nasce só numa prévia válida com as reservas abertas. A reserva já existente da própria holding é motivo
específico ("Já há reserva do Owner/desta Ação em …"), não "indisponível". Nunca decide: a confirmação revalida tudo no
banco. O snapshot dá consistência (autorização e fatos do mesmo instante), não vigência: uma revogação posterior a ele não
é vista pela prévia, e o command confere a representação de novo no instante da confirmação. Risco e custo: STRIDE
T-1208.

## 7. Telas (E5b, depois da revisão E5a)

Calendário por holding (meses com categoria, 29/02, disponível · sua reserva · indisponível · ainda não reservável ·
passada; saldo por categoria e abertura da janela no Co-Owner; "calendário aberto até"), formulário com datas nativas →
prévia calculada no servidor → confirmação; lista de reservas e detalhe; central de notificações só leitura. Componente
`lx-calendar` no Design System. Mobile-first a partir de 320 px (ADR-0009). Terminologia: "noites", "Direito de Uso"
(Co-Owner), "uso próprio" (Owner); nunca "diária(s)" nem "cota" (REQ-100).

Seletor de período (checkpoint E5a; modelo híbrido, linguagem visual, grade de 44 px, Owner sem classificação sazonal e
legenda condicional aprovados pelo fundador em 2026-10-31; refinamentos da v2.1 aguardam a revisão visual final antes da
E5b): os campos de data nativos continuam a entrada canônica do formulário, e o calendário interativo, sincronizado com
eles, escolhe entrada (1º toque) e saída (2º toque). Um período contínuo por reserva (D5). A noite da data de saída não é
usada (PD-002), então uma noite indisponível pode ser a data de saída; com a entrada escolhida, datas posteriores que não
servem de saída ficam sem ação e explicam o limite. Conflitos (noite indisponível, passada, fora do calendário, janela não
aberta, 29/02 sem o direito, saldo, permanência) são explicados no resumo com o que fazer, nunca ajustados
automaticamente; período impossível não mostra saldo projetado; "Confirmar reserva" só habilita depois de uma prévia
válida do servidor para as mesmas datas; sem preço por noite. Sem JavaScript, só os campos de data funcionam — o fluxo
completo sem JavaScript não é prometido. Datas civis da Second Home: a E5b recebe "hoje" e as noites do servidor, no fuso
da Second Home, e nunca deriva a data civil do fuso do navegador. Contrato visual e de teclado: `lx-calendar` em
`docs/reference/design-system.md`.

### Apresentação de reservas e canais (decisão de interface, checkpoint E5a v2.4)

Separação conceitual preservada: **disponibilidade** (a noite está livre ou não — `date_custody`/`date_occupancy`, sem
dizer de quem), **reserva** (`app.booking` da holding que o usuário representa, com período e estado) e **canal**
(`booking.channel`, TECH-023). O calendário nunca deduz o tipo de uma reserva pela cor, pela categoria sazonal ou pela
custódia: mostra canal e estado persistidos.

- **Calendário**: uma só aparência para as reservas da holding representada — "Reserva desta Ação" (Co-Owner) ou
  "Reserva do Owner": quem usa a tela representa uma party (`identity` §14), então "sua" seria impreciso. Nenhuma cor por
  canal. Tocar ou dar Enter num desses dias mostra, na linha de retorno, o tipo, o período e a situação (ex.: "Reserva
  desta Ação · Uso próprio · Direito de Uso · entrada 07/02, saída 10/02 (3 noites) · Confirmada"); a E5b acrescenta o
  link para o detalhe da reserva. Reservas de terceiros aparecem só como "Noite indisponível" — sem identidade, mecanismo,
  operação ou valores (as permissões da W12 já não os expõem).
- **Lista de reservas** (E5b): cada reserva com tipo, período, noites e situação; filtro por tipo só quando houver mais de
  um canal operando.
- **Não confirmado não é reserva**: solicitação pendente, oferta, depósito, autorização comercial ou disponibilidade
  comercial nunca aparecem como reserva confirmada.
- **Rótulos por canal** (apresentação; nomes do `02`). A W12 produz e exibe só `own_use`; cada canal ganha seu rótulo e
  sua regra de autorização de leitura na wave que o implementar — nunca exibido antes de operar:

  | Canal persistido | Rótulo | Exibido como reserva da holding |
  |---|---|---|
  | `own_use` | "Uso próprio · Direito de Uso" (Co-Owner) · "Uso próprio" (Owner) | W12 |
  | `luxchange_request` | "Luxchange · Request" | wave do Luxchange, se a party representada for a solicitante |
  | `luxchange_direct` | "Luxchange · Direct" | idem |
  | `luxplus` | "Luxplus" | wave do Luxplus, se a party representada for a hóspede |
  | `rental_external` | "Locação externa" | wave da locação, para a Ação ofertante |
  | `luxtory_use` | — | nunca: para o Titular é "Noite indisponível" |

  Estados: `confirmed` → "Confirmada" (único produzido na W12); `in_use`, `completed`, `no_show` e `in_exception` ganham
  rótulo na wave que os produzir. Uma reserva cancelada sai da indicação de reserva ativa no calendário, mas permanece
  no histórico (lista e detalhe); a disponibilidade das noites reflete o estado canônico atualizado (custódia e ocupação
  que a W13 definir), nunca presumida livre. A W12 não antecipa essas transições.
- **Dependência aberta (não decidida na E5a)**: a permissão de coluna do Titular em `app.booking` (TECH-052) não inclui
  `channel`. Exibir o tipo persistido exige acrescentar `channel` a esse `GRANT` — as linhas já são restritas pela RLS às
  holdings que o usuário representa, então o canal só revela o tipo das próprias reservas. É mudança de privilégio e de
  migration: só com aprovação do fundador. Sem ela, a E5b mostra período e situação, sem o tipo.
- **29/02** (BR-090 a BR-095, REQ-031, PD-004): para a Ação contemplada no exercício, "29/02/2028 · 1 noite adicional",
  losango no dia, "29/02: noite adicional" na legenda e a nota "O 29/02/2028 foi atribuído a esta Ação neste ano bissexto e
  não desconta do saldo anual de Alta/Super Alta nem de Média/Baixa"; na prévia, "29/02/2028 · noite adicional — não
  desconta do saldo anual". Sem termo de produto novo. Para outra Ação, "não atribuído a esta Ação em 2028" (pode ser a
  saída); para o Owner, noite comum.

### Telas implementadas (E5b)

`/titular/calendario/[holdingId]` (Direito de Uso ou uso próprio, seletor híbrido, prévia do servidor, confirmação pela
Server Action), `/titular/reservas` (tipo, período, noites e situação), `/titular/reservas/[bookingId]` (detalhe, 404
sem oráculo) e `/titular/notificacoes` (central só leitura). Entrada pela Área do Titular ("Uso próprio": Second Homes
que o usuário representa). Componente `OwnUseCalendar` (cliente) sobre o contrato `lx-calendar`; textos em
`presentation/i18n/own-use-pt-br.ts`. Sem a ativação (ADR-0026), a página informa que novas reservas ainda não estão
abertas e não oferece confirmação (§6, "Reservas fechadas"); se a ativação cair entre a prévia e o envio, o command
recusa e a action volta "As reservas de uso próprio ainda não estão abertas." com a mesma chave. Provas no E2E
`tests/e2e/own-use-booking.spec.ts`: Owner e Co-Owner com as reservas fechadas; e confirmação bem-sucedida com a ativação
ligada só no banco descartável do teste (`setE2eOwnUseBooking`) → detalhe, notificação, lista, calendário com a própria
reserva e prévia com o motivo específico → ativação desligada, aviso de volta e nenhuma confirmação. No Co-Owner, o
mesmo teste das reservas fechadas liga a ativação só nesse banco e confirma uma noite: detalhe "Uso próprio · Direito de
Uso", saldo da categoria da noite uma noite menor no Direito de Uso desta Ação, a outra categoria intacta (REQ-030), noite
como reserva desta Ação e prévia com o motivo.

## 8. Aceite

`[INV-1][CONC-1]` reservas concorrentes na mesma noite → exatamente uma, a outra `ERR_BOOKING_CONFLICT` · `[CONC-2]`
saldo contra saldo · `[CONC-3][TECH-045]` adjacência concorrente, inclusive por dois representantes da mesma party ·
`[PD-002]` de 10 a 12/03 consome 10 e 11/03 · `[TECH-110]` 1 noite aceita, 0 recusada · `[REQ-034][EC-1][EC-2]` noite a
noite; adjacentes > 14 recusadas, inclusive preenchendo o intervalo · `[REQ-031][EC-4]` o 29/02 conta para permanência ·
`[REQ-035]` limite só no Co-Owner · `[REQ-037]` Owner sem janela nem rotação · `[TECH-053]` travas em ordem, duas conexões
· `[TECH-050]` representação revogada ou expirada no ponto de decisão → `ERR_PERMISSION` · `[TECH-052]` isolamento entre
Titulares · `[REQ-097]` notificação à party que reservou · escrita direta sem ativação recusada pelo banco · E2E com axe 0.

## 9. Oportunidade futura (sem wave, sem semântica antecipada)

Seleção de múltiplos períodos numa única ação (o legado Luxtory2.0 tinha dias avulsos e criação atômica). Se adotada,
entra antes como decisão de produto (atômica ou parcial), reutilizando o command de um período. Lições do legado que não
se copiam: saldo pelo ano do primeiro período (contraria EC-1), limites com valor padrão técnico (TECH-001), limite de 14
por período sem considerar reservas adjacentes, dia passado por `CURRENT_DATE` (não pelo check-in das 14:00 locais) e
campo de convidado na reserva (P-6, W14).

## 10. W13 — cancelamento, no-show, recuperação, exceção e invalidação

### 10.1. Fontes e escopo

Fontes: 01 BR-123, BR-160–BR-163, BR-280–BR-284; 02 v4.4 REQ-080, REQ-081, REQ-083, REQ-084, REQ-096–REQ-098, PD-010,
§15 itens 10, 12 e 16; 03 v3.16 TECH-022, TECH-023, TECH-026, TECH-040, TECH-043, TECH-046, TECH-051–TECH-056,
TECH-060, TECH-090, TECH-091, TECH-110, §7, §13. Decisão: [ADR-0027](../adr/0027-ciclo-da-reserva-de-uso-proprio-e-autorizacao-independente.md);
plano: [`docs/plan/w13-cancelamento-no-show-recuperacao-e-excecao.md`](../plan/w13-cancelamento-no-show-recuperacao-e-excecao.md);
ameaças: [`booking`](../security/threats/booking.md) (W13). Esta seção aplica os canônicos; não os substitui.

Dona: REQ-080, REQ-081, REQ-083, REQ-084, PD-010; EC-10, EC-12, EC-16; commands `cancel_own_use_booking`,
`declare_no_show`, `open_exception`, `resolve_exception`, `recover_future_capacity`, `correct_use_right` (emenda D2 da
W11); jobs `advance_booking_states` e `flag_no_show_candidates`. Fora: ativação das reservas (migration própria, depois
da W13 em Production e de autorização específica); `reserved_right` devolvido (W21/W22); mecanismos do Club (W18+);
transferência (W28); selo e reconciliação (W30); correção de expiração (fechada, emenda do roadmap); rotas REST (adiadas).

### 10.2. Estados e transições (TECH-055)

| Transição | Quem | Condição no instante do banco |
|---|---|---|
| `confirmed → in_use` | sistema (`advance_booking_states`) | `at ≥ 1º checkin_at` |
| `in_use → completed` | sistema | `at ≥ checkout_at` (10:00 locais do `checkout_date`, fuso IANA); job atrasado faz `confirmed → in_use → completed` na mesma execução |
| `confirmed`/`in_use → cancelled` | Titular | ≥ 1 noite não iniciada; termos esperados = termos calculados |
| `in_exception → cancelled` | Titular | P-A: regras normais; P-B: Co-Owner só tempestivo, Owner a qualquer tempo |
| `confirmed`/`in_use → no_show` | Admin + autorização `no_show` | `1º checkin_at ≤ at < checkout_at` |
| `confirmed`/`in_use → in_exception` | Admin | `at < checkout_at`; tipo P-A (motivo da PD-010) ou P-B (apuração do REQ-084) |
| `in_exception → confirmed`/`completed` | Admin | resolução única; `confirmed` só com `at < checkout_at` e `completed` só com `at ≥ checkout_at` (P-A e P-B sem comprovação) |
| `in_exception → cancelled` | Admin + autorização | P-A: `exception_cancellation`; P-B: `invalidation` |

Histórico em `app.booking_state_transition` (só-inserção, cadeia linear provada no banco) e estado projetado em
`app.booking` por gatilho (ADR-0027 §2). Uma exceção aberta por reserva; `in_exception` ⇔ exatamente uma aberta.

### 10.3. Matriz econômica

"Não iniciada" = `at < checkin_at` da noite, no instante de cada escrita (TECH-043). Noite iniciada ou passada nunca muda.

| Evento | Co-Owner | Owner |
|---|---|---|
| Cancelamento tempestivo (Titular) | `cancelled`, `timely`; libera todas; `reserved_right → spe_pool`; `restore` por noite (bucket e exercício da noite) | `cancelled`, sem classe; libera; `owner` |
| Cancelamento tardio (Titular) | `cancelled`, `late`; libera as não iniciadas; elas `→ forfeited_right`; consumo mantido | `cancelled`; libera as não iniciadas; `owner` (REQ-081) |
| No-show (Admin) | `no_show`; libera as não iniciadas; elas `→ forfeited_right`; consumo mantido | `no_show`; libera as não iniciadas; `owner` |
| P-A aberta / resolvida `confirmed` ou `completed` | só estado; ocupação e custódia inalteradas | idem |
| P-A resolvida `cancelled` (Admin) | classificação no instante (REQ-080): tempestiva = efeitos da BR-280; tardia = não iniciadas `→ forfeited_right`, consumo mantido; nenhuma entrada no Inventário | libera as não iniciadas; `owner` |
| Recuperação (Admin) | `forfeited_right` futura `→ luxtory/inventory/recovered_future_capacity`, com `authorization_ref`; sem `restore`, Crédito ou remuneração (BR-284); origem P-A exige atestação de disponibilidade e compatibilidade com a situação do bloqueio | não se aplica |
| P-B: invalidação | `correct_use_right`: `cancelled`; não iniciadas: libera, `reserved_right → spe_pool`, `correction` (`quantity` = a do consumo; `consumed − quantity`) | `resolve_exception`: `cancelled`; libera as não iniciadas; `owner` |
| P-B: sem comprovação | `confirmed` ou `completed` (§10.2) | idem |

Nada nesta matriz cria Crédito, indenização, compensação, restituição não prevista ou entrada automática no Inventário
Luxtory (PD-010, BR-123, BR-284).

### 10.4. Prazo de 15 dias (decisão funcional expressa do fundador, 2026-11-03)

Tempestivo ⇔ `cancelled_at ≤ checkin_at − 360 h`, inclusive. `checkin_at` é o instante gravado na selagem da primeira
noite (14:00 locais, fuso IANA); 360 h = 15 × 24 h sobre instantes (TECH-040; precedente TECH-044); `cancelled_at` é o
instante do banco na escrita da transição (T3). Implementação: `interval '360 hours'` (nunca `'15 days'`, que usa o fuso
da sessão) e `Temporal.Instant.subtract({ hours: 360 })`; função SQL pura com o instante como parâmetro e gêmea
TypeScript com equivalência testada. Exibição no fuso da Second Home ("até DD/MM às HH:MM"); em fusos com horário de
verão pode aparecer 13:00 ou 15:00; no Brasil, sempre 14:00.

### 10.5. Commands

- **`cancel_own_use_booking`** (Titular, sem Membership; Server Action). Autorizado por representação, command, K2,
  prazo e guard no banco; não exige autorização independente. Entrada: reserva e termos esperados da prévia
  (classificação no Co-Owner e primeira noite afetada). Ordem: guard → idempotência → `BEGIN` → K2 → representação
  (`FOR SHARE`) → classe 4 (Co-Owner) → classe 5 (noites, crescente) → transição (trava a reserva) → por noite:
  liberação, custódia, `restore` → auditoria → `COMMIT` → outbox. Termos diferentes dos esperados →
  `ERR_CANCELLATION_TERMS_CHANGED`, sem efeito; a prévia emite chave nova. Sem noite não iniciada → `ERR_STATE_TRANSITION`.
  Cancelamento só da reserva inteira. Durante exceção, grava a resolução (`titular_cancellation`) na mesma transação.
- **`declare_no_show`** (Admin + base registrada + autorização `no_show`). Janela `[1º checkin_at, checkout_at)`;
  evidência mínima: referência a registro verificável de não comparecimento (administração profissional ou party),
  atestada pelo Admin. Reserva de uma noite ou ausência constatada na última noite: zero noites afetadas, só o estado.
- **`open_exception`** (Admin + base): P-A com motivo da lista fechada da PD-010 (manutenção emergencial, segurança,
  sinistro, caso fortuito, força maior) ou P-B (apuração do REQ-084, com referência do incidente). Notifica a party; na
  P-A, com o prazo local de 360 h.
- **`resolve_exception`** (Admin + base): `confirmed` (`at < checkout_at`) ou `completed` (`at ≥ checkout_at`), sem efeito
  sobre saldo ou custódia; `cancelled` só com autorização
  (P-A `exception_cancellation`; P-B Owner `invalidation`). P-B Co-Owner `cancelled` → recusado (usa `correct_use_right`).
- **`recover_future_capacity`** (Admin + base + autorização `recovery`): só as custódias gravadas na autorização, ainda
  futuras e ativas; emitida depois do no-show ou do cancelamento tardio commitado, nunca em conjunto.
- **`correct_use_right`** (Admin + base + autorização `invalidation`; só P-B de Co-Owner): uma operação resolve a
  apuração, libera, devolve a custódia e corrige cada consumo das noites não iniciadas. Correção de expiração recusada.

Recusas (REQ-098, TECH-056): `ERR_VALIDATION` · `ERR_PERMISSION` · indisponível (K2 ausente) · `ERR_STATE_TRANSITION`
(transição fora da TECH-055, janela do no-show, sem noite afetada, tardio em P-B) · `ERR_CANCELLATION_TERMS_CHANGED` ·
`ERR_CAPACITY_UNAVAILABLE` (custódia fora da regra) · autorização ausente, expirada, revogada, usada ou fora do escopo →
`ERR_PERMISSION`. Constraints do banco mapeadas por prefixo, como na W12.

### 10.6. Banco

| Escrita do `luxtory_app` | Regra |
|---|---|
| `booking_state_transition` (INSERT) | operação pendente do command certo; papel, delegação/`staff_role`; `previous = last_transition_id`; par TECH-055; tempo; K2 |
| Liberação de ocupação (UPDATE de `released_at`, `release_reason`, `released_by_operation`) | transição `cancelled`/`no_show` da mesma operação; motivo coerente (`cancelled`, `no_show`, `exception`, `invalidation`); noite não iniciada; instante do banco; uma vez |
| `reserved_right → spe_pool` | cancelamento tempestivo (Titular ou P-A) da reserva que abriu a custódia, ou invalidação Co-Owner |
| `reserved_right → forfeited_right` | cancelamento tardio (Titular ou P-A) ou no-show; noite não iniciada; ocupação liberada na mesma operação |
| `forfeited_right → recovered_future_capacity` | `recover_future_capacity` com uso de autorização `recovery` que grava essa custódia |
| `restore` | cancelamento tempestivo; aponta o `consume` da operação de criação, mesma noite |
| `correction` | invalidação Co-Owner; aponta o `consume` da noite; uma reversão por consumo (índice único sobre `restore`/`correction`) |
| `booking_exception`, `…_resolution`, `booking_no_show_candidate`, `booking_authorization_request`, `booking_authorization_use` (INSERT) | só pela operação do command dono; uso de autorização validado pelo gatilho |

`app.capability_activation`: `CHECK` aceita `own_use_lifecycle`; nenhuma linha. Sem `UPDATE` em `app.booking`; sem
`EXECUTE` em funções de autorização ou de projeção.

### 10.7. Autorização independente

Fluxo: o Admin registra a solicitação (id opaco) → o fundador dispara o workflow no GitHub Environment com o id e aprova
→ o papel `luxtory_booking_authorizer` chama `app.authorize_booking_action`, que deriva o escopo dos fatos, confere o
esperado e grava a autorização → o Admin executa o command; o banco exige o uso na mesma operação. Escopo, emissão,
validade e execução por finalidade: tabela do ADR-0027 §4. A solicitação registrada não prova legitimidade: o aprovador
verifica os fundamentos por fontes próprias (ADR-0027 §4; roteiro no runbook do autorizador). Criar o Environment, a senha e qualquer acesso a Production
são decisões futuras do fundador, fora da W13.

### 10.8. Chaves, jobs e notificações

- K1 `own_use_booking` (criação) e K2 `own_use_lifecycle` (os seis commands acima); contenção em três degraus (ADR-0027
  §5). Jobs fora da K2.
- `advance_booking_states` e `flag_no_show_candidates`: `SYSTEM_COMMANDS`, `/api/jobs/[job]`, cron diário 17:00 UTC
  (Hobby: uma vez por dia, ±59 min). A cadência é do runbook (TECH-001); nenhum command depende do estado do job.
- Notificações pelo outbox (TECH-091), à party da reserva: cancelamento, exceção aberta e resolvida, invalidação,
  no-show e correção. Recuperação não notifica (BR-284). Contratos AsyncAPI no início da E2, antes do primeiro handler
  que emite evento.

### 10.9. Telas

- Titular: detalhe da reserva → "Cancelar reserva" → prévia (classificação, prazo local, noites afetadas, efeito por
  categoria; Owner: "as noites voltam ao calendário do Owner"; em exceção, a situação e o que muda) → confirmação →
  resultado. Estados no vocabulário da REQ-096 ("Em exceção" como "Em apuração" na P-B). Copy "desta Ação"/"do Owner".
- Admin: `/admin/reservas` (lista por Second Home e estado; "A verificar comparecimento" com o prazo do checkout;
  apurações com o prazo do 1º check-in) e `/admin/reservas/[id]` (noites com custódia e ocupação, histórico, ações com
  prévia, base registrada e solicitação de autorização). MFA; leituras auditadas. Revisão renderizada (E4a) antes da
  integração.

### 10.10. Aceite

`[REQ-080]` 15 dias (360 h) devolve o saldo noite a noite; 14 mantém o consumo; classificação gravada não muda ·
`[REQ-080]` E2E: a consequência aparece antes de confirmar; termos alterados → recusa sem efeito · `[EC-10]` início
parcial: só as não iniciadas viram `forfeited_right` e são recuperáveis · `[REQ-081]` Owner: nenhum movimento de ledger,
custódia `owner`, nada no Inventário · `[TECH-060]` `forfeited_right` não reservável, depositável nem locável ·
`[PD-010][REQ-083][EC-12]` P-A sem restituição não prevista, Crédito ou compensação; resolução auditada; tardia em
`forfeited_right` sem entrada automática · `[REQ-084][EC-16]` invalidação Owner e Co-Owner com autorização; noites
iniciadas inalteradas; sem comprovação → `confirmed`/`completed` conforme o período; Co-Owner tardio e no-show suspensos na
apuração; Owner cancela sem efeito retroativo · `[TECH-110]` correção nunca altera concessão, não duplica `restore`, não
alcança `forfeited_right`; correção de expiração recusada · `[TECH-046]` no-show recusado antes do 1º check-in e em
`checkout_at`; aceito em `checkout_at − 1 µs`, na última noite e em reserva de uma noite · `[TECH-055]` matriz de
transições inválidas · cadeia: duas raízes, anterior desatualizada, bifurcação e anterior de outra reserva recusadas;
transições concorrentes → exatamente uma · resolução `completed` antes de `checkout_at` e `confirmed` depois recusadas ·
cancelamento do Titular aceito sem autorização independente (com representação, K2 e prazo) · P-B forjada com K2: só
suspende tardio do Co-Owner e no-show; Owner e tempestivo seguem; saldo, custódia e ocupação inalterados · autorização: os critérios do plano W13 (§ "Autorização independente") ·
K2 ausente → os seis commands recusados; jobs limitados pelo instante · tabela de ativação com 0 linhas · prazo: −1 µs e
exato tempestivos, +1 µs tardio, fusos com e sem horário de verão · consultas de invariantes vazias após todo teste `db` ·
E2E com axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px, fluxo por toque a 390 px.

### 10.11. E1 — implementação no banco (2026-11-04, ambiente isolado)

Autorizada pelo fundador em 2026-11-03 só em ambiente isolado; nada em Production. Migrations (dono: agente principal):
`20261104030100_booking_lifecycle_and_independent_authorization` (K2 no `CHECK`, instantes puros, transições, projeção,
guarda, exceção, resolução, candidatos, solicitação/autorização/revogação/uso, papel `luxtory_booking_authorizer`,
regras por transição, efeitos completos no COMMIT, invariantes), `20261104030102_inventory_own_use_lifecycle` (motivos e
regra da liberação; custódia `reserved_right → spe_pool | forfeited_right` e `forfeited_right → recovered_future_capacity`),
`20261104030104_calendar_own_use_restore_and_correction` (`restore`/`correction` presos ao evento, reversão única,
`consumed − quantity` na projeção, invariantes do ledger) e `20261104030106_booking_activation_readiness`
(`app.assert_own_use_activation_ready()`). `db:check` up → down → up; o `down` recusa descartar fatos.

Detalhes de implementação (não mudam decisão; ADR-0027, "Notas de implementação da E1"):

- **Natureza do evento** em `booking_state_transition.kind`: `advance` (job), `cancellation` (Titular), `no_show`,
  `exception_opening`, `exception_resolution` (P-A, qualquer desfecho; P-B sem comprovação) e `invalidation` (P-B
  cancelada: `correct_use_right` no Co-Owner, `resolve_exception` no Owner). O `CHECK` amarra natureza e par da TECH-055;
  a classe e a primeira noite afetada só existem nos eventos que as têm; a base registrada só nos atos Admin. Motivo da
  liberação por natureza: `cancelled`, `no_show`, `exception`, `invalidation`.
- **Termos (D7):** o Titular grava na transição a classe e a primeira noite afetada esperadas; o gatilho calcula no
  instante e recusa a diferença (`cancellation_terms_changed`). Nos atos Admin o banco grava os termos calculados, e a
  classe da P-A de Co-Owner tem de ser igual à da autorização.
- **Efeitos completos no COMMIT:** para `cancelled`/`no_show`, exatamente as noites não iniciadas no instante da
  transição são liberadas pela operação, com o motivo do evento; no Co-Owner cada `reserved_right` aberta pela criação é
  sucedida por `spe_pool` (tempestivo, invalidação) ou `forfeited_right` (tardio, no-show), com `restore` (tempestivo) ou
  `correction` (invalidação) do consumo da criação; no Owner nada se move. A recuperação move exatamente as custódias
  autorizadas ainda futuras no instante do uso. O uso de autorização sem o ato da mesma operação é recusado.
- **Uma operação, um evento:** índice único de `operation_id` fora do avanço do sistema (o job atrasado grava dois avanços).
- **Solicitação:** command Admin não crítico `request_booking_authorization` (sem efeito econômico; fora da K2, como a
  ADR-0027 §5 lista só os seis commands). Referência de aprovação no formato `github-run:<id>:<tentativa>`; referência de
  incidente da P-B com charset restrito (sem dado pessoal).
- **`correction`:** mantém a forma da W11 (`stay_date` nulo, `refers_to_id` no `consume`, `quantity` igual); a de
  expiração continua recusada a todos (`use_right_correction_not_enabled`), a de concessão pela regra da W11.
- **Recusas para a E2 mapear (prefixos):** `conflict_booking_*` → `ERR_STATE_TRANSITION`; `permission_*` (incluindo
  `permission_authorization_missing|scope|revoked|used|expired`) → `ERR_PERMISSION`; `custody_*` →
  `ERR_CAPACITY_UNAVAILABLE`; `cancellation_terms_changed` → `ERR_CANCELLATION_TERMS_CHANGED` (prefixo novo);
  `booking_lifecycle_not_activated` → indisponível (K2 ausente), como `booking_not_activated` na W12. Nomes sem prefixo
  funcional (`booking_write_binding`, `booking_operation_provenance`, `booking_closure_*`, `booking_exception_*`) são
  erros de programação ou forjamento, não recusa funcional.
- **Testes (PostgreSQL real, `luxtory_app` com os privilégios reais):** `tests/migrations/booking-lifecycle.db.test.ts`
  e `tests/migrations/booking-authorization.db.test.ts`; fixtures em `tests/features/booking/lifecycle-support.ts`
  (reserva e exceção históricas gravadas pelo dono com o gatilho temporal desligado só na transação de fixture; o papel
  autorizador por `SET ROLE` e um teste com login real). Expectativas da W10–W12 ajustadas só onde a W13 muda o
  comportamento.

#### 10.11.1. Auditoria do PR #82 (2026-11-04) — complementos da E1

- **Ordem obrigatória de travas para os handlers da E2** (TECH-053; a mesma da W12, que a E1 só estende). Leitura da
  K2 (`app.capability_activation`, modo compartilhado) → autoridade: Titular, delegação ativa `FOR SHARE`; Admin, trava
  compartilhada `app.staff_role:<id>` → classe 4 `app.stake:<id>` (Co-Owner) → classe 5
  `app.second_home_date:<casa>:<data>` de todas as noites da reserva, em ordem crescente → uso da autorização (Admin)
  → transição (trava consultiva `app.booking:<id>`, tomada pelo gatilho) → por noite, em ordem crescente: liberação,
  custódia, `restore`/`correction` (classe 6) → auditoria → COMMIT → outbox. Recuperação: autoridade → classe 4 →
  classe 5 das noites das custódias → uso → custódias em ordem crescente. Abertura e resolução sem efeito: autoridade →
  transição. Autorizador: só `app.booking:<id>`. Jobs: uma transação por reserva (o gatilho trava Ação e reserva);
  nunca reservas de Ações diferentes na mesma transação. Provado com o command real da W12 (testes "ordem de travas" e
  "noites liberadas"): na mesma Ação, criação e cancelamento se serializam sem deadlock; com a classe 5, a outra Ação
  reserva as noites logo depois do COMMIT; sem ela, a leitura concorrente recusa (`ERR_BOOKING_CONFLICT`), nunca dupla
  ocupação.
- **Solicitação na E2** (`request_booking_authorization`, TECH-051 "demais operações do REQ-095"): fora da lista fechada
  de commands críticos e da K2, mas com guard Admin com MFA, base registrada, `audit_log`, idempotência e o mesmo
  limitador dos commands Admin; o escopo esperado é derivado no servidor pelos fatos (nunca datas vindas do cliente); o
  id opaco é gerado no servidor e é a única saída; sem evento de outbox. Provado no banco: a solicitação não cria
  autorização, não muda estado, saldo, custódia nem ocupação, e o id dela não vale como autorização.
- **`search_path` (vulnerabilidade achada e corrigida na E1).** Com `SET search_path = ''`, o PostgreSQL ainda busca o
  schema temporário da sessão primeiro para nomes de tipo; o papel autorizador (privilégio TEMP, padrão de PUBLIC)
  criou `pg_temp.uuid` com `CHECK` chamando função própria e, dentro de `app.authorize_booking_action`, ela rodou como o
  dono (`postgres`). Correção: toda função criada ou redefinida pela W13 usa `SET search_path = pg_catalog, pg_temp`
  (o schema temporário explicitamente por último, como recomenda a documentação do PostgreSQL); a prontidão exige isso
  nas `SECURITY DEFINER` acionáveis pelo autorizador ou pelo papel da aplicação. Regressões: autorizador e
  `luxtory_app` com `text`, `uuid`, `date`, `timestamptz`, `jsonb` e `name` sombreados não executam nada como o dono.
- **Testes independentes da data real:** os cenários da W13 selam também o exercício anterior (o do `open_exercise`
  quando era o corrente; só a regra de horizonte fica de fora, na transação de fixture do dono) e a reserva histórica
  registra consumo de exercício já encerrado com o gatilho de consumo desligado só na fixture. Regressão da virada do
  ano: exercício anterior inteiro selado, noites passadas sempre existentes e reserva que cruza a próxima virada com o
  efeito de cada noite no bucket do próprio exercício.
- **2ª auditoria do PR #82 (2026-11-04).** (1) A prontidão exige `search_path = pg_catalog, pg_temp` em toda `SECURITY
  DEFINER`; a única exceção é uma lista finita e auditada das cinco legadas com `''` (assinatura + md5 do corpo
  revisado + configuração exata): `auth_account_by_email`, `auth_account_labels` (executadas pelo `luxtory_app`) e
  `brand_partner_is_public`, `catalog_term_is_public`, `home_concept_is_public` (executadas pelo `anon`). Cada uma é
  justificada por inspeção e por teste com seis tipos sombreados pelo papel que a executa. Teste negativo: função nova
  com `''`, `public`, `pg_temp` primeiro ou sem `search_path`, e legada com corpo alterado, são recusadas.
  (2) **Aquisição determinística das travas na E2:** a ordem das chaves é calculada antes e cada chave é travada numa
  instrução própria (laço no handler); não reproduzir o padrão de uma única consulta com `LATERAL` sobre subconsulta
  ordenada, que depende da ordem de avaliação do SQL.
- **4ª auditoria e preflight do PR #82 (2026-11-04).** (1) A prontidão confere a ACL das cinco funções privilegiadas,
  beneficiário a beneficiário (inclusive PUBLIC): o `luxtory_app` é membro de `anon` e `authenticated` com SET e sem
  herança, então um EXECUTE concedido a esses papéis escapava de `has_function_privilege('luxtory_app', …)` e era
  alcançável por `SET ROLE`. (2) Em Production as migrations rodam como o `postgres` da Supabase, que não é
  superusuário: citar SUPERUSER, REPLICATION ou BYPASSRLS num `ALTER ROLE` exige superusuário, mesmo para negá-los. O
  papel autorizador é criado e reafirmado só com atributos permitidos, e uma verificação falha fechada se ele tiver um
  desses três. Provado por emulação (dono não superusuário com os atributos lidos de Production): a versão anterior
  falhava com `42501`; a corrigida aplica up → down → up e passa na prontidão.
- **5ª auditoria do PR #82 (2026-11-04) — fronteira do autorizador.** A prontidão também recusa: qualquer associação
  entrante no papel autorizador além do vínculo administrativo do dono (ADMIN, sem SET e sem herança, criado pelo
  PostgreSQL 16+ para o dono não superusuário); qualquer cadeia de `luxtory_app`, `anon` ou `authenticated` até o
  autorizador ou até o dono do schema; GRANT OPTION de EXECUTE nas cinco funções privilegiadas fora do dono; e dono
  dessas funções diferente do dono do schema. Provado em PostgreSQL 17: SET, INHERIT, ADMIN (autoconcessão), cadeia por
  papel intermediário, `anon` membro, `luxtory_app` membro do dono e GRANT OPTION davam ao `luxtory_app` a função de
  autorização e passavam na prontidão; agora são recusados, e o vínculo administrativo legítimo continua aceito.

### 10.12. E2 — commands, contratos e recusas (plano v2 aprovado pelo fundador em 2026-11-05)

Decisões aprovadas (D1–D12), sem mudança de regra canônica, migration ou ativação:

- **D1 — Recusas do banco.** `42501` só vira recusa funcional pela combinação SQLSTATE + nome exato de uma lista fechada
  (`permission_representation`, `permission_staff_role`, `permission_authorization_missing|scope|revoked|used|expired`
  → `ERR_PERMISSION`). `booking_not_activated` (K1) e `booking_lifecycle_not_activated` (K2) viram o desfecho tipado
  "capability fechada": sem operação, recusa gravada ou evento, e a chave de idempotência continua livre. Todo outro
  `42501` (sem nome ou com nome técnico) segue falha técnica. Um teste estático classifica todo `42501` nomeado das
  migrations. Classe 23: inalterada, mais o nome exato `cancellation_terms_changed`.
- **D2 — `ERR_CANCELLATION_TERMS_CHANGED`** (D7 da W13): código de produto depois dos gerais (`PRODUCT_ERROR_CODES`),
  recusa de command, HTTP 409, mensagem pt-BR, enum do OpenAPI; os mínimos do TECH-056 e as causas do REQ-098 ficam
  intactos.
- **D3 — Módulos.** O motor de fechamento e os commands `cancel_own_use_booking`, `declare_no_show`, `open_exception`,
  `resolve_exception` e `request_booking_authorization` ficam no `booking`; `correct_use_right` é definido no `calendar`
  e `recover_future_capacity` no `inventory`, cada um com os próprios ports, montados pelo `booking` (direção de
  dependência existente; nenhuma aresta nova entre slices). Registro fechado inalterado.
- **D4 — Autorização resolvida pelo servidor:** a única viva (não usada, não revogada, `now < valid_until`) para reserva,
  finalidade e exceção; o Admin não informa id de autorização.
- **D5 — Limitador:** fora da E2 (não há entrada). Gate **G-E4-1**, abaixo.
- **D6 — Travas:** `LOCK_CLASSES` continua o espelho da TECH-053; a ordem do ADR-0027 §2 é uma extensão separada com a
  trava `booking` entre a classe 5 e a classe 6. Cada trava consultiva numa instrução própria, na ordem calculada antes
  (também na criação da W12, mesmas chaves e ordem).
- **D7 — Eventos:** matriz abaixo; `dedup_key = <tipo>:<id da transição>`.
- **D8 — Fronteira:** E2 = domínio, commands, adaptadores e testes; Server Actions e telas na E4b; jobs e consumidores
  na E3; PR draft sem merge.
- **D9 — Datas locais** nos documentos (E1 mergeada em 2026-11-04).
- **D10 — Precisão:** instantes do ciclo da reserva em microssegundos inteiros (resolução do `timestamptz`), lidos do
  banco sem `Date`; 360 h = `360 × 3.600.000.000` µs. Os efeitos usam só o que o banco devolve na transição (instante,
  classe, primeira noite afetada); o relógio do servidor serve só para recusar cedo — o banco é a autoridade.
- **D11 — Privacidade:** a base registrada (`basis`) e a referência do incidente (`incident_ref`) são **referências não
  pessoais** a registros verificáveis (protocolo, ticket, documento interno), nunca nome, documento, contato ou relato
  pessoal. Ficam só nas linhas de domínio da E1 e na auditoria; nunca em logs, outbox, resultado de command ou mensagem
  de erro. O hash de idempotência segue SHA-256 do input (sem chave HMAC nova: a base já está em texto na linha de
  domínio). Risco de inserção indevida de dado pessoal: **não ratificado**, decisão pendente antes da ativação.
- **D12 — K2:** os seis commands exigem a K2 (`own_use_lifecycle`) no handler e no banco; `request_booking_authorization`
  é operação Admin não crítica fora da K2, com MFA, `staff_role` revalidado, base, auditoria e idempotência.

**Matriz operação/desfecho → evento** (contratos em `docs/api/asyncapi.yaml`; destinatário = party da `holding_id` da
reserva, fixada no COMMIT):

| Operação → desfecho | Evento |
|---|---|
| `cancel_own_use_booking` (confirmada, em uso ou em exceção) | `booking.own_use_cancelled` (`cause = titular`; em exceção, com `exception_id`) |
| `resolve_exception → cancelled`, exceção operacional | `booking.own_use_cancelled` (`cause = exception`) |
| `declare_no_show` | `booking.own_use_no_show_declared` |
| `open_exception` | `booking.own_use_exception_opened` |
| `resolve_exception → confirmed`/`completed` | `booking.own_use_exception_resolved` |
| `resolve_exception → cancelled`, apuração de Owner; `correct_use_right` | `booking.own_use_invalidated` |
| `recover_future_capacity`, `request_booking_authorization`, recusa, capability fechada | nenhum |

Unicidade: cada operação grava no máximo uma transição (índice único de `operation_id` fora do avanço) e emite no máximo
um evento; o id da transição é PK gravada na mesma transação; replay não reexecuta o handler e o retry desfaz a
tentativa — duas linhas com a mesma chave só poderiam ser o mesmo evento.

**G-E4-1 — limitador obrigatório antes de expor a solicitação (E4).** A E4 não expõe `request_booking_authorization`
sem: limitador depois do guard e antes da idempotência; chave pseudônima sem segredo novo (SHA-256 de
`luxtory:booking-authorization-request:<staff_role_id>`); limites explícitos no runbook (TECH-001; parâmetro ausente →
recusa); falha do limitador → recusa (falha fechada, como na TECH-057); excesso → `ERR_RATE_LIMITED` sem operação nem
chave de idempotência gravadas; **o limitador não quebra a semântica de replay**: a mesma chave de um pedido já
concluído devolve o resultado gravado (a consulta de idempotência vem antes de consumir cota, ou o replay não consome
cota), e uma recusa por limite não grava resposta na chave, que continua utilizável. Teste de aceite na E4b: limite
estourado sem nada gravado; limitador indisponível → recusa; replay de chave concluída com a cota esgotada → resultado
gravado.

#### 10.12.1. Implementação da E2 (2026-11-05, PR draft; sem merge, Production, migration ou ativação)

Sem mudança de decisão. Escolhas de implementação dentro dos contratos:

- **Arquivos.** Motor e commands em `src/features/booking/application/` (`own-use-closing.ts`,
  `cancel-own-use-booking.ts`, `declare-no-show.ts`, `own-use-exceptions.ts`, `request-booking-authorization.ts`, e as
  portas da reserva `own-use-invalidation.ts`/`own-use-recovery.ts`); `correct_use_right` em
  `src/features/calendar/application/correct-use-right.ts` e `recover_future_capacity` em
  `src/features/inventory/application/recover-future-capacity.ts`; composição em
  `src/features/booking/presentation/own-use-lifecycle-handlers.ts` (sem Server Action: E4).
- **Entradas.** Todas levam `second_home_id` e `booking_id` (o guard do Titular confere a holding na casa; o servidor
  confere que a reserva é da casa). Reserva inexistente: `ERR_PERMISSION` para o Titular (igual à de outra party,
  T-1309) e `ERR_NOT_FOUND` para o Admin (ADR-0010 §10). `resolve_exception` e `correct_use_right` levam o
  `exception_id` que o Admin viu (outra exceção → `ERR_STATE_TRANSITION`). Base e `incident_ref` passam por
  `isNonPersonalReference` (forma de e-mail, CPF, CNPJ, telefone ou caractere de controle → `ERR_VALIDATION`).
- **Travas.** Os handlers tomam também a trava da reserva (`booking`, ADR-0027 §2) antes de reler o estado, para que a
  revalidação veja a transição concorrente que venceu; os gatilhos a retomam de forma reentrante.
- **Solicitação.** Condições de emissão conferidas antes de gravar (fora delas a solicitação seria inútil):
  `ERR_STATE_TRANSITION` (estado, janela do no-show, exceção do tipo errado, sem noite não iniciada),
  `ERR_CAPACITY_UNAVAILABLE` (nada a recuperar) e `ERR_VALIDATION` (recuperação de origem P-A sem atestação).
- **Recuperação.** Não grava transição: a base registrada fica na auditoria (imutável), ligada à solicitação pela
  `authorization_ref` da custódia (achado A9; sem migration).
- **Testes (PostgreSQL real, executor e guards de produção).** `database-refusals.db.test.ts` (D1 na W12),
  `own-use-lifecycle-parity.db.test.ts` (gêmeas × SQL em µs), `own-use-cancellation.db.test.ts`,
  `own-use-admin-acts.db.test.ts` e `own-use-lifecycle-concurrency.db.test.ts`; unidade em
  `own-use-lifecycle.test.ts`, catálogo de erros, executor e `isNonPersonalReference`. Cada evento é validado contra o
  AsyncAPI (`tests/support/asyncapi.ts`).

### 10.13. Bloqueio B-A3 — origem P-A na recuperação (2026-11-05)

**Bloqueio formal (decisão do fundador, 2026-11-05):** nenhuma ativação de reserva (K1, K2), recuperação (`recover_future_capacity`) ou autorização independente (senha, Environment ou uso do papel `luxtory_booking_authorizer`) antes de a correção da origem P-A na recuperação estar integrada na `main`, aplicada pela CI e validada.

**Defeito** (auditoria independente do #83; reproduzido em PostgreSQL descartável com os privilégios reais).
`app.authorize_booking_action` (E1) reconhece a origem P-A da recuperação só por `t.kind = 'exception_resolution'` — a
exceção operacional cancelada pelo Admin. O cancelamento tardio do Titular durante uma exceção operacional aberta
(transição `cancellation` a partir de `in_exception`, resolução `titular_cancellation`) gera as mesmas `forfeited_right`
futuras, e a autorização `recovery` foi emitida com `availability_attested = false`; as noites foram ao Inventário
Luxtory. Descumpre A3 (plano W13), o ADR-0027 §3–§4, o §10.3 desta spec e a spec `inventory` ("origem em exceção
operacional exige atestação … indisponibilidade do imóvel nunca autoriza monetização"), com fundamento na BR-123.
Nenhuma fonte distingue quem cancela: as "regras normais" do Titular (D5) tratam de prazo e classe (REQ-080). O
`requestFacts` da E2 repete o critério.

**Correção (E2b, PR separado).** Origem P-A ⇔ a transição que abriu a `forfeited_right` resolveu uma exceção
`operational` (`booking_exception_resolution.transition_id` → `booking_exception.exception_type`), quem quer que tenha
cancelado. Migration incremental com `CREATE OR REPLACE` da função, sem tocar migration aplicada; o `requestFacts` repete
o critério só para recusar cedo — a garantia é do banco.

**Alcance antes da correção:** nenhum em Production — K1 e K2 com 0 linhas, papel autorizador sem senha nem Environment,
nenhuma Server Action da solicitação (conferido somente por leitura em 2026-11-05: 0 reservas, solicitações,
autorizações e operações do ciclo).

#### 10.13.1. Implementação da E2b (2026-11-05, PR draft; sem merge nem Production)

- **Migration** `20261105174225_booking_recovery_operational_exception_origin`: `CREATE OR REPLACE` de
  `app.authorize_booking_action` com o corpo da E1 e só o critério de origem trocado por
  `bool_or(EXISTS (… booking_exception_resolution z JOIN booking_exception x … WHERE z.transition_id = t.id AND
  x.exception_type = 'operational'))`. Mantidos: assinatura, `SECURITY DEFINER`, `SET search_path = pg_catalog,
  pg_temp` (T-1312), dono e ACL (só EXECUTE do papel autorizador, sem PUBLIC) — a redefinição não mexe em privilégios e a
  prontidão continua passando. Exclusões por construção: no-show nunca parte de `in_exception`; a apuração (P-B) tem
  outro tipo e, nela, o Co-Owner só cancela tempestivamente (sem `forfeited_right`).
- **`down`:** recusado com K1/K2 presentes ou com reserva, solicitação ou autorização existentes (a reversão reabriria o
  defeito); sem eles — o banco vazio do `db:check` — devolve exatamente o corpo da E1.
- **Espelho:** `requestFacts` usa o mesmo critério só para recusar cedo (`ERR_VALIDATION`); a garantia é do autorizador.
- **Testes:** `tests/migrations/booking-authorization.db.test.ts` (solicitação gravada direto no banco: Titular tardio em
  P-A sem atestação → `authorization_attestation_missing`; com atestação → autorizada e recuperada; controle do
  cancelamento tardio comum sem atestação; atributos da função; guarda do `down` e retorno ao corpo da E1) e
  `tests/features/booking/own-use-admin-acts.db.test.ts` (pelo handler: recusa antecipada sem nada gravado; servidor
  forçado a errar a origem → o autorizador real recusa; com atestação, solicitação e recuperação com replay idêntico;
  controle comum). Controles preexistentes: P-A cancelada pelo Admin exige atestação; no-show recupera sem ela.
- **Bloqueio B-A3** segue até este PR estar integrado na `main`, aplicado pela CI e validado.
