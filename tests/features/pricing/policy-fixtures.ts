import type { PolicyConfig, PolicyMechanism } from '@/features/pricing';

/**
 * Políticas de TESTE (W18, ADR-0034): valores deliberadamente arbitrários, sem relação com qualquer política comercial
 * real; existem só nos bancos efêmeros dos testes (T-1808). Nenhuma é publicada por migration, seed ou runbook.
 */
const R = 'return_to_origin';

export const TEST_POLICIES: Readonly<Record<PolicyMechanism, PolicyConfig>> = {
  luxchange_request: {
    cancellation: [
      { min_notice_hours: 700, effects: { capacity: R, credits: '1', fee: '0.35' } },
      { min_notice_hours: 50, effects: { capacity: R, credits: '0.4', fee: '0' } },
      { min_notice_hours: 0, effects: { capacity: R, credits: '0', fee: '0' } },
    ],
    no_show: { capacity: R, credits: '0', fee: '0' },
    exception: { capacity: R, credits: '0.65', fee: '1' },
  },
  luxchange_direct: {
    cancellation: [
      { min_notice_hours: 0, effects: { capacity: R, credits: '0.123457', fee: '0' } },
    ],
    no_show: { capacity: R, credits: '0', fee: '0' },
    exception: { capacity: R, credits: '1', fee: '1' },
  },
  luxplus: {
    cancellation: [
      { min_notice_hours: 300, effects: { capacity: R, money: '0.9' } },
      { min_notice_hours: 0, effects: { capacity: R, money: '0.1' } },
    ],
    no_show: { capacity: R, money: '0' },
    exception: { capacity: R, money: '0.333333' },
  },
  rental_external: {
    cancellation: [
      { min_notice_hours: 200, effects: { capacity: R, money: '0.75', remuneration: '0.25' } },
      { min_notice_hours: 0, effects: { capacity: R, money: '0', remuneration: '1' } },
    ],
    no_show: { capacity: R, money: '0', remuneration: '0.5' },
    exception: { capacity: R, money: '1', remuneration: '0' },
  },
};

const clone = <T>(value: T): T => structuredClone(value) as T;

function withRequest(mutate: (config: Record<string, unknown>) => void): unknown {
  const config = clone(TEST_POLICIES.luxchange_request) as unknown as Record<string, unknown>;
  mutate(config);
  return config;
}

/**
 * Políticas que contrariam o esquema fechado, a BR-163 ou um INV (REQ-104): o domínio e o banco recusam as mesmas.
 * `[rótulo, mecanismo, config]`.
 */
export const INVALID_POLICIES: readonly (readonly [string, PolicyMechanism, unknown])[] = [
  [
    'BR-163: capacidade retida em vez de voltar à origem',
    'luxchange_request',
    withRequest((c) => {
      (c.no_show as Record<string, unknown>).capacity = 'retain';
    }),
  ],
  [
    'BR-163/PD-010: capacidade transferida à Luxtory na exceção',
    'luxchange_request',
    withRequest((c) => {
      (c.exception as Record<string, unknown>).capacity = 'luxtory_inventory';
    }),
  ],
  [
    'INV-6: reversão de Créditos acima do consumido (fração > 1)',
    'luxchange_request',
    withRequest((c) => {
      (c.exception as Record<string, unknown>).credits = '1.5';
    }),
  ],
  [
    'PD-010: Fee devolvido acima do pago',
    'luxchange_direct',
    {
      ...clone(TEST_POLICIES.luxchange_direct),
      exception: { capacity: R, credits: '1', fee: '2' },
    },
  ],
  [
    'INV-6: Créditos num mecanismo sem Créditos (Luxplus)',
    'luxplus',
    { ...clone(TEST_POLICIES.luxplus), no_show: { capacity: R, money: '0', credits: '1' } },
  ],
  [
    'TECH-082: Fee num mecanismo sem Fee (locação)',
    'rental_external',
    {
      ...clone(TEST_POLICIES.rental_external),
      no_show: { capacity: R, money: '0', remuneration: '0', fee: '1' },
    },
  ],
  [
    'REQ-070: remuneração no Luxplus',
    'luxplus',
    { ...clone(TEST_POLICIES.luxplus), exception: { capacity: R, money: '0', remuneration: '1' } },
  ],
  [
    'REQ-082: eixo do mecanismo omitido (nada é presumido)',
    'luxchange_request',
    withRequest((c) => {
      c.no_show = { capacity: R, credits: '0' };
    }),
  ],
  [
    'REQ-082: evento omitido (exceção sem efeitos declarados)',
    'luxchange_request',
    withRequest((c) => {
      delete c.exception;
    }),
  ],
  [
    'PD-010: locação devolve ao locatário e mantém remuneração (valor criado)',
    'rental_external',
    {
      ...clone(TEST_POLICIES.rental_external),
      exception: { capacity: R, money: '0.6', remuneration: '0.5' },
    },
  ],
  [
    'prazo: faixas sem cobertura até o check-in (última ≠ 0)',
    'luxchange_request',
    withRequest((c) => {
      c.cancellation = [{ min_notice_hours: 24, effects: { capacity: R, credits: '1', fee: '0' } }];
    }),
  ],
  [
    'prazo: faixas fora de ordem',
    'luxchange_request',
    withRequest((c) => {
      c.cancellation = [
        { min_notice_hours: 10, effects: { capacity: R, credits: '1', fee: '0' } },
        { min_notice_hours: 10, effects: { capacity: R, credits: '0', fee: '0' } },
        { min_notice_hours: 0, effects: { capacity: R, credits: '0', fee: '0' } },
      ];
    }),
  ],
  [
    'prazo: antecedência não inteira',
    'luxchange_request',
    withRequest((c) => {
      c.cancellation = [
        { min_notice_hours: 0.5, effects: { capacity: R, credits: '1', fee: '0' } },
        {
          min_notice_hours: 0,
          effects: { capacity: R, credits: '1', fee: '0' },
        },
      ];
    }),
  ],
  [
    'prazo: mais de 5 faixas',
    'luxchange_request',
    withRequest((c) => {
      c.cancellation = [600, 500, 400, 300, 200, 0].map((hours) => ({
        min_notice_hours: hours,
        effects: { capacity: R, credits: '1', fee: '0' },
      }));
    }),
  ],
  [
    'fração não canônica (zero à direita)',
    'luxchange_request',
    withRequest((c) => {
      (c.no_show as Record<string, unknown>).fee = '0.50';
    }),
  ],
  [
    'fração negativa',
    'luxchange_request',
    withRequest((c) => {
      (c.no_show as Record<string, unknown>).fee = '-0.1';
    }),
  ],
  [
    'fração como número JSON',
    'luxchange_request',
    withRequest((c) => {
      (c.no_show as Record<string, unknown>).fee = 0;
    }),
  ],
  [
    'chave extra no documento',
    'luxchange_request',
    withRequest((c) => {
      c.default = { capacity: R, credits: '0', fee: '0' };
    }),
  ],
];
