import type { MediaStorage } from '@/features/catalog/application/ports';

/** Storage em memória para os testes (o adaptador real é provado à parte): guarda o que os commands gravam. */
export function memoryMediaStorage(): MediaStorage & { readonly objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, bytes) {
      objects.set(key, new Uint8Array(bytes));
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
  };
}
