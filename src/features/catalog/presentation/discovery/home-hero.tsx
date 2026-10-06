'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/design-system/react/icons';
import type { Headline } from '../i18n/discovery-pt-br';

/**
 * Fotografias do Hero: cada uma é uma classe `lx-home-hero__image--N` (URL e recorte no CSS — a CSP bloqueia `style`).
 * Revisão do fundador (2026-10-06): a composição da W4 aprovada, com a fachada ao entardecer. Com duas ou mais fotos, o
 * carrossel e os controles voltam sozinhos.
 */
const SLIDES = ['lx-home-hero__image--1'] as const;
const IS_CAROUSEL = SLIDES.length > 1;
const INTERVAL_MS = 8000;

export interface CarouselLabels {
  readonly description: string;
  readonly controls: string;
  readonly previous: string;
  readonly next: string;
  readonly pause: string;
  readonly play: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

function prefersReducedMotion() {
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.getAttribute('data-motion') === 'reduce'
  );
}

/**
 * Hero da Home (PICTURE): a composição da W4 aprovada — fotografia em toda a viewport com scrim sobre a imagem inteira,
 * headline em duas linhas a partir do `md` (a virada e a quebra antes de "em lugares…") e o subtítulo ao lado do único
 * convite, que desce para a renúncia.
 */
export function HomeHero({
  id,
  titleId,
  title,
  text,
  action,
  nextSectionId,
  labels,
}: {
  readonly id: string;
  readonly titleId: string;
  readonly title: Headline;
  readonly text: string;
  readonly action: string;
  readonly nextSectionId: string;
  readonly labels: CarouselLabels;
}) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!IS_CAROUSEL) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPlaying(!prefersReducedMotion());
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!IS_CAROUSEL || !playing) return;
    const timer = window.setInterval(
      () => setCurrent((index) => (index + 1) % SLIDES.length),
      INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  const show = (step: number) =>
    setCurrent((index) => (index + step + SLIDES.length) % SLIDES.length);

  return (
    <section
      id={id}
      className="lx-home-hero"
      data-ground="night"
      aria-labelledby={titleId}
      aria-roledescription={IS_CAROUSEL ? labels.description : undefined}
    >
      <div className="lx-home-hero__slides" aria-hidden="true">
        {SLIDES.map((image, index) => (
          <div
            className={
              index === current
                ? 'lx-home-hero__slide lx-home-hero__slide--active'
                : 'lx-home-hero__slide'
            }
            key={image}
          >
            <div className={`lx-home-hero__image ${image}`} />
          </div>
        ))}
        <div className="lx-home-hero__scrim" />
      </div>

      <div className="lx-container lx-home-hero__content">
        <h1 id={titleId} className="lx-home-hero__title">
          <span>{title.lead}</span>
          {title.turn === undefined ? null : <em>{title.turn}</em>}
          <br className="lx-home-hero__break" />
          {title.tail === undefined ? null : <span>{title.tail}</span>}
        </h1>

        <div className="lx-home-hero__bottom">
          <p className="lx-home-hero__lead">{text}</p>
          <a
            className="lx-button lx-button--primary lx-home-hero__action"
            href={`#${nextSectionId}`}
          >
            {action}
            <Icon name="arrow-right" className="lx-button__icon" />
          </a>
        </div>
      </div>

      {IS_CAROUSEL ? (
        <div className="lx-home-hero__controls" role="group" aria-label={labels.controls}>
          <button type="button" onClick={() => show(-1)} aria-label={labels.previous}>
            <Icon name="chevron-left" />
          </button>
          <span className="lx-home-hero__counter" aria-hidden="true">
            {pad(current + 1)}
          </span>
          <span className="lx-home-hero__progress" aria-hidden="true" />
          <span className="lx-home-hero__total" aria-hidden="true">
            {pad(SLIDES.length)}
          </span>
          <button type="button" onClick={() => show(1)} aria-label={labels.next}>
            <Icon name="chevron-right" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? labels.pause : labels.play}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
