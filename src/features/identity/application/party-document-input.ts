import { z } from 'zod';
import { normalizePartyDocument, type PartyDocument } from '../domain/party-document';

const DOCUMENT_INPUT_MAX = 32;

/**
 * Texto digitado → documento normalizado; inválido vira erro do campo (spec identity §13.3). Puro (só Zod e domínio):
 * serve também a formulários de cliente de outros módulos, sem levar código de servidor ao navegador.
 */
export const partyDocumentInput = z
  .string()
  .min(1)
  .max(DOCUMENT_INPUT_MAX)
  .transform((value, context): PartyDocument => {
    const document = normalizePartyDocument(value);
    if (document === null) {
      context.addIssue({ code: 'custom', message: 'invalid_document' });
      return z.NEVER;
    }
    return document;
  });
