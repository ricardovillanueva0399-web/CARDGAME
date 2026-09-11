/* Monstruos de Emboscada (Seccion 7). */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  function state() { return global.VA_STATE; }
  function combat() { return global.VA_COMBAT; }
  function hands() { return global.VA_HANDS; }
  function shop() { return global.VA_SHOP; }

  var LOOT_POOL = Object.keys(D.LOOT);
  var ARTIFACT_POOL = Object.keys(D.ARTIFACTS);

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* Hay al menos una carta con la que se podria intentar un ataque (Carta Suelta incluida). */
  function hasAnyAttackableCard(player) {
    if (player.classId === 'alquimista') return player.hand.length > 0;
    return player.hand.some(function (c) { return c.color === 'negra'; });
  }

  function startEncounter(game, player, monsterCard, canFlee) {
    var s = state();
    var base = D.MONSTERS[monsterCard.monsterId];
    var hp = base.hp + (game.flags.cofreMimetico ? 5 : 0);

    /*
     * Caso limite: un encuentro obligatorio (Llamada de la Caceria, canFlee=false) puede
     * ocurrir a mitad del robo de turno, con una mano que aun no tiene ninguna carta util
     * para atacar (vacia, o solo cartas rojas si no es Alquimista). Sin una jugada valida
     * y sin poder huir, el juego quedaria bloqueado sin salida. Se resuelve como derrota
     * automatica.
     */
    if (!canFlee && !hasAnyAttackableCard(player)) {
      s.logMsg(game, player.name + ' se encuentra con ' + base.name + ' (' + hp + ' HP) sin ninguna carta util para atacar: pierde el combate por defecto.');
      applyLosePenalty(game, player, base.id);
      reinsertMonster(game, player, base.id);
      /*
       * OJO: startEncounter() siempre se ejecuta sincronamente dentro de un drawLoop() en
       * curso (este caso, via el Suceso Llamada de la Caceria). NO llamar aqui a
       * resumeDraw(): eso reentraria en drawLoop() mientras el drawLoop() original sigue
       * en su propio while, corrompiendo game.drawContext. Si el jugador sigue vivo, basta
       * con retornar: el drawLoop() que nos llamo continuara su bucle normalmente. Si murio,
       * endTurnIfPlayerDied ya marco game._turnEnded para que ese drawLoop() externo se
       * detenga al recuperar el control.
       */
      s.endTurnIfPlayerDiedNested(game, player);
      return;
    }

    game.pending = {
      type: 'monster',
      playerId: player.id,
      monsterId: base.id,
      monsterName: base.name,
      hp: hp,
      minLabel: base.minLabel,
      canFlee: canFlee,
      cofreBoosted: game.flags.cofreMimetico
    };
    s.logMsg(game, player.name + ' se encuentra con ' + base.name + ' (' + hp + ' HP)' + (canFlee ? '.' : ' y debe combatir obligatoriamente.'));
  }

  function forceEncounter(game, player) {
    var s = state();
    var idx = player.deck.drawPile.findIndex(function (c) { return c.kind === 'monster'; });
    if (idx === -1) {
      player.deck.drawPile = player.deck.drawPile.concat(
        player.deck.discardPile.filter(function (c) { return c.kind === 'monster'; })
      );
      player.deck.discardPile = player.deck.discardPile.filter(function (c) { return c.kind !== 'monster'; });
      idx = player.deck.drawPile.findIndex(function (c) { return c.kind === 'monster'; });
    }
    if (idx === -1) {
      s.logMsg(game, 'Llamada de la Caceria: ' + player.name + ' no tiene ningun monstruo disponible en su mazo.');
      return;
    }
    var monsterCard = player.deck.drawPile.splice(idx, 1)[0];
    startEncounter(game, player, monsterCard, false);
  }

  function applyLosePenalty(game, player, monsterId) {
    var s = state();
    var base = D.MONSTERS[monsterId];
    player.hp = Math.max(0, player.hp - base.fleeHpLoss);
    s.logMsg(game, player.name + ' sufre la penalizacion de ' + base.name + ': -' + base.fleeHpLoss + ' HP.');
    if (base.fleeStealsCard) {
      var rivals = s.otherAlivePlayers(game, player.id);
      if (rivals.length > 0 && player.hand.length > 0) {
        var rival = pickRandom(rivals);
        var cardIdx = Math.floor(Math.random() * player.hand.length);
        var stolen = player.hand.splice(cardIdx, 1)[0];
        rival.hand.push(stolen);
        s.logMsg(game, base.name + ': ' + rival.name + ' roba una carta de ' + player.name + '.');
      }
    }
    s.killOrRevive(game, player);
  }

  function reinsertMonster(game, player, monsterId) {
    var card = { id: global.VA_DECK.nextId(), kind: 'monster', monsterId: monsterId, name: D.MONSTERS[monsterId].name };
    global.VA_DECK.insertMonsterCard(player.deck, card);
  }

  function grantReward(game, player, monsterId, doubled) {
    var s = state();
    var base = D.MONSTERS[monsterId];
    if (base.rewardType === 'loot2') {
      var n = doubled ? 4 : 2;
      var got = [];
      for (var i = 0; i < n; i += 1) {
        var lootId = pickRandom(LOOT_POOL);
        player.lootBag.push(lootId);
        got.push(D.LOOT[lootId].name);
      }
      s.logMsg(game, player.name + ' obtiene botin: ' + got.join(', ') + '.');
    } else if (base.rewardType === 'artifact') {
      var m = doubled ? 2 : 1;
      for (var j = 0; j < m; j += 1) {
        grantOneArtifact(game, player);
      }
    } else if (base.rewardType === 'maxhp') {
      game.pending = { type: 'azazel_choice', playerId: player.id, doubled: doubled };
      return;
    }
    afterMonsterResolved(game, player, true);
  }

  function grantOneArtifact(game, player) {
    var s = state();
    var candidates = ARTIFACT_POOL.filter(function (a) {
      return !(a === 'nucleo' && player.classId === 'espejo');
    });
    var pick = pickRandom(candidates);
    if (player.artifacts.length >= D.MAX_ARTIFACTS) {
      player.coins += D.ARTIFACTS[pick].price;
      s.logMsg(game, player.name + ' ya tiene 3 artefactos; recibe ' + D.ARTIFACTS[pick].price + ' Monedas en su lugar.');
    } else {
      player.artifacts.push(pick);
      s.logMsg(game, player.name + ' obtiene el artefacto ' + D.ARTIFACTS[pick].name + '.');
    }
  }

  function resolveAzazelChoice(game, playerId, choice) {
    var s = state();
    if (!game.pending || game.pending.type !== 'azazel_choice' || game.pending.playerId !== playerId) {
      return { ok: false, error: 'No hay una eleccion de AZAZEL pendiente.' };
    }
    var player = s.byId(game, playerId);
    var doubled = game.pending.doubled;
    if (choice === 'maxhp') {
      var bonus = doubled ? 30 : 15;
      player.maxHp += bonus;
      player.hp += bonus;
      s.logMsg(game, player.name + ' obtiene +' + bonus + ' HP maximo permanente.');
    } else {
      var count = doubled ? 6 : 3;
      s.logMsg(game, player.name + ' elige Cartas Raras (interpretadas como botin/artefactos al azar, no definidas en el diseno original).');
      for (var i = 0; i < count; i += 1) {
        if (Math.random() < 0.5) {
          grantOneArtifact(game, player);
        } else {
          var lootId = pickRandom(LOOT_POOL);
          player.lootBag.push(lootId);
          s.logMsg(game, player.name + ' obtiene botin: ' + D.LOOT[lootId].name + '.');
        }
      }
    }
    afterMonsterResolved(game, player, true);
    return { ok: true };
  }

  function afterMonsterResolved(game, player, wasWin) {
    var s = state();
    if (wasWin) {
      if (game.flags.cofreMimetico) {
        game.flags.cofreMimetico = false;
        s.logMsg(game, 'Cofre Mimetico se consume tras la recompensa doble.');
      }
      shop().openQueueForAll(game, player.id);
    } else {
      game.pending = null;
      s.resumeDraw(game);
    }
  }

  function decide(game, playerId, choice, selectedCardIds, useDaga) {
    var s = state();
    if (!game.pending || game.pending.type !== 'monster' || game.pending.playerId !== playerId) {
      return { ok: false, error: 'No hay un encuentro pendiente para este jugador.' };
    }
    var pend = game.pending;
    var player = s.byId(game, playerId);
    var monsterId = pend.monsterId;
    var monsterHp = pend.hp;

    if (choice === 'flee') {
      if (!pend.canFlee) return { ok: false, error: 'No puedes huir de este combate.' };
      game.pending = null;
      applyLosePenalty(game, player, monsterId);
      reinsertMonster(game, player, monsterId);
      if (s.endTurnIfPlayerDied(game, player)) return { ok: true };
      s.resumeDraw(game);
      return { ok: true };
    }

    if (choice === 'fight') {
      var selected = (selectedCardIds || []).map(function (cid) {
        return player.hand.filter(function (c) { return c.id === cid; })[0];
      }).filter(Boolean);
      if (selected.length === 0) return { ok: false, error: 'Selecciona al menos una carta para atacar.' };

      var isAlquimista = player.classId === 'alquimista';
      var result = hands().evaluateHand(selected, 'attack', isAlquimista);
      if (!result.valid) return { ok: false, error: result.reason };

      if (useDaga && (!s.hasUsableLoot(game, player, 'daga') || player.hp <= 4)) {
        return { ok: false, error: 'No puedes usar la Daga de Sacrificio ahora.' };
      }

      var fakeMonster = { name: pend.monsterName, hp: monsterHp };
      var out = combat().resolveMonsterAttack(player, fakeMonster, result, { useDaga: !!useDaga });
      if (useDaga) s.consumeLoot(player, 'daga');
      out.log.forEach(function (l) { s.logMsg(game, l); });

      selected.concat(result.wastedCards).forEach(function (c) {
        player.hand = player.hand.filter(function (h) { return h.id !== c.id; });
        player.deck.discardPile.push(c);
      });

      game.pending = null;
      s.killOrRevive(game, player);
      if (s.endTurnIfPlayerDied(game, player)) return { ok: true };

      if (out.win) {
        grantReward(game, player, monsterId, pend.cofreBoosted);
      } else {
        applyLosePenalty(game, player, monsterId);
        reinsertMonster(game, player, monsterId);
        if (s.endTurnIfPlayerDied(game, player)) return { ok: true };
        s.resumeDraw(game);
      }
      return { ok: true };
    }

    return { ok: false, error: 'Eleccion invalida.' };
  }

  global.VA_MONSTERS = {
    startEncounter: startEncounter,
    forceEncounter: forceEncounter,
    decide: decide,
    resolveAzazelChoice: resolveAzazelChoice,
    afterMonsterResolved: afterMonsterResolved
  };
})(window);
