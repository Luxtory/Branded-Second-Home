// Superfície pública do módulo pricing (TECH-011) para os outros slices: valores exatos, fórmulas do `01` e o contrato
// `EconomicTerms` (TECH-031; ADR-0032 §8). Commands e leituras do Admin ficam em `./prl`.
export {
  CURRENCIES,
  MAX_AMOUNT_MINOR,
  MINOR_UNIT_DIGITS,
  minorToDecimal,
  parseMinorAmount,
  parseMoneyInput,
  sumMinor,
  type Currency,
  type Money,
} from './domain/money';
export { creditsForPrl, luxchangeFee } from './domain/economic';
export {
  ECONOMIC_PARAMETER_UNITS,
  resolveEconomicTerms,
  type EconomicParameterKey,
  type EconomicParameterUnit,
  type EconomicTerms,
  type EconomicTermsRequest,
  type EconomicTermsStore,
} from './application/economic-terms';
export { createPostgresEconomicTermsStore } from './infrastructure/postgres-economic-terms-store';
export {
  postgresEconomicSnapshotRecorder,
  recordEconomicSnapshot,
} from './infrastructure/postgres-economic-snapshot';
export {
  CAPACITY_RETURN_TO_ORIGIN,
  MECHANISM_AXES,
  POLICY_EVENTS,
  POLICY_MECHANISMS,
  PolicyEvaluationError,
  evaluatePolicy,
  validatePolicyConfig,
  type PolicyConfig,
  type PolicyEvaluation,
  type PolicyEventInput,
  type PolicyMechanism,
  type PolicySnapshot,
} from './domain/commercial-policy';
export type { EconomicTermsPolicy } from './application/economic-terms';
// W20: temporadas de apresentação da W16 (ADR-0032 §11), também no calendário do depósito Luxchange (só leitura).
export { seasonTiers, type SeasonTier } from './presentation/prl-seasons';
