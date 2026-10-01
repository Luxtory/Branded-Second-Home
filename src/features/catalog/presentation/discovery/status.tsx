import type { ReactNode } from 'react';

/** Estado vazio ou indisponível do Discovery (`lx-empty`): frase honesta e um caminho que existe. */
export function StatusNote({
  message,
  action,
}: {
  readonly message: string;
  readonly action: ReactNode;
}) {
  return (
    <div className="lx-empty">
      <p className="lx-lead">{message}</p>
      {action}
    </div>
  );
}
