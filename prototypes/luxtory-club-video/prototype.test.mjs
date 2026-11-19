// Demonstração conceitual — testes proporcionais do protótipo (Etapa A): só o que está representado.
// Uso: node --test prototypes/luxtory-club-video/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  breakpointValues,
  cssFromHtml,
  scanCss,
} from '../../src/design-system/scripts/check-hardcodes.mjs';
import {
  CANONICAL,
  FICTITIOUS,
  depositScenario,
  directScenario,
  luxplusScenario,
  requestScenario,
} from './data.js';
import * as directSeq from './sequence-direct.js';
import * as luxplusSeq from './sequence-luxplus.js';
import * as requestSeq from './sequence-request.js';
import * as assinaturaSeq from './sequence-assinatura.js';
import * as creditosSeq from './sequence-creditos.js';
import { datesCard, needCard, seasonOf, selectionStates } from './credits-step.js';
import {
  creditsOfSelection,
  depositNightStatus,
  depositStops,
  luxplusPrice,
  selectionForTarget,
} from './rules.js';
import { EDL } from './filme/prova/edl.js';
import { edlFor } from './filme/prova/edl-cinema.js';
import { edlFor as requestCurta } from './filme/prova/edl-request-curta.js';
import { GRID_MS, legibility } from './filme/prova/blocos.js';
import {
  REQUEST_STATES,
  addMonthsUTC,
  canDeposit,
  canTransitionRequest,
  cessionEffect,
  creditExpiresAt,
  holdCreditsFefo,
  luxchangeFee,
  nightsOf,
  prlOfPeriod,
  creditsForPrl,
} from './rules.js';
import { timeline } from './sequence-request.js';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const TOKENS = JSON.parse(
  readFileSync(join(DIR, '../../src/design-system/tokens/tokens.json'), 'utf8'),
);
const utc = (iso) => Date.parse(iso);
const s = requestScenario();

test('[TECH-044] validade por adição calendárica em UTC, com o último dia válido do mês', () => {
  assert.equal(addMonthsUTC(utc('2027-08-31T12:00:00Z'), 24), utc('2029-08-31T12:00:00Z'));
  assert.equal(addMonthsUTC(utc('2028-02-29T12:00:00Z'), 12), utc('2029-02-28T12:00:00Z'));
  assert.equal(addMonthsUTC(utc('2027-01-31T12:00:00Z'), 1), utc('2027-02-28T12:00:00Z'));
  const origin = utc('2027-04-12T13:02:00Z');
  assert.equal(creditExpiresAt(origin, CANONICAL), utc('2029-04-12T13:02:00Z'));
  assert.notEqual(
    creditExpiresAt(origin, CANONICAL),
    origin + 730 * 86_400_000,
    '24 meses nunca é um número fixo de dias',
  );
});

test('[BR-201][01 §20] Créditos = PRL do período × multiplicador; [01 §24][BR-230] Fee pelos dois ramos', () => {
  // A regra, com valores sintéticos fixos: não depende do PRL escolhido para o filme (ramo do mínimo sempre coberto).
  assert.equal(prlOfPeriod([190_000, 190_000, 170_000]), 550_000);
  assert.equal(creditsForPrl(550_000, CANONICAL), 55_000);
  assert.equal(luxchangeFee(550_000, CANONICAL), 55_000, '10% de R$ 5.500,00 = R$ 550,00');
  assert.equal(
    luxchangeFee(115_000, CANONICAL),
    12_000,
    '10% de R$ 1.150,00 < mínimo de R$ 120,00',
  );
  assert.equal(luxchangeFee(120_000, CANONICAL), 12_000, 'no limite: 10% = mínimo');
  // O cenário do filme segue a mesma regra, qualquer que seja o PRL aprovado.
  const request = prlOfPeriod(FICTITIOUS.request.prlCents);
  assert.equal(creditsForPrl(request, CANONICAL), (request / 100) * CANONICAL.creditMultiplier);
  assert.equal(
    luxchangeFee(request, CANONICAL),
    Math.max(Math.floor((request * CANONICAL.feePercent + 50) / 100), CANONICAL.feeMinimumCents),
  );
  assert.equal(
    luxchangeFee(123_455, CANONICAL),
    12_346,
    '[TECH-033] HALF_UP uma vez no valor final',
  );
});

test('[PD-005][TECH-044] instantes da Request: expira exatamente 24 h após o envio; aceite dentro do prazo', () => {
  assert.equal(s.sentAt, utc('2027-04-12T13:06:00Z'));
  assert.equal(s.expiresAt - s.sentAt, CANONICAL.requestExpiryHours * 3_600_000);
  assert.ok(s.acceptedAt > s.sentAt && s.acceptedAt < s.expiresAt);
});

test('[PD-006][PD-008][TECH-071] Garantia por FEFO, só com lotes válidos até a expiração da Request', () => {
  assert.deepEqual(s.hold, [
    { lotId: 'L-0001', quantity: 30_000 },
    { lotId: 'L-0002', quantity: 18_000 },
    { lotId: 'L-0003', quantity: 7_000 },
  ]);
  const reversed = holdCreditsFefo([...s.lots].reverse(), s.credits, {
    now: s.sentAt,
    requestExpiresAt: s.expiresAt,
  });
  assert.deepEqual(reversed, s.hold, 'a ordem de entrada não muda o consumo');
  const expiresSoon = {
    id: 'L-0000',
    originatedAt: utc('2025-04-13T12:00:00Z'),
    expiresAt: s.expiresAt - 1,
    available: 99_000,
    quantity: 99_000,
  };
  const withEarly = holdCreditsFefo([expiresSoon, ...s.lots], s.credits, {
    now: s.sentAt,
    requestExpiresAt: s.expiresAt,
  });
  assert.deepEqual(
    withEarly,
    s.hold,
    '[EC-6] lote que vence antes da Request não serve de Garantia',
  );
  assert.throws(
    () => holdCreditsFefo(s.lots, 200_000, { now: s.sentAt, requestExpiresAt: s.expiresAt }),
    /insuficientes/,
  );
});

test('[BR-200][TECH-043] lote do depósito só existe com 14 dias de antecedência', () => {
  const checkin = utc('2027-05-14T17:00:00Z');
  assert.ok(canDeposit(checkin, utc(FICTITIOUS.deposit.at), CANONICAL));
  assert.ok(canDeposit(checkin, checkin - 14 * 86_400_000, CANONICAL));
  assert.ok(!canDeposit(checkin, checkin - 14 * 86_400_000 + 1, CANONICAL));
  assert.equal(s.lots.find((l) => l.id === 'L-0003').quantity, 46_000);
});

