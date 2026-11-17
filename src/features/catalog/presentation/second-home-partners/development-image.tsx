'use client';

import { useEffect, useRef } from 'react';

interface DevelopmentImageProps {
  readonly src: string;
  readonly srcSet?: string;
  readonly sizes?: string;
  readonly alt: string;
  readonly originalSrc: string;
}

/** One same-origin recovery, including an optimizer error that happened before hydration. */
function recoverOriginal(image: HTMLImageElement, originalSrc: string) {
  if (image.getAttribute('src') === originalSrc) return;
  image.removeAttribute('srcset');
  image.removeAttribute('sizes');
  image.setAttribute('src', originalSrc);
}

/** Stage photographs start below the fold; request them early without competing with critical assets. */
export function DevelopmentImage({ src, srcSet, sizes, alt, originalSrc }: DevelopmentImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = ref.current;
    if (image?.complete && image.naturalWidth === 0) recoverOriginal(image, originalSrc);
  }, [originalSrc]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Optimized props come from getImageProps; no inline styles under the strict CSP.
    <img
      ref={ref}
      className="lx-development__image"
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      width={1448}
      height={1086}
      loading="eager"
      fetchPriority="low"
      decoding="async"
      onError={(event) => recoverOriginal(event.currentTarget, originalSrc)}
    />
  );
}
