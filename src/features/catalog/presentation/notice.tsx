import { Icon } from '@/design-system/react';

/**
 * Mensagem inline do DS (`lx-message`): sempre ícone + texto, nunca só cor. `role` só para o que muda depois de uma
 * ação (confirmação → `status`, recusa → `alert`); aviso fixo da página não é região viva.
 */
export function Notice({
  tone,
  title,
  body,
  role,
}: {
  readonly tone: 'success' | 'warning' | 'error';
  readonly title: string;
  readonly body?: string;
  readonly role?: 'status' | 'alert';
}) {
  return (
    <div className={`lx-message lx-message--${tone}`} role={role}>
      <Icon name={tone === 'success' ? 'check' : 'alert'} className="lx-message__icon" />
      <p className="lx-message__title">{title}</p>
      {body === undefined ? null : <p className="lx-message__body">{body}</p>}
    </div>
  );
}
