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
    enrollTitle: 'Proteja sua conta com um aplicativo autenticador',
    enrollLead:
      'O acesso administrativo pede uma segunda confirmação, além do código que chegou por e-mail: um código de 6 dígitos gerado por um aplicativo autenticador no seu celular ou computador. Você configura uma vez; depois, é só abrir o aplicativo a cada login.',
    installTitle: '1. Instale ou abra um aplicativo autenticador',
    installBody:
      'Se ainda não tem um, instale um destes aplicativos gratuitos. Um gerenciador de senhas com essa função também serve.',
    newTab: '(abre em nova aba)',
    addTitle: '2. Adicione a Luxtory ao aplicativo',
    addBeforeQr:
      'Gere o QR Code e escaneie com o aplicativo: nele, escolha Adicionar conta e aponte a câmera.',
    startEnrollment: 'Gerar QR Code',
    addWithQr: 'No aplicativo, escolha Adicionar conta e escaneie este QR Code:',
    qrAlt: 'QR Code para adicionar a Luxtory ao aplicativo autenticador',
    cannotScan: 'Não consegue escanear?',
    manualSteps:
      'No aplicativo, escolha Adicionar conta → Inserir chave de configuração → Tipo baseado em tempo (TOTP) → cole esta chave. Use “Luxtory” como nome da conta.',
    manualKeyLabel: 'Chave de configuração',
    copyKey: 'Copiar chave',
    keyCopied: 'Chave copiada. Cole no aplicativo autenticador.',
    copyFailed: 'Não foi possível copiar. Selecione a chave e copie manualmente.',
    codeTitle: '3. Digite o código do aplicativo',
    codePending: 'Disponível depois do passo 2.',
    challengeLead:
      'Abra seu aplicativo autenticador e digite o código de 6 dígitos da conta Luxtory. Ele é diferente do código que chegou por e-mail.',
    codeLabel: 'Código de 6 dígitos do aplicativo',
    codeHint:
      'É um código numérico novo, diferente do código do e-mail. Ele muda a cada 30 segundos: se mudar enquanto você digita, use o novo — não é preciso recomeçar.',
    confirmEnrollment: 'Confirmar e entrar',
    confirm: 'Confirmar',
    invalidCode:
      'Código inválido. Use o código que aparece agora no aplicativo (não o do e-mail) e confira se o horário do aparelho está automático.',
    enrollmentFailed: 'Não foi possível gerar o QR Code. Tente de novo em instantes.',
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
