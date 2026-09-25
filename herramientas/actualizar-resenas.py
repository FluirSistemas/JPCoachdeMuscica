# -*- coding: utf-8 -*-
"""Trae el puntaje y la cantidad de reseñas de la ficha de Google y los escribe en la página.

Lo corre solo la tarea `.github/workflows/actualizar-resenas.yml`, una vez por semana.
No lo llama la página: si la consulta saliera del navegador, cada visita sería una
llamada facturable y la clave quedaría a la vista. Acá la clave es un secreto del repo
y lo que se publica es el número ya escrito en el HTML.

    CLAVE_GOOGLE=xxx python herramientas/actualizar-resenas.py
    python herramientas/actualizar-resenas.py --probar 4.9 46   (sin llamar a Google)

Toca cuatro lugares de index.html: el dato del encabezado, el 5,0, la línea de
«44 reseñas en Google» y el botón. Las estrellas se dibujan según el puntaje: las que
sobran quedan de contorno. Si Google no contesta o devuelve algo raro, no cambia nada
y termina con error: la página sigue mostrando el último número bueno.

Las reseñas en sí no se tocan. Las tres que están elegidas —las que hablan de confianza,
seguridad y creatividad— las elegimos nosotros, y ese campo además es de otro SKU.
"""
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PAGINA = RAIZ / "index.html"
LUGAR = RAIZ / "herramientas" / "lugar.json"

# El negocio, por si hay que volver a buscar su identificador en Google.
CONSULTA = "Juan P. Granatelli Música & Liderazgo, Teodoro Vilardebó 2000, Buenos Aires"
SENAS = ("granatelli", "vilardeb")   # para no quedarnos con otro lugar parecido


def pedir(url, cabeceras, cuerpo=None):
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    pedido = urllib.request.Request(url, data=datos, headers=cabeceras)
    if datos:
        pedido.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit("Google contestó %d: %s" % (e.code, e.read().decode("utf-8", "replace")[:400]))
    except urllib.error.URLError as e:
        raise SystemExit("no se pudo hablar con Google: %s" % e.reason)


def identificador(clave):
    """El id del lugar. Se busca una sola vez y queda guardado en lugar.json."""
    if LUGAR.exists():
        return json.loads(LUGAR.read_text(encoding="utf-8"))["id"]

    salida = pedir("https://places.googleapis.com/v1/places:searchText",
                   {"X-Goog-Api-Key": clave, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress"},
                   {"textQuery": CONSULTA, "languageCode": "es"})
    lugares = salida.get("places") or []
    if not lugares:
        raise SystemExit("Google no encontró el negocio con esta consulta: " + CONSULTA)

    primero = lugares[0]
    texto = (primero.get("displayName", {}).get("text", "") + " " + primero.get("formattedAddress", "")).lower()
    if not any(s in texto for s in SENAS):
        raise SystemExit("el primer resultado no parece el negocio: " + texto)

    LUGAR.write_text(json.dumps({
        "id": primero["id"],
        "nombre": primero.get("displayName", {}).get("text", ""),
        "direccion": primero.get("formattedAddress", ""),
        "_nota": "Lo busca solo actualizar-resenas.py. Si cambia el negocio, se borra este archivo."
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("identificador del lugar guardado: %s (%s)" % (primero["id"], primero.get("displayName", {}).get("text", "")))
    return primero["id"]


def consultar(clave):
    ident = identificador(clave)
    ficha = pedir("https://places.googleapis.com/v1/places/" + ident,
                  {"X-Goog-Api-Key": clave, "X-Goog-FieldMask": "rating,userRatingCount"})
    return float(ficha["rating"]), int(ficha["userRatingCount"])


def escribir(html, puntaje, cantidad):
    """Deja los cuatro lugares con el número nuevo y dibuja las estrellas que van."""
    texto_puntaje = ("%.1f" % puntaje).replace(".", ",")
    llenas = min(5, max(0, round(puntaje)))

    html = re.sub(r"(<span data-resenas>)\d+(</span>)", r"\g<1>%d\g<2>" % cantidad, html)
    html = re.sub(r"(<b data-puntaje>)[^<]*(</b>)", r"\g<1>%s\g<2>" % texto_puntaje, html)
    html = re.sub(r'aria-label="[\d.,]+ de 5 estrellas', 'aria-label="%s de 5 estrellas' % texto_puntaje, html)

    def estrellas(m):
        apertura, adentro, cierre = m.group(1), m.group(2), m.group(3)
        adentro = adentro.replace('<svg class="vacia" ', "<svg ")
        partes = adentro.split("</svg>")
        svgs = [p + "</svg>" for p in partes[:-1]]
        for i in range(llenas, len(svgs)):
            svgs[i] = svgs[i].replace("<svg ", '<svg class="vacia" ', 1)
        return apertura + "".join(svgs) + partes[-1] + cierre

    html = re.sub(r"(<span class=\"estrellas[^>]*data-estrellas>)(.*?)(</span>)", estrellas, html, flags=re.S)
    return html


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--probar":
        puntaje, cantidad = float(sys.argv[2]), int(sys.argv[3])
    else:
        clave = os.environ.get("CLAVE_GOOGLE", "").strip()
        if not clave:
            # Todavía no está cargado el secreto del repo. No es un error: la página
            # se queda con el último número bueno y la tarea no molesta cada lunes.
            print("falta el secreto CLAVE_GOOGLE: no se consultó nada y la página queda como está")
            return
        puntaje, cantidad = consultar(clave)

    if not (0 < puntaje <= 5) or cantidad <= 0:
        raise SystemExit("Google devolvió algo raro: puntaje %s, %s reseñas" % (puntaje, cantidad))

    crudo = PAGINA.read_bytes().decode("utf-8")
    anterior = re.search(r"<span data-resenas>(\d+)</span>", crudo)
    if anterior and cantidad < int(anterior.group(1)) * 0.6:
        raise SystemExit("la cantidad cayó de %s a %s: se revisa a mano antes de publicarlo"
                         % (anterior.group(1), cantidad))

    nuevo = escribir(crudo, puntaje, cantidad)
    if nuevo == crudo:
        print("sin cambios: la página ya dice %s con %d reseñas" % (("%.1f" % puntaje).replace(".", ","), cantidad))
        return
    PAGINA.write_bytes(nuevo.encode("utf-8"))
    print("actualizado: %s con %d reseñas" % (("%.1f" % puntaje).replace(".", ","), cantidad))


if __name__ == "__main__":
    main()
