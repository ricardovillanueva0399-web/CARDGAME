/* Orden de resolucion (Seccion 9): base -> materiales -> clase -> botin -> defensa -> reflejo -> vampirismo -> registro. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;

  /*
   * Nota de diseno: las Cartas de Material (Acero/Vidrio/Piedra/Cuarzo, Seccion 8)
   * no tienen ninguna regla de obtencion definida en el documento (no aparecen en
   * el catalogo de Tienda ni como recompensa de monstruo). Para no inventar una
   * mecanica que el diseno no especifica, esta v1 no las implementa; el paso 2
   * del orden de resolucion queda como no-op documentado, listo para extenderse
   * si se define de donde salen esas cartas.
   */

  function classModifierAttack(player, value) {
    if (player.classId === 'gladiador') return value + 3;
    if (player.classId === 'taumaturgo') return value - 4;
    return value;
  }

  function classModifierHeal(player, value) {
    if (player.classId === 'taumaturgo') return Math.floor(value * 1.5);
    return value;
  }

  function vampirismHeal(player, finalValueDealt) {
    if (player.classId !== 'sanguinario') return 0;
    var perDamage = player.artifacts.indexOf('anillo') !== -1 ? 4 : 5;
    var already = player.vampHealedThisTurn || 0;
    var potential = Math.floor(finalValueDealt / perDamage);
    var capped = Math.min(potential, Math.max(0, 8 - already));
    return capped;
  }

  /* Ataque de un jugador contra otro jugador. handResult viene de VA_HANDS.evaluateHand. */
  function resolveAttack(attacker, defender, handResult, opts) {
    opts = opts || {};
    var log = [];
    var value = handResult.baseValue;
    log.push(handResult.levelName + ' (' + value + ' de base).');

    value = classModifierAttack(attacker, value);
    if (attacker.classId === 'gladiador') log.push('Gladiador: +3 -> ' + value + '.');
    if (attacker.classId === 'taumaturgo') log.push('Taumaturgo: -4 -> ' + value + '.');

    if (opts.useDaga) {
      value += 15;
      log.push('Daga de Sacrificio: +15 -> ' + value + '. (' + attacker.name + ' pierde 4 HP)');
      attacker.hp = Math.max(0, attacker.hp - 4);
    }

    if (defender.artifacts.indexOf('nucleo') !== -1) {
      value = Math.max(1, value - 3);
      log.push('Nucleo de Acero del defensor: -3 -> ' + value + '.');
    }

    value = Math.max(1, value);

    var reflectTotal = 0;
    if (defender.classId === 'espejo') {
      var r1 = Math.min(8, Math.floor(value * 0.25));
      reflectTotal += r1;
      log.push('Pasiva Espejo: refleja ' + r1 + ' de vuelta al atacante.');
    }
    if (defender.espejoRotoActive) {
      var r2 = Math.floor(value * 0.5);
      reflectTotal += r2;
      defender.espejoRotoActive = false;
      log.push('Espejo Roto: refleja ' + r2 + ' de vuelta al atacante (se consume).');
    }

    var vampHeal = vampirismHeal(attacker, value);
    if (vampHeal > 0) {
      attacker.vampHealedThisTurn = (attacker.vampHealedThisTurn || 0) + vampHeal;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + vampHeal);
      log.push('Vampirismo (Sanguinario): ' + attacker.name + ' recupera ' + vampHeal + ' HP.');
    }

    defender.hp = Math.max(0, defender.hp - value);
    log.push(defender.name + ' recibe ' + value + ' de dano (HP: ' + defender.hp + '/' + defender.maxHp + ').');

    if (reflectTotal > 0) {
      attacker.hp = Math.max(0, attacker.hp - reflectTotal);
      log.push(attacker.name + ' recibe ' + reflectTotal + ' de dano reflejado (HP: ' + attacker.hp + '/' + attacker.maxHp + ').');
    }

    return { damage: value, reflect: reflectTotal, vampHeal: vampHeal, log: log };
  }

  /* Ataque de un jugador contra un monstruo (sin defensa/reflejo del lado del monstruo). */
  function resolveMonsterAttack(attacker, monster, handResult, opts) {
    opts = opts || {};
    var log = [];
    var value = handResult.baseValue;
    log.push(handResult.levelName + ' (' + value + ' de base) contra ' + monster.name + ' (' + monster.hp + ' HP).');

    value = classModifierAttack(attacker, value);
    if (opts.useDaga) {
      value += 15;
      log.push('Daga de Sacrificio: +15 -> ' + value + '. (' + attacker.name + ' pierde 4 HP)');
      attacker.hp = Math.max(0, attacker.hp - 4);
    }
    value = Math.max(1, value);

    var vampHeal = vampirismHeal(attacker, value);
    if (vampHeal > 0) {
      attacker.vampHealedThisTurn = (attacker.vampHealedThisTurn || 0) + vampHeal;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + vampHeal);
      log.push('Vampirismo (Sanguinario): ' + attacker.name + ' recupera ' + vampHeal + ' HP.');
    }

    var win = value >= monster.hp;
    log.push(win ? (monster.name + ' es derrotado.') : (monster.name + ' resiste (' + value + '/' + monster.hp + ').'));

    return { damage: value, win: win, log: log };
  }

  function resolveHeal(player, handResult) {
    var log = [];
    var value = handResult.baseValue;
    log.push(handResult.levelName + ' (' + value + ' de curacion base).');

    value = classModifierHeal(player, value);
    if (player.classId === 'taumaturgo') log.push('Taumaturgo: x1.5 -> ' + value + '.');

    var before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + value);
    log.push(player.name + ' se cura ' + (player.hp - before) + ' HP (HP: ' + player.hp + '/' + player.maxHp + ').');

    return { healed: player.hp - before, log: log };
  }

  global.VA_COMBAT = {
    resolveAttack: resolveAttack,
    resolveMonsterAttack: resolveMonsterAttack,
    resolveHeal: resolveHeal
  };
})(window);
