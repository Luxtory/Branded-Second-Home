import type { PublicCover } from './collection-views';
import type { PublicHomeEditionMedia } from './public-views';

/** A imagem principal da Home Edition: a primeira imagem ou render aprovado (plantas não abrem card nem página). */
export function mainImage(media: readonly PublicHomeEditionMedia[]): PublicCover | null {
  const found = media.find((item) => item.kind !== 'floor_plan');
  if (found === undefined) return null;
  return {
    mediaId: found.mediaId,
    alt: found.alt,
    credit: found.credit,
    cropX: found.cropX,
    cropY: found.cropY,
    widths: found.widths,
  };
}
