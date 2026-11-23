import { loadEnv, loadRuntimeConfig, type EnvSource } from '@/features/platform';
import type { PaymentGateway } from '../application/ports';
import { createFakePaymentGateway, type FakePaymentGateway } from './fake-payment-gateway';

// Um fake por processo e segredo: cobranças feitas num request são encontradas no webhook e na conciliação seguintes.
const fakes = new Map<string, FakePaymentGateway>();

/**
 * Gateway configurado (ADR-0035 §7): sem `PAYMENT_GATEWAY`, nenhum (pagamentos indisponíveis); `fake` exige
 * `PAYMENT_WEBHOOK_SECRET` e é recusado em Production pela validação do ambiente. Nenhum PSP real existe até a
 * contratação (P-2).
 */
export function configuredPaymentGateway(source: EnvSource = process.env): PaymentGateway | null {
  const env = loadEnv(source);
  if (env.PAYMENT_GATEWAY === undefined) return null;
  const { PAYMENT_WEBHOOK_SECRET } = loadRuntimeConfig(['PAYMENT_WEBHOOK_SECRET'], source);
  let fake = fakes.get(PAYMENT_WEBHOOK_SECRET);
  if (fake === undefined) {
    fake = createFakePaymentGateway({ webhookSecret: PAYMENT_WEBHOOK_SECRET });
    fakes.set(PAYMENT_WEBHOOK_SECRET, fake);
  }
  return fake;
}
