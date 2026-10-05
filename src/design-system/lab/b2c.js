// CP1 only: existing native-dialog behavior, no product flow or network submission.
const menu = document.getElementById('menu-b2c');
let trigger;
let menuDestination;
const hero = document.querySelector('[data-pattern="cinematic-hero"]');
const slides = [...hero.querySelectorAll('.lx-home-hero__slide')];
const toggle = hero.querySelector('[data-carousel-toggle]');
const status = hero.querySelector('[data-carousel-status]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let current = 0;
let timer;

function setPlaying(playing) {
  window.clearInterval(timer);
  const active = playing && !reducedMotion.matches && !document.hidden;
  toggle.setAttribute('aria-label', active ? 'Pausar carrossel' : 'Reproduzir carrossel');
  toggle.setAttribute('aria-pressed', String(!active));
  status.setAttribute('aria-live', active ? 'off' : 'polite');
  // Same cadence as the implemented reference Home; never resume after a focus/manual pause.
  if (active) timer = window.setInterval(() => showSlide(current + 1), 8000);
}

function showSlide(index) {
  current = (index + slides.length) % slides.length;
  slides.forEach((slide, position) => slide.classList.toggle('lx-home-hero__slide--active', position === current));
  toggle.textContent = String(current + 1).padStart(2, '0');
  status.textContent = `Imagem ${current + 1} de ${slides.length}`;
}

hero.querySelector('[data-carousel-previous]').addEventListener('click', () => {
  setPlaying(false);
  showSlide(current - 1);
});
hero.querySelector('[data-carousel-next]').addEventListener('click', () => {
  setPlaying(false);
  showSlide(current + 1);
});
toggle.addEventListener('click', () => setPlaying(toggle.getAttribute('aria-pressed') === 'true'));
hero.addEventListener('focusin', () => setPlaying(false));
hero.addEventListener('mouseenter', () => setPlaying(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
reducedMotion.addEventListener('change', () => setPlaying(false));
setPlaying(true);

document.querySelectorAll('[data-lab-open-menu]').forEach((button) => {
  button.addEventListener('click', () => {
    trigger = button;
    menuDestination = undefined;
    setPlaying(false);
    menu.showModal();
  });
});
menu.querySelector('[data-lab-close-menu]').addEventListener('click', () => menu.close());
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menuDestination = document.querySelector(link.hash);
  menu.close();
}));
menu.addEventListener('close', () => {
  if (menuDestination) {
    menuDestination.setAttribute('tabindex', '-1');
    menuDestination.focus({ preventScroll: true });
    menuDestination.scrollIntoView({ block: 'start' });
  } else trigger?.focus();
});
document.querySelector('[data-cp1-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('form-status').textContent = 'Demonstração visual. Nenhum dado foi enviado.';
});
