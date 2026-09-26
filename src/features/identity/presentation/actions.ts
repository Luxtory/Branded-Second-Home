'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { AuthProviderError } from '../infrastructure/auth/supabase-auth-gateway';
import type { LoginState, MfaState } from './form-state';
import { withAuth } from './server-auth';

const MAX_EMAIL = 254;
const emailSchema = z.email().max(MAX_EMAIL);
const sixDigits = z.string().regex(/^\d{6}$/);
const factorIdSchema = z.string().min(1).max(128);

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/** Login por código (TECH-050): 1º passo envia o código; 2º confirma e leva ao segundo fator. */
export async function loginAction(previous: LoginState, form: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(field(form, 'email'));
  if (!email.success) return { step: 'email', email: '', message: 'invalid_email' };
  if (field(form, 'step') !== 'code') {
    const sent = await withAuth(true, async (gateway, log) => {
      const outcome = await gateway.sendLoginCode(email.data);
      log.info('auth code requested', { outcome });
      return outcome;
    });
    if (sent === 'unavailable') return { ...previous, message: 'unavailable' };
    return sent === 'rate_limited'
      ? { step: 'email', email: email.data, message: 'rate_limited' }
      : { step: 'code', email: email.data, message: 'code_sent' };
  }
  const code = sixDigits.safeParse(field(form, 'code'));
  const verified = await withAuth(true, async (gateway, log) => {
    const ok = code.success && (await gateway.verifyLoginCode(email.data, code.data));
    if (!ok) log.warn('auth code rejected');
    return ok;
  });
  if (verified === 'unavailable') return { ...previous, message: 'unavailable' };
  if (!verified) return { step: 'code', email: email.data, message: 'invalid_code' };
  redirect('/entrar/mfa');
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

export async function signOutAction(): Promise<void> {
  await withAuth(true, (gateway) => gateway.signOut());
  redirect('/entrar');
}
