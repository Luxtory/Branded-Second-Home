import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/design-system/react';
import { discoveryMessages as text, type ModalityPair } from '../i18n/discovery-pt-br';
import { nb } from './no-break';

type Level = 3 | 4;

function Heading({
  level,
  className,
  children,
}: {
  readonly level: Level;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const Tag = level === 3 ? 'h3' : 'h4';
  return <Tag className={className}>{children}</Tag>;
}

/** Parágrafos curtos da copy, com "Co-Owner" sem quebra no hífen. */
export function Paragraphs({
  lines,
  className = 'lx-body',
}: {
  readonly lines: readonly string[];
  readonly className?: string;
}) {
  return (
    <>
      {lines.map((line) => (
        <p className={className} key={line}>
          {nb(line)}
        </p>
      ))}
    </>
  );
}

/**
 * Link de navegação com seta (ação principal = botão; secundária = link, ou botão de contorno sobre fotografia).
 * `large` = 56px, o tamanho das ações sobre o Cinematic Hero.
 */
export function ActionLink({
  href,
  label,
  primary = false,
  outline = false,
  large = false,
  icon = 'arrow-right',
}: {
  readonly href: string;
  readonly label: string;
  readonly primary?: boolean;
  readonly outline?: boolean;
  readonly large?: boolean;
  /** Direção da ação: para frente (padrão) ou dentro da página (`arrow-down`, `arrow-up`). */
  readonly icon?: IconName;
}) {
  const button = primary || outline;
  const className = button
    ? [
        'lx-button',
        primary ? 'lx-button--primary' : 'lx-button--secondary',
        large ? 'lx-button--large' : '',
      ]
        .filter(Boolean)
        .join(' ')
    : 'lx-link lx-link--standalone';
  return (
    <a className={className} href={href}>
      {label}
      <Icon name={icon} className={button ? 'lx-button__icon' : 'lx-link__icon'} />
    </a>
  );
}

/**
 * Eyebrow do Core (`lx-eyebrow`): caixa alta pelo CSS, cor do papel `marker` da superfície. `accent`: Warm Sand sobre
 * Moroccan Blue (decisão do fundador na Home, 2026-10-06).
 */
export function Eyebrow({
  children,
  accent = false,
}: {
  readonly children: ReactNode;
  readonly accent?: boolean;
}) {
  return <p className={accent ? 'lx-eyebrow lx-eyebrow--accent' : 'lx-eyebrow'}>{children}</p>;
}

/** Ordinal editorial (01, 02, 03): leitura visual; a ordem já vem da lista. */
export const ordinal = (index: number) => String(index + 1).padStart(2, '0');

/**
 * Owner e Co-Owner com o mesmo peso e a mesma estrutura (REQ-103) no Core: Editorial Comparison com hairline
 * superior e divisor central (empilhados no celular, Owner primeiro). Com `headlines`, a primeira frase de cada lado é
 * o título e o nome da modalidade vira eyebrow; sem, o nome da modalidade é o título.
 */
export function ModalityComparison({
  pair,
  headlines = false,
  level = 3,
}: {
  readonly pair: ModalityPair;
  readonly headlines?: boolean;
  readonly level?: Level;
}) {
  const sides = [
    { key: 'owner', name: text.modality.owner, lines: pair.owner },
    { key: 'co-owner', name: text.modality.co_owner, lines: pair.coOwner },
  ];
  return (
    <div className="lx-comparison lx-comparison--divided" data-pair="modality">
      {sides.map((side) => {
        const [first = '', ...rest] = side.lines;
        return (
          <div className="lx-comparison__item" key={side.key}>
            {headlines ? (
              <>
                <Eyebrow>
                  <span className="lx-nowrap">{side.name}</span>
                </Eyebrow>
                <Heading level={level} className="lx-display-m">
                  {nb(first)}
                </Heading>
                <Paragraphs lines={rest} />
              </>
            ) : (
              <>
                <Heading level={level} className="lx-display-m">
                  <span className="lx-nowrap">{side.name}</span>
                </Heading>
                <Paragraphs lines={side.lines} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Fotografia estrutural de um Editorial Split: preenche a sua metade; recorte por classes (a CSP bloqueia `style`). */
export function SplitPhoto({
  src,
  width,
  height,
  alt,
  crop,
  caption,
}: {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly crop: string;
  readonly caption?: string;
}) {
  return (
    <figure className="lx-media lx-split__media">
      {/* eslint-disable-next-line @next/next/no-img-element -- Next/Image injects an inline style blocked by the strict CSP. */}
      <img className={crop} src={src} alt={alt} width={width} height={height} loading="lazy" />
      {caption === undefined ? null : (
        <figcaption className="lx-media__caption">{caption}</figcaption>
      )}
    </figure>
  );
}
