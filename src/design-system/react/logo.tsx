import manifest from '../brand/logo/manifest.json';

export type Ground = 'paper' | 'wash' | 'night';
type LogoKey = keyof typeof manifest.logos;

// Cor do logo por fundo (manifest.grounds): Moroccan Blue em paper/wash, Warm Sand em night.
const COLOR_BY_GROUND = { paper: 'moroccan-blue', wash: 'moroccan-blue', night: 'warm-sand' } as const;
// Abaixo de 360 px o cabeçalho usa o ícone (uso previsto no manifest). Mobile-first: o ícone é o padrão e o lockup
// horizontal entra a partir de 22.5rem.
const HORIZONTAL_FROM = '(min-width: 22.5rem)';

/** URL do arquivo oficial por chave do manifest (servido byte a byte por GET /brand/logo/<chave>). */
export function logoUrl(key: LogoKey): string {
  return `/brand/logo/${key}`;
}

function asset(key: LogoKey) {
  // width/height só dão a proporção (sem CLS); a altura visível vem do CSS (.lx-logo).
  const [width = 1, height = 1] = manifest.logos[key].viewBox;
  return { src: logoUrl(key), width: Math.round(width), height: Math.round(height) };
}

/** Logo oficial como link para o início: imagem `alt=""`, nome acessível no link (docs/reference/design-system.md). */
export function Logo({
  ground,
  href,
  label,
}: {
  readonly ground: Ground;
  readonly href: string;
  readonly label: string;
}) {
  const color = COLOR_BY_GROUND[ground];
  const horizontal = asset(`horizontal/${color}`);
  const icon = asset(`icon/${color}`);
  return (
    <a className="lx-logo" href={href} aria-label={label}>
      <picture>
        <source
          media={HORIZONTAL_FROM}
          srcSet={horizontal.src}
          width={horizontal.width}
          height={horizontal.height}
        />
        <img src={icon.src} alt="" width={icon.width} height={icon.height} />
      </picture>
    </a>
  );
}
