/* Bootstrap: pantalla de configuracion y arranque de partida. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;
  var currentGame = null;

  function selectedDuration() {
    var sel = document.getElementById('duration-select');
    return sel && sel.value ? sel.value : D.DEFAULT_DURATION;
  }

  function buildClassSelect() {
    var opts = Object.keys(D.CLASSES).map(function (id) {
      return '<option value="' + id + '">' + D.CLASSES[id].icon + ' ' + D.CLASSES[id].name + '</option>';
    }).join('');
    return '<select class="class-select">' + opts + '</select>';
  }

  function renderPlayerForms(count) {
    var wrap = document.getElementById('player-forms');
    wrap.innerHTML = '';
    for (var i = 0; i < count; i += 1) {
      var row = document.createElement('div');
      row.className = 'player-form-row';
      row.innerHTML =
        '<span class="class-portrait"></span>' +
        '<strong>P' + (i + 1) + '</strong>' +
        '<input type="text" class="name-input" placeholder="Nombre del jugador ' + (i + 1) + '">' +
        buildClassSelect() +
        '<div class="class-desc"></div>';
      var select = row.querySelector('.class-select');
      var desc = row.querySelector('.class-desc');
      var portrait = row.querySelector('.class-portrait');
      var updateDesc = function (sel, d, pic) {
        return function () {
          var cls = D.CLASSES[sel.value];
          d.textContent = cls.icon + ' ' + cls.summary + ' (' + D.classMaxHp(sel.value, selectedDuration()) + ' HP) - ' + cls.drawback;
          pic.innerHTML = global.VA_PIXEL.sprite(cls.icon, 'md');
        };
      }(select, desc, portrait);
      select.addEventListener('change', updateDesc);
      row.updateDesc = updateDesc;
      updateDesc();
      wrap.appendChild(row);
    }
  }

  /* Cambia los emoji del titulo por sprites pixel. */
  function pixelateTitle() {
    Array.prototype.forEach.call(document.querySelectorAll('.title-flourish'), function (n) {
      n.innerHTML = global.VA_PIXEL.sprite(n.textContent.trim(), 'md');
    });
  }

  /* Interferencia de "cambio de canal" en la tele al pasar de una pantalla a otra. */
  function crtSwitch() {
    var crt = document.getElementById('crt');
    if (!crt) return;
    crt.classList.remove('crt-switching');
    void crt.offsetWidth;
    crt.classList.add('crt-switching');
    global.setTimeout(function () { crt.classList.remove('crt-switching'); }, 700);
  }

  function initSetupScreen() {
    pixelateTitle();
    var version = document.querySelector('meta[name="va-version"]');
    var versionEl = document.getElementById('app-version');
    if (version && versionEl) versionEl.textContent = 'Version ' + version.content;
    var countSelect = document.getElementById('player-count');
    countSelect.innerHTML = '';
    for (var n = 2; n <= 6; n += 1) {
      var o = document.createElement('option');
      o.value = String(n);
      o.textContent = n + ' jugadores';
      countSelect.appendChild(o);
    }
    countSelect.addEventListener('change', function () {
      renderPlayerForms(parseInt(countSelect.value, 10));
    });
    var durationSelect = document.getElementById('duration-select');
    durationSelect.innerHTML = Object.keys(D.DURATIONS).map(function (id) {
      return '<option value="' + id + '">' + D.DURATIONS[id].name + '</option>';
    }).join('');
    durationSelect.value = D.DEFAULT_DURATION;
    var updateDuration = function () {
      document.getElementById('duration-desc').textContent = D.durationOf(durationSelect.value).desc;
      Array.prototype.forEach.call(document.querySelectorAll('.player-form-row'), function (row) {
        if (row.updateDesc) row.updateDesc();
      });
    };
    durationSelect.addEventListener('change', updateDuration);

    renderPlayerForms(2);
    updateDuration();

    document.getElementById('start-game-btn').addEventListener('click', function () {
      var rows = document.querySelectorAll('.player-form-row');
      var defs = Array.prototype.map.call(rows, function (row, idx) {
        var name = row.querySelector('.name-input').value.trim() || ('Jugador ' + (idx + 1));
        var classId = row.querySelector('.class-select').value;
        return { name: name, classId: classId };
      });
      startGame(defs);
    });

    document.getElementById('how-to-play-btn').addEventListener('click', function () {
      global.VA_TUTORIAL.open(selectedDuration());
    });
    document.getElementById('how-to-play-btn-game').addEventListener('click', function () {
      global.VA_TUTORIAL.open(currentGame ? currentGame.durationId : selectedDuration());
    });
    document.getElementById('compendium-btn').addEventListener('click', function () {
      global.VA_COMPENDIUM.open(selectedDuration());
    });
    document.getElementById('compendium-btn-game').addEventListener('click', function () {
      global.VA_COMPENDIUM.open(currentGame ? currentGame.durationId : selectedDuration());
    });
    document.getElementById('start-tutorial-btn').addEventListener('click', startTutorial);
  }

  function startGame(defs, opts) {
    opts = opts || {};
    var game = global.VA_STATE.createGame(defs, { duration: selectedDuration() });
    game.isTutorial = !!opts.tutorial;
    currentGame = game;
    global.VA_UI.setGame(game);
    crtSwitch();
    document.getElementById('setup-screen').hidden = true;
    document.getElementById('game-screen').hidden = false;
    document.body.classList.add('in-game');
    global.VA_STATE.requestPassDevice(game);
    global.VA_UI.renderAll();
  }

  function startTutorial() {
    var firstRow = document.querySelector('.player-form-row');
    var humanName = (firstRow.querySelector('.name-input').value.trim()) || 'Tu';
    var humanClass = firstRow.querySelector('.class-select').value;
    var classIds = Object.keys(D.CLASSES);
    var aiClass = classIds[Math.floor(Math.random() * classIds.length)];
    var defs = [
      { name: humanName, classId: humanClass },
      { name: 'IA', classId: aiClass, isAI: true }
    ];
    startGame(defs, { tutorial: true });
  }

  /* App agregada a la pantalla de inicio del iPhone (Safari la marca con navigator.standalone):
     ahi el juego se muestra solo en horizontal, como lo haria la app nativa. */
  if (global.navigator && global.navigator.standalone) document.documentElement.classList.add('standalone');

  /*
   * Version publicada mas nueva que la cargada: GitHub Pages y Safari guardan index.html unos
   * minutos, y un index.html viejo puede terminar cargando CSS/JS nuevos (o al reves). Al abrir,
   * se pregunta al servidor por su index.html y, si trae otra version, se recarga UNA vez (nunca
   * con una partida empezada). Sin conexion o abriendo el archivo local, no hace nada.
   */
  function checkForNewerVersion() {
    var meta = document.querySelector('meta[name="va-version"]');
    if (!meta || !global.fetch || !/^https?:$/.test(global.location.protocol)) return;
    var mine = meta.content;
    global.fetch('index.html', { cache: 'no-cache' }).then(function (res) {
      return res.ok ? res.text() : '';
    }).then(function (html) {
      var m = /<meta name="va-version" content="([^"]+)"/.exec(html);
      if (!m || m[1] === mine || currentGame) return;
      var key = 'va-reloaded-for';
      try {
        if (global.sessionStorage.getItem(key) === m[1]) return;
        global.sessionStorage.setItem(key, m[1]);
      } catch (e) { return; }
      global.location.reload();
    }).catch(function () { /* sin conexion: seguir con lo que hay */ });
  }

  document.addEventListener('DOMContentLoaded', initSetupScreen);
  document.addEventListener('DOMContentLoaded', checkForNewerVersion);
})(window);
