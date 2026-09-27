// Lab — gaveta do App Shell de demonstração. No app, o comportamento é o do AppShellMenu (React): showModal, Esc,
// foco devolvido ao botão e fechamento ao cruzar o lg com o foco no conteúdo (ADR-0009).
(() => {
  const menu = document.getElementById('menu-app');
  if (!menu) return;
  const open = document.querySelector('[data-lab-app-open]');
  open.addEventListener('click', () => {
    menu.showModal();
    open.setAttribute('aria-expanded', 'true');
  });
  menu.addEventListener('close', () => open.setAttribute('aria-expanded', 'false'));
  menu.querySelector('[data-lab-app-close]').addEventListener('click', () => menu.close());
  const lg = getComputedStyle(document.documentElement).getPropertyValue('--lx-breakpoint-lg').trim();
  window.matchMedia(`(min-width: ${lg})`).addEventListener('change', (event) => {
    if (!event.matches || !menu.open) return;
    menu.close();
    document.getElementById('conteudo').focus();
  });
})();
