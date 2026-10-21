'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { AuthProviderError } from '../infrastructure/auth/supabase-auth-gateway';
import type { InviteState, LoginDestination, LoginState, MfaState } from './form-state';
import { withAuth } from './server-auth';

const MAX_EMAIL = 254;
const emailSchema = z.email().max(MAX_EMAIL);
const sixDigits = z.string().regex(/^\d{6}$/);
const factorIdSchema = z.string().min(1).max(128);
const destinationSchema = z.enum(['admin', 'titular']);

/** Depois do código: staff segue para o segundo fator; o Titular, para a Área (TECH-050 exige MFA só do staff). */
const AFTER_CODE: Record<LoginDestination, string> = { admin: '/entrar/mfa', titular: '/titular' };
const AFTER_SIGN_OUT: Record<LoginDestination, string> = {
  admin: '/entrar',
  titular: '/titular/entrar',
};

const destinationOf = (form: FormData): LoginDestination => {
  const parsed = destinationSchema.safeParse(field(form, 'destination'));
  return parsed.success ? parsed.data : 'admin';
};

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * Login por código (TECH-050): 1º passo envia o código; 2º confirma e leva ao segundo fator. No 2º passo, "Reenviar
 * código" repete o envio para o mesmo e-mail sem sair do passo do código.
 */
export async function loginAction(previous: LoginState, form: FormData): Promise<LoginState> {
  const destination = destinationOf(form);
  const email = emailSchema.safeParse(field(form, 'email'));
  if (!email.success) return { step: 'email', email: '', message: 'invalid_email', destination };
  const onCode = field(form, 'step') === 'code';
  const resend = onCode && field(form, 'intent') === 'resend';
  if (!onCode || resend) return sendCode({ ...previous, destination }, email.data, resend);
  const code = sixDigits.safeParse(field(form, 'code'));
  const verified = await withAuth(true, async (gateway, log) => {
    const ok = code.success && (await gateway.verifyLoginCode(email.data, code.data));
    if (!ok) log.warn('auth code rejected');
    return ok;
  });
  if (verified === 'unavailable') return { ...previous, destination, message: 'unavailable' };
  if (!verified) return { step: 'code', email: email.data, message: 'invalid_code', destination };
  redirect(AFTER_CODE[destination]);
}

/** Mesmo envio no 1º pedido e no reenvio: resposta igual com ou sem conta (sem enumerar) e limite do provedor. */
async function sendCode(previous: LoginState, email: string, resend: boolean): Promise<LoginState> {
  const sent = await withAuth(true, async (gateway, log) => {
    const outcome = await gateway.sendLoginCode(email);
    log.info('auth code requested', { outcome, resend });
    return outcome;
  });
  if (sent === 'unavailable') return { ...previous, message: 'unavailable' };
  const { destination } = previous;
  if (sent === 'rate_limited') {
    return resend
      ? { step: 'code', email, message: 'resend_rate_limited', destination }
      : { step: 'email', email, message: 'rate_limited', destination };
  }
  return { step: 'code', email, message: resend ? 'code_resent' : 'code_sent', destination };
}

/** Segundo fator TOTP (AAL2, TECH-050): inicia o cadastro ou confirma um código. */
export async function mfaAction(previous: MfaState, form: FormData): Promise<MfaState> {
  if (field(form, 'intent') === 'enroll') {
    const enrollment = await withAuth(true, async (gateway, log) => {
      try {
        return await gateway.startTotpEnrollment();
      } catch (error) {
        if (!(error instanceof AuthProviderError)) throw error;
        log.error('mfa enrollment failed', { provider_code: error.providerCode });
        return null;
      }
    });
    if (enrollment === 'unavailable') return { enrollment: null, message: 'unavailable' };
    if (enrollment === null) return { enrollment: null, message: 'enrollment_failed' };
    return { enrollment, message: null };
  }
  const factorId = factorIdSchema.safeParse(field(form, 'factorId'));
  const code = sixDigits.safeParse(field(form, 'code'));
  const verified = await withAuth(true, async (gateway, log) => {
    const ok =
      factorId.success && code.success && (await gateway.verifyTotp(factorId.data, code.data));
    log.info(ok ? 'mfa verified' : 'mfa rejected');
    return ok;
  });
  if (verified === 'unavailable') return { ...previous, message: 'unavailable' };
  if (!verified) return { ...previous, message: 'invalid_code' };
  redirect('/admin');
}

export async function signOutAction(form: FormData): Promise<void> {
  await withAuth(true, (gateway) => gateway.signOut());
  redirect(AFTER_SIGN_OUT[destinationOf(form)]);
}

/**
 * Primeiro acesso pelo código do convite (W7): prova de controle do e-mail no Supabase Auth; a conta passa a confirmada e
 * a delegação continua **pendente** até a ativação na Área. Resposta genérica, sem enumerar contas.
 */
export async function acceptInviteAction(
  _previous: InviteState,
  form: FormData,
): Promise<InviteState> {
  const email = emailSchema.safeParse(field(form, 'email'));
  if (!email.success) return { email: '', message: 'invalid_email' };
  const code = sixDigits.safeParse(field(form, 'code'));
  const verified = await withAuth(true, async (gateway, log) => {
    const ok = code.success && (await gateway.verifyInviteCode(email.data, code.data));
    if (!ok) log.warn('auth invite code rejected');
    return ok;
  });
  if (verified === 'unavailable') return { email: email.data, message: 'unavailable' };
  if (!verified) return { email: email.data, message: 'invalid_code' };
  redirect('/titular');
}
