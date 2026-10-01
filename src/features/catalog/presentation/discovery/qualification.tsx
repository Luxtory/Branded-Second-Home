import type { ReactNode } from 'react';
import { Scene } from '@/design-system/react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { nb } from './no-break';

const { qualification } = text;

function List({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="lx-prose">
      {items.map((item) => (
        <li className="lx-body" key={item}>
          {nb(item)}
        </li>
      ))}
    </ul>
  );
}

/**
 * PUSH `[FW-B2C: §8 P5]`: para quem faz e para quem pode não fazer sentido, lado a lado com o mesmo peso (`lx-pair`),
 * e o próximo passo. A lista base é a mesma em todas as páginas; `extraNotFits` recebe os complementos factuais da
 * página (b2c.md §8).
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
    <Scene titleId={titleId} ground="wash">
      <div className="lx-col-content lx-scene__body">
        <h2 id={titleId} className="lx-display-l">
          <HeadlineText headline={qualification.title} />
        </h2>
        <div className="lx-pair">
          <div className="lx-pair__item">
            <h3 className="lx-display-s">{qualification.fitsTitle}</h3>
            <List items={qualification.fits} />
          </div>
          <div className="lx-pair__item">
            <h3 className="lx-display-s">{qualification.notFitsTitle}</h3>
            <List items={[...qualification.notFits, ...extraNotFits]} />
          </div>
        </div>
        {children}
      </div>
    </Scene>
  );
}
