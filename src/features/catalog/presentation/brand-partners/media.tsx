import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';

/** Lugares de fotografia da BP1.1 (D5, spec catalog §14.9): o ensaio próprio M1–M5. */
export type MediaSlot = 'm1' | 'm2' | 'm3' | 'm4' | 'm5';

/** Fotografia aprovada (`P-BP-03`): arquivo em `public/images/brand-partners/`, recorte `lx-crop-*`. */
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
 * go-live exigem todas as entradas aprovadas.
 */
export const BRAND_PARTNERS_MEDIA: Readonly<Record<MediaSlot, ApprovedPhoto | null>> = {
  m1: null,
  m2: null,
  m3: null,
  m4: null,
  m5: null,
};

function Placeholder({ slot }: { readonly slot: MediaSlot }) {
  return (
    <div className="lx-media-placeholder" data-media-placeholder={slot}>
      <span className="lx-media-placeholder__label">{text.media.placeholders[slot]}</span>
    </div>
  );
}

/** Fotografia de um Cinematic Hero (decorativa, sob o scrim do Core) ou o seu placeholder. */
export function HeroMedia({
  slot,
  priority = false,
}: {
  readonly slot: MediaSlot;
  readonly priority?: boolean;
}) {
  const photo = BRAND_PARTNERS_MEDIA[slot];
  return (
    <div className="lx-hero__slides" aria-hidden="true">
      <div className="lx-hero__slide" data-active="">
        {photo === null ? (
          <Placeholder slot={slot} />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */
          <img
            className={`lx-hero__image ${photo.crop}`}
            src={photo.src}
            alt=""
            width={photo.width}
            height={photo.height}
            fetchPriority={priority ? 'high' : undefined}
            loading={priority ? undefined : 'lazy'}
          />
        )}
      </div>
    </div>
  );
}

/** Fotografia de um Editorial Split ou o seu placeholder (o placeholder não é conteúdo: fora da árvore acessível). */
export function SplitMedia({ slot }: { readonly slot: MediaSlot }) {
  const photo = BRAND_PARTNERS_MEDIA[slot];
  if (photo === null) {
    return (
      <figure className="lx-media lx-split__media" aria-hidden="true">
        <Placeholder slot={slot} />
      </figure>
    );
  }
  return (
    <figure className="lx-media lx-split__media">
      {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */}
      <img
        className={photo.crop}
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
      />
    </figure>
  );
}
