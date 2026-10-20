'use client';

import { useActionState } from 'react';
import { CROP_STEPS, type CatalogTermKind } from '../domain/collection';
import {
  approveHomeConceptMediaAction,
  createCatalogTermAction,
  endProjectedInvestmentAction,
  registerProjectedInvestmentAction,
  setHomeConceptCurationAction,
  updateCatalogTermAction,
  uploadHomeConceptCoverAction,
  withdrawHomeConceptMediaAction,
} from './collection-actions';
import {
  ChoiceField,
  DateTimeField,
  FileField,
  FormActions,
  FormAlert,
  GroupError,
  SelectField,
  TextField,
  type Option,
} from './fields';
import { initialFormState, type FormState } from './form-state';
import { collectionMessages } from './i18n/collection-pt-br';
import { messages } from './i18n/pt-br';
import { paths } from './paths';

const SUMMARY_MAX = 160;
const LABEL_MAX = 80;
const ALT_MAX = 300;
const CREDIT_MAX = 200;
const REF_MAX = 255;
const AMOUNT_MAX = 24;
const RANK_DIGITS = 3;
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const YES = 'yes';
const NO = 'no';

const version = collectionMessages.versionFields;

/** Termos ativos de cada vocabulário, para as seleções da versão. */
export type TermOptions = Readonly<Record<CatalogTermKind, readonly Option[]>>;

const TERM_SLOTS: Readonly<Record<CatalogTermKind, number>> = {
  lifestyle: 3,
  architectural_style: 2,
};

function TermGroup({
  form,
  kind,
  state,
  options,
}: {
  readonly form: string;
  readonly kind: CatalogTermKind;
  readonly state: FormState;
  readonly options: readonly Option[];
}) {
  const legend = kind === 'lifestyle' ? version.lifestyleLegend : version.styleLegend;
  const hint = kind === 'lifestyle' ? version.lifestyleHint : version.styleHint;
  const errorId = `${form}-${kind}_ids`;
  return (
    <fieldset className="lx-choice-group" aria-describedby={`${errorId}-hint`}>
      <legend className="lx-label">{legend}</legend>
      <p className="lx-hint" id={`${errorId}-hint`}>
        {options.length === 0 ? version.noTerms : hint}
      </p>
      {options.length === 0 ? null : (
        <div className="lx-form__row">
          {Array.from({ length: TERM_SLOTS[kind] }, (_, index) => (
            <SelectField
              key={index}
              form={form}
              name={`${kind}_${index + 1}`}
              label={version.termLabel(index + 1)}
              optional
              placeholder={version.noTerm}
              options={options}
              state={state}
            />
          ))}
        </div>
      )}
      <GroupError id={errorId} state={state} name={`${kind}_ids`} />
    </fieldset>
  );
}

/**
 * Classificação e resumo da Coleção na versão (spec catalog §13.12): todos opcionais. Pessoas, suítes e área são da
 * Home Edition (spec §17.2).
 */
export function VersionCollectionFields({
  form,
  state,
  terms,
}: {
  readonly form: string;
  readonly state: FormState;
  readonly terms: TermOptions;
}) {
  const publicTag = messages.form.publicWithExposureTag;
  return (
    <div className="lx-form">
      <h2 className="lx-display-s" id={`${form}-collection`}>
        {version.collectionLegend}
      </h2>
      <p className="lx-hint">{version.collectionHint}</p>
      <TermGroup form={form} kind="lifestyle" state={state} options={terms.lifestyle} />
      <TermGroup
        form={form}
        kind="architectural_style"
        state={state}
        options={terms.architectural_style}
      />
      <TextField
        form={form}
        name="summary"
        label={version.summaryLabel}
        hint={version.summaryHint}
        publicTag={publicTag}
        optional
        maxLength={SUMMARY_MAX}
        state={state}
      />
    </div>
  );
}

const vocabulary = collectionMessages.vocabulary;

/** Termo novo (`create_catalog_term`). */
export function TermForm({ idempotencyKey }: { readonly idempotencyKey: string }) {
  const [state, action] = useActionState(createCatalogTermAction, initialFormState(idempotencyKey));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <ChoiceField
        form="term"
        name="kind"
        label={vocabulary.kindLabel}
        state={state}
        options={(['lifestyle', 'architectural_style'] as const).map((kind) => ({
          value: kind,
          label: vocabulary.kinds[kind],
          description: vocabulary.kindHints[kind],
        }))}
      />
      <TextField
        form="term"
        name="label"
        label={vocabulary.labelLabel}
        hint={vocabulary.labelHint}
        publicTag={messages.form.publicTag}
        maxLength={LABEL_MAX}
        state={state}
      />
      <FormActions submit={vocabulary.submit} cancelHref={paths.vocabulary()} />
    </form>
  );
}

/** Renomear ou desativar um termo (`update_catalog_term`). */
export function TermEditForm({
  termId,
  label,
  active,
  idempotencyKey,
}: {
  readonly termId: string;
  readonly label: string;
  readonly active: boolean;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    updateCatalogTermAction,
    initialFormState(idempotencyKey, { label, active: active ? YES : NO }),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="catalog_term_id" value={termId} />
      <TextField
        form="term-edit"
        name="label"
        label={vocabulary.labelLabel}
        publicTag={messages.form.publicTag}
        maxLength={LABEL_MAX}
        state={state}
      />
      <ChoiceField
        form="term-edit"
        name="active"
        label={vocabulary.activeLabel}
        state={state}
        options={[
          { value: YES, label: vocabulary.activeOption },
          { value: NO, label: vocabulary.inactiveOption },
        ]}
      />
      <FormActions submit={vocabulary.editSubmit} cancelHref={paths.vocabulary()} />
    </form>
  );
}

