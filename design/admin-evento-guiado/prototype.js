/* Solo presentación: sin fetch, almacenamiento, autenticación ni operaciones reales. */
(() => {
  const screen = document.querySelector('#screen');
  const dialog = document.querySelector('#confirmation');
  const feedback = document.querySelector('#feedback');
  const scenario = document.querySelector('#scenario');
  const stages = ['Evento', 'Evaluación', 'Comparsas', 'Revisión'];
  const hashes = ['evento', 'evaluacion', 'comparsas', 'revision'];
  let state;
  let pendingAction = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const button = (label, action, kind = '', disabled = false) => `<button type="button" class="${kind}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  const requiresParticipant = () => state.rubric?.target === 'participant';
  const substeps = () => [['Datos', 'Jornadas'], ['Rubros', 'Especialidades', 'Ítems'], requiresParticipant() ? ['Comparsas', 'Orden de salida', 'Participantes'] : ['Comparsas', 'Orden de salida'], []];
  const complete = () => [
    Boolean(state.eventName && state.nights.some(night => night.kind === 'COMPETITION')),
    Boolean(state.rubric && state.specialty && state.item),
    Boolean(state.troupe && state.nights.filter(night => night.kind === 'COMPETITION').every(night => state.scheduled.includes(night.id)) && state.nights.some(night => night.kind === 'COMPETITION') && (!requiresParticipant() || state.participant)),
    state.review === 'ready',
  ];
  const field = (label, name, value = '', extra = '', type = 'text') => `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
  const heading = (title, description) => `<header class="task-heading"><div><h1 tabindex="-1">${title}</h1><p>${description}</p></div></header>`;
  const actions = (label = 'Guardar y continuar') => `<div class="form-actions">${button('← Atrás', 'back', 'quiet')}<button class="primary" type="submit">${label}</button></div>`;
  const aside = (title, text) => `<aside class="task-aside"><h2>${title}</h2><p>${text}</p></aside>`;
  const layout = (body, side) => `<div class="task-layout"><section class="task-card">${body}</section>${side}</div>`;

  function reset(profile = 'new') {
    state = { stage: 0, sub: 0, eventName: '', nights: [], nightEditor: true, rubric: null, specialty: '', item: '', troupe: null, scheduled: [], participant: '', review: 'unqueried', finished: false };
    if (profile !== 'new') {
      Object.assign(state, { eventName: 'Carnavales 3037', nights: [{ id: 'night-1', name: 'Noche 1', kind: 'COMPETITION', date: '2026-11-07', order: 1 }], nightEditor: false, rubric: { name: 'Baile', target: 'troupe' }, stage: 1, sub: 1 });
    }
    if (['ready', 'blocked', 'error'].includes(profile)) {
      Object.assign(state, { stage: 3, sub: 0, specialty: 'Baile', item: 'Comisión de frente', troupe: { name: 'Aimara', category: 'Comparsa' }, scheduled: profile === 'blocked' ? [] : ['night-1'], review: profile === 'error' ? 'unavailable' : profile === 'blocked' ? 'blocked' : 'unqueried' });
    }
    navigate(state.stage, state.sub, false);
  }

  function navigate(stage, sub = 0, focus = true) {
    state.stage = Math.max(0, Math.min(3, stage));
    state.sub = Math.max(0, Math.min(sub, substeps()[state.stage].length - 1));
    feedback.textContent = '';
    history.replaceState(null, '', `#${hashes[state.stage]}`);
    render();
    if (focus) screen.querySelector('h1')?.focus();
  }

  function invalidateReview() { state.review = 'unqueried'; state.finished = false; }

  function confirm(title, description, action, label = 'Confirmar y guardar') {
    pendingAction = action;
    document.querySelector('#dialog-content').innerHTML = `<h2 id="dialog-title">${esc(title)}</h2><p id="dialog-description">${description}</p><div class="dialog-actions">${button('Volver', 'cancel')}${button(label, 'confirm', 'primary')}</div>`;
    dialog.showModal();
  }

  function eventScreen() {
    if (state.sub === 0) return heading('Identificá el evento', 'Empezá por el nombre. Después vamos a preparar el calendario.') + layout(`<form data-form="event">${field('Nombre del evento', 'eventName', state.eventName, 'required maxlength="150" placeholder="Ej.: Carnavales 3037"')}<div class="form-actions">${state.eventName ? button('Ver jornadas', 'nights', 'quiet') : ''}<button class="primary" type="submit">${state.eventName ? 'Guardar y continuar' : 'Crear y continuar'}</button></div></form>`, aside('Un paso por vez', 'Primero se crea el evento. No se abre la competencia ni se habilita la votación.'));
    const list = state.nights.map(night => `<li><span class="row-order">${night.order}</span><div class="row-body"><strong>${esc(night.name)}</strong><p>${night.kind === 'COMPETITION' ? 'Competencia' : 'Premiación'}${night.date ? ` · ${esc(night.date.split('-').reverse().join('/'))}` : ''}</p></div></li>`).join('');
    if (!state.nightEditor) return heading('Armá el calendario', 'Agregá las jornadas que va a tener el evento.') + layout(`<div class="list-heading"><h2>Jornadas guardadas</h2>${button('+ Agregar jornada', 'add-night', 'quiet')}</div><ul class="record-list">${list}</ul><div class="screen-actions">${button('← Datos del evento', 'back', 'quiet')}${button('Continuar con evaluación →', 'evaluation', 'primary', !complete()[0])}</div>${!complete()[0] ? '<p class="hint">Para completar esta etapa necesitás una jornada de competencia.</p>' : ''}`, aside('Jurados, después', 'Las asignaciones y la votación se preparan por jornada, fuera de este asistente.'));
    return heading('Agregá una jornada', 'Definí qué noche se realiza y si es de competencia o premiación.') + layout(`<form data-form="night">${field('Nombre de jornada', 'nightName', '', 'required placeholder="Ej.: Noche 1"')}<div class="field-row">${field('Fecha · opcional', 'nightDate', '', '', 'date')}<div class="field"><label for="nightKind">Tipo</label><select id="nightKind" name="nightKind"><option value="COMPETITION">Competencia</option><option value="AWARDS">Premiación</option></select></div></div><details class="advanced"><summary>Orden de visualización</summary>${field('Posición en las listas', 'nightOrder', state.nights.length + 1, 'required min="1" step="1"', 'number')}<p class="hint">No modifica el orden de salida de las comparsas.</p></details>${actions('Guardar jornada')}</form>`, aside('Calendario', state.nights.length ? `${state.nights.length} jornada${state.nights.length === 1 ? '' : 's'} guardada${state.nights.length === 1 ? '' : 's'}. Podés agregar más antes de seguir.` : 'Todavía no hay jornadas. Empezá por la primera noche de competencia.'));
  }

  function evaluationScreen() {
    if (state.sub === 0) return heading('Definí qué se evalúa', 'Agregá un rubro e identificá a quién se califica.') + layout(`<form data-form="rubric">${field('Nombre del rubro', 'rubricName', state.rubric?.name, 'required placeholder="Ej.: Baile"')}<div class="field"><label for="rubricTarget">¿A quién se evalúa?</label><select id="rubricTarget" name="rubricTarget"><option value="troupe" ${state.rubric?.target !== 'participant' ? 'selected' : ''}>A la comparsa</option><option value="participant" ${state.rubric?.target === 'participant' ? 'selected' : ''}>A un participante</option></select></div>${actions()}</form>`, aside('Lo que sigue', 'Después vas a crear la especialidad del jurado y los ítems puntuables de este rubro.'));
    if (state.sub === 1) return heading('Prepará las especialidades', 'La especialidad identifica el área de evaluación del jurado.') + layout(`<form data-form="specialty">${field('Nombre de la especialidad', 'specialtyName', state.specialty, 'required placeholder="Ej.: Baile"')}${actions()}</form>`, aside('Rubro guardado', esc(state.rubric?.name || 'Todavía no hay un rubro guardado.')));
    return heading('Agregá los ítems puntuables', 'Cada ítem se asigna a una especialidad.') + layout(`<form data-form="item"><p class="muted small">Rubro: <strong>${esc(state.rubric?.name || 'Sin configurar')}</strong></p>${field('Nombre del ítem', 'itemName', state.item, 'required placeholder="Ej.: Comisión de frente"')}<div class="field"><label for="itemSpecialty">Especialidad</label><select id="itemSpecialty" name="itemSpecialty" required>${state.specialty ? `<option>${esc(state.specialty)}</option>` : '<option value="">Primero creá una especialidad</option>'}</select></div>${actions()}</form>`, aside('Sin mezclar tareas', 'Los participantes y la programación de comparsas se preparan en la siguiente etapa.'));
  }

  function troupeScreen() {
    if (state.sub === 0) return heading('Agregá las comparsas', 'Cargá las comparsas que participan en este evento.') + layout(`<form data-form="troupe">${field('Nombre de la comparsa', 'troupeName', state.troupe?.name, 'required placeholder="Ej.: Aimara"')}<div class="field"><label for="troupeCategory">Tipo</label><select id="troupeCategory" name="troupeCategory"><option>Comparsa</option></select></div>${actions()}</form>`, aside('Después de guardar', 'Vas a elegir en qué jornadas participa y su orden de salida.'));
    if (state.sub === 1) {
      const nights = state.nights.filter(night => night.kind === 'COMPETITION');
      return heading('Programá el orden de salida', 'Elegí las jornadas de competencia en las que participa la comparsa.') + layout(`<form data-form="schedule">${state.troupe ? `<p><strong>${esc(state.troupe.name)}</strong></p><ul class="record-list">${nights.map(night => `<li><div class="row-body"><strong>${esc(night.name)}</strong><p>Salida 1</p></div><label class="small"><input type="checkbox" name="scheduled" value="${esc(night.id)}" ${state.scheduled.includes(night.id) ? 'checked' : ''} aria-label="Programar ${esc(state.troupe.name)} en ${esc(night.name)}"></label></li>`).join('')}</ul>` : '<p class="muted">Primero agregá una comparsa.</p>'}${actions('Guardar programación')}</form>`, aside('Orden por jornada', 'El orden de salida es independiente del orden de visualización del calendario.'));
    }
    return heading('Identificá al participante', 'Este rubro evalúa a un participante de la comparsa.') + layout(`<form data-form="participant"><p class="muted small">${esc(state.rubric?.name)} · ${esc(state.troupe?.name)}</p>${field('Nombre del participante', 'participantName', state.participant, 'required')}${actions()}</form>`, aside('Solo cuando corresponde', 'Este paso aparece porque el rubro evalúa a un participante.'));
  }

  function issues() {
    const list = [];
    const done = complete();
    if (!done[0]) list.push({ title: 'Falta completar el calendario del evento', text: 'Creá el evento y al menos una jornada de competencia.', stage: 0, sub: state.eventName ? 1 : 0 });
    if (!done[1]) list.push({ title: 'Falta completar la evaluación', text: 'Revisá rubros, especialidades e ítems puntuables.', stage: 1, sub: !state.rubric ? 0 : !state.specialty ? 1 : 2 });
    if (!done[2]) list.push({ title: state.troupe ? requiresParticipant() && !state.participant ? 'Falta identificar al participante' : 'Falta programar la comparsa' : 'Falta agregar una comparsa', text: 'La revisión necesita comparsas configuradas y programadas en las jornadas de competencia.', stage: 2, sub: !state.troupe ? 0 : requiresParticipant() && !state.participant ? 2 : 1 });
    return list;
  }

  function reviewScreen() {
    const summary = `<details class="review-details"><summary>Ver resumen de configuración</summary><ul><li>${state.nights.length} jornada${state.nights.length === 1 ? '' : 's'}</li><li>Rubro: ${esc(state.rubric?.name || 'Sin configurar')}</li><li>Especialidad: ${esc(state.specialty || 'Sin configurar')}</li><li>Ítem: ${esc(state.item || 'Sin configurar')}</li><li>Comparsa: ${esc(state.troupe?.name || 'Sin configurar')}</li></ul></details>`;
    if (state.review === 'ready') return `<section class="review-panel task-card"><div class="review-mark" aria-hidden="true">✓</div><h1 tabindex="-1">${state.finished ? 'Preparación finalizada' : 'El evento está listo para abrir'}</h1><p class="muted">La revisión de ejemplo no encontró bloqueos de preparación.</p><p class="hint">El evento sigue sin abrir. Jurados y votación se preparan después, por jornada.</p>${summary}<div class="screen-actions">${button('Volver a configurar', 'back', 'quiet')}${button(state.finished ? 'Volver a mis eventos' : 'Finalizar preparación', state.finished ? 'exit' : 'finish', 'primary')}</div></section>`;
    if (state.review === 'unavailable') return heading('No pudimos revisar la configuración', 'No vamos a marcar el evento como listo sin una revisión válida.') + `<section class="notice error review-panel" role="alert"><h2>La revisión no está disponible</h2><p>Tu configuración de ejemplo se conserva. Reintentá manualmente.</p>${button('Reintentar revisión', 'check', 'primary')}</section>`;
    if (state.review === 'blocked') {
      const missing = issues();
      const first = missing[0];
      return heading('Falta un paso para terminar', 'Resolvé el faltante y volvé a revisar la configuración.') + `<section class="notice review-panel" role="alert"><h2>${esc(first?.title || 'Revisá la configuración')}</h2><p>${esc(first?.text || 'Todavía hay datos pendientes.')}</p>${button('Resolver faltante →', 'resolve', 'primary')}${missing.length > 1 ? `<details class="review-details"><summary>Ver los otros ${missing.length - 1} faltantes</summary><ul>${missing.slice(1).map(item => `<li>${esc(item.title)}</li>`).join('')}</ul></details>` : ''}</section><div class="screen-actions">${button('Revisar nuevamente', 'check')}</div>`;
    }
    return heading('Revisá antes de terminar', 'Vamos a comprobar que la configuración permita abrir el evento.') + `<section class="task-card review-panel"><h2>Una última revisión</h2><p class="hint">Se revisan calendario, evaluación, comparsas y programación. Los jurados y la apertura de votación quedan fuera de este asistente.</p>${summary}<div class="screen-actions">${button('← Volver a comparsas', 'back', 'quiet')}${button('Revisar configuración', 'check', 'primary')}</div></section>`;
  }

  function render() {
    const done = complete();
    const count = done.filter(Boolean).length;
    document.querySelector('#event-name').textContent = state.eventName || 'Nuevo evento';
    document.querySelector('#event-state').textContent = state.eventName ? state.review === 'ready' ? 'Listo para abrir · sin abrir' : 'En preparación' : 'Sin crear';
    document.querySelector('#progress-count').textContent = `${count} de 4 etapas completas`;
    document.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(count));
    document.querySelector('#progress-fill').style.width = `${count * 25}%`;
    document.querySelector('#stepper').innerHTML = stages.map((label, index) => `<li class="${done[index] ? 'is-complete' : ''}"><button type="button" data-stage="${index}" ${state.stage === index ? 'aria-current="step"' : ''}><span class="step-number" aria-hidden="true">${done[index] ? '✓' : index + 1}</span><span>${label}<small>${done[index] ? 'Completa' : state.stage === index ? 'Actual' : 'Pendiente'}</small></span></button></li>`).join('');
    const tabs = substeps()[state.stage];
    const tabBar = tabs.length ? `<nav class="substeps" aria-label="Tareas de ${stages[state.stage]}">${tabs.map((label, index) => `<button type="button" data-sub="${index}" ${state.sub === index ? 'aria-current="step"' : ''}>${label}</button>`).join('')}</nav>` : '';
    if (!state.eventName && (state.stage > 0 || state.sub > 0)) {
      screen.innerHTML = heading('Primero creá el evento', 'Necesitás un evento para guardar su configuración.') + button('Ir a datos del evento', 'start', 'primary');
      return;
    }
    screen.innerHTML = tabBar + [eventScreen, evaluationScreen, troupeScreen, reviewScreen][state.stage]();
  }

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const value = name => String(data.get(name) || '').trim();
    const saved = (apply, stage, sub = 0) => { invalidateReview(); apply(); navigate(stage, sub); feedback.textContent = 'Cambios guardados en la maqueta. No se enviaron datos.'; };
    switch (form.dataset.form) {
      case 'event': {
        const name = value('eventName');
        if (!name) return;
        const apply = () => saved(() => { state.eventName = name; }, 0, 1);
        if (state.eventName && name !== state.eventName) confirm('¿Guardar el nombre del evento?', `Se cambiará a <strong>${esc(name)}</strong>.`, apply);
        else apply();
        break;
      }
      case 'night': {
        if (!value('nightName')) return;
        const night = { id: `night-${state.nights.length + 1}`, name: value('nightName'), date: value('nightDate'), kind: value('nightKind'), order: Number(value('nightOrder')) };
        confirm('¿Crear esta jornada?', `<strong>${esc(night.name)}</strong>${night.date ? ` · ${esc(night.date)}` : ''}. Se guardará como jornada de ${night.kind === 'COMPETITION' ? 'competencia' : 'premiación'}.`, () => saved(() => { state.nights.push(night); state.nightEditor = false; }, 0, 1), 'Crear jornada');
        break;
      }
      case 'rubric': if (value('rubricName')) confirm('¿Guardar el rubro?', `Rubro: <strong>${esc(value('rubricName'))}</strong>.`, () => saved(() => { state.rubric = { name: value('rubricName'), target: value('rubricTarget') }; }, 1, 1)); break;
      case 'specialty': if (value('specialtyName')) confirm('¿Guardar la especialidad?', `<strong>${esc(value('specialtyName'))}</strong>.`, () => saved(() => { state.specialty = value('specialtyName'); }, 1, 2)); break;
      case 'item':
        if (!state.rubric) { feedback.textContent = 'Primero guardá un rubro para agregarle ítems.'; return; }
        if (value('itemName') && value('itemSpecialty')) confirm('¿Guardar el ítem?', `<strong>${esc(value('itemName'))}</strong> · ${esc(value('itemSpecialty'))}.`, () => saved(() => { state.item = value('itemName'); }, 2, 0));
        break;
      case 'troupe': if (value('troupeName')) confirm('¿Guardar la comparsa?', `<strong>${esc(value('troupeName'))}</strong>.`, () => saved(() => { state.troupe = { name: value('troupeName'), category: value('troupeCategory') }; }, 2, 1)); break;
      case 'schedule': {
        const selected = data.getAll('scheduled');
        if (!state.troupe || !selected.length) { feedback.textContent = 'Seleccioná una jornada para programar la comparsa.'; return; }
        confirm('¿Guardar la programación?', `<strong>${esc(state.troupe.name)}</strong> se programará en ${selected.length} jornada${selected.length === 1 ? '' : 's'}.`, () => saved(() => { state.scheduled = selected; }, requiresParticipant() ? 2 : 3, requiresParticipant() ? 2 : 0));
        break;
      }
      case 'participant':
        if (!state.troupe) { feedback.textContent = 'Primero guardá la comparsa del participante.'; return; }
        if (value('participantName')) confirm('¿Guardar al participante?', `<strong>${esc(value('participantName'))}</strong> · ${esc(state.troupe.name)}.`, () => saved(() => { state.participant = value('participantName'); }, 3));
        break;
    }
  });

  document.addEventListener('click', event => {
    if (event.target.closest('.skip-link')) { event.preventDefault(); document.querySelector('main').focus(); return; }
    const stage = event.target.closest('[data-stage]');
    if (stage) return navigate(Number(stage.dataset.stage));
    const sub = event.target.closest('[data-sub]');
    if (sub) return navigate(state.stage, Number(sub.dataset.sub));
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    switch (control.dataset.action) {
      case 'start': navigate(0); break;
      case 'nights': navigate(0, 1); break;
      case 'add-night': state.nightEditor = true; navigate(0, 1); break;
      case 'evaluation': navigate(1); break;
      case 'back': if (state.sub > 0) navigate(state.stage, state.sub - 1); else navigate(Math.max(0, state.stage - 1), substeps()[Math.max(0, state.stage - 1)].length - 1); break;
      case 'confirm': { const action = pendingAction; pendingAction = null; dialog.close(); action?.(); break; }
      case 'cancel': dialog.close(); pendingAction = null; break;
      case 'check': state.review = issues().length ? 'blocked' : 'ready'; navigate(3); break;
      case 'resolve': { const issue = issues()[0]; if (issue) navigate(issue.stage, issue.sub); break; }
      case 'finish': state.finished = true; render(); screen.querySelector('h1')?.focus(); break;
      case 'exit': confirm('Guardar y salir · vista de ejemplo', 'La aplicación real conservará lo aceptado por la API. Esta maqueta no guarda datos ni navega al catálogo real.', () => { feedback.textContent = 'Salida simulada. No se creó ni se abrió un evento real.'; }, 'Entendido'); break;
      case 'demo-signout': confirm('Salida de sesión · vista de ejemplo', 'En esta maqueta no hay una sesión real. La aplicación conservará su salida de sesión actual.', () => {} , 'Entendido'); break;
      case 'close-navigation': document.querySelector('#navigation').hidden = true; document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false'); break;
    }
  });
  scenario.addEventListener('change', () => reset(scenario.value));
  document.querySelector('#theme-toggle').addEventListener('click', event => {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    event.target.textContent = `Cambiar a tema ${dark ? 'oscuro' : 'claro'}`;
  });
  document.querySelector('.menu-toggle').addEventListener('click', event => {
    const nav = document.querySelector('#navigation');
    nav.hidden = !nav.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!nav.hidden));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || dialog.open) return;
    const account = document.querySelector('.account');
    if (account.open) { account.open = false; account.querySelector('summary').focus(); }
    const nav = document.querySelector('#navigation');
    if (!nav.hidden) { nav.hidden = true; document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false'); document.querySelector('.menu-toggle').focus(); }
  });
  const initialStage = hashes.indexOf(location.hash.slice(1));
  const initialProfile = initialStage >= 2 ? 'ready' : initialStage === 1 ? 'progress' : 'new';
  scenario.value = initialProfile;
  reset(initialProfile);
  if (initialStage > 0) navigate(initialStage, initialStage === 1 ? 1 : 0, false);
})();
