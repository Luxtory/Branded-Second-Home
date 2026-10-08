import { createHash } from 'node:crypto';
import sharp, { type ResizeOptions } from 'sharp';
import type { CoverImageProcessor, ProcessedImage, ProcessedRendition } from '../application/ports';
import {
  COVER_MIN_HEIGHT,
  COVER_MIN_WIDTH,
  displayWidths,
  MASTER_MAX_LONG_SIDE,
} from '../domain/collection';

/**
 * Reencode da capa com `sharp` (ADR-0015). O formato vem do conteúdo decodificado, nunca da extensão nem do MIME
 * declarado: só JPEG, PNG e WebP. A orientação do EXIF é aplicada antes de tudo; nenhuma saída leva metadado (EXIF,
 * localização, câmera, autoria — o `sharp` só copia quando pedido; o crédito fica no banco). Nada é ampliado: o master
 * guarda até 4096 px no lado maior e as larguras de exibição param na largura da imagem.
 */
const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp']);
/** Guarda contra "bomba de descompressão" e fotos fora do uso: 40 megapixels. */
export const MAX_INPUT_PIXELS = 40_000_000;
/** Lado máximo aceito no arquivo recebido. */
const MAX_INPUT_SIDE = 12_000;
const MASTER_QUALITY = 90;
const DISPLAY_QUALITY = 80;
/** Orientações EXIF 5–8 giram 90°: largura e altura trocam depois de orientar. */
const FIRST_ROTATED_ORIENTATION = 5;

const decoder = (bytes: Buffer) =>
  sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate();

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function orientedSize(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  const meta = await sharp(bytes, {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: 'error',
  }).metadata();
  if (meta.format === undefined || !ACCEPTED_FORMATS.has(meta.format)) return null;
  const { width, height } = meta;
  if (width === undefined || height === undefined) return null;
  if (Math.max(width, height) > MAX_INPUT_SIDE) return null;
  return (meta.orientation ?? 1) >= FIRST_ROTATED_ORIENTATION
    ? { width: height, height: width }
    : { width, height };
}

async function encode(
  bytes: Buffer,
  role: ProcessedRendition['role'],
  resize: ResizeOptions,
  quality: number,
): Promise<ProcessedRendition> {
  const { data, info } = await decoder(bytes)
    .resize({ ...resize, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  const output = new Uint8Array(data);
  return {
    role,
    width: info.width,
    height: info.height,
    contentType: 'image/webp',
    bytes: output,
    sha256: sha256(output),
  };
}

export const sharpCoverProcessor: CoverImageProcessor = {
  async process(imageBase64) {
    const bytes = Buffer.from(imageBase64, 'base64');
    let size: { width: number; height: number } | null;
    try {
      size = await orientedSize(bytes);
    } catch {
      // Conteúdo que o decodificador não lê (corrompido, outro formato, acima do limite de pixels): recusa funcional.
      return null;
    }
    if (size === null || size.width < COVER_MIN_WIDTH || size.height < COVER_MIN_HEIGHT) {
      return null;
    }
    const master = await encode(
      bytes,
      'master',
      { width: MASTER_MAX_LONG_SIDE, height: MASTER_MAX_LONG_SIDE, fit: 'inside' },
      MASTER_QUALITY,
    );
    const display = await Promise.all(
      displayWidths(size.width).map((width) =>
        encode(bytes, 'display', { width }, DISPLAY_QUALITY),
      ),
    );
    const result: ProcessedImage = {
      sourceSha256: sha256(bytes),
      renditions: [master, ...display],
    };
    return result;
  },
};
