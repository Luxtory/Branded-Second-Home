import { describe, expect, it, vi } from 'vitest';
import type {
  InterestStore,
  InterestTarget,
  InterestTargets,
  NewInterest,
} from '@/features/ownership/application/ports';
import {
  parseInterest,
  registerInterest,
  type RegisterInterestDependencies,
} from '@/features/ownership/application/register-interest';
import type { PublicAttempt } from '@/features/platform';

const KEY = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';
const CONCEPT = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const EDITION_OWNER = '11111111-2222-4333-8444-555555555555';
const EDITION_BOTH = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const NOW = new Date('2026-10-19T12:00:00.000Z');

const TARGET: InterestTarget = {
  conceptId: CONCEPT,
  editions: [
    { id: EDITION_OWNER, modality: 'owner' },
    { id: EDITION_BOTH, modality: 'owner_and_co_owner' },
  ],
};

const CO_OWNER = {
  concept_id: CONCEPT,
  modality: 'co_owner',
  region: 'Litoral norte de SP',
  approx_days: 21,
};

function fakeStore(overrides: Partial<InterestStore> = {}) {
  const written: { interest: NewInterest; attempt: PublicAttempt }[] = [];
  const store: InterestStore = {
    priorAttempt: vi.fn(() => Promise.resolve(null)),
    register: vi.fn((interest: NewInterest, attempt: PublicAttempt) => {
      written.push({ interest, attempt });
      return Promise.resolve('registered' as const);
    }),
    ...overrides,
  };
  return { store, written };
}

function deps(
  store: InterestStore,
  target: InterestTarget | null = TARGET,
): RegisterInterestDependencies {
  const targets: InterestTargets = { find: vi.fn(() => Promise.resolve(target)) };
  return { store, targets, clock: { now: () => NOW }, newId: () => 'new-interest-id' };
}

