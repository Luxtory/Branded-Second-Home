export type FrameKind = 'establishing' | 'living' | 'detail';

/**
 * Frame tipográfico (`lx-frame--typographic`): a solução sem fotografia oficial (P-1) — nome em Display e, se houver,
 * metadado real em Courier, sobre `night` ou `wash`. Nunca foto de banco. É decorativo quando repete um título que já
 * está na página (`decorative`): sai da árvore de acessibilidade. Fotografia entra como outro modo, quando existir.
 */
export function TypographicFrame({
  kind,
  ground = 'night',
  title,
  meta = [],
  scrim = false,
  decorative = true,
}: {
  readonly kind: FrameKind;
  readonly ground?: 'night' | 'wash';
  readonly title?: string;
  /** Partes do Scene Marker (metadado real); vazio = sem marker. */
  readonly meta?: readonly string[];
  /** Scrim do Opening Frame (texto branco por cima; `--scrim` + `--scrim-top`). */
  readonly scrim?: boolean;
  readonly decorative?: boolean;
}) {
  const classes = ['lx-frame', `lx-frame--${kind}`, 'lx-frame--typographic'];
  if (scrim) classes.push('lx-frame--scrim', 'lx-frame--scrim-top');
  return (
    <div className={classes.join(' ')} aria-hidden={decorative ? true : undefined}>
      <div className="lx-frame__media" data-ground={ground}>
        {meta.length === 0 ? null : (
          <p className="lx-marker lx-frame__meta">
            {meta.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </p>
        )}
        {title === undefined ? null : <p className="lx-frame__title">{title}</p>}
      </div>
    </div>
  );
}
