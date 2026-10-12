/** Lugares de fotografia da BP1.1 (D5, spec catalog §14.9): o ensaio próprio M1–M5. */
export type MediaSlot = 'm1' | 'm2' | 'm3' | 'm4' | 'm5';

/**
 * Fotografia de um lugar M1–M5: ativo do ensaio próprio (`P-BP-03`, em `public/images/brand-partners/`) ou, nesta
 * etapa, fotografia provisória já publicada pelo B2C, reutilizada no mesmo caminho (`D-BP-17`, spec catalog §14.9);
 * recorte `lx-crop-*`.
 */
export interface ApprovedPhoto {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly crop: string;
  /** Vazio quando a imagem é decorativa (Cinematic Hero). */
  readonly alt: string;
}

/**
 * Manifesto único da mídia Brand Partners. `null` = fotografia em produção → placeholder estrutural identificado,
 * renderizado dentro da página protegida pelo portão (nenhum arquivo público de placeholder). Aceite visual final e
 * go-live exigem todas as entradas aprovadas. `D-BP-17` (fundador, 2026-10-12): M1–M5 com as fotografias provisórias
 * do B2C (Luxtory2.0), sem as do anteprojeto Kaizen; todas decorativas, como no B2C.
 */
export const BRAND_PARTNERS_MEDIA: Readonly<Record<MediaSlot, ApprovedPhoto | null>> = {
  // A mesa posta → família reunida ao entardecer; sujeito à direita, área livre à esquerda para o texto.
  m1: {
    src: '/images/home/hero/hero-lifestyle.jpg',
    width: 1344,
    height: 768,
    crop: 'lx-crop-x-80 lx-crop-md-x-20',
    alt: '',
  },
  // Momentos → um momento em família, sem pose.
  m2: {
    src: '/images/home/hero/home-solucao-firepit-family.jpg',
    width: 1376,
    height: 768,
    crop: 'lx-crop-x-65',
    alt: '',
  },
  // Códigos → arquitetura, materiais e a relação com a paisagem.
  m3: {
    src: '/images/como-funciona/problema-imovel.jpg',
    width: 1024,
    height: 576,
    crop: 'lx-crop-x-35',
    alt: '',
  },
  // Ateliê → sem correspondente no B2C: a arquitetura ao entardecer.
  m4: {
    src: '/images/home/hero/luxury-property-facade-hero.jpg',
    width: 1672,
    height: 941,
    crop: 'lx-crop-x-65 lx-crop-lg-x-50',
    alt: '',
  },
  // Fim de tarde → terraço ao entardecer, casa iluminada.
  m5: {
    src: '/images/home/hero/luxury-property-facade-hero.jpg',
    width: 1672,
    height: 941,
    crop: 'lx-crop-x-65 lx-crop-lg-x-50',
    alt: '',
  },
};
