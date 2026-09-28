/* Efectos visuales. Todo se dibuja en una capa fija (#fx-layer) aparte del tablero, asi
   sobrevive a los re-renderizados completos de la interfaz. Sin logica de juego. */
(function (global) {
  'use strict';

  var doc = global.document;

  function reduced() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function layer() {
    var l = doc.getElementById('fx-layer');
    if (!l) {
      l = doc.createElement('div');
      l.id = 'fx-layer';
      l.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(l);
    }
    return l;
  }

  function wait(ms) {
    var t = reduced() ? Math.round(ms * 0.3) : ms;
    return new Promise(function (resolve) { global.setTimeout(resolve, t); });
  }

  function centerOf(elm) {
    var r = elm.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function spawn(className, x, y, html) {
    var n = doc.createElement('div');
    n.className = className;
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    if (html !== undefined) n.innerHTML = html;
    layer().appendChild(n);
    return n;
  }

  function removeLater(n, ms) {
    global.setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, ms);
  }

  function canAnimate(n) { return !reduced() && typeof n.animate === 'function'; }

  /* Numero o texto que sube y se desvanece (dano, curacion, monedas...). */
  function floatText(x, y, text, kind, delay) {
    global.setTimeout(function () {
      var n = spawn('fx-float fx-' + kind, x, y);
      n.textContent = text;
      removeLater(n, 1500);
    }, delay || 0);
  }

  /* Orbe de energia que viaja en arco de un punto a otro. Resuelve al llegar. */
  function projectile(from, to, kind, duration) {
    duration = duration || 420;
    if (!from || !to) return Promise.resolve();
    var orb = spawn('fx-orb fx-' + kind, 0, 0);
    if (!canAnimate(orb)) { orb.remove(); return Promise.resolve(); }

    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var lift = Math.min(140, Math.abs(dx) * 0.25 + Math.abs(dy) * 0.1 + 50);
    var mid = { x: from.x + dx / 2, y: from.y + dy / 2 - lift };
    function frames(scaleA, scaleB, scaleC) {
      return [
        { transform: 'translate(' + from.x + 'px,' + from.y + 'px) translate(-50%,-50%) scale(' + scaleA + ')' },
        { transform: 'translate(' + mid.x + 'px,' + mid.y + 'px) translate(-50%,-50%) scale(' + scaleB + ')', offset: 0.5 },
        { transform: 'translate(' + to.x + 'px,' + to.y + 'px) translate(-50%,-50%) scale(' + scaleC + ')' }
      ];
    }
    var easing = 'cubic-bezier(.45,0,.55,1)';

    for (var i = 1; i <= 4; i += 1) {
      var trail = spawn('fx-orb fx-trail fx-' + kind, 0, 0);
      trail.style.opacity = String(0.55 - i * 0.1);
      trail.animate(frames(0.4, 0.8 - i * 0.1, 0.5), { duration: duration, delay: i * 35, easing: easing, fill: 'both' });
      removeLater(trail, duration + i * 35 + 30);
    }

    var anim = orb.animate(frames(0.6, 1.15, 0.9), { duration: duration, easing: easing, fill: 'forwards' });
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        if (orb.parentNode) orb.parentNode.removeChild(orb);
        resolve();
      }
      anim.onfinish = finish;
      global.setTimeout(finish, duration + 150);
    });
  }

  /* Onda expansiva + particulas que salen disparadas. */
  function burst(x, y, kind, count) {
    if (reduced()) return;
    var ring = spawn('fx-ring fx-' + kind, x, y);
    removeLater(ring, 650);
    count = count || 10;
    for (var i = 0; i < count; i += 1) {
      var p = spawn('fx-particle fx-' + kind, x, y);
      if (!canAnimate(p)) { p.remove(); continue; }
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      var dist = 36 + Math.random() * 42;
      p.animate([
        { transform: 'translate(-50%,-50%) translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) translate(' + (Math.cos(angle) * dist) + 'px,' + (Math.sin(angle) * dist) + 'px) scale(0.2)', opacity: 0 }
      ], { duration: 520 + Math.random() * 160, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
      removeLater(p, 750);
    }
  }

  /* Chispas que suben (curacion). */
  function sparkles(x, y, kind) {
    if (reduced()) return;
    var glyphs = ['✦', '+', '✧', '+'];
    for (var i = 0; i < 9; i += 1) {
      var s = spawn('fx-spark fx-' + (kind || 'heal'), x + (Math.random() - 0.5) * 60, y + 10);
      s.textContent = glyphs[i % glyphs.length];
      if (!canAnimate(s)) { s.remove(); continue; }
      s.animate([
        { transform: 'translate(-50%,-50%) translateY(0) scale(0.6)', opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%,-50%) translateY(' + (-50 - Math.random() * 45) + 'px) scale(1.1)', opacity: 0 }
      ], { duration: 800 + Math.random() * 300, delay: i * 45, easing: 'ease-out', fill: 'both' });
      removeLater(s, 1400);
    }
  }

  function shake(elm, big) {
    if (!elm || reduced()) return;
    elm.classList.remove('fx-shake', 'fx-shake-big');
    void elm.offsetWidth;
    elm.classList.add(big ? 'fx-shake-big' : 'fx-shake');
    global.setTimeout(function () { elm.classList.remove('fx-shake', 'fx-shake-big'); }, 520);
  }

  /* Destello de color sobre un rectangulo de pantalla (p. ej. la ficha de un jugador). */
  function flashRect(rect, kind) {
    var f = spawn('fx-flash fx-' + kind, rect.left, rect.top);
    f.style.width = rect.width + 'px';
    f.style.height = rect.height + 'px';
    removeLater(f, 650);
  }

  function vignette(kind) {
    var v = spawn('fx-vignette fx-' + kind, 0, 0);
    removeLater(v, 750);
  }

  function bannerHost() {
    var host = doc.getElementById('fx-banners');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'fx-banners';
      layer().appendChild(host);
    }
    return host;
  }

  /* Cartel que baja desde arriba, se queda un momento y se va. Se apilan si hay varios. */
  function banner(html, kind, ms) {
    ms = ms || 2600;
    var b = doc.createElement('div');
    b.className = 'fx-banner fx-' + (kind || 'info');
    b.innerHTML = html;
    b.style.animationDuration = ms + 'ms';
    bannerHost().appendChild(b);
    removeLater(b, ms + 50);
  }

  /* Nombre de la jugada que "salta" (DUO!, TERCIA!...). */
  function comboPop(x, y, text, sub, kind) {
    var n = spawn('fx-combo fx-' + (kind || 'attack'), x, y,
      '<span class="fx-combo-main"></span>' + (sub ? '<span class="fx-combo-sub"></span>' : ''));
    n.querySelector('.fx-combo-main').textContent = text;
    if (sub) n.querySelector('.fx-combo-sub').textContent = sub;
    removeLater(n, 1300);
  }

  /*
   * Las cartas jugadas se juntan en un punto y se fusionan en un estallido.
   * snapshots: [{ rect, html }] capturados ANTES de re-renderizar (en ese momento las cartas
   * reales ya no existen en la mano). Resuelve con el punto de fusion, desde donde luego sale
   * el orbe de ataque/curacion.
   */
  function mergeCards(snapshots, kind) {
    if (!snapshots || !snapshots.length) return Promise.resolve(null);
    var cx = 0;
    var cy = 0;
    snapshots.forEach(function (s) {
      cx += s.rect.left + s.rect.width / 2;
      cy += s.rect.top + s.rect.height / 2;
    });
    cx /= snapshots.length;
    cy /= snapshots.length;
    var point = { x: cx, y: cy - 20 };
    if (reduced()) return Promise.resolve(point);

    var n = snapshots.length;
    var duration = 560;
    snapshots.forEach(function (s, i) {
      var holder = doc.createElement('div');
      holder.innerHTML = s.html;
      var card = holder.firstElementChild;
      if (!card) return;
      card.classList.remove('deal-in', 'link-in', 'linked-join');
      card.classList.add('fx-card-clone');
      card.style.animationDelay = '';
      card.style.margin = '0';
      card.style.left = s.rect.left + 'px';
      card.style.top = s.rect.top + 'px';
      card.style.width = s.rect.width + 'px';
      card.style.height = s.rect.height + 'px';
      layer().appendChild(card);
      if (typeof card.animate !== 'function') { card.remove(); return; }
      var tx = point.x - (s.rect.left + s.rect.width / 2);
      var ty = point.y - (s.rect.top + s.rect.height / 2);
      var tilt = (i - (n - 1) / 2) * 9;
      card.animate([
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: 'translate(' + (tx * 0.15) + 'px,' + (ty * 0.15 - 18) + 'px) rotate(' + (-tilt * 0.4) + 'deg) scale(1.06)', opacity: 1, offset: 0.25 },
        { transform: 'translate(' + tx + 'px,' + ty + 'px) rotate(' + tilt + 'deg) scale(0.72)', opacity: 1, offset: 0.72 },
        { transform: 'translate(' + tx + 'px,' + ty + 'px) rotate(0deg) scale(0.2)', opacity: 0 }
      ], { duration: duration, easing: 'cubic-bezier(.5,0,.5,1)', fill: 'forwards' });
      removeLater(card, duration + 60);
    });

    return wait(duration * 0.72).then(function () {
      var core = spawn('fx-core fx-' + kind, point.x, point.y);
      removeLater(core, 600);
      burst(point.x, point.y, kind, 12);
      return wait(duration * 0.28).then(function () { return point; });
    });
  }

  /* Monstruo gigante en el centro de la pantalla para resolver un combate. */
  function monsterStage(icon, name, hp) {
    var st = spawn('fx-stage', 0, 0,
      '<div class="fx-stage-icon"></div><div class="fx-stage-name"></div><div class="fx-stage-label"></div>');
    st.querySelector('.fx-stage-icon').textContent = icon;
    st.querySelector('.fx-stage-name').textContent = name + (hp ? ' · ' + hp + ' HP' : '');
    var iconEl = st.querySelector('.fx-stage-icon');
    var labelEl = st.querySelector('.fx-stage-label');

    function setLabel(text, kind) {
      labelEl.textContent = text;
      labelEl.className = 'fx-stage-label show fx-' + kind;
    }

    return {
      center: function () { return centerOf(iconEl); },
      hit: function () { shake(iconEl, true); },
      defeat: function () {
        iconEl.classList.add('fx-stage-defeat');
        var c = centerOf(iconEl);
        burst(c.x, c.y, 'gold', 18);
        setLabel('¡Derrotado!', 'gold');
      },
      resist: function (dealt) {
        iconEl.classList.add('fx-stage-resist');
        setLabel('Resiste' + (dealt !== undefined ? ' (' + dealt + ' de dano)' : ''), 'dmg');
      },
      flee: function () {
        setLabel('Huiste', 'info');
      },
      remove: function () {
        st.classList.add('fx-stage-out');
        removeLater(st, 400);
      }
    };
  }

  global.VA_FX = {
    reduced: reduced,
    wait: wait,
    centerOf: centerOf,
    floatText: floatText,
    projectile: projectile,
    burst: burst,
    sparkles: sparkles,
    shake: shake,
    flashRect: flashRect,
    vignette: vignette,
    banner: banner,
    comboPop: comboPop,
    mergeCards: mergeCards,
    monsterStage: monsterStage
  };
})(window);
