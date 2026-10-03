'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { Headline } from '../i18n/discovery-pt-br';

const SLIDES = [
  { src: '/images/home/hero/luxury-property-facade-hero.jpg', position: 'center 52%' },
  { src: '/images/home/hero/hero-lifestyle.jpg', position: 'center 52%' },
  { src: '/images/home/hero/home-solucao-firepit-family.jpg', position: 'center 48%' },
] as const;

const INTERVAL_MS = 8000;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function HomeHero({
  id,
  titleId,
  title,
  text,
  action,
  nextSectionId,
}: {
  readonly id: string;
  readonly titleId: string;
  readonly title: Headline;
  readonly text: string;
  readonly action: string;
  readonly nextSectionId: string;
}) {
  const [current, setCurrent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reduceMotion.current = media.matches;
      setIsPlaying((playing) => (media.matches ? false : playing || true));
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isPlaying || reduceMotion.current || SLIDES.length < 2) return;
    const timer = window.setInterval(() => {
      setCurrent((index) => (index + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const previous = () => setCurrent((index) => (index - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setCurrent((index) => (index + 1) % SLIDES.length);

  return (
    <section
      id={id}
      className="lx-home-hero"
      data-ground="night"
      aria-labelledby={titleId}
      aria-roledescription="carrossel"
    >
      <div className="lx-home-hero__slides" aria-hidden="true">
        {SLIDES.map((slide, index) => (
          <div
            className={
              index === current
                ? 'lx-home-hero__slide lx-home-hero__slide--active'
                : 'lx-home-hero__slide'
            }
            key={slide.src}
          >
            <Image
              src={slide.src}
              alt=""
              fill
              priority={index === 0}
              sizes="100vw"
              style={{ objectPosition: slide.position }}
            />
          </div>
        ))}
        <div className="lx-home-hero__scrim" />
      </div>

      <div className="lx-container lx-home-hero__content">
        <h1 id={titleId} className="lx-home-hero__title">
          <span>{title.lead}</span>
          {title.turn === undefined ? null : <em>{title.turn}</em>}
          <br className="lx-home-hero__break" />
          {title.tail === undefined ? null : <span>{title.tail.trimStart()}</span>}
        </h1>

        <div className="lx-home-hero__bottom">
          <p className="lx-home-hero__lead">{text}</p>
          <a className="lx-button lx-button--primary lx-home-hero__action" href={`#${nextSectionId}`}>
            {action}
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      <div className="lx-home-hero__controls" role="group" aria-label="Controles do carrossel">
        <button type="button" onClick={previous} aria-label="Imagem anterior">‹</button>
        <button
          type="button"
          className="lx-home-hero__counter"
          onClick={() => setIsPlaying((playing) => !playing)}
          aria-label={isPlaying ? 'Pausar carrossel' : 'Reproduzir carrossel'}
          aria-pressed={!isPlaying}
        >
          {pad(current + 1)}
        </button>
        <span className="lx-home-hero__progress" aria-hidden="true" />
        <span className="lx-home-hero__total" aria-hidden="true">{pad(SLIDES.length)}</span>
        <button type="button" onClick={next} aria-label="Próxima imagem">›</button>
      </div>
    </section>
  );
}
