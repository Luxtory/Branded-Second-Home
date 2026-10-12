import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { BRAND_PARTNERS_MEDIA, type MediaSlot } from './media-manifest';

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
            data-media-slot={slot}
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
        data-media-slot={slot}
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
      />
    </figure>
  );
}
