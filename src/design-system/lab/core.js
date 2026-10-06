// Lab do Core Design System — comportamentos de demonstração, como melhoria progressiva: sem JS o conteúdo fica
// visível, o header não fica fixo e o carrossel mostra a primeira imagem. No app, cada comportamento é do componente
// React do shell (CP2 em diante). docs/specs/design-system.md §13.
(() => {
  const root = document.documentElement;
  root.setAttribute('data-lx-js', '');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReduced = () => reduceMotion.matches || root.getAttribute('data-motion') === 'reduce';

  // Menu / drawer: <dialog> nativo com showModal() — foco preso, Esc fecha, foco volta ao gatilho.
  for (const trigger of document.querySelectorAll('[data-lab-menu-open]')) {
    const dialog = document.getElementById(trigger.getAttribute('aria-controls'));
    if (!dialog) continue;
    trigger.addEventListener('click', () => {
      dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
    });
    dialog.addEventListener('close', () => {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
    dialog.querySelector('[data-lab-menu-close]')?.addEventListener('click', () => dialog.close());
    for (const link of dialog.querySelectorAll('a[href^="#"]')) link.addEventListener('click', () => dialog.close());
    // App shell: a gaveta fecha ao cruzar o lg (a navegação lateral assume) e o foco vai ao conteúdo.
    const lg = getComputedStyle(root).getPropertyValue('--lx-breakpoint-lg').trim();
    if (trigger.classList.contains('lx-app__menu-button') && lg) {
      window.matchMedia(`(min-width: ${lg})`).addEventListener('change', (event) => {
        if (!event.matches || !dialog.open) return;
        dialog.close();
        document.getElementById('conteudo')?.focus();
      });
    }
  }

  // Header sobre a mídia: fixo e sólido depois da primeira rolagem.
  const header = document.querySelector('[data-lab-header]');
  if (header) {
    const SOLID_AFTER_PX = 12;
    const sync = () => header.toggleAttribute('data-scrolled', window.scrollY > SOLID_AFTER_PX);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }

  // Cinematic Hero: carrossel pausável (WCAG 2.2.2); sem autoplay com movimento reduzido; pausa no hover e no foco.
  const carousel = document.querySelector('[data-lab-carousel]');
  if (carousel) {
    const INTERVAL_MS = 8000;
    const slides = [...carousel.querySelectorAll('.lx-hero__slide')];
    const counter = carousel.querySelector('[data-lab-counter]');
    const toggle = carousel.querySelector('[data-lab-toggle]');
    const pad = (value) => String(value).padStart(2, '0');
    let current = 0;
    let playing = !prefersReduced();
    let held = false;
    let timer = 0;
    const show = (index) => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.toggleAttribute('data-active', i === current));
      if (counter) counter.textContent = `${pad(current + 1)} / ${pad(slides.length)}`;
    };
    const schedule = () => {
      window.clearInterval(timer);
      if (playing && !held && slides.length > 1) timer = window.setInterval(() => show(current + 1), INTERVAL_MS);
    };
    const render = () => {
      toggle.setAttribute('aria-label', playing ? 'Pausar carrossel' : 'Reproduzir carrossel');
      toggle.setAttribute('aria-pressed', String(!playing));
      toggle.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
      schedule();
    };
    carousel.querySelector('[data-lab-prev]').addEventListener('click', () => { show(current - 1); schedule(); });
    carousel.querySelector('[data-lab-next]').addEventListener('click', () => { show(current + 1); schedule(); });
    toggle.addEventListener('click', () => { playing = !playing; render(); });
    const hold = (value) => () => { held = value; schedule(); };
    carousel.addEventListener('pointerenter', hold(true));
    carousel.addEventListener('pointerleave', hold(false));
    carousel.addEventListener('focusin', hold(true));
    carousel.addEventListener('focusout', (event) => { if (!carousel.contains(event.relatedTarget)) hold(false)(); });
    reduceMotion.addEventListener('change', () => { if (prefersReduced()) { playing = false; render(); } });
    show(0);
    render();
  }

  // Panel Switch: a escolha troca os valores (no app, o componente React da página).
  for (const panel of document.querySelectorAll('[data-lab-switch]')) {
    const cells = [...panel.querySelectorAll('[data-lab-value]')];
    panel.addEventListener('change', (event) => {
      const values = event.target.getAttribute('data-lab-values')?.split('|') ?? [];
      cells.forEach((cell, index) => { cell.textContent = values[index] ?? ''; });
    });
  }

  // Reveal: um fade-up único quando a seção entra na tela; nada com movimento reduzido.
  const revealables = document.querySelectorAll('[data-reveal]');
  if (revealables.length && 'IntersectionObserver' in window && !prefersReduced()) {
    const observer = new IntersectionObserver((records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        record.target.setAttribute('data-revealed', '');
        observer.unobserve(record.target);
      }
    }, { threshold: 0.15 });
    revealables.forEach((element) => observer.observe(element));
  } else {
    revealables.forEach((element) => element.setAttribute('data-revealed', ''));
  }

  // Formulários do Lab: só demonstração, nunca enviam.
  for (const form of document.querySelectorAll('[data-lab-form]')) form.addEventListener('submit', (event) => event.preventDefault());
})();
