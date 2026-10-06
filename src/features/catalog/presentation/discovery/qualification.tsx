import type { ReactNode } from 'react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { nb } from './no-break';

const { qualification } = text;

function List({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="lx-comparison__list">
      {items.map((item) => (
        <li className="lx-body" key={item}>
          {nb(item)}
        </li>
      ))}
    </ul>
  );
}

/**
 * PUSH `[FW-B2C: §8 P5]` no Core (Blue): para quem faz e para quem pode não fazer sentido, lado a lado com o mesmo peso
 * (Editorial Comparison), cada critério na sua linha, e o próximo passo no fechamento. A lista base é a mesma em todas
 * as páginas; `extraNotFits` recebe os complementos factuais da página (b2c.md §8).
 */
export function Qualification({
  titleId,
  extraNotFits = [],
  children,
}: {
  readonly titleId: string;
  readonly extraNotFits?: readonly string[];
  /** Próximo passo (texto e ações). */
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-section" data-surface="blue" aria-labelledby={titleId}>
      <div className="lx-container">
        <div className="lx-section-head">
          <h2 id={titleId} className="lx-headline">
            <HeadlineText headline={qualification.title} />
          </h2>
        </div>
        <div className="lx-comparison lx-comparison--divided">
          <div className="lx-comparison__item">
            <h3 className="lx-display-m">{qualification.fitsTitle}</h3>
            <List items={qualification.fits} />
          </div>
          <div className="lx-comparison__item">
            <h3 className="lx-display-m">{qualification.notFitsTitle}</h3>
            <List items={[...qualification.notFits, ...extraNotFits]} />
          </div>
        </div>
        <div className="lx-section-closing lx-stack">{children}</div>
      </div>
    </section>
  );
}
