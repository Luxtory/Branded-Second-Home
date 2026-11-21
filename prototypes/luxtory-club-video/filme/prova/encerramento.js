// Demonstração conceitual — encerramento comum dos filmes (Request, Direct, Luxplus e filme completo): a família da
// campanha por ≈ 4 s, sem cartão, legenda ou etiqueta, e a assinatura oficial (6 s, dissolve de 0,8 s). A imagem é a
// aprovada (S17b em out/entrada); o 9:16 com moldura Moroccan Blue segue provisório até a versão vertical definitiva.

/** Cena da família antes da assinatura (bloco `moment` de blocos.js). */
export const familia = (fmt, scene) => ({
  kind: 'moment',
  scene,
  dur: 4_000,
  clean: true,
  vo: { after: 300, text: 'Mais lugares para viver com quem você ama.' },
  shot: {
    plan: 'S17b',
    asset: 'S17b',
    what: 'família na piscina ao pôr do sol (imagem aprovada da campanha)',
    dissolve: 500,
    // 16:9: recorte da largura inteira e aproximação lenta; 9:16 provisório: a imagem inteira emoldurada.
    move:
      fmt === '9x16'
        ? { from: [0.5, 0.5, 1.0], to: [0.5, 0.5, 1.05] }
        : { from: [0.5, 0.5, 1.0], to: [0.48, 0.5, 1.06], anchor: [0.5, 0.547] },
    placeholder: {
      neutral: true,
      colors: ['0x9a7a5e', '0x1b2731'],
      note: 'placeholder neutro: imagem da família ausente em out/entrada',
    },
  },
  contact: 2_000,
});

/** Assinatura oficial: dissolve da família para o cartão Moroccan Blue. */
export const assinatura = () => ({
  kind: 'signature',
  dissolve: 800,
  vo: 'Luxtory. Seja protagonista de histórias extraordinárias.',
});
