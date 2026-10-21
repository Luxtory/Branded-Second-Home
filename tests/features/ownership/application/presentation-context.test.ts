import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PRESENTATION_CONTEXT_KEY_ID,
  signPresentationContext,
  verifyPresentationContext,
} from '@/features/ownership/application/presentation-context';

// Contexto de apresentação assinado (spec ownership §14.6; ADR-0018 §4; `02` §15, item 14): prova do que a página da
// Home Edition apresentou — nunca dado confiável do cliente.
const KEY = { id: PRESENTATION_CONTEXT_KEY_ID, secret: 'c'.repeat(32) };
const OTHER = { id: PRESENTATION_CONTEXT_KEY_ID, secret: 'd'.repeat(32) };
const HOME_EDITION = '6b1f3c2e-9a4d-4e8f-8b7c-1d2e3f4a5b6c';
const REFERENCE = '0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f';

const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')) as unknown;

describe('contexto de apresentação da Home Edition', () => {
  it('[REQ-022] assina a referência apresentada ou a ausência explícita; o verificador devolve o mesmo contexto', () => {
    const presented = signPresentationContext(
      { homeEditionId: HOME_EDITION, presentedProjectedInvestmentId: REFERENCE },
      KEY,
    );
    const none = signPresentationContext(
      { homeEditionId: HOME_EDITION, presentedProjectedInvestmentId: null },
      KEY,
    );

    expect(verifyPresentationContext(presented, [KEY])).toEqual({
      homeEditionId: HOME_EDITION,
      presentedProjectedInvestmentId: REFERENCE,
    });
    expect(verifyPresentationContext(none, [KEY])).toEqual({
      homeEditionId: HOME_EDITION,
      presentedProjectedInvestmentId: null,
    });
    // Sem PII, valor ou instante: só versão, chave, Home Edition e referência.
    expect(decode(presented)).toEqual({ v: 1, k: 'v1', h: HOME_EDITION, p: REFERENCE });
    expect(decode(none)).toEqual({ v: 1, k: 'v1', h: HOME_EDITION, p: null });
    expect(presented.length).toBeLessThanOrEqual(512);
  });

  it('[REQ-022] [TECH-100] referência trocada pelo cliente, assinatura alterada ou de outra chave → recusado', () => {
    const token = signPresentationContext(
      { homeEditionId: HOME_EDITION, presentedProjectedInvestmentId: null },
      KEY,
    );
    const [payload = '', signature = ''] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, k: 'v1', h: HOME_EDITION, p: REFERENCE }),
    ).toString('base64url');

    expect(verifyPresentationContext(`${forgedPayload}.${signature}`, [KEY])).toBeNull();
    expect(verifyPresentationContext(`${payload}.${signature.slice(0, -2)}AA`, [KEY])).toBeNull();
    expect(verifyPresentationContext(token, [OTHER])).toBeNull();
    expect(verifyPresentationContext(`${payload}.`, [KEY])).toBeNull();
    expect(verifyPresentationContext(`${token}.extra`, [KEY])).toBeNull();
    expect(verifyPresentationContext('não é um contexto', [KEY])).toBeNull();
  });

  it('[TECH-100] versão ou chave desconhecidas, ou payload fora do esquema → recusado mesmo bem assinado', () => {
    const signed = (payload: unknown) => {
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const mac = createHmac('sha256', KEY.secret)
        .update(`luxtory:interest:presentation-context.${encoded}`)
        .digest('base64url');
      return `${encoded}.${mac}`;
    };

    expect(
      verifyPresentationContext(signed({ v: 1, k: 'v1', h: HOME_EDITION, p: null }), [KEY]),
    ).not.toBeNull();
    expect(
      verifyPresentationContext(signed({ v: 2, k: 'v1', h: HOME_EDITION, p: null }), [KEY]),
    ).toBeNull();
    expect(
      verifyPresentationContext(signed({ v: 1, k: 'v2', h: HOME_EDITION, p: null }), [KEY]),
    ).toBeNull();
    expect(
      verifyPresentationContext(signed({ v: 1, k: 'v1', h: HOME_EDITION, p: null, name: 'x' }), [
        KEY,
      ]),
    ).toBeNull();
    expect(
      verifyPresentationContext(signed({ v: 1, k: 'v1', h: 'abc', p: null }), [KEY]),
    ).toBeNull();
    expect(
      verifyPresentationContext(signed({ v: 1, k: 'v1', h: HOME_EDITION.toUpperCase(), p: null }), [
        KEY,
      ]),
    ).toBeNull();
  });

  it('[TECH-100] o contexto não expõe o segredo; na rotação, a chave antiga continua verificando', () => {
    const token = signPresentationContext(
      { homeEditionId: HOME_EDITION, presentedProjectedInvestmentId: REFERENCE },
      KEY,
    );
    const rotated = { id: 'v2', secret: 'e'.repeat(32) };

    expect(token).not.toContain(KEY.secret);
    expect(verifyPresentationContext(token, [rotated, KEY])).not.toBeNull();
  });
});
