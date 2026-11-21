// Demonstração conceitual — fundo editorial comum das simulações (Request, Direct e Luxplus; decisão de 2026-11-21).
// A fotografia original do hero da home (`lx-home-hero__image--1`), sem o overlay `lx-home-hero__scrim` e sem mudar a
// página: ambientação do Luxtory Club, nunca apresentada como a Azzura, a Satori ou a Olivar Home. Os nomes das Second
// Homes continuam só na interface. Um plano contínuo, sem alternar recortes: a casa como protagonista, piscina,
// iluminação da fachada e pôr do sol. Uma versão de maior resolução da mesma foto entra por out/entrada (HERO-<fmt>).
export const HERO = 'public/images/home/hero/luxury-property-facade-hero.jpg';

const MOVE = {
  // 16:9: a composição original (fonte 1672×941, ampliação ≈ 1,15×), com aproximação lenta e contida até 1,05.
  '16x9': { from: [0.5, 0.5, 1.0], to: [0.5, 0.5, 1.05], ease: 'smooth' },
  // 9:16: recorte A, escolhido entre três (faixa centrada em 55% da largura): chaminé e fachada acima dos cartões,
  // terraço e piscina abaixo, céu no alto. A fonte horizontal amplia ≈ 2× aqui (pendência: foto de maior resolução).
  '9x16': { from: [0.5, 0.5, 1.0], to: [0.5, 0.5, 1.04], ease: 'smooth', anchor: [0.573, 0.5] },
};

/** Plano do fundo editorial; os blocos seguintes da simulação usam `{ continue: true }` (sem corte). */
export const fundo = (fmt) => ({
  plan: 'HERO',
  asset: 'HERO',
  what: 'fundo editorial: hero da home, sem overlay (ambientação do Luxtory Club)',
  image: HERO,
  move: MOVE[fmt],
});
