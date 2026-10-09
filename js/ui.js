/* Interfaz: renderizado y manejo de eventos del DOM. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  var S = global.VA_STATE;

  var SUIT_SYMBOL = { picas: '♠', treboles: '♣', corazones: '♥', diamantes: '♦' };

  var FX = global.VA_FX;
  var PX = global.VA_PIXEL;

  var game = null;
  var ui = {
    selectedCardIds: {}, declaredType: null, targetId: null, useDaga: false, error: '',
    fightSelectedIds: {}, fightUseDaga: false, fightMode: false,
    feedSelectedIds: {},
    lastLinked: {}, lastComboKey: ''
  };

  /*
   * Estado "mostrado" de cada jugador (HP, vivo, monedas). La interfaz dibuja estos valores,
   * no los reales, para que un golpe se vea cuando el orbe impacta y no antes. Cada cambio
   * pendiente se aplica (animado) desde processFx en el momento justo.
   */
  var shown = { hp: {}, alive: {}, coins: {} };
  var hpScheduled = {};
  var coinScheduled = {};
  var fxOrigin = null;
  var fxChain = Promise.resolve();
  var fxPending = 0;
  var overlayDeferred = false;
  var shownHandIds = {};

  function setGame(g) { game = g; }

  function resetActionUi() {
    ui.selectedCardIds = {};
    ui.declaredType = null;
    ui.targetId = null;
    ui.useDaga = false;
    ui.error = '';
    ui.fightSelectedIds = {};
    ui.fightUseDaga = false;
    ui.fightMode = false;
    ui.feedSelectedIds = {};
    ui.lastLinked = {};
    ui.lastComboKey = '';
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function cardNode(card, opts) {
    opts = opts || {};
    var isRed = card.color === 'roja';
    var selected = opts.selectedMap && opts.selectedMap[card.id];
    var classes = 'card' + (isRed ? ' red' : '') + (selected ? ' selected' : '') + (opts.disabled ? ' disabled' : '');
    var suit = PX.suitSvg(card.suit) || SUIT_SYMBOL[card.suit];
    var node = el(
      '<div class="' + classes + '" data-card-id="' + card.id + '">' +
        '<div class="corner corner-tl"><span>' + card.value + '</span><span>' + suit + '</span></div>' +
        '<div class="val">' + card.value + '</div>' +
        '<div class="suit">' + suit + '</div>' +
        '<div class="corner corner-br"><span>' + card.value + '</span><span>' + suit + '</span></div>' +
        (opts.looseValue ? '<div class="loose-tag">+' + opts.looseValue + '</div>' : '') +
        (opts.groupCount ? '<div class="group-badge" title="Tienes ' + opts.groupCount + ' cartas de valor ' + card.value + '">×' + opts.groupCount + '</div>' : '') +
      '</div>'
    );
    return node;
  }

  function renderPlayersBar() {
    var bar = document.getElementById('players-bar');
    bar.innerHTML = '';
    var current = S.currentPlayer(game);
    game.players.forEach(function (p) {
      if (!(p.id in shown.hp)) {
        shown.hp[p.id] = p.hp;
        shown.alive[p.id] = p.alive;
        shown.coins[p.id] = p.coins;
      }
      var hp = shown.hp[p.id];
      var alive = shown.alive[p.id];
      var pct = hpPct(hp, p.maxHp);
      var chip = el(
        '<div class="player-chip' + (p.id === current.id ? ' current' : '') + (alive ? '' : ' dead') + '" data-player-id="' + p.id + '">' +
          '<div class="pname"><span class="class-icon">' + PX.sprite(D.CLASSES[p.classId].icon, 'sm') + '</span>' + escapeHtml(p.name) + (p.isAI ? ' <span class="ai-badge">IA</span>' : '') + '</div>' +
          '<div class="pclass">' + D.CLASSES[p.classId].name + '</div>' +
          '<div class="hp-bar-outer">' +
            '<div class="hp-bar-ghost" style="width:' + pct + '%"></div>' +
            '<div class="hp-bar-inner" style="width:' + pct + '%;background:var(--' + hpColor(pct) + ')"></div>' +
          '</div>' +
          '<div class="hp-text">' + hp + ' / ' + p.maxHp + ' HP</div>' +
          '<div class="coin-text">' + coinHtml(shown.coins[p.id]) + '</div>' +
          (p.artifacts.length ? '<div class="artifact-icons">' + p.artifacts.map(function (a) { return D.ARTIFACTS[a].name; }).join(', ') + '</div>' : '') +
          '</div>'
      );
      if (canUseYep(p)) {
        var yepBtn = el('<button class="btn btn-small yep-alert" title="Usar Yep!">Yep!</button>');
        yepBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var res = S.useYep(game, p.id);
          if (!res.ok) alert(res.error);
          renderAll();
        });
        chip.appendChild(yepBtn);
      }
      bar.appendChild(chip);
    });
    /* En un telefono en horizontal la columna de jugadores puede no entrar entera (5-6
       jugadores): se desliza para que el jugador del turno quede siempre a la vista. */
    if (bar.scrollHeight > bar.clientHeight + 1) {
      var cur = bar.querySelector('.player-chip.current');
      if (cur) {
        var top = cur.getBoundingClientRect().top - bar.getBoundingClientRect().top + bar.scrollTop;
        bar.scrollTop = Math.max(0, top - (bar.clientHeight - cur.offsetHeight) / 2);
      }
    }
  }

  /* "N Monedas"; la palabra va aparte para poder ocultarla donde falta espacio. */
  function coinHtml(n) {
    return n + '<span class="coin-label"> Monedas</span>';
  }

  function hpPct(hp, maxHp) { return Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))); }
  function hpColor(pct) { return pct > 55 ? 'hp-full' : (pct > 25 ? 'hp-mid' : 'hp-low'); }

  function chipEl(playerId) {
    return document.querySelector('#players-bar .player-chip[data-player-id="' + playerId + '"]');
  }

  function canUseYep(player) {
    if (!player.alive) return false;
    if (!game.lastCancelable || !game.lastCancelable.stillValid || !game.lastCancelable.stillValid()) return false;
    if (game.lastCancelable.ownerId === player.id) return false;
    return player.lootBag.indexOf('yep') !== -1 && game.flags.nieblaTurnsLeft <= 0;
  }

  function renderLog() {
    var list = document.getElementById('log-list');
    list.innerHTML = game.log.slice(-60).map(function (l) { return '<div>' + escapeHtml(l) + '</div>'; }).join('');
    list.scrollTop = list.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- Panel de acciones principal ---------------- */

  function renderActionPanel() {
    var banner = document.getElementById('phase-banner');
    var handArea = document.getElementById('hand-area');
    var controls = document.getElementById('controls');
    var lootBar = document.getElementById('loot-bar');
    handArea.innerHTML = '';
    controls.innerHTML = '';
    lootBar.innerHTML = '';
    clearCoach();

    var player = S.currentPlayer(game);

    if (game.phase === 'action') {
      if (player.isAI) {
        banner.textContent = 'Turno de ' + player.name + ' (IA) - decidiendo su jugada...';
      } else {
        banner.textContent = 'Turno de ' + player.name + ' - fase de accion.';
        renderHandForAction(player, handArea);
        renderActionControls(player, controls);
        renderLootBar(player, lootBar);
        if (game.isTutorial) {
          var uiState = { declaredType: ui.declaredType, selectedCount: selectedCardIdsArray().length, hasTarget: !!ui.targetId };
          showCoach(global.VA_COACH.actionHint(player.hand.length > 0, uiState));
        }
      }
    } else if (game.phase === 'drawing') {
      banner.textContent = 'Turno de ' + player.name + (player.isAI ? ' (IA)' : '') + ' - robando cartas...';
    } else if (game.phase === 'end_of_turn') {
      if (player.isAI) {
        banner.textContent = 'Turno de ' + player.name + ' (IA) - terminando su turno...';
      } else {
        banner.textContent = 'Turno de ' + player.name + ' - fin de turno: convierte cartas sueltas en Monedas si quieres.';
        renderHandForDiscard(player, handArea);
        var endBtn = el('<button class="btn btn-primary">Terminar turno</button>');
        endBtn.addEventListener('click', function () {
          S.finishEndOfTurn(game, player.id);
          renderAll();
        });
        controls.appendChild(endBtn);
        if (game.isTutorial) {
          var hasLoose = player.hand.some(function (c) { return S.isCardLoose(player.hand, c); });
          showCoach(global.VA_COACH.endOfTurnHint(hasLoose));
        }
      }
    } else {
      banner.textContent = '';
    }
  }

  function showCoach(text) {
    var panel = document.getElementById('coach-panel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = '<span class="coach-icon">' + PX.sprite('\uD83D\uDCA1', 'sm') + '</span><span>' + escapeHtml(text) + '</span>';
  }

  function clearCoach() {
    var panel = document.getElementById('coach-panel');
    if (!panel) return;
    panel.hidden = true;
    panel.innerHTML = '';
  }

  /* Marca las cartas nuevas desde el ultimo render de la mano de este jugador (robo,
     inicio de turno, carta robada/recibida) para que entren con animacion de reparto. */
  function markNewCards(player) {
    var prev = shownHandIds[player.id] || {};
    var next = {};
    var newOnes = {};
    var order = 0;
    player.hand.forEach(function (c) {
      next[c.id] = true;
      if (!prev[c.id]) { newOnes[c.id] = order; order += 1; }
    });
    shownHandIds[player.id] = next;
    return newOnes;
  }

  function applyDealIn(node, newOnes, cardId) {
    if (!(cardId in newOnes)) return;
    node.classList.add('deal-in');
    node.style.animationDelay = (newOnes[cardId] * 70) + 'ms';
  }

  /* Cartas seleccionadas que ya forman parte de una combinacion (misma carta y color
     repetidos, o una Escalera 1-5 negra completa). Devuelve id -> clave de grupo. */
  function linkedGroups(selectedCards) {
    var counts = {};
    selectedCards.forEach(function (c) {
      var k = c.color + c.value;
      counts[k] = (counts[k] || 0) + 1;
    });
    var linked = {};
    selectedCards.forEach(function (c) {
      var k = c.color + c.value;
      if (counts[k] >= 2) linked[c.id] = k;
    });
    var blacks = selectedCards.filter(function (c) { return c.color === 'negra'; });
    var values = blacks.map(function (c) { return c.value; }).sort().join('');
    if (blacks.length === 5 && values === '12345') {
      blacks.forEach(function (c) { linked[c.id] = 'escalera'; });
    }
    return linked;
  }

  /* Mejor jugada de la seleccion actual (la declarada, o la mas alta entre ataque y curacion). */
  function bestCombo(selected, isAlquimista) {
    if (!selected.length) return null;
    var types = ui.declaredType ? [ui.declaredType] : ['attack', 'heal'];
    var best = null;
    types.forEach(function (t) {
      var r = global.VA_HANDS.evaluateHand(selected, t, isAlquimista);
      if (r.valid && (!best || r.rank > best.rank)) { best = r; best.type = t; }
    });
    return best;
  }

  function renderHandForAction(player, handArea) {
    /* Ordenadas por valor para que las parejas/tercias queden juntas a simple vista,
       y con un contador cuando hay 2 o mas cartas iguales (mismo valor y color) en la
       mano: eso es justo lo que se necesita para un Duo, Tercia, Poker o Quinta.
       Dentro de un mismo valor y color, las seleccionadas van primero para que las que
       forman combinacion queden pegadas y puedan "unirse" visualmente. */
    var sel = ui.selectedCardIds;
    var sorted = player.hand.slice().sort(function (a, b) {
      if (a.value !== b.value) return a.value - b.value;
      if (a.color !== b.color) return a.color === 'negra' ? -1 : 1;
      return (sel[b.id] ? 1 : 0) - (sel[a.id] ? 1 : 0);
    });
    var counts = {};
    sorted.forEach(function (c) {
      var key = c.color + c.value;
      counts[key] = (counts[key] || 0) + 1;
    });

    var selectedCards = sorted.filter(function (c) { return sel[c.id]; });
    var linked = linkedGroups(selectedCards);
    var newOnes = markNewCards(player);
    var prevGroup = null;
    var linkedNodes = [];

    sorted.forEach(function (card) {
      var key = card.color + card.value;
      var opts = { selectedMap: sel };
      if (counts[key] >= 2) opts.groupCount = counts[key];
      var node = cardNode(card, opts);
      applyDealIn(node, newOnes, card.id);

      var group = linked[card.id] || null;
      if (group) {
        node.classList.add('linked');
        linkedNodes.push(node);
        if (!ui.lastLinked[card.id]) node.classList.add('link-in');
        if (prevGroup === group) node.classList.add('linked-join');
      }
      prevGroup = group;

      node.addEventListener('click', function () {
        if (ui.selectedCardIds[card.id]) delete ui.selectedCardIds[card.id];
        else ui.selectedCardIds[card.id] = true;
        renderAll();
      });
      handArea.appendChild(node);
    });
    ui.lastLinked = linked;

    /* Cuando la seleccion sube a una combinacion nueva (Duo -> Tercia, etc.), su nombre salta. */
    var combo = bestCombo(selectedCards, player.classId === 'alquimista');
    var comboKey = combo && combo.rank >= 1 ? combo.levelId + ':' + combo.mainValue : '';
    if (comboKey && comboKey !== ui.lastComboKey && linkedNodes.length) {
      var nodesForPop = linkedNodes.slice();
      var label = combo.levelName.replace(/ \(.*\)$/, '').toUpperCase();
      global.requestAnimationFrame(function () {
        var xs = 0;
        var top = Infinity;
        nodesForPop.forEach(function (n) {
          var r = n.getBoundingClientRect();
          xs += r.left + r.width / 2;
          top = Math.min(top, r.top);
        });
        if (top !== Infinity) FX.comboPop(xs / nodesForPop.length, top - 14, '¡' + label + '!', null, combo.type === 'heal' ? 'heal' : 'attack');
      });
    }
    ui.lastComboKey = comboKey;
  }

  function selectedCardIdsArray() { return Object.keys(ui.selectedCardIds); }

  /* Vista previa en vivo: en cuanto hay cartas seleccionadas, muestra que mano
     formarian tanto en Ataque como en Curacion, sin esperar a declarar. Es la
     respuesta directa a "no se que mano estoy formando". */
  function buildHandPreview(selected, isAlquimista) {
    var box = el('<div class="hand-preview"></div>');
    ['attack', 'heal'].forEach(function (type) {
      var result = global.VA_HANDS.evaluateHand(selected, type, isAlquimista);
      var label = type === 'attack' ? 'Como Ataque' : 'Como Curacion';
      var text;
      if (result.valid) {
        text = result.levelName + (result.mainValue !== null ? ' (carta principal ' + result.mainValue + ')' : '') +
          ' → ' + result.baseValue + (type === 'attack' ? ' de dano' : ' de curacion') + '.';
      } else {
        text = result.reason;
      }
      var active = ui.declaredType === type;
      var row = el(
        '<div class="preview-row' + (active ? ' active' : '') + (result.valid ? '' : ' invalid') + '">' +
          '<strong>' + label + ':</strong> ' + escapeHtml(text) +
        '</div>'
      );
      box.appendChild(row);
    });
    return box;
  }

  function renderActionControls(player, controls) {
    var group1 = el('<div class="group"></div>');
    var atkBtn = el('<button class="btn' + (ui.declaredType === 'attack' ? ' btn-primary' : '') + '">Declarar Ataque</button>');
    var healBtn = el('<button class="btn' + (ui.declaredType === 'heal' ? ' btn-primary' : '') + '">Declarar Curacion</button>');
    var passBtn = el('<button class="btn">Pasar sin jugar</button>');
    atkBtn.addEventListener('click', function () { ui.declaredType = 'attack'; ui.error = ''; renderAll(); });
    healBtn.addEventListener('click', function () { ui.declaredType = 'heal'; ui.error = ''; renderAll(); });
    passBtn.addEventListener('click', function () {
      S.passAction(game, player.id);
      resetActionUi();
      renderAll();
    });
    group1.appendChild(atkBtn);
    group1.appendChild(healBtn);
    group1.appendChild(passBtn);
    controls.appendChild(group1);

    var selected = selectedCardIdsArray().map(function (id) {
      return player.hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    var isAlquimista = player.classId === 'alquimista';

    if (selected.length > 0) {
      controls.appendChild(buildHandPreview(selected, isAlquimista));
    } else {
      controls.appendChild(el('<div class="info">Toca una o mas cartas de tu mano para ver aqui que jugada formarian.</div>'));
    }

    if (!ui.declaredType) return;

    if (ui.declaredType === 'attack') {
      var targetGroup = el('<div class="group"></div>');
      S.otherAlivePlayers(game, player.id).forEach(function (rival) {
        var tbtn = el('<button class="btn btn-small' + (ui.targetId === rival.id ? ' btn-primary' : '') + '">' + escapeHtml(rival.name) + '</button>');
        tbtn.addEventListener('click', function () { ui.targetId = rival.id; renderAll(); });
        targetGroup.appendChild(tbtn);
      });
      controls.appendChild(targetGroup);

      if (S.hasUsableLoot(game, player, 'daga') && player.hp > 4) {
        var dagaWrap = el('<label class="check-row"><input type="checkbox" id="use-daga-chk"> Usar Daga de Sacrificio (+15, -4 HP)</label>');
        controls.appendChild(dagaWrap);
        var chk = dagaWrap.querySelector('input');
        chk.checked = ui.useDaga;
        chk.addEventListener('change', function () { ui.useDaga = chk.checked; });
      }
    }

    var confirmGroup = el('<div class="group"></div>');
    var confirmBtn = el('<button class="btn btn-primary">Confirmar jugada</button>');
    var cancelBtn = el('<button class="btn">Cancelar</button>');
    confirmBtn.addEventListener('click', function () {
      if (ui.declaredType === 'attack' && !ui.targetId) { ui.error = 'Elige un objetivo.'; renderAll(); return; }
      var kind = ui.declaredType === 'heal' ? 'heal' : 'attack';
      var snaps = snapshotCards('#hand-area .card.selected');
      var res = S.playHand(game, player.id, selectedCardIdsArray(), ui.declaredType, ui.targetId, ui.useDaga);
      if (!res.ok) { ui.error = res.error; renderAll(); return; }
      fxOrigin = FX.mergeCards(snaps, kind);
      resetActionUi();
      renderAll();
    });
    cancelBtn.addEventListener('click', function () { resetActionUi(); renderAll(); });
    confirmGroup.appendChild(confirmBtn);
    confirmGroup.appendChild(cancelBtn);
    controls.appendChild(confirmGroup);

    if (ui.error) controls.appendChild(el('<div class="error-msg">' + escapeHtml(ui.error) + '</div>'));
  }

  function renderLootBar(player, lootBar) {
    var activatable = ['mano_fria', 'espejo_roto', 'transfusion'];
    var counts = {};
    player.lootBag.forEach(function (l) { counts[l] = (counts[l] || 0) + 1; });
    Object.keys(counts).forEach(function (lootId) {
      if (activatable.indexOf(lootId) === -1) return;
      var item = D.LOOT[lootId];
      var btn = el('<button class="btn btn-small">' + item.name + ' x' + counts[lootId] + '</button>');
      btn.title = item.desc;
      btn.addEventListener('click', function () {
        var res = S.activateLoot(game, player.id, lootId);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      lootBar.appendChild(btn);
    });
    if (player.lootBag.indexOf('yep') !== -1) {
      lootBar.appendChild(el('<span class="info" style="align-self:center">Tienes Yep! disponible: se usa desde la ficha del jugador cuando alguien active algo cancelable.</span>'));
    }
  }

  function renderHandForDiscard(player, handArea) {
    var newOnes = markNewCards(player);
    player.hand.forEach(function (card) {
      var loose = S.isCardLoose(player.hand, card);
      var node = cardNode(card, { looseValue: loose ? card.value : null });
      applyDealIn(node, newOnes, card.id);
      if (loose) {
        node.addEventListener('click', function () {
          var res = S.discardForCoins(game, player.id, card.id);
          if (!res.ok) alert(res.error);
          renderAll();
        });
      } else {
        node.classList.add('disabled');
      }
      handArea.appendChild(node);
    });
    if (player.hand.length === 0) {
      handArea.appendChild(el('<div class="info">Mano vacia.</div>'));
    } else if (!player.hand.some(function (c) { return S.isCardLoose(player.hand, c); })) {
      handArea.appendChild(el('<div class="info">Ninguna carta suelta disponible para convertir en Monedas.</div>'));
    }
  }

  /* ---------------- Overlays ---------------- */

  var lastOverlayKey = '';
  var overlayEnter = false;

  /* Identifica que ventana se esta mostrando, para animar su entrada solo cuando cambia
     (y no en cada clic dentro de ella, que tambien re-renderiza). */
  function overlayKey() {
    if (game.gameOver) return 'over';
    if (game.phase === 'pass_device') return 'pass:' + S.currentPlayer(game).id;
    var p = game.pending;
    if (!p) return '';
    if (p.type === 'shop') return 'shop:' + p.index;
    if (p.type === 'mercado_negro') return 'mercado:' + p.cursor;
    return p.type + ':' + (p.playerId || '') + ':' + (p.monsterId || '');
  }

  function renderOverlay() {
    var root = document.getElementById('overlay-root');
    root.innerHTML = '';
    var key = overlayKey();
    if (game.gameOver && fxPending > 0) key = '';
    overlayEnter = key !== '' && key !== lastOverlayKey;
    lastOverlayKey = key;

    if (game.gameOver) {
      /* Deja terminar el golpe final antes de tapar la pantalla con el resultado. */
      if (fxPending > 0) { overlayDeferred = true; return; }
      root.appendChild(buildGameOverOverlay());
      return;
    }
    if (game.phase === 'pass_device') {
      root.appendChild(buildPassDeviceOverlay());
      return;
    }
    if (game.pending) {
      if (game.pending.type === 'monster') root.appendChild(buildMonsterOverlay());
      else if (game.pending.type === 'shop') root.appendChild(buildShopOverlay());
      else if (game.pending.type === 'mercado_negro') root.appendChild(buildMercadoOverlay());
      else if (game.pending.type === 'azazel_choice') root.appendChild(buildAzazelOverlay());
      else if (game.pending.type === 'wanderer') root.appendChild(buildWandererOverlay());
    }
  }

  /* Boton para consultar el Compendio sin cerrar la decision en curso. */
  function compendiumButton(tabId) {
    var b = el('<button class="btn btn-small cmp-link">Ver en el Compendio</button>');
    b.addEventListener('click', function () { global.VA_COMPENDIUM.open(game.durationId, tabId); });
    return b;
  }

  /* Botones principales de una ventana, juntos en una fila. En telefonos en horizontal esa
     fila queda fija al pie de la ventana (ver style.css), para no tener que buscarlos. */
  function modalActions(modal, buttons) {
    var row = el('<div class="modal-actions"></div>');
    buttons.forEach(function (b) { row.appendChild(b); });
    modal.appendChild(row);
    return row;
  }

  function overlayWrap(innerHtml) {
    return el('<div class="overlay' + (overlayEnter ? ' enter' : '') + '"><div class="modal">' + innerHtml + '</div></div>');
  }

  function buildPassDeviceOverlay() {
    var next = S.currentPlayer(game);
    var wrap = overlayWrap(
      '<h3>Pasa el dispositivo</h3>' +
      '<p>Es el turno de <strong>' + escapeHtml(next.name) + '</strong> (' + D.CLASSES[next.classId].name + ').</p>' +
      '<p class="hint">Los demas jugadores no deberian mirar la pantalla ahora.</p>'
    );
    var btn = el('<button class="btn btn-primary">Ver mi mano</button>');
    btn.addEventListener('click', function () {
      resetActionUi();
      S.confirmPassDevice(game);
      renderAll();
    });
    modalActions(wrap.querySelector('.modal'), [btn]);
    return wrap;
  }

  function buildGameOverOverlay() {
    var winner = game.winnerId ? S.byId(game, game.winnerId) : null;
    var wrap = overlayWrap(
      '<h3>Partida terminada</h3>' +
      '<p>' + (winner ? escapeHtml(winner.name) + ' gana la partida.' : 'Todos los jugadores han caido.') + '</p>'
    );
    var btn = el('<button class="btn btn-primary">Nueva partida</button>');
    btn.addEventListener('click', function () { location.reload(); });
    modalActions(wrap.querySelector('.modal'), [btn]);
    return wrap;
  }

  function buildMonsterOverlay() {
    var pend = game.pending;
    var player = S.byId(game, pend.playerId);
    var rules = D.durationOf(game.durationId);
    var penalty = D.monsterPenalty(pend.monsterId, game.durationId);
    var canFight = global.VA_MONSTERS.canFight(game, player.id);
    var extras = [];
    if (pend.cofreBoosted) extras.push('+5 por Cofre Mimetico');
    if (player.classId === 'cleptomano') extras.push('+4 contra el Cleptomano');
    var wrap = overlayWrap(
      '<h3><span class="monster-icon">' + PX.sprite(D.MONSTERS[pend.monsterId].icon, 'md') + '</span> Encuentro: ' + escapeHtml(pend.monsterName) + '</h3>' +
      '<p>HP del monstruo: <strong>' + pend.hp + '</strong>' + (pend.wounds ? ' / ' + pend.maxHp + ' (herido)' : '') +
        (extras.length ? ' <span class="hint">(' + extras.join(', ') + ')</span>' : '') + '</p>' +
      '<p>Si huyes o pierdes: <strong class="danger-text">-' + penalty + ' HP</strong>' +
        (D.MONSTERS[pend.monsterId].fleeStealsCard ? ' y un rival te roba 1 carta' : '') + '.</p>' +
      (rules.monsterWounds
        ? '<p class="hint">Para matarlo necesitas ' + pend.hp + ' de dano. Si no llegas, el dano que le hagas se queda: vuelve a tu mazo herido.</p>'
        : '<p class="hint">Referencia de dificultad: ' + pend.minLabel + '. La regla real es: dano total &gt;= HP del monstruo.</p>')
    );
    var modal = wrap.querySelector('.modal');

    if (game.isTutorial && !player.isAI) {
      modal.appendChild(el('<p class="coach-line">' + escapeHtml(global.VA_COACH.monsterHint(pend, ui.fightMode, Object.keys(ui.fightSelectedIds).length, canFight, rules.monsterWounds)) + '</p>'));
    }

    if (!ui.fightMode) {
      var fightBtn = el('<button class="btn btn-primary"' + (canFight ? '' : ' disabled') + '>Combatir' + (canFight ? '' : ' (no tienes cartas de ataque)') + '</button>');
      var fleeBtn = el('<button class="btn"' + (pend.canFlee ? '' : ' disabled') + '>Huir' + (pend.canFlee ? '' : ' (no permitido)') + '</button>');
      fightBtn.addEventListener('click', function () {
        if (!canFight) return;
        ui.fightMode = true; ui.fightSelectedIds = {}; ui.fightUseDaga = false; renderAll();
      });
      fleeBtn.addEventListener('click', function () {
        if (!pend.canFlee) return;
        var res = global.VA_MONSTERS.decide(game, player.id, 'flee', [], false);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      modalActions(modal, [fightBtn, fleeBtn, compendiumButton('monstruos')]);
      return wrap;
    }

    modal.appendChild(el('<p>Elige las cartas de tu mano para atacar:</p>'));
    var handDiv = el('<div id="hand-area" style="min-height:auto"></div>');
    player.hand.forEach(function (card) {
      var node = cardNode(card, { selectedMap: ui.fightSelectedIds });
      node.addEventListener('click', function () {
        if (ui.fightSelectedIds[card.id]) delete ui.fightSelectedIds[card.id];
        else ui.fightSelectedIds[card.id] = true;
        renderAll();
      });
      handDiv.appendChild(node);
    });
    modal.appendChild(handDiv);

    var selected = Object.keys(ui.fightSelectedIds).map(function (id) {
      return player.hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    var preview = selected.length ? global.VA_HANDS.evaluateHand(selected, 'attack', player.classId === 'alquimista') : null;
    modal.appendChild(el('<p class="info">' + (preview && preview.valid ? preview.levelName + ' -> valor base ' + preview.baseValue : 'Selecciona al menos una carta de ataque.') + '</p>'));

    if (S.hasUsableLoot(game, player, 'daga') && player.hp > 4) {
      var dagaWrap = el('<label class="check-row check-row-block"><input type="checkbox"> Usar Daga de Sacrificio (+15, -4 HP)</label>');
      var chk = dagaWrap.querySelector('input');
      chk.checked = ui.fightUseDaga;
      chk.addEventListener('change', function () { ui.fightUseDaga = chk.checked; });
      modal.appendChild(dagaWrap);
    }

    var confirmBtn = el('<button class="btn btn-primary">Confirmar ataque</button>');
    var backBtn = el('<button class="btn">Volver</button>');
    confirmBtn.addEventListener('click', function () {
      var snaps = snapshotCards('#overlay-root .card.selected');
      var res = global.VA_MONSTERS.decide(game, player.id, 'fight', Object.keys(ui.fightSelectedIds), ui.fightUseDaga);
      if (!res.ok) { alert(res.error); return; }
      fxOrigin = FX.mergeCards(snaps, 'attack');
      ui.fightMode = false;
      renderAll();
    });
    backBtn.addEventListener('click', function () { ui.fightMode = false; renderAll(); });
    modalActions(modal, [confirmBtn, backBtn]);
    return wrap;
  }

  function buildShopOverlay() {
    var pend = game.pending;
    var shopperId = global.VA_SHOP.currentShopper(game);
    var player = S.byId(game, shopperId);
    var wrap = overlayWrap(
      '<h3>Tienda de la Arena</h3>' +
      '<p>Turno de <strong>' + escapeHtml(player.name) + '</strong> &middot; ' + player.coins + ' Monedas &middot; Artefactos: ' + player.artifacts.length + '/' + D.MAX_ARTIFACTS + '</p>'
    );
    var modal = wrap.querySelector('.modal');
    modal.classList.add('shop-modal');

    if (game.isTutorial && !player.isAI) {
      modal.appendChild(el('<p class="coach-line">' + escapeHtml(global.VA_COACH.shopHint()) + '</p>'));
    }
    modal.appendChild(compendiumButton('botin'));

    modal.appendChild(el('<h4>Botin (uso unico)</h4>'));
    Object.keys(D.LOOT).forEach(function (id) {
      var item = D.LOOT[id];
      if (item.price === null) return;
      var row = el(
        '<div class="shop-item"><div><strong>' + item.name + '</strong> (' + item.price + ' Monedas)' +
        '<div class="desc">' + item.desc + '</div></div></div>'
      );
      var btn = el('<button class="btn btn-small">Comprar</button>');
      btn.disabled = player.coins < item.price;
      btn.addEventListener('click', function () {
        var res = global.VA_SHOP.buyLoot(game, player.id, id);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      row.appendChild(btn);
      modal.appendChild(row);
    });

    if (player.lootBag.indexOf('bolsa_oro') !== -1) {
      var bolsaRow = el('<div class="shop-item"><div><strong>Bolsa de Oro</strong><div class="desc">Canjear por 20 Monedas.</div></div></div>');
      var bolsaBtn = el('<button class="btn btn-small">Canjear</button>');
      bolsaBtn.addEventListener('click', function () {
        var res = global.VA_SHOP.redeemBolsaDeOro(game, player.id);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      bolsaRow.appendChild(bolsaBtn);
      modal.appendChild(bolsaRow);
    }

    modal.appendChild(el('<h4>Artefactos (pasivos, max 3)</h4>'));
    Object.keys(D.ARTIFACTS).forEach(function (id) {
      var item = D.ARTIFACTS[id];
      var incompatible = item.incompatibleClass === player.classId;
      var row = el(
        '<div class="shop-item"><div><strong>' + item.name + '</strong> (' + item.price + ' Monedas)' +
        '<div class="desc">' + item.desc + (incompatible ? ' - No compatible con tu clase.' : '') + '</div></div></div>'
      );
      var btn = el('<button class="btn btn-small">Comprar</button>');
      btn.disabled = player.coins < item.price || player.artifacts.length >= D.MAX_ARTIFACTS || incompatible || player.artifacts.indexOf(id) !== -1;
      btn.addEventListener('click', function () {
        var res = global.VA_SHOP.buyArtifact(game, player.id, id);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      row.appendChild(btn);
      modal.appendChild(row);
    });

    var doneBtn = el('<button class="btn btn-primary">' + player.name + ' termina de comprar</button>');
    doneBtn.addEventListener('click', function () {
      global.VA_SHOP.doneShopping(game, player.id);
      renderAll();
    });
    modalActions(modal, [doneBtn]);
    return wrap;
  }

  function buildMercadoOverlay() {
    var pend = game.pending;
    var pid = pend.order[pend.cursor];
    var player = S.byId(game, pid);
    var wrap = overlayWrap(
      '<h3>Mercado Negro</h3>' +
      '<p>Turno de <strong>' + escapeHtml(player.name) + '</strong>: elige 1 carta para pasar a tu izquierda.</p>'
    );
    var modal = wrap.querySelector('.modal');

    if (game.isTutorial && !player.isAI) {
      modal.appendChild(el('<p class="coach-line">' + escapeHtml(global.VA_COACH.mercadoHint()) + '</p>'));
    }

    if (player.hand.length === 0) {
      modal.appendChild(el('<p class="info">No tiene cartas para entregar.</p>'));
      var skipBtn = el('<button class="btn btn-primary">Continuar</button>');
      skipBtn.addEventListener('click', function () {
        var res = global.VA_EVENTS.skipMercadoPlayer(game, player.id);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      modalActions(modal, [skipBtn]);
      return wrap;
    }
    var handDiv = el('<div id="hand-area" style="min-height:auto"></div>');
    player.hand.forEach(function (card) {
      var node = cardNode(card, {});
      node.addEventListener('click', function () {
        var res = global.VA_EVENTS.pickMercadoCard(game, player.id, card.id);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      handDiv.appendChild(node);
    });
    modal.appendChild(handDiv);
    return wrap;
  }

  function buildAzazelOverlay() {
    var pend = game.pending;
    var player = S.byId(game, pend.playerId);
    var bonus = pend.doubled ? 30 : 15;
    var count = pend.doubled ? 6 : 3;
    var wrap = overlayWrap(
      '<h3>AZAZEL derrotado</h3>' +
      '<p>' + escapeHtml(player.name) + ', elige tu recompensa:</p>'
    );
    var modal = wrap.querySelector('.modal');

    if (game.isTutorial && !player.isAI) {
      modal.appendChild(el('<p class="coach-line">' + escapeHtml(global.VA_COACH.azazelHint()) + '</p>'));
    }

    var btn1 = el('<button class="btn btn-primary" style="display:block;margin-bottom:8px;width:100%">+' + bonus + ' HP maximo permanente</button>');
    var btn2 = el('<button class="btn" style="display:block;width:100%">' + count + ' Cartas Raras (botin/artefactos al azar)</button>');
    btn1.addEventListener('click', function () {
      global.VA_MONSTERS.resolveAzazelChoice(game, player.id, 'maxhp');
      renderAll();
    });
    btn2.addEventListener('click', function () {
      global.VA_MONSTERS.resolveAzazelChoice(game, player.id, 'rare');
      renderAll();
    });
    modalActions(modal, [btn1, btn2]);
    return wrap;
  }

  /* Gusano Suplicante: alimentarlo con cartas de la mano o negarse. */
  function buildWandererOverlay() {
    var pend = game.pending;
    var W = global.VA_WANDERERS;
    var w = W.stats(game.durationId);
    var player = S.byId(game, pend.playerId);
    var wrap = overlayWrap(
      '<h3>' + escapeHtml(w.name) + '</h3>' +
      '<div class="wanderer-side">' +
        '<div class="wanderer-art">' + FX.wormSvg('beg', overlayEnter ? 'emerge' : '') + '</div>' +
        '<div class="worm-speech">"¡Tengo tanta hambre...! Dame algo de comer... por favor..."</div>' +
      '</div>'
    );
    var modal = wrap.querySelector('.modal');
    modal.classList.add('wanderer-modal');

    if (player.isAI) {
      modal.appendChild(el('<p class="info">' + escapeHtml(player.name) + ' (IA) esta decidiendo si lo alimenta...</p>'));
      return wrap;
    }

    var room = player.maxHp - player.hp;
    var takes = Math.ceil(player.coins * w.coinsTakenPct);
    var bite = Math.max(0, Math.min(w.bite, player.hp - 1));
    var refuseText = takes > 0
      ? 'Se enoja y se lleva <strong class="bad">' + takes + ' de tus ' + player.coins + ' Monedas</strong>.'
      : 'No tienes monedas, asi que te muerde: <strong class="bad">-' + bite + ' HP</strong> (nunca te deja en 0).';
    var feedText = room >= w.heal
      ? 'te cura <strong class="good">+' + w.heal + ' HP</strong>'
      : (room > 0
        ? 'te cura <strong class="good">+' + room + ' HP</strong> y lo que sobra se vuelve <strong class="good">+' + Math.min(w.heal - room, w.maxHpBonusCap) + ' HP maximo</strong> para siempre'
        : 'ya tienes la vida llena: te da <strong class="good">+' + w.maxHpBonusCap + ' HP maximo</strong> para siempre');
    modal.appendChild(el(
      '<div class="wanderer-options">' +
        '<div>🍖 <strong>Alimentarlo:</strong> dale cartas de tu mano que sumen al menos ' + w.feedNeed + '; ' + feedText + '.</div>' +
        '<div>✋ <strong>Negarte</strong> (o si no te alcanza): ' + refuseText + '</div>' +
      '</div>'
    ));

    var selected = player.hand.filter(function (c) { return ui.feedSelectedIds[c.id]; });
    var total = W.sumValues(selected);
    var possible = W.canFeed(player);

    if (game.isTutorial) {
      modal.appendChild(el('<p class="coach-line">' + escapeHtml(global.VA_COACH.wandererHint(possible, total, w.feedNeed, takes, bite)) + '</p>'));
    }

    if (possible) {
      var handDiv = el('<div id="hand-area" style="min-height:auto"></div>');
      player.hand.forEach(function (card) {
        var node = cardNode(card, { selectedMap: ui.feedSelectedIds });
        node.addEventListener('click', function () {
          if (ui.feedSelectedIds[card.id]) delete ui.feedSelectedIds[card.id];
          else ui.feedSelectedIds[card.id] = true;
          renderAll();
        });
        handDiv.appendChild(node);
      });
      modal.appendChild(handDiv);
      var pct = Math.min(100, Math.round((total / w.feedNeed) * 100));
      modal.appendChild(el(
        '<div class="feed-meter' + (total >= w.feedNeed ? ' full' : '') + '"><div style="width:' + pct + '%"></div></div>'
      ));
      modal.appendChild(el('<p class="info">Comida elegida: <strong>' + total + ' / ' + w.feedNeed + '</strong>' +
        (total >= w.feedNeed ? ' — ¡suficiente!' : '') + '</p>'));
    } else {
      modal.appendChild(el('<p class="info">Tu mano suma solo ' + W.sumValues(player.hand) + ': no te alcanza para alimentarlo.</p>'));
    }

    var actionBtns = [];
    if (possible) {
      var feedBtn = el('<button class="btn btn-primary"' + (total >= w.feedNeed ? '' : ' disabled') + '>Darle de comer</button>');
      feedBtn.addEventListener('click', function () {
        var snaps = snapshotCards('#overlay-root .card.selected');
        var res = W.feed(game, player.id, Object.keys(ui.feedSelectedIds));
        if (!res.ok) { alert(res.error); return; }
        fxOrigin = FX.mergeCards(snaps, 'heal');
        ui.feedSelectedIds = {};
        renderAll();
      });
      actionBtns.push(feedBtn);
    }
    var refuseBtn = el('<button class="btn' + (possible ? '' : ' btn-primary') + '">' + (possible ? 'No darle nada' : 'No me alcanza: dejarlo ir') + '</button>');
    refuseBtn.addEventListener('click', function () {
      W.refuse(game, player.id);
      ui.feedSelectedIds = {};
      renderAll();
    });
    actionBtns.push(refuseBtn);
    modalActions(modal, actionBtns);
    return wrap;
  }

  /* ---------------- Animaciones ---------------- */

  function snapshotCards(selector) {
    return Array.prototype.map.call(document.querySelectorAll(selector), function (n) {
      return { rect: n.getBoundingClientRect(), html: n.outerHTML };
    });
  }

  function nextFrame(fn) {
    global.requestAnimationFrame(function () { global.requestAnimationFrame(fn); });
  }

  function comboLabel(levelName) {
    return (levelName || '').replace(/ \(.*\)$/, '').toUpperCase();
  }

  function chipCenter(playerId) {
    var c = chipEl(playerId);
    return c ? FX.centerOf(c) : null;
  }

  /* Lleva la ficha de un jugador de su HP "mostrado" al real, con la animacion que toque. */
  function applyHp(playerId) {
    hpScheduled[playerId] = false;
    var p = S.byId(game, playerId);
    if (!p || !(playerId in shown.hp)) return;
    var before = shown.hp[playerId];
    var wasAlive = shown.alive[playerId];
    shown.hp[playerId] = p.hp;
    shown.alive[playerId] = p.alive;
    var chip = chipEl(playerId);
    if (!chip) return;

    var delta = p.hp - before;
    var pct = hpPct(p.hp, p.maxHp);
    var inner = chip.querySelector('.hp-bar-inner');
    var ghost = chip.querySelector('.hp-bar-ghost');
    var text = chip.querySelector('.hp-text');
    nextFrame(function () {
      if (inner) { inner.style.width = pct + '%'; inner.style.background = 'var(--' + hpColor(pct) + ')'; }
      if (ghost) {
        if (delta < 0) global.setTimeout(function () { ghost.style.width = pct + '%'; }, 380);
        else ghost.style.width = pct + '%';
      }
    });
    if (text) text.textContent = p.hp + ' / ' + p.maxHp + ' HP';

    var rect = chip.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    if (delta < 0) {
      FX.floatText(cx, rect.top + 16, String(delta), 'dmg');
      FX.flashRect(rect, 'dmg');
      FX.shake(chip, delta <= -12);
    } else if (delta > 0) {
      FX.floatText(cx, rect.top + 16, '+' + delta, 'heal');
      FX.flashRect(rect, 'heal');
      FX.sparkles(cx, rect.top + rect.height / 2);
    }
    if (wasAlive && !p.alive) {
      chip.classList.add('dead', 'fx-dying');
      FX.floatText(cx, rect.top + rect.height / 2, '💀', 'skull', 150);
    } else if (!wasAlive && p.alive) {
      chip.classList.remove('dead');
    }
  }

  function applyCoins(p) {
    coinScheduled[p.id] = false;
    var before = shown.coins[p.id];
    if (before === undefined || before === p.coins) return;
    shown.coins[p.id] = p.coins;
    var chip = chipEl(p.id);
    if (!chip) return;
    var coinText = chip.querySelector('.coin-text');
    if (coinText) coinText.innerHTML = coinHtml(p.coins);
    var rect = chip.getBoundingClientRect();
    var d = p.coins - before;
    FX.floatText(rect.left + rect.width / 2, rect.bottom - 12, (d > 0 ? '+' : '') + d + ' 🪙', 'coin');
  }

  /* Jugadores cuyo cambio de HP lo "dispara" el evento en el momento del impacto. */
  function claimsOf(evt) {
    if (evt.type === 'attack') return [evt.targetId, evt.attackerId];
    if (evt.playerId && evt.type !== 'event_card') return [evt.playerId];
    return [];
  }

  function resolveOrigin(origin, fallbackPlayerId) {
    return Promise.resolve(origin).then(function (pt) { return pt || chipCenter(fallbackPlayerId); });
  }

  function playAttack(evt, origin) {
    var target = S.byId(game, evt.targetId);
    var fromMerge = !!origin;
    return resolveOrigin(origin, evt.attackerId).then(function (from) {
      if (from) FX.comboPop(from.x, from.y - (fromMerge ? 10 : 40), comboLabel(evt.levelName), evt.amount + ' de dano', 'attack');
      return FX.projectile(from, chipCenter(evt.targetId), 'attack');
    }).then(function () {
      var to = chipCenter(evt.targetId);
      if (to) FX.burst(to.x, to.y, 'attack', 14);
      applyHp(evt.targetId);
      var big = evt.amount >= 12;
      FX.shake(document.getElementById('board'), big);
      if (big || (game.isTutorial && target && !target.isAI)) FX.vignette('dmg');
      if (evt.reflect > 0) {
        return FX.wait(140).then(function () {
          return FX.projectile(to, chipCenter(evt.attackerId), 'reflect', 360);
        }).then(function () {
          var a = chipCenter(evt.attackerId);
          if (a) FX.burst(a.x, a.y, 'reflect', 8);
          applyHp(evt.attackerId);
        });
      }
      applyHp(evt.attackerId);
      return null;
    }).then(function () { return FX.wait(250); });
  }

  function playHeal(evt, origin) {
    var fromMerge = !!origin;
    return resolveOrigin(origin, evt.playerId).then(function (from) {
      var sub = evt.amount > 0 ? '+' + evt.amount + ' HP' : 'Vida al maximo';
      if (from) FX.comboPop(from.x, from.y - (fromMerge ? 10 : 40), comboLabel(evt.levelName), sub, 'heal');
      return FX.projectile(from, chipCenter(evt.playerId), 'heal');
    }).then(function () {
      applyHp(evt.playerId);
      return FX.wait(250);
    });
  }

  function playMonsterFight(evt, origin) {
    var m = D.MONSTERS[evt.monsterId];
    var stage = FX.monsterStage(m.icon, m.name, evt.hp);
    return FX.wait(300).then(function () {
      if (!evt.amount && !origin) return null;
      return resolveOrigin(origin, evt.playerId).then(function (from) {
        var sc = stage.center();
        if (evt.levelName) FX.comboPop(sc.x, sc.y - 70, comboLabel(evt.levelName), evt.amount + ' de dano', 'attack');
        return FX.projectile(from, sc, 'attack', 480);
      }).then(function () {
        var c = stage.center();
        stage.hit();
        FX.burst(c.x, c.y, 'attack', 12);
      });
    }).then(function () {
      return FX.wait(250);
    }).then(function () {
      if (evt.win) {
        stage.defeat();
        FX.banner('✨ <strong>' + escapeHtml(m.name) + '</strong> derrotado: ¡la Tienda se abre para todos!', 'gold');
      } else {
        stage.resist(evt.amount || undefined, evt.hpLeft);
      }
      return FX.wait(700);
    }).then(function () {
      applyHp(evt.playerId);
      return FX.wait(450);
    }).then(function () { stage.remove(); });
  }

  function playMonsterFlee(evt) {
    var m = D.MONSTERS[evt.monsterId];
    var stage = FX.monsterStage(m.icon, m.name);
    return FX.wait(300).then(function () {
      stage.flee();
      return FX.wait(450);
    }).then(function () {
      applyHp(evt.playerId);
      return FX.wait(500);
    }).then(function () { stage.remove(); });
  }

  /* --- Gusano Suplicante --- */

  /* La ventana del encuentro ya lo presenta: aqui solo tiembla el tablero al salir de la tierra. */
  function playWandererAppear() {
    FX.shake(document.getElementById('board'), true);
    return FX.wait(300);
  }

  function playWandererFed(evt, origin) {
    var w = D.WANDERERS.gusano;
    var stage = FX.monsterStage(FX.wormSvg('beg'), w.name);
    return FX.wait(350).then(function () {
      return resolveOrigin(origin, evt.playerId);
    }).then(function (from) {
      return FX.projectile(from, stage.center(), 'heal', 480);
    }).then(function () {
      var c = stage.center();
      stage.mood('happy');
      stage.label('¡Ñam! ¡Gracias!', 'gold');
      FX.sparkles(c.x, c.y);
      return FX.wait(650);
    }).then(function () {
      if (!evt.healed && !evt.bonus) return null;
      return FX.projectile(stage.center(), chipCenter(evt.playerId), 'heal', 460).then(function () {
        applyHp(evt.playerId);
        if (evt.bonus > 0) {
          var to = chipCenter(evt.playerId);
          if (to) FX.floatText(to.x, to.y + 26, '+' + evt.bonus + ' HP max', 'gold', 280);
        }
      });
    }).then(function () {
      return FX.wait(650);
    }).then(function () { stage.remove(); });
  }

  function playWandererAngry(evt) {
    var w = D.WANDERERS.gusano;
    var p = S.byId(game, evt.playerId);
    var stage = FX.monsterStage(FX.wormSvg('angry'), w.name);
    stage.label('¡GRRR!', 'dmg');
    return FX.wait(500).then(function () {
      if (evt.coinsTaken > 0) {
        return FX.coins(chipCenter(evt.playerId), stage.center(), Math.ceil(evt.coinsTaken / 2)).then(function () {
          applyCoins(p);
          stage.label('Se lleva ' + evt.coinsTaken + ' 🪙', 'dmg');
        });
      }
      stage.lunge();
      return FX.wait(220).then(function () {
        var to = chipCenter(evt.playerId);
        if (to) FX.burst(to.x, to.y, 'attack', 12);
        applyHp(evt.playerId);
        stage.label('¡Te muerde!', 'dmg');
        if (game.isTutorial && p && !p.isAI) FX.vignette('dmg');
      });
    }).then(function () {
      return FX.wait(900);
    }).then(function () { stage.remove(); });
  }

  /* Version instantanea: si las jugadas llegan mas rapido de lo que duran las animaciones,
     se aplican los resultados sin orbes ni esperas para que la pantalla no se quede atras. */
  function playEventFast(evt) {
    claimsOf(evt).forEach(function (pid) { if (hpScheduled[pid]) applyHp(pid); });
    if (evt.type === 'wanderer_angry' && coinScheduled[evt.playerId]) applyCoins(S.byId(game, evt.playerId));
    if (evt.type === 'death') {
      var dead = S.byId(game, evt.playerId);
      FX.banner('💀 <strong>' + escapeHtml(dead.name) + '</strong> ha sido eliminado', 'dmg');
    } else if (evt.type === 'event_card') {
      showEventBanner(evt);
    }
    return Promise.resolve();
  }

  function showEventBanner(evt) {
    var e = D.EVENTS[evt.eventId];
    FX.banner(
      '<span class="fx-banner-icon">' + PX.sprite(e.icon, 'sm') + '</span>' +
      '<span><strong>Suceso: ' + escapeHtml(e.name) + '</strong><small>' + escapeHtml(e.desc) + '</small></span>',
      'event', 3800
    );
  }

  function playEvent(evt, origin) {
    if (fxPending > 2) return playEventFast(evt);
    var p = evt.playerId ? S.byId(game, evt.playerId) : null;
    switch (evt.type) {
      case 'attack': return playAttack(evt, origin);
      case 'heal': return playHeal(evt, origin);
      case 'monster_fight': return playMonsterFight(evt, origin);
      case 'monster_flee': return playMonsterFlee(evt);
      case 'wanderer_appear': return playWandererAppear(evt);
      case 'wanderer_fed': return playWandererFed(evt, origin);
      case 'wanderer_angry': return playWandererAngry(evt);
      case 'death':
        if (hpScheduled[evt.playerId]) applyHp(evt.playerId);
        FX.banner('💀 <strong>' + escapeHtml(p.name) + '</strong> ha sido eliminado', 'dmg');
        return FX.wait(500);
      case 'revive': {
        var c = chipCenter(evt.playerId);
        if (c) FX.burst(c.x, c.y, 'fire', 16);
        FX.banner('🔥 Capa del Fenix: <strong>' + escapeHtml(p.name) + '</strong> revive con 12 HP', 'gold');
        return FX.wait(400);
      }
      case 'event_card':
        showEventBanner(evt);
        return FX.wait(200);
      default:
        return Promise.resolve();
    }
  }

  function fxDone() {
    fxPending = Math.max(0, fxPending - 1);
    if (fxPending === 0 && overlayDeferred) {
      overlayDeferred = false;
      renderAll();
    }
  }

  /* Consume la cola de eventos visuales del motor y los reproduce en orden. Cualquier error
     de animacion se traga: un efecto nunca debe romper la partida. */
  function processFx() {
    var queue = game.fxQueue || [];
    game.fxQueue = [];
    var origin = fxOrigin;
    fxOrigin = null;

    queue.forEach(function (evt) {
      claimsOf(evt).forEach(function (pid) { hpScheduled[pid] = true; });
      if (evt.type === 'wanderer_angry' && evt.coinsTaken > 0) coinScheduled[evt.playerId] = true;
    });

    game.players.forEach(function (p) {
      if (!(p.id in shown.hp)) return;
      if (!hpScheduled[p.id] && (shown.hp[p.id] !== p.hp || shown.alive[p.id] !== p.alive)) applyHp(p.id);
      if (!coinScheduled[p.id]) applyCoins(p);
    });

    queue.forEach(function (evt) {
      var evtOrigin = null;
      if (origin && (evt.type === 'attack' || evt.type === 'heal' || evt.type === 'monster_fight' || evt.type === 'wanderer_fed')) {
        evtOrigin = origin;
        origin = null;
      }
      fxPending += 1;
      fxChain = fxChain
        .then(function () { return playEvent(evt, evtOrigin); })
        .catch(function () { return null; })
        .then(function () {
          claimsOf(evt).forEach(function (pid) { if (hpScheduled[pid]) applyHp(pid); });
          if (evt.type === 'wanderer_angry' && coinScheduled[evt.playerId]) applyCoins(S.byId(game, evt.playerId));
          fxDone();
        });
    });
  }

  /* ---------------- Entrada principal ---------------- */

  function renderAll() {
    renderPlayersBar();
    renderLog();
    renderActionPanel();
    processFx();
    renderOverlay();
    if (game.isTutorial) global.VA_AI.tick(game, renderAll);
  }

  global.VA_UI = {
    setGame: setGame,
    renderAll: renderAll,
    resetActionUi: resetActionUi
  };
})(window);
