const labels = {
  name: 'Nome',
  company: 'Empresa',
  email: 'E-mail',
  message: 'Mensagem',
  website: 'Site da empresa',
} as const;

export const secondHomeDevelopmentContactEmailText = {
  subject: 'Second Home Development — mensagem pelo site',
  labels,
} as const;

export const secondHomeDevelopmentContactFormMessages = {
  labels,
  optional: '(opcional)',
  submit: 'Enviar mensagem',
  sending: 'Enviando mensagem…',
  success: 'Mensagem enviada.',
  invalid: 'Revise os campos indicados antes de enviar.',
  required: 'Preencha este campo.',
  tooLong: (limit: number) => `Use até ${limit} caracteres.`,
  invalidField: 'Confira o texto deste campo.',
  invalidEmail: 'Informe um e-mail válido.',
  invalidWebsite: 'Informe um endereço que comece com https:// ou http://.',
  unconfirmed: 'Envio sem confirmação. Seus dados foram mantidos. Tente novamente.',
  unavailable: 'O envio está indisponível. Seus dados foram mantidos.',
  rateLimited: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
  conflict: 'Esta tentativa já foi usada. Envie novamente para iniciar outra.',
  rejectedData: 'Revise os dados e tente enviar novamente.',
} as const;
