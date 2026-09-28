// Traçados espelhados de src/design-system/icons/{menu,close,alert,check}.svg (um teste compara os dois). Ícones hairline
// em currentColor, decorativos: o nome acessível fica no controle ou no texto ao lado.
export const ICON_PATHS = {
  menu: ['M3 8h18M3 16h18'],
  close: ['M5 5l14 14M19 5L5 19'],
  alert: ['M12 3L22 20H2L12 3z', 'M12 10v5M12 17.5v.5'],
  check: ['M4 12.5l5 5L20 6.5'],
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, className }: { readonly name: IconName; readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
