import { readFileSync } from 'node:fs';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { TECH_090_JOBS } from '@/features/platform/application/jobs/names';

/**
 * Cadência dos jobs do ciclo da reserva no Vercel Hobby (spec booking §10.14; runbook): cada cron dispara 1×/dia em
 * qualquer minuto da hora marcada (doc oficial: `0 8 * * *` → entre 08:00:00 e 08:59:59), sem nova tentativa e com
 * entrega best effort. "Garantido" aqui é por desenho, supondo que a plataforma entregue o disparo.
 */
interface Cron {
  readonly path: string;
  readonly schedule: string;
}
const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Cron[] }).crons;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const hoursOf = (job: string): number[] =>
  crons
    .filter((cron) => cron.path === `/api/jobs/${job}`)
    .map((cron) => Number(cron.schedule.split(' ')[1]));

/** Instante (ms) das 14:00 / 10:00 locais do dia no fuso (TECH-040; check-in e check-out da noite). */
const local = (date: Temporal.PlainDate, time: string, zone: string): number =>
  date.toZonedDateTime({ timeZone: zone, plainTime: time }).toInstant().epochMilliseconds;

/** Algum disparo cai inteiro dentro de [início, fim): a hora marcada inteira cabe na janela. */
function guaranteedRun(hours: readonly number[], start: number, end: number): boolean {
  const firstDay = Math.floor(start / DAY_MS) * DAY_MS - DAY_MS;
  for (let day = firstDay; day <= end; day += DAY_MS)
    for (const hour of hours) {
      const slot = day + hour * HOUR_MS;
      if (slot >= start && slot + HOUR_MS <= end) return true;
    }
  return false;
}

/** Primeiro disparo possível que com certeza já passou de `at` (fim da hora marcada seguinte). */
function lastPossibleRunAfter(hours: readonly number[], at: number): number {
  const firstDay = Math.floor(at / DAY_MS) * DAY_MS - DAY_MS;
  const ends: number[] = [];
  for (let day = firstDay; day < at + 3 * DAY_MS; day += DAY_MS)
    for (const hour of hours) if (day + hour * HOUR_MS >= at) ends.push(day + (hour + 1) * HOUR_MS);
  return Math.min(...ends);
}

const ZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/New_York',
  'Europe/Lisbon',
  'Asia/Tokyo',
  'Pacific/Auckland',
];
const DAYS_2027 = Array.from({ length: 365 }, (_, i) =>
  Temporal.PlainDate.from('2027-01-01').add({ days: i }),
);

describe('cadência dos jobs do ciclo no Vercel Hobby (W13 E3)', () => {
  it('[TECH-090] crons diários, só para jobs do TECH-090 registrados no caminho /api/jobs/<job>', () => {
    for (const cron of crons) {
      expect(cron.schedule, cron.path).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
      expect(TECH_090_JOBS as readonly string[]).toContain(cron.path.replace('/api/jobs/', ''));
    }
    expect(hoursOf('advance_booking_states')).toEqual([17]);
    expect(hoursOf('flag_no_show_candidates').sort((a, b) => a - b)).toEqual([5, 17]);
  });

  it('[TECH-046][spec booking §10.14] candidatos 2×/dia: toda janela de 1 noite tem disparo garantido em Brasília, Manaus, Nova York (com horário de verão) e outros fusos, o ano inteiro', () => {
    const hours = hoursOf('flag_no_show_candidates');
    for (const zone of ZONES)
      for (const day of DAYS_2027) {
        const start = local(day, '14:00', zone);
        const end = local(day.add({ days: 1 }), '10:00', zone);
        expect(end - start, `${zone} ${day.toString()}`).toBeGreaterThanOrEqual(19 * HOUR_MS);
        expect(guaranteedRun(hours, start, end), `${zone} ${day.toString()}`).toBe(true);
      }
  });

  it('[spec booking §10.14] limite conhecido: um único disparo às 17 UTC perderia a janela de 1 noite em Manaus', () => {
    const missed = DAYS_2027.filter(
      (day) =>
        !guaranteedRun(
          [17],
          local(day, '14:00', 'America/Manaus'),
          local(day.add({ days: 1 }), '10:00', 'America/Manaus'),
        ),
    );
    expect(missed).toHaveLength(DAYS_2027.length);
  });

  it('[TECH-055][spec booking §10.14] avanço 1×/dia às 17 UTC: em Brasília no mesmo dia do check-in e do check-out; em Manaus e Nova York pode sair no dia seguinte (só exibição)', () => {
    const hours = hoursOf('advance_booking_states');
    const lag = (zone: string, day: Temporal.PlainDate, time: string) =>
      lastPossibleRunAfter(hours, local(day, time, zone)) - local(day, time, zone);
    for (const day of DAYS_2027) {
      expect(lag('America/Sao_Paulo', day, '14:00')).toBeLessThanOrEqual(HOUR_MS);
      expect(lag('America/Sao_Paulo', day, '10:00')).toBeLessThanOrEqual(8 * HOUR_MS);
      expect(lag('America/Manaus', day, '14:00')).toBeGreaterThan(20 * HOUR_MS);
    }
    expect(
      Math.max(...DAYS_2027.map((day) => lag('America/New_York', day, '14:00'))),
    ).toBeGreaterThan(DAY_MS / 2);
  });
});
