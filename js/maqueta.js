/* ═══════════════════════════════════════════════════════════════════
   JP Coach de Música — maqueta
   Sin librerías, sin parallax, sin scroll-jacking, sin carrusel
   automático, sin autoplay, sin cursor personalizado.
   Todo el movimiento se apaga con prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── El vúmetro ──
     Columnas del mismo cuadrado del isotipo. Los niveles salen de una
     envolvente que decae hacia la derecha más tres senos que no cierran entre
     sí: da una curva de espectro que no se repite a lo ancho. Nada de azar,
     así la maqueta se ve igual en cada carga y en cada captura.
     Los niveles van en bloques ENTEROS, para que ninguna columna corte un
     cuadrado por la mitad. */
  function armarVumetro(el) {
    var cs = getComputedStyle(el);
    var ancho = el.clientWidth || 320;
    var pasos = parseInt(cs.getPropertyValue('--vu-pasos'), 10) || 9;
    var bloque = parseFloat(cs.getPropertyValue('--vu-bloque')) || 16;
    var aire = parseFloat(cs.getPropertyValue('--vu-aire')) || 5;
    var paso = bloque + aire;
    var cantidad = Math.max(9, Math.min(200, Math.ceil((ancho + aire) / paso)));
    var html = '';

    for (var i = 0; i < cantidad; i++) {
      var t = cantidad > 1 ? i / (cantidad - 1) : 0;
      // envolvente: más carga en los graves, a la izquierda, como cualquier analizador
      var envolvente = 0.34 + 0.33 * Math.pow(1 - t, 0.9);
      // tres senos que no cierran entre sí: el dibujo nunca se repite a lo ancho
      var onda = 0.23 * Math.sin(i * 0.83) +
                 0.15 * Math.sin(i * 1.97 + 0.7) +
                 0.09 * Math.sin(i * 3.11 + 2.2);

      var na = nivelEnBloques(envolvente + onda, pasos);
      var nb = nivelEnBloques(envolvente - onda * 0.85, pasos);
      if (na === nb) nb = na >= pasos ? na - 1 : na + 1;            // que siempre haya salto

      html += '<i style="' +
        '--a:' + recorte(na, pasos) + ';' +
        '--b:' + recorte(nb, pasos) + ';' +
        '--dur:' + (0.95 + ((i * 7) % 11) * 0.09).toFixed(2) + 's;' +
        '--esp:-' + (((i * 5) % 13) * 0.11).toFixed(2) + 's"></i>';
    }
    el.innerHTML = html;
  }

  function nivelEnBloques(v, pasos) {
    return Math.max(1, Math.min(pasos, Math.round(v * pasos)));
  }

  /* recorte desde arriba, en píxeles de la propia grilla: deja n bloques enteros */
  function recorte(n, pasos) {
    return 'calc(' + (pasos - n) + ' * var(--vu-paso))';
  }

  var vumetros = document.querySelectorAll('[data-vumetro]');
  Array.prototype.forEach.call(vumetros, function (el) {
    armarVumetro(el);
    el.classList.add('esta-visible');
  });

  var reajuste;
  window.addEventListener('resize', function () {
    clearTimeout(reajuste);
    reajuste = setTimeout(function () {
      Array.prototype.forEach.call(vumetros, function (el) {
        armarVumetro(el);
        el.classList.add('esta-visible');
      });
    }, 200);
  });

  /* ── El vúmetro escucha ──
     Mientras suena un video, el fondo deja de animarse solo y pasa a moverse
     con la música de verdad. Es una página de música; el ecualizador tiene que
     ecualizar algo.

     El espectro de cada video viene calculado de antemano, en
     img/video/<nombre>.espectro.bin (lo arma 05-web/_fuente/espectro-videos.py),
     y se lee según el segundo que va sonando. El audio del video no pasa por
     ningún lado: suena nativo, como cualquier video.

     (Antes se analizaba en vivo con captureStream. En Safari, iPhone incluido,
     no existe, así que el fondo no se movía; y en Chrome el analizador saturaba
     y las columnas quedaban clavadas arriba. Pasar el video por Web Audio
     tampoco sirve: en el iPhone lo deja mudo con el silenciador puesto.) */

  var espectros = {};            // url del .bin → promesa del espectro (null si no hay)
  var sonando = null, lazo = null;

  function cargarEspectro(video) {
    var fuente = video.querySelector('source');
    var src = video.currentSrc || (fuente && fuente.src) || '';
    var url = src.replace(/\.mp4(\?.*)?$/, '.espectro.bin');
    if (!url || url === src || !window.fetch) return Promise.resolve(null);
    if (!espectros[url]) {
      espectros[url] = fetch(url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) {
          var b = new Uint8Array(buf);
          if (b.length < 5 || b[0] !== 86 || b[1] !== 85) return null;   // cabecera "VU"
          return { fps: b[2], bandas: b[3], datos: b.subarray(4), cuadros: Math.floor((b.length - 4) / b[3]) };
        })
        .catch(function () { return null; });
    }
    return espectros[url];
  }

  function arrancarLazo(video, esp) {
    if (quieto || !esp || !vumetros.length) return;
    if (sonando === video && lazo) return;
    pararLazo();
    sonando = video;
    var barra = vumetros[0];
    var cols = barra.children;               // viva: si cambia el ancho y se rearma, la sigue
    var previos = [], pasos = 12;
    barra.classList.add('esta-escuchando');

    function pintar() {
      if (sonando !== video || video.paused || video.ended) { pararLazo(); return; }
      if (previos.length !== cols.length) {
        previos = new Array(cols.length).fill(-1);
        pasos = parseInt(getComputedStyle(barra).getPropertyValue('--vu-pasos'), 10) || 12;
      }
      var posicion = Math.max(0, video.currentTime * esp.fps);
      var c0 = Math.min(esp.cuadros - 1, Math.floor(posicion));
      var c1 = Math.min(esp.cuadros - 1, c0 + 1);
      var mezcla = posicion - Math.floor(posicion);
      for (var i = 0; i < cols.length; i++) {
        // cada columna toma su banda: graves a la izquierda, agudos a la derecha
        var banda = Math.min(esp.bandas - 1, Math.floor(i / cols.length * esp.bandas));
        var v = (esp.datos[c0 * esp.bandas + banda] * (1 - mezcla) +
                 esp.datos[c1 * esp.bandas + banda] * mezcla) / 255;
        var n = Math.max(1, Math.min(pasos, Math.round(v * pasos)));
        if (n !== previos[i]) {            // sólo se escribe si cambió de bloque
          previos[i] = n;
          cols[i].style.clipPath = 'inset(calc(' + (pasos - n) + ' * var(--vu-paso)) 0 0 0)';
        }
      }
      lazo = requestAnimationFrame(pintar);
    }
    lazo = requestAnimationFrame(pintar);
  }

  function pararLazo() {
    if (lazo) { cancelAnimationFrame(lazo); lazo = null; }
    sonando = null;
    Array.prototype.forEach.call(vumetros, function (b) {
      b.classList.remove('esta-escuchando');
      Array.prototype.forEach.call(b.querySelectorAll('i'), function (c) { c.style.clipPath = ''; });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-video]'), function (caja) {
    var video = caja.querySelector('video');
    var boton = caja.querySelector('[data-reproducir]');
    if (!video || !boton) return;

    function escuchar() {
      cargarEspectro(video).then(function (esp) {
        if (!video.paused && !video.ended) arrancarLazo(video, esp);
      });
    }

    boton.addEventListener('click', function () {
      // uno por vez: si hay otro sonando, se para
      Array.prototype.forEach.call(document.querySelectorAll('[data-video] video'), function (otro) {
        if (otro !== video) { otro.pause(); otro.closest('[data-video]').classList.remove('esta-sonando'); }
      });
      cargarEspectro(video);                   // se pide ya: está listo cuando arranca el sonido
      video.controls = true;
      video.play().catch(function () {});
    });

    video.addEventListener('play', function () { caja.classList.add('esta-sonando'); escuchar(); });
    video.addEventListener('playing', escuchar);

    ['pause', 'ended'].forEach(function (ev) {
      video.addEventListener(ev, function () {
        if (ev === 'ended') caja.classList.remove('esta-sonando');
        if (sonando === video) pararLazo();
      });
    });
  });

  /* la marca del contacto arranca a ecualizar cuando la sección entra en pantalla */
  var contacto = document.getElementById('contacto');
  if (contacto && 'IntersectionObserver' in window) {
    var ojoContacto = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        contacto.classList.add('esta-visible');
        ojoContacto.unobserve(contacto);
      });
    }, { threshold: 0.08 });
    ojoContacto.observe(contacto);
  } else if (contacto) {
    contacto.classList.add('esta-visible');
  }

  /* ── Aparición al entrar en pantalla ──
     IntersectionObserver + cambio de clase + unobserve. Nada más. */
  var candidatos = document.querySelectorAll(
    '.puerta, .etapa, .resena, .instrumentos li, .cita-prensa, .cita-grande, ' +
    '.evidencia, .datos-duros, .puntaje, .temas__lista li'
  );

  if (!quieto && 'IntersectionObserver' in window) {
    Array.prototype.forEach.call(candidatos, function (el, i) {
      el.classList.add('aparece');
      el.style.transitionDelay = (i % 4) * 90 + 'ms';
    });

    var mirador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('esta-visible');
        mirador.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    Array.prototype.forEach.call(candidatos, function (el) { mirador.observe(el); });
  } else {
    Array.prototype.forEach.call(candidatos, function (el) { el.classList.add('esta-visible'); });
  }

  /* ── Carrusel de casos ──
     El scroll lo hace el navegador; acá sólo se sincroniza la navegación.
     Sin autoplay: un carrusel que se mueve solo le pasa por arriba a quien
     todavía está leyendo la tarjeta anterior. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-casos], [data-carrusel]'), armarCarrusel);

  function armarCarrusel(casos) {
    var pista = casos.querySelector('[data-pista]');
    var tarjetas = Array.prototype.slice.call(pista.children);
    var puntos = Array.prototype.slice.call(casos.querySelectorAll('[data-ir]'));
    var flechas = Array.prototype.slice.call(casos.querySelectorAll('[data-mover]'));
    var actual = 0;

    function irA(i) {
      i = Math.max(0, Math.min(tarjetas.length - 1, i));
      pista.scrollTo({
        left: tarjetas[i].offsetLeft - pista.offsetLeft,
        behavior: quieto ? 'auto' : 'smooth'
      });
    }

    function marcar(i) {
      actual = i;
      puntos.forEach(function (p, n) {
        if (n === i) { p.setAttribute('aria-current', 'true'); }
        else { p.removeAttribute('aria-current'); }
      });
      flechas.forEach(function (f) {
        var d = +f.getAttribute('data-mover');
        f.disabled = (d < 0 && i === 0) || (d > 0 && i === tarjetas.length - 1);
      });
    }

    puntos.forEach(function (p, i) {
      p.addEventListener('click', function () { irA(i); });
    });
    flechas.forEach(function (f) {
      f.addEventListener('click', function () { irA(actual + (+f.getAttribute('data-mover'))); });
    });

    /* con el teclado, la pista se recorre con las flechas */
    pista.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); irA(actual + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); irA(actual - 1); }
    });

    /* Qué tarjeta está a la vista manda sobre la navegación, no al revés: así
       arrastrar con el dedo también actualiza el nombre marcado.
       Se toma la tarjeta más cercana al borde izquierdo de la pista. Con un
       observador no alcanzaba: cuando entran dos tarjetas enteras en pantalla,
       las dos cruzan el umbral y quedaba marcada la segunda. */
    var pendienteScroll;
    function sincronizar() {
      var x = pista.scrollLeft;
      var mejor = 0, dist = Infinity;
      tarjetas.forEach(function (t, i) {
        var d = Math.abs((t.offsetLeft - tarjetas[0].offsetLeft) - x);
        if (d < dist) { dist = d; mejor = i; }
      });
      if (mejor !== actual) marcar(mejor);
    }
    pista.addEventListener('scroll', function () {
      if (pendienteScroll) return;
      pendienteScroll = requestAnimationFrame(function () {
        pendienteScroll = null;
        sincronizar();
      });
    }, { passive: true });

    marcar(0);
  }

  /* ── Los números suben ──
     Los datos duros del encabezado cuentan desde cero cuando entran en pantalla.
     Una sola vez: si se repite en cada scroll, cansa.
     Con movimiento reducido aparecen ya en su valor final, sin contar.
     OJO: sólo se anima acá. El 160 de la cita de El Cronista queda quieto a
     propósito — un dato que sube desde cero se lee como truco de landing, y
     justo ahí lo que hace falta es que se lea como fuente. */
  function animarNumero(el) {
    var destino = el.getAttribute('data-contar') || '';
    var decimales = parseInt(el.getAttribute('data-decimales'), 10) || 0;
    var valor = parseFloat(destino.replace(',', '.'));
    if (isNaN(valor)) return;

    if (quieto) { el.textContent = destino; return; }

    var duracion = 1100, inicio = null;
    function paso(t) {
      if (inicio === null) inicio = t;
      var avance = Math.min(1, (t - inicio) / duracion);
      var suave = 1 - Math.pow(1 - avance, 3);          // frena al final
      var actual = valor * suave;
      el.textContent = decimales
        ? actual.toFixed(decimales).replace('.', ',')
        : String(Math.round(actual));
      if (avance < 1) requestAnimationFrame(paso);
      else el.textContent = destino;                    // cierra exacto
    }
    requestAnimationFrame(paso);
  }

  var contadores = document.querySelectorAll('[data-contar]');
  var estrellitas = document.querySelectorAll('[data-estrellas]');

  if ('IntersectionObserver' in window) {
    // Cuenta apenas asoma: con 0.6, un número a medio asomar en el borde de la
    // pantalla se quedaba en «0» hasta que se scrolleaba un poco más.
    var ojoNumeros = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (e.target.hasAttribute('data-estrellas')) e.target.classList.add('esta-visible');
        else animarNumero(e.target);
        ojoNumeros.unobserve(e.target);
      });
    }, { threshold: 0.1 });
    Array.prototype.forEach.call(contadores, function (el) {
      if (!quieto) el.textContent = decimalesCero(el);   // arranca en cero, no en el valor
      ojoNumeros.observe(el);
    });
    Array.prototype.forEach.call(estrellitas, function (el) { ojoNumeros.observe(el); });
  } else {
    Array.prototype.forEach.call(estrellitas, function (el) { el.classList.add('esta-visible'); });
  }

  function decimalesCero(el) {
    var d = parseInt(el.getAttribute('data-decimales'), 10) || 0;
    return d ? (0).toFixed(d).replace('.', ',') : '0';
  }

  /* ── La foto de fondo ──
     Se enciende sólo mientras Academia está en pantalla. Es fixed y vive en
     z-index -1, así que la tapa cualquier sección que tenga fondo propio: sólo
     se ve a través de las transparentes, que es justo el efecto buscado. */
  var fondoFoto = document.querySelector('[data-fondo-foto]');
  var academia = document.getElementById('academia');
  if (fondoFoto && academia && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        fondoFoto.classList.toggle('esta-visible', e.isIntersecting);
      });
    }, { rootMargin: '-10% 0px -10% 0px' }).observe(academia);
  }

  /* ── Barra fija de celular ──
     Aparece después del encabezado y no vuelve a cambiar. Un solo destino:
     una barra que se da vuelta sola según el scroll le muestra a la persona
     el botón equivocado justo cuando decide escribir. */
  var barra = document.getElementById('barra-fija');
  var puertas = document.getElementById('puertas');
  if (barra && puertas && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        barra.classList.toggle('esta-visible', e.boundingClientRect.top < 0);
      });
    }, { threshold: 0 }).observe(puertas);
  }

  /* ── Menú de celular ── */
  var abrir = document.getElementById('abrir-menu');
  var menu = document.getElementById('cabecera-nav-movil');
  if (abrir && menu) {
    abrir.addEventListener('click', function () {
      var abierto = abrir.getAttribute('aria-expanded') === 'true';
      abrir.setAttribute('aria-expanded', String(!abierto));
      menu.hidden = abierto;
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        menu.hidden = true;
        abrir.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Formulario: los campos de empresa aparecen solos ──
     Le ahorra a RRHH tener que escribir un mail explicando todo de cero,
     y no le muestra a la mamá campos que no son suyos. */
  var campos = document.getElementById('campos-empresa');
  var radios = document.querySelectorAll('input[name="busca"]');
  if (campos && radios.length) {
    Array.prototype.forEach.call(radios, function (r) {
      r.addEventListener('change', function () {
        campos.hidden = document.querySelector('input[name="busca"]:checked').value !== 'equipo';
      });
    });
  }

  /* ── Formulario: por ahora manda los datos por WhatsApp ──
     Todavía no hay casilla con el dominio nuevo. Mientras tanto, Enviar abre
     WhatsApp con el mensaje ya escrito para JP: no depende de ningún servicio. */
  var form = document.querySelector('.formulario');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var datos = new FormData(form);
      var valor = function (campo) { return String(datos.get(campo) || '').trim(); };
      var equipo = valor('busca') === 'equipo';
      var lineas = [
        'Hola Juan Pablo! Te escribo desde tu página.',
        'Nombre: ' + valor('nombre'),
        'Teléfono: ' + valor('telefono'),
        'Busco: ' + (equipo ? 'una experiencia para mi equipo' : 'clases')
      ];
      if (equipo) {
        [['empresa', 'Empresa'], ['personas', 'Cuántas personas'], ['fecha', 'Fecha tentativa']].forEach(function (c) {
          if (valor(c[0])) lineas.push(c[1] + ': ' + valor(c[0]));
        });
      }
      if (window.medir) window.medir('generate_lead', { metodo: 'formulario_whatsapp', busca: equipo ? 'equipo' : 'clases' });
      var url = 'https://wa.me/5491150458850?text=' + encodeURIComponent(lineas.join('\n'));
      // con 'noopener' window.open devuelve null aunque abra: por eso se corta el opener a mano
      var ventana = window.open(url, '_blank');
      if (ventana) ventana.opener = null;
      else location.href = url;
    });
  }

  /* ── Formulario plegado en celular ──
     En celular el camino principal es el botón de WhatsApp: el formulario queda
     detrás de «Prefiero dejar mi contacto». En escritorio se ve siempre. */
  var abrirFormulario = document.querySelector('[data-abrir-formulario]');
  if (abrirFormulario && form) {
    abrirFormulario.addEventListener('click', function () {
      form.classList.add('esta-abierto');
      abrirFormulario.setAttribute('aria-expanded', 'true');
      abrirFormulario.hidden = true;
      var primero = form.querySelector('input');
      if (primero) primero.focus();
    });
  }

  /* ── Tema claro u oscuro ──
     Arranca siempre oscuro (paleta A). Si eligen el claro (paleta B), dura lo
     que dura la visita: va a sessionStorage y no a localStorage, así la próxima
     vez vuelve a abrir oscura. El primer pintado lo resuelve el script pegado
     al <body>, para que no parpadee. */
  var botonTema = document.getElementById('cambiar-tema');
  function rotularBotonTema() {
    var rotulo = document.body.getAttribute('data-paleta') === 'b' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
    botonTema.setAttribute('aria-label', rotulo);
    botonTema.title = rotulo;
  }
  if (botonTema) {
    rotularBotonTema();
    botonTema.addEventListener('click', function () {
      var claro = document.body.getAttribute('data-paleta') !== 'b';
      document.body.setAttribute('data-paleta', claro ? 'b' : 'a');
      try { sessionStorage.setItem('jp-tema', claro ? 'claro' : 'oscuro'); } catch (err) {}
      rotularBotonTema();
    });
  }
})();
