import type { MediaPreview } from '../application/views';
import { runtimeMediaStorage } from '../infrastructure/media-storage';

/** Pré-visualização de uma mídia no Admin (capa do Home Concept ou mídia da Home Edition, em qualquer estado). */
export interface Preview {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Bytes do Storage, fora da transação da leitura; a CSP admite `img-src data:` — nenhuma rota nem URL pública para
 * mídia pendente ou retirada (ADR-0015).
 */
export async function previewOf(rendition: MediaPreview | null): Promise<Preview | null> {
  if (rendition === null) return null;
  const bytes = await runtimeMediaStorage.get(rendition.storageKey);
  if (bytes === null) return null;
  return {
    src: `data:${rendition.contentType};base64,${Buffer.from(bytes).toString('base64')}`,
    width: rendition.width,
    height: rendition.height,
  };
}