test('[REQ-064][BR-212][BR-213] saldos e lote do cedente; reserva confirmada na mesma operação do aceite', () => {
  assert.deepEqual(s.balances.beforeSend, { available: 94_000, held: 0, consumed: 0 });
  assert.deepEqual(s.balances.afterSend, { available: 39_000, held: 55_000, consumed: 0 });
  assert.deepEqual(s.balances.afterAccept, { available: 39_000, held: 0, consumed: 55_000 });
  assert.equal(s.holder.lot.quantity, s.credits);
  assert.equal(s.holder.lot.originatedAt, s.acceptedAt, 'originação própria no aceite');
  assert.equal(s.holder.lot.expiresAt, addMonthsUTC(s.acceptedAt, 24));
  assert.equal(s.booking.confirmedAt, s.request.acceptedAt);
  assert.equal(s.booking.state, 'Confirmada');
});

test('[REQ-096][TECH-055] estados da Request e transição representada', () => {
  assert.deepEqual(Object.values(REQUEST_STATES), [
    'Pendente',
    'Aceita',
    'Recusada',
    'Expirada',
    'Cancelada pré-aceite',
  ]);
  assert.ok(canTransitionRequest('pending', 'accepted'));
  assert.ok(!canTransitionRequest('accepted', 'pending'));
});

test('[BR-151][TECH-022][TECH-023] Owner e Co-Owner cedem capacidades diferentes', () => {
  assert.deepEqual(cessionEffect('owner'), { capacity: 'own_available', useRightConsumed: false });
  assert.deepEqual(cessionEffect('co_owner'), {
    capacity: 'reserved_right',
    useRightConsumed: true,
  });
  assert.equal(s.holder.role, 'co_owner');
});

test('[PD-002] noites de [entrada, saída)', () => {
  assert.deepEqual(nightsOf('2027-06-04', '2027-06-07'), [
    '2027-06-04',
    '2027-06-05',
    '2027-06-06',
  ]);
});

test('[TECH-001][BR-352] parâmetros canônicos separados dos dados fictícios; nada comercial inventado', () => {
  assert.deepEqual(
    { ...CANONICAL },
    {
      creditMultiplier: 10,
      creditValidityMonths: 24,
      feePercent: 10,
      feeMinimumCents: 12_000,
      requestExpiryHours: 24,
      depositMinNoticeDays: 14,
      checkinHour: 14,
      checkoutHour: 10,
    },
  );
  assert.ok(
    !('prlCents' in FICTITIOUS.luxplus) && !('discount' in FICTITIOUS.luxplus),
    'Luxplus sem PRL nem desconto implícito (BR-244)',
  );
  assert.deepEqual(
    FICTITIOUS.policy,
    { status: 'conceitual', version: null, content: null },
    'PD-009: política sem conteúdo inventado',
  );
});

for (const fmt of ['16x9', '9x16']) {
  test(`[REQ-063][REQ-064] coreografia ${fmt}: ordem dos fatos da Request`, () => {
    const tl = timeline(fmt);
    const enter = (sel) => tl.enter.find((e) => e.sel === sel);
    const set = (sel, attr) => tl.set.filter((e) => e.sel === sel && e.attr === attr);
    const sendPress = set('#send', 'data-pressed')[0].at;
    assert.ok(
      set('#policy', 'checked')[0].at < sendPress,
      'política aceita antes do envio (PD-009)',
    );
    assert.ok(
      sendPress < enter('#pending').in,
      'Fee pago antes de a Request ficar Pendente (PD-005)',
    );
    assert.ok(
      tl.tween
        .filter((tw) => tw.sel.startsWith('#bar-'))
        .every((tw) => tw.at === enter('#pending').in),
      'Garantia constituída exatamente no commit do envio, quando a Request fica Pendente (PD-005, PD-006)',
    );
    // Garantia nunca antes do envio; depósito confirmado (operação própria) antes da revisão.
    assert.ok(enter('#lg-held').in > sendPress, 'Em Garantia só depois do envio');
    assert.ok(enter('#held-note').in > sendPress, 'frase da Garantia só depois do envio');
    assert.ok(
      set('#deposit-go', 'data-pressed')[0].at < enter('#deposited').in &&
        enter('#deposited').in < enter('#review').in,
      'depósito confirmado antes da revisão da Request (REQ-060)',
    );
    assert.ok(
      enter('#need').in < enter('#dates').in,
      'Créditos necessários antes da complementação',
    );
    // Trocas no mesmo lugar: o cartão novo só entra depois da saída do anterior (sem crossfade de textos).
    const exit = parseFloat(TOKENS.duration.moderate.$value);
    const handoffs = [
      ['#cal', '#need'],
      ['#dates', '#deposited'],
      ['#deposited', '#review'],
      ['#review', '#pending'],
      ['#pending', '#holder'],
      ['#holder', '#accepted'],
      ['#holder', '#booking'],
      ...(fmt === '9x16'
        ? [
            ['#home', '#cal'],
            ['#need', '#topup'],
            ['#topup', '#dates'],
            ['#review', '#credits'],
          ]
        : [
            ['#need', '#dates'],
            ['#home', '#topup'],
            ['#topup', '#credits'],
          ]),
    ];
    handoffs.push(['#lg-avail-before', '#lg-avail-after']);
    for (const [before, after] of handoffs)
      assert.ok(
        enter(after).in >= enter(before).out + exit,
        `${after} entra antes de ${before} terminar a saída`,
      );
    assert.equal(
      enter('#booking').in,
      enter('#accepted').in,
      'Request Aceita e Reserva Confirmada no mesmo instante',
    );
    assert.ok(
      enter('#booking').in > set('#accept', 'data-pressed')[0].at,
      'reserva só depois do aceite expresso',
    );
    assert.ok(
      enter('#booking').in >
        Math.max(...['#rv-1', '#rv-2', '#rv-3', '#rv-4'].map((sel) => enter(sel).in)),
      'revalidação antes da confirmação',
    );
    assert.ok(
      enter('#pending').out < enter('#booking').in,
      'Pendente nunca convive com a reserva confirmada',
    );
    const times = tl.marks.map((m) => m.at);
    assert.deepEqual(
      times,
      [...times].sort((a, b) => a - b),
    );
    assert.ok(
      [...tl.enter.map((e) => e.out ?? 0), ...tl.set.map((e) => e.at)].every(
        (t) => t <= tl.duration,
      ),
    );
  });
}

/** HTML que a sequência insere no palco (build sem DOM: o palco só recebe a marcação). */
const markup = (seq, fmt = '16x9') => {
  const stage = { dataset: {}, insertAdjacentHTML: (_, html) => (stage.html = html) };
  seq.build(stage, fmt);
  return stage.html.replace(/<[^>]+>/g, ' ');
};

