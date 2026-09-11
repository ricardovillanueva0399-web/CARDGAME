/* Tutorial interactivo "Como Jugar". Independiente del estado de partida: se puede
   abrir desde la pantalla de preparacion o, sin tocar nada, durante una partida en curso. */
(function (global) {
  'use strict';

  var STEPS = [
    {
      title: 'Que es The Volatile Arena',
      body:
        '<p>Un roguelite competitivo de cartas para <strong>2 a 6 jugadores</strong>, ' +
        'local y por turnos, en un mismo dispositivo (pasar y jugar).</p>' +
        '<p>Cada jugador tiene su <strong>propio mazo cerrado</strong>: nadie roba del ' +
        'mazo de otro ni comparte cartas salvo que un efecto lo diga expresamente.</p>' +
        '<p><strong>Objetivo:</strong> ser el ultimo en pie. Reduce el HP de tus rivales ' +
        'a 0 mientras cuidas el tuyo.</p>'
    },
    {
      title: 'Tu mazo y tu mano',
      body:
        '<p>Tu mazo personal mezcla:</p>' +
        '<ul>' +
        '<li><strong>25 cartas de Ataque</strong> (negras &spades;&clubs;, valor 1 a 5)</li>' +
        '<li><strong>25 cartas de Curacion</strong> (rojas &hearts;&diams;, valor 1 a 5)</li>' +
        '<li><strong>6 cartas de Suceso</strong> (efectos automaticos)</li>' +
        '<li><strong>3 Monstruos</strong> (encuentros de emboscada)</li>' +
        '</ul>' +
        '<p>Al empezar tu turno robas hasta tener <strong>5 cartas</strong> en mano.</p>' +
        '<p>Si robas un <strong>Suceso</strong>, se activa solo, se descarta y robas una ' +
        'carta extra (no ocupa un lugar en tu mano). Si robas un <strong>Monstruo</strong>, ' +
        'el robo se detiene ahi mismo para que decidas que hacer.</p>'
    },
    {
      title: 'Jugar una mano: Ataque o Curacion',
      body:
        '<p>En tu turno eliges algunas cartas de tu mano, declaras ' +
        '<strong>Ataque</strong> o <strong>Curacion</strong>, y el juego arma automaticamente ' +
        'la mejor combinacion posible con lo que seleccionaste.</p>' +
        '<p class="tut-warn">Ojo: si declaras Ataque, las cartas rojas que hayas marcado no ' +
        'sirven para nada (se pierden igual que las negras). Si declaras Curacion, pasa lo ' +
        'mismo con las negras. Elige pensando en un solo color.</p>' +
        '<p>Excepcion: el <strong>Alquimista</strong> puede usar el color contrario, pero a ' +
        'un 70% de su valor.</p>'
    },
    {
      title: 'Jerarquia de manos',
      body:
        '<div class="tut-table-wrap"><table class="tut-table">' +
        '<tr><th>Mano</th><th>Formula</th><th>Rango</th></tr>' +
        '<tr><td>Carta Suelta</td><td>valor</td><td>1-5</td></tr>' +
        '<tr><td>Duo (pareja)</td><td>5 + valor</td><td>6-10</td></tr>' +
        '<tr><td>Doble Duo</td><td>10 + pareja alta</td><td>11-15</td></tr>' +
        '<tr><td>Tercia</td><td>15 + valor</td><td>16-20</td></tr>' +
        '<tr><td>Escalera *</td><td>fijo</td><td>21</td></tr>' +
        '<tr><td>Full House</td><td>22 + valor tercia</td><td>23-27</td></tr>' +
        '<tr><td>Poker *</td><td>28 + valor</td><td>29-33</td></tr>' +
        '<tr><td>Quinta *</td><td>35 + valor</td><td>36-40</td></tr>' +
        '</table></div>' +
        '<p class="tut-note">* Escalera, Poker y Quinta no existen como manos de Curacion: ' +
        'si intentas curarte con ellas, el juego las baja automaticamente a Full House, ' +
        'Tercia o Carta Suelta.</p>' +
        '<p>Un nivel superior siempre gana a uno inferior, sin importar el numero: una ' +
        'Tercia de 1 vence a un Doble Duo de 5s.</p>'
    },
    {
      title: 'Monedas de Arena',
      body:
        '<p>Al final de tu turno, si te quedo alguna carta en la mano que ' +
        '<strong>no combina con ninguna otra</strong> (no forma ni un Duo), puedes ' +
        'descartarla a cambio de <strong>Monedas de Arena</strong> iguales a su valor.</p>' +
        '<p>Guarda tus Monedas: son la unica forma de comprar en la Tienda.</p>'
    },
    {
      title: 'Monstruos de Emboscada',
      body:
        '<div class="tut-table-wrap"><table class="tut-table">' +
        '<tr><th>Monstruo</th><th>HP</th><th>Penalizacion</th></tr>' +
        '<tr><td>Ladron de Sombras</td><td>12</td><td>-5 HP y te roban 1 carta</td></tr>' +
        '<tr><td>Sombra del Vacio</td><td>30</td><td>-15 HP</td></tr>' +
        '<tr><td>AZAZEL (Jefe)</td><td>45</td><td>-28 HP</td></tr>' +
        '</table></div>' +
        '<p>Al robar un Monstruo eliges: <strong>Combatir</strong> (formas un ataque con tu ' +
        'mano actual) o <strong>Huir</strong> (penalizacion fija, el monstruo vuelve al ' +
        'mazo).</p>' +
        '<p>Si tu dano es mayor o igual al HP del monstruo, muere y ganas una recompensa. Si ' +
        'no llega, sufres la misma penalizacion que huir.</p>' +
        '<p><strong>Derrotar cualquier monstruo abre la Tienda para todos los jugadores</strong>, ' +
        'no solo para quien lo vencio.</p>'
    },
    {
      title: 'Sucesos',
      body:
        '<p>Se activan solos al robarlos, afectan a todos salvo que digan lo contrario:</p>' +
        '<ul>' +
        '<li><strong>Vortice Temporal:</strong> invierte el orden de turnos.</li>' +
        '<li><strong>Llamada de la Caceria:</strong> obliga a combatir de inmediato el ' +
        'proximo monstruo del mazo. No se puede huir.</li>' +
        '<li><strong>Impuesto Revolucionario:</strong> entregas la mitad de tus Monedas al ' +
        'siguiente jugador.</li>' +
        '<li><strong>Cofre Mimetico:</strong> el proximo monstruo derrotado da doble ' +
        'recompensa, pero tiene +5 HP.</li>' +
        '<li><strong>Mercado Negro:</strong> todos pasan una carta a su vecino.</li>' +
        '<li><strong>Niebla de Guerra:</strong> nadie puede usar Botin durante una ronda.</li>' +
        '</ul>'
    },
    {
      title: 'La Tienda de la Arena',
      body:
        '<p>Se abre para todos tras cualquier monstruo derrotado. Cada jugador compra por ' +
        'su cuenta con sus propias Monedas.</p>' +
        '<p><strong>Botin</strong> (un solo uso, se gasta al activarlo): Yep!, Mano Fria, ' +
        'Transfusion Prohibida, Daga de Sacrificio, Espejo Roto, Bolsa de Oro (vale 20 ' +
        'Monedas al canjearla).</p>' +
        '<p><strong>Artefactos</strong> (pasivos permanentes, maximo 3 equipados): ' +
        'Calculadora Cuantica, Reloj de Arena, Nucleo de Acero, Anillo del Vampiro, Capa ' +
        'del Fenix.</p>'
    },
    {
      title: 'Las 6 clases',
      body:
        '<div class="tut-table-wrap"><table class="tut-table tut-table-classes">' +
        '<tr><th>Clase</th><th>HP</th><th>Pasiva</th><th>Desventaja</th></tr>' +
        '<tr><td>Gladiador</td><td>25</td><td>+3 dano en ataques</td><td>HP base baja</td></tr>' +
        '<tr><td>Espejo</td><td>40</td><td>Refleja 25% del dano (max 8)</td><td>Sin artefactos Escudo</td></tr>' +
        '<tr><td>Cleptomano</td><td>40</td><td>Roba 1 carta rival al iniciar turno</td><td>Monstruos +4 HP contra el</td></tr>' +
        '<tr><td>Taumaturgo</td><td>40</td><td>Curaciones x1.5</td><td>-4 dano en ataques</td></tr>' +
        '<tr><td>Alquimista</td><td>40</td><td>Usa cualquier color al 70%</td><td>Penalizacion fija del 30%</td></tr>' +
        '<tr><td>Sanguinario</td><td>40</td><td>Recupera HP al hacer dano</td><td>-1 HP cada turno</td></tr>' +
        '</table></div>'
    },
    {
      title: 'Listo para jugar',
      body:
        '<p>Resumen de un turno:</p>' +
        '<ol>' +
        '<li>Pasa el dispositivo y robas hasta tener 5 cartas (resolviendo Sucesos y ' +
        'Monstruos por el camino).</li>' +
        '<li>Juegas una mano (Ataque o Curacion) o pasas.</li>' +
        '<li>Descartas cartas sueltas por Monedas si quieres.</li>' +
        '<li>Le pasas el turno al siguiente jugador.</li>' +
        '</ol>' +
        '<p><strong>Gana quien quede en pie.</strong> Este panel esta siempre disponible ' +
        'con el boton "Como jugar" si necesitas repasar algo a mitad de partida.</p>'
    }
  ];

  var currentStep = 0;

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function render() {
    var root = document.getElementById('tutorial-root');
    root.innerHTML = '';

    var dots = STEPS.map(function (s, i) {
      return '<span class="tut-dot' + (i === currentStep ? ' active' : '') + '" data-step="' + i + '"></span>';
    }).join('');

    var wrap = el(
      '<div class="overlay tut-overlay">' +
        '<div class="modal tut-modal">' +
          '<div class="tut-header">' +
            '<span class="tut-step-count">Paso ' + (currentStep + 1) + ' de ' + STEPS.length + '</span>' +
            '<button class="btn btn-small tut-close" aria-label="Cerrar">Cerrar</button>' +
          '</div>' +
          '<h3>' + STEPS[currentStep].title + '</h3>' +
          '<div class="tut-body">' + STEPS[currentStep].body + '</div>' +
          '<div class="tut-dots">' + dots + '</div>' +
          '<div class="tut-nav">' +
            '<button class="btn tut-prev"' + (currentStep === 0 ? ' disabled' : '') + '>&larr; Anterior</button>' +
            (currentStep === STEPS.length - 1
              ? '<button class="btn btn-primary tut-close">Empezar a jugar</button>'
              : '<button class="btn btn-primary tut-next">Siguiente &rarr;</button>') +
          '</div>' +
        '</div>' +
      '</div>'
    );

    wrap.querySelectorAll('.tut-close').forEach(function (b) {
      b.addEventListener('click', close);
    });
    var prevBtn = wrap.querySelector('.tut-prev');
    if (prevBtn) prevBtn.addEventListener('click', function () { goto(currentStep - 1); });
    var nextBtn = wrap.querySelector('.tut-next');
    if (nextBtn) nextBtn.addEventListener('click', function () { goto(currentStep + 1); });
    wrap.querySelectorAll('.tut-dot').forEach(function (d) {
      d.addEventListener('click', function () { goto(parseInt(d.getAttribute('data-step'), 10)); });
    });
    wrap.addEventListener('click', function (ev) {
      if (ev.target === wrap) close();
    });

    root.appendChild(wrap);
  }

  function goto(step) {
    currentStep = Math.max(0, Math.min(STEPS.length - 1, step));
    render();
  }

  function open() {
    currentStep = 0;
    render();
  }

  function close() {
    var root = document.getElementById('tutorial-root');
    root.innerHTML = '';
  }

  global.VA_TUTORIAL = { open: open, close: close };
})(window);
