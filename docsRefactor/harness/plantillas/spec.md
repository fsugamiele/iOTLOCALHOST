# SPEC — <bloque> · <fecha>

## 0 · CANDADO
preguntas_abiertas: __

> Si != 0 → el bloque NO entra a implementación. Vuelve a diseño.
> Si durante la implementación aparece una pregunta que esta spec no contesta:
> SE FRENA EL BLOQUE. No se decide sobre la marcha.
> Adenda ≠ especificación.

## 1 · Presupuesto de bloque
- Tipo de bloque:  LIGERO | NORMAL | PESADO
- Un concern:              ____
- Una decisión de diseño:  ____
- Archivos a tocar (LISTA CERRADA):
  1. ____
- Total: __ archivos · Límite: 6

> Fuera de esta lista no se toca nada. Si no entra, el bloque se parte.

## 2 · Recon que lo funda: ____

## 3 · Consumidores (grep exhaustivo, no muestreo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|

## 4 · Campos que entran / salen / mutan
| Campo | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|

## 5 · Comportamiento de cada control
| Control | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|

## 6 · Casos raros — ENUMERADOS (prohibido "etc.")
| # | Caso | Comportamiento esperado |
|---|---|---|

## 7 · Path real del consumidor (DEC-PROC-5)
- archivo:línea: ____
- Escribe por:   .create() / .save() / insertOne / updateOne / otro: ____

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|

> Disenso no resuelto NO bloquea. Disenso invisible sí hace daño.

## 9 · IDs reservados: ____

## 10 · Cómo se prueba

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación nueva o modificada |
|---|---|---|---|

## 12 · Reversión
