import type { InputFingerprint } from '@/features/platform';
import type { PartyDocument } from '../domain/party-document';
import type { PartyDocumentProtector, PartyStore } from './party-ports';

/**
 * Party existente pelo CPF/CNPJ, para outros módulos (D-W3-1: party do Investor). Resolve pelo HMAC em todas as chaves
 * do anel; nunca cria party nem guarda o documento. `fingerprint` dá o pseudônimo (por chave) para o hash de
 * idempotência, que sobrevive à rotação (ADR-0020 §5).
 */
export interface PartyDocumentResolver<Tx> {
  resolve(tx: Tx, document: PartyDocument): Promise<string | null>;
  /** Pseudônimo do documento para o hash de idempotência, por chave do anel do HMAC. */
  readonly fingerprint: InputFingerprint<PartyDocument>;
}

export function createPartyDocumentResolver<Tx>(
  protector: PartyDocumentProtector,
  store: Pick<PartyStore<Tx>, 'findPartyIdByDigests'>,
): PartyDocumentResolver<Tx> {
  return {
    resolve: (tx, document) => store.findPartyIdByDigests(tx, protector.lookupDigests(document)),
    fingerprint: {
      activeKeyId: () => protector.activeHmacKeyId(),
      payload: (document, keyId) =>
        protector.fingerprint('document', `${document.type}|${document.value}`, keyId),
    },
  };
}
