# Runbook — recuperación del resource `saver-webhook` de EMQX

Ámbito: piloto Claro / demo. El resource `saver-webhook` de EMQX enruta cada
publish `{userId}/{dId}/{var}/sdata` (con `save==1`) al webhook Node
`http://node:3001/api/saver-webhook`, que persiste en `db.data`. Si el
resource queda `is_alive=false`, los devices siguen publicando MQTT pero el
histórico deja de crecer. El dashboard NOC muestra "Sitios Online 0/N" y las
reglas del edge-engine no pueden disparar (les falta la data).

Backlog: **BACKLOG-OPS-1**.

---

## Síntoma

Uno o varios de:

- `Sitios Online = 0` en el dashboard NOC pese a que el simulador esté vivo.
- `db.data.countDocuments({time:{$gt: Date.now()-60000}})` = 0.
- Errores en `docker logs emqx | grep -c 'Take action.*failed'` distintos de 0.

## Diagnóstico en un comando

```bash
tools/healthcheck_demo.sh
```

Las 3 líneas deben decir `OK`. Si la 2 dice `FALLA · resource saver-webhook
is_alive=False`, aplica esta recuperación.

## Recuperación

**Paso único** — un POST al endpoint del resource fuerza la reconexión sin
borrar nada:

```bash
SEC=$(grep '^EMQX_DEFAULT_APPLICATION_SECRET' .env | cut -d= -f2 | tr -d '\r\n')
RID=$(docker exec emqx curl -s -u "admin:${SEC}" 'http://localhost:8081/api/v4/resources' \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);r=[x for x in d.get("data",[]) if x.get("description")=="saver-webhook"];print(r[0].get("id","") if r else "")')
docker exec emqx curl -s -X POST -u "admin:${SEC}" "http://localhost:8081/api/v4/resources/${RID}"
```

> Nota: el ID del resource rota en cada rebuild/recreación de EMQX. No hardcodear
> `resource:3920e268`; buscar siempre por `description == "saver-webhook"`.

Respuesta esperada: `{"code":0}` (HTTP 200).

Verificar:

```bash
tools/healthcheck_demo.sh
```

Las 3 líneas deben quedar `OK`. `db.data` crece dentro de los 60 s siguientes.

## Qué NO hacer

- **NO** `DELETE` del resource. Las 13 rules SAVER-RULE quedan colgadas
  apuntando a un ID inexistente y hay que recrearlas de a una.
- **NO** reiniciar EMQX (`docker restart emqx`). Corta MQTT para el
  simulador, el edge y el frontend; recupera solo, pero a costo de una
  ventana de datos perdidos y de posible reconexión en cascada.
- **NO** editar `emqxsaverrules` en Mongo. Esa colección tiene un doc
  histórico (`dId=2087`, userId `69aa00efff0c3d2e00eece09`) que no
  corresponde al stack actual y NO alimenta el saver — el saver real vive
  como resource+rules del rule engine de EMQX, no como colección Mongo.
- **NO** correr `tools/device_simulator/seed.js`. Recrea templates y tira
  abajo la migración de etiquetas (BACKLOG-SIM-N).

## Causa raíz

No investigada en el paréntesis pre-reunión. El resource entra en
`is_alive=false` tras algún evento no identificado (posible reinicio previo
del contenedor `node` mientras EMQX estaba activo). Anotado como
**BACKLOG-OPS-1** para post-reunión.
