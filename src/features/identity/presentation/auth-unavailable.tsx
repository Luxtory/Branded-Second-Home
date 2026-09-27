import { FocusedLayout } from '@/design-system/react';
import { messages } from './i18n/pt-br';

/** Auth ou banco indisponível neste ambiente (Preview sem staging, ADR-0007) ou sem configuração (TECH-001). */
export function AuthUnavailable() {
  const text = messages.unavailable;
  return (
    <FocusedLayout brand={messages.brand}>
      <p className="lx-label">{text.marker}</p>
      <h1 className="lx-display-s">{text.title}</h1>
      <p className="lx-body">{text.body}</p>
    </FocusedLayout>
  );
}
