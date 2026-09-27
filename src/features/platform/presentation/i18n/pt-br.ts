/** Textos do slice platform (pt-BR, único locale — CLAUDE.md → i18n). */
export const messages = {
  site: {
    name: 'Luxtory',
  },
  pageError: {
    marker: 'Erro',
    title: 'Não foi possível carregar esta página.',
    body: 'Tente de novo em instantes. Se o problema continuar, procure o responsável pela operação.',
    retry: 'Tentar de novo',
  },
  notFound: {
    marker: 'Erro 404',
    title: 'Página não encontrada.',
    body: 'O endereço pode ter mudado ou não existir mais.',
  },
  // Causa funcional clara de cada código (REQ-098, TECH-056).
  errors: {
    ERR_INTERNAL: 'Não foi possível concluir a solicitação. Tente novamente em instantes.',
    ERR_PERMISSION: 'Você não tem permissão para realizar esta operação.',
    ERR_MEMBERSHIP_INELIGIBLE: 'O Membership não está elegível para esta operação.',
    ERR_WINDOW_NOT_OPEN: 'A janela para esta operação ainda não está aberta.',
    ERR_CAPACITY_UNAVAILABLE:
      'A capacidade solicitada não está disponível ou não é elegível para esta operação.',
    ERR_BOOKING_CONFLICT: 'As datas conflitam com uma reserva já confirmada.',
    ERR_USE_RIGHT_BALANCE:
      'O saldo de Direito de Uso ou o limite sazonal não permite esta operação.',
    ERR_STAY_LENGTH: 'A duração da estadia, somada às reservas adjacentes, não atende às regras.',
    ERR_MIN_NOTICE: 'O prazo de antecedência para esta operação já passou.',
    ERR_CREDITS_INSUFFICIENT: 'Os Créditos disponíveis não são suficientes para esta operação.',
    ERR_CREDIT_HOLD_INVALID: 'Os Créditos em Garantia não são válidos para esta operação.',
    ERR_PRL_MISSING: 'Falta o PRL publicado necessário para esta operação.',
    ERR_POLICY_MISSING: 'Falta a política comercial vigente necessária para esta operação.',
    ERR_PARAMETER_MISSING: 'Falta um parâmetro obrigatório para esta operação.',
    ERR_PAYMENT_FAILED: 'O pagamento não foi concluído.',
    ERR_STATE_TRANSITION: 'O estado atual não permite esta operação.',
    ERR_IDEMPOTENCY_CONFLICT: 'Esta chave de idempotência já foi usada em outra solicitação.',
    ERR_CONCURRENT_CONFIRMATION:
      'Outra confirmação para as mesmas datas foi concluída antes desta.',
    ERR_COMPLIANCE_SUSPENDED: 'A operação está suspensa por não conformidade.',
    ERR_DELINQUENCY_RESTRICTED: 'A operação está restrita por inadimplência.',
    ERR_VALIDATION: 'Os dados enviados são inválidos.',
    ERR_UNAUTHENTICATED: 'É necessário autenticar-se para esta operação.',
    ERR_NOT_FOUND: 'O recurso solicitado não foi encontrado.',
    ERR_UNAVAILABLE: 'A operação está indisponível no momento. Tente novamente em instantes.',
  },
} as const;
