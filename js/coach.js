/* Texto de pistas del Modo Tutorial. Funciones puras: reciben el estado real (mano,
   fase, seleccion actual en la interfaz) y devuelven que decirle al jugador humano
   ahora mismo. No usan un guion fijo porque el mazo es aleatorio en cada partida. */
(function (global) {
  'use strict';

  function actionHint(hasHandCards, ui) {
    if (!hasHandCards) return 'No tienes cartas en mano. Pulsa "Pasar sin jugar" para seguir.';
    if (ui.selectedCount === 0) {
      return 'Toca una o mas cartas (el numero morado sobre una carta te dice cuantas tienes de ese mismo valor). En cuanto elijas alguna, aqui abajo aparecera en vivo que jugada formarian como Ataque y como Curacion.';
    }
    if (!ui.declaredType) {
      return 'Mira el recuadro de arriba: te muestra que mano formarian tus cartas elegidas en Ataque y en Curacion. Pulsa el boton que corresponda a la que te convenga.';
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

  function monsterHint(pend, fightMode, selectedCount, canFight, woundsStay) {
    if (!fightMode) {
      if (canFight === false) {
        return 'No tienes ninguna carta de ataque (negra) en la mano, asi que no puedes combatir: solo queda "Huir".';
      }
      var flee = pend.canFlee
        ? '"Huir" te da una penalizacion fija pero segura.'
        : 'Esta vez el efecto que lo desencadeno no te deja huir: tendras que combatir.';
      if (woundsStay && pend.canFlee) {
        flee = 'Si no lo matas, la penalizacion es la misma que huir, pero el dano que le hagas se queda para la proxima vez: casi siempre conviene combatir.';
      }
      return '¡Un monstruo (' + pend.hp + ' HP)! "Combatir" usa las cartas de tu mano contra el. ' + flee;
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
