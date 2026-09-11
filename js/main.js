/* Bootstrap: pantalla de configuracion y arranque de partida. */
(function (global) {
  'use strict';

  var D = global.VA_DATA;

  function buildClassSelect() {
    var opts = Object.keys(D.CLASSES).map(function (id) {
      return '<option value="' + id + '">' + D.CLASSES[id].name + '</option>';
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
        '<strong>P' + (i + 1) + '</strong>' +
        '<input type="text" class="name-input" placeholder="Nombre del jugador ' + (i + 1) + '">' +
        buildClassSelect() +
        '<div class="class-desc"></div>';
      var select = row.querySelector('.class-select');
      var desc = row.querySelector('.class-desc');
      var updateDesc = function (sel, d) {
        return function () {
          var cls = D.CLASSES[sel.value];
          d.textContent = cls.summary + ' (' + cls.maxHp + ' HP) - ' + cls.drawback;
        };
      }(select, desc);
      select.addEventListener('change', updateDesc);
      updateDesc();
      wrap.appendChild(row);
    }
  }

  function initSetupScreen() {
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
    renderPlayerForms(2);

    document.getElementById('start-game-btn').addEventListener('click', function () {
      var rows = document.querySelectorAll('.player-form-row');
      var defs = Array.prototype.map.call(rows, function (row, idx) {
        var name = row.querySelector('.name-input').value.trim() || ('Jugador ' + (idx + 1));
        var classId = row.querySelector('.class-select').value;
        return { name: name, classId: classId };
      });
      startGame(defs);
    });
  }

  function startGame(defs) {
    var game = global.VA_STATE.createGame(defs);
    global.VA_UI.setGame(game);
    document.getElementById('setup-screen').hidden = true;
    document.getElementById('game-screen').hidden = false;
    global.VA_STATE.requestPassDevice(game);
    global.VA_UI.renderAll();
  }

  document.addEventListener('DOMContentLoaded', initSetupScreen);
})(window);
