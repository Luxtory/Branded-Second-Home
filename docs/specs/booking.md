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
(W28); reconciliação (W30); telas Admin de reserva.

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
banco. Risco e custo: STRIDE T-1208.

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
reserva e prévia com o motivo específico → ativação desligada, aviso de volta e nenhuma confirmação.

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
