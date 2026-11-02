// Disposable local/CI runbook fixture only. Never reads DATABASE_URL or contacts a deployed database.
import { readFileSync } from 'node:fs';
import { withClient } from '../../scripts/lib/pg.mjs';
export const E2E_ACQUISITION_DATABASE_FILE = 'reports/e2e-acquisition-db.json';

/** @param {unknown} value @param {Readonly<Record<string, string | undefined>>} [source] */
export function validateE2eAcquisitionDatabase(value, source = process.env) {
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  if (typeof value !== 'string') throw new Error('Missing disposable E2E database');
  const url = new URL(value);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new Error('Invalid E2E database protocol');
  if (
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/luxtory_e2e' ||
    !url.port ||
    url.username !== 'postgres' ||
    !['', '?sslmode=disable'].includes(url.search)
  )
    throw new Error('Refusing non-disposable E2E database');
  return url.toString();
}

/** Existing W7 API creates a valid encrypted synthetic party first. This invokes the owner-only runbook locally. */
export async function registerE2eInstitution(partyId) {
  const source = process.env;
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  if (!/^[0-9a-f-]{36}$/i.test(partyId)) throw new Error('Invalid fixture party id');
  const config = JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8'));
  const url = validateE2eAcquisitionDatabase(config.ownerUrl);
  await withClient(url, (client) =>
    client.query('SELECT app.register_luxtory_legal_identity($1,$2)', [
      partyId,
      'Synthetic W8 E2E institutional act',
    ]),
  );
}

/**
 * A identidade jurídica da Luxtory é única no ambiente: o primeiro spec a chegar a registra com a sua party e os demais
 * recebem essa mesma party (corrida entre workers resolvida pela chave primária). Use a party devolvida.
 */
export async function ensureE2eInstitution(partyId) {
  const source = process.env;
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  if (!/^[0-9a-f-]{36}$/i.test(partyId)) throw new Error('Invalid fixture party id');
  const config = JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8'));
  const url = validateE2eAcquisitionDatabase(config.ownerUrl);
  return withClient(url, async (client) => {
    try {
      await client.query('SELECT app.register_luxtory_legal_identity($1,$2)', [
        partyId,
        'Synthetic W8 E2E institutional act',
      ]);
      return partyId;
    } catch (error) {
      if (error?.code !== '23505') throw error;
    }
    const { rows } = await client.query('SELECT party_id FROM app.luxtory_legal_identity');
    return rows[0].party_id;
  });
}

/**
 * Ativação das reservas de uso próprio (ADR-0026) só no banco descartável do E2E: liga para provar a confirmação na
 * interface real e desliga em seguida. Nunca em Production (a validação recusa qualquer banco não descartável).
 */
export async function setE2eOwnUseBooking(open) {
  const source = process.env;
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  const config = JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8'));
  const url = validateE2eAcquisitionDatabase(config.ownerUrl);
  await withClient(url, (client) =>
    client.query(
      open
        ? `INSERT INTO app.capability_activation VALUES ('own_use_booking', now(), 'e2e:fixture')
           ON CONFLICT DO NOTHING`
        : `DELETE FROM app.capability_activation WHERE capability = 'own_use_booking'`,
    ),
  );
}
