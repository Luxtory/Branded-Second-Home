/** Rotas da reserva de uso próprio na Área do Titular (W12). */
export const ownUsePaths = {
  login: '/titular/entrar',
  calendar: (holdingId: string) => `/titular/calendario/${holdingId}`,
  bookings: '/titular/reservas',
  booking: (bookingId: string) => `/titular/reservas/${bookingId}`,
  cancellation: (bookingId: string) => `/titular/reservas/${bookingId}/cancelamento`,
  guests: (bookingId: string) => `/titular/reservas/${bookingId}/convidados`,
  notifications: '/titular/notificacoes',
};
