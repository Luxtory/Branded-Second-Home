// Demonstração conceitual — testes proporcionais do protótipo (Etapa A): só o que está representado.
// Uso: node --test prototypes/luxtory-club-video/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  breakpointValues,
  cssFromHtml,
  scanCss,
} from '../../src/design-system/scripts/check-hardcodes.mjs';
import { CANONICAL, FICTITIOUS, requestScenario } from './data.js';
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
  assert.equal(prlOfPeriod(FICTITIOUS.request.prlCents), 550_000);
  assert.equal(creditsForPrl(550_000, CANONICAL), 55_000);
  assert.equal(luxchangeFee(550_000, CANONICAL), 55_000, '10% de R$ 5.500,00 = R$ 550,00');
  assert.equal(
    luxchangeFee(prlOfPeriod(FICTITIOUS.direct.prlCents), CANONICAL),
    12_000,
    '10% de R$ 1.150,00 < mínimo de R$ 120,00',
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
      tl.tween.every((tw) => tw.at >= enter('#pending').in),
      'Garantia constituída no envio, nunca antes (PD-006)',
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

const SOURCES = readdirSync(DIR).filter((f) => /\.(js|mjs|css|html|md)$/.test(f));

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
  const hits = SOURCES.filter((f) => f !== 'prototype.test.mjs').flatMap((f) =>
    readFileSync(join(DIR, f), 'utf8')
      .split('\n')
      .flatMap((line, i) =>
        FORBIDDEN.filter((re) => re.test(line)).map((re) => `${f}:${i + 1} ${re}`),
      ),
  );
  assert.deepEqual(hits, []);
});

test('isolamento: nenhuma URL externa, chamada de rede, credencial ou import do produto', () => {
  const hits = SOURCES.filter((f) => f !== 'prototype.test.mjs' && f !== 'README.md').flatMap(
    (f) => {
      const text = readFileSync(join(DIR, f), 'utf8');
      return [
        /https?:\/\/(?!127\.0\.0\.1)/,
        /\bfetch\(/,
        /XMLHttpRequest|WebSocket|supabase|vercel|process\.env\.(?!PORT)/i,
        /src\/features|@\/features/,
      ]
        .filter((re) => re.test(text))
        .map((re) => `${f} ${re}`);
    },
  );
  assert.deepEqual(hits, []);
});
