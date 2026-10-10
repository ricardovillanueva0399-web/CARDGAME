/* Evaluador de manos: jerarquia Carta Suelta -> Quinta (Seccion 2 y 3 del diseno). */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  var LEVELS = {};
  D.HAND_LEVELS.forEach(function (l) { LEVELS[l.id] = l; });

  var DOWNGRADE_FOR_HEAL = {
    quinta: 'full_house',
    poker: 'tercia',
    escalera: 'carta_suelta'
  };

  function matchingColor(declaredType) {
    return declaredType === 'attack' ? 'negra' : 'roja';
  }

  /*
   * cards: lista de cartas seleccionadas por el jugador (kind attack/heal, color, value).
   * declaredType: 'attack' | 'heal'.
   * allowMixedAt70: true solo para el Alquimista (puede usar el color contrario a 70%, floor).
   * Devuelve { valid, levelId, levelName, mainValue, usedCards, wastedCards } o { valid:false, reason }.
   */
  function evaluateHand(cards, declaredType, allowMixedAt70) {
    var wanted = matchingColor(declaredType);
    var effective = [];
    var wasted = [];

    cards.forEach(function (card) {
      if (card.color === wanted) {
        effective.push({ card: card, value: card.value });
      } else if (allowMixedAt70) {
        effective.push({ card: card, value: Math.floor(card.value * 0.7) });
      } else {
        wasted.push(card);
      }
    });

    if (effective.length === 0) {
      return { valid: false, reason: 'Ninguna carta seleccionada sirve para ' + (declaredType === 'attack' ? 'Ataque' : 'Curacion') + '.' };
    }

    var counts = {};
    effective.forEach(function (e) {
      counts[e.value] = (counts[e.value] || 0) + 1;
    });
    var distinctValues = Object.keys(counts).map(Number).sort(function (a, b) { return b - a; });

    var levelId, mainValue;

    var tripleCandidates = distinctValues.filter(function (v) { return counts[v] >= 3; });
    var pairCandidates = distinctValues.filter(function (v) { return counts[v] >= 2; });
    /* ">=": con cartas pasadas entre mazos (Mercado, Ladron, Cleptomano) o con el 70% del
       Alquimista puede haber 6 o mas del mismo valor; siguen siendo Quinta/Poker. */
    var quintaValues = distinctValues.filter(function (v) { return counts[v] >= 5; });
    var pokerValues = distinctValues.filter(function (v) { return counts[v] >= 4; });

    if (quintaValues.length) {
      levelId = 'quinta';
      mainValue = quintaValues[0];
    } else if (pokerValues.length) {
      levelId = 'poker';
      mainValue = pokerValues[0];
    } else if (tripleCandidates.length >= 1 && pairCandidates.length >= 2) {
      levelId = 'full_house';
      mainValue = Math.max.apply(null, tripleCandidates);
    } else if (tripleCandidates.length >= 1) {
      levelId = 'tercia';
      mainValue = Math.max.apply(null, tripleCandidates);
    } else if (pairCandidates.length >= 2) {
      levelId = 'doble_duo';
      mainValue = Math.max.apply(null, pairCandidates);
    } else if (pairCandidates.length === 1) {
      levelId = 'duo';
      mainValue = pairCandidates[0];
    } else {
      levelId = 'carta_suelta';
      mainValue = distinctValues[0];
    }

    /* Escalera (solo Ataque): 1-2-3-4-5 dentro de lo elegido, aunque sobren cartas. Se queda con
       la que valga mas entre la Escalera y la combinacion por repeticiones. */
    var hasEscalera = declaredType === 'attack' && [1, 2, 3, 4, 5].every(function (v) { return counts[v] >= 1; });
    if (hasEscalera) {
      var countLevel = LEVELS[levelId];
      var countValue = countLevel.fixed !== undefined ? countLevel.fixed : countLevel.floor + mainValue;
      if (LEVELS.escalera.fixed > countValue) {
        levelId = 'escalera';
        mainValue = null;
      }
    }

    if (declaredType === 'heal' && !LEVELS[levelId].healable) {
      var downgraded = DOWNGRADE_FOR_HEAL[levelId];
      if (downgraded === 'carta_suelta') {
        mainValue = distinctValues[0];
      }
      levelId = downgraded;
    }

    var level = LEVELS[levelId];
    var baseValue = level.fixed !== undefined ? level.fixed : level.floor + mainValue;

    return {
      valid: true,
      levelId: levelId,
      levelName: level.name,
      rank: level.rank,
      mainValue: mainValue,
      baseValue: baseValue,
      usedCards: effective.map(function (e) { return e.card; }),
      wastedCards: wasted
    };
  }

  global.VA_HANDS = {
    evaluateHand: evaluateHand,
    LEVELS: LEVELS
  };
})(window);
