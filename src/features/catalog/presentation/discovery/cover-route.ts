import { z } from 'zod';
import {
  errorResponse,
  getDatabase,
  isPublicSiteOpen,
  unavailableKeys,
  withPublicRead,
  withRoute,
  type Database,
  type DatabaseTransaction,
  type RouteContext,
} from '@/features/platform';
import type { MediaStorage } from '../../application/ports';
import { DISPLAY_WIDTHS } from '../../domain/collection';
import { MediaStorageError, runtimeMediaStorage } from '../../infrastructure/media-storage';
import { postgresPublicCollectionReader } from '../../infrastructure/postgres-public-collection-reader';

/**
 * GET /media/concept-covers/{id}/{width} (OpenAPI `getConceptCover`, ADR-0015): uma largura de exibição da capa
 * aprovada de Concept público. A visibilidade vem da RLS (`anon`); o objeto, do Storage privado. Qualquer outra →
 * 404 sem motivo. O conteúdo de um id e largura nunca muda (ETag forte); `no-cache` faz o navegador revalidar a cada
 * uso — a revalidação só consulta o banco — e a retirada vale na próxima requisição (ADR-0014 §8).
 */
const CACHE_CONTROL = 'public, no-cache';
const HTTP_NOT_MODIFIED = 304;
const mediaId = z.uuid();
const MAX_WIDTH = DISPLAY_WIDTHS[DISPLAY_WIDTHS.length - 1] ?? 0;

export interface CoverRouteParams {
  readonly params: Promise<{ id: string; width: string }>;
}

export interface CoverRouteDependencies {
  readonly database?: () => Database;
  readonly storage?: MediaStorage;
  readonly isOpen?: () => boolean;
}

/** Largura da URL: inteiro positivo até a maior largura de exibição; o resto é 404 sem consulta. */
function widthOf(value: string): number | null {
  if (!/^\d{1,4}$/.test(value)) return null;
  const width = Number(value);
  return width >= 1 && width <= MAX_WIDTH ? width : null;
}

/** `If-None-Match` com a ETag (ou `*`), em lista ou fraca (`W/`), como o navegador envia. */
function matches(header: string | null, etag: string): boolean {
  if (header === null) return false;
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .some((tag) => tag === etag || tag === '*');
}

const UNAVAILABLE = Symbol('unavailable');

export function createCoverRoute({
  database = getDatabase,
  storage = runtimeMediaStorage,
  isOpen = isPublicSiteOpen,
}: CoverRouteDependencies = {}) {
  const reader = postgresPublicCollectionReader;

  /** Configuração ausente, serviço recusado no ambiente ou Storage fora → indisponível (TECH-001). */
  async function guarded<T>(
    log: RouteContext['log'],
    run: () => Promise<T>,
  ): Promise<T | typeof UNAVAILABLE> {
    try {
      return await run();
    } catch (error) {
      const keys = unavailableKeys(error);
      if (keys !== null) {
        log.warn('public media unavailable', { keys });
        return UNAVAILABLE;
      }
      if (error instanceof MediaStorageError) {
        log.error('media storage failed', { operation: error.operation, status: error.status });
        return UNAVAILABLE;
      }
      throw error;
    }
  }

  return async (
    request: Request,
    { correlationId, log }: RouteContext,
    route: CoverRouteParams,
  ) => {
    const params = await route.params;
    const width = widthOf(params.width);
    if (!isOpen() || !mediaId.safeParse(params.id).success || width === null) {
      return errorResponse('ERR_NOT_FOUND', correlationId);
    }
    const read = (tx: DatabaseTransaction) => reader.coverRendition(tx, params.id, width);
    const rendition = await guarded(log, () => withPublicRead(database(), read));
    if (rendition === UNAVAILABLE) return errorResponse('ERR_UNAVAILABLE', correlationId);
    if (rendition === null) return errorResponse('ERR_NOT_FOUND', correlationId);
    const etag = `"${params.id}-${width}"`;
    const headers = { etag, 'cache-control': CACHE_CONTROL };
    if (matches(request.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: HTTP_NOT_MODIFIED, headers });
    }
    const bytes = await guarded(log, () => storage.get(rendition.storageKey));
    if (bytes === UNAVAILABLE) return errorResponse('ERR_UNAVAILABLE', correlationId);
    if (bytes === null) {
      // Referência no banco sem objeto no Storage: falha operacional, nunca detalhada ao visitante.
      log.error('media object missing', { media_id: params.id, width });
      return errorResponse('ERR_NOT_FOUND', correlationId);
    }
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, 'content-type': rendition.contentType },
    });
  };
}

export const getConceptCover = withRoute(createCoverRoute());
