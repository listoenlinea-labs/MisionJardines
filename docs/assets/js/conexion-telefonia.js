(() => {
  const form = document.querySelector('[data-form="TELEFONIA"]');
  if (!form) return;
  const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  if (!token) return;
  fetch('https://api-misionjardines.listoenlinea.host/api/telefonia/modo', {
    headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
  }).then(async response => {
    const mode = await response.json();
    if (!response.ok || !mode.ok) throw new Error('No se pudo consultar el modo de llamadas.');
    if (!mode.habilitada) return;
    const card = form.closest('article');
    card.querySelector('.eyebrow').textContent = 'Telefonía · Caseta';
    card.querySelector('.head p').textContent = 'Llamadas desde el navegador mediante la línea de la caseta.';
    form.hidden = true;
    form.style.display = 'none';
    const description = document.createElement('p');
    description.className = 'body';
    description.textContent = 'La telefonía está seleccionada. Puedes iniciar y finalizar llamadas desde el conmutador.';
    card.appendChild(description);
  }).catch(error => {
    const status = form.querySelector('[data-status]');
    if (status) status.textContent = error.message;
  });
})();
