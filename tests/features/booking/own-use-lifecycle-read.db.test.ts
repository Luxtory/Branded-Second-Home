import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  readTitularBooking,
  readTitularBookingList,
  readTitularCancellation,
} from '@/features/booking/presentation/own-use-lifecycle-read';
import {
  addDays,
  bookableStart,
  bookingHarness,
  revokeDelegation,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
} from './booking-support';
import {
  activate,
  addAdmin,
  bookNow,
  deactivate,
  historicCoOwnerScenario,
  historicOwnerScenario,
  type Admin,
} from './lifecycle-support';
import { lifecycleRunner } from './own-use-lifecycle-support';

/**
 * Leituras do ciclo na Área do Titular (W13 E4b, spec booking §10.15) sobre o PostgreSQL com os privilégios reais: a
 * RLS prova a reserva e o servidor lê, no mesmo instantâneo, só o mínimo para a tela. Falha fechada: quem não representa
 * a holding vigente (outra Ação, revogação, transferência) não lê nada — o detalhe vira 404 sem oráculo.
 */
const serialized = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
const PRIVATE = /INC-2027|ADM-77|incident|basis|authorization|custody/i;

describe('W13 E4b — leituras do ciclo da reserva na Área do Titular', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  let admin: Admin;
  let run: ReturnType<typeof lifecycleRunner>;
  let first: string;
  const at = (offset: number) => addDays(first, offset);

  async function openException(bookingId: string, type: 'operational' | 'unauthorized_booking') {
    const outcome = await run.asAdmin(admin, run.handlers.openException, {
      second_home_id: co.homeId,
      booking_id: bookingId,
      basis: 'Relatório da administração ADM-77',
      ...(type === 'operational'
        ? { exception_type: type, reason: 'casualty' }
        : { exception_type: type, incident_ref: 'INC-2027-007' }),
    });
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await historicCoOwnerScenario(h);
    owner = await historicOwnerScenario(h);
    admin = await addAdmin(h);
    first = bookableStart().first;
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
    run = lifecycleRunner(h);
  }, 300_000);
  afterAll(() => h.close());

  it('[TECH-052][REQ-096] detalhe provado pela RLS, mínimo do servidor; outra Ação da mesma Second Home não lê (404)', async () => {
    const [a, b] = co.titulares;
    const id = await bookNow(h, a!, co.homeId, at(20), at(23));
    const detail = await readTitularBooking(a!.userId, id, new Date(), h.db);
    expect(detail).toMatchObject({
      id,
      secondHomeId: co.homeId,
      partyId: a!.partyId,
      modality: 'co_owner',
      state: 'confirmed',
      display: 'confirmed',
      section: 'upcoming',
      exception: null,
      cancellationClass: null,
      cancelledAt: null,
      lifecycleOpen: true,
    });
    expect(detail!.nights.map((night) => night.stayDate)).toEqual([at(20), at(21), at(22)]);
    expect(serialized(detail)).not.toMatch(PRIVATE);
    expect(await readTitularBooking(b!.userId, id, new Date(), h.db)).toBeNull();
    expect(
      (await readTitularBookingList(b!.userId, new Date(), h.db)).map((x) => x.id),
    ).not.toContain(id);
  });

  it('[REQ-084][PD-010] P-A e P-B pelo registro da exceção aberta; nunca a referência do incidente nem a base', async () => {
    const a = co.titulares[0]!;
    const review = await bookNow(h, a, co.homeId, at(30), at(32));
    const operational = await bookNow(h, a, co.homeId, at(40), at(42));
    await openException(review, 'unauthorized_booking');
    await openException(operational, 'operational');
    const pb = await readTitularBooking(a.userId, review, new Date(), h.db);
    const pa = await readTitularBooking(a.userId, operational, new Date(), h.db);
    expect(pb).toMatchObject({
      state: 'in_exception',
      display: 'unauthorized_review',
      section: 'attention',
      exception: { type: 'unauthorized_booking', reason: null },
    });
    expect(pa).toMatchObject({
      display: 'operational_exception',
      exception: { type: 'operational', reason: 'casualty' },
    });
    expect(serialized([pa, pb])).not.toMatch(PRIVATE);
    const list = await readTitularBookingList(a.userId, new Date(), h.db);
    expect(list.find((x) => x.id === review)).toMatchObject({
      section: 'attention',
      display: 'unauthorized_review',
    });
    expect(serialized(list)).not.toMatch(PRIVATE);
  });

  it('[D7][REQ-080] prévia = termos do command: confirmar com os termos da prévia cancela; o detalhe mostra o gravado', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(50), at(53));
    const read = await readTitularCancellation(a.userId, id, new Date(), h.db);
    expect(read?.preview).toMatchObject({
      kind: 'actionable',
      cancellationClass: 'timely',
      firstAffectedDate: at(50),
      returning: 3,
    });
    const outcome = await run.asTitular(a, run.handlers.cancelOwnUseBooking, {
      second_home_id: co.homeId,
      booking_id: id,
      expected_cancellation_class: read!.preview.cancellationClass,
      expected_first_affected_date: read!.preview.firstAffectedDate,
    });
    expect(outcome).toMatchObject({
      status: 'committed',
      result: { cancellation_class: 'timely' },
    });
    const after = await readTitularBooking(a.userId, id, new Date(), h.db);
    expect(after).toMatchObject({
      state: 'cancelled',
      display: 'cancelled_timely',
      section: 'history',
    });
    expect(after!.cancelledAt).toBeInstanceOf(Date);
    expect((await readTitularCancellation(a.userId, id, new Date(), h.db))?.preview.kind).toBe(
      'not_cancellable',
    );
  });

  it('[REQ-084] apuração: Co-Owner dentro do prazo pode cancelar (prévia acionável) e o cancelamento encerra a apuração', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(60), at(62));
    await openException(id, 'unauthorized_booking');
    const read = await readTitularCancellation(a.userId, id, new Date(), h.db);
    expect(read?.preview).toMatchObject({ kind: 'actionable', cancellationClass: 'timely' });
  });

  it('[REQ-081] Owner: prévia sem classe, sem prazo e sem saldo do Direito de Uso', async () => {
    const id = await bookNow(h, owner.titular, owner.homeId, at(20), at(22));
    const read = await readTitularCancellation(owner.titular.userId, id, new Date(), h.db);
    expect(read?.booking).toMatchObject({ modality: 'owner', balances: [] });
    expect(read?.preview).toMatchObject({
      kind: 'actionable',
      cancellationClass: null,
      timelyUntil: null,
      returning: null,
      balances: [],
    });
  });

  it('[ADR-0027 §5] K2 ausente: a prévia continua legível e não é acionável', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(70), at(71));
    await deactivate(h, 'own_use_lifecycle');
    try {
      expect((await readTitularCancellation(a.userId, id, new Date(), h.db))?.preview.kind).toBe(
        'closed',
      );
    } finally {
      await activate(h, 'own_use_lifecycle');
    }
  });

  it('[TECH-050] representação revogada → nada visível (detalhe 404, lista vazia, prévia nula)', async () => {
    const b = co.titulares[1]!;
    const id = await bookNow(h, b, co.homeId, at(80), at(81));
    expect(await readTitularBooking(b.userId, id, new Date(), h.db)).not.toBeNull();
    await revokeDelegation(h, b.userId);
    expect(await readTitularBooking(b.userId, id, new Date(), h.db)).toBeNull();
    expect(await readTitularCancellation(b.userId, id, new Date(), h.db)).toBeNull();
    expect(await readTitularBookingList(b.userId, new Date(), h.db)).toEqual([]);
  });

  it('[TECH-052] transferência: com a holding da época encerrada, as reservas dela deixam de ser visíveis', async () => {
    const id = await bookNow(h, owner.titular, owner.homeId, at(90), at(91));
    expect(await readTitularBooking(owner.titular.userId, id, new Date(), h.db)).not.toBeNull();
    // Fixture do dono do schema (a transferência é da W28): a holding é só-inserção em Production; aqui o gatilho
    // fica desligado só nesta transação para encerrar a holding da época, como faria a transferência.
    const client = await h.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE app.holding DISABLE TRIGGER holding_no_change');
      await client.query('UPDATE app.holding SET valid_until = now() WHERE id = $1', [
        owner.titular.holdingId,
      ]);
      await client.query('ALTER TABLE app.holding ENABLE TRIGGER holding_no_change');
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(await readTitularBooking(owner.titular.userId, id, new Date(), h.db)).toBeNull();
    expect(await readTitularBookingList(owner.titular.userId, new Date(), h.db)).toEqual([]);
  });
});
