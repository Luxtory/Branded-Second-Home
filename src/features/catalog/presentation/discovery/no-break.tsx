import type { ReactNode } from 'react';

// Termos compostos não quebram no hífen (docs/reference/design-system.md, Evidence: `lx-nowrap`).
const COMPOUND = /(Co-Owners?)/;

/** Texto da copy com "Co-Owner(s)" em `lx-nowrap`. */
export function nb(text: string): ReactNode {
  const parts = text.split(COMPOUND);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span className="lx-nowrap" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
