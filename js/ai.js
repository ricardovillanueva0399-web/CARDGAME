/* IA basica para el Modo Tutorial: juega turnos completos de forma razonable, sin
   buscar la jugada optima, para servir de rival de practica. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  function S() { return global.VA_STATE; }
  function HANDS() { return global.VA_HANDS; }
  function MONSTERS() { return global.VA_MONSTERS; }
  function SHOP() { return global.VA_SHOP; }
  function EVENTS() { return global.VA_EVENTS; }

  /* El grupo de cartas del mismo valor mas grande (Duo/Tercia/Poker/Quinta); si no hay
     ninguna pareja, la carta suelta de mayor valor. Heuristica simple, no busca Full
     House ni Doble Duo combinando dos valores distintos. */
  function bestGroup(cards) {
    if (cards.length === 0) return [];
    var byValue = {};
    cards.forEach(function (c) {
      (byValue[c.value] = byValue[c.value] || []).push(c);
    });
    var groups = Object.keys(byValue).map(function (v) { return byValue[v]; });
    groups.sort(function (a, b) {
      if (b.length !== a.length) return b.length - a.length;
      return b[0].value - a[0].value;
    });
    return groups[0];
  }

  function ids(cards) { return cards.map(function (c) { return c.id; }); }

  function resolveActor(game) {
    var s = S();
    if (game.pending) {
      var p = game.pending;
      if (p.type === 'monster') return s.byId(game, p.playerId);
      if (p.type === 'shop') return s.byId(game, SHOP().currentShopper(game));
      if (p.type === 'mercado_negro') return s.byId(game, p.order[p.cursor]);
      if (p.type === 'azazel_choice') return s.byId(game, p.playerId);
      return null;
    }
    if (game.phase === 'action' || game.phase === 'end_of_turn') return s.currentPlayer(game);
    return null;
  }

  function decideAction(game, actor) {
    var s = S();
    var black = actor.hand.filter(function (c) { return c.color === 'negra'; });
    var red = actor.hand.filter(function (c) { return c.color === 'roja'; });
    var bestBlack = bestGroup(black);
    var bestRed = bestGroup(red);

    var wantsToHeal = actor.hp <= actor.maxHp * 0.6 && bestRed.length >= 2;
    if (wantsToHeal) {
      s.playHand(game, actor.id, ids(bestRed), 'heal', null, false);
      return;
    }
    if (bestBlack.length >= 1) {
      var rivals = s.otherAlivePlayers(game, actor.id);
      if (rivals.length === 0) { s.passAction(game, actor.id); return; }
      var target = rivals.reduce(function (a, b) { return a.hp <= b.hp ? a : b; });
      s.playHand(game, actor.id, ids(bestBlack), 'attack', target.id, false);
      return;
    }
    if (bestRed.length >= 1 && actor.hp < actor.maxHp) {
      s.playHand(game, actor.id, ids(bestRed), 'heal', null, false);
      return;
    }
    s.passAction(game, actor.id);
  }

  function decideEndOfTurn(game, actor) {
    var s = S();
    var loose = actor.hand.filter(function (c) { return s.isCardLoose(actor.hand, c); });
    loose.forEach(function (c) { s.discardForCoins(game, actor.id, c.id); });
    s.finishEndOfTurn(game, actor.id);
  }

  function estimateAttackValue(game, actor, group) {
    if (group.length === 0) return 0;
    var isAlq = actor.classId === 'alquimista';
    var result = HANDS().evaluateHand(group, 'attack', isAlq);
    if (!result.valid) return 0;
    var value = result.baseValue;
    if (actor.classId === 'gladiador') value += 3;
    if (actor.classId === 'taumaturgo') value -= 4;
    return value;
  }

  function decideMonster(game, actor, pend) {
    /* Nota: bestGroup agrupa por valor numerico crudo. Para el Alquimista eso podria
       juntar, p. ej., un 3 negro con un 3 rojo pensando que forman pareja, cuando en
       realidad el rojo vale menos (70%) al evaluar la mano. Para evitar sugerirle una
       jugada peor de lo que parece, la IA del Alquimista tambien se limita a cartas
       negras aqui, igual que el resto de clases (juega algo mas conservador de lo que
       su pasiva permitiria, pero de forma correcta). */
    var pool = actor.hand.filter(function (c) { return c.color === 'negra'; });
    var group = bestGroup(pool);
    var estimate = estimateAttackValue(game, actor, group);

    var shouldFight = group.length > 0 && (!pend.canFlee || estimate >= pend.hp);
    if (shouldFight) {
      MONSTERS().decide(game, actor.id, 'fight', ids(group), false);
    } else if (pend.canFlee) {
      MONSTERS().decide(game, actor.id, 'flee', [], false);
    } else {
      /* Forzado y sin ninguna carta util: el motor ya resuelve este caso como derrota
         automatica al crear el encuentro, asi que no deberia llegar pending aqui. Como
         red de seguridad, se intenta igualmente con lo que haya (o nada). */
      MONSTERS().decide(game, actor.id, 'fight', ids(group), false);
    }
  }

  function decideShop(game, actor) {
    var shop = SHOP();
    var lootIds = Object.keys(D.LOOT).filter(function (id) { return D.LOOT[id].price !== null; });
    lootIds.sort(function (a, b) { return D.LOOT[a].price - D.LOOT[b].price; });
    var bought = false;
    for (var i = 0; i < lootIds.length && !bought; i += 1) {
      if (actor.coins >= D.LOOT[lootIds[i]].price) {
        bought = shop.buyLoot(game, actor.id, lootIds[i]).ok;
      }
    }
    if (!bought) {
      var artIds = Object.keys(D.ARTIFACTS).sort(function (a, b) { return D.ARTIFACTS[a].price - D.ARTIFACTS[b].price; });
      for (var j = 0; j < artIds.length && !bought; j += 1) {
        if (actor.coins >= D.ARTIFACTS[artIds[j]].price) {
          bought = shop.buyArtifact(game, actor.id, artIds[j]).ok;
        }
      }
    }
    shop.doneShopping(game, actor.id);
  }

  function decideMercado(game, actor) {
    var events = EVENTS();
    if (actor.hand.length === 0) { events.skipMercadoPlayer(game, actor.id); return; }
    var lowest = actor.hand.reduce(function (a, b) { return a.value <= b.value ? a : b; });
    events.pickMercadoCard(game, actor.id, lowest.id);
  }

  function decideAzazel(game, actor) {
    MONSTERS().resolveAzazelChoice(game, actor.id, 'maxhp');
  }

  function performAction(game, actor) {
    if (game.pending) {
      var p = game.pending;
      if (p.type === 'monster') return decideMonster(game, actor, p);
      if (p.type === 'shop') return decideShop(game, actor);
      if (p.type === 'mercado_negro') return decideMercado(game, actor);
      if (p.type === 'azazel_choice') return decideAzazel(game, actor);
      return;
    }
    if (game.phase === 'action') return decideAction(game, actor);
    if (game.phase === 'end_of_turn') return decideEndOfTurn(game, actor);
  }

  /*
   * Se llama tras cada render en modo tutorial. Si es el turno (o la decision pendiente)
   * de un jugador IA, programa su jugada con un pequeno retraso para que se vea jugar, y
   * vuelve a renderizar al terminar. Tambien salta automaticamente la pantalla de "pasa
   * el dispositivo": con un solo humano en pantalla no tiene sentido pedirle que confirme
   * cada turno.
   */
  function tick(game, rerender) {
    if (!game || game.gameOver || !game.isTutorial) return;
    if (game._aiTickScheduled) return;

    if (game.phase === 'pass_device') {
      game._aiTickScheduled = true;
      global.setTimeout(function () {
        game._aiTickScheduled = false;
        S().confirmPassDevice(game);
        rerender();
      }, 700);
      return;
    }

    var actor = resolveActor(game);
    if (!actor || !actor.isAI) return;

    game._aiTickScheduled = true;
    global.setTimeout(function () {
      game._aiTickScheduled = false;
      performAction(game, actor);
      rerender();
    }, 900);
  }

  global.VA_AI = { tick: tick };
})(window);
