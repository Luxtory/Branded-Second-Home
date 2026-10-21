import type { PartyDocument } from '../domain/party-document';
import type { PartyDocumentProtector, PartyStore } from './party-ports';

/**
 * Party existente pelo CPF/CNPJ, para outros módulos (D-W3-1: party do Investor). Resolve pelo HMAC em todas as chaves
 * do anel; nunca cria party nem guarda o documento. `fingerprint` dá o pseudônimo para o hash de idempotência.
 */
export interface PartyDocumentResolver<Tx> {
  resolve(tx: Tx, document: PartyDocument): Promise<string | null>;
  fingerprint(document: PartyDocument): string;
}

export function createPartyDocumentResolver<Tx>(
  protector: PartyDocumentProtector,
  store: Pick<PartyStore<Tx>, 'findPartyIdByDigests'>,
): PartyDocumentResolver<Tx> {
  return {
    resolve: (tx, document) => store.findPartyIdByDigests(tx, protector.lookupDigests(document)),
    fingerprint: (document) =>
      protector.fingerprint('document', `${document.type}|${document.value}`),
  };
}
