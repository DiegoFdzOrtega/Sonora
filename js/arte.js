/*
 * ============================================================
 *  Arte generativo  ·  "carátulas" bonitas cuando no hay una real
 * ============================================================
 *  Cuando una canción no trae carátula dentro del archivo, en vez de
 *  poner una letra sobre un cuadrado de color liso, dibujamos un
 *  pequeño SVG distinto para cada canción/álbum/artista: un atardecer,
 *  una luna con estrellas, un remolino, unas olas o unos anillos.
 *
 *  Siempre es el MISMO dibujo para el mismo texto (mismo título,
 *  mismo álbum...), porque el color y el dibujo salen de una "huella"
 *  calculada a partir de las letras de ese texto (una función hash).
 * ============================================================
 */
(function (global) {
  'use strict';

  /** Convierte un texto en un número entero, siempre igual para el mismo texto. */
  function huella(texto) {
    let h = 0;
    const s = String(texto || '');
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
    return h;
  }

  const color = (h, s, l) => 'hsl(' + Math.round(((h % 360) + 360) % 360) + ' ' + s + '% ' + l + '%)';

  const PATRONES = ['atardecer', 'luna', 'remolino', 'olas', 'anillos'];

  /** El dibujo en sí, en un lienzo de 100x100. */
  function dibujar(tipo, tono) {
    const claro = color(tono + 14, 90, 82);
    const medio = color(tono + 40, 80, 50);
    switch (tipo) {
      case 'atardecer':
        return (
          '<circle cx="50" cy="60" r="22" fill="' + claro + '"/>' +
          '<rect x="0" y="66" width="100" height="34" fill="' + color(tono + 190, 55, 14) + '" opacity=".5"/>' +
          '<path d="M0 76h100M0 85h100M0 94h100" stroke="' + color(tono + 190, 55, 10) + '" stroke-width="3" opacity=".5"/>'
        );
      case 'luna':
        return (
          '<circle cx="60" cy="36" r="19" fill="' + claro + '"/>' +
          '<circle cx="52" cy="30" r="19" fill="' + medio + '"/>' +
          '<circle cx="20" cy="72" r="2" fill="' + claro + '"/><circle cx="33" cy="18" r="1.6" fill="' + claro + '"/>' +
          '<circle cx="80" cy="76" r="1.6" fill="' + claro + '"/><circle cx="13" cy="42" r="1.3" fill="' + claro + '"/>'
        );
      case 'remolino':
        return [0, 1, 2, 3, 4].map(i =>
          '<circle cx="50" cy="50" r="' + (9 + i * 9) + '" fill="none" stroke="' + color(tono + i * 24, 80, 62 - i * 5) +
          '" stroke-width="5" opacity="' + (0.95 - i * 0.14) + '"/>').join('');
      case 'olas':
        return [0, 1, 2, 3].map(i =>
          '<path d="M-10 ' + (18 + i * 22) + ' Q 25 ' + (4 + i * 22) + ' 50 ' + (18 + i * 22) +
          ' T 110 ' + (18 + i * 22) + '" fill="none" stroke="' + color(tono + i * 16, 80, 68) +
          '" stroke-width="6" opacity="' + (0.9 - i * 0.16) + '"/>').join('');
      default: // anillos
        return (
          '<circle cx="50" cy="50" r="33" fill="none" stroke="' + claro + '" stroke-width="10" opacity=".85"/>' +
          '<circle cx="50" cy="50" r="17" fill="' + medio + '"/>'
        );
    }
  }

  /**
   * Genera una "carátula" en SVG a partir de un texto cualquiera
   * (título + artista, nombre de álbum, nombre de artista...).
   * Devuelve { svg, tono }: el dibujo listo y el tono de color (0-360)
   * que ha salido, para poder reutilizarlo en otras partes (como el
   * fondo ambiental, que coge el color de lo que está sonando).
   */
  global.arteGenerativo = function (semilla) {
    const h = huella(semilla);
    const tono = h % 360;
    const tipo = PATRONES[h % PATRONES.length];
    const fondoA = color(tono, 55, 26);
    const fondoB = color(tono + 55, 60, 15);
    const svg =
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
      '<defs><linearGradient id="g' + h + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + fondoA + '"/><stop offset="1" stop-color="' + fondoB + '"/></linearGradient></defs>' +
      '<rect width="100" height="100" fill="url(#g' + h + ')"/>' +
      dibujar(tipo, tono) +
      '</svg>';
    return { svg, tono };
  };
})(typeof window !== 'undefined' ? window : globalThis);
