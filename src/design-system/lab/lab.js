// Design System Lab — minimal behavior, no dependencies. Reference for the future React wrappers:
// dialog menu (focus return), conditional reveal of approx. days (Co-Owner), reduced-motion toggle,
// and client-side demo validation (real validation happens server-side at the boundary).
(() => {
  const menu = document.getElementById('menu-mobile');
  let menuTrigger = null;

  document.querySelectorAll('[data-lab-open-menu]').forEach((button) => {
    button.addEventListener('click', () => {
      menuTrigger = button;
      menu.showModal();
    });
  });
  menu.querySelector('[data-lab-close-menu]').addEventListener('click', () => menu.close());
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => menu.close()));
  menu.addEventListener('close', () => menuTrigger?.focus());

  // Reduced motion simulation: mirrors prefers-reduced-motion via <html data-motion="reduce">.
  const motionToggle = document.querySelector('[data-lab-motion-toggle]');
  const motionStatus = document.querySelector('[data-lab-motion-status]');
  motionToggle.addEventListener('click', () => {
    const reduce = motionToggle.getAttribute('aria-pressed') !== 'true';
    motionToggle.setAttribute('aria-pressed', String(reduce));
    if (reduce) document.documentElement.dataset.motion = 'reduce';
    else delete document.documentElement.dataset.motion;
    motionStatus.textContent = reduce ? 'Movimento: reduzido.' : 'Movimento: preferência do sistema.';
  });

  // Interest form: approx. days exists only for Co-Owner (REQ-025); announced, focus stays put.
  const form = document.querySelector('[data-lab-interest-form]');
  const daysSlot = form.querySelector('[data-lab-days-slot]');
  const daysTemplate = form.querySelector('[data-lab-days-template]');
  const status = form.querySelector('[data-lab-form-status]');

  // Any edit after a submit clears the previous result (no stale success/failure message).
  form.addEventListener('input', () => status.replaceChildren());

  form.querySelectorAll('[data-lab-modality]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isCoOwner = form.elements.modalidade.value === 'co-owner';
      if (isCoOwner && !daysSlot.firstElementChild) daysSlot.append(daysTemplate.content.cloneNode(true));
      if (!isCoOwner) daysSlot.replaceChildren();
      showError('modalidade-erro', false);
    });
  });

  function showError(id, visible, control) {
    const message = document.getElementById(id);
    if (message) message.hidden = !visible;
    if (control) control.setAttribute('aria-invalid', String(visible));
    return visible;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const modality = form.elements.modalidade.value;
    const region = form.elements.regiao;
    const days = form.elements.dias;
    const errors = [
      showError('modalidade-erro', !modality) && form.querySelector('[data-lab-modality]'),
      showError('regiao-erro', !region.value, region) && region,
      days && showError('dias-erro', !/^[1-9]\d*$/.test(days.value.trim()), days) && days,
    ].filter(Boolean);

    if (errors.length) {
      status.replaceChildren();
      errors[0].focus();
      return;
    }
    status.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'lx-message lx-message--success';
    message.innerHTML = '<svg class="lx-message__icon" aria-hidden="true" focusable="false"><use href="#i-check"/></svg>'
      + '<p class="lx-message__title">Recebemos seu interesse.</p>'
      + '<p class="lx-message__body">Isso não é uma aquisição. A Luxtory entra em contato quando houver um próximo passo. (Demonstração: nada foi enviado.)</p>';
    status.append(message);
  });
})();
