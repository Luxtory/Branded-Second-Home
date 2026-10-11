import { createHash } from 'node:crypto';
import type { ContactMailer } from '../application/brand-partner-contact';

/**
 * Envio determinístico do contato para local e CI (spec catalog §14.6): nunca envia e-mail real e é recusado na Vercel
 * pela validação do ambiente. Reproduz a idempotência do provedor — mesma chave e mesmo conteúdo = aceite sem novo
 * envio; outro conteúdo = conflito — guardando só a impressão digital (SHA-256) do e-mail, nunca o conteúdo.
 */
export function createFakeContactMailer(): ContactMailer & { readonly sent: () => number } {
  const fingerprints = new Map<string, string>();
  let sent = 0;
  return {
    send(email, providerKey) {
      const fingerprint = createHash('sha256').update(JSON.stringify(email)).digest('hex');
      const previous = fingerprints.get(providerKey);
      if (previous !== undefined) {
        return Promise.resolve(
          previous === fingerprint ? { status: 'accepted' } : { status: 'conflict' },
        );
      }
      fingerprints.set(providerKey, fingerprint);
      sent += 1;
      return Promise.resolve({ status: 'accepted' });
    },
    sent: () => sent,
  };
}
