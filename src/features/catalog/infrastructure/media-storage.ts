import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  EnvironmentRestrictionError,
  loadEnv,
  loadRuntimeConfig,
  type EnvSource,
} from '@/features/platform';
import type { MediaStorage } from '../application/ports';
import { MEDIA_OBJECT_KEY } from '../domain/collection';

/**
 * Armazenamento dos binários da mídia (ADR-0015): Supabase Storage privado em Production; diretório local só em
 * desenvolvimento e na CI (`MEDIA_STORAGE=local`, recusado na Vercel). O banco guarda só a chave e os metadados.
 */
const REQUEST_TIMEOUT_MS = 15_000;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const IMMUTABLE_SECONDS = 31_536_000;

/** Falha do Storage sem detalhe da resposta (pode trazer dados do projeto): só a operação e o status. */
export class MediaStorageError extends Error {
  constructor(
    readonly operation: 'put' | 'get',
    readonly status: number,
  ) {
    super(`Media storage ${operation} failed with status ${status}`);
    this.name = 'MediaStorageError';
  }
}

/** Só chaves geradas pelo command (`concept-media/<sha256>.webp`): nunca um caminho vindo de fora. */
function assertKey(key: string): void {
  if (!MEDIA_OBJECT_KEY.test(key)) throw new Error('Invalid media object key');
}

export function supabaseMediaStorage(config: {
  readonly url: string;
  readonly secretKey: string;
  readonly bucket: string;
}): MediaStorage {
  const object = (path: string, key: string) =>
    `${config.url.replace(/\/$/, '')}/storage/v1/object/${path}${config.bucket}/${key}`;
  // Chave secreta nova (`sb_secret_…`) só no cabeçalho `apikey`: o gateway emite o token de serviço.
  const headers = { apikey: config.secretKey };
  return {
    async put(key, bytes, contentType) {
      assertKey(key);
      const response = await fetch(object('', key), {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': contentType,
          'cache-control': `max-age=${IMMUTABLE_SECONDS}`,
          'x-upsert': 'true',
        },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new MediaStorageError('put', response.status);
    },
    async get(key) {
      assertKey(key);
      const response = await fetch(object('authenticated/', key), {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      // O Storage responde 400 com `statusCode: "404"` para objeto inexistente em algumas versões.
      if (response.status === HTTP_NOT_FOUND) return null;
      if (response.status === HTTP_BAD_REQUEST) {
        const body = (await response.json().catch(() => null)) as { statusCode?: unknown } | null;
        if (String(body?.statusCode) === String(HTTP_NOT_FOUND)) return null;
      }
      throw new MediaStorageError('get', response.status);
    },
  };
}

export function localMediaStorage(directory: string): MediaStorage {
  const path = (key: string) => {
    assertKey(key);
    return join(directory, key);
  };
  return {
    async put(key, bytes) {
      const target = path(key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(path(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}

/** Escolhe o adaptador pelo ambiente; configuração ausente bloqueia a função com erro explícito (TECH-001). */
export function selectMediaStorage(source: EnvSource = process.env): MediaStorage {
  const { MEDIA_STORAGE, VERCEL_ENV } = loadEnv(source);
  if (MEDIA_STORAGE === 'local') {
    return localMediaStorage(loadRuntimeConfig(['MEDIA_LOCAL_DIR'], source).MEDIA_LOCAL_DIR);
  }
  if (VERCEL_ENV !== undefined && VERCEL_ENV !== 'production') {
    throw new EnvironmentRestrictionError('Supabase Storage', VERCEL_ENV);
  }
  const config = loadRuntimeConfig(
    ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'MEDIA_BUCKET'],
    source,
  );
  return supabaseMediaStorage({
    url: config.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: config.SUPABASE_SECRET_KEY,
    bucket: config.MEDIA_BUCKET,
  });
}

/** Adaptador resolvido na primeira operação (o build e as telas sem mídia não dependem da configuração). */
export const runtimeMediaStorage: MediaStorage = {
  put: (key, bytes, contentType) => selectMediaStorage().put(key, bytes, contentType),
  get: (key) => selectMediaStorage().get(key),
};
