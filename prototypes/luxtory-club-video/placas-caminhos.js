// Caminhos das placas internas de teste por Second Home (relativos à raiz do repositório). Módulo neutro, sem
// dependências do Node, para as sequências do navegador o lerem no `qa`; a geração fica em placas.mjs.
const DIR = 'prototypes/luxtory-club-video/out/placas/';

export const PLATES = {
  azzuraNoite: `${DIR}azzura-noite.jpg`,
  olivarTarde: `${DIR}olivar-tarde.png`,
  olivarNoite: `${DIR}olivar-noite.png`,
};

/**
 * Placas sem fotografia (campos neutros da Olivar Home): são placeholders estáticos de contraste. Não anunciam movimento
 * de câmera; capture.mjs as compõe paradas e valida que estão paradas. As placas fotográficas seguem com push-in e
 * validação de movimento contínuo.
 */
export const STATIC_PLATES = new Set([PLATES.olivarTarde, PLATES.olivarNoite]);
