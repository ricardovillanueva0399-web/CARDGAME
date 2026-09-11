# The Volatile Arena

Implementación web (HTML/CSS/JS puro, sin dependencias ni build) del juego de cartas
descrito en *THE VOLATILE ARENA — Marco de Diseño v3.3*. Roguelite competitivo local,
pasar y jugar, para 2 a 6 jugadores en un mismo dispositivo.

## Cómo jugarlo

No requiere instalación. Al ser módulos `<script>` normales (no ES modules), puede
abrirse `index.html` directamente en el navegador, o servirse con cualquier servidor
estático, por ejemplo:

```
python3 -m http.server 8000
```

y abrir `http://localhost:8000/`.

## Estructura

```
index.html          Punto de entrada
style.css           Estilos (tema oscuro, responsive)
js/data.js           Tablas estáticas: clases, monstruos, sucesos, botín, artefactos
js/deck.js            Construcción y barajado del mazo personal de cada jugador
js/hands.js           Evaluador de manos (Carta Suelta → Quinta)
js/combat.js          Orden de resolución de daño/curación
js/events.js          Efectos de las 6 cartas de Suceso
js/monsters.js        Encuentros con los 3 Monstruos de Emboscada
js/shop.js            Tienda de la Arena
js/state.js           Motor de turnos y estado de partida
js/tutorial.js         Panel de referencia estático "Cómo jugar" (10 pasos)
js/coach.js            Textos de pista contextuales del Modo Tutorial
js/ai.js               IA que juega turnos completos en el Modo Tutorial
js/ui.js              Renderizado e interacción con el DOM
js/main.js            Pantalla de configuración y arranque
```

## Modo Tutorial (jugar contra la IA)

Desde la pantalla de preparación, el botón **"Modo Tutorial (vs IA)"** arranca una
partida de 2 jugadores usando el nombre y la clase que hayas puesto en la fila del
Jugador 1: tú contra una IA con una clase aleatoria.

- La IA (`js/ai.js`) juega turnos completos por su cuenta: elige atacar o curarse
  segun su HP, forma la mejor combinación simple que tenga en mano (el grupo de
  cartas del mismo valor más grande), decide si combatir o huir de un monstruo
  comparando el daño estimado contra su HP, compra en la Tienda, y responde a
  Mercado Negro y a la elección de AZAZEL. No es una IA óptima: usa una heurística
  simple pensada para ser un rival razonable de práctica, no para jugar perfecto.
- Mientras es tu turno, un panel de pistas (`js/coach.js`) te va diciendo qué hacer
  a continuación — no es un guion fijo con cartas concretas (el mazo es aleatorio en
  cada partida), sino un mensaje que se recalcula según tu mano y la fase actual:
  qué botón pulsar, cuándo elegir objetivo, qué hacer ante un monstruo o en la
  Tienda, etc.
- La pantalla de "pasa el dispositivo" se salta automáticamente en este modo (solo
  hay un humano jugando, no hace falta ocultar la pantalla entre turnos).

El panel de referencia estático **"Cómo jugar"** (`js/tutorial.js`, ya presente antes
de este modo) sigue disponible aparte, tanto en la pantalla de preparación como
durante cualquier partida, como una chuleta de reglas independiente del estado de
juego.

## Decisiones de diseño donde el documento original era ambiguo o incompleto

El documento describe el sistema de reglas con detalle, pero deja varios puntos sin
especificar del todo. Estas son las interpretaciones adoptadas, para que quede claro
qué es regla original y qué es una decisión de implementación:

- **Monstruos dentro del mazo personal**: el documento dice "56 cartas por jugador"
  pero también que "los 3 monstruos se mezclan en el mazo al inicio de la partida" y
  que al huir se reinsertan "en cualquier posición del mazo, incluyendo el de un
  rival". Se implementó así: cada mazo personal tiene 59 cartas físicas (56 + 3
  monstruos); "56" se usa como el tamaño del mazo de juego base, sin contar el
  subsistema de monstruos (así aparece también en la tabla de componentes).
- **Cartas de Material** (Acero, Vidrio, Piedra, Cuarzo): el documento no dice de
  dónde se obtienen (no están en el catálogo de la Tienda ni como recompensa de
  monstruo). Para no inventar una mecánica de obtención, **no están implementadas
  en esta versión**; el paso 2 del orden de resolución queda como no-op, listo para
  añadirlas si se define su origen.
- **Combate contra monstruos**: la tabla de "mínimo para combatir" (p. ej. "Poker+"
  contra Sombra del Vacío, 30 HP) es inconsistente con los rangos de daño reales (un
  Poker de valor 1 da 29, menos de 30). Se implementó la regla textual explícita de
  la sección 7 ("si daño ≥ HP del monstruo, muere") como comparación numérica exacta,
  no como filtro por rango de mano.
- **Llamada de la Caza con mano vacía o sin cartas atacables**: puede ocurrir a mitad
  del robo de turno. Como no se puede huir y no habría ninguna jugada válida, se
  resuelve como derrota automática (misma penalización que perder el combate) en
  vez de bloquear la partida.
- **Recompensa de AZAZEL** ("+15 HP máximo permanente o 3 Cartas Raras"): "Cartas
  Raras" no se define en ningún otro lugar del documento. Se interpretó como botín o
  artefactos aleatorios, y se lo indica explícitamente en la interfaz.
- **Mano Fría / Espejo Roto / Yep!**: se implementaron como activables por el
  propio jugador en su turno. Yep! en esta versión puede cancelar una Mano Fría o
  un Espejo Roto ya armados, o una Transfusión Prohibida en curso, de un rival;
  cancelar un ataque con Daga de Sacrificio ya resuelto no está soportado (queda
  fuera del alcance de esta versión por la complejidad de deshacer un combate ya
  aplicado).
- **Calculadora Cuántica**: el documento dice que es "solo informativa" (sin efecto
  de juego). Como el motor calcula el daño exacto de todas formas, la vista previa
  numérica de la jugada se muestra siempre a quien la juega, en vez de ocultarla a
  quien no tenga el artefacto.
- **Pantalla de "pasa el dispositivo"**: no está en el documento de diseño; se
  añadió por ser una partida local en un solo dispositivo, para que cada jugador
  vea su mano solo cuando le toca.

## Pruebas

La lógica de reglas (evaluación de manos, combate, tienda) se puede ejecutar fuera
del navegador cargando los módulos `js/*.js` en un contexto Node con un `window`
simulado, ya que no dependen del DOM. La interfaz se probó jugando partidas
completas de extremo a extremo con Playwright/Chromium.
