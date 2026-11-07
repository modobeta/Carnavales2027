/* Maqueta local, sin API, almacenamiento ni integración con la votación real. */
(() => {
  const main = document.querySelector('main');
  const dialog = document.querySelector('#confirm-dialog');
  const dialogContent = document.querySelector('#dialog-content');
  const scenario = document.querySelector('#scenario');
  const troupes = ['Aimara', 'Ita Verá'];
  const items = ['Comisión de frente', 'Coreografía'];
  const icons = ['Comisión de frente.png', 'Coreografía de comparsa.png'];
  const examples = [8, 9, 7, 9];
  const state = { scores: [null, null, null, null], active: 0, closed: false, offline: false, error: false, empty: false, pending: null };
  const count = () => state.scores.filter(value => value !== null).length;
  const groupCount = group => state.scores.slice(group * 2, group * 2 + 2).filter(value => value !== null).length;
  const scoreText = value => value === 0 ? 'No se presentó (0)' : String(value);
  const button = (text, action, kind = '', disabled = false) => `<button class="button ${kind}" type="button" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}</button>`;
  const meter = (value, max, label) => `<div><div class="meter-label"><span>${label}</span><strong>${value} de ${max} puntuaciones</strong></div><div class="track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><span style="width:${value / max * 100}%"></span></div></div>`;

  function changeScreen(screen, focus = true) {
    history.replaceState(null, '', `#${screen}`);
    render();
    if (focus) main.focus();
  }

  function applyScenario(value) {
    Object.assign(state, { scores: [null, null, null, null], active: 0, closed: false, offline: false, error: false, empty: false, pending: null });
    let screen = 'inicio';
    if (['partial', 'offline', 'error'].includes(value)) { state.scores[0] = 8; state.active = 1; }
    if (value === 'troupe') { state.scores = [8, 9, null, null]; state.active = 2; }
    if (['ready', 'submitted'].includes(value)) state.scores = [...examples];
    if (value === 'ready') screen = 'revision';
    if (value === 'submitted') { state.closed = true; screen = 'confirmada'; }
    if (value === 'offline') { state.offline = true; screen = 'evaluacion'; }
    if (value === 'error') { state.error = true; state.pending = 9; screen = 'evaluacion'; }
    if (value === 'empty') state.empty = true;
    changeScreen(screen);
  }

  function warning() {
    if (state.offline) return `<section class="notice" role="alert"><strong>Sin conexión</strong><p>No se pueden confirmar puntuaciones ni cerrar la planilla. Las decisiones ya confirmadas se conservan.</p>${button('Simular recuperación de conexión', 'reconnect')}</section>`;
    if (state.error) return `<section class="notice error" role="alert"><strong>La puntuación no está confirmada</strong><p>No se pudo verificar el guardado de la nota ${state.pending}. Reintentá manualmente; el ítem sigue pendiente.</p>${button('Reintentar confirmación', 'retry')}</section>`;
    return '';
  }

  function home() {
    if (state.empty) return `<div class="page-title"><h1>Evaluación</h1></div><section class="empty-state"><h2>Todavía no tenés planillas habilitadas</h2><p>Cuando Administración habilite tu planilla, vas a encontrar acá la próxima comparsa a evaluar.</p></section>`;
    const resolved = count();
    const next = state.scores.findIndex(value => value === null);
    const currentGroup = next < 0 ? -1 : Math.floor(next / 2);
    const scoredGroups = [0, 1].filter(group => groupCount(group) === 2);
    let actionCard;
    if (state.closed) actionCard = `<section class="current-card"><div class="card-top"><p class="eyebrow">Sin tareas pendientes</p><span class="pill success">✓ Confirmada</span></div><h2 class="troupe-title" style="font-size:32px">Votación completada</h2><p class="muted">La planilla está cerrada. Podés consultar las puntuaciones.</p><a class="button" href="#confirmada">Ver planilla</a></section>`;
    else if (next < 0) actionCard = `<section class="current-card"><p class="eyebrow">Siguiente paso</p><h2 class="troupe-title" style="font-size:32px">Revisá y cerrá tu planilla</h2><p class="muted">Las dos comparsas están puntuadas. Falta confirmar el cierre definitivo.</p><a class="button primary" href="#revision">Revisar planilla <span aria-hidden="true">→</span></a></section>`;
    else actionCard = `<section class="current-card" aria-labelledby="current-troupe"><div class="card-top"><p class="eyebrow">Ahora · Salida ${currentGroup + 1}</p><span class="pill">${groupCount(currentGroup) ? 'En progreso' : 'Sin empezar'}</span></div><h2 class="troupe-title" id="current-troupe">${troupes[currentGroup]}</h2><p class="muted">${2 - groupCount(currentGroup)} ${groupCount(currentGroup) ? 'puntuación pendiente' : 'puntuaciones pendientes'}</p>${button(`${groupCount(currentGroup) ? 'Continuar' : 'Comenzar'} evaluación <span aria-hidden="true">→</span>`, 'start', 'primary')}<p class="subtle-note">Cada puntuación se confirma antes de avanzar.</p></section>`;
    const upcoming = currentGroup === 0 ? `<section class="side-section"><h2>Próxima</h2><ul class="compact-list"><li><span class="order-number" aria-hidden="true">2</span><div><h3>Ita Verá</h3><p>En espera · después de Aimara</p></div></li></ul></section>` : '';
    const evaluated = scoredGroups.length ? `<section class="side-section"><h2>${state.closed ? 'Evaluadas' : 'Puntuadas'}</h2><ul class="compact-list">${scoredGroups.map(group => `<li><span class="order-number" aria-hidden="true">✓</span><div><h3>${troupes[group]}</h3><p>${state.closed ? 'Planilla confirmada' : 'Incluida en el cierre de planilla'}</p></div></li>`).join('')}</ul></section>` : '';
    return `<div class="page-title"><h1>Evaluación</h1></div>${warning()}<section class="progress-overview" aria-label="Avance general"><div><strong>Avance de la planilla</strong><p>${state.closed ? 'Cierre confirmado' : resolved === 4 ? 'Puntuación completa · cierre pendiente' : 'El cierre se realiza al terminar ambas comparsas.'}</p></div>${meter(resolved, 4, 'Puntuaciones registradas')}</section><div class="home-grid">${actionCard}<aside aria-label="Orden de evaluación">${upcoming}${evaluated || (!upcoming ? '<p class="muted small">Las comparsas puntuadas aparecerán acá.</p>' : '')}</aside></div>`;
  }

  function sidebar() {
    return `<aside class="ballot-nav"><a class="text-link" href="#inicio">← Volver al inicio</a><nav aria-label="Ítems de la planilla"><h2>Orden de evaluación</h2><div class="nav-groups">${troupes.map((name, group) => `<section class="nav-group"><h3 class="nav-group-title">${name}<span>${group === 1 && groupCount(0) < 2 ? 'En espera' : groupCount(group) === 2 ? 'Puntuada' : 'En evaluación'}</span></h3><div class="item-list">${items.map((item, index) => {
      const absolute = group * 2 + index;
      const done = state.scores[absolute] !== null;
      return `<button type="button" data-index="${absolute}" ${absolute === state.active ? 'aria-current="step"' : ''} class="${done ? 'done' : ''}" ${group === 1 && groupCount(0) < 2 ? 'disabled' : ''}><span class="item-mark" aria-hidden="true">${done ? '✓' : '○'}</span>${item}<span class="sr-only">${done ? ', puntuación confirmada' : ', pendiente'}</span></button>`;
    }).join('')}</div></section>`).join('')}</div></nav></aside>`;
  }

  function evaluation() {
    if (state.empty) return home();
    if (state.closed) return review(true);
    const group = Math.floor(state.active / 2);
    const item = state.active % 2;
    const value = state.scores[state.active];
    const done = value !== null;
    const body = done ? `<section class="confirmed-score" role="status"><strong>${value === 0 ? '0' : value}</strong><div><strong>${value === 0 ? 'No se presentó' : 'Puntuación confirmada'}</strong><p>No se puede modificar. Esta confirmación es simulada.</p></div></section>` : `<fieldset class="score-field" ${state.offline || state.error ? 'disabled' : ''}><legend>Seleccioná la puntuación</legend><div class="score-grid">${Array.from({ length: 10 }, (_, index) => `<button type="button" data-score="${index + 1}" aria-label="Puntuar con ${index + 1}">${index + 1}</button>`).join('')}</div></fieldset><p class="decision-help">Vas a revisar y confirmar la nota antes de registrarla.</p><div class="absence">${button('Este ítem no se presentó', 'absent', '', state.offline || state.error)}${groupCount(group) === 0 ? button('Comparsa completa no se presentó', 'group-absent', '', state.offline || state.error) : ''}</div>`;
    let next;
    if (count() === 4) next = '<a class="button primary" href="#revision">Revisar planilla →</a>';
    else if (done && item === 1 && groupCount(group) === 2) next = button('Evaluar Ita Verá →', 'next', 'primary');
    else next = button('Siguiente →', 'next', done ? 'primary' : '', state.active === 3 || (state.active === 1 && groupCount(0) < 2));
    return `<div class="workspace">${sidebar()}<div class="workspace-main"><header class="evaluation-heading"><div><p class="eyebrow">Salida ${group + 1}</p><h1>${troupes[group]}</h1></div><span class="pill">${groupCount(group) === 2 ? 'Puntuada' : 'En evaluación'}</span></header>${warning()}<section class="local-progress" aria-label="Progreso de la comparsa">${meter(groupCount(group), 2, 'Esta comparsa')}</section><section class="item-card" aria-labelledby="active-item-heading"><div class="item-heading"><div><p class="eyebrow">Ítem a puntuar</p><h2 id="active-item-heading">${items[item]}</h2></div><img src="../../client/public/icons/items/${encodeURIComponent(icons[item])}" alt="" width="112" height="112"></div>${body}</section><nav class="item-navigation" aria-label="Navegación de ítems">${button('← Anterior', 'previous', 'quiet', state.active === 0)}<p>Ítem ${item + 1} de 2</p>${next}</nav>${groupCount(group) === 2 && count() < 4 ? '<p class="subtle-note">Esta comparsa está puntuada. El cierre definitivo incluye ambas comparsas.</p>' : ''}</div></div>`;
  }

  function resultsTable() {
    return `<table class="review-table"><caption class="sr-only">Puntuaciones de las dos comparsas incluidas en la planilla</caption><thead><tr><th scope="col">Ítem</th><th scope="col">Estado</th><th scope="col">Puntuación</th></tr></thead>${troupes.map((name, group) => `<tbody><tr class="group-row"><th colspan="3" scope="rowgroup">${name}</th></tr>${items.map((item, index) => `<tr><th scope="row">${item}</th><td>${state.scores[group * 2 + index] === null ? 'Pendiente' : 'Registrada'}</td><td><strong>${state.scores[group * 2 + index] === null ? '—' : scoreText(state.scores[group * 2 + index])}</strong></td></tr>`).join('')}</tbody>`).join('')}</table>`;
  }

  function review(readonly = false) {
    if (state.empty) return home();
    return `<a class="text-link" href="#inicio">← Volver al inicio</a><header class="review-heading"><h1>${readonly ? 'Planilla confirmada' : 'Revisá tu planilla'}</h1><p>${readonly ? 'Consulta de las puntuaciones definitivas.' : 'Este cierre incluye a Aimara e Ita Verá. No cierra una sola comparsa.'}</p></header>${warning()}${readonly ? '<section class="notice success" role="status"><strong>✓ Cierre confirmado · estado de ejemplo</strong><p>Las puntuaciones son de solo lectura. La aplicación real mostrará el resultado de la confirmación de la API.</p></section>' : ''}<div class="review-grid">${resultsTable()}<aside class="review-aside"><h2>${readonly ? 'Solo consulta' : 'Cierre definitivo'}</h2><p>${readonly ? 'No hay acciones de edición ni nuevos envíos disponibles.' : 'Las puntuaciones ya registradas no se pueden editar. Al cerrar, la planilla queda presentada con ambas comparsas.'}</p>${readonly ? '<span class="success-label">✓ Sin tareas pendientes</span><a class="button" href="#inicio">Ir al inicio</a>' : `<span class="${count() === 4 ? 'success-label' : 'muted small'}">${count() === 4 ? '✓ Ambas comparsas puntuadas' : 'Todavía hay puntuaciones pendientes'}</span>${button('Confirmar y cerrar planilla', 'close-ballot', 'primary', count() !== 4 || state.offline)}<p class="subtle-note">Se solicita una última confirmación.</p>`}</aside></div>`;
  }

  function render() {
    const screen = location.hash.slice(1) || 'inicio';
    main.innerHTML = screen === 'evaluacion' ? evaluation() : screen === 'revision' ? review(state.closed) : screen === 'confirmada' ? review(state.closed) : home();
    document.querySelectorAll('.preview-bar a').forEach(link => {
      if (link.hash === `#${screen}`) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const connection = document.querySelector('#connection');
    connection.classList.toggle('is-offline', state.offline);
    connection.innerHTML = `<span aria-hidden="true">${state.offline ? '△' : '●'}</span> ${state.offline ? 'Sin conexión' : 'Con conexión'}`;
  }

  function openConfirmation(value, groupAbsent = false) {
    if (state.offline || state.error || state.closed || state.scores[state.active] !== null) return;
    state.pending = value;
    const group = Math.floor(state.active / 2);
    dialogContent.innerHTML = `<p class="eyebrow">Confirmación de ${groupAbsent ? 'ausencia' : 'puntuación'}</p><h2 id="dialog-title">${groupAbsent ? '¿La comparsa no se presentó?' : '¿Confirmás esta decisión?'}</h2><p id="dialog-description">${groupAbsent ? 'Los dos ítems pendientes se registrarán con 0. Esta decisión no podrá modificarse.' : 'Esta puntuación no podrá modificarse después de confirmarla.'}</p><div class="dialog-context"><strong>${troupes[group]}</strong><p>${groupAbsent ? 'Comparsa completa · 2 ítems pendientes' : items[state.active % 2]}</p><div class="dialog-value">${value === 0 ? 'No se presentó' : value}</div></div><div class="dialog-actions">${button('Volver', 'cancel')}${button(groupAbsent ? 'Confirmar ausencia' : 'Confirmar nota', groupAbsent ? 'save-group' : 'save', 'primary')}</div>`;
    dialog.showModal();
  }

  document.addEventListener('click', event => {
    if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); return; }
    const previewLink = event.target.closest('.preview-bar a');
    if (previewLink?.hash === '#evaluacion' && state.closed) {
      event.preventDefault(); scenario.value = 'initial'; applyScenario('initial'); changeScreen('evaluacion'); return;
    }
    const score = event.target.closest('[data-score]');
    if (score) return openConfirmation(Number(score.dataset.score));
    const index = event.target.closest('[data-index]');
    if (index && !index.disabled) { state.active = Number(index.dataset.index); render(); main.focus(); return; }
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    switch (control.dataset.action) {
      case 'start': state.active = Math.max(0, state.scores.findIndex(value => value === null)); changeScreen('evaluacion'); break;
      case 'previous': state.active = Math.max(0, state.active - 1); render(); main.focus(); break;
      case 'next': state.active = Math.min(3, state.active + 1); render(); main.focus(); break;
      case 'absent': openConfirmation(0); break;
      case 'group-absent': openConfirmation(0, true); break;
      case 'cancel': dialog.close(); break;
      case 'save-group': {
        const start = Math.floor(state.active / 2) * 2;
        state.scores[start] = 0; state.scores[start + 1] = 0;
        dialog.close(); render(); main.focus(); break;
      }
      case 'save':
        if (state.offline || state.closed) return;
        state.scores[state.active] = state.pending;
        state.pending = null; state.error = false;
        dialog.close(); render(); main.focus(); break;
      case 'retry': {
        const pending = state.pending;
        state.error = false; render(); openConfirmation(pending); break;
      }
      case 'reconnect': state.offline = false; render(); main.focus(); break;
      case 'close-ballot':
        if (count() !== 4 || state.offline) return;
        dialogContent.innerHTML = `<p class="eyebrow">Planilla completa</p><h2 id="dialog-title">¿Confirmás el cierre definitivo?</h2><p id="dialog-description">Vas a presentar la planilla de Noche 1 · Baile. Incluye las dos comparsas, no solo la última evaluada.</p><div class="dialog-context"><strong>Aimara · Ita Verá</strong><p>4 puntuaciones registradas</p></div><div class="dialog-actions">${button('Volver a revisar', 'cancel')}${button('Confirmar y cerrar', 'submit', 'primary')}</div>`;
        dialog.showModal(); break;
      case 'submit':
        if (count() !== 4 || state.offline) return;
        state.closed = true; dialog.close(); scenario.value = 'submitted'; changeScreen('confirmada'); break;
    }
  });

  scenario.addEventListener('change', () => applyScenario(scenario.value));
  document.querySelector('#theme-toggle').addEventListener('click', event => {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    event.target.textContent = `Cambiar a tema ${dark ? 'oscuro' : 'claro'}`;
  });
  window.addEventListener('hashchange', () => {
    // Los accesos de presentación permiten revisar cada pantalla con datos coherentes.
    const screen = location.hash.slice(1);
    state.empty = false;
    if (screen === 'revision' || screen === 'confirmada') {
      state.scores = state.scores.map((value, index) => value ?? examples[index]);
      state.closed = screen === 'confirmada'; state.error = false; state.offline = false;
      scenario.value = state.closed ? 'submitted' : 'ready';
    }
    render(); main.focus();
  });
  const firstScreen = location.hash.slice(1);
  if (firstScreen === 'revision' || firstScreen === 'confirmada') {
    state.scores = [...examples]; state.closed = firstScreen === 'confirmada';
    scenario.value = state.closed ? 'submitted' : 'ready';
  }
  render();
})();
