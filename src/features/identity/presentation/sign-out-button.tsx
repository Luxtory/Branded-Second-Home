import { signOutAction } from './actions';
import type { LoginDestination } from './form-state';
import { messages } from './i18n/pt-br';

/** "Sair": volta ao login da superfície (Admin ou Área do Titular). */
export function SignOutButton({
  destination = 'admin',
}: {
  readonly destination?: LoginDestination;
}) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="destination" value={destination} />
      <button className="lx-button lx-button--quiet" type="submit">
        {messages.session.signOut}
      </button>
    </form>
  );
}
