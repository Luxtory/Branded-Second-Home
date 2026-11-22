// Trecho de QA do filme completo (direção v10): abertura, painel dos Créditos e a Request até a solicitação enviada —
// necessidade, calendário, depósito realizado, destinação e revisão. Os blocos são os do filme completo
// (edl-club-completo.js#blocks), sem cópia: o que este trecho mostra é o que o filme mostra. Só para inspeção antes do
// render completo; não é peça.
import { buildFilm } from './blocos.js';
import { blocks } from './edl-club-completo.js';

const LAST_SCENE = 'R5'; // solicitação enviada · Garantia

export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'qa-jornada',
    out: 'out/qa-jornada',
    audio: { modo: 'efeitos', vo: 'qa-jornada-vo', trilha: 'qa-jornada-trilha', trilhaIn: 0 },
    blocks: (f) => {
      const all = blocks(f);
      return all.slice(0, all.findIndex((b) => b.scene === LAST_SCENE) + 1);
    },
  });
