/**
 * Textos da reserva de uso próprio na Área do Titular (W12, spec booking; pt-BR, único locale). "Noites" e "Direito de
 * Uso", na terminologia obrigatória do `02` §1 (REQ-100). O Owner não tem Direito de Uso: para ele, "uso próprio"
 * (REQ-037).
 */
export const ownUseMessages = {
  outcome: {
    closed: 'As reservas de uso próprio ainda não estão abertas.',
    unavailable: 'Não foi possível confirmar agora. Tente de novo em instantes.',
    permission: 'Você não representa mais esta Second Home. Fale com a Luxtory.',
    stay_length:
      'A permanência precisa ter de 1 a 14 noites seguidas, somando as reservas adjacentes de uso próprio.',
    capacity: 'Uma ou mais noites não estão disponíveis para reserva.',
    conflict: 'Uma ou mais noites já foram reservadas.',
    window: 'Sua janela de reserva para estas datas ainda não abriu.',
    balance: 'O saldo do seu Direito de Uso nesta categoria não cobre todas as noites.',
    already_confirmed: 'Já existe uma reserva confirmada para estas datas nesta Second Home.',
    invalid: 'Confira as datas de entrada e saída.',
    unexpected: 'Algo deu errado. Tente de novo.',
  },
} as const;
