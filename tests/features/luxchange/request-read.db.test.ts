import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TitularRepresentationSummary } from '@/features/identity';
import { readDepositCalendar } from '@/features/luxchange/presentation/deposit-read';
import {
  readBookingCommitment,
  readCommittedDates,
  readRequestDetail,
  readRequestJourney,
  readRequestList,
  readRequestStart,
  type RequestReadDependencies,
} from '@/features/luxchange/presentation/request-read';
import { activate } from '../booking/lifecycle-support';
import {
  creditsHarness,
  originate,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { requestApp } from './request-app-support';
import {
  newRequester,
  pricedNights,
  prlForCredits,
  requestFixture,
  type RequestFixture,
} from './request-support';

/**
 * W21 E3 — leituras das telas da Request (spec luxchange §13.5): a RLS prova a representação; o servidor devolve só
 * "Solicitável"/"Indisponível"/"Passada" e os Créditos da capacidade alheia, nunca o detentor nem o PRL; o detalhe traz o
 * estado real do pagamento e do estorno; Carteira e depósito mostram as datas comprometidas como potenciais.
 */
const session = (titular: CreditTitular) => ({
  userId: titular.userId,
  assurance: 'aal1' as const,
});
const representation = (partyId: string): TitularRepresentationSummary => ({
  partyId,
  documentType: 'cpf',
  maskedDocument: '***.123.456-**',
  delegationId: partyId,
  activatedAt: null,
  validUntil: null,
  membership: { state: 'active', changedAt: new Date() },
});

describe('W21 E3 — leituras da jornada da Request', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let app: ReturnType<typeof requestApp>;
  const deps = (titular: CreditTitular): RequestReadDependencies => ({
    db: c.h.db,
    overview: async () => ({ representations: [representation(titular.partyId)], pending: [] }),
  });

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit');
    app = requestApp(f);
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('[REQ-062][REQ-100] catálogo e calendário: só capacidade alheia, Créditos sem PRL, sem motivo; a própria Second Home não aparece', async () => {
    const r = await newRequester(f);
    const nights = await pricedNights(f, [prlForCredits(f, '120'), prlForCredits(f, '80')]);
    const start = await readRequestStart(session(r), deps(r));
    expect(start.parties.map((party) => party.partyId)).toEqual([r.partyId]);
    expect(start.homes.map((home) => home.secondHomeId)).toContain(f.holder.homeId);
    expect(start.homes.map((home) => home.secondHomeId)).not.toContain(r.homeId);

    const journey = (await readRequestJourney(session(r), r.partyId, f.holder.homeId, deps(r)))!;
    const byDate = new Map(journey.nights.map((night) => [night.date, night]));
    expect(byDate.get(nights[0]!)).toMatchObject({
      status: 'requestable',
      credits: '120',
      unit: null,
    });
    expect(byDate.get(nights[1]!)).toMatchObject({ status: 'requestable', credits: '80' });
    const unpriced = journey.nights.find(
      (night) => !nights.includes(night.date) && night.credits === null,
    );
    expect(unpriced?.status).toMatch(/^(unavailable|past)$/);
    expect(JSON.stringify(journey)).not.toMatch(/amount_minor|prl|holder/i);
    expect(journey).toMatchObject({ open: true, complementOpen: true, deadlineHours: 30 });
    // Party não representada: sem oráculo.
    expect(
      await readRequestJourney(session(r), f.holder.partyId, f.holder.homeId, deps(r)),
    ).toBeNull();
  });

  it('[PD-012] complemento: só datas próprias elegíveis; enviada, a data vira comprometida (Carteira, depósito) e some das opções', async () => {
    const r = await newRequester(f);
    await originate(c, '500', { titular: r });
    const [own] = await pricedNights(f, [prlForCredits(f, '30')], r.homeId);
    const wanted = await pricedNights(f, [prlForCredits(f, '200')]);
    const before = (await readRequestJourney(session(r), r.partyId, f.holder.homeId, deps(r)))!;
    const option = before.complement
      .flatMap((home) => home.options)
      .find((item) => item.stayDate === own);
    expect(option).toMatchObject({ kind: 'owner_night', credits: '30', secondHomeId: r.homeId });
    expect(before.balance).toBe('500');

    const unit = [{ kind: 'owner_night' as const, second_home_id: r.homeId, stay_date: own! }];
    const { outcome } = await app.quoteAndSend(r, app.shape(r, wanted, unit));
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    const requestId = outcome.result.request_id;

    const committed = await readCommittedDates(session(r), r.partyId, deps(r));
    expect(committed).toEqual([
      expect.objectContaining({ requestId, secondHomeId: r.homeId, date: own, credits: '30' }),
    ]);
    const deposit = (await readDepositCalendar(session(r), r.holdingId, deps(r)))!;
    expect(deposit.nights.find((night) => night.date === own)).toMatchObject({
      status: 'committed',
      credits: null,
    });
    const after = (await readRequestJourney(session(r), r.partyId, f.holder.homeId, deps(r)))!;
    expect(
      after.complement.flatMap((home) => home.options).map((item) => item.stayDate),
    ).not.toContain(own);
    // O detentor não lê as datas comprometidas de quem pediu.
    expect(await readCommittedDates(session(f.holder), null, deps(f.holder))).toEqual([]);
    expect(await readBookingCommitment(session(r), randomUUID(), deps(r))).toBeNull();
  });

  it('[REQ-097][ADR-0037 §11] lista e detalhe: solicitante vê estados e Taxa; o solicitado vê só a recebida; estorno solicitado ≠ concluído', async () => {
    const r = await newRequester(f);
    await originate(c, '500', { titular: r });
    const wanted = await pricedNights(f, [prlForCredits(f, '150')]);
    const { outcome } = await app.quoteAndSend(r, app.shape(r, wanted));
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    const requestId = outcome.result.request_id;

    const mine = await readRequestList(session(r), deps(r));
    expect(mine.sent.find((item) => item.requestId === requestId)).toMatchObject({
      state: 'pending',
      reason: null,
      checkin: wanted[0],
      creditsRequired: '150',
    });
    const theirs = await readRequestList(session(f.holder), deps(f.holder));
    const received = theirs.received.find((item) => item.requestId === requestId);
    expect(received).toMatchObject({ state: 'pending', checkin: wanted[0] });
    expect(Object.keys(received!)).not.toContain('creditsRequired');
    expect(await readRequestDetail(session(f.holder), requestId, deps(f.holder))).toBeNull();

    const detail = (await readRequestDetail(session(r), requestId, deps(r)))!;
    expect(detail).toMatchObject({
      state: 'pending',
      guaranteeCredits: '150',
      nightCredits: [{ date: wanted[0], credits: '150' }],
      paymentState: 'approved',
      refundState: null,
    });
    expect(BigInt(detail.feeAmountMinor)).toBeGreaterThan(0n);

    const withdrawn = await app.withdraw(r, requestId);
    expect(withdrawn).toMatchObject({ status: 'committed' });
    const closed = (await readRequestDetail(session(r), requestId, deps(r)))!;
    expect(closed).toMatchObject({ state: 'cancelled_pre_accept', reason: 'withdrawn' });
    expect(closed.refundState).toMatch(/^(pending|succeeded)$/);
    const refundId = (withdrawn as { result: { refund_id: string } }).result.refund_id;
    await app.flow(r).processRefund(refundId);
    expect((await readRequestDetail(session(r), requestId, deps(r)))!.refundState).toBe(
      'succeeded',
    );
  });
});
