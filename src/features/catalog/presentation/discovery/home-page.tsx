import type { ReactNode } from 'react';
import { Scene, TypographicFrame, type Ground } from '@/design-system/react';
import { catalogCta } from '../../application/public-views';
import { discoveryMessages as text, type Headline } from '../i18n/discovery-pt-br';
import { CatalogActions } from './catalog-actions';
import { HeadlineText } from './headline';
import { nb } from './no-break';
import { ActionLink, Blocks, ModalityPairView } from './parts';
import { discoveryPaths, HOME_SECTIONS } from './paths';
import { Qualification } from './qualification';
import { readAvailability } from './read';
import { DiscoverySite } from './site';

const { home, triad, qualification, actions } = text;
const { hero, conflict, promise, proof } = home;

const [HERO, CONFLICT, PROMISE, PROOF, PUSH] = HOME_SECTIONS;

/**
 * Capítulo do PROOF: marker de capítulo, título e frase curta ao lado de um Frame tipográfico com a linha da tríade,
 * alternando de lado; a prova (par, blocos, nota) vem abaixo, na coluna larga — a coluna ao lado do Frame é estreita
 * demais para ela. Com o Frame à esquerda o rail do DS ocupa a mesma coluna do texto, então o marker abre o texto.
 */
function Chapter({
  id,
  ground,
  marker,
  title,
  frame,
  intro,
  mediaStart,
  children,
}: {
  readonly id: string;
  readonly ground: Ground;
  readonly marker: readonly string[];
  readonly title: Headline;
  readonly frame: Headline;
  readonly intro: string;
  readonly mediaStart: boolean;
  readonly children: ReactNode;
}) {
  const markerLine = (
    <p className="lx-marker">
      {marker.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </p>
  );
  return (
    <Scene titleId={id} ground={ground} variant={mediaStart ? 'media-start' : 'media-end'}>
      {mediaStart ? null : <div className="lx-col-rail lx-scene__rail">{markerLine}</div>}
      <div className="lx-col-text lx-scene__body">
        {mediaStart ? markerLine : null}
        <h3 id={id} className="lx-display-m">
          <HeadlineText headline={title} />
        </h3>
        <p className="lx-body">{nb(intro)}</p>
      </div>
      <div className="lx-col-media lx-scene__media">
        <TypographicFrame kind="living" title={`${frame.lead}${frame.turn ?? ''}`} />
      </div>
      <div className="lx-col-content lx-scene__body">{children}</div>
    </Scene>
  );
}

/** Home `/` (spec catalog §13.4): Unaware → Product Aware, arco completo dos 5Ps, PICTURE = Hero `[FW-B2C: §12]`. */
export async function HomePage() {
  const cta = catalogCta(await readAvailability());
  return (
    <DiscoverySite current="home">
      {/* PICTURE — o desejo primeiro; nenhuma ação comercial. */}
      <Scene
        titleId={HERO}
        ground="night"
        variant="opening"
        backdrop={<TypographicFrame kind="establishing" scrim />}
      >
        <div className="lx-col-content lx-scene__body">
          <h1 id={HERO} className="lx-display-xl">
            <HeadlineText headline={hero.title} />
          </h1>
          <p className="lx-lead">{hero.text}</p>
        </div>
      </Scene>

      {/* PROBLEM — o trade-off das alternativas. */}
      <Scene titleId={CONFLICT} ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h2 id={CONFLICT} className="lx-display-l">
            <HeadlineText headline={conflict.title} />
          </h2>
          <p className="lx-lead">{conflict.text}</p>
          <ul className="lx-blocks" aria-label={conflict.listLabel}>
            {conflict.alternatives.map((alternative) => (
              <li className="lx-blocks__item" key={alternative.title}>
                <h3 className="lx-display-s">{alternative.title}</h3>
                <dl className="lx-evidence">
                  <div className="lx-evidence__item">
                    <dt className="lx-evidence__label">{conflict.givesLabel}</dt>
                    <dd className="lx-evidence__value">{alternative.gives}</dd>
                  </div>
                  <div className="lx-evidence__item">
                    <dt className="lx-evidence__label">{conflict.forgoesLabel}</dt>
                    <dd className="lx-evidence__value">{alternative.forgoes}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <p className="lx-display-m">
            <HeadlineText headline={conflict.closing} />
          </p>
        </div>
      </Scene>

      {/* PROMISE — a nova lógica e a tríade. */}
      <Scene titleId={PROMISE} ground="night" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h2 id={PROMISE} className="lx-display-l">
            <HeadlineText headline={promise.title} />
          </h2>
          <p className="lx-lead">{promise.text}</p>
          <p className="lx-body">{promise.category}</p>
          <ul className="lx-prose" aria-label={promise.triadLabel}>
            {[triad.patrimony, triad.freedom, triad.belonging].map((line) => (
              <li className="lx-display-m" key={line.lead}>
                <HeadlineText headline={line} />
              </li>
            ))}
          </ul>
        </div>
      </Scene>

      {/* PROOF — a arquitetura, um capítulo por pilar. */}
      <Scene titleId={PROOF} ground="wash">
        <div className="lx-col-content lx-scene__body">
          <h2 id={PROOF} className="lx-display-l">
            <HeadlineText headline={proof.title} />
          </h2>
          <p className="lx-lead">{proof.text}</p>
        </div>
      </Scene>
      <Chapter
        id="patrimonio"
        ground="paper"
        marker={proof.patrimony.marker}
        title={proof.patrimony.title}
        frame={triad.patrimony}
        intro={proof.patrimony.text}
        mediaStart={false}
      >
        <ModalityPairView pair={proof.patrimony.pair} level={4} />
        <p className="lx-body">{proof.patrimony.note}</p>
      </Chapter>
      <Chapter
        id="liberdade"
        ground="wash"
        marker={proof.freedom.marker}
        title={proof.freedom.title}
        frame={triad.freedom}
        intro={proof.freedom.text}
        mediaStart
      >
        <Blocks items={proof.freedom.items} level={4} />
        <p className="lx-body">{proof.freedom.note}</p>
      </Chapter>
      <Chapter
        id="pertencimento"
        ground="paper"
        marker={proof.belonging.marker}
        title={proof.belonging.title}
        frame={triad.belonging}
        intro={proof.belonging.text}
        mediaStart={false}
      >
        <Blocks items={proof.belonging.items} level={4} rows />
      </Chapter>
      <Scene titleId="tres-valores" ground="night" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h3 id="tres-valores" className="lx-display-l">
            <HeadlineText headline={proof.closing.title} />
          </h3>
          <p className="lx-lead">{proof.closing.text}</p>
          <div className="lx-scene__actions">
            <ActionLink href={discoveryPaths.howItWorks} label={actions.howItWorks} />
          </div>
        </div>
      </Scene>

      {/* PUSH — autosseleção e o próximo passo por disponibilidade. */}
      <Qualification titleId={PUSH} extraNotFits={[qualification.existingProperty]}>
        <CatalogActions cta={cta} next={qualification.next} from="home" />
      </Qualification>
    </DiscoverySite>
  );
}