describe('registro de interesse — use case (spec ownership §5)', () => {
  it('[REQ-023] registra origem e partner_ref como metadados normalizados, com a chave e o instante', async () => {
    const { store, written } = fakeStore();

    const result = await registerInterest(
      { ...CO_OWNER, origin: '  Instagram   da marca ', partner_ref: ' Parceiro local XPTO ' },
      KEY.toUpperCase(),
      deps(store),
    );

    expect(result).toEqual({ status: 'registered', replayed: false });
    expect(written).toHaveLength(1);
    expect(written[0]?.interest).toEqual({
      id: 'new-interest-id',
      createdAt: NOW,
      conceptId: CONCEPT,
      editionId: null,
      modality: 'co_owner',
      region: 'Litoral norte de SP',
      approxDays: 21,
      origin: 'Instagram da marca',
      partnerRef: 'Parceiro local XPTO',
    });
    expect(written[0]?.attempt.key).toBe(KEY);
    expect(written[0]?.attempt.surface).toBe('interest');
  });

  it('[REQ-022] interesse no Concept sem Edition é aceito', async () => {
    const { store } = fakeStore();
    const owner = { concept_id: CONCEPT, modality: 'owner', region: 'Serra' };

    expect(await registerInterest(owner, KEY, deps(store))).toEqual({
      status: 'registered',
      replayed: false,
    });
  });

  it('[REQ-022] Edition que não oferece a modalidade → not_allowed sem gravar (F2a)', async () => {
    const { store, written } = fakeStore();

    const result = await registerInterest(
      { ...CO_OWNER, edition_id: EDITION_OWNER },
      KEY,
      deps(store),
    );

    expect(result).toEqual({
      status: 'invalid',
      issues: [{ field: 'modality', code: 'not_allowed' }],
    });
    expect(written).toHaveLength(0);
  });

  it('[REQ-022] Edition que oferece as duas modalidades aceita Co-Owner', async () => {
    const { store, written } = fakeStore();

    await registerInterest({ ...CO_OWNER, edition_id: EDITION_BOTH }, KEY, deps(store));

    expect(written[0]?.interest.editionId).toBe(EDITION_BOTH);
  });

  it('[REQ-025] approx_days ausente para Co-Owner é required; informado para Owner é not_allowed (F2b)', () => {
    const withoutDays = {
      concept_id: CO_OWNER.concept_id,
      modality: CO_OWNER.modality,
      region: CO_OWNER.region,
    };

    expect(parseInterest(withoutDays)).toEqual({
      ok: false,
      issues: [{ field: 'approx_days', code: 'required' }],
    });
    expect(parseInterest({ ...CO_OWNER, approx_days: null })).toMatchObject({
      issues: [{ field: 'approx_days', code: 'required' }],
    });
    expect(parseInterest({ ...CO_OWNER, modality: 'owner' })).toMatchObject({
      issues: [{ field: 'approx_days', code: 'not_allowed' }],
    });
    expect(parseInterest({ ...CO_OWNER, modality: 'owner', approx_days: null })).toMatchObject({
      ok: true,
    });
  });

  it('[REQ-025] approx_days: inteiro positivo, sem teto de negócio — só o limite de 32 bits', () => {
    for (const invalid of [0, -1, 1.5, '14', 2_147_483_648]) {
      expect(parseInterest({ ...CO_OWNER, approx_days: invalid })).toMatchObject({
        issues: [{ field: 'approx_days', code: 'invalid' }],
      });
    }
    expect(parseInterest({ ...CO_OWNER, approx_days: 2_147_483_647 })).toMatchObject({ ok: true });
    expect(parseInterest({ ...CO_OWNER, approx_days: 400 })).toMatchObject({ ok: true });
  });

  it('[TECH-100] schema fechado, campos na ordem do contrato e nunca o valor enviado', () => {
    const result = parseInterest({
      concept_id: 'não-é-uuid',
      modality: 'investor',
      region: '   ',
      origin: 'x'.repeat(201),
      partner_ref: 'linha\nquebrada',
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        { field: 'concept_id', code: 'invalid' },
        { field: 'modality', code: 'invalid' },
        { field: 'region', code: 'required' },
        { field: 'origin', code: 'too_long' },
        { field: 'partner_ref', code: 'invalid' },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('quebrada');
    expect(parseInterest({ ...CO_OWNER, extra: true })).toEqual({ ok: false, issues: [] });
    expect(parseInterest([CO_OWNER])).toEqual({ ok: false, issues: [] });
    expect(parseInterest({})).toMatchObject({
      issues: [
        { field: 'concept_id', code: 'required' },
        { field: 'modality', code: 'required' },
        { field: 'region', code: 'required' },
      ],
    });
  });

  it('textos: até 200 pontos de código; origem/partner_ref vazios ou nulos = ausentes', () => {
    expect(parseInterest({ ...CO_OWNER, region: '😀'.repeat(200) })).toMatchObject({ ok: true });
    expect(parseInterest({ ...CO_OWNER, region: 'a'.repeat(201) })).toMatchObject({
      issues: [{ field: 'region', code: 'too_long' }],
    });
    expect(parseInterest({ ...CO_OWNER, origin: '   ', partner_ref: null })).toMatchObject({
      ok: true,
      interest: { origin: null, partnerRef: null },
    });
  });

  it('[TECH-056] chave ausente ou fora do formato UUID → invalid, sem consultar nem gravar', async () => {
    const { store, written } = fakeStore();

    expect(await registerInterest(CO_OWNER, 'curta', deps(store))).toEqual({
      status: 'invalid',
      issues: [],
    });
    expect(await registerInterest({}, '', deps(store))).toMatchObject({ status: 'invalid' });
    expect(store.priorAttempt).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });

  it('[TECH-056] chave já usada: repetição devolve sucesso sem reavaliar o alvo; conflito recusa', async () => {
    const replayStore = fakeStore({
      priorAttempt: vi.fn(() => Promise.resolve('replayed' as const)),
    });
    const replayDeps = deps(replayStore.store, null);

    expect(await registerInterest(CO_OWNER, KEY, replayDeps)).toEqual({
      status: 'registered',
      replayed: true,
    });
    expect(replayDeps.targets.find).not.toHaveBeenCalled();
    expect(replayStore.written).toHaveLength(0);

    const conflictStore = fakeStore({
      priorAttempt: vi.fn(() => Promise.resolve('conflict' as const)),
    });
    expect(await registerInterest(CO_OWNER, KEY, deps(conflictStore.store))).toEqual({
      status: 'conflict',
    });
  });

  it('[TECH-056] corrida com a mesma chave resolvida na gravação: repetição ou conflito', async () => {
    const replayed = fakeStore({ register: vi.fn(() => Promise.resolve('replayed' as const)) });
    const conflict = fakeStore({ register: vi.fn(() => Promise.resolve('conflict' as const)) });

    expect(await registerInterest(CO_OWNER, KEY, deps(replayed.store))).toEqual({
      status: 'registered',
      replayed: true,
    });
    expect(await registerInterest(CO_OWNER, KEY, deps(conflict.store))).toEqual({
      status: 'conflict',
    });
  });

  it('[REQ-022] gatilho do banco recusou a modalidade (Edition mudou) → not_allowed', async () => {
    const { store } = fakeStore({
      register: vi.fn(() => Promise.resolve('modality_not_offered' as const)),
    });

    expect(
      await registerInterest({ ...CO_OWNER, edition_id: EDITION_BOTH }, KEY, deps(store)),
    ).toEqual({ status: 'invalid', issues: [{ field: 'modality', code: 'not_allowed' }] });
  });

  it('[REQ-022] Concept não publicado ou Edition de outro Concept → not_found sem gravar', async () => {
    const hidden = fakeStore();
    expect(await registerInterest(CO_OWNER, KEY, deps(hidden.store, null))).toEqual({
      status: 'not_found',
    });

    const foreign = fakeStore();
    const otherEdition = { ...CO_OWNER, edition_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' };
    expect(await registerInterest(otherEdition, KEY, deps(foreign.store))).toEqual({
      status: 'not_found',
    });
    expect([...hidden.written, ...foreign.written]).toHaveLength(0);
  });

  it('[TECH-056] mesmo conteúdo lógico gera o mesmo hash (ids em maiúsculas, espaços extras)', async () => {
    const first = fakeStore();
    const second = fakeStore();

    await registerInterest(CO_OWNER, KEY, deps(first.store));
    await registerInterest(
      { ...CO_OWNER, concept_id: CONCEPT.toUpperCase(), region: '  Litoral  norte de SP ' },
      KEY,
      deps(second.store),
    );

    expect(second.written[0]?.attempt.requestHash).toBe(first.written[0]?.attempt.requestHash);
  });
});
