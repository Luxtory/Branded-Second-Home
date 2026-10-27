import type { DatabaseTransaction } from '@/features/platform';
/** Stable party references only: no document ciphertext, digest, decryption or personal data crosses the seam. */
export async function readPartyReference(
  tx: DatabaseTransaction,
  id: string,
): Promise<{ readonly id: string; readonly documentType: 'cpf' | 'cnpj' } | null> {
  const row = await tx
    .selectFrom('app.party')
    .select(['id', 'document_type'])
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) return null;
  if (row.document_type !== 'cpf' && row.document_type !== 'cnpj')
    throw new Error('Invalid party document type');
  return { id: row.id, documentType: row.document_type };
}
