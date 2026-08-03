# Plantilla de fila de costura

Una costura es una UNIÓN entre dos partes, no una parte.
Se mapea dónde se dan la mano, porque ahí es donde el sistema se rompió.

### CST-__ · <nombre corto>

| Campo | Contenido |
|---|---|
| Costura                  | <parte A> → <parte B> |
| Qué cruza                | |
| Cómo es                  | |
| Verificación             | `comando` → esperado · última corrida: ____ |
| Cómo debería ser         | (VACÍO si no hay decisión firmada) |
| Gobernada por            | DEC-___ / (ninguna) |
| Consecuencia del desvío  | |
| Estado                   | CONFORME · DESVÍO · NO DECIDIDO · CONTRADICCIÓN · NO VERIFICADO |
| Bloquea                  | |
| Sirve al pilar           | anticipación · recomendación · ninguno |

## Reglas

- "Cómo es" NO se escribe: se verifica. Sin verificación corrible, la fila
  queda NO VERIFICADO por más que alguien sepa la respuesta.
- "Cómo debería ser" se llena SOLO con decisión firmada. Vacío = NO DECIDIDO,
  y eso es la información más valiosa del mapa: muestra dónde vamos a ciegas.
- Superficie legada: entra con UNA fila, marcada, con puntero a la decisión
  que la dejó viva. NO se verifica. Si algún día se revive, ahí se audita.

## Ejemplo (NO es una costura real — no consume ID)

### CST-EJEMPLO · Registro de equipo → motor de reglas

| Campo | Contenido |
|---|---|
| Costura                 | devices (Mongo) → ruleEngine.js |
| Qué cruza               | deviceType: qué reglas le corresponden al equipo |
| Cómo es                 | ATS 59XYsglM tiene deviceType = "" |
| Verificación            | db.devices.findOne({dId:"59XYsglM"},{deviceType:1}) → "" · corrida: PENDIENTE |
| Cómo debería ser        | (VACÍO — no hay decisión firmada sobre cómo se puebla) |
| Gobernada por           | (ninguna) |
| Consecuencia del desvío | 3 de 5 reglas del pack ATS no disparan nunca |
| Estado                  | NO DECIDIDO |
| Bloquea                 | F3 · 3 reglas tipo D |
| Sirve al pilar          | anticipación |
