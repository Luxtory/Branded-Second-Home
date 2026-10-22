// Superfície pública **pura** do módulo identity (W7): validação do CPF/CNPJ para formulários e entradas de outros
// módulos, inclusive de cliente. Nada de servidor aqui — o `index.ts` leva Auth, banco e cripto (só servidor).
export { partyDocumentInput } from './application/party-document-input';
export type { PartyDocument } from './domain/party-document';
