'use client';

import { useActionState } from 'react';
import { partyMessages as text } from './i18n/parties-pt-br';
import {
  inviteRepresentativeAction,
  registerPartyAction,
  revokeDelegationAction,
  searchPartyAction,
} from './party-admin-actions';
import { DateTimeField, FormAlert, SubmitButton, TextField } from './party-fields';
import { initialPartyFormState, type PartyFormState } from './party-form-state';
import { partyPaths } from './party-paths';

const DOCUMENT_MAX = 32;
const EMAIL_MAX = 254;
const TEXT_MAX = 255;

function rejectionTitle(state: PartyFormState, duplicate = false): string | null {
  if (state.rejection === null) return null;
  return duplicate && state.rejection === 'state'
    ? text.duplicate
    : text.rejections[state.rejection];
}

/** Cadastro de pessoa ou empresa (`register_party`): CPF ou CNPJ. */
export function RegisterPartyForm({ idempotencyKey }: { readonly idempotencyKey: string }) {
  const [state, action] = useActionState(
    registerPartyAction,
    initialPartyFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert title={rejectionTitle(state, true)} />
      <TextField
        form="party"
        name="document"
        label={text.newParty.documentLabel}
        hint={text.newParty.documentHint}
        maxLength={DOCUMENT_MAX}
        state={state}
      />
      <div className="lx-form__actions">
        <SubmitButton>{text.newParty.submit}</SubmitButton>
        <a className="lx-button lx-button--quiet" href={partyPaths.list}>
          {text.cancel}
        </a>
      </div>
    </form>
  );
}

/** Busca por CPF/CNPJ por POST: o documento nunca vai ao endereço da página. */
export function PartySearchForm() {
  const [state, action] = useActionState(searchPartyAction, initialPartyFormState(''));
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert title={rejectionTitle(state)} />
      {state.notFound === true ? (
        <div className="lx-message lx-message--warning" role="status">
          <p className="lx-message__title">{text.list.searchNotFound}</p>
        </div>
      ) : null}
      <TextField
        form="party-search"
        name="document"
        label={text.list.searchLabel}
        hint={text.list.searchHint}
        maxLength={DOCUMENT_MAX}
        state={state}
      />
      <div className="lx-form__actions">
        <SubmitButton tone="secondary">{text.list.searchSubmit}</SubmitButton>
      </div>
    </form>
  );
}

function InviteSummary({
  state,
  maskedDocument,
}: {
  readonly state: PartyFormState;
  readonly maskedDocument: string;
}) {
  const until = state.values.valid_until ?? '';
  const validity =
    until === ''
      ? text.invite.summaryValidityOpen
      : `${text.invite.summaryValidityUntil} ${state.values.valid_until_local ?? until}`;
  const items = [
    { label: text.invite.summaryEmail, value: (state.values.email ?? '').trim().toLowerCase() },
    { label: text.invite.summaryParty, value: maskedDocument },
    { label: text.invite.summaryValidity, value: validity },
    { label: text.invite.summaryBasis, value: state.values.basis ?? '' },
  ];
  return (
    <section className="lx-page-section" aria-labelledby="invite-summary">
      <h2 className="lx-display-s" id="invite-summary">
        {text.invite.summaryTitle}
      </h2>
      <dl className="lx-evidence lx-evidence--inline">
        {items.map((item) => (
          <div className="lx-evidence__item" key={item.label}>
            <dt className="lx-evidence__label">{item.label}</dt>
            <dd className="lx-evidence__value">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="lx-body">{text.invite.pendingNote}</p>
    </section>
  );
}

/** Valores do passo 1 levados ao passo 2 sem reaparecer em campos editáveis. */
function CarriedValues({ state }: { readonly state: PartyFormState }) {
  return (
    <>
      {['email', 'email_confirmation', 'valid_until', 'valid_until_local', 'basis'].map((name) => (
        <input key={name} type="hidden" name={name} value={state.values[name] ?? ''} />
      ))}
    </>
  );
}

/**
 * Convite em dois passos (spec identity §13.4): e-mail digitado duas vezes, fim opcional e base → resumo com o e-mail
 * completo para conferência e o documento mascarado → "Confirmar convite".
 */
export function InviteRepresentativeForm({
  partyId,
  maskedDocument,
  idempotencyKey,
}: {
  readonly partyId: string;
  readonly maskedDocument: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    inviteRepresentativeAction,
    initialPartyFormState(idempotencyKey),
  );
  const review = state.step === 'review';
  return (
    <form className="lx-form" action={action} noValidate>
      <input type="hidden" name="party_id" value={partyId} />
      <FormAlert title={rejectionTitle(state)} />
      {review ? (
        <>
          <InviteSummary state={state} maskedDocument={maskedDocument} />
          <CarriedValues state={state} />
          <div className="lx-form__actions">
            <SubmitButton name="intent" value="confirm">
              {text.invite.confirm}
            </SubmitButton>
            <SubmitButton tone="quiet" name="intent" value="edit">
              {text.invite.edit}
            </SubmitButton>
          </div>
        </>
      ) : (
        <>
          <TextField
            form="invite"
            name="email"
            type="email"
            autoComplete="off"
            label={text.invite.emailLabel}
            maxLength={EMAIL_MAX}
            state={state}
          />
          <TextField
            form="invite"
            name="email_confirmation"
            type="email"
            autoComplete="off"
            label={text.invite.emailConfirmLabel}
            maxLength={EMAIL_MAX}
            state={state}
          />
          <DateTimeField
            form="invite"
            name="valid_until"
            label={text.invite.validUntilLabel}
            hint={text.invite.validUntilHint}
            optional
            state={state}
          />
          <TextField
            form="invite"
            name="basis"
            label={text.invite.basisLabel}
            hint={text.invite.basisHint}
            maxLength={TEXT_MAX}
            state={state}
          />
          <div className="lx-form__actions">
            <SubmitButton name="intent" value="review">
              {text.invite.review}
            </SubmitButton>
            <a className="lx-button lx-button--quiet" href={partyPaths.party(partyId)}>
              {text.cancel}
            </a>
          </div>
        </>
      )}
    </form>
  );
}

/** Revogação da delegação (`revoke_party_delegation`), com a base. */
export function RevokeDelegationForm({
  partyId,
  delegationId,
  idempotencyKey,
}: {
  readonly partyId: string;
  readonly delegationId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    revokeDelegationAction,
    initialPartyFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <input type="hidden" name="party_id" value={partyId} />
      <input type="hidden" name="party_delegation_id" value={delegationId} />
      <FormAlert title={rejectionTitle(state)} />
      <TextField
        form="revoke"
        name="revocation_basis"
        label={text.revoke.basisLabel}
        hint={text.revoke.basisHint}
        maxLength={TEXT_MAX}
        state={state}
      />
      <div className="lx-form__actions">
        <SubmitButton tone="destructive">{text.revoke.submit}</SubmitButton>
        <a className="lx-button lx-button--quiet" href={partyPaths.party(partyId)}>
          {text.cancel}
        </a>
      </div>
    </form>
  );
}
