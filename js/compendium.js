/* Compendio: referencia completa (clases, monstruos, combinaciones, sucesos, botin, artefactos
   y reglas). Los numeros salen de VA_DATA y se ajustan a la duracion de partida, asi que no
   puede quedar desactualizado respecto de las tablas. Los textos de "como funciona" describen
   lo que hace esta implementacion (ver README), no solo el documento de diseno. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sprite(icon, size) {
    return global.VA_PIXEL ? global.VA_PIXEL.sprite(icon, size || 'md') : esc(icon);
  }

  var state = { tab: 'clases', duration: D.DEFAULT_DURATION };

  /* ---------------- Utilidades de maquetado ---------------- */

  function entry(icon, title, sub, stats, body) {
    return '<article class="cmp-entry">' +
      '<div class="cmp-entry-head">' +
        (icon ? '<span class="cmp-portrait">' + sprite(icon, 'md') + '</span>' : '') +
        '<div><h4>' + esc(title) + '</h4>' + (sub ? '<div class="cmp-sub">' + sub + '</div>' : '') + '</div>' +
      '</div>' +
      (stats && stats.length ? '<dl class="cmp-stats">' + stats.map(function (st) {
        return '<div><dt>' + esc(st[0]) + '</dt><dd>' + st[1] + '</dd></div>';
      }).join('') + '</dl>' : '') +
      (body ? '<div class="cmp-text">' + body + '</div>' : '') +
    '</article>';
  }

  function box(title, html) {
    return '<section class="cmp-box"><h4>' + esc(title) + '</h4>' + html + '</section>';
  }

  function durationLine() {
    var d = D.durationOf(state.duration);
    return '<p class="cmp-duration">Valores para la duracion <strong>' + esc(d.name) + '</strong>. ' +
      'Cambiala en la preparacion de la partida (ver pestana Reglas).</p>';
  }

  var SUITS = { negra: ['picas', 'treboles'], roja: ['corazones', 'diamantes'] };

  /* Carta en miniatura para los ejemplos: [valor, 'negra'|'roja'] */
  function miniCards(cards) {
    return '<span class="cmp-cards">' + cards.map(function (c, i) {
      var suit = SUITS[c[1]][i % 2];
      var svg = global.VA_PIXEL ? global.VA_PIXEL.suitSvg(suit) : '';
      return '<span class="mini-card' + (c[1] === 'roja' ? ' red' : '') + '"><b>' + c[0] + '</b>' + svg + '</span>';
    }).join('') + '</span>';
  }

  /* ---------------- Clases ---------------- */

  var CLASS_NOTES = {
    gladiador: 'El +3 tambien cuenta contra monstruos.',
    espejo: 'Solo refleja ataques de otros jugadores, no penalizaciones de monstruo. No puede equipar el Nucleo de Acero.',
    cleptomano: 'Roba al azar a un rival que tenga cartas. Mano Fria bloquea ese robo. Todos los monstruos tienen +4 HP contra el.',
    taumaturgo: 'El -4 tambien cuenta contra monstruos. Un ataque nunca hace menos de 1 de dano.',
    alquimista: 'Ejemplo: un 5 rojo dentro de un Ataque cuenta como 3 (70% redondeado hacia abajo).',
    sanguinario: 'Con el Anillo del Vampiro recupera 1 HP por cada 4 de dano en vez de 5.'
  };

  function renderClasses() {
    return durationLine() + '<div class="cmp-grid">' + Object.keys(D.CLASSES).map(function (id) {
      var c = D.CLASSES[id];
      return entry(c.icon, c.name, '', [
        ['HP', '<strong>' + D.classMaxHp(id, state.duration) + '</strong>'],
        ['Pasiva', esc(c.summary)],
        ['Desventaja', esc(c.drawback)]
      ], '<p>' + esc(CLASS_NOTES[id] || '') + '</p>');
    }).join('') + '</div>';
  }

  /* ---------------- Monstruos ---------------- */

  var REWARD_NOTES = {
    loot2: '2 cartas de Botin al azar (4 con Cofre Mimetico).',
    artifact: '1 Artefacto al azar (2 con Cofre Mimetico). Si ya tienes 3, recibes su precio en Monedas.',
    maxhp: 'Eliges: +15 HP maximo permanente, o 3 Cartas Raras (Botin o Artefactos al azar). Con Cofre Mimetico, +30 o 6.'
  };

  function renderMonsters() {
    var d = D.durationOf(state.duration);
    var cards = Object.keys(D.MONSTERS).map(function (id) {
      var m = D.MONSTERS[id];
      var hp = D.monsterHp(id, state.duration);
      var pen = D.monsterPenalty(id, state.duration);
      var stats = [
        ['HP', '<strong>' + hp + '</strong>' + (hp !== m.hp ? ' <span class="cmp-muted">(original ' + m.hp + ')</span>' : '')],
        ['Huir o perder', '<span class="danger-text">-' + pen + ' HP</span>' + (m.fleeStealsCard ? ' y un rival te roba 1 carta' : '')],
        ['Recompensa', esc(REWARD_NOTES[m.rewardType])]
      ];
      /* La referencia del documento original solo tiene sentido con el HP original. */
      if (hp === m.hp) stats.push(['Dificultad (diseno original)', esc(m.minLabel)]);
      return entry(m.icon, m.name, '', stats, '');
    }).join('');
    var rules = '<ul>' +
      '<li>Hay 1 de cada monstruo en el mazo de cada jugador.</li>' +
      (d.monstersWait
        ? '<li>Si robas un monstruo, <strong>te espera hasta que termines de robar</strong>: lo enfrentas con la mano completa.</li>'
        : '<li>Si robas un monstruo, el robo se corta y lo enfrentas con las cartas que tengas en ese momento.</li>') +
      '<li><strong>Combatir</strong>: eliges cartas de tu mano y formas un Ataque (cartas negras; el Alquimista tambien rojas al 70%). Si el dano iguala o supera su HP, muere y ganas la recompensa.</li>' +
      '<li><strong>Huir</strong>, o perder el combate: sufres la penalizacion y el monstruo vuelve a tu mazo en un lugar al azar.</li>' +
      (d.monsterWounds
        ? '<li><strong>El dano se acumula</strong>: si sobrevive, vuelve a tu mazo herido y la proxima vez tiene menos HP.</li>'
        : '<li>El dano no se acumula: cada encuentro empieza con el HP completo.</li>') +
      '<li>Derrotar <strong>cualquier</strong> monstruo abre la Tienda para todos los jugadores.</li>' +
      '<li>Modificadores de HP: +4 contra el Cleptomano, +5 mientras haya un Cofre Mimetico activo.</li>' +
      '<li>Si no tienes ninguna carta de ataque no puedes combatir; si encima no puedes huir (Llamada de la Caceria), pierdes automaticamente.</li>' +
      '<li>El Reloj de Arena puede anular la penalizacion; la Daga de Sacrificio suma +15 al combate.</li>' +
      '</ul>';
    return durationLine() + '<div class="cmp-grid">' + cards + '</div>' + box('Como funcionan', rules) + renderWanderer();
  }

  /* Gusano Suplicante: no es un monstruo del mazo sino una criatura errante (agregado propio). */
  function renderWanderer() {
    var W = global.VA_WANDERERS;
    if (!W) return '';
    var w = W.stats(state.duration);
    var art = global.VA_FX ? '<div class="wanderer-art cmp-worm">' + global.VA_FX.wormSvg('beg') + '</div>' : '';
    return box('Criatura errante: ' + w.name, art +
      '<ul>' +
      '<li>No es una carta: al terminar de robar tu mano hay un ' + Math.round(D.WANDERERS.gusano.chance * 100) +
      '% de probabilidad de que salga de la tierra (nunca en la primera vuelta de la mesa). No se combate.</li>' +
      '<li><strong>Alimentarlo</strong>: le das cartas de tu mano que sumen al menos ' + w.feedNeed +
      ' (se descartan). Te cura <strong>+' + w.heal + ' HP</strong>; lo que no te quepa se vuelve HP maximo permanente, hasta <strong>+' +
      w.maxHpBonusCap + '</strong> en toda la partida.</li>' +
      '<li><strong>Negarte</strong>, o no poder: se lleva el <span class="danger-text">' + Math.round(w.coinsTakenPct * 100) +
      '% de tus Monedas</span> (redondeado hacia arriba). Sin monedas, te muerde: <span class="danger-text">-' + w.bite +
      ' HP</span>, sin bajarte nunca de 1.</li>' +
      '<li>Agregado propio: no esta en el Marco de Diseno v3.3.</li>' +
      '</ul>');
  }

  /* ---------------- Combinaciones ---------------- */

  var HAND_INFO = {
    carta_suelta: { formula: 'valor de la carta', min: 1, example: [[4, 'negra']] },
    duo: { formula: '5 + valor', min: 1, example: [[3, 'negra'], [3, 'negra']] },
    doble_duo: { formula: '10 + valor de la pareja mas alta', min: 2, example: [[5, 'negra'], [5, 'negra'], [2, 'negra'], [2, 'negra']] },
    tercia: { formula: '15 + valor', min: 1, example: [[4, 'negra'], [4, 'negra'], [4, 'negra']] },
    escalera: { formula: 'fijo (1-2-3-4-5)', min: null, example: [[1, 'negra'], [2, 'negra'], [3, 'negra'], [4, 'negra'], [5, 'negra']] },
    full_house: { formula: '22 + valor de la tercia', min: 1, example: [[3, 'negra'], [3, 'negra'], [3, 'negra'], [1, 'negra'], [1, 'negra']] },
    poker: { formula: '28 + valor', min: 1, example: [[2, 'negra'], [2, 'negra'], [2, 'negra'], [2, 'negra']] },
    quinta: { formula: '35 + valor', min: 1, example: [[5, 'negra'], [5, 'negra'], [5, 'negra'], [5, 'negra'], [5, 'negra']] }
  };
  var HEAL_DOWNGRADE = { escalera: 'Carta Suelta', poker: 'Tercia', quinta: 'Full House' };

  function renderHands() {
    var rows = D.HAND_LEVELS.map(function (l) {
      var info = HAND_INFO[l.id];
      var range = l.fixed !== undefined ? String(l.fixed) : (l.floor + info.min) + '-' + (l.floor + 5);
      var heal = l.healable ? range : '<span class="cmp-muted">no: cuenta como ' + HEAL_DOWNGRADE[l.id] + '</span>';
      return '<tr><td data-label="Mano"><strong>' + esc(l.name) + '</strong></td><td data-label="Ejemplo">' + miniCards(info.example) + '</td>' +
        '<td data-label="Formula">' + esc(info.formula) + '</td><td data-label="Ataque">' + range + '</td><td data-label="Curacion">' + heal + '</td></tr>';
    }).join('');
    var table = '<div class="tut-table-wrap"><table class="tut-table cmp-hands">' +
      '<tr class="cmp-head-row"><th>Mano</th><th>Ejemplo</th><th>Formula</th><th>Ataque</th><th>Curacion</th></tr>' + rows +
      '</table></div>';
    var notes = '<ul>' +
      '<li><strong>Ataque</strong> usa cartas negras (&spades; &clubs;) y <strong>Curacion</strong> cartas rojas (&hearts; &diams;). Las parejas, tercias, etc. son cartas del mismo valor y color; el palo da igual.</li>' +
      '<li>Eliges las cartas y el juego arma solo la mejor combinacion posible con ellas.</li>' +
      '<li>Todas las cartas que marques se descartan, aunque no entren en la combinacion. Las del color contrario no suman nada (salvo para el Alquimista, al 70%).</li>' +
      '<li>Escalera, Poker y Quinta solo existen como Ataque: si curas con ellas bajan a la mano indicada.</li>' +
      '<li>Despues de la formula se aplican los modificadores: Gladiador +3, Taumaturgo -4 al atacar y x1.5 al curar, Daga +15, Nucleo de Acero del defensor -3 (minimo 1).</li>' +
      '<li>Al final de tu turno, las cartas que no combinan con ninguna otra de tu mano (sueltas) se pueden cambiar por Monedas iguales a su valor.</li>' +
      '</ul>';
    var order = '<ol>' +
      '<li>Valor base de la mano (tabla de arriba).</li>' +
      '<li>Materiales (no implementados en esta version).</li>' +
      '<li>Clase: Gladiador +3, Taumaturgo -4 (o x1.5 al curar).</li>' +
      '<li>Botin: Daga de Sacrificio +15.</li>' +
      '<li>Defensa: Nucleo de Acero -3 (minimo 1).</li>' +
      '<li>Reflejo: Espejo devuelve el 25% (max 8); Espejo Roto devuelve el 50%.</li>' +
      '<li>Vampirismo del Sanguinario.</li>' +
      '</ol>';
    return table + box('Reglas de las manos', notes) + box('Orden de calculo del dano', order);
  }

  /* ---------------- Sucesos ---------------- */

  var EVENT_NOTES = {
    vortice: 'Cambia el sentido en que pasan los turnos.',
    caceria: 'Saca el proximo monstruo de tu mazo y te obliga a combatirlo. Si no tienes cartas de ataque, pierdes automaticamente.',
    impuesto: 'La mitad de tus Monedas (redondeada hacia abajo) va al siguiente jugador en el orden de turnos.',
    cofre: 'Mientras este activo, todos los monstruos tienen +5 HP. Se consume al derrotar uno, que da recompensa doble.',
    mercado: 'Cada jugador elige 1 carta de su mano y se la pasa al jugador de su izquierda.',
    niebla: 'Dura una ronda completa: un turno de cada jugador vivo.'
  };

  function renderEvents() {
    var d = D.durationOf(state.duration);
    var intro = '<p class="cmp-intro">Hay 6 Sucesos en cada mazo. Se activan solos al robarlos, se descartan y robas otra carta en su lugar (no ocupan sitio en tu mano).' +
      (d.monstersWait ? ' En esta duracion, el monstruo de la Llamada de la Caceria llega al terminar de robar.' : '') + '</p>';
    return intro + '<div class="cmp-grid">' + Object.keys(D.EVENTS).map(function (id) {
      var e = D.EVENTS[id];
      return entry(e.icon, e.name, '', [], '<p>' + esc(e.desc) + '</p><p class="cmp-muted">' + esc(EVENT_NOTES[id] || '') + '</p>');
    }).join('') + '</div>';
  }

  /* ---------------- Botin ---------------- */

  var LOOT_NOTES = {
    yep: { what: 'Cancela una Mano Fria o un Espejo Roto que un rival tenga activos.', how: 'Aparece un boton "Yep!" sobre tu ficha cuando hay algo que cancelar.' },
    mano_fria: { what: 'Te protege del proximo robo de carta del Cleptomano.', how: 'Se activa en tu turno, desde la barra de botin.' },
    transfusion: { what: 'Pierdes 6 HP y robas 3 cartas. No se puede usar con 6 HP o menos.', how: 'Se activa en tu turno, desde la barra de botin.' },
    daga: { what: '+15 de dano a un ataque (contra un jugador o un monstruo) y pierdes 4 HP. No se puede usar con 4 HP o menos.', how: 'Casilla "Usar Daga" al declarar un ataque o al combatir a un monstruo.' },
    espejo_roto: { what: 'El proximo ataque de un jugador que recibas devuelve el 50% al atacante.', how: 'Se activa en tu turno, desde la barra de botin.' },
    bolsa_oro: { what: 'Vale 20 Monedas.', how: 'Se canjea en la Tienda. No se compra: sale como recompensa.' }
  };

  function renderLoot() {
    var intro = '<p class="cmp-intro">Cartas de un solo uso: se gastan al usarlas. Se compran en la Tienda o salen como recompensa de monstruo. Con Niebla de Guerra activa no se pueden usar (la Bolsa de Oro si se puede canjear).</p>';
    return intro + '<div class="cmp-grid">' + Object.keys(D.LOOT).map(function (id) {
      var l = D.LOOT[id];
      var n = LOOT_NOTES[id] || {};
      return entry(l.icon, l.name, l.price === null ? 'No se vende' : l.price + ' Monedas', [
        ['Efecto', esc(n.what || l.desc)],
        ['Como se usa', esc(n.how || '')]
      ], '');
    }).join('') + '</div>';
  }

  /* ---------------- Artefactos ---------------- */

  var ARTIFACT_NOTES = {
    calculadora: 'En esta version la vista previa del dano y la curacion se muestra siempre, asi que no aporta nada extra.',
    reloj: 'Cuando huyes o pierdes contra un monstruo, no pierdes HP (el Ladron igual te roba la carta). Despues tienes que esperar 3 de tus turnos para que vuelva a funcionar.',
    nucleo: 'Solo reduce ataques de otros jugadores, no las penalizaciones de monstruo.',
    anillo: 'Solo tiene efecto para el Sanguinario.',
    capa: 'Al revivir, la capa se consume.'
  };

  function renderArtifacts() {
    var intro = '<p class="cmp-intro">Efectos pasivos permanentes. Maximo ' + D.MAX_ARTIFACTS + ' equipados; en la Tienda no puedes comprar uno que ya tienes. Tambien salen como recompensa de la Sombra del Vacio y de AZAZEL.</p>';
    return intro + '<div class="cmp-grid">' + Object.keys(D.ARTIFACTS).map(function (id) {
      var a = D.ARTIFACTS[id];
      return entry(a.icon, a.name, a.price + ' Monedas' + (a.shield ? ' · Escudo' : ''), [
        ['Efecto', esc(a.desc)]
      ], '<p class="cmp-muted">' + esc(ARTIFACT_NOTES[id] || '') + '</p>');
    }).join('') + '</div>';
  }

  /* ---------------- Reglas ---------------- */

  function renderRules() {
    var ids = Object.keys(D.DURATIONS);
    var yes = function (v) { return v ? 'si' : 'no'; };
    var cell = function (fn) { return ids.map(function (id) { return '<td>' + fn(id, D.DURATIONS[id]) + '</td>'; }).join(''); };
    var durTable = '<div class="tut-table-wrap"><table class="tut-table">' +
      '<tr><th></th>' + ids.map(function (id) { return '<th>' + esc(D.DURATIONS[id].name) + '</th>'; }).join('') + '</tr>' +
      '<tr><td>HP de las clases</td>' + cell(function (id) { return D.classMaxHp('gladiador', id) + ' / ' + D.classMaxHp('espejo', id); }) + '</tr>' +
      '<tr><td>HP de los monstruos</td>' + cell(function (id) { return ['ladron', 'sombra', 'azazel'].map(function (m) { return D.monsterHp(m, id); }).join(' / '); }) + '</tr>' +
      '<tr><td>Huir o perder</td>' + cell(function (id) { return ['ladron', 'sombra', 'azazel'].map(function (m) { return '-' + D.monsterPenalty(m, id); }).join(' / '); }) + '</tr>' +
      '<tr><td>El monstruo espera</td>' + cell(function (id, d) { return yes(d.monstersWait); }) + '</tr>' +
      '<tr><td>El dano se acumula</td>' + cell(function (id, d) { return yes(d.monsterWounds); }) + '</tr>' +
      '</table></div><p class="cmp-muted">HP de las clases: Gladiador / resto. Monstruos: Ladron / Sombra / AZAZEL.</p>';

    var turn = '<ol>' +
      '<li><strong>Robo</strong>: robas hasta tener ' + D.HAND_SIZE + ' cartas. Los Sucesos se aplican solos y los Monstruos se resuelven por el camino.</li>' +
      '<li><strong>Accion</strong>: juegas una mano como Ataque contra un rival o como Curacion para ti, o pasas.</li>' +
      '<li><strong>Fin de turno</strong>: cambias cartas sueltas por Monedas si quieres.</li>' +
      '<li>Pasas el dispositivo al siguiente jugador (en el Modo Tutorial se salta).</li>' +
      '</ol>';
    var general = '<ul>' +
      '<li><strong>Objetivo</strong>: ser el ultimo jugador en pie.</li>' +
      '<li><strong>Mazo</strong>: cada jugador tiene el suyo: 25 cartas de Ataque (negras, valores 1 a 5), 25 de Curacion (rojas, 1 a 5), 6 Sucesos y 3 Monstruos. Cuando se acaba, se baraja el descarte.</li>' +
      '<li><strong>Monedas de Arena</strong>: solo se consiguen descartando cartas sueltas al final del turno. Sirven para la Tienda.</li>' +
      '<li><strong>Tienda</strong>: se abre para todos, por turnos, cada vez que alguien derrota a un monstruo.</li>' +
      '<li><strong>Las cartas pueden cambiar de mazo</strong> (Mercado Negro, Ladron, Cleptomano): las que recibes acaban en tu descarte.</li>' +
      '</ul>';
    return box('Duraciones de partida', durTable) + box('Un turno', turn) + box('Reglas generales', general);
  }

  var TABS = [
    { id: 'clases', label: 'Clases', render: renderClasses },
    { id: 'monstruos', label: 'Monstruos', render: renderMonsters },
    { id: 'manos', label: 'Combinaciones', render: renderHands },
    { id: 'sucesos', label: 'Sucesos', render: renderEvents },
    { id: 'botin', label: 'Botin', render: renderLoot },
    { id: 'artefactos', label: 'Artefactos', render: renderArtifacts },
    { id: 'reglas', label: 'Reglas', render: renderRules }
  ];

  /* ---------------- Ventana ---------------- */

  function root() { return document.getElementById('compendium-root'); }

  function render(focusTab) {
    var tab = TABS.filter(function (t) { return t.id === state.tab; })[0] || TABS[0];
    var tabsHtml = TABS.map(function (t) {
      var on = t.id === tab.id;
      return '<button type="button" class="cmp-tab' + (on ? ' active' : '') + '" role="tab" id="cmp-tab-' + t.id + '"' +
        ' aria-selected="' + on + '" aria-controls="cmp-panel" tabindex="' + (on ? '0' : '-1') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
    var r = root();
    var keepScroll = r.querySelector('.cmp-tabs') ? r.querySelector('.cmp-tabs').scrollLeft : 0;
    r.innerHTML =
      '<div class="overlay cmp-overlay">' +
        '<div class="modal cmp-modal" role="dialog" aria-modal="true" aria-labelledby="cmp-title">' +
          '<div class="cmp-header">' +
            '<h3 id="cmp-title">Compendio</h3>' +
            '<button type="button" class="btn btn-small cmp-close">Cerrar</button>' +
          '</div>' +
          '<div class="cmp-tabs" role="tablist" aria-label="Secciones del compendio">' + tabsHtml + '</div>' +
          '<div class="cmp-body" id="cmp-panel" role="tabpanel" aria-labelledby="cmp-tab-' + tab.id + '" tabindex="0">' + tab.render() + '</div>' +
        '</div>' +
      '</div>';

    var overlay = r.firstChild;
    r.querySelector('.cmp-tabs').scrollLeft = keepScroll;
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) close(); });
    r.querySelector('.cmp-close').addEventListener('click', close);
    Array.prototype.forEach.call(r.querySelectorAll('.cmp-tab'), function (b) {
      b.addEventListener('click', function () { selectTab(b.getAttribute('data-tab'), true); });
    });
    if (focusTab) {
      var active = r.querySelector('.cmp-tab.active');
      if (active) { active.focus(); active.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }
  }

  function selectTab(id, focus) {
    state.tab = id;
    render(focus);
  }

  /* Teclado: Escape cierra; flechas izquierda/derecha cambian de pestana (patron de tabs ARIA). */
  function onKey(ev) {
    if (!root() || !root().firstChild) return;
    if (ev.key === 'Escape') { close(); return; }
    if (!ev.target.classList || !ev.target.classList.contains('cmp-tab')) return;
    var idx = TABS.map(function (t) { return t.id; }).indexOf(state.tab);
    if (ev.key === 'ArrowRight') idx = (idx + 1) % TABS.length;
    else if (ev.key === 'ArrowLeft') idx = (idx - 1 + TABS.length) % TABS.length;
    else return;
    ev.preventDefault();
    selectTab(TABS[idx].id, true);
  }

  var lastFocus = null;

  function open(durationId, tabId) {
    state.duration = D.durationOf(durationId).id;
    if (tabId) state.tab = tabId;
    lastFocus = document.activeElement;
    render(true);
    document.addEventListener('keydown', onKey);
  }

  function close() {
    var r = root();
    if (r) r.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  global.VA_COMPENDIUM = { open: open, close: close };
})(window);
