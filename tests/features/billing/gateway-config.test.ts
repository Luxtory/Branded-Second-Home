import { describe, expect, it } from 'vitest';
import { configuredPaymentGateway } from '@/features/billing';
import { createReconciliationJob } from '@/features/billing/jobs';
import { ConfigurationMissingError, EnvValidationError } from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';

const SECRET = 'w19-config-test-secret-0123456789abcdef';

describe('gateway configurado (TECH-081, ADR-0035 §7)', () => {
  it('[TECH-081] sem PAYMENT_GATEWAY não há pagamento; fake exige segredo; fake recusado em Production', () => {
    expect(configuredPaymentGateway({})).toBeNull();
    expect(() => configuredPaymentGateway({ PAYMENT_GATEWAY: 'fake' })).toThrow(
      ConfigurationMissingError,
    );
    expect(
      configuredPaymentGateway({ PAYMENT_GATEWAY: 'fake', PAYMENT_WEBHOOK_SECRET: SECRET })
        ?.provider,
    ).toBe('fake');
    expect(
      configuredPaymentGateway({
        PAYMENT_GATEWAY: 'fake',
        PAYMENT_WEBHOOK_SECRET: SECRET,
        VERCEL_ENV: 'preview',
      })?.provider,
    ).toBe('fake');
    expect(() =>
      configuredPaymentGateway({
        PAYMENT_GATEWAY: 'fake',
        PAYMENT_WEBHOOK_SECRET: SECRET,
        VERCEL_ENV: 'production',
      }),
    ).toThrow(EnvValidationError);
    expect(() => configuredPaymentGateway({ PAYMENT_GATEWAY: 'stripe' })).toThrow(
      EnvValidationError,
    );
  });

  it('[TECH-090] job reconciliation: no-op sem gateway; com gateway, a carência do runbook é obrigatória (TECH-001)', async () => {
    const log = captureLogger();
    expect(await createReconciliationJob({ log: log.logger, source: {} })()).toEqual({
      unconfigured: 1,
    });
    await expect(
      createReconciliationJob({
        log: log.logger,
        source: { PAYMENT_GATEWAY: 'fake', PAYMENT_WEBHOOK_SECRET: SECRET },
      })(),
    ).rejects.toBeInstanceOf(ConfigurationMissingError);
  });
});
