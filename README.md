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
style.css           Estilos (tema tele CRT + RPG pixel, responsive)
fonts/              Fuentes pixel incluidas (Press Start 2P y VT323, licencia SIL OFL)
js/data.js           Tablas estáticas: clases, monstruos, sucesos, botín, artefactos
js/deck.js            Construcción y barajado del mazo personal de cada jugador
js/hands.js           Evaluador de manos (Carta Suelta → Quinta)
js/combat.js          Orden de resolución de daño/curación
js/events.js          Efectos de las 6 cartas de Suceso
js/monsters.js        Encuentros con los 3 Monstruos de Emboscada
js/shop.js            Tienda de la Arena
js/wanderers.js       Criaturas errantes (Gusano Suplicante)
js/state.js           Motor de turnos y estado de partida
js/tutorial.js         Panel de referencia estático "Cómo jugar" (11 pasos)
js/compendium.js       Compendio: referencia de clases, monstruos, manos, sucesos, botín, artefactos y reglas
js/coach.js            Textos de pista contextuales del Modo Tutorial
js/ai.js               IA que juega turnos completos en el Modo Tutorial
js/pixel.js            Arte pixel: palos de la baraja y sprites generados desde los emoji
js/fx.js               Efectos visuales (orbes, números flotantes, estallidos, carteles)
js/ui.js              Renderizado e interacción con el DOM
js/main.js            Pantalla de configuración y arranque
```

## Compendio

El botón **Compendio** (en la preparación y en la barra lateral durante la partida) abre una
referencia completa en pestañas: Clases, Monstruos, Combinaciones, Sucesos, Botín,
Artefactos y Reglas (duraciones, estructura del turno, Monedas, Tienda y orden de cálculo
del daño). También se abre desde la ventana de un monstruo (en la pestaña Monstruos) y desde
la Tienda (en Botín), sin cerrar la decisión en curso.

- Los números (HP, penalizaciones, rangos de cada mano, precios) se leen de `js/data.js` y se
  ajustan a la duración elegida, así que no pueden desincronizarse de las reglas.
- Los textos de "cómo funciona" describen lo que hace esta implementación, que en algunos
  puntos difiere del documento de diseño (ver la lista de decisiones más abajo). Por
  ejemplo, avisa que la Calculadora Cuántica no aporta nada porque la vista previa del daño
  ya se muestra siempre.
- Se maneja con teclado: flechas izquierda/derecha cambian de pestaña y Escape cierra.

## Estilo visual: tele CRT + RPG pixel

- Todo se ve como un juego de rol de 16 bits en una tele de tubo: marco de plástico con
  esquinas de pantalla redondeadas, líneas de barrido, viñeta, un leve parpadeo, una banda
  clara que recorre la pantalla y una ligera aberración cromática en el texto. Al cargar,
  la tele "se enciende" (línea blanca que se abre) y al empezar la partida hay un instante
  de estática como al cambiar de canal. Esta capa (`#crt`) está encima de todo pero no
  captura clics.
- Interfaz en ventanas tipo RPG (azul con marco blanco y esquinas escalonadas, hechas con
  sombras CSS), botones pixel con bisel y cursor ▶ parpadeante, barras de vida por
  segmentos y fuentes pixel: *Press Start 2P* para títulos y números, *VT323* para el texto.
  Las fuentes van en `fonts/` para que funcione también sin conexión.
- Cartas pixel con los palos dibujados pixel a pixel (`js/pixel.js`).
- Los iconos de clases, monstruos y sucesos se convierten en sprites: el emoji se dibuja
  en un lienzo de 16–26 px, se reduce a pocos colores con contorno oscuro y se amplía sin
  suavizado. Depende de que el sistema tenga emoji a color; si no, se muestra el emoji
  normal. No es una curvatura real del tubo (CSS no puede deformar la página sin romper
  los clics): la sensación de pantalla curva sale de la viñeta y las esquinas.

## Animaciones

- Al elegir cartas que forman una combinación, esas cartas se juntan (se superponen
  con brillo dorado) y el nombre de la jugada salta encima ("¡DUO!", "¡TERCIA!"...).
- Al confirmar, las cartas se fusionan en un orbe que viaja hasta el objetivo; recién
  al impactar se ve el daño o la curación (número flotante, destello, sacudida y la
  barra de vida que baja dejando un tramo "fantasma" de lo perdido).
- Reflejo (Espejo / Espejo Roto), monedas ganadas o gastadas, eliminaciones, Capa del
  Fénix, Sucesos y combates contra monstruos (el monstruo aparece en el centro de la
  pantalla) tienen su propio efecto; las cartas nuevas entran repartiéndose.
- Cómo encaja con el resto: el motor solo agrega eventos a `game.fxQueue`
  (sin afectar las reglas) y la interfaz los reproduce en orden sobre una capa aparte,
  mostrando el HP "anterior" hasta el momento del impacto. Si las jugadas llegan más
  rápido que las animaciones, las pendientes se aplican al instante para no atrasarse.
- Con "reducir movimiento" activado en el sistema operativo, los avisos se mantienen
  pero sin desplazamientos ni sacudidas.

## Criaturas errantes: el Gusano Suplicante

**Agregado propio, no está en el Marco de Diseño v3.3.** Un enemigo que no se combate:
plantea un dilema.

- **Cuándo aparece:** no es una carta. Al terminar de robar la mano de inicio de turno
  hay un 8% de probabilidad de que salga de la tierra (nunca durante la primera vuelta
  de la mesa, ni en los robos extra de Transfusión Prohibida).
