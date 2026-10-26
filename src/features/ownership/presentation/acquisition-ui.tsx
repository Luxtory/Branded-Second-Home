import type { ReactNode } from 'react';
import { Icon, type RecordAttribute } from '@/design-system/react';

export function AcquisitionSection({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-page-section" aria-labelledby={id}>
      <h2 className="lx-display-s" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}
export function AcquisitionFacts({ items }: { readonly items: readonly RecordAttribute[] }) {
  return (
    <dl className="lx-evidence lx-evidence--inline">
      {items.map((item) => (
        <div className="lx-evidence__item" key={item.label}>
          <dt className="lx-evidence__label">{item.label}</dt>
          <dd className="lx-evidence__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function AcquisitionNotice({
  children,
  error = false,
}: {
  readonly children: ReactNode;
  readonly error?: boolean;
}) {
  return (
    <div className={`lx-message lx-message--${error ? 'error' : 'warning'}`}>
      <Icon name="alert" className="lx-message__icon" />
      <p className="lx-message__title">{children}</p>
    </div>
  );
}
