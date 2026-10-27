import { describe, expect, it } from 'vitest';
import { validateE2eAcquisitionDatabase } from '../../../support/e2e-acquisition-database.mjs';
const local = 'postgres://postgres@127.0.0.1:5555/luxtory_e2e';
describe('W8 disposable E2E runbook fixture isolation', () => {
  it('accepts only the exact embedded database on a loopback port', () => {
    expect(validateE2eAcquisitionDatabase(local, {})).toBe(local);
    expect(validateE2eAcquisitionDatabase(`${local}?sslmode=disable`, {})).toBe(
      `${local}?sslmode=disable`,
    );
  });
  it.each([
    'postgres://postgres@db.example:5555/luxtory_e2e',
    'postgres://postgres@127.0.0.1:5555/production',
    'postgres://app@127.0.0.1:5555/luxtory_e2e',
    'postgres://postgres@127.0.0.1/luxtory_e2e',
    'postgres://postgres@localhost:5555/luxtory_e2e',
    'postgres://postgres@127.0.0.1:5555/luxtory_e2e?host=db.example',
    'https://127.0.0.1:5555/luxtory_e2e',
  ])('refuses %s', (url) => {
    expect(() => validateE2eAcquisitionDatabase(url, {})).toThrow();
  });
  it.each([{ VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production' }])(
    'refuses every deployed context %j',
    (source) => {
      expect(() => validateE2eAcquisitionDatabase(local, source)).toThrow();
    },
  );
});
