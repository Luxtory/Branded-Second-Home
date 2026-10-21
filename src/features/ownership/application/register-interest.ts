import {
  isPublicIdempotencyKey,
  keyedPublicAttempt,
  type Clock,
  type PublicHashKey,
} from '@/features/platform';
import {
  asksReferenceFit,
  QUALIFICATION_VERSION,
  type InterestQualification,
} from '../domain/interest-qualification';
import {
  parseInterestRequest,
  type InterestFieldIssue,
  type InterestRequest,
} from './interest-input';
import type { InterestStore, InterestTargets } from './ports';
import { verifyPresentationContext, type PresentationContextKey } from './presentation-context';

/** Superfície da idempotência pública do interesse (ADR-0017); a W6 reutiliza a mesma. */
export const INTEREST_SURFACE = 'interest';

/** Chave do HMAC do hash de idempotência em uso (ADR-0018 §3). */
export const INTEREST_HASH_KEY_ID = 'v1';

export type InterestRegistration =
  | { readonly status: 'registered'; readonly replayed: boolean }
  | { readonly status: 'invalid'; readonly issues: readonly InterestFieldIssue[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'conflict' };

export interface RegisterInterestDependencies {
  readonly targets: InterestTargets;
  readonly store: InterestStore;
  readonly clock: Clock;
  readonly newId: () => string;
  /** Chave do HMAC do hash de idempotência (o conteúdo inclui contato e pré-qualificação). */
  readonly hashKey: PublicHashKey;
  /** Chaves que verificam o contexto de apresentação (a vigente; na rotação, também a anterior). */
  readonly contextKeys: readonly PresentationContextKey[];
}

type Qualified =
  | { readonly ok: true; readonly qualification: InterestQualification }
  | { readonly ok: false; readonly issues: readonly InterestFieldIssue[] };

/**
 * Pré-qualificação com a referência **apresentada** (`02` §15, item 14): o contexto assinado prova o que a página
 * mostrou — nunca a média vigente no envio — e decide se a comparação com a média é exigida (Owner com média) ou
 * recusada (Co-Owner ou sem média) (spec §14.5).
 */
function qualify(
  request: InterestRequest,
  contextKeys: readonly PresentationContextKey[],
): Qualified {
  const context = verifyPresentationContext(request.presentationContext, contextKeys);
  if (context === null || context.homeEditionId !== request.interest.homeEditionId) {
    return { ok: false, issues: [{ field: 'presentation_context', code: 'invalid' }] };
  }
  const presented = context.presentedProjectedInvestmentId;
  const asked = asksReferenceFit(request.interest.modality, presented !== null);
  const answered = request.answers.referenceFit !== null;
  if (asked && !answered) {
    return { ok: false, issues: [{ field: 'reference_fit', code: 'required' }] };
  }
  if (!asked && answered) {
    return { ok: false, issues: [{ field: 'reference_fit', code: 'not_allowed' }] };
  }
  return {
    ok: true,
    qualification: {
      version: QUALIFICATION_VERSION,
      ...request.answers,
      presentedProjectedInvestmentId: presented,
    },
  };
}

/**
 * Solicitação de conversa (REQ-022–REQ-025; spec ownership §5, §13, §14): chave UUID e schema fechado → contexto de
 * apresentação e comparação com a média → chave já usada (repetição ou conflito, sem reavaliar o alvo) → Home Edition pública →
 * gravação atômica com a chave, revalidando a Home Edition dentro da transação. Recusas não consomem a chave
 * (ADR-0017). Nunca cria aquisição, conta, Titular, Ação, Direito de Uso, prioridade nem classificação.
 */
export async function registerInterest(
  body: unknown,
  idempotencyKey: string,
  { targets, store, clock, newId, hashKey, contextKeys }: RegisterInterestDependencies,
): Promise<InterestRegistration> {
  const parsed = parseInterestRequest(body);
  if (!isPublicIdempotencyKey(idempotencyKey)) {
    return { status: 'invalid', issues: parsed.ok ? [] : parsed.issues };
  }
  if (!parsed.ok) return { status: 'invalid', issues: parsed.issues };
  const { request } = parsed;
  const qualified = qualify(request, contextKeys);
  if (!qualified.ok) return { status: 'invalid', issues: qualified.issues };
  const { interest, contact } = request;
  const { qualification } = qualified;
  // O conteúdo completo — interesse, contato e pré-qualificação — decide repetição e conflito (ADR-0018 §3).
  const attempt = keyedPublicAttempt(
    INTEREST_SURFACE,
    idempotencyKey,
    { interest, contact, qualification },
    hashKey,
  );
  const prior = await store.priorAttempt(attempt);
  if (prior === 'replayed') return { status: 'registered', replayed: true };
  if (prior === 'conflict') return { status: 'conflict' };

  // Home Edition em preparação, fora do público ou inexistente → mesma resposta (`02` §15, item 15).
  if ((await targets.find(interest.homeEditionId)) === null) return { status: 'not_found' };

  const written = await store.register(
    { id: newId(), createdAt: clock.now(), interest, contact, qualification },
    attempt,
  );
  if (written === 'not_found') return { status: 'not_found' };
  if (written === 'conflict') return { status: 'conflict' };
  return { status: 'registered', replayed: written === 'replayed' };
}
