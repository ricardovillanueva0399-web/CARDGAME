/* Construccion y manejo del mazo personal de cada jugador. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  var uid = 0;
  function nextId() { uid += 1; return 'c' + uid; }

  var ATTACK_SUITS = ['picas', 'treboles'];
  var HEAL_SUITS = ['corazones', 'diamantes'];

  function buildBaseCards() {
    var cards = [];
    var v, i;
    for (v = 1; v <= 5; v += 1) {
      for (i = 0; i < 5; i += 1) {
        cards.push({ id: nextId(), kind: 'attack', color: 'negra', suit: ATTACK_SUITS[i % 2], value: v });
      }
    }
    for (v = 1; v <= 5; v += 1) {
      for (i = 0; i < 5; i += 1) {
        cards.push({ id: nextId(), kind: 'heal', color: 'roja', suit: HEAL_SUITS[i % 2], value: v });
      }
    }
    Object.keys(D.EVENTS).forEach(function (key) {
      cards.push({ id: nextId(), kind: 'event', eventId: key, name: D.EVENTS[key].name });
    });
    return cards;
  }

  /*
   * Nota de diseno: el documento fuente dice "56 cartas por jugador" (25 ataque +
   * 25 curacion + 6 suceso) pero tambien dice que "los 3 monstruos se mezclan en
   * el mazo al inicio de la partida" y que al huir el monstruo se puede reinsertar
   * "en cualquier posicion del mazo (incluyendo el de un rival)". Ambas frases solo
   * tienen sentido juntas si los 3 monstruos son cartas fisicas adicionales dentro
   * del mazo personal de cada jugador (59 cartas reales), y "56" se usa como el
   * tamano del "mazo de juego" base sin contar el subsistema de monstruos (ver
   * tabla de componentes, que los lista aparte). Implementamos esa lectura.
   */
  function buildMonsterCards() {
    return Object.keys(D.MONSTERS).map(function (key) {
      return { id: nextId(), kind: 'monster', monsterId: key, name: D.MONSTERS[key].name };
    });
  }

  function shuffle(arr) {
    var i, j, tmp;
    for (i = arr.length - 1; i > 0; i -= 1) {
      j = Math.floor(Math.random() * (i + 1));
      tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function buildPlayerDeck() {
    var cards = buildBaseCards().concat(buildMonsterCards());
    shuffle(cards);
    return { drawPile: cards, discardPile: [] };
  }

  function drawOne(playerDeck) {
    if (playerDeck.drawPile.length === 0) {
      if (playerDeck.discardPile.length === 0) return null;
      playerDeck.drawPile = shuffle(playerDeck.discardPile);
      playerDeck.discardPile = [];
    }
    return playerDeck.drawPile.pop();
  }

  function insertMonsterCard(playerDeck, monsterCard) {
    var pos = Math.floor(Math.random() * (playerDeck.drawPile.length + 1));
    playerDeck.drawPile.splice(pos, 0, monsterCard);
  }

  global.VA_DECK = {
    buildPlayerDeck: buildPlayerDeck,
    drawOne: drawOne,
    insertMonsterCard: insertMonsterCard,
    shuffle: shuffle,
    nextId: nextId
  };
})(window);
