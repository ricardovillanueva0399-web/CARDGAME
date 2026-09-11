/* Interfaz: renderizado y manejo de eventos del DOM. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  var S = global.VA_STATE;

  var SUIT_SYMBOL = { picas: '♠', treboles: '♣', corazones: '♥', diamantes: '♦' };

  var game = null;
  var ui = { selectedCardIds: {}, declaredType: null, targetId: null, useDaga: false, error: '', fightSelectedIds: {}, fightUseDaga: false, fightMode: false };

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
    var suit = SUIT_SYMBOL[card.suit];
    var node = el(
      '<div class="' + classes + '" data-card-id="' + card.id + '">' +
        '<div class="corner corner-tl"><span>' + card.value + '</span><span>' + suit + '</span></div>' +
        '<div class="val">' + card.value + '</div>' +
        '<div class="suit">' + suit + '</div>' +
        '<div class="corner corner-br"><span>' + card.value + '</span><span>' + suit + '</span></div>' +
        (opts.looseValue ? '<div class="loose-tag">+' + opts.looseValue + '</div>' : '') +
      '</div>'
    );
    return node;
  }

  function renderPlayersBar() {
    var bar = document.getElementById('players-bar');
    bar.innerHTML = '';
    var current = S.currentPlayer(game);
    game.players.forEach(function (p) {
      var pct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
      var hpClass = pct > 55 ? 'hp-full' : (pct > 25 ? 'hp-mid' : 'hp-low');
      var chip = el(
        '<div class="player-chip' + (p.id === current.id ? ' current' : '') + (p.alive ? '' : ' dead') + '">' +
          '<div class="pname"><span class="class-icon">' + D.CLASSES[p.classId].icon + '</span>' + escapeHtml(p.name) + (p.isAI ? ' <span class="ai-badge">IA</span>' : '') + '</div>' +
          '<div class="pclass">' + D.CLASSES[p.classId].name + '</div>' +
          '<div class="hp-bar-outer"><div class="hp-bar-inner" style="width:' + pct + '%;background:var(--' + hpClass + ')"></div></div>' +
          '<div class="hp-text">' + p.hp + ' / ' + p.maxHp + ' HP</div>' +
          '<div class="coin-text">' + p.coins + ' Monedas</div>' +
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
    panel.innerHTML = '<span class="coach-icon">&#128161;</span><span>' + escapeHtml(text) + '</span>';
  }

  function clearCoach() {
    var panel = document.getElementById('coach-panel');
    if (!panel) return;
    panel.hidden = true;
    panel.innerHTML = '';
  }

  function renderHandForAction(player, handArea) {
    player.hand.forEach(function (card) {
      var node = cardNode(card, { selectedMap: ui.selectedCardIds });
      node.addEventListener('click', function () {
        if (ui.selectedCardIds[card.id]) delete ui.selectedCardIds[card.id];
        else ui.selectedCardIds[card.id] = true;
        renderAll();
      });
      handArea.appendChild(node);
    });
  }

  function selectedCardIdsArray() { return Object.keys(ui.selectedCardIds); }

  function renderActionControls(player, controls) {
    var group1 = el('<div class="group"></div>');
    var atkBtn = el('<button class="btn">Declarar Ataque</button>');
    var healBtn = el('<button class="btn">Declarar Curacion</button>');
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

    if (!ui.declaredType) return;

    var selected = selectedCardIdsArray().map(function (id) {
      return player.hand.filter(function (c) { return c.id === id; })[0];
    }).filter(Boolean);
    var isAlquimista = player.classId === 'alquimista';
    var preview = selected.length ? global.VA_HANDS.evaluateHand(selected, ui.declaredType, isAlquimista) : null;

    var info = el('<div class="info"></div>');
    if (preview && preview.valid) {
      info.textContent = preview.levelName + (preview.mainValue !== null ? ' (carta principal ' + preview.mainValue + ')' : '') + ' -> valor base ' + preview.baseValue + '.';
    } else {
      info.textContent = 'Selecciona cartas de mano para formar una jugada de ' + (ui.declaredType === 'attack' ? 'Ataque' : 'Curacion') + '.';
    }
    controls.appendChild(info);

    if (ui.declaredType === 'attack') {
      var targetGroup = el('<div class="group"></div>');
      S.otherAlivePlayers(game, player.id).forEach(function (rival) {
        var tbtn = el('<button class="btn btn-small' + (ui.targetId === rival.id ? ' btn-primary' : '') + '">' + escapeHtml(rival.name) + '</button>');
        tbtn.addEventListener('click', function () { ui.targetId = rival.id; renderAll(); });
        targetGroup.appendChild(tbtn);
      });
      controls.appendChild(targetGroup);

      if (S.hasUsableLoot(game, player, 'daga') && player.hp > 4) {
        var dagaWrap = el('<label style="font-size:0.78rem;color:var(--muted)"><input type="checkbox" id="use-daga-chk"> Usar Daga de Sacrificio (+15, -4 HP)</label>');
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
      var res = S.playHand(game, player.id, selectedCardIdsArray(), ui.declaredType, ui.targetId, ui.useDaga);
      if (!res.ok) { ui.error = res.error; renderAll(); return; }
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
    player.hand.forEach(function (card) {
      var loose = S.isCardLoose(player.hand, card);
      var node = cardNode(card, { looseValue: loose ? card.value : null });
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

  function renderOverlay() {
    var root = document.getElementById('overlay-root');
    root.innerHTML = '';

    if (game.gameOver) {
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
    }
  }

  function overlayWrap(innerHtml) {
    return el('<div class="overlay"><div class="modal">' + innerHtml + '</div></div>');
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
    wrap.querySelector('.modal').appendChild(btn);
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
    wrap.querySelector('.modal').appendChild(btn);
    return wrap;
  }

  function buildMonsterOverlay() {
    var pend = game.pending;
    var player = S.byId(game, pend.playerId);
    var wrap = overlayWrap(
      '<h3>' + D.MONSTERS[pend.monsterId].icon + ' Encuentro: ' + escapeHtml(pend.monsterName) + '</h3>' +
      '<p>HP del monstruo: <strong>' + pend.hp + '</strong>' + (pend.cofreBoosted ? ' (+5 por Cofre Mimetico)' : '') + '</p>' +
      '<p class="hint">Referencia de dificultad: ' + pend.minLabel + '. La regla real es: dano total &gt;= HP del monstruo.</p>'
    );
    var modal = wrap.querySelector('.modal');

    if (game.isTutorial && !player.isAI) {
      modal.appendChild(el('<p class="coach-line">' + escapeHtml(global.VA_COACH.monsterHint(pend, ui.fightMode, Object.keys(ui.fightSelectedIds).length)) + '</p>'));
    }

    if (!ui.fightMode) {
      var fightBtn = el('<button class="btn btn-primary">Combatir</button>');
      var fleeBtn = el('<button class="btn"' + (pend.canFlee ? '' : ' disabled') + '>Huir' + (pend.canFlee ? '' : ' (no permitido)') + '</button>');
      fightBtn.addEventListener('click', function () { ui.fightMode = true; ui.fightSelectedIds = {}; ui.fightUseDaga = false; renderAll(); });
      fleeBtn.addEventListener('click', function () {
        if (!pend.canFlee) return;
        var res = global.VA_MONSTERS.decide(game, player.id, 'flee', [], false);
        if (!res.ok) alert(res.error);
        renderAll();
      });
      modal.appendChild(fightBtn);
      modal.appendChild(fleeBtn);
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
      var dagaWrap = el('<label style="font-size:0.78rem;color:var(--muted);display:block;margin-bottom:6px"><input type="checkbox"> Usar Daga de Sacrificio (+15, -4 HP)</label>');
      var chk = dagaWrap.querySelector('input');
      chk.checked = ui.fightUseDaga;
      chk.addEventListener('change', function () { ui.fightUseDaga = chk.checked; });
      modal.appendChild(dagaWrap);
    }

    var confirmBtn = el('<button class="btn btn-primary">Confirmar ataque</button>');
    var backBtn = el('<button class="btn">Volver</button>');
    confirmBtn.addEventListener('click', function () {
      var res = global.VA_MONSTERS.decide(game, player.id, 'fight', Object.keys(ui.fightSelectedIds), ui.fightUseDaga);
      if (!res.ok) { alert(res.error); return; }
      ui.fightMode = false;
      renderAll();
    });
    backBtn.addEventListener('click', function () { ui.fightMode = false; renderAll(); });
    modal.appendChild(confirmBtn);
    modal.appendChild(backBtn);
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

    if (game.isTutorial && !player.isAI) {
      modal.appendChild(el('<p class="coach-line">' + escapeHtml(global.VA_COACH.shopHint()) + '</p>'));
    }

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
    modal.appendChild(doneBtn);
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
      modal.appendChild(skipBtn);
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
    modal.appendChild(btn1);
    modal.appendChild(btn2);
    return wrap;
  }

  /* ---------------- Entrada principal ---------------- */

  function renderAll() {
    renderPlayersBar();
    renderLog();
    renderActionPanel();
    renderOverlay();
    if (game.isTutorial) global.VA_AI.tick(game, renderAll);
  }

  global.VA_UI = {
    setGame: setGame,
    renderAll: renderAll,
    resetActionUi: resetActionUi
  };
})(window);
