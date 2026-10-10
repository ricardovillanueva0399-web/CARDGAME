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
  function WANDERERS() { return global.VA_WANDERERS; }

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
      if (p.type === 'wanderer') return s.byId(game, p.playerId);
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
    /* Sin cartas negras se cura aunque tenga la vida llena: si pasara, una mano de parejas
       rojas (que no se pueden descartar por Monedas) se quedaria igual para siempre. */
    if (bestRed.length >= 1) {
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

  /* Contra un monstruo solo importa el dano: prueba todas las combinaciones de la mano (lo
     normal 5 cartas, 31 combinaciones) y se queda con la de mas dano; a igual dano, la de
     menos cartas. */
  function strongestAttack(actor, cards) {
    var best = [];
    var bestValue = 0;
    var isAlq = actor.classId === 'alquimista';
    /* Fuerza bruta sobre 2^n subconjuntos: con manos grandes (cartas recibidas por Mercado,
       Ladron o Cleptomano) se limita a las 10 cartas de mayor valor para no trabar la pagina. */
    if (cards.length > 10) {
      cards = cards.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    }
    for (var mask = 1; mask < (1 << cards.length); mask += 1) {
      var sel = cards.filter(function (c, i) { return mask & (1 << i); });
      if (!HANDS().evaluateHand(sel, 'attack', isAlq).valid) continue;
      /* El motor nunca hace menos de 1 de dano (p. ej. Taumaturgo con -4 a una carta baja). */
      var value = Math.max(1, estimateAttackValue(null, actor, sel));
      if (value > bestValue || (value === bestValue && sel.length < best.length)) {
        best = sel;
        bestValue = value;
      }
    }
    return best;
  }

  function decideMonster(game, actor, pend) {
    /* Nota: bestGroup agrupa por valor numerico crudo. Para el Alquimista eso podria
       juntar, p. ej., un 3 negro con un 3 rojo pensando que forman pareja, cuando en
       realidad el rojo vale menos (70%) al evaluar la mano. Para evitar sugerirle una
       jugada peor de lo que parece, la IA del Alquimista tambien se limita a cartas
       negras aqui, igual que el resto de clases (juega algo mas conservador de lo que
       su pasiva permitiria, pero de forma correcta). */
    var pool = actor.hand.filter(function (c) { return c.color === 'negra'; });
    var group = strongestAttack(actor, pool);
    /* Combate obligatorio sin ninguna carta negra: solo puede pasarle al Alquimista (al resto
       el motor ya le da la derrota automatica). Con un grupo vacio el motor rechaza el combate
       y la IA lo reintentaria sin fin, congelando la partida; usa sus rojas al 70%. */
    if (group.length === 0 && !pend.canFlee) group = strongestAttack(actor, actor.hand);
    var estimate = estimateAttackValue(game, actor, group);

    /* Si el dano se acumula, pelear nunca es peor que huir: la penalizacion es la misma y las
       cartas usadas se reponen al seguir robando. */
    var woundsStay = D.durationOf(game.durationId).monsterWounds;
    var shouldFight = group.length > 0 && (!pend.canFlee || estimate >= pend.hp || woundsStay);
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

  /* Solo artefactos (pasivos que funcionan solos): la IA no activa Botin, asi que comprarlo
     seria tirar las monedas. Compra el mas caro que pueda pagar y que de verdad le sirva. */
  function decideShop(game, actor) {
    var shop = SHOP();
    var useful = Object.keys(D.ARTIFACTS).filter(function (id) {
      if (id === 'calculadora') return false; /* solo informativa */
      if (id === 'anillo' && actor.classId !== 'sanguinario') return false;
      if (D.ARTIFACTS[id].incompatibleClass === actor.classId) return false;
      return actor.artifacts.indexOf(id) === -1;
    }).sort(function (a, b) { return D.ARTIFACTS[b].price - D.ARTIFACTS[a].price; });
    for (var i = 0; i < useful.length; i += 1) {
      if (actor.coins >= D.ARTIFACTS[useful[i]].price && shop.buyArtifact(game, actor.id, useful[i]).ok) break;
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

  /* Gusano Suplicante: lo alimenta siempre que pueda, con la comida mas barata (prefiere
     cartas sueltas para no romper sus parejas). Si no le alcanza, se niega. */
  /* Lo alimenta con la comida mas barata si eso le da algo (vida o vida maxima) o si negarse
     le costaria monedas; si no gana nada y no tiene monedas, la mordida es el mal menor. */
  function decideWanderer(game, actor) {
    var w = WANDERERS();
    var meal = w.cheapestMeal(actor);
    var gains = actor.hp < actor.maxHp || w.bonusLeft(game, actor) > 0;
    if (meal && (gains || actor.coins > 0)) w.feed(game, actor.id, ids(meal));
    else w.refuse(game, actor.id);
  }

  function performAction(game, actor) {
    if (game.pending) {
      var p = game.pending;
      if (p.type === 'monster') return decideMonster(game, actor, p);
      if (p.type === 'shop') return decideShop(game, actor);
      if (p.type === 'mercado_negro') return decideMercado(game, actor);
      if (p.type === 'azazel_choice') return decideAzazel(game, actor);
      if (p.type === 'wanderer') return decideWanderer(game, actor);
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

    /* Un poco mas de pausa ante el gusano, para que se le vea salir de la tierra. */
    var delay = game.pending && game.pending.type === 'wanderer' ? 2000 : 900;
    game._aiTickScheduled = true;
    global.setTimeout(function () {
      game._aiTickScheduled = false;
      performAction(game, actor);
      rerender();
    }, delay);
  }

  global.VA_AI = { tick: tick };
})(window);
