# FuxoraScope

Análisis de viabilidad de implantación para constructoras, inmobiliarias e
inversionistas. Evalúa un predio y responde: ¿qué tan buena idea es construir
X aquí, y por qué?

## Qué es esto y qué NO es

Este repositorio es un producto **independiente**, con arquitectura y
metodología propias. No comparte código, taxonomía ni motor de cálculo con
ningún otro proyecto. Se construyó desde cero para ser una pieza de
propiedad intelectual autónoma, transferible en su totalidad.

## Metodología (resumen para no técnicos)

1. **Entorno**: se consultan los lugares reales alrededor del predio elegido
   (comercios, colegios, salud, vías, transporte) desde datos abiertos.
2. **Influencia por distancia**: cada lugar cercano no cuenta "sí o no" — su
   peso disminuye mientras más lejos está del predio (decaimiento
   exponencial), así que un supermercado a 50 m pesa más que uno a 480 m
   dentro del mismo radio.
3. **Datos oficiales**: población, viviendas y estrato socioeconómico se
   toman del Censo Nacional 2018 del DANE por manzana censal.
4. **Índice multicriterio**: demanda, competencia, accesibilidad, entorno y
   complementariedad se combinan con una matriz de pesos configurable por
   tipo de negocio — no un peso fijo único para todos los proyectos.
5. **Dictamen e informe**: el veredicto en lenguaje llano y el detalle que lo
   sustenta, en dos páginas tamaño carta listas para PDF.

## Estructura

```
index.html              armazón de la aplicación (una sola página)

src/
  config.js             lo único que se edita al instalar (URL del backend)
  nucleo.js             estado reactivo, enrutador, cliente de API
  motor.js              el índice de viabilidad — el núcleo del producto
  lectura.js            convierte los números en dictamen leíble
  datos.js              conectores a OpenStreetMap y al censo del DANE
  acceso.js             pantallas de cuenta (entrar, registro, verificación)
  estudio.js            pantalla de trabajo: mapa, análisis y resultados
  informe.js            generación del informe de dos páginas
  app.js                barra superior, pantalla de cuenta y arranque

css/
  base.css              fichas de diseño, botones, formularios, avisos
  acceso.css            pantallas de cuenta
  estudio.css           mapa y panel de trabajo

backend/
  fuxorascope-api.gs    API completa en Google Apps Script

docs/
  fuxorascope-api.txt   el mismo script, en .txt, para copiar y pegar entero
```

## Cómo correrlo

**Sin instalar nada.** Abre `index.html` desde cualquier servidor estático.
Mientras `src/config.js` tenga `API_URL: 'PENDIENTE'`, la aplicación corre en
**modo demostración**: las cuentas y los estudios se guardan solo en el
navegador y el código de verificación aparece en pantalla en lugar de llegar
por correo. Toda la interfaz es recorrible así.

**Con backend real.** Sigue las instrucciones que están al inicio de
`backend/fuxorascope-api.gs` (unos 10 minutos, una sola vez) y pega la URL
resultante en `src/config.js`. A partir de ahí hay cuentas reales, correos de
verificación y estudios guardados en la nube.

## Fuentes de datos

- **OpenStreetMap** — entorno construido. Licencia ODbL, © colaboradores de
  OpenStreetMap.
- **Censo Nacional de Población y Vivienda 2018 (DANE)**, publicado como
  servicios abiertos por Esri Colombia. Datos abiertos, Ley 1712 de 2014.

Ninguna requiere llave de API. El informe declara siempre con qué fuentes se
construyó y cuáles no estuvieron disponibles.

## Alcance

FuxoraScope evalúa **condiciones de entorno**. No sustituye estudios de
suelo, revisión de norma urbana, avalúo ni factibilidad financiera.
