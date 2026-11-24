// Caminhos públicos do luxchange (W20), sem dependências: as telas de outros slices (Carteira, central de avisos) linkam
// para o depósito sem importar o módulo inteiro (sem ciclo de inicialização com `credits`).
export const luxchangePaths = {
  deposit: '/titular/luxchange/deposito',
  depositFor: (holdingId: string) =>
    `/titular/luxchange/deposito?holding=${encodeURIComponent(holdingId)}`,
  depositResult: (operationId: string) =>
    `/titular/luxchange/deposito/${encodeURIComponent(operationId)}`,
  wallet: '/titular/carteira',
  area: '/titular',
} as const;
