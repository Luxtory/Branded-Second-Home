import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  CalendarNight,
  OwnUseCalendarData,
} from '@/features/booking/presentation/own-use-calendar-read';

// As Server Actions não rodam aqui: o componente só as referencia (a prévia e a confirmação têm testes próprios).
vi.mock('@/features/booking/presentation/own-use-actions', () => ({
  createOwnUseBookingAction: vi.fn(),
}));
vi.mock('@/features/booking/presentation/own-use-preview-action', () => ({
  previewOwnUseBookingAction: vi.fn(),
}));

const { OwnUseCalendar } = await import('@/features/booking/presentation/own-use-calendar');
const { OwnUseRights } = await import('@/features/booking/presentation/own-use-rights');

// Telas da W12 (spec booking §7): fatos do servidor → estados da grade, Direito de Uso compacto, 29/02 só para a Ação
// contemplada e linguagem da holding representada ("desta Ação" / "do Owner").
const DAY_MS = 86_400_000;
const days = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10),
  );
const night = (date: string, status: CalendarNight['status']): CalendarNight => ({
  date,
  exerciseYear: Number(date.slice(0, 4)),
  season: ['01', '07', '12'].includes(date.slice(5, 7)) ? 'alta' : 'media',
  isLeapDay: date.endsWith('-02-29'),
  status,
});

function coOwner(overrides: Partial<OwnUseCalendarData> = {}): OwnUseCalendarData {
  const statuses: Record<string, CalendarNight['status']> = {
    '2028-02-02': 'started',
    '2028-02-07': 'mine',
    '2028-02-08': 'mine',
    '2028-02-14': 'unavailable',
  };
  return {
    holdingId: '00000000-0000-4000-8000-000000000a01',
    partyId: '00000000-0000-4000-8000-000000000b01',
    secondHomeId: '00000000-0000-4000-8000-000000000c01',
    secondHomeLabel: 'Casa Ipê',
    role: 'co_owner',
    today: '2028-02-04',
    nights: days('2028-02-01', 60).map((date) => night(date, statuses[date] ?? 'available')),
    bookings: [
      {
        id: 'b1',
        checkinDate: '2028-02-07',
        checkoutDate: '2028-02-09',
        channel: 'own_use',
        state: 'confirmed',
      },
    ],
    balances: [
      { exerciseYear: 2028, bucket: 'alta', granted: 48, remaining: 41 },
      { exerciseYear: 2028, bucket: 'media', granted: 128, remaining: 121 },
      { exerciseYear: 2028, bucket: 'leap', granted: 1, remaining: 1 },
    ],
    windows: [
      {
        exerciseYear: 2028,
        isLeapDay: false,
        opensAt: '2027-09-15T03:00:00.000Z',
        opensOn: '2027-09-15',
        open: true,
      },
      {
        exerciseYear: 2028,
        isLeapDay: true,
        opensAt: '2027-09-15T03:00:00.000Z',
        opensOn: '2027-09-15',
        open: true,
      },
      {
        exerciseYear: 2029,
        isLeapDay: false,
        opensAt: '2028-09-15T03:00:00.000Z',
        opensOn: '2028-09-15',
        open: false,
      },
    ],
    bookingOpen: true,
    ...overrides,
  };
}

const render = (data: OwnUseCalendarData) =>
  renderToStaticMarkup(createElement(OwnUseCalendar, { data }));
const rights = (data: OwnUseCalendarData) =>
  renderToStaticMarkup(createElement(OwnUseRights, { data }));

