# Mapa de costuras — Wanomi 3.0

Describe el sistema que corre HOY. No es un resumen del corpus.
Lee toda decisión VIGENTE, sin importar su fecha.

- Escritura: hacia adelante. Descripción: el presente. Lectura: lo vigente.
- Formato de fila: `plantillas/costura.md`
- Un bloque NO cierra si dejó una costura desactualizada.
- Contradicción con el corpus ⇒ ADENDA nueva. Fila vieja intacta, nunca edición.
- Ante divergencia: el mapa manda sobre "qué pasa hoy" (tiene verificación);
  el corpus manda sobre "qué se decidió".

## Allocator
- Familia: `CST-`
- Próximo libre: **CST-01**
- Retirados (nunca reusar): (ninguno)

## Estados
| Estado | Significa | Qué se hace |
|---|---|---|
| CONFORME | Como es = como debería ser, verificado | Nada. Son las que no hay que tocar |
| DESVÍO | Hay decisión firmada, la implementación no la cumple | Deuda. Se prioriza por lo que bloquea |
| NO DECIDIDO | No hay decisión firmada | Punto ciego. Necesita sala, no código |
| CONTRADICCIÓN | Dos decisiones firmadas chocan en el mismo lugar | Gobierno. Lo arbitra Franco |
| NO VERIFICADO | Todavía no lo miramos | Cola de la pasada 2 |

## Inventario
_Vacío. Se llena en la pasada 1 (Paso 2)._
