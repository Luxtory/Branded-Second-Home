import { headers } from 'next/headers';
import {
  getDatabase,
  resolveCorrelationId,
  rootLogger,
  unavailableKeys,
  withPublicRead,
  type DatabaseTransaction,
} from '@/features/platform';

export type PublicRead<T> =
  { readonly status: 'ok'; readonly value: T } | { readonly status: 'unavailable' };

/**
 * Leitura do Discovery como `anon` (ADR-0012), por requisição e sem cache (D-W4-07). Banco recusado no ambiente
 * (Preview, ADR-0007) ou configuração ausente → estado indisponível, com log estruturado só das chaves; qualquer outro
 * erro segue para a página de erro.
 */
export async function readPublicCatalog<T>(
  read: (tx: DatabaseTransaction) => Promise<T>,
): Promise<PublicRead<T>> {
  try {
    return { status: 'ok', value: await withPublicRead(getDatabase(), read) };
  } catch (error) {
    const keys = unavailableKeys(error);
    if (keys === null) throw error;
    rootLogger
      .child({ correlation_id: resolveCorrelationId(await headers()) })
      .warn('public catalog unavailable', { keys });
    return { status: 'unavailable' };
  }
}
