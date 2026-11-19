/**
 * Textos da declaração de convidados (W14; REQ-092; BR-330 a BR-332; spec booking §11). A declaração não identifica
 * nem conta convidados (P-6): os textos nunca afirmam um único convidado nem identificação.
 */
export const guestNominationMessages = {
  metadataTitle: 'Convidados na reserva — Luxtory',
  title: 'Convidados nesta reserva',
  lead: (label: string, period: string) => `${label} · ${period}`,
  back: 'Voltar para a reserva',
  rulesTitle: 'Regras de convidados desta Second Home',
  rulesSince: (date: string) => `Em vigor desde ${date}.`,
  noRulesTitle: 'Regras de convidados ainda não publicadas',
  noRulesBody:
    'A declaração de uso por convidados fica disponível quando a Luxtory publicar as regras desta Second Home.',
  notDeclarableTitle: 'Esta reserva não aceita declaração de convidados',
  notDeclarableBody: 'A declaração vale para reservas confirmadas ou em uso, até o check-out.',
  declaredTitle: 'Uso por convidados declarado',
  declaredBody: (date: string) => `Você declarou o uso por convidados sob estas regras em ${date}.`,
  doneTitle: 'Declaração registrada',
  doneBody: 'O uso por convidados foi declarado sob as regras em vigor.',
  changedTitle: 'As regras mudaram',
  changedBody:
    'As regras de convidados foram atualizadas. Leia as regras atuais antes de declarar.',
  accept:
    'Li e aceito as regras de convidados desta Second Home. Continuo responsável pelo uso feito pelos meus convidados.',
  acceptError: 'Marque a declaração para continuar.',
  acceptLegend: 'Declaração',
  submit: 'Declarar uso por convidados',
  pending: 'Registrando…',
  pendingStatus: 'Registrando a declaração.',
  responsibility:
    'A declaração não gera direito para os convidados, não usa Direito de Uso adicional e não é canal de reserva.',
  outcome: {
    closed: 'A declaração de convidados não está disponível no momento.',
    unavailable: 'Não foi possível registrar agora. Tente novamente em instantes.',
    permission: 'Esta reserva não pode receber declaração pela sua conta.',
    state: 'Esta reserva não aceita declaração de convidados.',
    missing: 'As regras de convidados não estão em vigor.',
    unexpected: 'Não foi possível registrar a declaração. Tente novamente.',
  },
  detailTitle: 'Convidados',
  detailBody: 'Declare o uso desta reserva por convidados, conforme as regras da Second Home.',
  detailLink: 'Ver regras e declarar',
  adminSection: 'Convidados',
  adminNone: 'Nenhuma declaração de uso por convidados.',
  adminItem: (date: string, rulesSince: string) =>
    `Uso por convidados declarado em ${date} (regras em vigor desde ${rulesSince}).`,
} as const;
