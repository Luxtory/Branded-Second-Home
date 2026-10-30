import { describe, expect, it, vi } from 'vitest';
import {
  createOperationalAlert,
  type OperationalAlertEvent,
} from '@/features/platform/application/alerts';
import { createFakeStaffNotification } from '@/features/platform/infrastructure/alerts/fake-staff-notification';
import {
  createResendStaffNotification,
  RESEND_EMAILS_URL,
} from '@/features/platform/infrastructure/alerts/resend-staff-notification';
import {
  composeStaffNotification,
  createProductionOperationalAlert,
  resolveStaffNotification,
} from '@/features/platform/presentation/operational-alert';

const event: OperationalAlertEvent = {
  kind: 'open_exercise_failure',
  scope: 'item',
  correlationId: 'corr-1',
  details: {
    failed: 1,
    items: [
      {
        second_home_id: '00000000-0000-4000-8000-00000000000a',
        exercise_year: 2028,
        reason: 'ERR_CAPACITY_UNAVAILABLE',
      },
    ],
  },
};
const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const config = {
  OPS_ALERT_RESEND_API_KEY: 're_test_key',
  OPS_ALERT_EMAIL_FROM: 'Luxtory <alertas@luxtory.club>',
  OPS_ALERT_EMAIL_TO: 'operacao@luxtory.club',
  OPS_ALERT_SEND_TIMEOUT_MS: '5000',
};

describe('alerta operacional (W10) [TECH-101]', () => {
  it('[TECH-101] registra no log e notifica a staff pelo transporte simulado', async () => {
    const logger = log();
    const transport = createFakeStaffNotification();
    await createOperationalAlert({ log: logger, transport }).raise(event);
    expect(logger.error).toHaveBeenCalledWith('operational alert', {
      alert: 'open_exercise_failure',
      scope: 'item',
      correlation_id: 'corr-1',
      ...event.details,
    });
    expect(transport.sent).toEqual([event]);
  });

  it('[TECH-101] sem transporte a notificação é recusada com segurança; falha do transporte só vira log', async () => {
    const logger = log();
    await createOperationalAlert({ log: logger, transport: null }).raise(event);
    expect(logger.error).toHaveBeenCalledWith('staff notification unavailable', {
      alert: 'open_exercise_failure',
      reason: 'not_configured',
    });
    const failing = log();
    await createOperationalAlert({
      log: failing,
      transport: { send: () => Promise.resolve('failed') },
    }).raise(event);
    expect(failing.error).toHaveBeenCalledWith('staff notification failed', {
      alert: 'open_exercise_failure',
    });
  });

  it('[TECH-101] configuração ausente ou modo simulado na Vercel: recusa nomeando as chaves, sem lançar', async () => {
    expect(resolveStaffNotification({})).toEqual({
      unavailableKeys: [
        'OPS_ALERT_RESEND_API_KEY',
        'OPS_ALERT_EMAIL_FROM',
        'OPS_ALERT_EMAIL_TO',
        'OPS_ALERT_SEND_TIMEOUT_MS',
      ],
    });
    expect(resolveStaffNotification({ OPS_ALERT_MODE: 'fake', VERCEL_ENV: 'production' })).toEqual({
      unavailableKeys: ['OPS_ALERT_MODE'],
    });
    expect('transport' in resolveStaffNotification({ OPS_ALERT_MODE: 'fake' })).toBe(true);
    const logger = log();
    await expect(
      createProductionOperationalAlert({ log: logger, source: {} }).raise(event),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith('staff notification configuration unavailable', {
      alert: 'open_exercise_failure',
      keys: [
        'OPS_ALERT_RESEND_API_KEY',
        'OPS_ALERT_EMAIL_FROM',
        'OPS_ALERT_EMAIL_TO',
        'OPS_ALERT_SEND_TIMEOUT_MS',
      ],
    });
  });

  it('[TECH-101] e-mail pelo Resend: destinatário do servidor, chave idempotente por execução, só ids e códigos', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })),
    );
    const transport = createResendStaffNotification({
      apiKey: config.OPS_ALERT_RESEND_API_KEY,
      from: config.OPS_ALERT_EMAIL_FROM,
      to: config.OPS_ALERT_EMAIL_TO,
      timeoutMs: 5000,
      compose: composeStaffNotification,
      fetch: fetchMock,
    });
    await expect(transport.send(event)).resolves.toBe('sent');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(RESEND_EMAILS_URL);
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer re_test_key',
      'idempotency-key': 'open_exercise_failure:item:corr-1',
    });
    const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string };
    expect(body.to).toEqual(['operacao@luxtory.club']);
    expect(body.subject).toBe('Luxtory — alerta operacional: open_exercise_failure');
    expect(body.text).toContain('Correlation id: corr-1');
    expect(body.text).toContain('ERR_CAPACITY_UNAVAILABLE');
  });

  it('[TECH-101] status não-2xx, rede ou timeout viram falha, sem lançar', async () => {
    const statuses = [
      () => Promise.resolve(new Response('{}', { status: 500 })),
      () => Promise.reject(new TypeError('network')),
      () => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
    ];
    for (const response of statuses) {
      const transport = createResendStaffNotification({
        apiKey: 're_x',
        from: 'a@luxtory.club',
        to: 'b@luxtory.club',
        timeoutMs: 1,
        compose: composeStaffNotification,
        fetch: vi.fn<typeof fetch>(response),
      });
      await expect(transport.send(event)).resolves.toBe('failed');
    }
  });
});
