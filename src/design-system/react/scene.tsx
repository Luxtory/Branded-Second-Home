import type { ReactNode } from 'react';
import type { Ground } from './logo';

export type SceneVariant = 'opening' | 'statement' | 'media-end' | 'media-start';

/**
 * Scene (`lx-scene`): uma unidade narrativa — `section` rotulada pelo seu título, fundo por `data-ground` e o grid do
 * DS. Os filhos são as colunas (`lx-col-*`). `backdrop` fica atrás do conteúdo (Opening Frame). A função narrativa
 * (5Ps) não aparece no DOM: é do brief, não do componente.
 */
export function Scene({
  id,
  titleId,
  ground,
  variant,
  backdrop,
  chapter = false,
  children,
}: {
  /** Âncora da seção (destino de link na página); ausente = sem `id`. */
  readonly id?: string;
  /** `id` do título (`h1`/`h2`) que nomeia a seção. */
  readonly titleId: string;
  readonly ground: Ground;
  readonly variant?: SceneVariant;
  readonly backdrop?: ReactNode;
  /** Ritmo de capítulo: linhas do grid mais espaçadas e preenchimento denso (composições em várias linhas). */
  readonly chapter?: boolean;
  readonly children: ReactNode;
}) {
  const className = variant === undefined ? 'lx-scene' : `lx-scene lx-scene--${variant}`;
  return (
    <section id={id} className={className} data-ground={ground} aria-labelledby={titleId}>
      {backdrop === undefined ? null : <div className="lx-scene__backdrop">{backdrop}</div>}
      <div className={chapter ? 'lx-container lx-grid lx-grid--chapter' : 'lx-container lx-grid'}>
        {children}
      </div>
    </section>
  );
}
