/* Texto de pistas del Modo Tutorial. Funciones puras: reciben el estado real (mano,
   fase, seleccion actual en la interfaz) y devuelven que decirle al jugador humano
   ahora mismo. No usan un guion fijo porque el mazo es aleatorio en cada partida. */
(function (global) {
  'use strict';

  function actionHint(hasHandCards, ui) {
    if (!hasHandCards) return 'No tienes cartas en mano. Pulsa "Pasar sin jugar" para seguir.';
    if (!ui.declaredType) {
      return 'Elige algunas cartas de tu mano (busca dos o mas del mismo valor: forman un Duo, Tercia, etc.) y pulsa "Declarar Ataque" o "Declarar Curacion" segun el color que hayas elegido.';
    }
    if (ui.selectedCount === 0) {
      return 'Selecciona al menos una carta ' + (ui.declaredType === 'attack' ? 'negra' : 'roja') + ' de tu mano para formar la jugada.';
    }
    if (ui.declaredType === 'attack' && !ui.hasTarget) {
      return 'Ahora elige a que rival vas a atacar.';
    }
    return 'Listo. Pulsa "Confirmar jugada".';
  }

  function endOfTurnHint(hasLooseCards) {
    if (hasLooseCards) {
      return 'Puedes tocar tus cartas sueltas para convertirlas en Monedas de Arena, o pulsar "Terminar turno" para seguir sin hacerlo.';
    }
    return 'No te quedan cartas sueltas para convertir en Monedas. Pulsa "Terminar turno".';
  }

  function monsterHint(pend, fightMode, selectedCount) {
    if (!fightMode) {
      var flee = pend.canFlee
        ? '"Huir" te da una penalizacion fija pero segura.'
        : 'Esta vez el efecto que lo desencadeno no te deja huir: tendras que combatir.';
      return '¡Un monstruo (' + pend.hp + ' HP)! "Combatir" arriesga la mano que tengas ahora contra el; ' + flee;
    }
    if (selectedCount === 0) return 'Selecciona tus mejores cartas de Ataque (negras) de la mano para combatir.';
    return 'Pulsa "Confirmar ataque" para atacar al monstruo con esas cartas.';
  }

  function shopHint() {
    return 'Puedes comprar Botin (un solo uso) o Artefactos (permanentes, maximo 3) con tus Monedas de Arena. Cuando termines, pulsa "termina de comprar".';
  }

  function mercadoHint() {
    return 'Elige una carta de tu mano: se la vas a pasar a tu vecino de la izquierda.';
  }

  function azazelHint() {
    return 'Elige tu recompensa: HP maximo permanente para siempre, o cartas de botin/artefactos al azar.';
  }

  global.VA_COACH = {
    actionHint: actionHint,
    endOfTurnHint: endOfTurnHint,
    monsterHint: monsterHint,
    shopHint: shopHint,
    mercadoHint: mercadoHint,
    azazelHint: azazelHint
  };
})(window);
