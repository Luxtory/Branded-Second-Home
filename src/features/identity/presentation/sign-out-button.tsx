import { signOutAction } from './actions';
import { messages } from './i18n/pt-br';

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button className="lx-button lx-button--quiet" type="submit">
        {messages.session.signOut}
      </button>
    </form>
  );
}
