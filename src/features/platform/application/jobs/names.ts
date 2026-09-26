/** Jobs do TECH-090. Cada execução e cada item são idempotentes; job nunca é a única proteção de validade ou INV. */
export const TECH_090_JOBS = [
  'open_exercise',
  'close_exercise',
  'expire_requests',
  'expire_credit_lots',
  'advance_booking_states',
  'flag_no_show_candidates',
  'close_delinquency_authorization',
  'reconciliation',
  'outbox',
] as const;

export type JobName = (typeof TECH_090_JOBS)[number];

export function isJobName(value: string): value is JobName {
  return (TECH_090_JOBS as readonly string[]).includes(value);
}
