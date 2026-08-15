# FuxoraScope

Análisis de viabilidad de implantación para constructoras e inmobiliarias.
Evalúa un lote y responde: ¿qué tan buena idea es construir X aquí?

## Qué es esto y qué NO es

Este repositorio es un producto **independiente**, con arquitectura y
metodología propias. No comparte código, taxonomía ni motor de cálculo con
ningún otro proyecto. Se construyó desde cero para ser una pieza de
propiedad intelectual autónoma, transferible en su totalidad.

## Metodología (resumen para no técnicos)

1. **Entorno**: se consultan los lugares reales alrededor del lote elegido
   (comercios, colegios, salud, vías, etc.) desde datos abiertos.
2. **Influencia por distancia**: cada lugar cercano no cuenta "sí o no" — su
   peso disminuye mientras más lejos está del lote (modelo de decaimiento
   por distancia), así que un supermercado a 50 m pesa más que uno a 480 m
   dentro del mismo radio.
3. **Datos oficiales**: población, estrato socioeconómico y estructura de
   edad se toman del Censo Nacional del DANE por manzana censal.
4. **Índice multicriterio**: los factores (demanda, competencia, entorno,
   accesibilidad, complementariedad) se combinan con una matriz de pesos
   configurable por tipo de negocio — no un peso fijo único para todos los
   proyectos.
5. **Informe**: veredicto de viabilidad + el detalle que lo sustenta, en PDF.

## Estado del proyecto

En construcción. Ver `docs/roadmap.md` para el plan de piezas.

## Estructura

```
src/
  motor.js          — el índice de viabilidad (este es el núcleo)
  datos.js          — conectores a fuentes abiertas (por construir)
  app.js            — interfaz (por construir)
  informe.js        — generación de PDF (por construir)
```
