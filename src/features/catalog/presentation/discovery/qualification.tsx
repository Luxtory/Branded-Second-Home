import type { ReactNode } from 'react';
import { Scene } from '@/design-system/react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { nb } from './no-break';

const { qualification } = text;

/**
 * PUSH (b2c.md §7): para quem faz e para quem pode não fazer sentido, lado a lado com o mesmo peso (`lx-pair`), antes
 * da ação. Mesmo texto nas três páginas que o usam — a qualificação é do Protagonista, não da página.
 */
export function Qualification({
  titleId,
  actions,
}: {
  readonly titleId: string;
  readonly actions: ReactNode;
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
            <ul className="lx-prose">
              {qualification.fits.map((item) => (
                <li className="lx-body" key={item}>
                  {nb(item)}
                </li>
              ))}
            </ul>
          </div>
          <div className="lx-pair__item">
            <h3 className="lx-display-s">{qualification.notFitsTitle}</h3>
            <ul className="lx-prose">
              {qualification.notFits.map((item) => (
                <li className="lx-body" key={item}>
                  {nb(item)}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="lx-scene__actions">{actions}</div>
      </div>
    </Scene>
  );
}
