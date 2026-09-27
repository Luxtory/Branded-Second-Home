// Traçados espelhados de src/design-system/icons/{menu,close}.svg (um teste compara os dois). Ícones hairline em
// currentColor, decorativos: o nome acessível fica no botão.
export const ICON_PATHS = {
  menu: 'M3 8h18M3 16h18',
  close: 'M5 5l14 14M19 5L5 19',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
