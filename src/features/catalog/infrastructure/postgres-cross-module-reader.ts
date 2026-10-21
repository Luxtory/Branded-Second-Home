import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { PublicHomeEditionTarget } from '../application/public-views';
import type { HomeEditionLabel, ProjectedInvestmentReference } from '../application/views';

/**
 * Consultas do catálogo servidas a outros módulos pela superfície pública (`index.ts`, TECH-011): nenhum outro slice lê
 * as tabelas do catálogo diretamente.
 */
type Tx = DatabaseTransaction;

/**
 * Home Edition pública, dentro de `withPublicRead` (como `anon`): a RLS só entrega Home Edition visível de Home Concept
 * público (ADR-0014) — nenhuma regra de visibilidade repetida aqui. Em preparação, fora do público ou inexistente → `null`.
 */
export async function readPublicHomeEditionTarget(
  tx: Tx,
  homeEditionId: string,
): Promise<PublicHomeEditionTarget | null> {
  const row = await tx
    .selectFrom('app.home_edition')
    .select(['id', 'home_concept_id'])
    .where('id', '=', homeEditionId)
    .executeTakeFirst();
  return row === undefined ? null : { homeEditionId: row.id, homeConceptId: row.home_concept_id };
}

/**
 * Nome da Home Edition, título do Home Concept e marca, lidos como `luxtory_app` na transação da leitura do Admin
 * (ADR-0010 §7).
 */
export async function readHomeEditionLabels(
  tx: Tx,
  homeEditionIds: readonly string[],
): Promise<ReadonlyMap<string, HomeEditionLabel>> {
  if (homeEditionIds.length === 0) return new Map();
  const rows = await tx
    .selectFrom('app.home_edition as home_edition')
    .innerJoin(
      'app.home_concept as home_concept',
      'home_concept.id',
      'home_edition.home_concept_id',
    )
    .innerJoin('app.brand_partner as partner', 'partner.id', 'home_concept.brand_partner_id')
    .select(['home_edition.id', 'home_edition.name', 'home_concept.title', 'partner.brand_name'])
    .where('home_edition.id', 'in', [...homeEditionIds])
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      { homeEditionName: row.name, homeConceptTitle: row.title, brandName: row.brand_name },
    ]),
  );
}

/** O papel do chamador não pôde ser lido antes da leitura pública — a transação é desfeita. */
class PublicReadRoleError extends Error {
  constructor() {
    super('current_user could not be read before the public read of the home edition');
    this.name = 'PublicReadRoleError';
  }
}

/**
 * Revalidação da Home Edition pública **dentro da transação do chamador** (W6, `02` §15 item 15; ADR-0018 §6). Primeiro
 * trava a linha como `luxtory_app` (`FOR SHARE`, possível pelo `UPDATE` de coluna do papel): uma retirada concorrente
 * espera o fim da transação ou já foi confirmada antes. Depois lê a visibilidade **pela própria RLS pública** (como
 * `anon`, ADR-0014), sem repetir a regra, e volta ao papel do chamador para o resto da transação. Em preparação, fora do
 * público, de Home Concept não público ou inexistente → `null`.
 */
export async function lockPublicHomeEdition(
  tx: Tx,
  homeEditionId: string,
): Promise<PublicHomeEditionTarget | null> {
  const locked = await tx
    .selectFrom('app.home_edition')
    .select('id')
    .where('id', '=', homeEditionId)
    .forShare()
    .executeTakeFirst();
  if (locked === undefined) return null;
  // Volta exatamente ao papel do chamador (nunca ao usuário da sessão, que poderia ter mais privilégio). Uma falha aqui
  // aborta a transação, e o rollback desfaz também a troca de papel.
  const { rows } = await sql<{ role: string }>`SELECT current_user AS role`.execute(tx);
  const caller = rows[0]?.role;
  if (caller === undefined) throw new PublicReadRoleError();
  await sql`SET LOCAL ROLE anon`.execute(tx);
  const target = await readPublicHomeEditionTarget(tx, homeEditionId);
  await sql`SET LOCAL ROLE ${sql.id(caller)}`.execute(tx);
  return target;
}

/** Médias projetadas apresentadas, pelo id do registro (histórico imutável, W4.2), na transação do `admin_read`. */
export async function readProjectedInvestmentReferences(
  tx: Tx,
  ids: readonly string[],
): Promise<ReadonlyMap<string, ProjectedInvestmentReference>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .selectFrom('app.home_edition_projected_investment')
    .select(['id', 'home_edition_id', 'amount_minor', 'currency'])
    .where('id', 'in', [...ids])
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        homeEditionId: row.home_edition_id,
        // `bigint` chega como texto do driver; nunca passa por ponto flutuante (TECH-033).
        amountMinor: BigInt(row.amount_minor),
        currency: row.currency,
      },
    ]),
  );
}
