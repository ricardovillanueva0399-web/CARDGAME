/* Tienda de la Arena (Seccion 4.1): aparece tras derrotar un monstruo, para todos. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  function state() { return global.VA_STATE; }

  function openQueueForAll(game, triggeringPlayerId) {
    var s = state();
    var alive = s.alivePlayers(game).map(function (p) { return p.id; });
    var startIdx = alive.indexOf(triggeringPlayerId);
    var ordered = alive.slice(startIdx).concat(alive.slice(0, startIdx));
    var savedDrawContext = game.drawContext || { playerId: triggeringPlayerId, target: D.HAND_SIZE, onComplete: 'action' };
    game.pending = { type: 'shop', queue: ordered, index: 0, savedDrawContext: savedDrawContext };
    s.logMsg(game, 'La Tienda de la Arena se abre para todos los jugadores.');
  }

  function currentShopper(game) {
    if (!game.pending || game.pending.type !== 'shop') return null;
    return game.pending.queue[game.pending.index];
  }

  function buyLoot(game, playerId, lootId) {
    var s = state();
    if (currentShopper(game) !== playerId) return { ok: false, error: 'No es tu turno en la Tienda.' };
    var player = s.byId(game, playerId);
    var item = D.LOOT[lootId];
    if (!item || item.price === null) return { ok: false, error: 'Ese objeto no esta a la venta.' };
    if (player.coins < item.price) return { ok: false, error: 'No tienes suficientes Monedas.' };
    player.coins -= item.price;
    player.lootBag.push(lootId);
    s.logMsg(game, player.name + ' compra ' + item.name + ' por ' + item.price + ' Monedas.');
    return { ok: true };
  }

  function buyArtifact(game, playerId, artifactId) {
    var s = state();
    if (currentShopper(game) !== playerId) return { ok: false, error: 'No es tu turno en la Tienda.' };
    var player = s.byId(game, playerId);
    var item = D.ARTIFACTS[artifactId];
    if (!item) return { ok: false, error: 'Artefacto invalido.' };
    if (player.coins < item.price) return { ok: false, error: 'No tienes suficientes Monedas.' };
    if (player.artifacts.length >= D.MAX_ARTIFACTS) return { ok: false, error: 'Ya tienes 3 artefactos equipados.' };
    if (item.incompatibleClass && item.incompatibleClass === player.classId) {
      return { ok: false, error: player.classId + ' no puede equipar ' + item.name + '.' };
    }
    player.coins -= item.price;
    player.artifacts.push(artifactId);
    s.logMsg(game, player.name + ' compra el artefacto ' + item.name + ' por ' + item.price + ' Monedas.');
    return { ok: true };
  }

  function redeemBolsaDeOro(game, playerId) {
    var s = state();
    if (currentShopper(game) !== playerId) return { ok: false, error: 'No es tu turno en la Tienda.' };
    var player = s.byId(game, playerId);
    var idx = player.lootBag.indexOf('bolsa_oro');
    if (idx === -1) return { ok: false, error: 'No tienes una Bolsa de Oro.' };
    player.lootBag.splice(idx, 1);
    player.coins += 20;
    s.logMsg(game, player.name + ' canjea la Bolsa de Oro por 20 Monedas.');
    return { ok: true };
  }

  function doneShopping(game, playerId) {
    var s = state();
    if (currentShopper(game) !== playerId) return { ok: false, error: 'No es tu turno en la Tienda.' };
    var pend = game.pending;
    pend.index += 1;
    if (pend.index >= pend.queue.length) {
      var saved = pend.savedDrawContext;
      game.pending = null;
      s.logMsg(game, 'La Tienda de la Arena se cierra.');
      var drawPlayer = s.byId(game, saved.playerId);
      if (drawPlayer && drawPlayer.alive) {
        game.drawContext = saved;
        s.resumeDraw(game);
      } else {
        game.phase = 'action';
      }
    }
    return { ok: true };
  }

  global.VA_SHOP = {
    openQueueForAll: openQueueForAll,
    currentShopper: currentShopper,
    buyLoot: buyLoot,
    buyArtifact: buyArtifact,
    redeemBolsaDeOro: redeemBolsaDeOro,
    doneShopping: doneShopping
  };
})(window);