- **Alimentarlo:** el jugador elige cartas de su mano cuyos valores sumen al menos 8;
  esas cartas se descartan. Cura +20 HP; la curación que no quepa (por tener la vida
  casi llena) se convierte en HP máximo permanente, hasta +10 por encuentro. Es una
  curación fija: no la modifican pasivas de clase como la del Taumaturgo.
- **Negarse, o no poder alimentarlo:** se enoja y se lleva el 80% de las monedas
  (redondeando hacia arriba). Si el jugador no tiene ninguna, le muerde: −6 HP, sin
  bajar nunca de 1 HP (el gusano no elimina a nadie).
- La IA lo alimenta siempre que puede, con la combinación de cartas de menor valor que
  alcance y prefiriendo no romper parejas; si no le alcanza, se niega.
- Los números de arriba son los de la duración Rápida. En Normal y Larga la curación,
  el tope de HP máximo y la mordida se multiplican igual que la vida de las clases
  (×1.5 y ×2: +30/+15/−9 y +40/+20/−12), para que pesen lo mismo en proporción; la
  comida necesaria y el 80% de monedas no cambian. El Compendio (pestaña Monstruos)
  muestra los valores de la duración elegida.
- Todos los números base están en `WANDERERS.gusano` dentro de `js/data.js`, para poder
  ajustar el balance sin tocar la lógica.
- Dibujo: SVG animado propio (no un sprite generado desde emoji), con bordes sin
  suavizado y contorno oscuro para acercarse al estilo pixel del resto del juego.

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

## Duración de la partida y monstruos

En la preparación hay un selector **Duración** (también aplica al Modo Tutorial). "Rápida"
son las reglas originales v3.3 sin tocar; "Normal" (por defecto) y "Larga" cambian el HP y
cómo funcionan los monstruos:

| | Rápida (original) | **Normal** | Larga |
|---|---|---|---|
| HP de las clases | 25 / 40 | 38 / 60 | 50 / 80 |
| HP de Ladrón / Sombra / AZAZEL | 12 / 30 / 45 | 6 / 15 / 23 | 6 / 15 / 23 |
| Huir o perder contra ellos | -5 / -15 / -28 HP | -3 / -8 / -14 HP | -3 / -8 / -14 HP |
| El monstruo te espera a que completes la mano | no | sí | sí |
| El daño que le haces se queda (vuelve herido al mazo) | no | sí | sí |
| Turnos por jugador, 1 vs 1 (mediana) | 2,5 | 7,0 | 8,5 |
| Turnos por jugador, 4 jugadores (mediana) | 3,8 | 7,5 | 10,3 |

Por qué. Simulando miles de partidas IA contra IA con las reglas originales:

- Una partida 1 vs 1 duraba una mediana de 2,5 turnos por jugador y casi dos tercios del HP
  perdido venía de penalizaciones de monstruo.
- Al monstruo se lo enfrentaba con la mano que hubiera en el momento de robarlo: 2,2 cartas
  de media, y en ~35% de los encuentros ninguna carta de ataque. La probabilidad de poder
  ganarle era 1,3% al Ladrón, ~0% a la Sombra y 0% a AZAZEL (con 4 cartas como máximo, sus
  45 HP son inalcanzables sin la Daga de Sacrificio). "Combatir" era una opción falsa.

Con las reglas de Normal, se enfrenta al monstruo con 5 cartas y en ese combate se le puede
ganar al Ladrón ~32% de las veces, a la Sombra ~13% y a AZAZEL ~5%; como el daño se
acumula, los jefes se vencen en 2–3 combates. Aun así AZAZEL sigue siendo raro de matar
(~7% de las partidas 1 vs 1 en Normal, ~17% en Larga) y los monstruos siguen siendo la
principal fuente de daño.

Las cifras salen de simulaciones (1000 partidas de 2 jugadores y 400 de 4 por duración):
son una estimación, no una garantía. La IA ataca a los rivales de forma sencilla (solo
grupos del mismo valor), así que entre personas las partidas probablemente sean algo más
cortas.

No se escalan el HP de la Capa del Fénix (12), el premio de AZAZEL (+15 HP máximo), los
costes de la Daga (4 HP) y la Transfusión (6 HP) ni la pérdida del Sanguinario (1 HP por
turno). Probé también que los monstruos no pudieran eliminar a nadie, pero sin ese "reloj"
aparecían partidas que no terminaban nunca, así que se descartó.

Caso límite conocido: en Normal y Larga los monstruos derrotados salen del mazo. En ~0,15%
de las partidas de 4 IA en Larga, los jugadores que quedan ya no tienen monstruos ni cartas
de ataque suficientes y la partida se alarga sin fin (se curan más de lo que se dañan).

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
- **Reloj de Arena** ("ignora el daño de un monstruo una vez cada 3 turnos"): se vendía en
  la Tienda pero no tenía efecto. Ahora anula el HP que quitaría huir o perder contra un
  monstruo (el Ladrón igual roba la carta) y vuelve a estar disponible 3 turnos propios
  después de usarse.
- **Cleptómano contra monstruos**: su desventaja ("los monstruos tienen +4 HP contra él")
  aparecía en la interfaz pero no estaba aplicada; ahora sí, en todas las duraciones.
- **Mazo sin cartas jugables**: las cartas pasan de un mazo a otro (Mercado Negro, Ladrón,
  Cleptómano) y un mazo puede quedarse solo con Sucesos. Tras una vuelta entera al mazo sin
  conseguir una carta jugable, el robo se detiene (antes podía quedarse robando Sucesos
  para siempre y colgar la página).
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
  un Espejo Roto ya armados de un rival (la Transfusión Prohibida se resuelve al
  instante, así que no hay nada que cancelar);
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
