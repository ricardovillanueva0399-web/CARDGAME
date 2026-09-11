/* Efectos de las 6 cartas de Suceso (Seccion 5). */
(function (global) {
  'use strict';

  var S = null; /* VA_STATE, enlazado en tiempo de uso para evitar ciclos de carga */
  function state() { return S || (S = global.VA_STATE); }

  function leftNeighbor(game, player) {
    var seatIdx = game.order.indexOf(player.id);
    var n = game.order.length;
    var i = seatIdx;
    var steps = 0;
    do {
      i = (i + 1) % n;
      steps += 1;
      var candidate = state().byId(game, game.order[i]);
      if (candidate.alive) return candidate;
    } while (steps <= n);
    return player;
  }

  function nextAlivePlayerInOrder(game, player) {
    var idx = game.order.indexOf(player.id);
    var n = game.order.length;
    var i = idx;
    var steps = 0;
    do {
      i = (i + game.direction + n) % n;
      steps += 1;
      var candidate = state().byId(game, game.order[i]);
      if (candidate.alive && candidate.id !== player.id) return candidate;
    } while (steps <= n);
    return null;
  }

  function apply(game, player, card) {
    var s = state();
    switch (card.eventId) {
      case 'vortice':
        game.direction *= -1;
        s.logMsg(game, 'Vortice Temporal: el orden de turnos se invierte.');
        break;

      case 'caceria':
        s.logMsg(game, 'Llamada de la Caceria: ' + player.name + ' debe combatir de inmediato. No puede huir.');
        global.VA_MONSTERS.forceEncounter(game, player);
        break;

      case 'impuesto': {
        var target = nextAlivePlayerInOrder(game, player);
        if (target) {
          var give = Math.floor(player.coins / 2);
          player.coins -= give;
          target.coins += give;
          s.logMsg(game, 'Impuesto Revolucionario: ' + player.name + ' entrega ' + give + ' Monedas a ' + target.name + '.');
        }
        break;
      }

      case 'cofre':
        game.flags.cofreMimetico = true;
        s.logMsg(game, 'Cofre Mimetico: el proximo monstruo derrotado dara doble recompensa, pero tiene +5 HP.');
        break;

      case 'mercado': {
        var order = s.alivePlayers(game).map(function (p) { return p.id; });
        game.pending = { type: 'mercado_negro', order: order, picks: {}, cursor: 0 };
        s.logMsg(game, 'Mercado Negro: todos los jugadores deben elegir 1 carta para pasar a su izquierda.');
        break;
      }

      case 'niebla':
        game.flags.nieblaTurnsLeft = s.alivePlayers(game).length;
        s.logMsg(game, 'Niebla de Guerra: ninguna carta de Botin puede usarse durante la proxima ronda.');
        break;

      default:
        break;
    }
  }

  function finalizeMercado(game) {
    var s = state();
    var pend = game.pending;
    /* Repartir las cartas elegidas: cada jugador que eligio carta se la entrega a su vecino
       de la izquierda. Quien no tenia cartas simplemente no entrega nada. */
    pend.order.forEach(function (pid) {
      var card = pend.picks[pid];
      if (!card) return;
      var giver = s.byId(game, pid);
      var neighbor = leftNeighbor(game, giver);
      neighbor.hand.push(card);
    });
    game.pending = null;
    s.logMsg(game, 'Mercado Negro resuelto: las cartas elegidas pasaron a la izquierda de cada jugador.');
    s.resumeDraw(game);
  }

  function pickMercadoCard(game, playerId, cardId) {
    var s = state();
    if (!game.pending || game.pending.type !== 'mercado_negro') return { ok: false, error: 'No hay Mercado Negro activo.' };
    var pend = game.pending;
    if (pend.order[pend.cursor] !== playerId) return { ok: false, error: 'No es tu turno de elegir.' };
    var player = s.byId(game, playerId);
    var card = player.hand.filter(function (c) { return c.id === cardId; })[0];
    if (!card) return { ok: false, error: 'Carta no encontrada en tu mano.' };

    player.hand = player.hand.filter(function (c) { return c.id !== cardId; });
    pend.picks[playerId] = card;
    pend.cursor += 1;

    if (pend.cursor >= pend.order.length) finalizeMercado(game);
    return { ok: true };
  }

  function skipMercadoPlayer(game, playerId) {
    var pend = game.pending;
    if (!pend || pend.type !== 'mercado_negro') return { ok: false, error: 'No hay Mercado Negro activo.' };
    if (pend.order[pend.cursor] !== playerId) return { ok: false, error: 'No es tu turno.' };
    pend.picks[playerId] = null;
    pend.cursor += 1;
    if (pend.cursor >= pend.order.length) finalizeMercado(game);
    return { ok: true };
  }

  global.VA_EVENTS = {
    apply: apply,
    pickMercadoCard: pickMercadoCard,
    skipMercadoPlayer: skipMercadoPlayer
  };
})(window);