test('[BR-220][BR-221][PD-008][01 §24] Direct: Inventário Luxtory, Créditos por FEFO na confirmação, Fee mínimo', () => {
  const d = directScenario();
  assert.deepEqual(d.nights, ['2027-05-28']);
  assert.equal(d.credits, 11_500, 'PRL R$ 1.150,00 × 10');
  assert.equal(d.feeCents, 12_000, '10% = R$ 115,00 < mínimo de R$ 120,00');
  assert.deepEqual(
    d.consumption,
    [{ lotId: 'L-0003', quantity: 11_500 }],
    'L-0001/L-0002 já consumidos na Request',
  );
  assert.deepEqual(d.balances, {
    before: { available: 39_000, consumed: 0 },
    after: { available: 27_500, consumed: 11_500 },
  });
  assert.equal(d.booking.channel, 'Luxchange Direct');
  const text = markup(directSeq);
  assert.match(text, /Não exigido/, 'sem aceite de outro Titular');
  assert.match(text, /não reserva as noites/, 'pagamento não reserva (ADR-008)');
  assert.doesNotMatch(
    text,
    /Garantia|Pendente|Request recebida/,
    'Direct não tem Garantia nem espera por terceiro',
  );
});

test('[BR-240][BR-241][BR-244][BR-230] Luxplus: dinheiro, sem Créditos, sem Fee, valor só ilustrativo', () => {
  const l = luxplusScenario();
  assert.deepEqual(l.nights, ['2027-08-13', '2027-08-14']);
  assert.deepEqual(l.credits, { available: 27_500, used: 0 }, 'saldo do fim do Direct, intocado');
  assert.equal(l.booking.channel, 'Luxplus');
  const text = markup(luxplusSeq);
  assert.match(text, /R\$\s*2\.480,00/);
  assert.match(text, /Não utilizados/);
  // Uma vez na rota (variantes 16:9 e 9:16 no markup) e uma na revisão; a confirmação não repete.
  assert.equal(text.match(/em dinheiro/gi)?.length, 3);
  assert.doesNotMatch(
    text,
    /Fee|Taxa de intermediação|desconto|PRL|Garantia|depósito|Créditos adicionais/,
    'sem taxa, desconto, PRL, Garantia ou complementação de Créditos',
  );
  assert.equal(luxplusSeq.timeline('16x9').tween.length, 0, 'nenhum movimento de Créditos');
});