describe('telas de uso próprio (W12, spec booking §7)', () => {
  it('[ADR-0026] reservas fechadas: o calendário segue para consulta e não há confirmação a oferecer', () => {
    const open = render(coOwner());
    expect(open).toContain('Confirmar reserva');
    const closed = render(coOwner({ bookingOpen: false }));
    expect(closed).not.toContain('Confirmar reserva');
    expect(closed).toContain(
      'A confirmação abre quando a Luxtory habilitar as reservas de uso próprio.',
    );
    expect(closed).toContain('lx-calendar__table');
  });

  it('[REQ-034][TECH-052] Co-Owner: estados da grade vêm dos fatos do servidor; legenda mínima "Reserva desta Ação"', () => {
    const html = render(coOwner());
    expect(html).toContain('data-state="past"');
    expect(html).toContain('data-state="mine"');
    expect(html).toContain('data-state="unavailable"');
    expect(html).toContain('Reserva desta Ação');
    expect(html).not.toContain('Sua reserva');
    expect(html).toContain('Noite indisponível');
    expect(html).toContain(
      'aria-label="segunda-feira, 7 de fevereiro de 2028, Média/Baixa, reserva desta Ação"',
    );
    // Um único dia na ordem de Tab (tabindex móvel); dias sem ação continuam focáveis com aria-disabled.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('aria-disabled="true"');
  });

  it('[REQ-031][PD-004] 29/02 atribuído à Ação: losango e "29/02: noite adicional"; sem atribuição, nenhuma marca', () => {
    const attributed = render(coOwner());
    expect(attributed).toContain('lx-calendar__mark');
    expect(attributed).toContain('29/02: noite adicional');
    expect(attributed).toContain('noite adicional do Direito de Uso desta Ação');
    const other = render(
      coOwner({
        nights: coOwner().nights.map((n) => (n.isLeapDay ? { ...n, status: 'leap-other' } : n)),
        balances: coOwner().balances.filter((row) => row.bucket !== 'leap'),
      }),
    );
    expect(other).not.toContain('lx-calendar__mark');
    expect(other).not.toContain('29/02: noite adicional');
    expect(other).toContain('não atribuído a esta Ação em 2028');
  });

  it('[REQ-034][TECH-042] Direito de Uso compacto: saldo disponível, 29/02 adicional e a janela do exercício seguinte na nota', () => {
    const html = rights(coOwner());
    expect(html).toContain('Direito de Uso desta Ação em 2028');
    expect(html).toContain('41 disponíveis de 48 noites');
    expect(html).toContain('121 disponíveis de 128 noites');
    expect(html).toContain('29/02/2028');
    expect(html).toContain('1 noite adicional');
    expect(html).toContain('não desconta do saldo anual de Alta/Super Alta nem de Média/Baixa');
    expect(html).toContain('Janela de 2029: abre em 15/09/2028.');
    expect(html).toContain('Calendário aberto até 31/03/2028.');
    expect(html).not.toMatch(/extraordin/i);
  });

  it('[REQ-034][TECH-042] janela ainda fechada: a grade marca as noites e o bloco mostra quando abre', () => {
    const closed = coOwner({
      today: '2027-09-10',
      nights: days('2028-01-01', 40).map((date) => night(date, 'closed')),
      balances: [],
      windows: [
        {
          exerciseYear: 2028,
          isLeapDay: false,
          opensAt: '2027-09-22T03:00:00.000Z',
          opensOn: '2027-09-22',
          open: false,
        },
      ],
    });
    expect(render(closed)).toContain('data-state="closed"');
    expect(render(closed)).toContain('A janela de 2028 desta Ação abre em 22/09/2027.');
    expect(rights(closed)).toContain('Janela de 2028');
    expect(rights(closed)).toContain('abre em 22/09/2027');
  });

  it('[REQ-037][REQ-035] Owner: "Reserva do Owner", sem traço sazonal, sem 29/02 extraordinário e sem limite de noites', () => {
    const owner = coOwner({
      role: 'owner',
      balances: [],
      windows: [],
      nights: days('2028-02-01', 60).map((date) =>
        night(date, date === '2028-02-07' ? 'mine' : 'available'),
      ),
    });
    const html = render(owner);
    expect(html).toContain('Reserva do Owner');
    expect(html).not.toContain('data-season="alta"');
    expect(html).not.toContain('lx-calendar__mark');
    const block = rights(owner);
    expect(block).toContain('Uso próprio');
    expect(block).toContain('sem limite de noites seguidas');
    expect(block).not.toContain('Direito de Uso');
  });
});
