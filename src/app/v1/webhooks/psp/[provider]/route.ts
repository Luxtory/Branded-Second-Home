// POST /v1/webhooks/psp/{provider} — contrato `receivePaymentWebhook` em docs/api/openapi.yaml (TECH-081, ADR-0035).
export { receivePaymentWebhook as POST } from '@/features/billing/presentation/webhook-route';

// Cada evento é processado: nunca servir do cache.
export const dynamic = 'force-dynamic';