for (const [name, seq] of [
  ['direct', directSeq],
  ['luxplus', luxplusSeq],
]) {
  for (const fmt of ['16x9', '9x16']) {
    test(`[PD-009][TECH-080] ${name} ${fmt}: política → pagamento → revalidação → confirmação, sem crossfade`, () => {
      const tl = seq.timeline(fmt);
      const enter = (sel) => tl.enter.find((e) => e.sel === sel);
      const set = (sel, attr) => tl.set.filter((e) => e.sel === sel && e.attr === attr);
      const pay = set('#send', 'data-pressed')[0].at;
      assert.ok(set('#policy', 'checked')[0].at < pay, 'política aceita antes do pagamento');
      assert.ok(pay < enter('#reval').in, 'revalidação depois do pagamento');
      const lastCheck = Math.max(...tl.enter.filter((e) => /^#rv-/.test(e.sel)).map((e) => e.in));
      assert.ok(lastCheck < enter('#booking').in, 'confirmação depois da revalidação');
      assert.ok(
        tl.tween.every((tw) => tw.at === enter('#booking').in),
        'Créditos só na confirmação',
      );
      assert.ok(!tl.set.some((e) => e.sel === '#accept'), 'nenhum aceite de terceiro');
      const exit = parseFloat(TOKENS.duration.moderate.$value);
      const pairs = [
        ['#cal', '#review'],
        ['#review', '#reval'],
        ['#reval', '#booking'],
        ...(fmt === '9x16' ? [['#home', '#cal']] : [['#home', '#credits']]),
      ];
      for (const [before, after] of pairs)
        assert.ok(
          enter(after).in >= enter(before).out + exit,
          `${after} entra antes de ${before} sair`,
        );
    });
  }
}

test('[DS §5] assinatura limpa: só a logo oficial do manifest (intacta, como <img>) e a frase, em 6 s', () => {
  const manifest = JSON.parse(
    readFileSync(join(DIR, '../../src/design-system/brand/logo/manifest.json'), 'utf8'),
  );
  const entry = manifest.logos[assinaturaSeq.LOGO.key];
  assert.equal(entry.file, assinaturaSeq.LOGO.file, 'arquivo da chave do manifest');
  const bytes = readFileSync(join(DIR, '../../src/design-system/brand/logo', entry.file));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    entry.sha256,
    'sha256 do manifest',
  );
  const stage = { dataset: {}, insertAdjacentHTML: (_, html) => (stage.html = html) };
  assinaturaSeq.build(stage, '16x9');
  assert.match(stage.html, new RegExp(`<img[^>]+src="[^"]*/${entry.file}"`));
  assert.doesNotMatch(stage.html, /<svg/, 'logo nunca inline');
  // Encerramento exclusivo da marca: o único texto é a frase de assinatura.
  const text = stage.html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  assert.equal(text, assinaturaSeq.TAGLINE);
  assert.doesNotMatch(stage.html, /demo-seal|Demonstração|disponíve|Prova interna|ilustrativ/);
  const tl = assinaturaSeq.timeline();
  assert.equal(tl.duration, 6_000);
  const logo = tl.enter.find((e) => e.sel === '#endcard-logo');
  const line = tl.enter.find((e) => e.sel === '#endcard-line');
  assert.equal(logo.rise, 0, 'logo só em opacidade, sem deslocamento');
  assert.equal(logo.dur, parseFloat(TOKENS.duration.cinematic.$value), 'duration.cinematic');
  assert.ok(line.in >= logo.in + logo.dur, 'a frase entra depois da logo assentada');
  assert.equal(tl.enter.length, 3, 'cartão, logo e frase — nada mais');
});

test('ressalvas do filme: condições essenciais no roteiro, fora da assinatura e sem aviso de indisponibilidade', () => {
  const roteiro = readFileSync(join(DIR, 'filme/ROTEIRO.md'), 'utf8');
  for (const text of [
    'Com Membership vigente', // L3, BR-195: condição na mesma frase dos Créditos (narração)
    'Créditos não são moeda nem garantem disponibilidade.', // BR-190, frase aprovada do FAQ (b2c.md §4) (C04)
    'No Co-Owner, só data já reservada é cedida.', // BR-151, REQ-060, frase aprovada do FAQ (C04)
    'Imagens, interfaces e valores ilustrativos.', // C05, primeira interface (neutro, sem negar o produto)
  ])
    assert.ok(roteiro.includes(text), `ROTEIRO.md sem a ressalva: ${text}`);
  assert.ok(
    !roteiro.includes('ainda não estão disponíveis'),
    'nenhum aviso de indisponibilidade na peça',
  );
});

test('prova de montagem: EDL coerente com a interface aprovada e com as regras do roteiro', () => {
  const { shots, ui, uiFadeOut, editorial, vo, sfx, duration } = EDL;
  const exit = parseFloat(TOKENS.duration.moderate.$value);
  // Planos contíguos cobrindo a prova inteira.
  shots.forEach((s, i) => assert.equal(s.from, i ? shots[i - 1].to : 0, `${s.scene} contíguo`));
  assert.equal(shots.at(-1).to, duration);
  // Interface: trechos dentro da sequência capturada, sem sobreposição, e trocas de trecho só nos cortes de imagem.
  const request = requestSeq.timeline('16x9');
  ui.forEach((u, i) => {
    assert.ok(u.from >= 0 && u.to <= request.duration, `trecho ${i} dentro da Request`);
    if (i) {
      assert.equal(u.at, ui[i - 1].at + (ui[i - 1].to - ui[i - 1].from), `trecho ${i} contíguo`);
      assert.ok(
        shots.some((s) => s.from === u.at),
        `troca de trecho ${i} coincide com um corte`,
      );
    }
  });
  const last = ui.at(-1);
  assert.ok(
    last.at + (last.to - last.from) >= uiFadeOut.at + uiFadeOut.dur,
    'interface presente até o fim do próprio fade (nunca some num quadro)',
  );
  // Título sai antes de o cartão de contexto ocupar o mesmo lugar (saída + duration.moderate).
  const home = request.enter.find((e) => e.sel === '#home').in;
  assert.ok(
    editorial.title.out + exit <= ui[0].at + home,
    'título sai antes do cartão de contexto',
  );
  // Ressalva: entra com a primeira interface e respeita o tempo de leitura (1 s a cada 3 palavras + 0,5 s).
  const words = (text) => text.split(/\s+/).length;
  const legal = editorial.legal;
  assert.ok(legal.in >= editorial.title.out + exit, 'ressalva depois do título');
  assert.ok(
    legal.out - legal.in >= (words(legal.text) / 3 + 0.5) * 1000,
    'tempo de leitura da ressalva',
  );
  // Narração-guia em ritmo de conversa (≤ 3 palavras/s) e efeitos dentro da prova.
  for (const v of vo)
    assert.ok(words(v.text) / ((v.to - v.from) / 1000) <= 3, `ritmo da narração: ${v.text}`);
  for (const f of sfx) assert.ok(f.at >= 0 && f.at < duration, `efeito ${f.kind} dentro da prova`);
});

test('[BR-190][BR-191][PD-008][REQ-060] Créditos: C04 conceitual; o saldo de Helena se forma uma vez, na Request', () => {
  const r = requestScenario();
  const dep = depositScenario();
  // A formação do saldo (48.000 + 46.000 = 94.000) acontece só na Request; o C04 não antecipa nenhum número.
  assert.equal(dep.priorAvailable + dep.originated, r.balances.beforeSend.available);
  assert.doesNotMatch(markup(creditosSeq) + markup(creditosSeq, '9x16'), /\d|Helena/);
  // A Garantia da Request (55.000) sai de lotes que já existiam e do lote recém-originado, pelo que vence primeiro.
  assert.deepEqual(
    r.hold.map((p) => [p.lotId, p.quantity]),
    [
      ['L-0001', 30_000],
      ['L-0002', 18_000],
      ['L-0003', 7_000],
    ],
  );
  const text = markup(creditosSeq);
  const raw = { dataset: {}, insertAdjacentHTML: (_, html) => (raw.html = html) };
  creditosSeq.build(raw, '16x9');
  assert.doesNotMatch(
    raw.html,
    /<button|<input|<form/,
    'camada editorial: nenhum controle ou etapa transacional',
  );
  assert.doesNotMatch(text, /R\$/, 'Créditos nunca em formato monetário (BR-190)');
  assert.match(text, /válidos/);
  for (const sup of Object.values(creditosSeq.SUPERS)) assert.ok(text.includes(sup));
  // Batidas na ordem da narração e supers com tempo de leitura, um depois do outro no mesmo lugar.
  const tl = creditosSeq.timeline('16x9');
  const at = (sel) => tl.enter.find((e) => e.sel === sel);
  const beats = ['#cr-row-prior', '#cr-row-deposit', '#cr-row-total', '#cr-use'].map(
    (sel) => at(sel).in,
  );
  assert.deepEqual(
    [...beats].sort((x, y) => x - y),
    beats,
  );
  assert.ok(at('#cr-panel').in < beats[0], 'o painel chega com a primeira batida');
  const exit = parseFloat(TOKENS.duration.moderate.$value);
  const words = (t) => t.split(/\s+/).length;
  // Ressalvas da L3 numa nota só, dentro do painel: entra com o depósito e fica até a saída do painel.
  const [legal, panel] = [at('#cr-legal'), at('#cr-panel')];
  assert.equal(creditosSeq.FOOTNOTE, `${creditosSeq.SUPERS.credits} ${creditosSeq.SUPERS.coOwner}`);
  assert.ok(
    panel.out - legal.in >= (words(creditosSeq.FOOTNOTE) / 3 + 0.5) * 1000,
    'tempo de leitura da nota',
  );
  assert.ok(panel.out + exit <= tl.duration, 'o painel sai antes do corte');
});

test('[BR-151][BR-200][REQ-060] depósito: elegibilidade por modalidade, datas inteiras e números do cenário', () => {
  const now = Date.parse('2027-04-12T10:02:00-03:00');
  const at = (night) => Date.parse(`${night}T14:00:00-03:00`);
  const co = (o) => ({ role: 'co_owner', reserved: true, committed: false, ...o });
  assert.equal(depositNightStatus(co({}), at('2027-05-14'), now, CANONICAL), 'eligible');
  assert.equal(
    depositNightStatus(co({}), at('2027-04-24'), now, CANONICAL),
    'reserved_unavailable',
    'menos de 14 dias (BR-200)',
  );
  assert.equal(
    depositNightStatus(co({ reserved: false }), at('2027-05-20'), now, CANONICAL),
    'not_reserved',
  );
  assert.equal(
    depositNightStatus(co({ committed: true }), at('2027-05-22'), now, CANONICAL),
    'committed',
  );
  const owner = { role: 'owner', committed: false, ownAvailable: true };
  assert.equal(
    depositNightStatus(owner, at('2027-05-20'), now, CANONICAL),
    'eligible',
    'Owner: capacidade própria',
  );
  assert.equal(
    depositNightStatus({ ...owner, ownAvailable: false }, at('2027-05-20'), now, CANONICAL),
    'unavailable',
  );
  const dep = depositScenario();
  assert.equal(dep.priorAvailable, 48_000);
  assert.equal(dep.requestCredits, 55_000);
  assert.equal(dep.shortfall, 7_000);
  assert.deepEqual(
    dep.eligible.map((d) => [d.night, d.credits]),
    [
      ['2027-05-14', 16_000],
      ['2027-05-15', 16_000],
      ['2027-05-16', 14_000],
    ],
  );
  // Metas do controle: todas as somas distintas de datas inteiras, não só as acumuladas em ordem cronológica;
  // 7.000 não é meta (não existe fração de data).
  assert.deepEqual(
    dep.stops.map((x) => x.credits),
    [0, 14_000, 16_000, 30_000, 32_000, 46_000],
  );
  assert.throws(() => selectionForTarget(dep.eligible, 7_000), /não alcançável/);
  assert.deepEqual(selectionForTarget(dep.eligible, 14_000), ['2027-05-16']);
  assert.deepEqual(selectionForTarget(dep.eligible, 30_000), ['2027-05-14', '2027-05-16']);
  assert.deepEqual(selectionForTarget(dep.eligible, 32_000), ['2027-05-14', '2027-05-15']);
  // Mínimo que cobre os 7.000 que faltam: 14.000, só 16/05.
  assert.deepEqual(dep.minimum, { credits: 14_000, nights: ['2027-05-16'] });
  assert.throws(() => creditsOfSelection(dep.eligible, ['2027-05-22']), /não elegível/);
  assert.equal(dep.originated, 46_000);
  assert.equal(dep.afterDeposit, 94_000);
  assert.equal(dep.afterDeposit, requestScenario().balances.beforeSend.available);
  assert.equal(seasonOf('2027-05'), 'Média/Baixa');
  assert.equal(seasonOf('2027-07'), 'Alta/Super Alta');
  assert.throws(() => seasonOf('2027-02'), /Carnaval/, 'janela de Carnaval não presumida (PD-003)');
});

for (const fmt of ['16x9', '9x16']) {
  test(`Request ${fmt}: controle e calendário com uma fonte única (as datas) e só metas alcançáveis`, () => {
    const dep = depositScenario();
    const tl = timeline(fmt);
    const max = dep.stops.at(-1).credits;
    const stops = dep.stops.map((x) => x.credits);
    const slider = tl.tween.filter((tw) => tw.sel === '#topup-slider');
    assert.ok(slider.length >= 2, 'o controle se move em etapas');
    for (const tw of slider)
      assert.ok(stops.includes(Math.round(tw.to * max)), `meta ${tw.to * max}`);
    const finalValue = tl.set
      .filter((x) => x.sel === '#topup-slider' && x.attr === 'aria-valuenow')
      .at(-1);
    assert.equal(Number(finalValue.value), dep.originated);
    const selected = tl.set
      .filter((x) => x.attr === 'data-selected' && x.sel.startsWith('[data-deposit-day'))
      .map((x) => x.sel.match(/\d{4}-\d{2}-\d{2}/)[0]);
    assert.deepEqual(
      [...selected].sort(),
      dep.selected,
      'as datas selecionadas somam o valor do controle',
    );
    // O controle vai primeiro ao mínimo que cobre a reserva (14.000, 16/05); depois 30.000 e 46.000.
    assert.deepEqual(
      slider.map((tw) => Math.round(tw.to * max)),
      [14_000, 30_000, 46_000],
    );
    assert.equal(selected[0], dep.minimum.nights[0]);
    // O depósito só é pedido depois da última seleção.
    const lastSelect = Math.max(
      ...tl.set.filter((x) => x.attr === 'data-selected').map((x) => x.at),
    );
    const press = tl.set.find((x) => x.sel === '#deposit-go' && x.attr !== 'aria-disabled');
    assert.ok(lastSelect < press.at);
    // Sem nenhuma data selecionada, a ação de depósito nasce desabilitada e só se habilita na primeira seleção.
    const stage = { dataset: {}, insertAdjacentHTML: (_, html) => (stage.html = html) };
    requestSeq.build(stage, fmt);
    assert.match(stage.html, /id="deposit-go"[^>]*aria-disabled="true"/);
    const enable = tl.set.filter((x) => x.sel === '#deposit-go' && x.attr === 'aria-disabled');
    assert.deepEqual(
      enable.map((x) => x.value),
      ['true', null],
    );
    const firstSelect = Math.min(
      ...tl.set.filter((x) => x.attr === 'data-selected').map((x) => x.at),
    );
    assert.ok(enable[0].at < 0, 'desabilitada desde o início');
    assert.equal(enable[1].at, firstSelect);
    // Semântica do protótipo: nenhum toque, processamento ou confirmação na ação enquanto ela está desabilitada, e toda
    // data selecionada é elegível (seleção válida: datas inteiras, reservadas, com a antecedência mínima).
    for (const x of tl.set.filter((s) => s.sel === '#deposit-go' && s.attr !== 'aria-disabled'))
      assert.ok(x.at >= enable[1].at, `ação acionada desabilitada em ${x.at} ms`);
    const eligibleNights = dep.eligible.map((d) => d.night);
    for (const x of tl.set.filter(
      (s) => s.attr === 'data-selected' && s.sel.startsWith('[data-deposit-day'),
    ))
      assert.ok(eligibleNights.includes(x.sel.match(/"(.+)"/)[1]), `${x.sel} não é elegível`);
    // O calendário abre no primeiro mês com data elegível (maio), sem passo de navegação; abril segue navegável.
    const opening = tl.enter.filter((e) => e.sel.startsWith('#dm-'));
    assert.deepEqual(
      opening.filter((e) => e.in < 0).map((e) => e.sel),
      ['#dm-2027-05'],
    );
    assert.ok(eligibleNights.every((n) => n.startsWith('2027-05')));
    assert.ok(!tl.marks.some((m) => /próximo mês/.test(m.label)), 'sem toque de navegação');
  });
}

test('controle de Créditos: sugestão determinística nos dois sentidos, e a escolha explícita prevalece', () => {
  // Conjunto sintético fixo (duas datas iguais e uma menor): a regra não depende do PRL escolhido para o filme.
  const eligible = [
    { night: '2027-05-14', credits: 16_000 },
    { night: '2027-05-15', credits: 16_000 },
    { night: '2027-05-16', credits: 14_000 },
  ];
  const [d14, d15, d16] = eligible.map((d) => d.night);
  assert.deepEqual(
    depositStops(eligible).map((s) => s.credits),
    [0, 14_000, 16_000, 30_000, 32_000, 46_000],
  );
  // Para cima, a partir do mínimo (16/05): mantém 16/05 e soma a data mais cedo.
  assert.deepEqual(selectionForTarget(eligible, 30_000, [d16]), [d14, d16]);
  assert.deepEqual(selectionForTarget(eligible, 46_000, [d14, d16]), [d14, d15, d16]);
  // Para baixo, a partir das três datas: preserva o máximo possível; empate → menos datas → datas mais cedo.
  assert.deepEqual(selectionForTarget(eligible, 32_000, [d14, d15, d16]), [d14, d15]);
  assert.deepEqual(selectionForTarget(eligible, 30_000, [d14, d15, d16]), [d14, d16]);
  assert.deepEqual(selectionForTarget(eligible, 14_000, [d14, d16]), [d16]);
  assert.deepEqual(selectionForTarget(eligible, 0, [d14, d15, d16]), []);
  // Escolha explícita prevalece: com 15/05 escolhida, 16.000 é 15/05 (não 14/05) e 30.000 é 15+16.
  assert.deepEqual(selectionForTarget(eligible, 16_000, [d15]), [d15]);
  assert.deepEqual(selectionForTarget(eligible, 30_000, [d15]), [d15, d16]);
  // No cenário do filme, toda meta corresponde a datas reais cuja soma é a meta.
  const scenario = depositScenario();
  for (const stop of scenario.stops)
    assert.equal(creditsOfSelection(scenario.eligible, stop.nights), stop.credits);
});

test('Direct: saldo suficiente, continuar sem depósito; complementação disponível e fechada', () => {
  const raw = { dataset: {}, insertAdjacentHTML: (_, html) => (raw.html = html) };
  directSeq.build(raw, '16x9');
  assert.match(raw.html, /Saldo suficiente/);
  assert.match(raw.html, /id="need-continue"/);
  assert.match(raw.html, /<details class="lx-disclosure demo-accordion demo-accordion--closed">/);
  assert.doesNotMatch(
    raw.html,
    /id="dates"|id="topup"|id="deposit-go"|Créditos adicionais necessários/,
  );
  const tl = directSeq.timeline('16x9');
  const pressAt = (sel) => tl.set.find((x) => x.sel === sel && x.attr === 'data-pressed').at;
  assert.ok(pressAt('#need-continue') < tl.enter.find((e) => e.sel === '#review').in);
  assert.equal(directScenario().balances.before.available, 39_000);
});

test('[BR-150][BR-151] Owner: textos e estados próprios, sem calendário de Direito de Uso', () => {
  const dep = { ...depositScenario(), role: 'owner' };
  dep.days = dep.days.map((d) => ({
    ...d,
    status:
      d.status === 'not_reserved' || d.status === 'reserved_unavailable' ? 'unavailable' : d.status,
  }));
  const states = selectionStates(dep, [[]], 55_000);
  const html =
    needCard({ title: 'x', needed: 55_000, available: 48_000, role: 'owner', sufficient: false }) +
    datesCard(dep, states, { action: 'Depositar' });
  assert.match(html, /Selecionar datas da minha Second Home/);
  assert.doesNotMatch(html, /Direito de Uso|Não reservada/);
});

test('revisão comercial: nenhum jargão ou marca de protótipo nas sequências do filme', () => {
  for (const seq of [requestSeq, directSeq, luxplusSeq, creditosSeq, assinaturaSeq]) {
    const text = markup(seq) + markup(seq, '9x16');
    assert.doesNotMatch(
      text,
      /\bFee\b|PRL|fictíci|ilustrativ|simulad|Demonstração|conceitual|L-0\d{3}|\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/,
    );
  }
  assert.match(markup(requestSeq), /Taxa de intermediação/);
  assert.match(markup(directSeq), /Taxa de intermediação/);
  // Nomes das Second Homes: o nome é protagonista, a região secundária; sem os nomes antigos nem "Home Edition".
  assert.match(markup(requestSeq), /Azzura Home[\s\S]*Litoral · Second Home Luxtory/);
  assert.match(markup(requestSeq), /Satori Home/, 'datas depositadas da Satori Home de Helena');
  assert.match(markup(directSeq), /Olivar Home[\s\S]*Campo · Second Home Luxtory/);
  assert.match(markup(luxplusSeq), /Olivar Home/);
  for (const seq of [requestSeq, directSeq, luxplusSeq, creditosSeq])
    assert.doesNotMatch(markup(seq), /Mirante|Varanda|Pátio|Home Edition/);
});

test('a Request aprovada continua com Garantia, Pendente e aceite de quem recebe a solicitação', () => {
  const text = markup(requestSeq);
  assert.match(text, /Créditos em Garantia/);
  assert.match(text, /Pendente/);
  assert.match(text, /Solicitação de troca recebida/);
});

test('[PD-008][REQ-064] filme: saldo e Garantia sem lotes na tela; FEFO, origem e consumo preservados nas regras', () => {
  const text = markup(requestSeq);
  // Comunicação: dois indicadores e uma frase, sem a lista de lotes.
  assert.match(text, /Saldo disponível/);
  assert.match(text, /utilizados para confirmar a reserva/);
  assert.doesNotMatch(text, /lote|Créditos anteriores|Novo depósito/i);
  // Regras: a Garantia continua formada pelos lotes que vencem primeiro e soma exatamente os Créditos necessários.
  const r = requestScenario();
  assert.equal(
    r.hold.reduce((sum, part) => sum + part.quantity, 0),
    r.credits,
  );
  assert.ok(r.hold.length >= 2, 'Garantia composta por mais de um lote (FEFO)');
  // Quem recebe é Co-Owner no domínio: as noites cedidas são do Direito de Uso já reservado.
  assert.equal(r.holder.role, 'co_owner');
});

const SOURCES = readdirSync(DIR).filter((f) => /\.(js|mjs|css|html|md)$/.test(f));
// Documentos e scripts do filme (roteiro, produção, EDL e montagem da prova), em subpastas de filme/.
const FILM = readdirSync(join(DIR, 'filme'), { recursive: true })
  .filter((f) => /\.(js|mjs|md)$/.test(f))
  .map((f) => `filme/${f}`);

test('[DS §13.3] demo.css e index.html só usam tokens (scanCss do check-hardcodes do DS)', () => {
  const breakpoints = breakpointValues();
  const violations = [
    ...scanCss(readFileSync(join(DIR, 'demo.css'), 'utf8'), { file: 'demo.css', breakpoints }),
    ...scanCss(cssFromHtml(readFileSync(join(DIR, 'index.html'), 'utf8')), {
      file: 'index.html',
      breakpoints,
    }),
  ];
  assert.deepEqual(violations, []);
});

test('[REQ-100][REQ-101][BR-377] terminologia e nenhuma promessa', () => {
  const FORBIDDEN = [
    /\bcot(a|as|ista|istas|izar|ização)\b/i,
    /\bdi[aá]rias?\b/i,
    /(rentabilidade|valoriza[çc][ãa]o|renda|retorno|liquidez)\s+(garantid|assegurad)[ao]s?/i,
    /(disponibilidade|uso)s?\s+(garantid|irrestrit|ilimitad)[ao]s?/i,
    /\bresid(ence|ência|encial)/i,
    /brand dna/i,
    /por noite/i,
    /R\$\s*[\d.,]+\s*Créditos/i,
  ];
  // Inclui os documentos do filme (roteiro, narração, prompts, EDL): a mesma terminologia vale para a peça.
  const hits = [...SOURCES.filter((f) => f !== 'prototype.test.mjs'), ...FILM].flatMap((f) =>
    readFileSync(join(DIR, f), 'utf8')
      .split('\n')
      .flatMap((line, i) =>
        FORBIDDEN.filter((re) => re.test(line)).map((re) => `${f}:${i + 1} ${re}`),
      ),
  );
  assert.deepEqual(hits, []);
});

test('isolamento: nenhuma URL externa, chamada de rede, credencial ou import do produto', () => {
  const code = [
    ...SOURCES.filter((f) => f !== 'prototype.test.mjs' && f !== 'README.md'),
    ...FILM.filter((f) => /\.(js|mjs)$/.test(f)),
  ];
  const hits = code.flatMap((f) => {
    const text = readFileSync(join(DIR, f), 'utf8');
    return [
      /https?:\/\/(?!127\.0\.0\.1)/,
      /\bfetch\(/,
      /XMLHttpRequest|WebSocket|supabase|vercel|process\.env\.(?!PORT)/i,
      /src\/features|@\/features/,
    ]
      .filter((re) => re.test(text))
      .map((re) => `${f} ${re}`);
  });
  assert.deepEqual(hits, []);
});

test('[BR-201][REQ-060] prova: a complementação vai até o depósito confirmado (saldo de 94.000), nomes novos', () => {
  const t = requestSeq.times('16x9');
  const complement = EDL.ui[1];
  // O trecho da complementação contém o controle, os dois toques, o depósito e o cartão do depósito confirmado.
  for (const at of [t.slider, ...t.taps, t.depositPress, t.depositedIn])
    assert.ok(at >= complement.from && at < complement.to, `instante ${at} dentro do trecho`);
  const labels = EDL.shots.map((s) => s.label).join(' ');
  assert.match(labels, /Azzura Home/);
  assert.match(labels, /Satori Home/);
  assert.doesNotMatch(labels, /Mirante|Varanda|Pátio/);
  assert.match(EDL.vo[1].text, /deposita mais/);
});

test('estados do calendário do depósito por forma, não só por cor: selecionada leva um traço de check', () => {
  const css = readFileSync(join(DIR, 'demo.css'), 'utf8');
  const rule = css.match(/td\[data-selected\] \.lx-calendar__day::after,[^{]*\{([^}]*)\}/);
  assert.ok(rule, 'regra do traço de check');
  assert.match(rule[1], /border-inline-start:[^;]+solid/);
  assert.match(rule[1], /border-block-end:[^;]+solid/);
  assert.match(rule[1], /rotate:/);
  // Indisponível e comprometida: riscado; na legenda, a amostra repete a forma.
  assert.match(
    css,
    /data-deposit='reserved_unavailable'\] \.lx-calendar__number \{[^}]*line-through/,
  );
  assert.match(css, /\.demo-swatch\[data-swatch='selected'\]::after/);
});

test('[01 §25][BR-243][BR-244][TECH-001] preço Luxplus pela fórmula, com desconto sempre explícito', () => {
  // Pronto para o congelamento; o filme ainda mostra o valor ilustrativo até a decisão comercial do desconto.
  assert.equal(
    luxplusPrice([300_000, 320_000], 0),
    620_000,
    'Membership sem desconto Luxplus, se aprovado',
  );
  assert.equal(luxplusPrice([300_000, 320_000], 10), 558_000);
  assert.equal(luxplusPrice([123_455], 10), 111_110, '[TECH-033] HALF_UP uma vez no valor final');
  assert.throws(
    () => luxplusPrice([300_000, 320_000]),
    /ERR_PARAMETER_MISSING/,
    'sem desconto, sem preço',
  );
  assert.throws(() => luxplusPrice([300_000], null), /ERR_PARAMETER_MISSING/);
  assert.throws(() => luxplusPrice([300_000], 100), /fora do intervalo/);
});

test('prova cinematográfica: planos contínuos, interface sem alteração de tempo e cadência de 24 fps', () => {
  const t = requestSeq.times('16x9');
  for (const fmt of ['16x9', '9x16']) {
    const edl = edlFor(fmt);
    assert.equal(edl.fps, 24);
    assert.equal(edl.uiSource, 'stage');
    assert.ok(edl.duration >= 20_000 && edl.duration <= 30_000, `duração ${edl.duration}`);
    // Cortes, trechos e dissolve na grade de 3 quadros (125 ms a 24 fps): corte de imagem e troca de interface no
    // mesmo quadro.
    const grid = (ms) => ms % 125 === 0;
    for (const s of edl.shots)
      assert.ok(grid(s.from) && grid(s.to) && grid(s.dissolve ?? 0), `${s.plan}`);
    for (const u of edl.ui) assert.ok(grid(u.at) && grid(u.to - u.from), `trecho em ${u.at}`);
    // Planos encadeados de 0 ao fim, sem buraco nem sobreposição; dissolve só entre planos.
    edl.shots.forEach((s, i) => {
      assert.equal(
        s.from,
        i === 0 ? 0 : edl.shots[i - 1].to,
        `${fmt} ${s.plan} começa no fim do anterior`,
      );
      if (s.dissolve) assert.ok(i > 0 && s.dissolve < s.to - s.from, `${fmt} ${s.plan} dissolve`);
    });
    assert.equal(edl.shots.at(-1).to, edl.duration);
    // Trechos da Request dentro da sequência, sem sobreposição e dentro da prova.
    edl.ui.forEach((u, i) => {
      assert.ok(u.from >= 0 && u.to <= t.duration && u.from < u.to, `trecho ${i}`);
      if (i > 0) assert.ok(u.at >= edl.ui[i - 1].at + (edl.ui[i - 1].to - edl.ui[i - 1].from));
      assert.ok(u.at + (u.to - u.from) <= edl.duration);
    });
    // O aceite e a confirmação aparecem: toque em Aceitar e resultado dentro dos trechos.
    for (const at of [t.sendCommit, t.accept, t.result])
      assert.ok(
        edl.ui.some((u) => at >= u.from && at < u.to),
        `instante ${at} na prova`,
      );
    // Um plano humano real, sem interface por cima.
    const human = edl.shots.find((s) => s.footage);
    assert.ok(human, 'plano de footage');
    assert.ok(
      edl.uiFadeOut.at + edl.uiFadeOut.dur <= human.from,
      'interface sai antes do plano humano',
    );
  }
});

test('prova cinematográfica: câmera sobre imagem dentro do quadro e com ampliação contida', () => {
  for (const fmt of ['16x9', '9x16'])
    for (const s of edlFor(fmt).shots)
      for (const [kind, move, max] of [
        ['asset', s.move, 1.06],
        ['placeholder', s.placeholder.move, 2],
      ]) {
        if (!move) continue;
        for (const [cx, cy, z] of [move.from, move.to ?? move.from]) {
          const half = 0.5 / z;
          assert.ok(z >= 1 && z <= max, `${fmt} ${s.plan} ${kind}: zoom ${z}`);
          for (const c of [cx, cy])
            assert.ok(
              c >= half - 1e-9 && c <= 1 - half + 1e-9,
              `${fmt} ${s.plan} ${kind}: centro ${c}`,
            );
        }
      }
});

test('prova cinematográfica: narração de teste só com frases aprovadas (roteiro ou prova de montagem)', () => {
  const roteiro = readFileSync(join(DIR, 'filme/ROTEIRO.md'), 'utf8');
  const aprovadas = new Set(EDL.vo.map((v) => v.text));
  for (const { text } of edlFor('16x9').vo)
    assert.ok(roteiro.includes(text) || aprovadas.has(text), `frase sem origem aprovada: ${text}`);
});

const FILM_TERMS = /\b(Co-Owner|Owner|Ação|Titular(es)?)\b/i;
const roteiroText = () =>
  readFileSync(join(DIR, 'filme/ROTEIRO.md'), 'utf8').replace(/\n>\s*/g, ' ');

for (const fmt of ['16x9', '9x16']) {
  test(`[REQ-063][REQ-064] prévia curta da Request ${fmt}: ritmo legível, ordem dos fatos e assinatura`, () => {
    const edl = requestCurta(fmt);
    const t = requestSeq.times(fmt);
    // Cada tela dentro da faixa do seu tipo, contada depois da animação de entrada (QUATRO-FILMES.md §3).
    const report = legibility(edl);
    assert.deepEqual(
      report.filter((r) => !r.ok).map((r) => `${r.label}: ${r.window} ms`),
      [],
    );
    for (const type of ['banner', 'multi', 'confirmacao', 'assinatura'])
      assert.ok(
        report.some((r) => r.type === type),
        `tela do tipo ${type}`,
      );
    // Grade de 3 quadros, trechos encadeados sem sobreposição; interface tocada em tempo real (só pausas).
    assert.equal(edl.duration % GRID_MS, 0);
    edl.ui.forEach((u, i) => {
      assert.ok(u.to >= u.from && (u.hold ?? 0) >= 0, `trecho ${i}`);
      const end = u.at + (u.to - u.from) + (u.hold ?? 0);
      assert.equal(end % GRID_MS, 0, `trecho ${i} na grade`);
      if (i > 0) {
        const p = edl.ui[i - 1];
        assert.ok(u.at >= p.at + (p.to - p.from) + (p.hold ?? 0), `trecho ${i} depois do anterior`);
      }
    });
    edl.shots.forEach((s, i) =>
      assert.equal(s.from, i === 0 ? 0 : edl.shots[i - 1].to, `${s.plan} encadeado`),
    );
    assert.equal(edl.shots.at(-1).to, edl.duration);
    // Ordem dos fatos no tempo do filme: pendente → recebida → aceite → confirmação (REQ-063, REQ-064).
    const filmAt = (ms) => {
      const u = edl.ui.find((x) => x.seq === 'request' && ms >= x.from && ms <= x.to);
      assert.ok(u, `instante ${ms} da Request na prévia`);
      return u.at + (ms - u.from);
    };
    const order = [t.topupPress, t.depositedIn, t.sendCommit, t.holderIn, t.accept, t.result].map(
      filmAt,
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    // Banner antes da primeira interface, com a copy aprovada.
    const [banner] = edl.editorial.banners;
    assert.equal(banner.title, 'Luxchange Request');
    assert.deepEqual(banner.lines, [
      'Solicite noites reservadas por outro Membro.',
      'Utilize Créditos + Taxa de intermediação.',
      'Depende do aceite de quem recebeu a solicitação.',
    ]);
    assert.ok(banner.out <= edl.ui[0].at + 400);
    // Assinatura oficial no fim: 6 s, dissolve da imagem, nenhuma etiqueta interna sobre ela.
    const sig = edl.ui.at(-1);
    assert.equal(sig.seq, 'assinatura');
    assert.equal(sig.to - sig.from, 6_000);
    assert.ok(sig.fadeIn >= 600 && sig.fadeIn <= 1_000);
    assert.equal(sig.at + 6_000, edl.duration);
    assert.equal(edl.editorial.tagOut, sig.at);
    // Som até o fim: a resolução da assinatura e o fade final dentro do filme.
    assert.ok(edl.sfx.some((x) => x.kind === 'resolve' && x.at > sig.at));
    assert.ok(edl.audioOut.at + edl.audioOut.dur <= edl.duration);
    // Vocabulário do filme e narração só com frases aprovadas (ROTEIRO.md §4).
    const roteiro = roteiroText();
    for (const v of edl.vo) {
      assert.doesNotMatch(v.text, FILM_TERMS);
      assert.ok(roteiro.includes(v.text), `frase sem origem aprovada: ${v.text}`);
      assert.ok(v.to <= edl.duration);
    }
    for (const b of edl.editorial.banners)
      assert.doesNotMatch([b.title, ...b.lines].join(' '), FILM_TERMS);
  });
}
