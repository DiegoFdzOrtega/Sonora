/*
 * Iconos SVG dibujados a mano (sin librerías de iconos).
 * Cualquier elemento con  data-icono="nombre"  se rellena con su dibujo.
 */
(function () {
  'use strict';

  const trazos = {
    onda:       '<path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0"/>',
    biblioteca: '<path d="M4 4v16M9 4v16M14 5l5 15"/>',
    nota:       '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    eq:         '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    micro:      '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
    camara:     '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    pantalla:   '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    mas:        '<path d="M12 5v14M5 12h14"/>',
    luna:       '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sol:        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    teclado:    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M7 14h10"/>',
    lupa:       '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
    subir:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    descargar:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    cc:         '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/>',
    expandir:   '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    aleatorio:  '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    anterior:   '<path d="M19 20L9 12l10-8v16zM5 19V5"/>',
    siguiente:  '<path d="M5 4l10 8-10 8V4zM19 5v14"/>',
    play:       '<path d="M7 4l13 8-13 8V4z" fill="currentColor"/>',
    pausa:      '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
    repetir:    '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
    repetirUna: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10h1v5"/>',
    mini:       '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor"/>',
    volumen:    '<path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    silencio:   '<path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>',
    papelera:   '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    ondaWav:    '<path d="M2 12h3l2-6 3 12 3-9 2 6 2-3h5"/>',
    corazon:    '<path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2 4.5 5.6 4c2-.3 3.8.6 4.9 2.1C11.6 4.6 13.4 3.7 15.4 4 19 4.5 20.6 8.3 19 11.7 16.5 16.4 12 21 12 21z"/>',
    corazonLleno: '<path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2 4.5 5.6 4c2-.3 3.8.6 4.9 2.1C11.6 4.6 13.4 3.7 15.4 4 19 4.5 20.6 8.3 19 11.7 16.5 16.4 12 21 12 21z" fill="currentColor"/>',
    disco:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
    persona:    '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    volver:     '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    ordenar:    '<path d="M3 6h12M3 12h8M3 18h4M18 4v16M18 4l-4 4M18 4l4 4"/>',
    ajustes:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/>'
  };

  /** Devuelve el SVG de un icono como texto. */
  window.icono = function (nombre) {
    const t = trazos[nombre] || '';
    return '<svg class="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + t + '</svg>';
  };

  /** Rellena todos los data-icono que haya dentro de un elemento. */
  window.pintarIconos = function (raiz) {
    (raiz || document).querySelectorAll('[data-icono]').forEach(el => {
      el.innerHTML = window.icono(el.dataset.icono);
    });
  };
})();
