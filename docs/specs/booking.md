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
dentro da transação, então o replay de chave confirmada funciona mesmo depois de uma desativação. Quando o resultado é
incerto (indisponível, fechado ou conflito com chave nova), a action consulta, sob RLS e com a autorização vigente, a
reserva confirmada da mesma Second Home e das mesmas datas. Nenhum caminho cria uma segunda reserva: mesma chave →
replay ou recusa antes de executar; chave nova → `ERR_BOOKING_CONFLICT`; no banco, ocupação única e consumo único.

## 6. Leitura do Titular (TECH-052)

Linhas por RLS (holding vigente representada); campos por privilégio de coluna: `booking` (id, Second Home, datas,
estado, `confirmed_at`), `use_right_balance` (a própria Ação), `second_home_date` (noites seladas), `date_custody`
(`holder_kind` e fechamento) e `date_occupancy` (noite e liberação) — disponibilidade como fato, sem Ação nem reserva de
terceiros —, e `notification` (a party representada).

## 7. Telas (E5b, depois da revisão E5a)

Calendário por holding (meses com categoria, 29/02, disponível · sua reserva · indisponível · ainda não reservável ·
passada; saldo por categoria e abertura da janela no Co-Owner; "calendário aberto até"), formulário com datas nativas →
prévia calculada no servidor → confirmação; lista de reservas e detalhe; central de notificações só leitura. Componente
`lx-calendar` no Design System. Mobile-first a partir de 320 px (ADR-0009). Terminologia: "noites", "Direito de Uso"
(Co-Owner), "uso próprio" (Owner); nunca "diária(s)" nem "cota" (REQ-100).

Seletor de período proposto no checkpoint E5a (aguarda aprovação do fundador): **híbrido** — os campos de data nativos
continuam a entrada canônica do formulário, e o calendário interativo, sincronizado com eles, escolhe entrada (1º toque) e
saída (2º toque). Um período contínuo por reserva (D5). A saída não consome noite (PD-002), então uma noite indisponível
pode ser a data de saída. Conflitos (noite indisponível, passada, fora do calendário, janela não aberta, saldo,
permanência) são explicados no resumo, nunca ajustados automaticamente; "Confirmar reserva" só habilita depois de uma
prévia válida do servidor para as mesmas datas; sem preço por noite. Contrato visual e de teclado: `lx-calendar` em
`docs/reference/design-system.md`.

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
