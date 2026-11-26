// Caminhos públicos do luxchange (W20), sem dependências: as telas de outros slices (Carteira, central de avisos) linkam
// para o depósito sem importar o módulo inteiro (sem ciclo de inicialização com `credits`).
export const luxchangePaths = {
  deposit: '/titular/luxchange/deposito',
  depositFor: (holdingId: string) =>
    `/titular/luxchange/deposito?holding=${encodeURIComponent(holdingId)}`,
  depositResult: (operationId: string) =>
    `/titular/luxchange/deposito/${encodeURIComponent(operationId)}`,
  /** W21: solicitações (Request) — lista, nova e detalhe. */
  requests: '/titular/luxchange/solicitacoes',
  newRequest: '/titular/luxchange/solicitacoes/nova',
  newRequestFor: (partyId: string, secondHomeId: string) =>
    `/titular/luxchange/solicitacoes/nova?party=${encodeURIComponent(partyId)}&casa=${encodeURIComponent(secondHomeId)}`,
  request: (requestId: string) =>
    `/titular/luxchange/solicitacoes/${encodeURIComponent(requestId)}`,
  wallet: '/titular/carteira',
  area: '/titular',
} as const;
