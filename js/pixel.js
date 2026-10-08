/* Arte pixel: palos de la baraja dibujados pixel a pixel y "sprites" generados a partir de
   los emoji del juego (se dibujan en un lienzo diminuto, se recortan a pixeles duros con
   paleta reducida y contorno oscuro, y luego se amplian sin suavizado). Sin logica de juego. */
(function (global) {
  'use strict';

  var doc = global.document;

  /* Mapas de bits de los palos: '#' = pixel pintado. */
  var SUIT_BITMAPS = {
    corazones: [
      '.##.##.',
      '#######',
      '#######',
      '#######',
      '.#####.',
      '..###..',
      '...#...'
    ],
    diamantes: [
      '...#...',
      '..###..',
      '.#####.',
      '#######',
      '.#####.',
      '..###..',
      '...#...'
    ],
    picas: [
      '...#...',
      '..###..',
      '.#####.',
      '#######',
      '#######',
      '##.#.##',
      '...#...',
      '..###..'
    ],
    treboles: [
      '..###..',
      '.#####.',
      '..###..',
      '#######',
      '#######',
      '##.#.##',
      '...#...',
      '..###..'
    ]
  };

  var suitCache = {};

  /* SVG en linea con un rect por cada tramo horizontal de pixeles; toma el color del texto. */
  function suitSvg(suit) {
    if (suitCache[suit]) return suitCache[suit];
    var rows = SUIT_BITMAPS[suit];
    if (!rows) return '';
    var w = rows[0].length;
    var rects = '';
    rows.forEach(function (row, y) {
      var x = 0;
      while (x < w) {
        if (row.charAt(x) !== '#') { x += 1; continue; }
        var start = x;
        while (x < w && row.charAt(x) === '#') x += 1;
        rects += '<rect x="' + start + '" y="' + y + '" width="' + (x - start) + '" height="1"/>';
      }
    });
    var svg = '<svg class="px-suit" viewBox="0 0 ' + w + ' ' + rows.length + '" style="--rows:' + rows.length + '"' +
      ' shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">' + rects + '</svg>';
    suitCache[suit] = svg;
    return svg;
  }

  var spriteCache = {};
  var OUTLINE = [12, 10, 24];

  /* Dibuja el emoji en un lienzo de grid x grid pixeles y lo convierte a pixel art:
     alfa binario, colores reducidos a pocos niveles y contorno oscuro de 1 pixel.
     Devuelve un data URL, o null si el navegador no puede dibujarlo (sin emoji a color). */
  function spriteUrl(emoji, grid) {
    var key = emoji + '|' + grid;
    if (key in spriteCache) return spriteCache[key];
    var url = null;
    try {
      var size = grid + 2;
      var canvas = doc.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = Math.round(grid * 0.86) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(emoji, size / 2, size / 2 + grid * 0.06);
      var img = ctx.getImageData(0, 0, size, size);
      var d = img.data;
      var solid = new Uint8Array(size * size);
      var colored = 0;
      var i;
      for (i = 0; i < size * size; i += 1) {
        var o = i * 4;
        if (d[o + 3] >= 110) {
          solid[i] = 1;
          var r = d[o];
          var g = d[o + 1];
          var b = d[o + 2];
          if (Math.abs(r - g) > 24 || Math.abs(g - b) > 24) colored += 1;
          d[o] = quantize(r);
          d[o + 1] = quantize(g);
          d[o + 2] = quantize(b);
          d[o + 3] = 255;
        } else {
          d[o + 3] = 0;
        }
      }
      var count = 0;
      for (i = 0; i < solid.length; i += 1) count += solid[i];
      /* Nada dibujado, o solo un glifo monocromo (sin fuente de emoji a color): se usa el texto. */
      if (count >= 4 && colored >= 3) {
        for (var y = 0; y < size; y += 1) {
          for (var x = 0; x < size; x += 1) {
            var idx = y * size + x;
            if (solid[idx]) continue;
            if ((x > 0 && solid[idx - 1]) || (x < size - 1 && solid[idx + 1]) ||
                (y > 0 && solid[idx - size]) || (y < size - 1 && solid[idx + size])) {
              var p = idx * 4;
              d[p] = OUTLINE[0]; d[p + 1] = OUTLINE[1]; d[p + 2] = OUTLINE[2]; d[p + 3] = 255;
            }
          }
        }
        ctx.putImageData(img, 0, 0);
        url = canvas.toDataURL('image/png');
      }
    } catch (e) {
      url = null;
    }
    spriteCache[key] = url;
    return url;
  }

  function quantize(v) {
    var step = 255 / 5;
    return Math.max(0, Math.min(255, Math.round(Math.round(v / step) * step)));
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* HTML de un sprite. size: 'sm' (fichas, carteles), 'md' (ventanas), 'lg' (monstruo en escena).
     Si no se puede generar, devuelve el emoji como texto para que nunca falte el icono. */
  var GRIDS = { sm: 16, md: 18, lg: 26 };
  function sprite(emoji, size) {
    size = size || 'sm';
    var url = spriteUrl(emoji, GRIDS[size] || 16);
    if (!url) return '<span class="px-emoji px-' + size + '" aria-hidden="true">' + escapeAttr(emoji) + '</span>';
    return '<img class="px-sprite px-' + size + '" src="' + url + '" alt="" aria-hidden="true" draggable="false">';
  }

  global.VA_PIXEL = {
    suitSvg: suitSvg,
    sprite: sprite
  };
})(window);
