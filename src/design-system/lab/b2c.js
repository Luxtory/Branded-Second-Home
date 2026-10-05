// CP1 only: existing native-dialog behavior, no product flow or network submission.
const menu = document.getElementById('menu-b2c');
let trigger;
document.querySelectorAll('[data-lab-open-menu]').forEach((button) => {
  button.addEventListener('click', () => {
    trigger = button;
    menu.showModal();
  });
});
menu.querySelector('[data-lab-close-menu]').addEventListener('click', () => menu.close());
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => menu.close()));
menu.addEventListener('close', () => trigger?.focus());
document.querySelector('[data-cp1-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('form-status').textContent = 'Demonstração visual. Nenhum dado foi enviado.';
});
