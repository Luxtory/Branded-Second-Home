// Entrada do identity para o job `outbox` do platform (W15): só os consumidores, sem telas nem sessão — o registro de
// jobs carrega este módulo sem puxar a superfície de apresentação.
export { createMembershipConsumers } from './presentation/membership-consumers';
