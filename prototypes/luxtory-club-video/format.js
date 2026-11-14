// Demonstração conceitual — formatação pt-BR dos valores derivados (nenhum valor é digitado na tela).
import { FICTITIOUS } from './data.js';

const number = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FICTITIOUS.timeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const date = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FICTITIOUS.timeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Créditos: unidade interna, nunca formato monetário (BR-190, REQ-053). */
export const credits = (n) => number.format(n);
/** Dinheiro: centavos → "R$ 550,00" (TECH-033). Espaços do Intl normalizados para um espaço comum não separável. */
export const brl = (cents) => money.format(cents / 100).replace(/\s/u, ' ');
export const instant = (ms) => dateTime.format(ms).replace(',', '');
export const day = (ms) => date.format(ms);
/** '2027-06-04' → '04/06' */
export const civilShort = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const civilFull = (iso) => `${civilShort(iso)}/${iso.slice(0, 4)}`;
