/* ═══════════════════════════════════════════════════════════════════════
   JP Coach de Música — medición: estadísticas y píxel
   Queda instalada y APAGADA. Para prenderla se completan los IDs de abajo y
   se sube. Con todo vacío no se carga nada de afuera y no aparece el aviso.

   · Con Google Tag Manager alcanza con `gtm`: GA4 y el píxel de Meta se
     configuran adentro de GTM, y `ga4` y `metaPixel` quedan vacíos para no
     contar todo dos veces.
   · Sin GTM, `ga4` y `metaPixel` cargan directo.

   Eventos que la página ya manda (a dataLayer siempre; a GA4 y al píxel si
   están cargados directo):
     click_whatsapp  { ubicacion }         píxel: Contact
     generate_lead   { metodo, busca }     píxel: Lead
     video_start     { video }             píxel: VideoStart (personalizado)
     select_content  { content_type: 'puerta', item_id: 'academia' | 'empresas' }
     click_resenas   {}
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  var MEDICION = {
    gtm: '',         // 'GTM-XXXXXXX'
    ga4: '',         // 'G-XXXXXXXXXX'
    metaPixel: '',   // '123456789012345'
    // La página ofrece clases online en España: para esas visitas pedir
    // permiso antes de medir es obligatorio.
    pedirConsentimiento: true
  };

  var activa = !!(MEDICION.gtm || MEDICION.ga4 || MEDICION.metaPixel);
  var CLAVE = 'jp-consentimiento';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  function eleccionGuardada() {
    try { return localStorage.getItem(CLAVE); } catch (err) { return null; }
  }
  var permiso = !MEDICION.pedirConsentimiento || eleccionGuardada() === 'aceptado' ? 'granted' : 'denied';

  /* ── Modo de consentimiento ──
     Va antes de cargar cualquier etiqueta: hasta que acepten, Google no guarda
     cookies y el píxel no manda nada. */
  gtag('consent', 'default', {
    ad_storage: permiso, ad_user_data: permiso, ad_personalization: permiso,
    analytics_storage: permiso, wait_for_update: 500
  });

  function cargar(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  if (MEDICION.gtm) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    cargar('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(MEDICION.gtm));
  }
  if (MEDICION.ga4) {
    gtag('js', new Date());
    gtag('config', MEDICION.ga4);
    cargar('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEDICION.ga4));
  }
  if (MEDICION.metaPixel) {
    // el snippet oficial del píxel, desarmado para que se lea
    var fbq = window.fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments); else fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    if (permiso === 'denied') fbq('consent', 'revoke');
    fbq('init', MEDICION.metaPixel);
    fbq('track', 'PageView');
    cargar('https://connect.facebook.net/en_US/fbevents.js');
  }

  /* ── medir(evento, datos) ──
     La usa también js/maqueta.js para el formulario. */
  var PIXEL = {
    click_whatsapp: ['track', 'Contact'],
    generate_lead: ['track', 'Lead'],
    video_start: ['trackCustom', 'VideoStart']
  };
  window.medir = function (evento, datos) {
    datos = datos || {};
    var paraDataLayer = { event: evento };
    for (var clave in datos) paraDataLayer[clave] = datos[clave];
    window.dataLayer.push(paraDataLayer);
    if (MEDICION.ga4) gtag('event', evento, datos);
    if (MEDICION.metaPixel && PIXEL[evento]) window.fbq(PIXEL[evento][0], PIXEL[evento][1], datos);
  };

  /* ── Clics: WhatsApp, las dos puertas y las reseñas ── */
  document.addEventListener('click', function (e) {
    var enlace = e.target.closest && e.target.closest('a[href]');
    if (!enlace) return;
    var href = enlace.getAttribute('href');
    if (href.indexOf('wa.me/') !== -1) {
      var seccion = enlace.closest('section[id]');
      var ubicacion = enlace.id === 'barra-fija' ? 'barra_fija'
        : enlace.closest('.cabecera') ? 'cabecera'
        : seccion ? seccion.id : 'otra';
      window.medir('click_whatsapp', { ubicacion: ubicacion });
    } else if (enlace.classList.contains('puerta')) {
      window.medir('select_content', {
        content_type: 'puerta',
        item_id: enlace.classList.contains('puerta--b2b') ? 'empresas' : 'academia'
      });
    } else if (href.indexOf('maps.google.') !== -1) {
      window.medir('click_resenas', {});
    }
  });

  /* ── Videos: la primera vez que arranca cada uno ──
     'play' no burbujea: se escucha en la fase de captura. */
  var arrancados = [];
  document.addEventListener('play', function (e) {
    var video = e.target;
    if (!video || video.tagName !== 'VIDEO' || arrancados.indexOf(video) !== -1) return;
    arrancados.push(video);
    var fuente = video.querySelector('source');
    var archivo = (fuente && fuente.getAttribute('src')) || '';
    window.medir('video_start', { video: archivo.split('/').pop().replace('.mp4', '') });
  }, true);

  /* ── Aviso de cookies ──
     Sólo si la medición está prendida y hay que pedir permiso. Queda un botón
     «Cookies» en el pie para cambiar la respuesta cuando quieran. */
  if (!activa || !MEDICION.pedirConsentimiento) return;

  var aviso = document.createElement('div');
  aviso.className = 'aviso-cookies';
  aviso.setAttribute('role', 'region');
  aviso.setAttribute('aria-label', 'Aviso de cookies');
  aviso.innerHTML =
    '<p>Usamos cookies para saber cuánta gente entra a la página y qué mira. ¿Nos dejás medir tu visita?</p>' +
    '<div class="aviso-cookies__botones">' +
      '<button type="button" class="boton boton--lleno" data-cookies="aceptado">Aceptar</button>' +
      '<button type="button" class="boton boton--linea" data-cookies="rechazado">Rechazar</button>' +
    '</div>';
  aviso.hidden = !!eleccionGuardada();

  aviso.addEventListener('click', function (e) {
    var boton = e.target.closest('[data-cookies]');
    if (!boton) return;
    var valor = boton.getAttribute('data-cookies');
    var estado = valor === 'aceptado' ? 'granted' : 'denied';
    try { localStorage.setItem(CLAVE, valor); } catch (err) {}
    gtag('consent', 'update', {
      ad_storage: estado, ad_user_data: estado, ad_personalization: estado, analytics_storage: estado
    });
    if (window.fbq) window.fbq('consent', valor === 'aceptado' ? 'grant' : 'revoke');
    aviso.hidden = true;
  });

  document.body.appendChild(aviso);

  var legal = document.querySelector('.pie__legal');
  if (legal) {
    var cambiar = document.createElement('button');
    cambiar.type = 'button';
    cambiar.className = 'pie__cookies';
    cambiar.textContent = 'Cookies';
    cambiar.addEventListener('click', function () { aviso.hidden = false; });
    legal.appendChild(document.createTextNode(' · '));
    legal.appendChild(cambiar);
  }
})();
