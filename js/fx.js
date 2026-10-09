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

  /* Monstruo gigante en el centro de la pantalla para resolver un combate. `icon` puede ser
     un emoji o el SVG de wormSvg(). */
  function monsterStage(icon, name, hp) {
    var st = spawn('fx-stage', 0, 0,
      '<div class="fx-stage-icon"></div><div class="fx-stage-name"></div><div class="fx-stage-label"></div>');
    if (icon.charAt(0) === '<') {
      st.querySelector('.fx-stage-icon').innerHTML = icon;
      st.classList.add('fx-stage-creature');
    } else if (global.VA_PIXEL) {
      st.querySelector('.fx-stage-icon').innerHTML = global.VA_PIXEL.sprite(icon, 'lg');
    } else {
      st.querySelector('.fx-stage-icon').textContent = icon;
    }
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
      resist: function (dealt, hpLeft) {
        iconEl.classList.add('fx-stage-resist');
        if (hpLeft) setLabel('Resiste: le quedan ' + hpLeft + ' HP', 'dmg');
        else setLabel('Resiste' + (dealt !== undefined ? ' (' + dealt + ' de dano)' : ''), 'dmg');
      },
      flee: function () {
        setLabel('Huiste', 'info');
      },
      label: setLabel,
      /* Cambia la expresion del gusano: 'beg', 'happy' o 'angry'. */
      mood: function (m) {
        var w = st.querySelector('.worm');
        if (w) w.setAttribute('class', 'worm ' + m);
      },
      lunge: function () {
        iconEl.classList.remove('fx-stage-lunge');
        void iconEl.offsetWidth;
        iconEl.classList.add('fx-stage-lunge');
      },
      remove: function () {
        st.classList.add('fx-stage-out');
        removeLater(st, 400);
      }
    };
  }

  /*
   * Gusano Suplicante: gusano rosado con cara humana y bracitos, saliendo de un monticulo de
   * tierra. Un solo dibujo con tres expresiones; la clase del <svg> elige cual se ve
   * ('beg' suplica llorando, 'happy' comio, 'angry' furioso). Las animaciones estan en CSS.
   */
  var wormSeq = 0;
  function wormSvg(mood, extraClass) {
    wormSeq += 1;
    var clip = 'worm-clip-' + wormSeq;
    var body = 'M100 222 C 84 190, 118 166, 102 136 S 95 110, 100 100';
    return '' +
      '<svg class="worm ' + (mood || 'beg') + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 200 236" shape-rendering="crispEdges" role="img" aria-label="Gusano con rostro humano">' +
        '<defs><clipPath id="' + clip + '"><path d="M0 0 H200 V212 H144 A44 7 0 0 1 56 212 H0 Z"/></clipPath></defs>' +
        /* Monticulo y agujero detras: el cuerpo sale DEL agujero, recortado por su borde delantero */
        '<ellipse class="w-mound" cx="100" cy="218" rx="74" ry="17"/>' +
        '<ellipse class="w-mound-top" cx="100" cy="212" rx="44" ry="7"/>' +
        '<g class="w-hearts">' +
          '<path d="M40 42 c-6 -8 -18 -2 -12 8 l12 12 l12 -12 c6 -10 -6 -16 -12 -8z"/>' +
          '<path d="M158 30 c-5 -6 -14 -1 -9 6 l9 9 l9 -9 c5 -7 -4 -12 -9 -6z"/>' +
        '</g>' +
        '<g class="w-steam">' +
          '<circle cx="46" cy="56" r="9"/><circle cx="36" cy="40" r="6.5"/>' +
          '<circle cx="154" cy="56" r="9"/><circle cx="164" cy="40" r="6.5"/>' +
        '</g>' +
        '<g clip-path="url(#' + clip + ')"><g class="w-rise"><g class="w-upper">' +
          '<path class="w-outline" d="' + body + '" stroke-width="46" stroke-linecap="round" fill="none"/>' +
          '<path class="w-body" d="' + body + '" stroke-width="40" stroke-linecap="round" fill="none"/>' +
          '<path class="w-rings" d="' + body + '" stroke-width="40" stroke-dasharray="3 11" fill="none"/>' +
          '<path class="w-sheen" d="' + body + '" stroke-width="7" stroke-linecap="round" fill="none" transform="translate(-10 0)"/>' +
          '<g class="w-arm w-arm-l">' +
            '<path class="w-limb" d="M86 128 q -14 -2 -21 -15" stroke-width="5.5" stroke-linecap="round" fill="none"/>' +
            '<circle class="w-skin" cx="64" cy="110" r="5.5"/>' +
            '<path class="w-finger" d="M61 106 l-3 -5 M64 104.5 l0 -6 M67 106 l3 -5" stroke-width="2.4" stroke-linecap="round"/>' +
          '</g>' +
          '<g class="w-arm w-arm-r">' +
            '<path class="w-limb" d="M114 128 q 14 -2 21 -15" stroke-width="5.5" stroke-linecap="round" fill="none"/>' +
            '<circle class="w-skin" cx="136" cy="110" r="5.5"/>' +
            '<path class="w-finger" d="M133 106 l-3 -5 M136 104.5 l0 -6 M139 106 l3 -5" stroke-width="2.4" stroke-linecap="round"/>' +
          '</g>' +
          '<g class="w-head">' +
            '<ellipse class="w-outline-fill" cx="100" cy="72" rx="45" ry="47"/>' +
            '<ellipse class="w-skin" cx="57" cy="75" rx="7" ry="10"/>' +
            '<ellipse class="w-skin" cx="143" cy="75" rx="7" ry="10"/>' +
            '<ellipse class="w-skin w-face" cx="100" cy="72" rx="42" ry="44"/>' +
            '<path class="w-hair" d="M92 30 q -5 -10 2 -17 M100 28 q 3 -12 -3 -19 M108 30 q 7 -9 2 -16" fill="none" stroke-width="2"/>' +
            '<path class="w-wrinkle" d="M84 40 q 16 -5 32 0 M88 46 q 12 -3 24 0" fill="none" stroke-width="1.4"/>' +
            /* Ojos abiertos (suplica / furia) */
            '<g class="w-eyes-open">' +
              '<ellipse class="w-eye" cx="84" cy="68" rx="10" ry="8.5"/><ellipse class="w-eye" cx="116" cy="68" rx="10" ry="8.5"/>' +
              '<circle class="w-pupil" cx="84" cy="66" r="4.2"/><circle class="w-pupil" cx="116" cy="66" r="4.2"/>' +
              '<circle class="w-glint" cx="85.8" cy="64" r="1.4"/><circle class="w-glint" cx="117.8" cy="64" r="1.4"/>' +
            '</g>' +
            /* Ojos felices (^ ^) */
            '<path class="w-eyes-happy" d="M75 70 q 9 -10 18 0 M107 70 q 9 -10 18 0" fill="none" stroke-width="3.2" stroke-linecap="round"/>' +
            /* Cejas */
            '<path class="w-brow w-only-beg" d="M72 57 Q 82 54 93 48 M107 48 Q 118 54 128 57" fill="none" stroke-width="3.4" stroke-linecap="round"/>' +
            '<path class="w-brow w-only-happy" d="M73 54 Q 83 48 93 53 M107 53 Q 117 48 127 54" fill="none" stroke-width="3" stroke-linecap="round"/>' +
            '<path class="w-brow w-only-angry" d="M71 49 Q 82 52 94 60 M106 60 Q 118 52 129 49" fill="none" stroke-width="4.2" stroke-linecap="round"/>' +
            '<path class="w-nose" d="M100 72 q -6 10 -1 13 q 4 1.5 7 -1.5" fill="none" stroke-width="2"/>' +
            '<ellipse class="w-blush w-only-happy" cx="72" cy="86" rx="8" ry="4.5"/><ellipse class="w-blush w-only-happy" cx="128" cy="86" rx="8" ry="4.5"/>' +
            /* Bocas */
            '<path class="w-mouth w-only-beg" d="M85 101 q 15 -14 30 0 q -15 7 -30 0z"/>' +
            '<path class="w-mouth w-only-happy" d="M80 92 q 20 22 40 0 q -20 7 -40 0z"/>' +
            '<path class="w-tongue w-only-happy" d="M93 100 q 7 6 14 0 q -7 -3 -14 0z"/>' +
            '<rect class="w-mouth w-only-angry" x="81" y="92" width="38" height="14" rx="4"/>' +
            '<path class="w-teeth w-only-angry" d="M83 94 h34 v4 l-3.4 3 l-3.4 -3 l-3.4 3 l-3.4 -3 l-3.4 3 l-3.4 -3 l-3.4 3 l-3.4 -3 l-3.4 3 l-3.4 -3z"/>' +
            /* Vena de enojo en la frente */
            '<path class="w-vein w-only-angry" d="M120 36 q 6 2 6 8 M134 36 q -6 2 -6 8 M120 52 q 6 -2 6 -8 M134 52 q -6 -2 -6 -8" fill="none" stroke-width="2.6" stroke-linecap="round"/>' +
            /* Lagrimas */
            '<path class="w-tear w-tear-l" d="M78 78 q 4 7 0 10 q -4 -3 0 -10z"/>' +
            '<path class="w-tear w-tear-r" d="M122 78 q 4 7 0 10 q -4 -3 0 -10z"/>' +
          '</g>' +
        '</g></g></g>' +
        '<g class="w-dirt"><circle cx="54" cy="214" r="3"/><circle cx="142" cy="220" r="2.5"/><circle cx="74" cy="226" r="2"/><circle cx="128" cy="208" r="2"/><circle cx="160" cy="214" r="2.2"/></g>' +
      '</svg>';
  }

  /* Monedas que vuelan de un punto a otro, una detras de otra. Resuelve cuando llega la ultima. */
  function coins(from, to, count) {
    if (!from || !to) return Promise.resolve();
    count = Math.max(1, Math.min(count || 1, 9));
    if (reduced()) return Promise.resolve();
    var duration = 520;
    var stagger = 70;
    for (var i = 0; i < count; i += 1) {
      var c = spawn('fx-coin-fly', 0, 0);
      c.textContent = '🪙';
      if (!canAnimate(c)) { c.remove(); continue; }
      var jx = (Math.random() - 0.5) * 40;
      var midX = (from.x + to.x) / 2 + jx;
      var midY = Math.min(from.y, to.y) - 60 - Math.random() * 40;
      c.animate([
        { transform: 'translate(' + from.x + 'px,' + from.y + 'px) translate(-50%,-50%) scale(0.7) rotate(0deg)', opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { transform: 'translate(' + midX + 'px,' + midY + 'px) translate(-50%,-50%) scale(1.1) rotate(200deg)', offset: 0.5 },
        { transform: 'translate(' + to.x + 'px,' + to.y + 'px) translate(-50%,-50%) scale(0.5) rotate(400deg)', opacity: 0.2 }
      ], { duration: duration, delay: i * stagger, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
      removeLater(c, duration + i * stagger + 60);
    }
    return wait(duration + (count - 1) * stagger);
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
    monsterStage: monsterStage,
    wormSvg: wormSvg,
    coins: coins
  };
})(window);
