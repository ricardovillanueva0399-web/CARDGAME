/*
 * Criaturas errantes (extension propia, no esta en el Marco de Diseno v3.3).
 *
 * No son cartas del mazo: aparecen al azar al terminar el robo de un turno, con la mano
 * ya completa, y plantean un dilema en vez de un combate. Por ahora hay una sola:
 *
 *   Gusano Suplicante: pide comida. Alimentarlo cuesta cartas de la mano (suma de valores
 *   >= feedNeed) y cura `heal` HP; la curacion que sobre (por tener la vida casi llena) se
 *   convierte en HP maximo permanente, hasta `maxHpBonusCap`. Si no lo alimentas (porque
 *   no quieres o porque no te alcanza) se enoja y se lleva casi todas tus monedas; si no
 *   tienes ninguna, te muerde (nunca te deja en 0 HP).
 */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  function S() { return global.VA_STATE; }

  /* Solo a partir de la segunda vuelta de la mesa, para no castigar a nadie antes de que
     haya podido juntar monedas o jugar una mano. */
  function canSpawn(game) {
    return game.round > S().alivePlayers(game).length;
  }

  /* Llamado por drawLoop() al completar la mano de inicio de turno. Devuelve true si el
     gusano aparecio (la fase de accion empieza cuando se resuelva). */
  function maybeSpawn(game, player) {
    var w = D.WANDERERS.gusano;
    if (!canSpawn(game) || Math.random() >= w.chance) return false;
    game.pending = { type: 'wanderer', wandererId: w.id, playerId: player.id, need: w.feedNeed };
    S().logMsg(game, '¡Un ' + w.name + ' sale de la tierra frente a ' + player.name + ' y le suplica comida!');
    S().pushFx(game, { type: 'wanderer_appear', wandererId: w.id, playerId: player.id });
    return true;
  }

  function sumValues(cards) {
    return cards.reduce(function (acc, c) { return acc + c.value; }, 0);
  }

  function canFeed(player) {
    return sumValues(player.hand) >= D.WANDERERS.gusano.feedNeed;
  }

  function checkPending(game, playerId) {
    var p = game.pending;
    return p && p.type === 'wanderer' && p.playerId === playerId;
  }

  function finish(game, player) {
    game.pending = null;
    S().beginActionPhase(game, player);
  }

  function feed(game, playerId, cardIds) {
    var s = S();
    var w = D.WANDERERS.gusano;
    if (!checkPending(game, playerId)) return { ok: false, error: 'No hay ninguna criatura esperando comida.' };
    var player = s.byId(game, playerId);
    var chosen = (cardIds || []).map(function (cid) {
      return player.hand.filter(function (c) { return c.id === cid; })[0];
    }).filter(Boolean);
    if (chosen.length === 0) return { ok: false, error: 'Elige las cartas que le vas a dar.' };
    var total = sumValues(chosen);
    if (total < w.feedNeed) {
      return { ok: false, error: 'No le alcanza: tus cartas suman ' + total + ' y necesita al menos ' + w.feedNeed + '.' };
    }

    chosen.forEach(function (c) {
      player.hand = player.hand.filter(function (h) { return h.id !== c.id; });
      player.deck.discardPile.push(c);
    });

    var room = player.maxHp - player.hp;
    var healed = Math.min(w.heal, room);
    var bonus = Math.min(w.heal - healed, w.maxHpBonusCap);
    player.maxHp += bonus;
    player.hp += healed + bonus;

    var msg = player.name + ' alimenta al ' + w.name + ' con ' + chosen.length + ' carta(s) (valor ' + total + ')';
    if (healed > 0) msg += ': recupera ' + healed + ' HP';
    if (bonus > 0) msg += (healed > 0 ? ' y' : ':') + ' gana +' + bonus + ' HP maximo permanente';
    if (healed === 0 && bonus === 0) msg += ', pero ya no le cabe mas vida';
    s.logMsg(game, msg + '.');
    s.pushFx(game, { type: 'wanderer_fed', wandererId: w.id, playerId: player.id, healed: healed, bonus: bonus });

    finish(game, player);
    return { ok: true };
  }

  function refuse(game, playerId) {
    var s = S();
    var w = D.WANDERERS.gusano;
    if (!checkPending(game, playerId)) return { ok: false, error: 'No hay ninguna criatura esperando comida.' };
    var player = s.byId(game, playerId);

    var coinsTaken = Math.ceil(player.coins * w.coinsTakenPct);
    var bitten = 0;
    if (coinsTaken > 0) {
      player.coins -= coinsTaken;
      s.logMsg(game, 'El ' + w.name + ' se enfurece y le arrebata ' + coinsTaken + ' Monedas a ' + player.name + ' (le quedan ' + player.coins + ').');
    } else {
      /* Sin monedas que quitar, negarse no puede salir gratis: muerde. Nunca mata. */
      bitten = Math.max(0, Math.min(w.bite, player.hp - 1));
      player.hp -= bitten;
      s.logMsg(game, 'El ' + w.name + ' se enfurece y, como ' + player.name + ' no tiene monedas, le muerde: -' + bitten + ' HP.');
    }
    s.pushFx(game, { type: 'wanderer_angry', wandererId: w.id, playerId: player.id, coinsTaken: coinsTaken, bitten: bitten });

    finish(game, player);
    return { ok: true };
  }

  /*
   * Para la IA: el subconjunto de cartas de suma minima que alcanza el minimo, prefiriendo
   * no romper parejas/grupos. Fuerza bruta sobre la mano (como mucho ~10 cartas).
   */
  function cheapestMeal(player) {
    var need = D.WANDERERS.gusano.feedNeed;
    var hand = player.hand;
    var n = hand.length;
    if (n === 0 || n > 12 || sumValues(hand) < need) return null;
    var best = null;
    var bestScore = Infinity;
    for (var mask = 1; mask < (1 << n); mask += 1) {
      var pick = [];
      for (var i = 0; i < n; i += 1) if (mask & (1 << i)) pick.push(hand[i]);
      var total = sumValues(pick);
      if (total < need) continue;
      var brokenGroups = pick.filter(function (c) { return !S().isCardLoose(hand, c); }).length;
      var score = total + brokenGroups * 3;
      if (score < bestScore) { bestScore = score; best = pick; }
    }
    return best;
  }

  global.VA_WANDERERS = {
    maybeSpawn: maybeSpawn,
    canFeed: canFeed,
    sumValues: sumValues,
    feed: feed,
    refuse: refuse,
    cheapestMeal: cheapestMeal
  };
})(window);
