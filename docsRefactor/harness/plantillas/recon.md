# RECON — <bloque> · <fecha> · <sesión>

## 0 · Apertura (verificado hoy, NO de memoria)
> **La apertura es SIEMPRE su propio turno.** Nunca comparte gate con una
> escritura. Se mide, se reporta, y recién con el OK se toca algo.
> Regla ganada en #54: un prompt que encadenaba apertura + creación hizo
> que el Paso 0 se salteara su propia apertura (clase DEC-PROC-4d).
> Aplica al agente Y a la sala que redacta el prompt.

- Corpus vigente:      WanomiRefactor.md v____   (línea 4, leída hoy)
- Branch / HEAD:       ____ / ____   · working tree: limpio | sucio
- Contenedores:        ____
- Estado que este recon NO asume del paso anterior: ____

## 1 · Alcance
- Tipo de bloque:  LIGERO | NORMAL | PESADO
  > Se calibra por REVERSIBILIDAD, no por importancia.
  > LIGERO  = docs y artefactos; se deshace con `git revert`. Un gate de revisión.
  > NORMAL  = código que corre. recon → spec → diff → aplicar → cierre.
  > PESADO  = datos, Mongo, EMQX, secretos, producción. Backup obligatorio
  >           + STOP antes de cada paso irreversible.
- Pregunta que contesta: ____
- Qué queda fuera:       ____

## 2 · Procedencia — OBLIGATORIO
| Pieza | Qué es | De dónde sale | Quién la consume | Qué se rompe si falta |
|---|---|---|---|---|

## 3 · Pregunta de origen — OBLIGATORIO (DEC-PROC-3)
> ¿De dónde salen las piezas con las que se construye esto,
> y son configurables o hardcodeadas?

Respuesta: ____
Piezas hardcodeadas encontradas: ____

> Toda respuesta "hardcodeado" es HALLAZGO ESTRUCTURAL, nunca "asimetría menor".

## 4 · Hallazgos
| # | Hallazgo | Evidencia (archivo:línea / comando + salida) | ¿Estructural? | CST |
|---|---|---|---|---|

## 5 · Qué NO verifiqué y por qué
| Qué | Por qué | Qué haría falta |
|---|---|---|

## 6 · Salida
- Habilita: ____
- Preguntas que este recon ABRIÓ: ____