const cover = collectionMessages.cover;
const CENTER = String(CROP_STEPS[2]);

/** Envio da capa (`upload_home_concept_cover`): o servidor reencoda e grava pendente. */
export function CoverForm({
  homeConceptId,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    uploadHomeConceptCoverAction,
    initialFormState(idempotencyKey, { crop_x: CENTER, crop_y: CENTER }),
  );
  const crop = (labels: Readonly<Record<number, string>>) =>
    CROP_STEPS.map((step) => ({ value: String(step), label: labels[step] ?? String(step) }));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_id" value={homeConceptId} />
      <FileField
        form="cover"
        name="image"
        label={cover.fileLabel}
        hint={cover.fileHint}
        accept={IMAGE_TYPES}
        state={state}
      />
      <TextField
        form="cover"
        name="alt"
        label={cover.altLabel}
        hint={cover.altHint}
        publicTag={messages.form.publicTag}
        maxLength={ALT_MAX}
        state={state}
      />
      <TextField
        form="cover"
        name="credit"
        label={cover.creditLabel}
        publicTag={messages.form.publicTag}
        optional
        maxLength={CREDIT_MAX}
        state={state}
      />
      <SelectField
        form="cover"
        name="crop_x"
        label={cover.cropXLabel}
        hint={cover.cropHint}
        placeholder={cover.cropXLabel}
        options={crop(cover.cropX)}
        state={state}
      />
      <SelectField
        form="cover"
        name="crop_y"
        label={cover.cropYLabel}
        placeholder={cover.cropYLabel}
        options={crop(cover.cropY)}
        state={state}
      />
      <FormActions submit={cover.submit} cancelHref={paths.homeConcept(homeConceptId)} />
    </form>
  );
}

/** Aprovação da capa (`approve_home_concept_media`): só o id. */
export function MediaApprovalForm({
  homeConceptId,
  mediaId,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly mediaId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    approveHomeConceptMediaAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_media_id" value={mediaId} />
      <FormActions submit={cover.approveSubmit} cancelHref={paths.homeConcept(homeConceptId)} />
    </form>
  );
}

/** Retirada da capa (`withdraw_home_concept_media`), irreversível, com motivo. */
export function MediaWithdrawalForm({
  homeConceptId,
  mediaId,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly mediaId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    withdrawHomeConceptMediaAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_media_id" value={mediaId} />
      <TextField
        form="withdrawal"
        name="withdrawal_basis"
        label={cover.basisLabel}
        hint={cover.basisHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions
        submit={cover.withdrawSubmit}
        cancelHref={paths.homeConcept(homeConceptId)}
        tone="destructive"
      />
    </form>
  );
}

const curation = collectionMessages.curation;

/** Curadoria (`set_home_concept_curation`): posição e destaque, partindo dos valores atuais. */
export function CurationForm({
  homeConceptId,
  rank,
  featured,
  idempotencyKey,
}: {
  readonly homeConceptId: string;
  readonly rank: number | null;
  readonly featured: boolean;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    setHomeConceptCurationAction,
    initialFormState(idempotencyKey, {
      rank: rank === null ? '' : String(rank),
      featured: featured ? YES : NO,
    }),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_concept_id" value={homeConceptId} />
      <TextField
        form="curation"
        name="rank"
        label={curation.rankLabel}
        hint={curation.rankHint}
        optional
        inputMode="numeric"
        maxLength={RANK_DIGITS}
        state={state}
      />
      <ChoiceField
        form="curation"
        name="featured"
        label={curation.featuredLabel}
        hint={curation.featuredHint}
        state={state}
        options={[
          { value: YES, label: curation.featured },
          { value: NO, label: curation.notFeatured },
        ]}
      />
      <FormActions submit={curation.submit} cancelHref={paths.homeConcept(homeConceptId)} />
    </form>
  );
}

const investment = collectionMessages.projectedInvestment;

/**
 * Média projetada de investimento (`register_home_edition_projected_investment`, BR-034): só o valor e o início; sem
 * modalidade, base ou Ação.
 */
export function ProjectedInvestmentForm({
  homeEditionId,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    registerProjectedInvestmentAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_id" value={homeEditionId} />
      <TextField
        form="value"
        name="amount"
        label={investment.amountLabel}
        hint={investment.amountHint}
        publicTag={messages.form.publicTag}
        inputMode="decimal"
        maxLength={AMOUNT_MAX}
        state={state}
      />
      <DateTimeField
        form="value"
        name="valid_from"
        label={investment.validFromLabel2}
        hint={investment.validFromHint}
        optional
        state={state}
      />
      <FormActions submit={investment.submit} cancelHref={paths.homeEdition(homeEditionId)} />
    </form>
  );
}

/** Encerramento da média (`end_home_edition_projected_investment`): agora, uma vez. */
export function EndProjectedInvestmentForm({
  homeEditionId,
  investmentId,
  idempotencyKey,
}: {
  readonly homeEditionId: string;
  readonly investmentId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    endProjectedInvestmentAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="home_edition_projected_investment_id" value={investmentId} />
      <FormActions
        submit={investment.endSubmit}
        cancelHref={paths.homeEdition(homeEditionId)}
        tone="destructive"
      />
    </form>
  );
}
