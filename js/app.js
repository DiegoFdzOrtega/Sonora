/*
 * ============================================================
 *  diegofo | sonora  ·  Aplicación del reproductor
 *  Autor: Diego Fernández Ortega  ·  DAM · Multimedia · RA3
 * ============================================================
 *  Este archivo maneja la INTERFAZ (botones, listas, vistas).
 *  Todo lo técnico de audio y vídeo lo hace la librería Onda.js
 *  (js/onda/onda.js), que se carga antes que este archivo.
 * ============================================================
 */
(function () {
  'use strict';

  /* ---------- Atajos para buscar elementos del HTML ---------- */
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  /* ---------- Elementos multimedia ----------
   * Hay DOS <audio> para el fundido: mientras uno baja, el otro sube.
   * El <video> es el que se ve en la vista "Reproduciendo".
   */
  const audioA = $('#audioA');
  const audioB = $('#audioB');
  const video = $('#video');
  const ELEMENTOS = [audioA, audioB, video];

  /* ---------- Piezas de la librería Onda.js ---------- */
  const motor = new Onda.MotorAudio();
  const grabadora = new Onda.Grabadora();
  let colorAcento = '#ef7b45';
  const visualizador = new Onda.Visualizador($('#visualizador'), motor, () => colorAcento);

  /* ---------- Estado: toda la información de la app en un objeto ---------- */
  const estado = {
    pistas: [],          // { id, archivo, url, tipo, titulo, artista, album, anio, caratula, letraPlana, lrc, subtitulos, duracion, base }
    actualId: null,      // id de la pista que suena
    elActivo: null,      // qué elemento (<audio> o <video>) está sonando
    historial: [],       // ids reproducidos antes (para el botón "anterior")
    cola: [],            // ids de la lista que se está reproduciendo ahora (una búsqueda, un álbum, favoritos...)
    siguienteId: 1,
    aleatorio: false,
    repetir: 'no',       // 'no' | 'todo' | 'una'
    fundido: 0,          // segundos de fundido entre canciones
    velocidad: 1,
    volumen: 0.8,
    silenciado: false,
    filtro: 'todo',
    orden: 'reciente',   // 'reciente' | 'titulo' | 'artista' | 'duracion'
    busqueda: '',
    vista: 'biblioteca',
    subvista: 'canciones',    // 'canciones' | 'albumes' | 'artistas' | 'favoritos'
    albumAbierto: null,       // clave del álbum que se está viendo en detalle
    artistaAbierto: null,     // clave del artista que se está viendo en detalle
    favoritos: new Set(),     // "huellas" (artista|título) de las canciones y vídeos favoritos
    arrastrandoProgreso: false,
    cruzando: false,
    lineaLetra: -1,
    tema: 'oscuro'
  };

  /* ============================================================
   * UTILIDADES
   * ============================================================ */

  /** Muestra un mensajito en la esquina durante 4 segundos. */
  function aviso(texto, esError = false) {
    const div = document.createElement('div');
    div.className = 'aviso' + (esError ? ' aviso--error' : '');
    div.textContent = texto;
    $('#avisos').appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  /** Hace que el navegador descargue un Blob con un nombre. */
  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const nombreBase = nombre => nombre.replace(/\.[^.]+$/, '').toLowerCase();
  const nombreSeguro = texto => (texto || 'archivo').replace(/[\\/:*?"<>|]+/g, '').trim() || 'archivo';
  const buscar = id => estado.pistas.find(p => p.id === id) || null;
  const pistaActual = () => buscar(estado.actualId);
  const indiceDe = id => estado.pistas.findIndex(p => p.id === id);

  /** Duración real: la del elemento si la sabe, si no la que leímos al importar. */
  function duracionActual() {
    const el = estado.elActivo;
    if (el && isFinite(el.duration) && el.duration > 0) return el.duration;
    const p = pistaActual();
    return p && isFinite(p.duracion) ? p.duracion : 0;
  }

  /** Pinta la parte "llena" de una barra deslizante. */
  function pintarRango(input) {
    const min = +input.min || 0, max = +input.max || 100;
    const porcentaje = ((+input.value - min) / (max - min)) * 100;
    input.style.setProperty('--llenado', porcentaje + '%');
  }

  /**
   * Pone la carátula en un elemento de una pista. Si el archivo trae una
   * carátula de verdad, se usa esa. Si no, se dibuja un "arte generativo"
   * (un atardecer, una luna, un remolino...) distinto para cada canción,
   * en vez de dejar un cuadrado de color liso. Cuando no hay ninguna
   * pista (nada sonando todavía), se deja solo un icono pequeño.
   */
  function ponerCaratula(el, pista) {
    if (pista && pista.caratula) {
      el.style.backgroundImage = 'url("' + pista.caratula + '")';
      el.classList.add('con-imagen');
      el.innerHTML = '';
    } else if (pista) {
      el.style.backgroundImage = '';
      el.classList.remove('con-imagen');
      el.innerHTML = arteGenerativo(pista.titulo + '|' + pista.artista).svg;
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('con-imagen');
      el.innerHTML = icono('nota');
    }
  }

  /** Igual que ponerCaratula, pero para un grupo (álbum o artista). */
  function ponerCaratulaGrupo(el, grupo) {
    if (grupo.caratula) {
      el.style.backgroundImage = 'url("' + grupo.caratula + '")';
      el.classList.add('con-imagen');
      el.innerHTML = '';
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('con-imagen');
      el.innerHTML = arteGenerativo(grupo.album || grupo.artista).svg;
    }
  }

  /** El "tono" de color (0-360) que le toca a una pista, para pintar el fondo ambiental a juego. */
  function huePista(pista) {
    return arteGenerativo(pista ? (pista.titulo + '|' + pista.artista) : 'sonora').tono;
  }

  /** Cambia el color de fondo de la pantalla según lo que está sonando (como un "mood lighting"). */
  function actualizarAmbiente() {
    document.documentElement.style.setProperty('--amb-hue', huePista(pistaActual()));
  }

  /* ============================================================
   * FAVORITOS (localStorage)
   * Se guarda la "huella" (artista + título) de cada favorito, no
   * el archivo en sí (eso no se puede guardar), así que si vuelves
   * a importar la misma canción, sigue marcada como favorita.
   * ============================================================ */
  const CLAVE_FAVORITOS = 'sonora.favoritos';
  const huellaPista = p => ((p.artista || '') + '|' + (p.titulo || '')).toLowerCase();
  const esFavorito = p => estado.favoritos.has(huellaPista(p));

  function guardarFavoritosGuardados() {
    try { localStorage.setItem(CLAVE_FAVORITOS, JSON.stringify([...estado.favoritos])); }
    catch (e) { /* modo privado o almacenamiento bloqueado: no pasa nada */ }
  }
  function leerFavoritosGuardados() {
    try { return JSON.parse(localStorage.getItem(CLAVE_FAVORITOS)) || []; }
    catch (e) { return []; }
  }

  function toggleFavorito(id) {
    const p = buscar(id);
    if (!p) return;
    const h = huellaPista(p);
    if (estado.favoritos.has(h)) { estado.favoritos.delete(h); aviso('Quitado de favoritos.'); }
    else { estado.favoritos.add(h); aviso('Añadido a favoritos.'); }
    guardarFavoritosGuardados();
    pintarSubvista();
    actualizarFavoritoPistaActual();
  }

  function actualizarFavoritoPistaActual() {
    const p = pistaActual();
    const favorito = p ? esFavorito(p) : false;
    [$('#btnFavoritoGrande'), $('#btnFavoritoMini')].forEach(boton => {
      boton.classList.toggle('activo', favorito);
      boton.innerHTML = icono(favorito ? 'corazonLleno' : 'corazon');
      boton.title = favorito ? 'Quitar de favoritos (L)' : 'Añadir a favoritos (L)';
      boton.setAttribute('aria-label', boton.title);
      boton.disabled = !p;
    });
  }

  /* ============================================================
   * AJUSTES GUARDADOS (localStorage)
   * Se guardan el tema, el volumen, el ecualizador, etc.
   * ============================================================ */
  const CLAVE_AJUSTES = 'sonora.ajustes';

  function guardarAjustes() {
    try {
      localStorage.setItem(CLAVE_AJUSTES, JSON.stringify({
        tema: estado.tema,
        volumen: estado.volumen,
        eq: motor.ganancias,
        fundido: estado.fundido,
        normalizar: motor.normalizar,
        aleatorio: estado.aleatorio,
        repetir: estado.repetir,
        velocidad: estado.velocidad,
        orden: estado.orden
      }));
    } catch (e) { /* modo privado o almacenamiento bloqueado: no pasa nada */ }
  }

  function leerAjustes() {
    try { return JSON.parse(localStorage.getItem(CLAVE_AJUSTES)) || {}; }
    catch (e) { return {}; }
  }

  /* ============================================================
   * BIBLIOTECA GUARDADA (IndexedDB)
   * Los ajustes y los favoritos ya se guardaban, pero la biblioteca en sí
   * (los archivos importados) se perdía al refrescar la página (F5): solo
   * vivía en memoria. Aquí se guarda cada pista completa -el archivo de
   * verdad, no solo su nombre- en una base de datos del propio navegador,
   * para que siga ahí la próxima vez que abras la página.
   * ============================================================ */
  const BD_NOMBRE = 'sonora', BD_VERSION = 1, BD_ALMACEN = 'pistas';
  let promesaBD = null;

  function abrirBD() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB no disponible'));
    if (promesaBD) return promesaBD;
    promesaBD = new Promise((resolver, rechazar) => {
      const peticion = indexedDB.open(BD_NOMBRE, BD_VERSION);
      peticion.onupgradeneeded = () => {
        if (!peticion.result.objectStoreNames.contains(BD_ALMACEN)) {
          peticion.result.createObjectStore(BD_ALMACEN, { keyPath: 'id' });
        }
      };
      peticion.onsuccess = () => resolver(peticion.result);
      peticion.onerror = () => rechazar(peticion.error);
    });
    return promesaBD;
  }

  /** Descarga el contenido de una blob: URL para poder guardarlo de verdad (las URLs no sobreviven a un F5). */
  async function blobDeUrl(url) {
    if (!url) return null;
    try { return await (await fetch(url)).blob(); } catch (e) { return null; }
  }

  /** Guarda (o actualiza) una pista entera -archivo, carátula, letra, subtítulos- en la base de datos. */
  async function guardarPistaBD(pista) {
    try {
      const bd = await abrirBD();
      const [caratulaBlob, subtitulosTexto] = await Promise.all([
        blobDeUrl(pista.caratula),
        pista.subtitulos ? fetch(pista.subtitulos).then(r => r.text()).catch(() => null) : null
      ]);
      const registro = {
        id: pista.id, tipo: pista.tipo,
        archivoBlob: pista.archivo, archivoNombre: pista.archivo.name, archivoTipoMime: pista.archivo.type,
        titulo: pista.titulo, artista: pista.artista, album: pista.album, anio: pista.anio,
        duracion: pista.duracion, base: pista.base,
        caratulaBlob, letraPlana: pista.letraPlana || null, lrc: pista.lrc || null, subtitulosTexto
      };
      await new Promise((resolver, rechazar) => {
        const tx = bd.transaction(BD_ALMACEN, 'readwrite');
        tx.objectStore(BD_ALMACEN).put(registro);
        tx.oncomplete = resolver;
        tx.onerror = () => rechazar(tx.error);
      });
    } catch (e) { /* almacenamiento bloqueado (modo privado...): la pista se queda solo en memoria */ }
  }

  async function quitarPistaBD(id) {
    try {
      const bd = await abrirBD();
      await new Promise((resolver, rechazar) => {
        const tx = bd.transaction(BD_ALMACEN, 'readwrite');
        tx.objectStore(BD_ALMACEN).delete(id);
        tx.oncomplete = resolver;
        tx.onerror = () => rechazar(tx.error);
      });
    } catch (e) { /* nada que borrar o almacenamiento bloqueado */ }
  }

  /** Borra TODA la biblioteca guardada (botón "Vaciar biblioteca" de Ajustes). */
  async function vaciarBibliotecaBD() {
    try {
      const bd = await abrirBD();
      await new Promise((resolver, rechazar) => {
        const tx = bd.transaction(BD_ALMACEN, 'readwrite');
        tx.objectStore(BD_ALMACEN).clear();
        tx.oncomplete = resolver;
        tx.onerror = () => rechazar(tx.error);
      });
    } catch (e) { /* nada que borrar o almacenamiento bloqueado */ }
  }

  /** Lee toda la biblioteca guardada y la convierte de nuevo en pistas "normales" (con sus URLs recién creadas). */
  async function cargarPistasBD() {
    try {
      const bd = await abrirBD();
      const registros = await new Promise((resolver, rechazar) => {
        const tx = bd.transaction(BD_ALMACEN, 'readonly');
        const peticion = tx.objectStore(BD_ALMACEN).getAll();
        peticion.onsuccess = () => resolver(peticion.result || []);
        peticion.onerror = () => rechazar(peticion.error);
      });
      return registros.map(r => {
        const archivo = new File([r.archivoBlob], r.archivoNombre, { type: r.archivoTipoMime });
        return {
          id: r.id, archivo, url: URL.createObjectURL(archivo), tipo: r.tipo,
          titulo: r.titulo, artista: r.artista, album: r.album, anio: r.anio,
          caratula: r.caratulaBlob ? URL.createObjectURL(r.caratulaBlob) : null,
          letraPlana: r.letraPlana, lrc: r.lrc,
          subtitulos: r.subtitulosTexto ? URL.createObjectURL(new Blob([r.subtitulosTexto], { type: 'text/vtt' })) : null,
          duracion: r.duracion, base: r.base
        };
      });
    } catch (e) { return []; }
  }

  /* ============================================================
   * IMPORTAR ARCHIVOS
   * ============================================================ */
  async function importar(listaArchivos) {
    const archivos = [...listaArchivos];
    const medios = archivos.filter(a => Onda.tipoDeArchivo(a));
    const textos = archivos.filter(a => /\.(lrc|srt|vtt)$/i.test(a.name));

    if (!medios.length && !textos.length) {
      aviso('Ninguno de esos archivos es de audio, vídeo, letra o subtítulos.', true);
      return;
    }
    if (medios.length > 3) aviso('Leyendo ' + medios.length + ' archivos...');

    const nuevas = [];
    for (const archivo of medios) {
      const tipo = Onda.tipoDeArchivo(archivo);
      const etiquetas = await Onda.leerEtiquetas(archivo);   // lectura byte a byte
      const pista = {
        id: estado.siguienteId++,
        archivo,
        url: URL.createObjectURL(archivo),
        tipo,
        titulo: etiquetas.titulo,
        artista: etiquetas.artista || (tipo === 'video' ? 'Vídeo' : 'Artista desconocido'),
        album: etiquetas.album || '',
        anio: etiquetas.anio || '',
        caratula: etiquetas.caratula,
        letraPlana: etiquetas.letra,
        lrc: null,
        subtitulos: null,
        duracion: 0,
        base: nombreBase(archivo.name)
      };
      estado.pistas.push(pista);
      nuevas.push(pista);
    }

    // Las duraciones se leen todas a la vez (en paralelo) para ir más rápido.
    await Promise.all(nuevas.map(async p => { p.duracion = await Onda.leerDuracion(p.url, p.tipo); }));

    // Se guardan de verdad (no solo en memoria) para que sigan ahí tras recargar la página.
    Promise.all(nuevas.map(p => guardarPistaBD(p)));

    // Letras y subtítulos: se asocian a la pista con el mismo nombre.
    for (const archivoTexto of textos) {
      const contenido = await archivoTexto.text();
      const base = nombreBase(archivoTexto.name);
      const esLetra = /\.lrc$/i.test(archivoTexto.name);
      let destino = [...estado.pistas].reverse().find(p => p.base === base);
      if (!destino) {
        // Si no hay ninguna con ese nombre, se la ponemos a la que está sonando.
        const actual = pistaActual();
        if (actual && actual.tipo === (esLetra ? 'audio' : 'video')) destino = actual;
      }
      if (!destino) {
        aviso('No sé a qué archivo pertenece "' + archivoTexto.name + '". Ponle el mismo nombre que la canción o el vídeo.', true);
        continue;
      }
      if (esLetra) asignarLetra(destino, contenido);
      else asignarSubtitulos(destino, contenido, archivoTexto.name);
    }

    pintarSubvista();
    if (nuevas.length) aviso('Añadidos ' + nuevas.length + (nuevas.length === 1 ? ' archivo' : ' archivos') + ' a la biblioteca.');
  }

  function quitarPista(id) {
    const pista = buscar(id);
    if (!pista) return;
    if (id === estado.actualId) detenerTodo();
    URL.revokeObjectURL(pista.url);
    if (pista.caratula) URL.revokeObjectURL(pista.caratula);
    if (pista.subtitulos) URL.revokeObjectURL(pista.subtitulos);
    estado.pistas.splice(indiceDe(id), 1);
    estado.historial = estado.historial.filter(h => h !== id);
    quitarPistaBD(id);
    pintarSubvista();
    aviso('Se ha quitado "' + pista.titulo + '" de la biblioteca.');
  }

  /* ============================================================
   * UNA FILA DE LA TABLA (se reutiliza en Canciones, Favoritos,
   * y en el detalle de un álbum o de un artista)
   * ============================================================ */
  function construirFilaPista(p, indiceMostrado) {
    const sonando = p.id === estado.actualId;
    const pausado = !estado.elActivo || estado.elActivo.paused;
    const favorito = esFavorito(p);
    const fila = document.createElement('tr');
    fila.dataset.id = p.id;
    fila.tabIndex = 0;
    fila.classList.toggle('sonando', sonando);
    fila.innerHTML =
      '<td>' + (sonando ? '<span class="ecualizando' + (pausado ? ' pausado' : '') + '"><i></i><i></i><i></i></span>' : (indiceMostrado + 1)) + '</td>' +
      '<td><div class="pista"><div class="caratula caratula--fila"></div>' +
        '<div class="pista__textos"><div class="pista__titulo"></div><div class="pista__artista"></div></div></div></td>' +
      '<td class="col-album"></td>' +
      '<td class="col-tipo"><span class="etiqueta' + (p.tipo === 'video' ? ' etiqueta--video' : '') + '">' + (p.tipo === 'video' ? 'Vídeo' : 'Audio') + '</span></td>' +
      '<td>' + (p.duracion && isFinite(p.duracion) ? Onda.formatearTiempo(p.duracion) : '—') + '</td>' +
      '<td><div class="acciones-fila">' +
        '<button class="icono icono--corazon' + (favorito ? ' activo' : '') + '" data-accion="favorito" title="' + (favorito ? 'Quitar de favoritos' : 'Añadir a favoritos') + '" aria-label="Favorito">' + icono(favorito ? 'corazonLleno' : 'corazon') + '</button>' +
        '<button class="icono" data-accion="wav" title="Descargar el audio en WAV" aria-label="Descargar en WAV">' + icono('ondaWav') + '</button>' +
        '<button class="icono" data-accion="quitar" title="Quitar de la biblioteca" aria-label="Quitar">' + icono('papelera') + '</button>' +
      '</div></td>';
    // Los textos que vienen del archivo se ponen con textContent (nunca como HTML)
    fila.querySelector('.pista__titulo').textContent = p.titulo;
    fila.querySelector('.pista__artista').textContent = p.artista;
    fila.querySelector('.col-album').textContent = p.album;
    ponerCaratula(fila.querySelector('.caratula'), p);
    return fila;
  }

  /** Rellena el <tbody> de cualquier tabla con una lista de pistas. */
  function pintarFilas(idCuerpo, lista) {
    const cuerpo = document.getElementById(idCuerpo);
    if (!cuerpo) return;
    cuerpo.innerHTML = '';
    lista.forEach((p, i) => cuerpo.appendChild(construirFilaPista(p, i)));
  }

  /**
   * Conecta los clics y el teclado de una tabla. "proveedorLista" es una
   * función que devuelve en cada momento la lista que representa esa
   * tabla (así, al pulsar "siguiente", se sigue dentro de esa misma lista).
   */
  function instalarTabla(idCuerpo, proveedorLista) {
    const cuerpo = document.getElementById(idCuerpo);
    if (!cuerpo) return;
    cuerpo.addEventListener('click', e => {
      const fila = e.target.closest('tr');
      if (!fila) return;
      const id = +fila.dataset.id;
      const accion = e.target.closest('[data-accion]');
      if (accion) {
        e.stopPropagation();
        if (accion.dataset.accion === 'quitar') quitarPista(id);
        else if (accion.dataset.accion === 'wav') convertirAWav(buscar(id));
        else if (accion.dataset.accion === 'favorito') toggleFavorito(id);
        return;
      }
      if (id === estado.actualId) alternarPlay(); else reproducir(id, { cola: proveedorLista() });
    });
    cuerpo.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('tr')) reproducir(+e.target.dataset.id, { cola: proveedorLista() });
    });
  }

  /** Tarjeta de un álbum o un artista (con carátula, título y botón de reproducir). */
  function tarjetaGrupo(g, tipo) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'tarjeta-grupo';
    boton.innerHTML =
      '<div class="caratula"></div>' +
      '<div><div class="tarjeta-grupo__titulo"></div><div class="tarjeta-grupo__subtitulo"></div></div>' +
      '<button class="tarjeta-grupo__reproducir" type="button" aria-label="Reproducir" title="Reproducir">' + icono('play') + '</button>';
    boton.querySelector('.tarjeta-grupo__titulo').textContent = tipo === 'album' ? g.album : g.artista;
    boton.querySelector('.tarjeta-grupo__subtitulo').textContent = tipo === 'album'
      ? (g.variosArtistas ? 'Varios artistas' : g.artista)
      : g.pistas.length + (g.pistas.length === 1 ? ' canción' : ' canciones');
    ponerCaratulaGrupo(boton.querySelector('.caratula'), g);
    boton.addEventListener('click', e => {
      const pistasOrdenadas = [...g.pistas].sort((a, b) => a.id - b.id);
      if (e.target.closest('.tarjeta-grupo__reproducir')) {
        e.stopPropagation();
        reproducir(pistasOrdenadas[0].id, { cola: pistasOrdenadas });
        return;
      }
      if (tipo === 'album') abrirAlbum(g.clave); else abrirArtista(g.clave);
    });
    return boton;
  }

  /** Empieza a sonar una lista en orden aleatorio (botón "Mezclar"). */
  function reproducirMezclado(lista) {
    if (!lista.length) return;
    if (!estado.aleatorio) { ponerAleatorio(true); guardarAjustes(); }
    const inicio = lista[Math.floor(Math.random() * lista.length)];
    reproducir(inicio.id, { cola: lista });
  }

  /* ============================================================
   * BÚSQUEDA, ORDEN Y AGRUPACIONES
   * ============================================================ */
  function coincideBusqueda(p) {
    const q = estado.busqueda.trim().toLowerCase();
    return !q || [p.titulo, p.artista, p.album].some(c => c && c.toLowerCase().includes(q));
  }

  function ordenarPistas(lista) {
    const l = [...lista];
    switch (estado.orden) {
      case 'titulo': l.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')); break;
      case 'artista': l.sort((a, b) => a.artista.localeCompare(b.artista, 'es')); break;
      case 'duracion': l.sort((a, b) => (b.duracion || 0) - (a.duracion || 0)); break;
      default: l.sort((a, b) => b.id - a.id); // "reciente": lo último importado, primero
    }
    return l;
  }

  function pistasVisiblesCanciones() {
    return ordenarPistas(estado.pistas.filter(p =>
      (estado.filtro === 'todo' || p.tipo === estado.filtro) && coincideBusqueda(p)));
  }

  function pistasFavoritas() {
    return ordenarPistas(estado.pistas.filter(p => esFavorito(p) && coincideBusqueda(p)));
  }

  /** Agrupa las canciones (solo audio) por álbum. Cada grupo mezcla su propio artista y año. */
  function agruparAlbumes(lista) {
    const mapa = new Map();
    lista.forEach(p => {
      if (p.tipo !== 'audio' || !p.album) return;
      const clave = p.album.trim().toLowerCase() + '|' + (p.artista || '').trim().toLowerCase();
      if (!mapa.has(clave)) mapa.set(clave, { clave, album: p.album.trim(), artista: p.artista, anio: p.anio, caratula: null, pistas: [], variosArtistas: false });
      const grupo = mapa.get(clave);
      grupo.pistas.push(p);
      if (!grupo.caratula && p.caratula) grupo.caratula = p.caratula;
      if (!grupo.anio && p.anio) grupo.anio = p.anio;
      if (grupo.artista !== p.artista) grupo.variosArtistas = true;
    });
    return [...mapa.values()].sort((a, b) => a.album.localeCompare(b.album, 'es'));
  }

  /** Agrupa las canciones (solo audio) por artista. */
  function agruparArtistas(lista) {
    const mapa = new Map();
    lista.forEach(p => {
      if (p.tipo !== 'audio') return;
      const nombre = (p.artista || 'Artista desconocido').trim();
      const clave = nombre.toLowerCase();
      if (!mapa.has(clave)) mapa.set(clave, { clave, artista: nombre, caratula: null, pistas: [] });
      const grupo = mapa.get(clave);
      grupo.pistas.push(p);
      if (!grupo.caratula && p.caratula) grupo.caratula = p.caratula;
    });
    return [...mapa.values()].sort((a, b) => a.artista.localeCompare(b.artista, 'es'));
  }

  const albumesVisibles = () => agruparAlbumes(estado.pistas.filter(coincideBusqueda));
  const artistasVisibles = () => agruparArtistas(estado.pistas.filter(coincideBusqueda));

  function abrirAlbum(clave) { estado.albumAbierto = clave; mostrarSubvista('albumes'); }
  function abrirArtista(clave) { estado.artistaAbierto = clave; mostrarSubvista('artistas'); }

  /* ============================================================
   * PINTAR CADA PESTAÑA DE LA BIBLIOTECA
   * ============================================================ */
  function pintarCanciones() {
    const hay = estado.pistas.length > 0;
    const visibles = pistasVisiblesCanciones();
    $('#zonaSoltar').classList.toggle('soltar--compacta', hay);
    $('#tabla').hidden = !visibles.length;
    $('#sinResultados').hidden = !(hay && !visibles.length);
    $('#contador').textContent = visibles.length + (visibles.length === 1 ? ' elemento' : ' elementos');
    pintarFilas('cuerpoTabla', visibles);
    actualizarHogar();
  }

  function pintarAlbumes() {
    if (estado.albumAbierto) return pintarDetalleAlbum();
    $('#detalleAlbum').hidden = true;
    const rejilla = $('#rejillaAlbumes');
    rejilla.hidden = false;
    const grupos = albumesVisibles();
    $('#sinAlbumes').hidden = !!grupos.length;
    rejilla.innerHTML = '';
    grupos.forEach(g => rejilla.appendChild(tarjetaGrupo(g, 'album')));
  }

  function pintarDetalleAlbum() {
    $('#rejillaAlbumes').hidden = true;
    $('#sinAlbumes').hidden = true;
    const detalle = $('#detalleAlbum');
    detalle.hidden = false;
    // Se agrupa sin aplicar la búsqueda: si entraste al álbum, quieres verlo entero.
    const g = agruparAlbumes(estado.pistas).find(x => x.clave === estado.albumAbierto);
    if (!g) { estado.albumAbierto = null; return pintarAlbumes(); }
    const pistasOrdenadas = [...g.pistas].sort((a, b) => a.id - b.id);
    const duracionTotal = pistasOrdenadas.reduce((s, p) => s + (p.duracion || 0), 0);

    detalle.innerHTML =
      '<button class="detalle__volver" id="volverAlbumes">' + icono('volver') + 'Álbumes</button>' +
      '<div class="detalle__cabecera"><div class="caratula"></div><div class="detalle__meta">' +
        '<p class="detalle__pildora">Álbum</p><h2 class="detalle__titulo"></h2>' +
        '<p class="detalle__info"></p></div></div>' +
      '<div class="detalle__acciones">' +
        '<button class="boton boton--principal" id="reproducirAlbum"><span data-icono="play"></span>Reproducir</button>' +
        '<button class="boton" id="mezclarAlbum"><span data-icono="aleatorio"></span>Mezclar</button></div>' +
      '<table class="tabla sinalbum" id="tablaDetalleAlbum"><thead><tr><th>#</th><th>Título</th><th class="col-album">Álbum</th><th class="col-tipo">Tipo</th><th>Duración</th><th></th></tr></thead>' +
        '<tbody id="cuerpoDetalleAlbum"></tbody></table>';
    pintarIconos(detalle);
    detalle.querySelector('.detalle__titulo').textContent = g.album;
    detalle.querySelector('.detalle__info').textContent =
      (g.variosArtistas ? 'Varios artistas' : g.artista) + (g.anio ? ' · ' + g.anio : '') +
      ' · ' + pistasOrdenadas.length + (pistasOrdenadas.length === 1 ? ' canción' : ' canciones') +
      ' · ' + Onda.formatearTiempo(duracionTotal);
    ponerCaratulaGrupo(detalle.querySelector('.caratula'), g);
    pintarFilas('cuerpoDetalleAlbum', pistasOrdenadas);
    instalarTabla('cuerpoDetalleAlbum', () => pistasOrdenadas);
    detalle.querySelector('#volverAlbumes').addEventListener('click', () => { estado.albumAbierto = null; pintarAlbumes(); });
    detalle.querySelector('#reproducirAlbum').addEventListener('click', () => reproducir(pistasOrdenadas[0].id, { cola: pistasOrdenadas }));
    detalle.querySelector('#mezclarAlbum').addEventListener('click', () => reproducirMezclado(pistasOrdenadas));
  }

  function pintarArtistas() {
    if (estado.artistaAbierto) return pintarDetalleArtista();
    $('#detalleArtista').hidden = true;
    const rejilla = $('#rejillaArtistas');
    rejilla.hidden = false;
    const grupos = artistasVisibles();
    $('#sinArtistas').hidden = !!grupos.length;
    rejilla.innerHTML = '';
    grupos.forEach(g => rejilla.appendChild(tarjetaGrupo(g, 'artista')));
  }

  function pintarDetalleArtista() {
    $('#rejillaArtistas').hidden = true;
    $('#sinArtistas').hidden = true;
    const detalle = $('#detalleArtista');
    detalle.hidden = false;
    const g = agruparArtistas(estado.pistas).find(x => x.clave === estado.artistaAbierto);
    if (!g) { estado.artistaAbierto = null; return pintarArtistas(); }
    const pistasOrdenadas = [...g.pistas].sort((a, b) => a.id - b.id);
    const duracionTotal = pistasOrdenadas.reduce((s, p) => s + (p.duracion || 0), 0);
    const albumesDelArtista = agruparAlbumes(g.pistas);

    detalle.innerHTML =
      '<button class="detalle__volver" id="volverArtistas">' + icono('volver') + 'Artistas</button>' +
      '<div class="detalle__cabecera"><div class="caratula"></div><div class="detalle__meta">' +
        '<p class="detalle__pildora">Artista</p><h2 class="detalle__titulo"></h2>' +
        '<p class="detalle__info"></p></div></div>' +
      '<div class="detalle__acciones">' +
        '<button class="boton boton--principal" id="reproducirArtista"><span data-icono="play"></span>Reproducir</button>' +
        '<button class="boton" id="mezclarArtista"><span data-icono="aleatorio"></span>Mezclar</button></div>' +
      (albumesDelArtista.length ? '<div class="detalle__subalbum"><h3>Álbumes</h3><div class="rejilla-tarjetas" id="rejillaAlbumesArtista"></div></div>' : '') +
      '<div class="detalle__subalbum"><h3>Todas las canciones</h3>' +
        '<table class="tabla" id="tablaDetalleArtista"><thead><tr><th>#</th><th>Título</th><th class="col-album">Álbum</th><th class="col-tipo">Tipo</th><th>Duración</th><th></th></tr></thead>' +
        '<tbody id="cuerpoDetalleArtista"></tbody></table></div>';
    pintarIconos(detalle);
    detalle.querySelector('.detalle__titulo').textContent = g.artista;
    detalle.querySelector('.detalle__info').textContent =
      pistasOrdenadas.length + (pistasOrdenadas.length === 1 ? ' canción' : ' canciones') +
      (albumesDelArtista.length ? ' · ' + albumesDelArtista.length + (albumesDelArtista.length === 1 ? ' álbum' : ' álbumes') : '') +
      ' · ' + Onda.formatearTiempo(duracionTotal);
    ponerCaratulaGrupo(detalle.querySelector('.caratula'), g);
    if (albumesDelArtista.length) {
      const rejillaAlbumes = detalle.querySelector('#rejillaAlbumesArtista');
      albumesDelArtista.forEach(al => rejillaAlbumes.appendChild(tarjetaGrupo(al, 'album')));
    }
    pintarFilas('cuerpoDetalleArtista', pistasOrdenadas);
    instalarTabla('cuerpoDetalleArtista', () => pistasOrdenadas);
    detalle.querySelector('#volverArtistas').addEventListener('click', () => { estado.artistaAbierto = null; pintarArtistas(); });
    detalle.querySelector('#reproducirArtista').addEventListener('click', () => reproducir(pistasOrdenadas[0].id, { cola: pistasOrdenadas }));
    detalle.querySelector('#mezclarArtista').addEventListener('click', () => reproducirMezclado(pistasOrdenadas));
  }

  /** Convierte segundos en algo como "3 h 12 min" o "34 min" para el resumen de una lista. */
  function formatearDuracionLarga(segundos) {
    const min = Math.round(segundos / 60);
    if (min < 60) return min + (min === 1 ? ' min' : ' min');
    const h = Math.floor(min / 60), resto = min % 60;
    return h + ' h' + (resto ? ' ' + resto + ' min' : '');
  }

  function pintarFavoritos() {
    const lista = pistasFavoritas();
    const hero = $('#heroFavoritos');
    hero.hidden = !lista.length;
    if (lista.length) {
      const duracionTotal = lista.reduce((s, p) => s + (p.duracion || 0), 0);
      $('#metaFavoritos').textContent =
        lista.length + (lista.length === 1 ? ' canción' : ' canciones') + ' · ' + formatearDuracionLarga(duracionTotal);
    }
    $('#tablaFavoritos').hidden = !lista.length;
    $('#sinFavoritos').hidden = !!lista.length;
    pintarFilas('cuerpoFavoritos', lista);
  }

  /** La última canción escuchada: la que suena ahora, o si no, la última del historial, o si no, la más reciente importada. */
  function ultimaEscuchada() {
    if (estado.actualId !== null) { const p = buscar(estado.actualId); if (p) return p; }
    for (let i = estado.historial.length - 1; i >= 0; i--) {
      const p = buscar(estado.historial[i]);
      if (p) return p;
    }
    if (!estado.pistas.length) return null;
    return estado.pistas.reduce((mejor, p) => (!mejor || p.id > mejor.id) ? p : mejor, null);
  }

  /**
   * Portada de inicio de "Canciones": saludo, accesos rápidos, lo último
   * escuchado y tiras de álbumes/artistas. Se oculta si la biblioteca está
   * vacía o si hay una búsqueda activa (entonces se quiere ver la lista).
   */
  function actualizarHogar() {
    const hogar = $('#hogar');
    if (!hogar) return;
    const visible = estado.pistas.length > 0 && !estado.busqueda.trim();
    hogar.hidden = !visible;
    if (!visible) return;

    const hora = new Date().getHours();
    $('#saludoTexto').textContent = hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';

    const reciente = ultimaEscuchada();
    const seccionReciente = $('#seccionReciente');
    seccionReciente.hidden = !reciente;
    if (reciente) {
      const tarjeta = $('#tarjetaReciente');
      tarjeta.innerHTML =
        '<div class="caratula"></div><div class="tarjeta-hero__titulo"></div>' +
        '<div class="tarjeta-hero__sub"></div>' +
        '<button class="tarjeta-hero__play" type="button" aria-label="Reproducir">' + icono('play') + '</button>';
      ponerCaratula(tarjeta.querySelector('.caratula'), reciente);
      tarjeta.querySelector('.tarjeta-hero__titulo').textContent = reciente.titulo;
      tarjeta.querySelector('.tarjeta-hero__sub').textContent = reciente.artista;
      tarjeta.onclick = () => reproducir(reciente.id, { cola: pistasVisiblesCanciones() });
    }

    const porRecencia = grupos => [...grupos].sort((a, b) =>
      Math.max(...b.pistas.map(p => p.id)) - Math.max(...a.pistas.map(p => p.id)));

    const albumes = porRecencia(agruparAlbumes(estado.pistas)).slice(0, 6);
    const seccionAlbumes = $('#seccionAlbumesHogar');
    seccionAlbumes.hidden = !albumes.length;
    if (albumes.length) {
      const fila = $('#filaAlbumesHogar');
      fila.innerHTML = '';
      albumes.forEach(g => fila.appendChild(tarjetaGrupo(g, 'album')));
    }

    const artistas = porRecencia(agruparArtistas(estado.pistas)).slice(0, 6);
    const seccionArtistas = $('#seccionArtistasHogar');
    seccionArtistas.hidden = !artistas.length;
    if (artistas.length) {
      const fila = $('#filaArtistasHogar');
      fila.innerHTML = '';
      artistas.forEach(g => fila.appendChild(tarjetaGrupo(g, 'artista')));
    }
  }

  /** Dibuja lo que toca según la pestaña de biblioteca activa, y los contadores de cada pestaña. */
  function pintarSubvista() {
    ({ canciones: pintarCanciones, albumes: pintarAlbumes, artistas: pintarArtistas, favoritos: pintarFavoritos }
      [estado.subvista] || pintarCanciones)();
    $('#contadorCanciones').textContent = estado.pistas.length || '';
    $('#contadorAlbumes').textContent = agruparAlbumes(estado.pistas).length || '';
    $('#contadorArtistas').textContent = agruparArtistas(estado.pistas).length || '';
    $('#contadorFavoritos').textContent = estado.pistas.filter(esFavorito).length || '';
  }

  function mostrarSubvista(nombre) {
    estado.subvista = nombre;
    $$('.subtab').forEach(b => {
      const activo = b.dataset.subvista === nombre;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-selected', activo);
    });
    $$('.subvista').forEach(v => {
      const activa = v.id === 'subvista-' + nombre;
      v.hidden = !activa;
      v.classList.toggle('activa', activa);
    });
    pintarSubvista();
  }
  $$('.subtab').forEach(b => b.addEventListener('click', () => mostrarSubvista(b.dataset.subvista)));

  /* ============================================================
   * REPRODUCCIÓN
   * ============================================================ */

  /** La lista de ids que se está reproduciendo ahora mismo (filtra los que se hayan borrado). */
  function colaActual() {
    const cola = estado.cola.filter(id => buscar(id));
    return cola.length ? cola : estado.pistas.map(p => p.id);
  }

  /**
   * Reproduce una pista.
   * opciones.cola            -> la lista (álbum, artista, búsqueda, favoritos...) en la que sonará "siguiente/anterior"
   * opciones.fundir          -> hacer fundido con la que sonaba
   * opciones.desdeHistorial  -> venimos del botón "anterior" (no guardar en historial)
   */
  async function reproducir(id, opciones = {}) {
    const pista = buscar(id);
    if (!pista) return;

    if (opciones.cola && opciones.cola.length) estado.cola = opciones.cola.map(p => p.id);
    else if (!estado.cola.includes(id)) estado.cola = estado.pistas.map(p => p.id);

    // Conectamos los elementos al motor de audio (la primera vez crea el contexto).
    ELEMENTOS.forEach(el => motor.conectar(el));
    await motor.reanudar();

    const anterior = estado.elActivo;
    const destino = pista.tipo === 'video' ? video : (anterior === audioA ? audioB : audioA);
    const fundir = !!opciones.fundir && anterior && anterior !== video && destino !== video &&
                   !anterior.paused && estado.fundido > 0;

    if (!opciones.desdeHistorial && estado.actualId !== null && estado.actualId !== id) {
      estado.historial.push(estado.actualId);
      if (estado.historial.length > 100) estado.historial.shift();
    }

    // Paramos todo lo que no sea el nuevo (salvo la canción que se está fundiendo).
    ELEMENTOS.forEach(el => { if (el !== destino && !(fundir && el === anterior)) el.pause(); });

    destino.src = pista.url;
    destino.defaultPlaybackRate = estado.velocidad;
    destino.playbackRate = estado.velocidad;
    if (destino === video) aplicarSubtitulos(pista);

    estado.elActivo = destino;
    estado.actualId = id;
    estado.lineaLetra = -1;

    if (fundir) {
      const saliente = anterior;
      motor.fijarGanancia(destino, 0);
      motor.fundido(destino, 0, 1, estado.fundido);
      motor.fundido(saliente, 1, 0, estado.fundido);
      setTimeout(() => {
        if (saliente !== estado.elActivo) { saliente.pause(); motor.fijarGanancia(saliente, 1); }
      }, estado.fundido * 1000 + 150);
    } else {
      motor.fijarGanancia(destino, 1);
    }

    actualizarInfo();
    if (pista.tipo === 'video' && estado.vista !== 'reproduciendo') mostrarVista('reproduciendo');

    try {
      await destino.play();
    } catch (e) {
      // AbortError: se cambió de canción muy rápido. NotSupportedError: lo avisa el evento "error".
      if (e.name === 'NotAllowedError') aviso('El navegador ha bloqueado el sonido. Pulsa el botón de reproducir.', true);
    }
  }

  function detenerTodo() {
    ELEMENTOS.forEach(el => { el.pause(); el.removeAttribute('src'); el.load(); });
    video.querySelectorAll('track').forEach(t => t.remove());
    estado.elActivo = null;
    estado.actualId = null;
    actualizarInfo();
    actualizarBotonPlay();
  }

  function alternarPlay() {
    const el = estado.elActivo;
    if (!el) {
      const lista = pistasVisiblesCanciones();
      const primera = lista[0] || estado.pistas[0];
      if (primera) reproducir(primera.id, { cola: lista.length ? lista : estado.pistas });
      else aviso('Importa algún archivo para empezar.');
      return;
    }
    if (el.paused) { motor.reanudar(); el.play().catch(() => {}); }
    else el.pause();
  }

  /** Calcula qué pista va después, dentro de la cola actual. manual = lo ha pedido el usuario con el botón. */
  function calcularSiguienteId(manual) {
    const cola = colaActual();
    if (!cola.length) return null;
    if (estado.aleatorio && cola.length > 1) {
      let candidata;
      do { candidata = cola[Math.floor(Math.random() * cola.length)]; } while (candidata === estado.actualId);
      return candidata;
    }
    const i = cola.indexOf(estado.actualId);
    if (i + 1 < cola.length) return cola[i + 1];
    if (estado.repetir === 'todo' || manual) return cola[0];
    return null;
  }

  function siguiente() {
    const id = calcularSiguienteId(true);
    if (id !== null) reproducir(id);
  }

  function anterior() {
    const el = estado.elActivo;
    // Como en Spotify: si ya han pasado 3 segundos, vuelve al principio.
    if (el && el.currentTime > 3) { el.currentTime = 0; return; }
    while (estado.historial.length) {
      const id = estado.historial.pop();
      if (buscar(id)) return reproducir(id, { desdeHistorial: true });
    }
    const cola = colaActual();
    if (!cola.length) return;
    const i = cola.indexOf(estado.actualId);
    const previaId = cola[(i - 1 + cola.length) % cola.length];
    reproducir(previaId, { desdeHistorial: true });
  }

  function alTerminar(el) {
    if (estado.repetir === 'una') { el.currentTime = 0; el.play().catch(() => {}); return; }
    const id = calcularSiguienteId(false);
    if (id !== null) reproducir(id);
    else actualizarBotonPlay();
  }

  /** Si queda poco para acabar y el fundido está activo, empieza la siguiente. */
  function comprobarFundido(el) {
    if (!estado.fundido || el === video || estado.cruzando || el.paused || estado.repetir === 'una') return;
    const total = duracionActual();
    if (!total || total < estado.fundido * 2) return;
    if (total - el.currentTime > estado.fundido) return;
    const id = calcularSiguienteId(false);
    const siguientePista = buscar(id);
    if (!siguientePista || siguientePista.tipo !== 'audio' || id === estado.actualId) return;
    estado.cruzando = true;
    reproducir(id, { fundir: true }).finally(() => { estado.cruzando = false; });
  }

  // Eventos de los tres elementos multimedia
  ELEMENTOS.forEach(el => {
    el.addEventListener('timeupdate', () => {
      if (el !== estado.elActivo) return;
      actualizarProgreso();
      actualizarLetra();
      comprobarFundido(el);
    });
    el.addEventListener('loadedmetadata', () => {
      if (el !== estado.elActivo) return;
      const p = pistaActual();
      if (p && isFinite(el.duration) && !p.duracion) p.duracion = el.duration;
      actualizarProgreso();
    });
    el.addEventListener('play', () => { if (el === estado.elActivo) actualizarBotonPlay(); });
    el.addEventListener('pause', () => { if (el === estado.elActivo) actualizarBotonPlay(); });
    el.addEventListener('ended', () => { if (el === estado.elActivo) alTerminar(el); });
    el.addEventListener('error', () => {
      if (el !== estado.elActivo || !el.getAttribute('src')) return;
      const p = pistaActual();
      aviso('Tu navegador no puede reproducir "' + (p ? p.titulo : 'este archivo') + '" (formato no compatible).', true);
    });
  });

  /* ============================================================
   * ACTUALIZAR LA INTERFAZ
   * ============================================================ */
  function actualizarInfo() {
    const p = pistaActual();

    // Barra inferior
    $('#tituloMini').textContent = p ? p.titulo : 'Nada sonando';
    $('#artistaMini').textContent = p ? p.artista : 'Importa tus archivos para empezar';
    ponerCaratula($('#caratulaMini'), p);
    document.title = p ? p.titulo + ' · sonora' : 'diegofo | sonora';

    // Vista "Reproduciendo"
    $('#nadaSonando').hidden = !!p;
    $('#escenaAudio').hidden = !p || p.tipo !== 'audio';
    $('#escenaVideo').hidden = !p || p.tipo !== 'video';
    if (p && p.tipo === 'audio') {
      $('#tituloGrande').textContent = p.titulo;
      $('#artistaGrande').textContent = p.artista;
      $('#albumGrande').textContent = [p.album, p.anio].filter(Boolean).join(' · ') || 'Canción';
      ponerCaratula($('#caratulaGrande'), p);
      pintarLetra();
    }
    if (p && p.tipo === 'video') $('#tituloVideo').textContent = p.titulo;

    actualizarMediaSession(p);
    actualizarFavoritoPistaActual();
    actualizarAmbiente();
    pintarSubvista();
    actualizarProgreso();
    actualizarMini();
  }

  function actualizarBotonPlay() {
    const sonando = estado.elActivo && !estado.elActivo.paused;
    const boton = $('#btnPlay');
    boton.innerHTML = icono(sonando ? 'pausa' : 'play');
    boton.setAttribute('aria-label', sonando ? 'Pausa' : 'Reproducir');
    $$('.ecualizando').forEach(e => e.classList.toggle('pausado', !sonando));
    if (sonando && estado.elActivo !== video) visualizador.iniciar(); else visualizador.detener();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = sonando ? 'playing' : 'paused';
    actualizarMini();
  }

  function actualizarProgreso() {
    const el = estado.elActivo;
    const total = duracionActual();
    const actual = el ? el.currentTime : 0;
    const barra = $('#barraProgreso');
    if (!estado.arrastrandoProgreso) {
      barra.value = total ? Math.round((actual / total) * 1000) : 0;
      $('#tiempoActual').textContent = Onda.formatearTiempo(actual);
    }
    $('#tiempoTotal').textContent = Onda.formatearTiempo(total);
    pintarRango(barra);
    if (mini) {
      const prog = mini.document.getElementById('mProg');
      if (prog) prog.style.width = (total ? (actual / total) * 100 : 0) + '%';
    }
  }

  /* ============================================================
   * LETRAS (karaoke)
   * ============================================================ */
  function asignarLetra(pista, textoLrc) {
    const lineas = Onda.leerLRC(textoLrc);
    if (!lineas.length) {
      // No tiene tiempos: la guardamos como letra normal.
      pista.letraPlana = textoLrc.trim();
      pista.lrc = null;
    } else {
      pista.lrc = lineas;
    }
    if (pista.id === estado.actualId) { pintarLetra(); estado.lineaLetra = -1; actualizarLetra(); }
    guardarPistaBD(pista);
    aviso('Letra añadida a "' + pista.titulo + '".');
  }

  function pintarLetra() {
    const contenedor = $('#letra');
    contenedor.innerHTML = '';
    contenedor.scrollTop = 0;
    const p = pistaActual();
    if (!p || p.tipo !== 'audio') return;
    if (p.lrc && p.lrc.length) {
      p.lrc.forEach((linea, i) => {
        const div = document.createElement('div');
        div.className = 'letra__linea';
        div.textContent = linea.texto || '♪';
        div.dataset.indice = i;
        contenedor.appendChild(div);
      });
    } else if (p.letraPlana) {
      const div = document.createElement('div');
      div.className = 'letra__plana';
      div.textContent = p.letraPlana;
      contenedor.appendChild(div);
    } else {
      contenedor.innerHTML = '<p class="letra__vacia">Esta canción no trae letra. Carga un archivo <b>.lrc</b> y la verás sincronizada, como en un karaoke.</p>';
    }
  }

  function actualizarLetra() {
    const p = pistaActual();
    if (!p || !p.lrc || !estado.elActivo) return;
    const i = Onda.lineaActual(p.lrc, estado.elActivo.currentTime + 0.15);
    if (i === estado.lineaLetra) return;
    estado.lineaLetra = i;
    const contenedor = $('#letra');
    const lineas = contenedor.children;
    for (let k = 0; k < lineas.length; k++) {
      lineas[k].classList.toggle('activa', k === i);
      lineas[k].classList.toggle('pasada', k < i);
    }
    const activa = lineas[i];
    if (activa && estado.vista === 'reproduciendo') {
      contenedor.scrollTo({ top: activa.offsetTop - contenedor.clientHeight / 2 + activa.clientHeight / 2 });
    }
  }

  $('#letra').addEventListener('click', e => {
    const linea = e.target.closest('.letra__linea');
    const p = pistaActual();
    if (linea && p && p.lrc && estado.elActivo) estado.elActivo.currentTime = p.lrc[+linea.dataset.indice].tiempo;
  });

  $('#inputLetra').addEventListener('change', async e => {
    const archivo = e.target.files[0];
    e.target.value = '';
    const p = pistaActual();
    if (!archivo || !p) return;
    asignarLetra(p, await archivo.text());
  });

  /* ============================================================
   * VÍDEO: subtítulos, efectos, captura, pantalla completa
   * ============================================================ */
  function asignarSubtitulos(pista, texto, nombre) {
    const vtt = /\.srt$/i.test(nombre) ? Onda.srtAVtt(texto) : texto;
    if (pista.subtitulos) URL.revokeObjectURL(pista.subtitulos);
    pista.subtitulos = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    if (pista.id === estado.actualId) aplicarSubtitulos(pista);
    guardarPistaBD(pista);
    aviso('Subtítulos añadidos a "' + pista.titulo + '".');
  }

  function aplicarSubtitulos(pista) {
    video.querySelectorAll('track').forEach(t => t.remove());
    if (!pista.subtitulos) return;
    const pistaTexto = document.createElement('track');
    pistaTexto.kind = 'subtitles';
    pistaTexto.label = 'Subtítulos';
    pistaTexto.srclang = 'es';
    pistaTexto.src = pista.subtitulos;
    pistaTexto.default = true;
    video.appendChild(pistaTexto);
    pistaTexto.track.mode = 'showing';
    pistaTexto.addEventListener('load', () => { pistaTexto.track.mode = 'showing'; });
  }

  $('#inputSubtitulos').addEventListener('change', async e => {
    const archivo = e.target.files[0];
    e.target.value = '';
    const p = pistaActual();
    if (!archivo || !p || p.tipo !== 'video') return;
    asignarSubtitulos(p, await archivo.text(), archivo.name);
  });

  /** Junta todos los efectos en un filtro CSS, por ejemplo "brightness(120%) blur(2px)". */
  function filtroVideo() {
    const partes = $$('[data-efecto]').map(rango => {
      const efecto = rango.dataset.efecto, valor = rango.value;
      if (efecto === 'blur') return 'blur(' + valor + 'px)';
      if (efecto === 'hue-rotate') return 'hue-rotate(' + valor + 'deg)';
      return efecto + '(' + valor + '%)';
    });
    const estilo = $('#estiloVideo').value;
    if (estilo) partes.push(estilo);
    return partes.join(' ');
  }
  function aplicarEfectos() { video.style.filter = filtroVideo(); }
  $$('[data-efecto]').forEach(r => r.addEventListener('input', aplicarEfectos));
  $('#estiloVideo').addEventListener('change', aplicarEfectos);
  $('#btnResetEfectos').addEventListener('click', () => {
    $$('[data-efecto]').forEach(r => { r.value = r.dataset.efecto === 'blur' || r.dataset.efecto === 'hue-rotate' ? 0 : 100; });
    $('#estiloVideo').value = '';
    aplicarEfectos();
  });

  $('#btnCaptura').addEventListener('click', async () => {
    try {
      const imagen = await Onda.capturarFotograma(video, filtroVideo());
      const p = pistaActual();
      descargar(imagen, nombreSeguro(p && p.titulo) + '-' + Math.floor(video.currentTime) + 's.png');
      aviso('Fotograma guardado como PNG.');
    } catch (e) { aviso(e.message, true); }
  });

  function pantallaCompleta() {
    if (estado.elActivo !== video) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else $('.marco-video').requestFullscreen().catch(() => aviso('No se pudo poner en pantalla completa.', true));
  }
  $('#btnPantallaCompleta').addEventListener('click', pantallaCompleta);
  video.addEventListener('click', alternarPlay);
  video.addEventListener('dblclick', pantallaCompleta);

  /* ============================================================
   * MINI REPRODUCTOR FLOTANTE
   * - Vídeo: Picture-in-Picture (ventana que queda encima de todo).
   * - Audio: Document Picture-in-Picture (Chrome/Edge), una ventanita
   *   con nuestros propios botones.
   * ============================================================ */
  let mini = null;

  async function abrirMini() {
    const el = estado.elActivo;
    if (!el) return aviso('Primero reproduce algo.');

    if (el === video) {
      if (!document.pictureInPictureEnabled) return aviso('Tu navegador no admite el modo imagen en imagen.', true);
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch (e) { aviso('No se pudo abrir el mini reproductor: ' + e.message, true); }
      return;
    }

    if (!('documentPictureInPicture' in window)) {
      return aviso('El mini reproductor de música necesita Chrome o Edge (versión 116 o superior).', true);
    }
    if (mini) { mini.close(); return; }
    try {
      mini = await window.documentPictureInPicture.requestWindow({ width: 360, height: 130 });
      construirMini(mini);
      mini.addEventListener('pagehide', () => { mini = null; });
    } catch (e) { aviso('No se pudo abrir el mini reproductor: ' + e.message, true); }
  }

  function construirMini(ventana) {
    const estilos = getComputedStyle(document.documentElement);
    const v = nombre => estilos.getPropertyValue(nombre).trim();
    const d = ventana.document;
    d.title = 'sonora';
    const css = d.createElement('style');
    css.textContent = `
      * { box-sizing: border-box; }
      body { margin: 0; font-family: ${v('--fuente')}; background: ${v('--fondo-2')}; color: ${v('--texto')}; overflow: hidden; }
      .m { display: flex; gap: 12px; align-items: center; padding: 12px; height: 100vh; }
      .car { width: 96px; height: 96px; border-radius: 10px; flex-shrink: 0; background: linear-gradient(135deg, ${v('--acento')}, ${v('--acento-2')}); background-size: cover; background-position: center; overflow: hidden; }
      .car svg { width: 100%; height: 100%; display: block; }
      .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
      b, span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      span { font-size: 13px; color: ${v('--texto-2')}; }
      .ctrl { display: flex; gap: 6px; margin-top: 6px; }
      button { width: 34px; height: 34px; border: 0; border-radius: 50%; background: ${v('--superficie-2')}; color: ${v('--texto')}; display: grid; place-items: center; cursor: pointer; }
      button.play { background: ${v('--texto')}; color: ${v('--fondo')}; }
      .svg { width: 16px; height: 16px; }
      .barra { height: 4px; background: ${v('--superficie-2')}; border-radius: 4px; margin-top: 8px; overflow: hidden; }
      .barra i { display: block; height: 100%; width: 0; background: ${v('--acento')}; }`;
    d.head.appendChild(css);
    d.body.innerHTML =
      '<div class="m"><div class="car" id="mCar"></div><div class="txt">' +
      '<b id="mTit"></b><span id="mArt"></span>' +
      '<div class="ctrl"><button id="mAnt" aria-label="Anterior">' + icono('anterior') + '</button>' +
      '<button class="play" id="mPlay" aria-label="Reproducir">' + icono('play') + '</button>' +
      '<button id="mSig" aria-label="Siguiente">' + icono('siguiente') + '</button></div>' +
      '<div class="barra"><i id="mProg"></i></div></div></div>';
    d.getElementById('mAnt').addEventListener('click', anterior);
    d.getElementById('mPlay').addEventListener('click', alternarPlay);
    d.getElementById('mSig').addEventListener('click', siguiente);
    actualizarMini();
  }

  function actualizarMini() {
    if (!mini) return;
    const d = mini.document;
    const p = pistaActual();
    const tit = d.getElementById('mTit');
    if (!tit) return;
    tit.textContent = p ? p.titulo : 'Nada sonando';
    d.getElementById('mArt').textContent = p ? p.artista : '';
    const car = d.getElementById('mCar');
    if (p && p.caratula) {
      car.style.backgroundImage = 'url("' + p.caratula + '")';
      car.innerHTML = '';
    } else if (p) {
      car.style.backgroundImage = '';
      car.innerHTML = arteGenerativo(p.titulo + '|' + p.artista).svg;
    } else {
      car.style.backgroundImage = '';
      car.innerHTML = '';
    }
    const sonando = estado.elActivo && !estado.elActivo.paused;
    d.getElementById('mPlay').innerHTML = icono(sonando ? 'pausa' : 'play');
  }

  $('#btnMini').addEventListener('click', abrirMini);

  /* ============================================================
   * MEDIA SESSION: controles del sistema (teclas multimedia del
   * teclado, notificación del móvil, pantalla de bloqueo...)
   * ============================================================ */
  function actualizarMediaSession(p) {
    if (!('mediaSession' in navigator) || !p) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: p.titulo,
        artist: p.artista,
        album: p.album,
        artwork: p.caratula ? [{ src: p.caratula, sizes: '512x512' }] : []
      });
    } catch (e) { /* algunos navegadores no aceptan carátulas blob: */ }
  }
  if ('mediaSession' in navigator) {
    const acciones = {
      play: () => alternarPlay(),
      pause: () => alternarPlay(),
      previoustrack: anterior,
      nexttrack: siguiente,
      seekto: d => { if (estado.elActivo) estado.elActivo.currentTime = d.seekTime; }
    };
    Object.entries(acciones).forEach(([accion, fn]) => {
      try { navigator.mediaSession.setActionHandler(accion, fn); } catch (e) { /* no soportada */ }
    });
  }

  /* ============================================================
   * SONIDO: ecualizador, fundido, normalizar, velocidad, WAV
   * ============================================================ */
  const etiquetaFrecuencia = f => f >= 1000 ? (f / 1000) + ' kHz' : f + ' Hz';

  function construirEcualizador() {
    const contenedor = $('#ecualizador');
    Onda.MotorAudio.BANDAS.forEach((frecuencia, i) => {
      const banda = document.createElement('div');
      banda.className = 'eq__banda';
      banda.innerHTML =
        '<span class="eq__valor">0 dB</span>' +
        '<input type="range" min="-12" max="12" step="1" value="0" aria-label="Banda de ' + etiquetaFrecuencia(frecuencia) + '">' +
        '<span class="eq__frecuencia">' + etiquetaFrecuencia(frecuencia) + '</span>';
      banda.querySelector('input').addEventListener('input', e => {
        ponerBanda(i, +e.target.value);
        marcarPreset();
        guardarAjustes();
      });
      contenedor.appendChild(banda);
    });

    const presets = $('#presets');
    Object.keys(Onda.PRESETS_EQ).forEach(nombre => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = nombre;
      chip.dataset.preset = nombre;
      chip.addEventListener('click', () => {
        Onda.PRESETS_EQ[nombre].forEach((db, i) => ponerBanda(i, db));
        marcarPreset();
        guardarAjustes();
      });
      presets.appendChild(chip);
    });
  }

  function ponerBanda(i, db) {
    motor.setBanda(i, db);
    const banda = $$('.eq__banda')[i];
    banda.querySelector('input').value = db;
    banda.querySelector('.eq__valor').textContent = (db > 0 ? '+' : '') + db + ' dB';
  }

  function marcarPreset() {
    $$('#presets .chip').forEach(chip => {
      const valores = Onda.PRESETS_EQ[chip.dataset.preset];
      chip.classList.toggle('activo', valores.every((v, i) => v === motor.ganancias[i]));
    });
  }

  function ponerFundido(segundos) {
    estado.fundido = segundos;
    $('#rangoFundido').value = segundos;
    $('#valorFundido').textContent = segundos ? segundos + ' s' : 'Desactivado';
  }
  $('#rangoFundido').addEventListener('input', e => { ponerFundido(+e.target.value); guardarAjustes(); });

  $('#checkNormalizar').addEventListener('change', e => { motor.setNormalizar(e.target.checked); guardarAjustes(); });

  function ponerVelocidad(valor) {
    estado.velocidad = valor;
    $('#velocidad').value = String(valor);
    ELEMENTOS.forEach(el => { el.defaultPlaybackRate = valor; el.playbackRate = valor; });
  }
  $('#velocidad').addEventListener('change', e => { ponerVelocidad(+e.target.value); guardarAjustes(); });

  async function convertirAWav(pista) {
    if (!pista) return aviso('Primero reproduce algo para poder convertirlo.');
    aviso('Convirtiendo "' + pista.titulo + '" a WAV...');
    try {
      const wav = await Onda.convertirAWav(pista.archivo);
      descargar(wav, nombreSeguro(pista.titulo) + '.wav');
      aviso('WAV listo (' + (wav.size / 1048576).toFixed(1) + ' MB).');
    } catch (e) {
      aviso('No se pudo convertir: el navegador no sabe decodificar este archivo.', true);
    }
  }
  $('#btnConvertir').addEventListener('click', () => convertirAWav(pistaActual()));

  /* ============================================================
   * GRABADORA
   * ============================================================ */
  let idCronometro = null;
  let inicioGrabacion = 0;

  $$('.fuente').forEach(boton => boton.addEventListener('click', async () => {
    if (grabadora.grabando) return aviso('Para la grabación antes de cambiar de fuente.');
    $$('.fuente').forEach(b => b.classList.toggle('activo', b === boton));
    const fuente = boton.dataset.fuente;
    try {
      const flujo = await grabadora.preparar(fuente);
      const esMicro = fuente === 'microfono';
      $('#previa').hidden = false;
      $('#videoPrevia').hidden = esMicro;
      $('#previaMicro').hidden = !esMicro;
      $('#videoPrevia').srcObject = esMicro ? null : flujo;
      $('#btnGrabar').disabled = false;
      // Si el usuario deja de compartir la pantalla desde el aviso del navegador:
      flujo.getVideoTracks().forEach(t => t.addEventListener('ended', () => {
        if (grabadora.grabando) pararGrabacion(); else cancelarFuente();
      }));
    } catch (e) {
      cancelarFuente();
      if (e.name === 'NotAllowedError') aviso('Has denegado el permiso. Puedes activarlo en el candado de la barra de direcciones.', true);
      else aviso('No se pudo acceder: ' + e.message, true);
    }
  }));

  function cancelarFuente() {
    grabadora.liberar();
    $$('.fuente').forEach(b => b.classList.remove('activo'));
    $('#previa').hidden = true;
    $('#videoPrevia').srcObject = null;
    $('#btnGrabar').disabled = true;
  }

  $('#btnGrabar').addEventListener('click', () => {
    if (grabadora.grabando) return pararGrabacion();
    try { grabadora.iniciar(); }
    catch (e) { return aviso(e.message, true); }
    $('#btnGrabar').classList.add('grabando');
    $('#textoGrabar').textContent = 'Parar';
    inicioGrabacion = Date.now();
    idCronometro = setInterval(() => {
      $('#cronometro').textContent = Onda.formatearTiempo((Date.now() - inicioGrabacion) / 1000);
    }, 250);
  });

  async function pararGrabacion() {
    const fuente = grabadora.fuente;
    clearInterval(idCronometro);
    const blob = await grabadora.detener();
    $('#btnGrabar').classList.remove('grabando');
    $('#textoGrabar').textContent = 'Grabar';
    $('#cronometro').textContent = '0:00';
    cancelarFuente();
    if (!blob || !blob.size) return aviso('La grabación ha salido vacía.', true);
    anadirGrabacion(blob, fuente);
  }

  function anadirGrabacion(blob, fuente) {
    const extension = blob.type.includes('mp4') ? 'mp4' : (blob.type.includes('ogg') ? 'ogg' : 'webm');
    const fecha = new Date();
    const marca = fecha.toLocaleDateString('es-ES').replace(/\//g, '-') + '_' +
                  fecha.toLocaleTimeString('es-ES').replace(/:/g, '-');
    const nombres = { microfono: 'Micrófono', camara: 'Cámara', pantalla: 'Pantalla' };
    const nombre = 'Grabación ' + nombres[fuente] + ' ' + marca + '.' + extension;
    const url = URL.createObjectURL(blob);

    const lista = $('#listaGrabaciones');
    const vacio = lista.querySelector('.vacio');
    if (vacio) vacio.remove();

    const li = document.createElement('li');
    li.className = 'grabacion';
    const reproductor = document.createElement(fuente === 'microfono' ? 'audio' : 'video');
    reproductor.controls = true;
    reproductor.src = url;
    const titulo = document.createElement('span');
    titulo.className = 'grabacion__nombre';
    titulo.textContent = nombre + ' · ' + (blob.size / 1048576).toFixed(2) + ' MB';
    const botones = document.createElement('div');
    botones.className = 'grupo-botones';
    botones.innerHTML =
      '<button class="boton boton--pequeno" data-accion="descargar">' + icono('descargar') + 'Descargar</button>' +
      '<button class="boton boton--pequeno" data-accion="biblioteca">' + icono('mas') + 'A la biblioteca</button>';
    botones.querySelector('[data-accion="descargar"]').addEventListener('click', () => descargar(blob, nombre));
    botones.querySelector('[data-accion="biblioteca"]').addEventListener('click', e => {
      importar([new File([blob], nombre, { type: blob.type })]);
      e.currentTarget.disabled = true;
    });
    li.append(titulo, botones, reproductor);
    lista.prepend(li);
    aviso('Grabación lista.');
  }

  /* ============================================================
   * VISTAS, TEMA, BARRA INFERIOR
   * ============================================================ */
  function mostrarVista(nombre) {
    estado.vista = nombre;
    $$('.vista').forEach(v => v.classList.toggle('activa', v.id === 'vista-' + nombre));
    $$('.menu__boton').forEach(b => b.classList.toggle('activo', b.dataset.vista === nombre));
    if (nombre === 'reproduciendo') { estado.lineaLetra = -1; actualizarLetra(); }
  }
  $$('.menu__boton').forEach(b => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

  function ponerTema(tema) {
    estado.tema = tema;
    document.documentElement.dataset.tema = tema;
    const boton = $('#btnTema');
    boton.querySelector('[data-icono]').innerHTML = icono(tema === 'oscuro' ? 'sol' : 'luna');
    $('#textoTema').textContent = tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro';
    colorAcento = getComputedStyle(document.documentElement).getPropertyValue('--acento').trim() || colorAcento;
    if (mini) { mini.close(); mini = null; }
  }
  $('#btnTema').addEventListener('click', () => { ponerTema(estado.tema === 'oscuro' ? 'claro' : 'oscuro'); guardarAjustes(); });

  $('#btnAtajos').addEventListener('click', () => $('#dialogoAtajos').showModal());

  // Ajustes: vaciar toda la biblioteca guardada (el archivo, no solo lo que se ve en pantalla).
  $('#btnVaciarBiblioteca').addEventListener('click', async () => {
    if (!estado.pistas.length) { aviso('La biblioteca ya está vacía.'); return; }
    detenerTodo();
    estado.pistas.forEach(p => {
      URL.revokeObjectURL(p.url);
      if (p.caratula) URL.revokeObjectURL(p.caratula);
      if (p.subtitulos) URL.revokeObjectURL(p.subtitulos);
    });
    estado.pistas = [];
    estado.historial = [];
    estado.cola = [];
    estado.albumAbierto = null;
    estado.artistaAbierto = null;
    await vaciarBibliotecaBD();
    actualizarInfo();
    aviso('Biblioteca vaciada.');
  });

  // Favoritos: corazón del reproductor grande y de la barra inferior
  $('#btnFavoritoGrande').addEventListener('click', () => { if (estado.actualId !== null) toggleFavorito(estado.actualId); });
  $('#btnFavoritoMini').addEventListener('click', () => { if (estado.actualId !== null) toggleFavorito(estado.actualId); });

  // Botones de la barra
  $('#btnPlay').addEventListener('click', alternarPlay);
  $('#btnSiguiente').addEventListener('click', siguiente);
  $('#btnAnterior').addEventListener('click', anterior);

  function ponerAleatorio(activo) {
    estado.aleatorio = activo;
    $('#btnAleatorio').classList.toggle('activo', activo);
  }
  $('#btnAleatorio').addEventListener('click', () => {
    ponerAleatorio(!estado.aleatorio);
    aviso(estado.aleatorio ? 'Aleatorio activado' : 'Aleatorio desactivado');
    guardarAjustes();
  });

  function ponerRepetir(modo) {
    estado.repetir = modo;
    const boton = $('#btnRepetir');
    boton.classList.toggle('activo', modo !== 'no');
    boton.innerHTML = icono(modo === 'una' ? 'repetirUna' : 'repetir');
    boton.title = { no: 'Repetir: no', todo: 'Repetir: toda la lista', una: 'Repetir: esta canción' }[modo] + ' (R)';
  }
  $('#btnRepetir').addEventListener('click', () => {
    const orden = ['no', 'todo', 'una'];
    ponerRepetir(orden[(orden.indexOf(estado.repetir) + 1) % orden.length]);
    aviso({ no: 'Sin repetir', todo: 'Repetir toda la lista', una: 'Repetir esta canción' }[estado.repetir]);
    guardarAjustes();
  });

  // Barra de progreso: mientras se arrastra no la movemos desde el código
  const barraProgreso = $('#barraProgreso');
  barraProgreso.addEventListener('input', () => {
    estado.arrastrandoProgreso = true;
    $('#tiempoActual').textContent = Onda.formatearTiempo((barraProgreso.value / 1000) * duracionActual());
    pintarRango(barraProgreso);
  });
  barraProgreso.addEventListener('change', () => {
    const el = estado.elActivo;
    if (el && duracionActual()) el.currentTime = (barraProgreso.value / 1000) * duracionActual();
    estado.arrastrandoProgreso = false;
  });

  // Volumen
  function ponerVolumen(valor) {
    estado.volumen = Math.max(0, Math.min(1, valor));
    if (estado.volumen > 0) estado.silenciado = false;
    motor.setVolumen(estado.silenciado ? 0 : estado.volumen);
    const rango = $('#volumen');
    rango.value = Math.round(estado.volumen * 100);
    pintarRango(rango);
    $('#btnSilencio').innerHTML = icono(estado.silenciado || estado.volumen === 0 ? 'silencio' : 'volumen');
  }
  $('#volumen').addEventListener('input', e => { ponerVolumen(e.target.value / 100); guardarAjustes(); });
  function silenciar() {
    estado.silenciado = !estado.silenciado;
    motor.setVolumen(estado.silenciado ? 0 : estado.volumen);
    $('#btnSilencio').innerHTML = icono(estado.silenciado ? 'silencio' : 'volumen');
  }
  $('#btnSilencio').addEventListener('click', silenciar);

  /* ============================================================
   * BIBLIOTECA: búsqueda, filtros, orden, favoritos
   * ============================================================ */
  $('#buscador').addEventListener('input', e => { estado.busqueda = e.target.value; pintarSubvista(); });
  $$('.filtros .chip').forEach(chip => chip.addEventListener('click', () => {
    estado.filtro = chip.dataset.filtro;
    $$('.filtros .chip').forEach(c => c.classList.toggle('activo', c === chip));
    pintarCanciones();
  }));
  $('#ordenCanciones').addEventListener('change', e => {
    estado.orden = e.target.value;
    pintarCanciones();
    guardarAjustes();
  });

  /** Pone el filtro de tipo (todo/audio/video) y deja el chip correspondiente marcado como activo. */
  function aplicarFiltroTipo(filtro) {
    estado.filtro = filtro;
    $$('.filtros .chip').forEach(c => c.classList.toggle('activo', c.dataset.filtro === filtro));
    pintarCanciones();
  }

  // Accesos rápidos de la portada de inicio ("Música", "Vídeos", "Recientes", "Favoritos").
  $$('.acceso').forEach(boton => boton.addEventListener('click', () => {
    switch (boton.dataset.acceso) {
      case 'musica': aplicarFiltroTipo('audio'); break;
      case 'video': aplicarFiltroTipo('video'); break;
      case 'reciente':
        aplicarFiltroTipo('todo');
        estado.orden = 'reciente';
        $('#ordenCanciones').value = 'reciente';
        pintarCanciones();
        guardarAjustes();
        break;
      case 'favorito': mostrarSubvista('favoritos'); break;
    }
    if (boton.dataset.acceso !== 'favorito') $('#tabla').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // Enlaces "Ver todo" de las tiras de álbumes/artistas de la portada.
  $$('.enlace[data-subvista]').forEach(enlace => enlace.addEventListener('click', () => mostrarSubvista(enlace.dataset.subvista)));

  instalarTabla('cuerpoTabla', pistasVisiblesCanciones);
  instalarTabla('cuerpoFavoritos', pistasFavoritas);
  $('#btnReproducirFavoritos').addEventListener('click', () => {
    const lista = pistasFavoritas();
    if (lista.length) reproducir(lista[0].id, { cola: lista });
  });
  $('#btnMezclarFavoritos').addEventListener('click', () => reproducirMezclado(pistasFavoritas()));

  // Importar con botones
  ['#inputImportar', '#inputImportar2'].forEach(sel => $(sel).addEventListener('change', e => {
    importar(e.target.files);
    e.target.value = '';
  }));

  // Arrastrar y soltar en cualquier parte de la ventana
  let profundidadArrastre = 0;
  const llevaArchivos = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', e => {
    if (!llevaArchivos(e)) return;
    e.preventDefault();
    profundidadArrastre++;
    document.body.classList.add('arrastrando');
  });
  window.addEventListener('dragover', e => { if (llevaArchivos(e)) e.preventDefault(); });
  window.addEventListener('dragleave', e => {
    if (!llevaArchivos(e)) return;
    if (--profundidadArrastre <= 0) { profundidadArrastre = 0; document.body.classList.remove('arrastrando'); }
  });
  window.addEventListener('drop', e => {
    if (!llevaArchivos(e)) return;
    e.preventDefault();
    profundidadArrastre = 0;
    document.body.classList.remove('arrastrando');
    if (e.dataTransfer.files.length) importar(e.dataTransfer.files);
  });

  /* ============================================================
   * ATAJOS DE TECLADO
   * ============================================================ */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const objetivo = e.target;
    if (objetivo.matches('input[type="search"], input[type="text"], select, textarea')) return;
    if ($('#dialogoAtajos').open) return;
    const el = estado.elActivo;
    const esRango = objetivo.matches('input[type="range"]');

    switch (e.key) {
      case ' ':
        if (objetivo.matches('button, label')) return;
        e.preventDefault(); alternarPlay(); break;
      case 'ArrowRight':
        if (esRango || !el) return;
        e.preventDefault(); el.currentTime = Math.min(el.currentTime + 5, duracionActual() || el.currentTime + 5); break;
      case 'ArrowLeft':
        if (esRango || !el) return;
        e.preventDefault(); el.currentTime = Math.max(el.currentTime - 5, 0); break;
      case 'ArrowUp':
        if (esRango) return;
        e.preventDefault(); ponerVolumen(estado.volumen + 0.05); guardarAjustes(); break;
      case 'ArrowDown':
        if (esRango) return;
        e.preventDefault(); ponerVolumen(estado.volumen - 0.05); guardarAjustes(); break;
      case 'n': case 'N': siguiente(); break;
      case 'p': case 'P': anterior(); break;
      case 'm': case 'M': silenciar(); break;
      case 's': case 'S': $('#btnAleatorio').click(); break;
      case 'r': case 'R': $('#btnRepetir').click(); break;
      case 'l': case 'L': if (estado.actualId !== null) toggleFavorito(estado.actualId); break;
      case 'f': case 'F': pantallaCompleta(); break;
    }
  });

  /* ============================================================
   * ARRANQUE
   * ============================================================ */
  async function iniciar() {
    pintarIconos();
    construirEcualizador();
    estado.favoritos = new Set(leerFavoritosGuardados());

    const ajustes = leerAjustes();
    ponerTema(ajustes.tema === 'claro' ? 'claro' : 'oscuro');
    ponerVolumen(typeof ajustes.volumen === 'number' ? ajustes.volumen : 0.8);
    (Array.isArray(ajustes.eq) ? ajustes.eq : Onda.PRESETS_EQ['Plano']).forEach((db, i) => ponerBanda(i, +db || 0));
    marcarPreset();
    ponerFundido(+ajustes.fundido || 0);
    motor.setNormalizar(!!ajustes.normalizar);
    $('#checkNormalizar').checked = !!ajustes.normalizar;
    ponerAleatorio(!!ajustes.aleatorio);
    ponerRepetir(['no', 'todo', 'una'].includes(ajustes.repetir) ? ajustes.repetir : 'no');
    ponerVelocidad(+ajustes.velocidad || 1);
    estado.orden = ['reciente', 'titulo', 'artista', 'duracion'].includes(ajustes.orden) ? ajustes.orden : 'reciente';
    $('#ordenCanciones').value = estado.orden;

    // Recupera la biblioteca que se guardó la última vez (para que no se vacíe al recargar con F5).
    const guardadas = await cargarPistasBD();
    if (guardadas.length) {
      estado.pistas = guardadas.sort((a, b) => a.id - b.id);
      estado.siguienteId = Math.max(...guardadas.map(p => p.id)) + 1;
      aviso('Biblioteca recuperada: ' + guardadas.length + (guardadas.length === 1 ? ' archivo.' : ' archivos.'));
    }

    actualizarInfo();
    actualizarBotonPlay();
    console.log('%c diegofo | sonora %c Onda.js v' + Onda.version, 'background:#ef7b45;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px', 'color:#ef7b45');
  }

  iniciar();
})();
