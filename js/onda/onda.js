/*
 * ============================================================
 *  Onda.js  ·  Librería multimedia propia
 *  Autor: Diego Fernández Ortega  ·  DAM · Multimedia · RA3
 * ============================================================
 *  Una librería es un conjunto de funciones reutilizables.
 *  Esta se encarga de todo lo "técnico" del reproductor:
 *
 *   1. Leer las etiquetas (título, artista, carátula...) de un
 *      archivo de audio, byte a byte, sin librerías externas.
 *   2. Procesar el sonido con la Web Audio API: ecualizador,
 *      fundido entre canciones y volumen igualado.
 *   3. Dibujar un visualizador de barras.
 *   4. Grabar micrófono, cámara o pantalla.
 *   5. Convertir audio (o el audio de un vídeo) a WAV.
 *   6. Leer letras sincronizadas (.lrc) y subtítulos (.srt).
 *
 *  Se usa como un objeto global: window.Onda
 *  (así funciona incluso abriendo el index.html con doble clic).
 * ============================================================
 */
(function (global) {
  'use strict';

  const Onda = { version: '1.0.0' };

  /* ----------------------------------------------------------
   * 0. UTILIDADES
   * ---------------------------------------------------------- */

  /** Convierte segundos en texto "m:ss" (ej: 125 -> "2:05"). */
  Onda.formatearTiempo = function (segundos) {
    if (!isFinite(segundos) || segundos < 0) segundos = 0;
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return m + ':' + String(s).padStart(2, '0');
  };

  const EXT_AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'weba'];
  const EXT_VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv'];

  /** Dice si un archivo es 'audio', 'video' o null (no soportado). */
  Onda.tipoDeArchivo = function (archivo) {
    const ext = archivo.name.split('.').pop().toLowerCase();
    if (archivo.type.startsWith('audio/') || EXT_AUDIO.includes(ext)) return 'audio';
    if (archivo.type.startsWith('video/') || EXT_VIDEO.includes(ext)) return 'video';
    return null;
  };

  /** Lee la duración de un archivo multimedia sin reproducirlo. */
  Onda.leerDuracion = function (url, tipo) {
    return new Promise(resolve => {
      const el = document.createElement(tipo === 'video' ? 'video' : 'audio');
      const terminar = valor => { el.removeAttribute('src'); el.load(); resolve(valor); };
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        if (el.duration !== Infinity) return terminar(el.duration);
        // Truco: las grabaciones WebM no guardan su duración. Si saltamos a un
        // tiempo enorme, el navegador recorre el archivo y la descubre.
        el.ontimeupdate = () => { el.ontimeupdate = null; terminar(el.duration); };
        el.currentTime = 1e101;
      };
      el.onerror = () => terminar(0);
      setTimeout(() => terminar(0), 8000); // por si el archivo no responde
      el.src = url;
    });
  };

  /* ----------------------------------------------------------
   * 1. LECTOR DE ETIQUETAS ID3 (byte a byte)
   * ----------------------------------------------------------
   * Los MP3 guardan sus datos (título, artista...) en un bloque
   * llamado "ID3" al principio del archivo. Ese bloque está
   * dividido en "frames" (trozos), cada uno con un código de 4
   * letras: TIT2 = título, TPE1 = artista, APIC = imagen...
   * Solo leemos los bytes de ese bloque, NO el archivo entero.
   * ---------------------------------------------------------- */

  /** Lee un número "syncsafe": 4 bytes de los que solo valen 7 bits. */
  function leerSyncsafe(b, i) {
    return (b[i] & 0x7f) * 2097152 + (b[i + 1] & 0x7f) * 16384 + (b[i + 2] & 0x7f) * 128 + (b[i + 3] & 0x7f);
  }

  /** Lee un número normal de 4 bytes (big-endian: el byte más grande primero). */
  function leerEntero32(b, i) {
    return b[i] * 16777216 + b[i + 1] * 65536 + b[i + 2] * 256 + b[i + 3];
  }

  /** Bytes que ocupa el "fin de texto" según la codificación. */
  function anchoFin(codificacion) {
    return (codificacion === 1 || codificacion === 2) ? 2 : 1;
  }

  /** Busca dónde termina un texto (un byte 0, o dos 0 en UTF-16). */
  function buscarFin(bytes, inicio, codificacion) {
    const ancho = anchoFin(codificacion);
    for (let i = inicio; i + ancho - 1 < bytes.length; i += ancho) {
      if (bytes[i] === 0 && (ancho === 1 || bytes[i + 1] === 0)) return i;
    }
    return bytes.length;
  }

  /**
   * Convierte bytes en texto. El primer byte de cada frame dice la codificación:
   * 0 = ISO-8859-1 (latín), 1 = UTF-16 con BOM, 2 = UTF-16 big-endian, 3 = UTF-8.
   */
  function decodificarTexto(bytes, codificacion) {
    if (!bytes || bytes.length === 0) return '';
    let nombre = 'iso-8859-1';
    let datos = bytes;
    if (codificacion === 1) {
      // El BOM son 2 bytes que indican el orden de los bytes.
      if (bytes[0] === 0xff && bytes[1] === 0xfe) { nombre = 'utf-16le'; datos = bytes.subarray(2); }
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) { nombre = 'utf-16be'; datos = bytes.subarray(2); }
      else nombre = 'utf-16le';
    } else if (codificacion === 2) nombre = 'utf-16be';
    else if (codificacion === 3) nombre = 'utf-8';
    return new TextDecoder(nombre).decode(datos).replace(/\u0000+$/g, '').trim();
  }

  /** Frame APIC (v2.3/v2.4): la carátula del disco. */
  function leerAPIC(d) {
    const codificacion = d[0];
    const finMime = buscarFin(d, 1, 0);
    let mime = new TextDecoder('iso-8859-1').decode(d.subarray(1, finMime)) || 'image/jpeg';
    if (!mime.includes('/')) mime = 'image/' + mime.toLowerCase().replace('jpg', 'jpeg');
    let pos = finMime + 1;   // saltamos el 0 del final del tipo MIME
    pos += 1;                // saltamos el byte "tipo de imagen" (3 = portada)
    const finDesc = buscarFin(d, pos, codificacion);
    pos = finDesc + anchoFin(codificacion);
    return URL.createObjectURL(new Blob([d.slice(pos)], { type: mime }));
  }

  /** Frame PIC (v2.2, versión antigua): igual pero el formato son 3 letras. */
  function leerPIC22(d) {
    const codificacion = d[0];
    const formato = new TextDecoder('iso-8859-1').decode(d.subarray(1, 4)).toLowerCase();
    const mime = 'image/' + (formato === 'png' ? 'png' : 'jpeg');
    const finDesc = buscarFin(d, 5, codificacion);
    const pos = finDesc + anchoFin(codificacion);
    return URL.createObjectURL(new Blob([d.slice(pos)], { type: mime }));
  }

  /** Frame USLT: letra de la canción (sin tiempos). */
  function leerUSLT(d) {
    const codificacion = d[0];
    let pos = 4; // 1 byte codificación + 3 bytes de idioma ("spa", "eng"...)
    const finDesc = buscarFin(d, pos, codificacion);
    pos = finDesc + anchoFin(codificacion);
    return decodificarTexto(d.subarray(pos), codificacion);
  }

  function procesarFrame(id, d, r) {
    if (!d || d.length === 0) return;
    const codificacion = d[0];
    const texto = () => decodificarTexto(d.subarray(1), codificacion);
    switch (id) {
      case 'TIT2': r.titulo = texto() || r.titulo; break;
      case 'TPE1': r.artista = texto() || r.artista; break;
      case 'TALB': r.album = texto() || r.album; break;
      case 'TYER':
      case 'TDRC': r.anio = texto().slice(0, 4) || r.anio; break;
      case 'APIC': if (!r.caratula) r.caratula = leerAPIC(d); break;
      case 'USLT': if (!r.letra) r.letra = leerUSLT(d); break;
    }
  }

  /** Recorre los frames de ID3 v2.2 (cabeceras de 6 bytes). */
  function leerFramesV22(b, r) {
    const equivalencias = { TT2: 'TIT2', TP1: 'TPE1', TAL: 'TALB', TYE: 'TYER', ULT: 'USLT' };
    let pos = 0;
    while (pos + 6 <= b.length) {
      const id = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2]);
      if (!/^[A-Z0-9]{3}$/.test(id)) break; // llegamos al relleno (bytes a 0)
      const tam = b[pos + 3] * 65536 + b[pos + 4] * 256 + b[pos + 5];
      const datos = b.subarray(pos + 6, pos + 6 + tam);
      if (id === 'PIC') { if (!r.caratula) r.caratula = leerPIC22(datos); }
      else if (equivalencias[id]) procesarFrame(equivalencias[id], datos, r);
      pos += 6 + tam;
    }
  }

  /** Recorre los frames de ID3 v2.3 / v2.4 (cabeceras de 10 bytes). */
  function leerFramesID3(b, version, banderas, r) {
    if (version === 2) return leerFramesV22(b, r);
    let pos = 0;
    if (banderas & 0x40) { // hay una "cabecera extendida" que hay que saltar
      pos = version === 4 ? leerSyncsafe(b, 0) : leerEntero32(b, 0) + 4;
    }
    while (pos + 10 <= b.length) {
      const id = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break; // relleno: ya no hay más frames
      // En v2.4 el tamaño es "syncsafe"; en v2.3 es un número normal.
      const tam = version === 4 ? leerSyncsafe(b, pos + 4) : leerEntero32(b, pos + 4);
      if (tam <= 0 || pos + 10 + tam > b.length) break;
      procesarFrame(id, b.subarray(pos + 10, pos + 10 + tam), r);
      pos += 10 + tam;
    }
  }

  /** ID3v1: 128 bytes al FINAL del archivo (formato antiguo, solo texto). */
  async function leerID3v1(archivo, r) {
    if (archivo.size < 128) return;
    const b = new Uint8Array(await archivo.slice(archivo.size - 128).arrayBuffer());
    if (b[0] !== 0x54 || b[1] !== 0x41 || b[2] !== 0x47) return; // "TAG"
    const campo = (inicio, largo) => {
      const trozo = b.subarray(inicio, inicio + largo);
      return decodificarTexto(trozo.subarray(0, buscarFin(trozo, 0, 0)), 0);
    };
    r.titulo = r.titulo || campo(3, 30) || null;
    r.artista = r.artista || campo(33, 30) || null;
    r.album = r.album || campo(63, 30) || null;
    r.anio = r.anio || campo(93, 4) || null;
  }

  /**
   * Función principal del lector. Devuelve una promesa con:
   * { titulo, artista, album, anio, caratula (URL), letra }
   * Si el archivo no tiene etiquetas, usa el nombre del archivo
   * ("Artista - Título.mp3").
   */
  Onda.leerEtiquetas = async function (archivo) {
    const r = { titulo: null, artista: null, album: null, anio: null, caratula: null, letra: null };
    try {
      // Leemos solo los 10 primeros bytes: la cabecera del bloque ID3.
      const cab = new Uint8Array(await archivo.slice(0, 10).arrayBuffer());
      if (cab[0] === 0x49 && cab[1] === 0x44 && cab[2] === 0x33) { // "ID3"
        const version = cab[3];
        const banderas = cab[5];
        const tamano = leerSyncsafe(cab, 6);
        const bloque = new Uint8Array(await archivo.slice(10, 10 + tamano).arrayBuffer());
        leerFramesID3(bloque, version, banderas, r);
      }
      if (!r.titulo) await leerID3v1(archivo, r);
    } catch (error) {
      console.warn('[Onda] No se pudieron leer las etiquetas de', archivo.name, error);
    }
    if (!r.titulo) {
      const base = archivo.name.replace(/\.[^.]+$/, '');
      const partes = base.split(' - ');
      if (partes.length >= 2 && !r.artista) {
        r.artista = partes[0].trim();
        r.titulo = partes.slice(1).join(' - ').trim();
      } else {
        r.titulo = base;
      }
    }
    return r;
  };

  /* ----------------------------------------------------------
   * 2. MOTOR DE AUDIO (Web Audio API)
   * ----------------------------------------------------------
   * La Web Audio API funciona como una cadena de "pedales" de
   * guitarra: el sonido entra, pasa por varios nodos y sale por
   * los altavoces. Nuestra cadena es:
   *
   *  <audio>/<video> -> volumen del canal -> 5 filtros (ecualizador)
   *   -> compresor (opcional) -> analizador -> volumen general -> altavoces
   * ---------------------------------------------------------- */

  const BANDAS = [60, 230, 910, 3600, 14000]; // frecuencias en Hz (graves -> agudos)

  class MotorAudio {
    constructor() {
      this.contexto = null;
      this.canales = new Map();          // elemento -> nodo de volumen propio
      this.ganancias = BANDAS.map(() => 0);
      this.normalizar = false;
      this.volumen = 1;
    }

    /** Crea el contexto de audio (solo se puede tras un clic del usuario). */
    _iniciar() {
      if (this.contexto) return;
      const Contexto = global.AudioContext || global.webkitAudioContext;
      const c = this.contexto = new Contexto();

      this.entrada = c.createGain();

      this.filtros = BANDAS.map((frecuencia, i) => {
        const filtro = c.createBiquadFilter();
        // La primera banda sube/baja todo lo grave, la última todo lo agudo,
        // y las del medio solo una zona ("campana").
        filtro.type = i === 0 ? 'lowshelf' : (i === BANDAS.length - 1 ? 'highshelf' : 'peaking');
        filtro.frequency.value = frecuencia;
        filtro.Q.value = 1;
        filtro.gain.value = this.ganancias[i];
        return filtro;
      });

      // El compresor baja lo que suena muy fuerte y "iguala" el volumen.
      this.compresor = c.createDynamicsCompressor();
      this.compresor.threshold.value = -24;
      this.compresor.knee.value = 30;
      this.compresor.ratio.value = 4;
      this.compresor.attack.value = 0.003;
      this.compresor.release.value = 0.25;

      // El analizador no cambia el sonido: solo nos da datos para dibujar.
      this.analizador = c.createAnalyser();
      this.analizador.fftSize = 256;
      this.analizador.smoothingTimeConstant = 0.8;

      this.maestro = c.createGain();
      this.maestro.gain.value = this.volumen;

      let nodo = this.entrada;
      this.filtros.forEach(f => { nodo.connect(f); nodo = f; });
      this.ultimoFiltro = nodo;
      this._conectarSalida();
      this.analizador.connect(this.maestro);
      this.maestro.connect(c.destination);
    }

    /** Pone o quita el compresor de la cadena. */
    _conectarSalida() {
      this.ultimoFiltro.disconnect();
      this.compresor.disconnect();
      if (this.normalizar) {
        this.ultimoFiltro.connect(this.compresor);
        this.compresor.connect(this.analizador);
      } else {
        this.ultimoFiltro.connect(this.analizador);
      }
    }

    /** Conecta un <audio> o <video> al motor. Solo se puede hacer una vez por elemento. */
    conectar(elemento) {
      this._iniciar();
      if (this.canales.has(elemento)) return this.canales.get(elemento);
      const fuente = this.contexto.createMediaElementSource(elemento);
      const ganancia = this.contexto.createGain();
      fuente.connect(ganancia);
      ganancia.connect(this.entrada);
      this.canales.set(elemento, ganancia);
      return ganancia;
    }

    /** El navegador "duerme" el audio hasta que el usuario interactúa. */
    async reanudar() {
      if (this.contexto && this.contexto.state === 'suspended') await this.contexto.resume();
    }

    setBanda(indice, decibelios) {
      this.ganancias[indice] = decibelios;
      if (this.filtros) this.filtros[indice].gain.value = decibelios;
    }

    setNormalizar(activo) {
      this.normalizar = !!activo;
      if (this.contexto) this._conectarSalida();
    }

    setVolumen(valor) {
      this.volumen = valor;
      if (this.maestro) this.maestro.gain.setTargetAtTime(valor, this.contexto.currentTime, 0.02);
    }

    /** Cambia el volumen de un canal poco a poco (para el fundido). */
    fundido(elemento, desde, hasta, segundos) {
      const g = this.canales.get(elemento);
      if (!g) return;
      const t = this.contexto.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(desde, t);
      g.gain.linearRampToValueAtTime(hasta, t + segundos);
    }

    fijarGanancia(elemento, valor) {
      const g = this.canales.get(elemento);
      if (!g) return;
      g.gain.cancelScheduledValues(this.contexto.currentTime);
      g.gain.setValueAtTime(valor, this.contexto.currentTime);
    }

    /** Devuelve la intensidad de cada frecuencia (0-255) en este instante. */
    datosFrecuencia() {
      if (!this.analizador) return null;
      const datos = new Uint8Array(this.analizador.frequencyBinCount);
      this.analizador.getByteFrequencyData(datos);
      return datos;
    }
  }
  MotorAudio.BANDAS = BANDAS;
  Onda.MotorAudio = MotorAudio;

  /** Ajustes del ecualizador ya preparados (en decibelios, 5 bandas). */
  Onda.PRESETS_EQ = {
    'Plano':  [0, 0, 0, 0, 0],
    'Graves': [7, 4, 0, -1, -2],
    'Voz':    [-3, -1, 4, 3, 0],
    'Agudos': [-2, -1, 0, 4, 7],
    'Rock':   [5, 2, -2, 3, 5],
    'Pop':    [-1, 3, 4, 2, -1]
  };

  /* ----------------------------------------------------------
   * 3. VISUALIZADOR DE BARRAS
   * ---------------------------------------------------------- */
  class Visualizador {
    /**
     * @param {HTMLCanvasElement} canvas  lienzo donde dibujar
     * @param {MotorAudio} motor          de dónde sacar los datos
     * @param {() => string} color        función que devuelve el color actual
     */
    constructor(canvas, motor, color) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.motor = motor;
      this.color = color || (() => '#8b5cf6');
      this.activo = false;
      this._bucle = this._bucle.bind(this);
    }
    iniciar() { if (!this.activo) { this.activo = true; requestAnimationFrame(this._bucle); } }
    detener() { this.activo = false; }
    _bucle() {
      if (!this.activo) return;
      const { canvas, ctx } = this;
      const ancho = canvas.clientWidth, alto = canvas.clientHeight;
      if (canvas.width !== ancho * devicePixelRatio) {
        canvas.width = ancho * devicePixelRatio;
        canvas.height = alto * devicePixelRatio;
      }
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
      const datos = this.motor.datosFrecuencia();
      if (datos) {
        const n = 48;                       // número de barras que dibujamos
        const hueco = 3;
        const anchoBarra = (ancho - hueco * (n - 1)) / n;
        ctx.fillStyle = this.color();
        for (let i = 0; i < n; i++) {
          const valor = datos[Math.floor(i * (datos.length * 0.75) / n)] / 255;
          const h = Math.max(2, valor * alto);
          const x = i * (anchoBarra + hueco);
          ctx.globalAlpha = 0.35 + valor * 0.65;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, alto - h, anchoBarra, h, 3);
          else ctx.rect(x, alto - h, anchoBarra, h);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(this._bucle);
    }
  }
  Onda.Visualizador = Visualizador;

  /* ----------------------------------------------------------
   * 4. GRABADORA (micrófono, cámara o pantalla)
   * ----------------------------------------------------------
   * getUserMedia pide permiso para micrófono/cámara,
   * getDisplayMedia para compartir la pantalla,
   * y MediaRecorder guarda lo que llega en trozos (Blob).
   * ---------------------------------------------------------- */
  class Grabadora {
    constructor() { this.flujo = null; this.grabador = null; this.trozos = []; this.fuente = null; }

    /** Pide permiso y devuelve el flujo (stream) para poder previsualizarlo. */
    async preparar(fuente) {
      this.liberar();
      const md = navigator.mediaDevices;
      if (!md) throw new Error('Este navegador no permite grabar (abre la página con Live Server o https).');
      if (fuente === 'microfono') this.flujo = await md.getUserMedia({ audio: true });
      else if (fuente === 'camara') this.flujo = await md.getUserMedia({ audio: true, video: true });
      else if (fuente === 'pantalla') this.flujo = await md.getDisplayMedia({ video: true, audio: true });
      else throw new Error('Fuente desconocida: ' + fuente);
      this.fuente = fuente;
      return this.flujo;
    }

    _formato() {
      const lista = this.fuente === 'microfono'
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      return lista.find(t => global.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    }

    iniciar() {
      if (!this.flujo) throw new Error('Primero hay que preparar una fuente.');
      this.trozos = [];
      const formato = this._formato();
      this.grabador = new MediaRecorder(this.flujo, formato ? { mimeType: formato } : undefined);
      this.grabador.ondataavailable = e => { if (e.data && e.data.size) this.trozos.push(e.data); };
      this.grabador.start(250); // guarda un trozo cada 250 ms
    }

    /** Para la grabación y devuelve un Blob con el resultado. */
    detener() {
      return new Promise(resolve => {
        if (!this.grabador || this.grabador.state === 'inactive') return resolve(null);
        this.grabador.onstop = () => {
          const blob = new Blob(this.trozos, { type: this.grabador.mimeType || 'video/webm' });
          this.liberar();
          resolve(blob);
        };
        this.grabador.stop();
      });
    }

    get grabando() { return !!this.grabador && this.grabador.state === 'recording'; }

    /** Apaga micrófono/cámara para que se quite el piloto rojo del navegador. */
    liberar() {
      if (this.flujo) this.flujo.getTracks().forEach(pista => pista.stop());
      this.flujo = null;
    }
  }
  Onda.Grabadora = Grabadora;

  /* ----------------------------------------------------------
   * 5. CONVERSIÓN A WAV
   * ----------------------------------------------------------
   * Un WAV es el formato más sencillo: una cabecera de 44 bytes
   * y después todas las muestras de sonido una detrás de otra.
   * Lo escribimos byte a byte con un DataView.
   * ---------------------------------------------------------- */
  Onda.codificarWav = function (buffer) {
    const canales = buffer.numberOfChannels;
    const frecuencia = buffer.sampleRate;
    const muestras = buffer.length;
    const tamDatos = muestras * canales * 2; // 2 bytes = 16 bits por muestra
    const ab = new ArrayBuffer(44 + tamDatos);
    const v = new DataView(ab);
    const texto = (pos, t) => { for (let i = 0; i < t.length; i++) v.setUint8(pos + i, t.charCodeAt(i)); };

    texto(0, 'RIFF');  v.setUint32(4, 36 + tamDatos, true);  texto(8, 'WAVE');
    texto(12, 'fmt '); v.setUint32(16, 16, true);            // tamaño del bloque fmt
    v.setUint16(20, 1, true);                                // 1 = PCM (sin comprimir)
    v.setUint16(22, canales, true);
    v.setUint32(24, frecuencia, true);
    v.setUint32(28, frecuencia * canales * 2, true);         // bytes por segundo
    v.setUint16(32, canales * 2, true);                      // bytes por "instante"
    v.setUint16(34, 16, true);                               // bits por muestra
    texto(36, 'data'); v.setUint32(40, tamDatos, true);

    const datosCanales = [];
    for (let c = 0; c < canales; c++) datosCanales.push(buffer.getChannelData(c));
    let pos = 44;
    for (let i = 0; i < muestras; i++) {
      for (let c = 0; c < canales; c++) {
        const s = Math.max(-1, Math.min(1, datosCanales[c][i]));
        v.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        pos += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  };

  /** Decodifica cualquier audio (o el audio de un vídeo) y lo devuelve en WAV. */
  Onda.convertirAWav = async function (archivo) {
    const datos = await archivo.arrayBuffer();
    const Contexto = global.AudioContext || global.webkitAudioContext;
    const ctx = new Contexto();
    try {
      const buffer = await ctx.decodeAudioData(datos);
      return Onda.codificarWav(buffer);
    } finally {
      ctx.close();
    }
  };

  /** Captura el fotograma actual de un vídeo como imagen PNG. */
  Onda.capturarFotograma = function (video, filtroCSS) {
    return new Promise((resolve, reject) => {
      if (!video.videoWidth) return reject(new Error('No hay vídeo cargado.'));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (filtroCSS) ctx.filter = filtroCSS; // aplica los mismos efectos que se ven
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.')), 'image/png');
    });
  };

  /* ----------------------------------------------------------
   * 6. LETRAS (.lrc) Y SUBTÍTULOS (.srt -> .vtt)
   * ---------------------------------------------------------- */

  /**
   * Un .lrc tiene líneas así:  [01:23.45]Texto de la canción
   * Devuelve [{ tiempo: 83.45, texto: 'Texto de la canción' }, ...]
   */
  Onda.leerLRC = function (texto) {
    const lineas = [];
    texto.split(/\r?\n/).forEach(linea => {
      const marcas = [...linea.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      if (!marcas.length) return;
      const frase = linea.replace(/\[[^\]]*\]/g, '').trim();
      marcas.forEach(m => {
        const decimales = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0;
        lineas.push({ tiempo: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + decimales, texto: frase });
      });
    });
    return lineas.sort((a, b) => a.tiempo - b.tiempo);
  };

  /** Devuelve qué línea de la letra toca en un segundo concreto. */
  Onda.lineaActual = function (lineas, segundo) {
    let indice = -1;
    for (let i = 0; i < lineas.length; i++) {
      if (lineas[i].tiempo <= segundo) indice = i; else break;
    }
    return indice;
  };

  /**
   * El navegador solo entiende subtítulos WebVTT. Un .srt es casi igual:
   * solo cambia la coma de los milisegundos por un punto y la cabecera.
   */
  Onda.srtAVtt = function (srt) {
    const cuerpo = srt.replace(/^﻿/, '').replace(/\r/g, '')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2').trim();
    return 'WEBVTT\n\n' + cuerpo + '\n';
  };

  global.Onda = Onda;
})(typeof window !== 'undefined' ? window : globalThis);
