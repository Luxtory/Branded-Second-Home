import type { PrivacyNotice } from '../../domain/privacy-notice';

/**
 * Aviso de Privacidade da jornada da solicitação de conversa (spec ownership §14.11). **Pendente**: o texto final vem da
 * Luxtory depois da validação jurídica e só então este objeto passa a `approved`, por commit revisado, depois do
 * checkpoint jurídico/fundador. Enquanto pendente, em Production a página, a seção do formulário e a escrita ficam
 * fechadas.
 */
export const privacyNotice: PrivacyNotice = { status: 'pending' };

/** Textos da página `/privacidade` (pt-BR). */
export const privacyPageMessages = {
  metadata: 'Aviso de Privacidade — Luxtory',
  title: 'Aviso de Privacidade',
  version: 'Versão',
  approvedOn: 'aprovada em',
  pending:
    'O Aviso de Privacidade desta jornada está em validação e ainda não foi publicado. Pendência técnica: esta mensagem não aparece em Production.',
} as const;
