import { headers } from 'next/headers';
import {
  getDatabase,
  resolveCorrelationId,
  rootLogger,
  unavailableKeys,
  withPublicRead,
  type DatabaseTransaction,
} from '@/features/platform';
import type { PublicAvailability } from '../../application/public-views';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';

export type PublicRead<T> =
  { readonly status: 'ok'; readonly value: T } | { readonly status: 'unavailable' };

async function log() {
  return rootLogger.child({ correlation_id: resolveCorrelationId(await headers()) });
}

/**
 * Leitura do Discovery como `anon` (ADR-0014), por requisição e sem cache (spec catalog §13.1). Banco recusado no
 * ambiente (Preview, ADR-0007) ou configuração ausente → estado indisponível, com log estruturado só das chaves;
 * qualquer outro erro segue para a página de erro.
 */
export async function readPublicCatalog<T>(
  read: (tx: DatabaseTransaction) => Promise<T>,
): Promise<PublicRead<T>> {
  try {
    return { status: 'ok', value: await withPublicRead(getDatabase(), read) };
  } catch (error) {
    const keys = unavailableKeys(error);
    if (keys === null) throw error;
    (await log()).warn('public catalog unavailable', { keys });
    return { status: 'unavailable' };
  }
}

/**
 * Disponibilidade para o CTA da Home e do Como funciona (D-B2C-16). As duas páginas não dependem do catálogo: qualquer
 * falha de leitura vira estado desconhecido (`null`) com log estruturado — nunca "sem Home Edition" nem "sem Home Concept"
 * (ADR-0014 §5).
 */
export async function readAvailability(): Promise<PublicAvailability | null> {
  try {
    return await withPublicRead(getDatabase(), (tx) => reader.availability(tx));
  } catch (error) {
    const keys = unavailableKeys(error);
    if (keys !== null) {
      (await log()).warn('public catalog unavailable', { keys });
    } else {
      // Só o tipo e o código do erro: a mensagem do driver pode trazer detalhes de conexão.
      (await log()).error('public catalog availability failed', {
        error_name: error instanceof Error ? error.name : typeof error,
        code:
          typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined,
      });
    }
    return null;
  }
}
