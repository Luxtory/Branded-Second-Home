// Superfície pública de apresentação das políticas comerciais (W18): os termos e o aceite que as operações mostram antes
// de confirmar (PD-009). Só componentes e tipos — sem banco nem servidor —, para telas de cliente de outros slices (W21:
// revisão da Request).
export { PolicyAcceptance, PolicyTerms } from './presentation/policy-terms';
export type { PolicyConfig, PolicyMechanism } from './domain/commercial-policy';
