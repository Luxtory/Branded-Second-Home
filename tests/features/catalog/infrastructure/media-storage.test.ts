import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayWidths, mediaObjectKey } from '@/features/catalog/domain/collection';
import {
  localMediaStorage,
  MediaStorageError,
  selectMediaStorage,
  supabaseMediaStorage,
} from '@/features/catalog/infrastructure/media-storage';
import {
  ConfigurationMissingError,
  EnvironmentRestrictionError,
  EnvValidationError,
} from '@/features/platform';

// Armazenamento dos binários da mídia (ADR-0015): o banco guarda só referência e metadados.
const KEY = mediaObjectKey('homeConcept', 'a'.repeat(64));
const BYTES = new Uint8Array([1, 2, 3]);
const SUPABASE = {
  url: 'https://projeto.supabase.co',
  secretKey: 'sb_secret_teste_0000000000000000',
  bucket: 'catalog-media',
};

describe('armazenamento da mídia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('larguras de exibição: os passos menores e a própria largura até 1600 — nunca ampliar', () => {
    expect(displayWidths(720)).toEqual([480, 720]);
    expect(displayWidths(800)).toEqual([480, 800]);
    expect(displayWidths(1000)).toEqual([480, 800, 1000]);
    expect(displayWidths(4000)).toEqual([480, 800, 1200, 1600]);
  });

  it('[ADR-0015] Supabase Storage: grava com a chave secreta só no apikey, upsert e bucket privado; lê pelo caminho autenticado', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? new Response('{}') : new Response(BYTES),
    );
    vi.stubGlobal('fetch', fetchMock);
    const storage = supabaseMediaStorage(SUPABASE);
    await storage.put(KEY, BYTES, 'image/webp');
    await expect(storage.get(KEY)).resolves.toEqual(BYTES);
    const [putUrl, putInit] = fetchMock.mock.calls[0] ?? [];
    expect(putUrl).toBe(`${SUPABASE.url}/storage/v1/object/catalog-media/${KEY}`);
    expect(putInit?.headers).toMatchObject({
      apikey: SUPABASE.secretKey,
      'content-type': 'image/webp',
      'x-upsert': 'true',
    });
    expect(putInit?.headers).not.toHaveProperty('authorization');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${SUPABASE.url}/storage/v1/object/authenticated/catalog-media/${KEY}`,
    );
  });

  it('Supabase Storage: objeto inexistente (404, ou 400 com statusCode 404) → null; outra falha → erro sem detalhe', async () => {
    const storage = supabaseMediaStorage(SUPABASE);
    for (const response of [
      new Response('', { status: 404 }),
      Response.json({ statusCode: '404', error: 'not_found' }, { status: 400 }),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response),
      );
      await expect(storage.get(KEY)).resolves.toBeNull();
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('segredo do projeto', { status: 500 })),
    );
    const failure = storage.put(KEY, BYTES, 'image/webp');
    await expect(failure).rejects.toBeInstanceOf(MediaStorageError);
    await expect(storage.put(KEY, BYTES, 'image/webp')).rejects.not.toThrow(/segredo/);
  });

  it('só chaves geradas pelo command: caminho vindo de fora é recusado antes de qualquer acesso', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const storage = supabaseMediaStorage(SUPABASE);
    await expect(storage.get('../../outro-bucket/arquivo')).rejects.toThrow(
      /Invalid media object key/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('diretório local (desenvolvimento e CI): grava, lê e devolve null para o inexistente', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'luxtory-media-'));
    try {
      const storage = localMediaStorage(directory);
      await expect(storage.get(KEY)).resolves.toBeNull();
      await storage.put(KEY, BYTES, 'image/webp');
      await expect(storage.get(KEY)).resolves.toEqual(BYTES);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('[TECH-001] seleção pelo ambiente: local só fora da Vercel; Supabase só em Production e com a configuração completa', () => {
    expect(() => selectMediaStorage({ MEDIA_STORAGE: 'local' })).toThrow(ConfigurationMissingError);
    expect(
      selectMediaStorage({ MEDIA_STORAGE: 'local', MEDIA_LOCAL_DIR: '/tmp/midia' }),
    ).toBeDefined();
    expect(() => selectMediaStorage({ MEDIA_STORAGE: 'local', VERCEL_ENV: 'production' })).toThrow(
      EnvValidationError,
    );
    expect(() => selectMediaStorage({ VERCEL_ENV: 'preview' })).toThrow(
      EnvironmentRestrictionError,
    );
    expect(() => selectMediaStorage({ VERCEL_ENV: 'production' })).toThrow(
      ConfigurationMissingError,
    );
    expect(() =>
      selectMediaStorage({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE.url,
        SUPABASE_SECRET_KEY: 'eyJ-chave-legada',
        MEDIA_BUCKET: SUPABASE.bucket,
      }),
    ).toThrow(EnvValidationError);
    expect(
      selectMediaStorage({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE.url,
        SUPABASE_SECRET_KEY: SUPABASE.secretKey,
        MEDIA_BUCKET: SUPABASE.bucket,
      }),
    ).toBeDefined();
  });
});
