// Demonstração conceitual — motor de tempo do palco. O estado de cada quadro é função pura de t (ms), o que torna a
// captura determinística (capture.mjs chama __demo.seek(t) quadro a quadro) e a prévia ao vivo igual ao render.
// Parâmetros: ?fmt=16x9|9x16 · ?t=<ms> (quadro fixo) · ?bg=plate (placa de prévia, só no navegador) ·
// ?play=1 (reprodução em tempo real também sob automação, usada só na comparação com gravação de tela).
import { build, timeline } from './sequence-request.js';

const query = new URLSearchParams(location.search);
const fmt = query.get('fmt') === '9x16' ? '9x16' : '16x9';
document.documentElement.dataset.fmt = fmt;
const stage = document.querySelector('[data-stage]');

if (query.get('bg') === 'plate') {
  const plate = document.createElement('img');
  plate.className = 'demo-plate';
  plate.alt = '';
  plate.src = '/public/images/home/hero/luxury-property-facade-hero.jpg';
  stage.prepend(plate);
}

build(stage, fmt);
const tl = timeline(fmt);

// Movimento só com os tokens do Core (§13.3): fade-up ≤ 8 px, durações e curvas do tokens.css.
const css = getComputedStyle(document.documentElement);
const tokenMs = (name) => parseFloat(css.getPropertyValue(name));
const tokenCurve = (name) =>
  cubicBezier(
    ...css
      .getPropertyValue(name)
      .match(/-?[\d.]+/g)
      .map(Number),
  );
const reduce =
  matchMedia('(prefers-reduced-motion: reduce)').matches && !query.has('t') && !navigator.webdriver;
const MOTION = {
  enter: reduce ? 0 : tokenMs('--lx-duration-slow'),
  exit: reduce ? 0 : tokenMs('--lx-duration-moderate'),
  tween: reduce ? 0 : tokenMs('--lx-duration-cinematic'),
  rise: reduce ? 0 : 8,
  ease: tokenCurve('--lx-ease-editorial'),
  easeExit: tokenCurve('--lx-ease-exit'),
};

/** Solução numérica de cubic-bezier(x1, y1, x2, y2) para progresso x ∈ [0, 1]. */
function cubicBezier(x1, y1, x2, y2) {
  const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

const $ = (sel) => {
  const el = stage.querySelector(sel);
  if (!el) throw new Error(`Elemento ausente na sequência: ${sel}`);
  return el;
};
const progress = (t, start, dur) =>
  dur <= 0 ? (t >= start ? 1 : 0) : Math.min(1, Math.max(0, (t - start) / dur));

function renderEnter(t, { sel, in: tIn, out: tOut, dur }) {
  const el = $(sel);
  const p = MOTION.ease(progress(t, tIn, dur ?? MOTION.enter));
  const q = tOut === undefined ? 0 : MOTION.easeExit(progress(t, tOut, MOTION.exit));
  const opacity = p * (1 - q);
  el.style.visibility = opacity > 0 ? 'visible' : 'hidden';
  el.style.opacity = String(opacity);
  el.style.transform = `translateY(${((1 - p) * MOTION.rise).toFixed(3)}px)`;
}

function renderSets(t) {
  const groups = new Map();
  for (const step of tl.set) {
    const key = `${step.sel}|${step.attr}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(step);
  }
  for (const steps of groups.values()) {
    const current = steps
      .filter((s) => s.at <= t)
      .sort((a, b) => a.at - b.at)
      .at(-1);
    const el = $(steps[0].sel);
    const { attr } = steps[0];
    const value = current ? current.value : null;
    if (attr === 'checked') el.checked = value === true;
    else if (value === null || value === false) el.removeAttribute(attr);
    else el.setAttribute(attr, value === true ? '' : value);
    if (attr === 'aria-busy') el.dataset.busyAt = current && value ? String(current.at) : '';
  }
}

function renderTweens(t) {
  for (const { sel, prop, at, from, to } of tl.tween) {
    const p = MOTION.ease(progress(t, at, MOTION.tween));
    $(sel).style.setProperty(prop, String(from + (to - from) * p));
  }
}

/** Animações CSS do DS (ex.: o indicador de ocupado do botão) também seguem o relógio da demonstração. */
function renderCssAnimations(t) {
  for (const animation of document.getAnimations()) {
    animation.pause();
    const target = animation.effect?.target;
    const start = Number(target?.dataset?.busyAt || 0);
    animation.currentTime = Math.max(0, t - start);
  }
}

function seek(t) {
  const time = Math.min(Math.max(0, t), tl.duration);
  for (const item of tl.enter) renderEnter(time, item);
  renderSets(time);
  renderTweens(time);
  renderCssAnimations(time);
  return time;
}

let playing = false;
let origin = 0;
let paused = 0;
function frame(now) {
  if (!playing) return;
  const t = seek(now - origin);
  if (t >= tl.duration) playing = false;
  else requestAnimationFrame(frame);
}
function play(from = 0) {
  origin = performance.now() - from;
  playing = true;
  requestAnimationFrame(frame);
}

document.addEventListener('keydown', (event) => {
  if (event.key === ' ') {
    event.preventDefault();
    if (playing) {
      playing = false;
      paused = performance.now() - origin;
    } else play(paused >= tl.duration ? 0 : paused);
  }
  if (event.key === 'r') play(0);
});

await document.fonts.ready;
window.__demo = { seek, fmt, duration: tl.duration, marks: tl.marks, ready: true };
if (query.has('t')) seek(Number(query.get('t')));
else if (navigator.webdriver && !query.has('play')) seek(0);
else play(0);
