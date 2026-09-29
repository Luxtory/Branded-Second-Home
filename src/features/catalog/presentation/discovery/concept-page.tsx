import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ConceptCredit, Evidence, Scene, TypographicFrame } from '@/design-system/react';
import {
  distinctRegions,
  publicConceptId,
  type PublicConcept,
} from '../../application/public-views';
import type { EditionModality } from '../../domain/catalog';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { toParagraphs } from './paragraphs';
import { discoveryPaths } from './paths';
import { Qualification } from './qualification';
import { readPublicCatalog } from './read';
import { DiscoverySite } from './site';
import { StatusNote } from './status';
import { nb } from './no-break';

const { concept: copy, actions, modality } = text;

/** Uma leitura por requisição, compartilhada entre a página e a metadata. */
export const loadPublicConcept = cache(async (conceptId: string) => {
  const id = publicConceptId(conceptId);
  if (id === null) return { status: 'ok', value: null } as const;
  return readPublicCatalog((tx) => reader.concept(tx, id));
});

/** Owner e Co-Owner com o mesmo peso quando a Edition aceita os dois (REQ-103). */
function ModalityLabel({ value }: { readonly value: EditionModality }) {
  if (value === 'owner') return modality.owner;
  if (value === 'co_owner') return <span className="lx-nowrap">{modality.co_owner}</span>;
  return (
    <>
      {modality.owner}
      {copy.editions.modalityJoin}
      <span className="lx-nowrap">{modality.co_owner}</span>
    </>
  );
}

function Editions({ concept }: { readonly concept: PublicConcept }) {
  if (concept.editions.length === 0) {
    // Sem Edition, sem oferta (BR-004, REQ-022): nenhuma condição, modalidade nem ação de oferta.
    return <p className="lx-lead">{copy.editions.none}</p>;
  }
  return (
    <>
      <p className="lx-lead">{nb(copy.editions.lead)}</p>
      <ul className="lx-blocks">
        {concept.editions.map((edition) => (
          <li className="lx-blocks__item" key={edition.id}>
            <h3 className="lx-display-s">{edition.region}</h3>
            <Evidence
              inline
              items={[
                {
                  label: copy.editions.modality,
                  value: <ModalityLabel value={edition.modality} />,
                },
              ]}
            />
            <h4 className="lx-label">{copy.editions.conditions}</h4>
            <div className="lx-prose">
              {toParagraphs(edition.commercialConditions).map((paragraph) => (
                <p className="lx-body" key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Concept (brief: docs/specs/catalog.md §13.4) — PICTURE → PROOF → PUSH. Só o conteúdo público (D-W4-03): título,
 * especificação da versão vigente e as Editions como registradas; nenhum preço calculado (ADR-001 do `03`). Sem CTA de
 * interesse até a W6 (D-B2C-10).
 */
export async function ConceptPage({ conceptId }: { readonly conceptId: string }) {
  const result = await loadPublicConcept(conceptId);
  if (result.status === 'unavailable') {
    return (
      <DiscoverySite current="collection">
        <Scene titleId="concept-indisponivel" ground="paper">
          <div className="lx-col-content lx-scene__body">
            <h1 id="concept-indisponivel" className="lx-display-l">
              {text.site.collection}
            </h1>
            <StatusNote
              message={copy.unavailable}
              action={
                <a className="lx-link lx-link--standalone" href={discoveryPaths.howItWorks}>
                  {actions.howItWorks}
                </a>
              }
            />
          </div>
        </Scene>
      </DiscoverySite>
    );
  }
  const concept = result.value;
  if (concept === null) notFound();
  const regions = distinctRegions(concept.editions);

  return (
    <DiscoverySite current="collection">
      <Scene
        titleId="concept-titulo"
        ground="night"
        variant="opening"
        backdrop={<TypographicFrame kind="establishing" />}
      >
        <div className="lx-col-content lx-scene__body">
          {regions.length === 0 ? null : (
            <p className="lx-marker">
              {regions.map((region) => (
                <span key={region}>{region}</span>
              ))}
            </p>
          )}
          <h1 id="concept-titulo" className="lx-display-xl">
            {concept.title}
          </h1>
          <ConceptCredit lead={copy.creditLead} brandName={concept.brandName} />
        </div>
      </Scene>

      <Scene titleId="concept-especificacao" ground="paper">
        <div className="lx-col-text lx-scene__body">
          <h2 id="concept-especificacao" className="lx-display-m">
            {copy.specificationTitle}
          </h2>
          <div className="lx-prose">
            {toParagraphs(concept.specification).map((paragraph) => (
              <p className="lx-body" key={paragraph}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </Scene>

      <Scene titleId="concept-fidelidade" ground="wash" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h2 id="concept-fidelidade" className="lx-display-l">
            <HeadlineText headline={copy.fidelity.title} />
          </h2>
          <p className="lx-body">{nb(copy.fidelity.text)}</p>
        </div>
      </Scene>

      <Scene titleId="concept-editions" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h2 id="concept-editions" className="lx-display-l">
            {copy.editions.title}
          </h2>
          <Editions concept={concept} />
        </div>
      </Scene>

      <Qualification
        titleId="concept-para-quem"
        actions={
          <>
            <a className="lx-button lx-button--primary" href={discoveryPaths.collection}>
              {actions.otherConcepts}
            </a>
            <a className="lx-link lx-link--standalone" href={discoveryPaths.howItWorks}>
              {actions.howItWorks}
            </a>
          </>
        }
      />
    </DiscoverySite>
  );
}
