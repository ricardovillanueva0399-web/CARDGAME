/* THE VOLATILE ARENA - datos estaticos del Marco de Diseno v3.3 */
/* global window */
(function (global) {
  'use strict';

  var CLASSES = {
    gladiador: {
      id: 'gladiador',
      name: 'Gladiador',
      icon: '⚔️',
      maxHp: 25,
      summary: '+3 de dano en todos sus ataques.',
      drawback: 'HP base baja (25).'
    },
    espejo: {
      id: 'espejo',
      name: 'Espejo',
      icon: '🪞',
      maxHp: 40,
      summary: 'Refleja el 25% del dano recibido (max 8) al atacante.',
      drawback: 'No puede equipar artefactos tipo Escudo. El reflejo no aplica a monstruos.'
    },
    cleptomano: {
      id: 'cleptomano',
      name: 'Cleptomano',
      icon: '🥷',
      maxHp: 40,
      summary: 'Roba 1 carta al azar de la mano de un rival al inicio de su turno.',
      drawback: 'Los monstruos tienen +4 HP contra el.'
    },
    taumaturgo: {
      id: 'taumaturgo',
      name: 'Taumaturgo',
      icon: '✨',
      maxHp: 40,
      summary: 'Curaciones x1.5 (redondeado hacia abajo).',
      drawback: 'Sus ataques hacen -4 de dano (minimo 1).'
    },
    alquimista: {
      id: 'alquimista',
      name: 'Alquimista',
      icon: '⚗️',
      maxHp: 40,
      summary: 'Puede usar cartas negras para curar y rojas para atacar, al 70% del valor (floor).',
      drawback: 'El 30% de penalizacion es fijo e irreducible.'
    },
    sanguinario: {
      id: 'sanguinario',
      name: 'Sanguinario',
      icon: '🩸',
      maxHp: 40,
      summary: 'Recupera 1 HP por cada 5 de dano infligido (max 8 HP/turno).',
      drawback: 'Pierde 1 HP al inicio de cada turno.'
    }
  };

  /* Nivel de mano: floor de poder/curacion y si existe para curacion */
  var HAND_LEVELS = [
    { id: 'carta_suelta', name: 'Carta Suelta', rank: 0, floor: 0, healable: true, size: 1 },
    { id: 'duo', name: 'Duo (Pareja)', rank: 1, floor: 5, healable: true, size: 2 },
    { id: 'doble_duo', name: 'Doble Duo', rank: 2, floor: 10, healable: true, size: 4 },
    { id: 'tercia', name: 'Tercia', rank: 3, floor: 15, healable: true, size: 3 },
    { id: 'escalera', name: 'Escalera', rank: 4, floor: 21, healable: false, size: 5, fixed: 21 },
    { id: 'full_house', name: 'Full House', rank: 5, floor: 22, healable: true, size: 5 },
    { id: 'poker', name: 'Poker (4 iguales)', rank: 6, floor: 28, healable: false, size: 4 },
    { id: 'quinta', name: 'Quinta (5 iguales)', rank: 7, floor: 35, healable: false, size: 5 }
  ];

  var MONSTERS = {
    ladron: {
      id: 'ladron',
      name: 'Ladron de Sombras',
      icon: '🗡️',
      hp: 12,
      minRank: 3, /* Tercia+ */
      minLabel: 'Tercia+ (16+)',
      fleeHpLoss: 5,
      fleeStealsCard: true,
      rewardDesc: '2 cartas de Botin al azar',
      rewardType: 'loot2'
    },
    sombra: {
      id: 'sombra',
      name: 'Sombra del Vacio',
      icon: '👻',
      hp: 30,
      minRank: 6, /* Poker+ */
      minLabel: 'Poker+ (29+)',
      fleeHpLoss: 15,
      rewardDesc: '1 Artefacto Elite',
      rewardType: 'artifact'
    },
    azazel: {
      id: 'azazel',
      name: 'AZAZEL (Jefe)',
      icon: '😈',
      hp: 45,
      minRank: 7, /* Quinta */
      minLabel: 'Quinta (36+)',
      fleeHpLoss: 28,
      rewardDesc: '+15 HP maximo permanente',
      rewardType: 'maxhp'
    }
  };

  var EVENTS = {
    vortice: {
      id: 'vortice',
      name: 'Vortice Temporal',
      desc: 'El orden de turnos se invierte.'
    },
    caceria: {
      id: 'caceria',
      name: 'Llamada de la Caceria',
      desc: 'El jugador activo debe combatir inmediatamente el proximo monstruo de su mazo. No puede huir.'
    },
    impuesto: {
      id: 'impuesto',
      name: 'Impuesto Revolucionario',
      desc: 'El jugador activo entrega floor(monedas/2) al siguiente jugador.'
    },
    cofre: {
      id: 'cofre',
      name: 'Cofre Mimetico',
      desc: 'El proximo monstruo derrotado da el doble de recompensa, pero tiene +5 HP.'
    },
    mercado: {
      id: 'mercado',
      name: 'Mercado Negro',
      desc: 'Todos los jugadores pasan 1 carta de su mano al jugador de su izquierda.'
    },
    niebla: {
      id: 'niebla',
      name: 'Niebla de Guerra',
      desc: 'Ninguna carta de Botin puede usarse hasta que pase una ronda completa.'
    }
  };

  var LOOT = {
    yep: { id: 'yep', name: 'Yep!', price: 3, desc: 'Cancela la ultima carta de botin o accion de un rival.' },
    mano_fria: { id: 'mano_fria', name: 'Mano Fria', price: 3, desc: 'Tu proxima mano no puede ser robada ni cancelada.' },
    transfusion: { id: 'transfusion', name: 'Transfusion Prohibida', price: 4, desc: 'Pierdes 6 HP para robar 3 cartas. No usable con 6 HP o menos.' },
    daga: { id: 'daga', name: 'Daga de Sacrificio', price: 5, desc: '+15 de dano base al proximo ataque. Resta 4 HP al usarla. No usable con 4 HP o menos.' },
    espejo_roto: { id: 'espejo_roto', name: 'Espejo Roto', price: 5, desc: 'Refleja el proximo ataque recibido al 50%. Se consume al activarse.' },
    bolsa_oro: { id: 'bolsa_oro', name: 'Bolsa de Oro', price: null, desc: 'Vale 20 monedas exactas al canjearla en la Tienda.' }
  };

  var ARTIFACTS = {
    calculadora: { id: 'calculadora', name: 'Calculadora Cuantica', price: 4, desc: 'Muestra el dano/curacion exacto antes de confirmar.' },
    reloj: { id: 'reloj', name: 'Reloj de Arena', price: 6, desc: 'Ignora el dano de un monstruo una vez cada 3 turnos.' },
    nucleo: { id: 'nucleo', name: 'Nucleo de Acero', price: 7, desc: '(Escudo) Reduce todo dano recibido en 3 (minimo 1). Incompatible con Espejo.', shield: true, incompatibleClass: 'espejo' },
    anillo: { id: 'anillo', name: 'Anillo del Vampiro', price: 7, desc: 'Mejora la recuperacion del Sanguinario a 1 HP por cada 4 de dano.' },
    capa: { id: 'capa', name: 'Capa del Fenix', price: 10, desc: 'Una vez por partida: al llegar a 0 HP, revives con 12 HP.' }
  };

  var MAX_ARTIFACTS = 3;
  var HAND_SIZE = 5;

  global.VA_DATA = {
    CLASSES: CLASSES,
    HAND_LEVELS: HAND_LEVELS,
    MONSTERS: MONSTERS,
    EVENTS: EVENTS,
    LOOT: LOOT,
    ARTIFACTS: ARTIFACTS,
    MAX_ARTIFACTS: MAX_ARTIFACTS,
    HAND_SIZE: HAND_SIZE
  };
})(window);
