/* Estado de partida y motor de turnos. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  var DECK = global.VA_DECK;
  var HANDS = global.VA_HANDS;
  var COMBAT = global.VA_COMBAT;

  function makePlayer(id, name, classId, isAI) {
    var cls = D.CLASSES[classId];
    return {
      id: id,
      name: name,
      classId: classId,
      isAI: !!isAI,
      maxHp: cls.maxHp,
      hp: cls.maxHp,
      coins: 0,
      artifacts: [],
      lootBag: [],
      hand: [],
      deck: DECK.buildPlayerDeck(),
      alive: true,
      vampHealedThisTurn: 0,
      espejoRotoActive: false,
      manoFriaActive: false,
      phoenixUsed: false
    };
  }

  function createGame(playerDefs) {
    var game = {
      players: playerDefs.map(function (def, idx) {
        return makePlayer('p' + idx, def.name, def.classId, def.isAI);
      }),
      order: playerDefs.map(function (def, idx) { return 'p' + idx; }),
      turnIndex: 0,
      direction: 1,
      round: 1,
      log: [],
      phase: 'setup',
      pending: null,
      drawContext: null,
      flags: { cofreMimetico: false, nieblaTurnsLeft: 0 },
      gameOver: false,
      winnerId: null,
      isTutorial: false
    };
    return game;
  }

  function logMsg(game, msg) {
    game.log.push(msg);
    if (game.log.length > 300) game.log.shift();
  }

  function byId(game, id) {
    var i;
    for (i = 0; i < game.players.length; i += 1) {
      if (game.players[i].id === id) return game.players[i];
    }
    return null;
  }

  function alivePlayers(game) {
    return game.players.filter(function (p) { return p.alive; });
  }

  function otherAlivePlayers(game, playerId) {
    return alivePlayers(game).filter(function (p) { return p.id !== playerId; });
  }

  function currentPlayer(game) {
    return byId(game, game.order[game.turnIndex]);
  }

  function nextTurnIndex(game) {
    var n = game.order.length;
    var idx = game.turnIndex;
    var steps = 0;
    do {
      idx = (idx + game.direction + n) % n;
      steps += 1;
      if (steps > n) return game.turnIndex;
    } while (!byId(game, game.order[idx]).alive);
    return idx;
  }

  function checkGameOver(game) {
    var alive = alivePlayers(game);
    if (alive.length <= 1 && game.players.length > 1) {
      game.gameOver = true;
      game.winnerId = alive.length === 1 ? alive[0].id : null;
      game.phase = 'gameover';
      logMsg(game, alive.length === 1 ? (alive[0].name + ' gana la partida.') : 'Todos los jugadores han caido.');
      return true;
    }
    return false;
  }

  function killOrRevive(game, player) {
    if (player.hp > 0) return false;
    if (player.artifacts.indexOf('capa') !== -1 && !player.phoenixUsed) {
      player.phoenixUsed = true;
      player.artifacts = player.artifacts.filter(function (a) { return a !== 'capa'; });
      player.hp = 12;
      logMsg(game, player.name + ' cae a 0 HP pero la Capa del Fenix lo revive con 12 HP.');
      return false;
    }
    player.alive = false;
    player.hp = 0;
    logMsg(game, player.name + ' ha sido eliminado.');
    return true;
  }

  /* Si el jugador activo muere durante su propio turno (penalizacion de monstruo, Transfusion,
     perdida de HP del Sanguinario, etc.) y la partida no termina, su turno se cierra de inmediato
     en vez de intentar seguir robando o actuando con un jugador eliminado. */
  function endTurnIfPlayerDied(game, player) {
    if (player.alive) return false;
    if (checkGameOver(game)) return true;
    game.drawContext = null;
    game.pending = null;
    endTurn(game);
    return true;
  }

  /*
   * Igual que endTurnIfPlayerDied, pero para usar SOLO cuando la llamada ocurre dentro de un
   * drawLoop() ya en curso mas arriba en la misma pila (por ejemplo, una derrota automatica
   * contra un monstruo forzado por Llamada de la Caceria, resuelta sincronamente al procesar
   * el Suceso dentro del propio bucle de robo). Marca _turnEnded para que ese drawLoop()
   * externo, al recuperar el control, deje de seguir robando para un jugador que ya no esta
   * en su turno. No usar esto fuera de un drawLoop en curso: el flag quedaria activo y
   * abortaria, por error, el proximo drawLoop legitimo de otro turno.
   */
  function endTurnIfPlayerDiedNested(game, player) {
    var ended = endTurnIfPlayerDied(game, player);
    if (ended) game._turnEnded = true;
    return ended;
  }

  function isCardLoose(hand, card) {
    return !hand.some(function (other) {
      return other.id !== card.id && other.color === card.color && other.value === card.value;
    });
  }

  /* --- Fase de robo ---
   * target: numero de cartas en mano al que se quiere llegar (por defecto HAND_SIZE).
   * onComplete: 'action' inicia la fase de accion al terminar; 'none' solo limpia el contexto
   * (usado por efectos como Transfusion Prohibida que roban fuera de la fase de robo normal).
   */
  function drawLoop(game, player, target, onComplete) {
    target = target === undefined ? D.HAND_SIZE : target;
    onComplete = onComplete || 'action';
    game.drawContext = { playerId: player.id, target: target, onComplete: onComplete };
    while (player.hand.length < target) {
      if (game._turnEnded) { game._turnEnded = false; return; }

      var card = DECK.drawOne(player.deck);
      if (!card) break;

      if (card.kind === 'event') {
        logMsg(game, player.name + ' roba un Suceso: ' + card.name + '.');
        player.deck.discardPile.push(card);
        global.VA_EVENTS.apply(game, player, card);
        if (game._turnEnded) { game._turnEnded = false; return; }
        if (game.pending) return;
        continue;
      }

      if (card.kind === 'monster') {
        global.VA_MONSTERS.startEncounter(game, player, card, true);
        return;
      }

      player.hand.push(card);
    }
    game.drawContext = null;
    if (onComplete === 'action') beginActionPhase(game, player);
  }

  function resumeDraw(game) {
    if (!game.drawContext) return;
    var player = byId(game, game.drawContext.playerId);
    if (!player) return;
    drawLoop(game, player, game.drawContext.target, game.drawContext.onComplete);
  }

  function beginActionPhase(game, player) {
    game.phase = 'action';
    game.pending = null;
    logMsg(game, '--- Turno de ' + player.name + ' (mano: ' + player.hand.length + ' cartas) ---');
  }

  /* --- Inicio de turno --- */
  function startTurn(game) {
    if (checkGameOver(game)) return;
    var player = currentPlayer(game);
    if (!player || !player.alive) {
      game.turnIndex = nextTurnIndex(game);
      startTurn(game);
      return;
    }

    player.vampHealedThisTurn = 0;

    if (game.flags.nieblaTurnsLeft > 0) game.flags.nieblaTurnsLeft -= 1;

    if (player.classId === 'sanguinario') {
      player.hp = Math.max(0, player.hp - 1);
      logMsg(game, player.name + ' (Sanguinario) pierde 1 HP al iniciar su turno.');
      killOrRevive(game, player);
      if (endTurnIfPlayerDied(game, player)) return;
    }

    if (player.classId === 'cleptomano') {
      var protectedRivals = otherAlivePlayers(game, player.id).filter(function (p) { return p.manoFriaActive && p.hand.length > 0; });
      protectedRivals.forEach(function (p) {
        p.manoFriaActive = false;
        logMsg(game, p.name + ' evita el robo del Cleptomano gracias a Mano Fria.');
      });
      var rivals = otherAlivePlayers(game, player.id).filter(function (p) { return p.hand.length > 0 && !p.manoFriaActive; });
      if (rivals.length > 0) {
        var victim = rivals[Math.floor(Math.random() * rivals.length)];
        var idx = Math.floor(Math.random() * victim.hand.length);
        var stolen = victim.hand.splice(idx, 1)[0];
        player.hand.push(stolen);
        logMsg(game, player.name + ' (Cleptomano) roba una carta de la mano de ' + victim.name + '.');
      }
    }

    drawLoop(game, player);
  }

  function endTurn(game) {
    game.turnIndex = nextTurnIndex(game);
    game.round += 1;
    requestPassDevice(game);
  }

  /* Pantalla de "pasa el dispositivo" entre turnos, para partidas locales en un solo dispositivo. */
  function requestPassDevice(game) {
    if (checkGameOver(game)) return;
    game.phase = 'pass_device';
    game.pending = null;
  }

  function confirmPassDevice(game) {
    if (game.phase !== 'pass_device') return;
    /*
     * Importante: salir de 'pass_device' ANTES de startTurn(). startTurn puede pausar
     * a mitad de camino (robo de un monstruo o de un Suceso como Mercado Negro) sin
     * llegar a beginActionPhase. Si la fase siguiera en 'pass_device' durante esa pausa,
     * el overlay de "pasa el dispositivo" volveria a mostrarse por encima del overlay
     * real (monstruo/suceso), y un click ahi repetiria startTurn desde cero.
     */
    game.phase = 'drawing';
    startTurn(game);
  }

  /* --- Fase de accion: jugar una mano --- */
  function playHand(game, playerId, cardIds, declaredType, targetId, useDaga) {
    var player = byId(game, playerId);
    if (!player || game.phase !== 'action') return { ok: false, error: 'No es el momento de jugar una mano.' };

    var selected = cardIds.map(function (cid) {
      return player.hand.filter(function (c) { return c.id === cid; })[0];
    }).filter(Boolean);
    if (selected.length === 0) return { ok: false, error: 'Selecciona al menos una carta.' };

    var isAlquimista = player.classId === 'alquimista';
    var result = HANDS.evaluateHand(selected, declaredType, isAlquimista);
    if (!result.valid) return { ok: false, error: result.reason };

    if (useDaga) {
      if (!hasUsableLoot(game, player, 'daga')) return { ok: false, error: 'No tienes Daga de Sacrificio disponible.' };
      if (player.hp <= 4) return { ok: false, error: 'No puedes usar la Daga con 4 HP o menos.' };
    }

    var log = [];
    if (declaredType === 'attack') {
      var defender = byId(game, targetId);
      if (!defender || !defender.alive) return { ok: false, error: 'Objetivo invalido.' };
      var atkOut = COMBAT.resolveAttack(player, defender, result, { useDaga: !!useDaga });
      log = atkOut.log;
      if (useDaga) consumeLoot(player, 'daga');
      killOrRevive(game, defender);
      killOrRevive(game, player);
    } else {
      var healOut = COMBAT.resolveHeal(player, result);
      log = healOut.log;
    }

    selected.concat(result.wastedCards).forEach(function (c) {
      player.hand = player.hand.filter(function (h) { return h.id !== c.id; });
      player.deck.discardPile.push(c);
    });

    log.forEach(function (l) { logMsg(game, l); });

    if (checkGameOver(game)) return { ok: true, log: log };
    if (endTurnIfPlayerDied(game, player)) return { ok: true, log: log };
    game.phase = 'end_of_turn';
    return { ok: true, log: log };
  }

  function passAction(game, playerId) {
    var player = byId(game, playerId);
    if (!player || game.phase !== 'action') return;
    logMsg(game, player.name + ' pasa sin jugar una mano.');
    game.phase = 'end_of_turn';
  }

  function discardForCoins(game, playerId, cardId) {
    var player = byId(game, playerId);
    if (!player || game.phase !== 'end_of_turn') return { ok: false, error: 'No es el momento.' };
    var card = player.hand.filter(function (c) { return c.id === cardId; })[0];
    if (!card) return { ok: false, error: 'Carta no encontrada.' };
    if (!isCardLoose(player.hand, card)) return { ok: false, error: 'Esa carta forma parte de una mano posible.' };
    player.hand = player.hand.filter(function (c) { return c.id !== cardId; });
    player.deck.discardPile.push(card);
    player.coins += card.value;
    logMsg(game, player.name + ' descarta una carta suelta (valor ' + card.value + ') por ' + card.value + ' Monedas de Arena.');
    return { ok: true };
  }

  function finishEndOfTurn(game, playerId) {
    var player = byId(game, playerId);
    if (!player || game.phase !== 'end_of_turn') return;
    endTurn(game);
  }

  function hasUsableLoot(game, player, lootId) {
    if (game.flags.nieblaTurnsLeft > 0) return false;
    return player.lootBag.indexOf(lootId) !== -1;
  }

  /*
   * Botin activable fuera del flujo de ataque (Daga de Sacrificio se activa como parte
   * de playHand/combate contra monstruo, ver arriba). Solo se permite en tu propio turno.
   */
  function activateLoot(game, playerId, lootId) {
    var player = byId(game, playerId);
    if (!player) return { ok: false, error: 'Jugador invalido.' };
    if (!currentPlayer(game) || currentPlayer(game).id !== playerId) {
      return { ok: false, error: 'Solo puedes usar Botin en tu propio turno.' };
    }
    if (!hasUsableLoot(game, player, lootId)) {
      return { ok: false, error: 'No tienes esa carta de Botin disponible (o esta bloqueada por Niebla de Guerra).' };
    }

    if (lootId === 'mano_fria') {
      consumeLoot(player, lootId);
      player.manoFriaActive = true;
      logMsg(game, player.name + ' activa Mano Fria: protegida contra el proximo robo de un rival.');
      game.lastCancelable = {
        ownerId: playerId,
        label: 'Mano Fria de ' + player.name,
        stillValid: function () { return player.manoFriaActive; },
        undo: function () { player.manoFriaActive = false; }
      };
      return { ok: true };
    }

    if (lootId === 'espejo_roto') {
      consumeLoot(player, lootId);
      player.espejoRotoActive = true;
      logMsg(game, player.name + ' activa Espejo Roto: reflejara el proximo ataque recibido al 50%.');
      game.lastCancelable = {
        ownerId: playerId,
        label: 'Espejo Roto de ' + player.name,
        stillValid: function () { return player.espejoRotoActive; },
        undo: function () { player.espejoRotoActive = false; }
      };
      return { ok: true };
    }

    if (lootId === 'transfusion') {
      if (player.hp <= 6) return { ok: false, error: 'No puedes usar Transfusion Prohibida con 6 HP o menos.' };
      consumeLoot(player, lootId);
      player.hp = Math.max(0, player.hp - 6);
      logMsg(game, player.name + ' usa Transfusion Prohibida: pierde 6 HP para robar 3 cartas.');
      killOrRevive(game, player);
      if (endTurnIfPlayerDied(game, player)) return { ok: true };
      drawLoop(game, player, player.hand.length + 3, 'none');
      return { ok: true };
    }

    return { ok: false, error: 'Esa carta de Botin no se activa manualmente.' };
  }

  /* Yep!: cancela la ultima Mano Fria / Espejo Roto armados o Transfusion en curso de un rival. */
  function useYep(game, playerId) {
    var player = byId(game, playerId);
    if (!player) return { ok: false, error: 'Jugador invalido.' };
    if (!hasUsableLoot(game, player, 'yep')) {
      return { ok: false, error: 'No tienes Yep! disponible (o esta bloqueado por Niebla de Guerra).' };
    }
    if (!game.lastCancelable || !game.lastCancelable.stillValid()) {
      game.lastCancelable = null;
      return { ok: false, error: 'No hay ninguna accion cancelable en este momento.' };
    }
    if (game.lastCancelable.ownerId === playerId) {
      return { ok: false, error: 'No puedes cancelar tu propia carta con Yep!.' };
    }
    consumeLoot(player, 'yep');
    var label = game.lastCancelable.label;
    game.lastCancelable.undo();
    game.lastCancelable = null;
    logMsg(game, player.name + ' usa Yep! y cancela: ' + label + '.');
    return { ok: true };
  }

  function consumeLoot(player, lootId) {
    var idx = player.lootBag.indexOf(lootId);
    if (idx !== -1) player.lootBag.splice(idx, 1);
  }

  global.VA_STATE = {
    createGame: createGame,
    byId: byId,
    alivePlayers: alivePlayers,
    otherAlivePlayers: otherAlivePlayers,
    currentPlayer: currentPlayer,
    nextTurnIndex: nextTurnIndex,
    checkGameOver: checkGameOver,
    killOrRevive: killOrRevive,
    endTurnIfPlayerDied: endTurnIfPlayerDied,
    endTurnIfPlayerDiedNested: endTurnIfPlayerDiedNested,
    isCardLoose: isCardLoose,
    startTurn: startTurn,
    endTurn: endTurn,
    requestPassDevice: requestPassDevice,
    confirmPassDevice: confirmPassDevice,
    resumeDraw: resumeDraw,
    beginActionPhase: beginActionPhase,
    playHand: playHand,
    passAction: passAction,
    discardForCoins: discardForCoins,
    finishEndOfTurn: finishEndOfTurn,
    hasUsableLoot: hasUsableLoot,
    consumeLoot: consumeLoot,
    activateLoot: activateLoot,
    useYep: useYep,
    logMsg: logMsg
  };
})(window);
