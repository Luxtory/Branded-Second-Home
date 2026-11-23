// Superfície pública de servidor do pricing para o PRL (W16; REQ-013, REQ-052; ADR-0032; spec pricing §5): os commands
// `publish_initial_prl` e `change_published_prl` com as dependências de produção e as leituras do Admin.
import type { DatabaseTransaction } from '@/features/platform';
import { createPublishPrlHandler } from './application/publish-prl';
import { createPostgresPrlStore } from './infrastructure/postgres-prl-store';

export {
  publishPrlInput,
  type PublishPrlInput,
  type PublishPrlResult,
} from './application/publish-prl';
export {
  MAX_PRL_NIGHTS,
  nightStatus,
  type PrlKind,
  type PrlNightStatus,
  type PrlVersion,
} from './domain/prl';
export {
  prlCoverage,
  prlHistory,
  sealedCalendar,
  sealedNightsBetween,
  type PrlCoverage,
} from './infrastructure/postgres-prl-store';
export {
  reviewPrlPublication,
  type PrlNightState,
  type PrlReview,
  type PrlReviewIssue,
  type PrlReviewRow,
} from './application/prl-review';

export function createPrlHandlers() {
  const store = createPostgresPrlStore();
  return {
    publishInitialPrl: createPublishPrlHandler<DatabaseTransaction>('initial', { store }),
    changePublishedPrl: createPublishPrlHandler<DatabaseTransaction>('change', { store }),
  };
}
