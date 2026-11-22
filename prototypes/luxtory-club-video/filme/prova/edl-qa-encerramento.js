// Trecho de QA do encerramento do filme completo (direção v10): um segundo do fundo, a família e a assinatura, com os
// blocos do próprio filme (edl-club-completo.js#blocks). Serve para conferir quadro a quadro que a logo só entra
// depois do dissolve, com o Moroccan Blue opaco. Só para inspeção antes do render completo; não é peça.
import { buildFilm } from './blocos.js';
import { blocks } from './edl-club-completo.js';
import { fundo } from './fundo.js';

const LEAD_MS = 1_000;

export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'qa-encerramento',
    out: 'out/qa-encerramento',
    audio: {
      modo: 'efeitos',
      vo: 'qa-encerramento-vo',
      trilha: 'qa-encerramento-trilha',
      trilhaIn: 0,
    },
    blocks: (f) => [
      { kind: 'moment', scene: 'Q0', dur: LEAD_MS, shot: fundo(f), contact: 500 },
      ...blocks(f).slice(-2),
    ],
  });
