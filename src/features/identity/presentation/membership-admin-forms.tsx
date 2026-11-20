'use client';

import { useActionState } from 'react';
import { membershipAdminMessages as text } from './i18n/membership-pt-br';
import { partyMessages } from './i18n/parties-pt-br';
import { changeMembershipAction } from './membership-admin-actions';
import { FormAlert, SubmitButton, TextField } from './party-fields';
import { initialPartyFormState, type PartyFormState } from './party-form-state';
import { partyPaths, type MembershipAction } from './party-paths';

const TEXT_MAX = 255;

/** Situação mudada por outra operação ou party sem Second Home vigente: mensagem própria do Membership. */
function rejectionTitle(state: PartyFormState): string | null {
  if (state.rejection === null) return null;
  return state.rejection === 'state' ? text.state : partyMessages.rejections[state.rejection];
}

/** Confirmação da mudança do Membership com a base registrada (W15). */
export function MembershipChangeForm({
  partyId,
  action,
  idempotencyKey,
}: {
  readonly partyId: string;
  readonly action: MembershipAction;
  readonly idempotencyKey: string;
}) {
  const [state, submit] = useActionState(
    changeMembershipAction,
    initialPartyFormState(idempotencyKey),
  );
  return (
    <form className="lx-form" action={submit} noValidate>
      <input type="hidden" name="party_id" value={partyId} />
      <input type="hidden" name="action" value={action} />
      <FormAlert title={rejectionTitle(state)} />
      <TextField
        form="membership"
        name="basis"
        label={text.basisLabel}
        hint={text.basisHint}
        maxLength={TEXT_MAX}
        state={state}
      />
      <div className="lx-form__actions">
        <SubmitButton
          tone={action === 'activate' || action === 'reactivate' ? 'primary' : 'destructive'}
        >
          {text.page[action].submit}
        </SubmitButton>
        <a className="lx-button lx-button--quiet" href={partyPaths.party(partyId)}>
          {partyMessages.cancel}
        </a>
      </div>
    </form>
  );
}
