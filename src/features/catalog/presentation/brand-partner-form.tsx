'use client';

import { useActionState } from 'react';
import { registerBrandPartnerAction } from './actions';
import { FormActions, FormAlert, TextField } from './fields';
import { initialFormState } from './form-state';
import { messages } from './i18n/pt-br';
import { paths } from './paths';

const text = messages.newBrandPartner;
const FORM = 'brand-partner';
const NAME_MAX = 200;
const REF_MAX = 255;

/** Registro de Brand Partner (`register_brand_partner`). */
export function BrandPartnerForm({ idempotencyKey }: { readonly idempotencyKey: string }) {
  const [state, action] = useActionState(
    registerBrandPartnerAction,
    initialFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={action} noValidate>
      <FormAlert state={state} />
      <TextField
        form={FORM}
        name="brand_name"
        label={text.nameLabel}
        hint={text.nameHint}
        maxLength={NAME_MAX}
        state={state}
      />
      <TextField
        form={FORM}
        name="exposure_authorization_ref"
        label={text.exposureLabel}
        hint={text.exposureHint}
        optional
        maxLength={REF_MAX}
        state={state}
      />
      <FormActions submit={text.submit} cancelHref={paths.catalog} />
    </form>
  );
}
