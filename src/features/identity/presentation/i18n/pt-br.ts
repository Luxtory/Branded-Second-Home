/** Textos do slice identity (pt-BR, único locale — CLAUDE.md → i18n). */
export const messages = {
  login: {
    title: 'Entrar na Luxtory',
    lead: 'Acesso da equipe Luxtory. Enviaremos um código de uso único para o seu e-mail.',
    emailLabel: 'E-mail',
    emailHint: 'Use o e-mail cadastrado pela Luxtory.',
    sendCode: 'Enviar código',
    codeLabel: 'Código recebido por e-mail',
    codeHint: 'Seis dígitos. O código vale por poucos minutos.',
    confirmCode: 'Entrar',
    otherEmail: 'Usar outro e-mail',
    codeSentTitle: 'Confira seu e-mail',
    codeSentBody: 'Se o e-mail estiver cadastrado, você receberá um código em instantes.',
    invalidEmail: 'Informe um e-mail válido.',
    invalidCode: 'Código inválido ou expirado. Confira o e-mail ou peça um novo código.',
    rateLimited: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
  },
  mfa: {
    title: 'Confirme sua identidade',
    enrollLead:
      'O acesso administrativo exige um segundo fator. Configure um aplicativo autenticador (TOTP) nesta conta.',
    startEnrollment: 'Configurar aplicativo autenticador',
    qrAlt: 'QR code para configurar o aplicativo autenticador',
    secretLabel: 'Ou digite esta chave no aplicativo:',
    challengeLead: 'Digite o código de seis dígitos do seu aplicativo autenticador.',
    codeLabel: 'Código do aplicativo autenticador',
    codeHint: 'Seis dígitos, renovados a cada 30 segundos.',
    confirm: 'Confirmar',
    invalidCode: 'Código inválido. Confira o horário do aparelho e tente de novo.',
    enrollmentFailed: 'Não foi possível iniciar a configuração. Tente de novo em instantes.',
  },
  session: {
    signOut: 'Sair',
  },
  unavailable: {
    marker: 'Indisponível',
    title: 'O acesso não está disponível neste ambiente.',
    body: 'A autenticação só funciona no ambiente de produção configurado. Tente de novo mais tarde.',
  },
} as const;
