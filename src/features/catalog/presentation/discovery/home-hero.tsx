'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/design-system/react/icons';
import type { Headline } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';

interface Slide {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly crop: string;
}

/**
 * Fotografias do Hero (spec catalog §13.10): lifestyle com pessoas, residência e arquitetura — nunca o imóvel vazio
 * como protagonista — e com as pessoas fora da área do texto (inferior esquerda), que o recorte não pode cobrir. Só a
 * `hero-lifestyle` cumpre isso entre as fotos disponíveis; com duas ou mais, o carrossel e os controles aparecem.
 */
const SLIDES: readonly Slide[] = [
  {
    src: '/images/home/hero/hero-lifestyle.jpg',
    width: 1344,
    height: 768,
    crop: 'lx-crop-x-80 lx-crop-lg-x-65',
  },
];
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
 * Cinematic Hero da Home (PICTURE): a fotografia é a protagonista, o conteúdo fica baixo e o único convite desce para a
 * renúncia. Carrossel pausável (WCAG 2.2.2): sem autoplay com movimento reduzido; pausa no hover e no foco.
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
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPlaying(!prefersReducedMotion());
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!IS_CAROUSEL || !playing || held) return;
    const timer = window.setInterval(
      () => setCurrent((index) => (index + 1) % SLIDES.length),
      INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [playing, held, current]);

  const show = (step: number) =>
    setCurrent((index) => (index + step + SLIDES.length) % SLIDES.length);

  return (
    <section
      id={id}
      className="lx-hero"
      data-surface="blue"
      aria-labelledby={titleId}
      aria-roledescription={IS_CAROUSEL ? labels.description : undefined}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
      }}
    >
      <ul className="lx-hero__slides" aria-hidden="true">
        {SLIDES.map((slide, index) => (
          <li
            className="lx-hero__slide"
            data-active={index === current ? '' : undefined}
            key={slide.src}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */}
            <img
              className={`lx-hero__image ${slide.crop}`}
              src={slide.src}
              alt=""
              width={slide.width}
              height={slide.height}
              loading={index === 0 ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : 'auto'}
            />
          </li>
        ))}
      </ul>

      <div className="lx-container lx-hero__content">
        <div className="lx-hero__copy">
          <h1 id={titleId} className="lx-statement lx-hero__title">
            <HeadlineText headline={title} />
          </h1>
          <p className="lx-subheadline">{text}</p>
          <div className="lx-hero__actions">
            <a className="lx-button lx-button--primary lx-button--large" href={`#${nextSectionId}`}>
              {action}
              <Icon name="arrow-right" className="lx-button__icon" />
            </a>
          </div>
        </div>

        {IS_CAROUSEL ? (
          <div className="lx-hero__controls" role="group" aria-label={labels.controls}>
            <button
              className="lx-icon-button"
              type="button"
              aria-label={labels.previous}
              onClick={() => show(-1)}
            >
              <Icon name="chevron-left" />
            </button>
            <span className="lx-hero__index lx-hero__index--current" aria-hidden="true">
              {pad(current + 1)}
            </span>
            <span className="lx-hero__progress" aria-hidden="true">
              {SLIDES.map((slide, index) => (
                <span
                  className="lx-hero__step"
                  data-active={index === current ? '' : undefined}
                  key={slide.src}
                />
              ))}
            </span>
            <span className="lx-hero__index" aria-hidden="true">
              {pad(SLIDES.length)}
            </span>
            <button
              className="lx-icon-button"
              type="button"
              aria-label={labels.next}
              onClick={() => show(1)}
            >
              <Icon name="chevron-right" />
            </button>
            <button
              className="lx-icon-button"
              type="button"
              aria-label={playing ? labels.pause : labels.play}
              onClick={() => setPlaying((value) => !value)}
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
