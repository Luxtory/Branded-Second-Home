import { redirect } from 'next/navigation';
import { AuthUnavailable } from './auth-unavailable';
import { messages } from './i18n/pt-br';
import { MfaForm } from './mfa-form';
import { withAuth } from './server-auth';

/** `/entrar/mfa`: cadastro ou desafio do segundo fator (AAL2, TECH-050). */
export async function MfaPage() {
  const state = await withAuth(false, async (gateway) => {
    const session = await gateway.session();
    if (session === null || session.assurance === 'aal2') return session;
    return { session, factorId: await gateway.verifiedTotpFactor() };
  });
  if (state === 'unavailable') return <AuthUnavailable />;
  if (state === null) redirect('/entrar');
  if ('assurance' in state) redirect('/admin');
  return (
    <main id="conteudo" className="lx-container lx-container--narrow">
      <h1 className="lx-display-s">{messages.mfa.title}</h1>
      <MfaForm factorId={state.factorId} />
    </main>
  );
}
