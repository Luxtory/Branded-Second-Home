import { describe, expect, it, vi } from 'vitest';
import type {
  InterestStore,
  InterestTarget,
  InterestTargets,
  NewInterest,
} from '@/features/ownership/application/ports';
import {
  registerInterest,
  type RegisterInterestDependencies,
} from '@/features/ownership/application/register-interest';
import { PublicAttemptUnverifiableError, type PublicAttempt } from '@/features/platform';
import {
  CONTEXT_KEY,
  coOwnerBody,
  HASH_KEY,
  ownerBody,
  presentationContext,
} from '../../../support/interest-fixtures';

// Solicitação de conversa — caso de uso (spec ownership §5, §13, §14): contexto apresentado, variante da dimensão de
// investimento, hash chaveado com contato e pré-qualificação, alvo público e gravação atômica.
const ATTEMPT_ID = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';
const HOME_CONCEPT = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const HOME_EDITION = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const OTHER_HOME_EDITION = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
const REFERENCE = '0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f';
const NOW = new Date('2026-10-20T12:00:00.000Z');

const TARGET: InterestTarget = { homeEditionId: HOME_EDITION, homeConceptId: HOME_CONCEPT };

function fakeStore(overrides: Partial<InterestStore> = {}) {
  const written: { request: NewInterest; attempt: PublicAttempt }[] = [];
  const store: InterestStore = {
    priorAttempt: vi.fn(() => Promise.resolve(null)),
    register: vi.fn((request: NewInterest, attempt: PublicAttempt) => {
      written.push({ request, attempt });
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
  return {
    store,
    targets,
    clock: { now: () => NOW },
    newId: () => 'new-interest-id',
    hashKey: HASH_KEY,
    contextKeys: [CONTEXT_KEY],
  };
}

describe('solicitação de conversa — use case (spec ownership §14)', () => {
  it('[REQ-022] [REQ-023] grava interesse, contato normalizado e pré-qualificação; hash HMAC com id da chave', async () => {
    const { store, written } = fakeStore();

    const result = await registerInterest(
      coOwnerBody(HOME_EDITION, {
        origin: '  Instagram   da marca ',
        partner_ref: ' Parceiro local XPTO ',
        name: '  Maria   Teste ',
        phone: '+55 (11) 98765-4321',
        email: ' Maria.Teste@Example.COM ',
      }),
      ATTEMPT_ID.toUpperCase(),
      deps(store),
    );

    expect(result).toEqual({ status: 'registered', replayed: false });
    expect(written).toHaveLength(1);
    expect(written[0]?.request).toEqual({
      id: 'new-interest-id',
      createdAt: NOW,
      interest: {
        homeEditionId: HOME_EDITION,
        modality: 'co_owner',
        desiredLocation: 'Litoral norte de SP',
        approxDays: 21,
        origin: 'Instagram da marca',
        partnerRef: 'Parceiro local XPTO',
      },
      contact: { name: 'Maria Teste', phone: '+5511987654321', email: 'Maria.Teste@example.com' },
      qualification: {
        version: 1,
        availableToStartBand: 'from_500k_to_1m',
        referenceFit: null,
        presentedProjectedInvestmentId: null,
        decisionUnit: 'with_partner_or_family',
        decisionHorizon: 'six_to_twelve_months',
      },
    });
    expect(written[0]?.attempt).toMatchObject({
      key: ATTEMPT_ID,
      surface: 'interest',
      hashScheme: 'hmac_sha256',
      hashKeyId: 'v1',
    });
    expect(JSON.stringify(written[0]?.attempt)).not.toContain(HASH_KEY.secret);
  });

  it('[REQ-022] [BR-034] Owner com média apresentada → faixa para iniciar + reference_fit vinculado à referência do contexto', async () => {
    const { store, written } = fakeStore();

    expect(
      await registerInterest(ownerBody(HOME_EDITION, REFERENCE), ATTEMPT_ID, deps(store)),
    ).toEqual({ status: 'registered', replayed: false });
    expect(written[0]?.request.qualification).toEqual({
      version: 1,
      availableToStartBand: 'from_1m_to_2_5m',
      referenceFit: 'within',
      presentedProjectedInvestmentId: REFERENCE,
      decisionUnit: 'self',
      decisionHorizon: 'immediate',
    });
    expect(written[0]?.request.interest.approxDays).toBeNull();
  });

  it('[REQ-022] [BR-034] [BR-063] Co-Owner responde à faixa para iniciar e nunca compara com a média total (contexto guardado)', async () => {
    const { store, written } = fakeStore();

    await registerInterest(coOwnerBody(HOME_EDITION, {}, REFERENCE), ATTEMPT_ID, deps(store));

    expect(written[0]?.request.qualification).toMatchObject({
      availableToStartBand: 'from_500k_to_1m',
      referenceFit: null,
      presentedProjectedInvestmentId: REFERENCE,
    });
    expect(
      await registerInterest(
        coOwnerBody(HOME_EDITION, { reference_fit: 'within' }, REFERENCE),
        ATTEMPT_ID,
        deps(fakeStore().store),
      ),
    ).toEqual({ status: 'invalid', issues: [{ field: 'reference_fit', code: 'not_allowed' }] });
  });

  it('[REQ-022] reference_fit exigido só para Owner com média apresentada e recusado sem ela; nada gravado', async () => {
    const { store, written } = fakeStore();

    // Owner com média apresentada precisa comparar.
    const withoutFit = ownerBody(HOME_EDITION, REFERENCE);
    delete withoutFit.reference_fit;
    expect(await registerInterest(withoutFit, ATTEMPT_ID, deps(store))).toEqual({
      status: 'invalid',
      issues: [{ field: 'reference_fit', code: 'required' }],
    });
    // Owner sem média apresentada não pode responder à comparação.
    expect(
      await registerInterest(
        ownerBody(HOME_EDITION, null, { reference_fit: 'above' }),
        ATTEMPT_ID,
        deps(store),
      ),
    ).toEqual({ status: 'invalid', issues: [{ field: 'reference_fit', code: 'not_allowed' }] });
    expect(store.priorAttempt).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });

  it('[REQ-022] [EC-14] contexto adulterado, de outra Home Edition ou malformado → presentation_context invalid', async () => {
    const { store, written } = fakeStore();
    const forged = presentationContext(HOME_EDITION, REFERENCE).replace(/\.[^.]+$/, '.AAAA');

    for (const context of [forged, presentationContext(OTHER_HOME_EDITION, null), 'x.y']) {
      expect(
        await registerInterest(
          coOwnerBody(HOME_EDITION, { presentation_context: context }),
          ATTEMPT_ID,
          deps(store),
        ),
      ).toEqual({
        status: 'invalid',
        issues: [{ field: 'presentation_context', code: 'invalid' }],
      });
    }
    expect(written).toHaveLength(0);
  });

  it('[REQ-022] [EC-14] a referência registrada é a apresentada — o use case nem consulta a média vigente', async () => {
    const { store, written } = fakeStore();
    const dependencies = deps(store);

    await registerInterest(ownerBody(HOME_EDITION, REFERENCE), ATTEMPT_ID, dependencies);

    // As únicas dependências são o alvo público e o store: não existe leitura da média "agora".
    expect(Object.keys(dependencies).sort()).toEqual([
      'clock',
      'contextKeys',
      'hashKey',
      'newId',
      'store',
      'targets',
    ]);
    expect(written[0]?.request.qualification.presentedProjectedInvestmentId).toBe(REFERENCE);
  });

  it('[REQ-022] [EC-15] Home Edition fora do público na leitura pública ou na revalidação da gravação → not_found', async () => {
    const hidden = fakeStore();
    const hiddenDeps = deps(hidden.store, null);
    expect(await registerInterest(coOwnerBody(HOME_EDITION), ATTEMPT_ID, hiddenDeps)).toEqual({
      status: 'not_found',
    });
    expect(hiddenDeps.targets.find).toHaveBeenCalledWith(HOME_EDITION);
    expect(hidden.written).toHaveLength(0);

    const withdrawn = fakeStore({ register: vi.fn(() => Promise.resolve('not_found' as const)) });
    expect(
      await registerInterest(coOwnerBody(HOME_EDITION), ATTEMPT_ID, deps(withdrawn.store)),
    ).toEqual({ status: 'not_found' });
  });

  it('[TECH-056] chave ausente ou fora do formato UUID → invalid, sem consultar nem gravar', async () => {
    const { store, written } = fakeStore();

    expect(await registerInterest(coOwnerBody(HOME_EDITION), 'curta', deps(store))).toEqual({
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

    expect(await registerInterest(coOwnerBody(HOME_EDITION), ATTEMPT_ID, replayDeps)).toEqual({
      status: 'registered',
      replayed: true,
    });
    expect(replayDeps.targets.find).not.toHaveBeenCalled();
    expect(replayStore.written).toHaveLength(0);

    const conflictStore = fakeStore({
      priorAttempt: vi.fn(() => Promise.resolve('conflict' as const)),
    });
    expect(
      await registerInterest(coOwnerBody(HOME_EDITION), ATTEMPT_ID, deps(conflictStore.store)),
    ).toEqual({ status: 'conflict' });
  });

  it('[TECH-056] corrida com a mesma chave resolvida na gravação: repetição ou conflito', async () => {
    const replayed = fakeStore({ register: vi.fn(() => Promise.resolve('replayed' as const)) });
    const conflict = fakeStore({ register: vi.fn(() => Promise.resolve('conflict' as const)) });

    expect(
      await registerInterest(coOwnerBody(HOME_EDITION), ATTEMPT_ID, deps(replayed.store)),
    ).toEqual({ status: 'registered', replayed: true });
    expect(
      await registerInterest(coOwnerBody(HOME_EDITION), ATTEMPT_ID, deps(conflict.store)),
    ).toEqual({ status: 'conflict' });
  });

  it('[TECH-056] registro com chave de hash desconhecida → erro não verificável sobe (a rota responde 503)', async () => {
    const { store } = fakeStore({
      priorAttempt: vi.fn(() =>
        Promise.reject(new PublicAttemptUnverifiableError('interest', 'hmac_sha256', 'v9')),
      ),
    });

    await expect(
      registerInterest(coOwnerBody(HOME_EDITION), ATTEMPT_ID, deps(store)),
    ).rejects.toThrow(PublicAttemptUnverifiableError);
  });

  it('[TECH-056] o hash cobre contato e pré-qualificação; o mesmo conteúdo lógico gera o mesmo hash', async () => {
    const hashOf = async (body: Record<string, unknown>) => {
      const { store, written } = fakeStore();
      await registerInterest(body, ATTEMPT_ID, deps(store));
      return written[0]?.attempt.requestHash;
    };
    const base = await hashOf(coOwnerBody(HOME_EDITION));

    expect(
      await hashOf(
        coOwnerBody(HOME_EDITION, {
          home_edition_id: HOME_EDITION.toUpperCase(),
          desired_location: '  Litoral  norte de SP ',
          email: 'sentinela.teste@EXAMPLE.com',
          phone: '11 98765 4321',
        }),
      ),
    ).toBe(base);
    for (const extra of [
      { name: 'Outra Pessoa' },
      { email: 'outra@example.com' },
      { phone: '(11) 91234-5678' },
      { decision_unit: 'self' },
      { decision_horizon: 'immediate' },
      { available_to_start_band: 'not_defined' },
    ]) {
      expect(await hashOf(coOwnerBody(HOME_EDITION, extra)), JSON.stringify(extra)).not.toBe(base);
    }
  });
});
