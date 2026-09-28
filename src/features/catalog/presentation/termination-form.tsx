'use client';

import { useActionState } from 'react';
import { terminateBrandPartnerAction } from './actions';
import { DateTimeField, FormActions, FormAlert, TextField } from './fields';
import { initialFormState } from './form-state';
import { messages } from './i18n/pt-br';
import { paths } from './paths';

const text = messages.termination;
const FORM = 'termination';
const REF_MAX = 255;

/** Encerramento da parceria (`terminate_brand_partner`, BR-021): confirmação com eficácia e base. */
export function TerminationForm({
  brandPartnerId,
  idempotencyKey,
}: {
  readonly brandPartnerId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    terminateBrandPartnerAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="brand_partner_id" value={brandPartnerId} />
      <DateTimeField
        form={FORM}
        name="terminated_effective_at"
        label={text.effectiveLabel}
        hint={text.effectiveHint}
        state={state}
      />
      <TextField
        form={FORM}
        name="termination_basis"
        label={text.basisLabel}
        hint={text.basisHint}
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions
        submit={text.submit}
        cancelHref={paths.brandPartner(brandPartnerId)}
        tone="destructive"
      />
    </form>
  );
}
