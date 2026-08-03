# EVIDENCIA — <qué se probó> · <fecha>

## 0 · DECLARACIONES OBLIGATORIAS
- Zona horaria de TODO timestamp de este doc:  UTC | AR−3
- path_ejercido:                               write | read
- archivo:línea del consumidor REAL:           ____
- ¿Coincide con el path de producción?         sí | no

> Si "no" → el veredicto NO es válido para producción. Se rehace.
> insertOne no valida como .save(). findById no lee como una route productiva.

## 1 · Ventana de observación
- Cadencia de publicación del emisor: __ s
- Duración de la observación:         __ s
- ¿Ventana >= 2 ciclos?                sí | no

> Taps de 3-5 s contra cadencias de 30-120 s producen falsos negativos.

## 2 · Comandos y salida CRUDA

## 3 · Veredicto
| Qué se afirma | Evidencia | Veredicto |
|---|---|---|

## 4 · Qué NO prueba esta evidencia
