import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

describe('imagens fornecidas para empreendimentos parceiros (REQ-105, catalog §20.2)', () => {
  // SHA-256 dos pixels RGB dos PNG originais fornecidos no ZIP, antes da conversão WebP sem perda.
  for (const [file, pixelHash] of [
    [
      'second-home-condominio-sob-demanda.webp',
      '113f6dec4d5f21479d2c01c396d085b2c85ab68992cf9ca56662d914aa45fdd1',
    ],
    [
      'empreendimento-em-desenvolvimento.webp',
      'd0d0f83256c876b9627b0f8b18ebe811687154462683c55eadfb5e4ab927eb1e',
    ],
    [
      'empreendimento-entregue.webp',
      'a01e9b97852d4b59a4b3df046c23cb6c888bae1a4c04b487b17c124fd98d4169',
    ],
  ] as const) {
    it(`${file}: WebP 1448 × 1086 com os mesmos pixels do original fornecido`, async () => {
      const path = `public/images/second-home-partners/${file}`;
      const metadata = await sharp(path).metadata();
      expect(metadata).toMatchObject({ format: 'webp', width: 1448, height: 1086 });
      expect(
        createHash('sha256')
          .update(await sharp(path).raw().toBuffer())
          .digest('hex'),
      ).toBe(pixelHash);
    });
  }
});
