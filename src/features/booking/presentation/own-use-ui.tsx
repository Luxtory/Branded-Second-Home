import type { ReactNode } from 'react';
import { Icon } from '@/design-system/react';

/**
 * Peças de composição das telas do ciclo da reserva (W13 E4b), só sobre classes `lx-*` existentes do Design System —
 * nenhum componente novo no DS (ADR-0003, consumer-driven).
 */
export function Message(props: {
  readonly kind: 'info' | 'success' | 'warning' | 'error';
  readonly title: ReactNode;
  readonly body?: ReactNode;
  /** Região viva só para retorno de ação (`status`) ou recusa (`alert`); aviso fixo da página fica sem `role`. */
  readonly live?: 'status' | 'alert';
}) {
  return (
    <div className={`lx-message lx-message--${props.kind}`} role={props.live}>
      <Icon name={props.kind === 'success' ? 'check' : 'alert'} className="lx-message__icon" />
      <p className="lx-message__title">{props.title}</p>
      {props.body === undefined ? null : <p className="lx-message__body">{props.body}</p>}
    </div>
  );
}

export function Facts({ rows }: { readonly rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="lx-booking__facts">
      {rows.map(([label, value]) => (
        <div className="lx-booking__fact" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EvidenceRow({
  rows,
}: {
  readonly rows: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <dl className="lx-evidence lx-evidence--inline">
      {rows.map(([label, value]) => (
        <div className="lx-evidence__item" key={label}>
          <dt className="lx-evidence__label">{label}</dt>
          <dd className="lx-evidence__value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section(props: {
  readonly id: string;
  readonly title: string;
  readonly hidden?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-page-section" aria-labelledby={props.id}>
      <h2 className={props.hidden ? 'lx-visually-hidden' : 'lx-display-s'} id={props.id}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

export function Disclosure(props: { readonly summary: string; readonly children: ReactNode }) {
  return (
    <div className="lx-disclosure">
      <details className="lx-disclosure__item">
        <summary className="lx-disclosure__summary">
          {props.summary}
          <svg
            className="lx-disclosure__icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3 12h17M14 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
            />
          </svg>
        </summary>
        <div className="lx-disclosure__body">{props.children}</div>
      </details>
    </div>
  );
}

/** Id opaco com quebra depois de cada hífen: cabe a 320 px mesmo com texto ampliado. */
export function OpaqueId({ value }: { readonly value: string }) {
  const parts = value.split('-');
  return (
    <code className="lx-caption">
      {parts.map((part, index) => (
        <span key={`${index}-${part}`}>
          {part}
          {index < parts.length - 1 ? (
            <>
              -<wbr />
            </>
          ) : null}
        </span>
      ))}
    </code>
  );
}
