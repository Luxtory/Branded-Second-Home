import { redirect } from 'next/navigation';
import { FocusedLayout } from '@/design-system/react';
import { AuthUnavailable } from './auth-unavailable';
import { messages } from './i18n/pt-br';
import { LoginForm } from './login-form';
import { currentSession } from './server-auth';

/** `/entrar`: login do staff por código de uso único (TECH-050). */
export async function LoginPage() {
  const session = await currentSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  if (session?.assurance === 'aal2') redirect('/admin');
  if (session?.assurance === 'aal1') redirect('/entrar/mfa');
  return (
    <FocusedLayout brand={messages.brand}>
      <h1 className="lx-display-s">{messages.login.title}</h1>
      <p className="lx-lead">{messages.login.lead}</p>
      <LoginForm />
    </FocusedLayout>
  );
}
