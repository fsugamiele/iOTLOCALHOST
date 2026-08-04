# SPEC — CLAUDE.md nuevo · 2026-08-04 (rev 1.c-ter)

> Estrena `plantillas/spec.md`. Propone el CLAUDE.md reescrito. NO aplica nada:
> el archivo nuevo se ARMA en `/tmp` con un procedimiento determinístico, no al
> disco de la raíz. Funda en el recon `docsRefactor/harness/recon/CLAUDE-md.md`
> (commit 338db91) + las 8 decisiones firmadas por Franco (C1).
>
> **rev 1.c-bis:** la rev anterior declaró preguntas_abiertas=0 y en el mismo
> mensaje preguntó cómo armar el bloque de Arquitectura — falló su propio
> candado. Se corrige con extracción mecánica (§ Procedimiento de armado) y se
> re-declara §0 con un 0 MEDIDO.
>
> **rev 1.c-ter:** el orden de armado de 1.c-bis (heredoc PRIMERO) TRUNCABA
> CLAUDE.md antes de que el `sed` leyera de él → pérdida silenciosa al aplicar.
> Corregido: `sed` extrae el anexo del original ANTES de escribir nada, + backup
> previo al `mv` (§ Procedimiento, §12). Punteros DEC-01..10 / DEC-11..20
> restaurados en §3 (C1.1); `docs/pcb/{SEC,GEN,H1,FENCE}.md` verificado existente.

## C0 · Cierre del hueco de B1 — verificación de "Convenciones descubiertas" (CLAUDE.md 299-327)

| línea | afirma | comando | resultado | ¿coincide? |
|---|---|---|---|---|
| 301-304 | auth lee header `token` (no Bearer), en authentication.js | `grep -n req.get authentication.js` | `authentication.js:6: let token = req.get('token');` | ✅ |
| 306-309 | POST envuelve payload en clave nombrada (newDevice/newSite) | `grep -rn req.body.new app/api/routes/` | newSite(sites:294), newDevice(devices:96), newRule(rules:23, alarms:29), newZone(zones:28) | ✅ |
| 311-313 | DELETE/filtros usan req.query (dId, siteCode, force) | `grep -rno req.query app/api/routes/` | `devices.js:166 req.query.dId` ✅ · siteCode vía `req.query` en sites.js ✅ · **`force` NO aparece como param literal** ❌ | ⚠️ parcial |
| 315-318 | dos .env: /.env infra Docker | `grep -oE '^KEY=' /.env` | 9 claves de infra | ✅ |
| 319-321 | /app/.env app node (JWT_SECRET, FORENSIC_HMAC_SECRET…) | `grep -oE '^KEY=' app/.env` | 31 claves; JWT_SECRET y FORENSIC_HMAC_SECRET presentes (por nombre) | ✅ |
| 323-327 | agregar var = installer.txt + .env correcto + restart node | `ls installer.txt` + `comm` + `grep installer.txt` en corpus | mecanismo `.env`+restart ✅ · **la parte installer.txt NO tiene decisión firmada** (único rastro: `docs/wanomi.md:339`, log de una acción, no una regla) · installer.txt y app/.env divergen en 16 claves | ⚠️ .env+restart ✅, installer.txt NO DECIDIDO |

**Resolución C0:** las convenciones de auth, POST body, DELETE/query y dos-.env
ENTRAN como reglas verificadas, con un recorte: el ejemplo `force` NO se verifica
→ NO entra (quedan `dId`/`siteCode`). La sincronía **installer.txt ↔ app/.env NO
es regla verificada** (1.b: no hay fila firmada, solo el log wanomi.md:339) →
entra al archivo nuevo marcada **NO DECIDIDO**, no como obligación.

---

## 0 · CANDADO
preguntas_abiertas: **0** (MEDIDO — ver nota)

> Nota de honestidad (el gate exige un 0 medido, no declarado): al reescribir
> esta rev NO apareció ninguna pregunta que la spec no conteste. Las 3 que
> quedaban implícitas se cerraron con medición, no con hedge:
> · cómo armar el bloque Arquitectura → **§ Procedimiento de armado** (sed mecánico).
> · si rotar JWT_SECRET toca al edge → **1.a: NO** (edge no usa JWT_SECRET, medido).
> · si installer.txt debe sincronizarse → **1.b: NO DECIDIDO** (sin fila firmada);
>   NO DECIDIDO es una respuesta completa (punto ciego documentado), no una
>   pregunta abierta que bloquee.
> Ningún hedge, ningún "decime", ninguna `?` sin resolver en el texto propuesto.

## 1 · Presupuesto de bloque
- Un concern:              CLAUDE.md miente/duplica; reducirlo a hechos verificados + punteros.
- Una decisión de diseño:  CLAUDE.md = índice de hechos vivos + punteros al gobierno; NO arquitectura, NI estado, NI decisiones.
- Archivos del bloque (LISTA CERRADA — 5):
  1. `docsRefactor/harness/recon/CLAUDE-md.md` — recon (ya commiteado, 338db91).
  2. `docsRefactor/harness/spec/CLAUDE-md.md` — esta spec (1.c / 1.c-bis).
  3. `CLAUDE.md` — se reemplaza en el gate de APLICACIÓN (futuro).
  4. `docsRefactor/WanomiRefactor.md` — el CIERRE 1.d registra ahí RISK-SEC-4 + la adenda del idioma.
  5. `docs/wanomi.md` — el CIERRE 1.d, si corresponde (bitácora de la sesión).
- Total: **5** archivos · Límite: 6

> RISK-SEC-4 (secretos filtrados) + la adenda del idioma `${VAR:+…}` se registran
> en **1.d como CIERRE de este bloque**, NO como bloque aparte.

## 2 · Recon que lo funda: `docsRefactor/harness/recon/CLAUDE-md.md` (commit 338db91)

## 3 · Consumidores (grep exhaustivo, no muestreo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Harness / Claude | (no es código; se inyecta como "project instructions" al iniciar sesión) | Recibe hechos verificados en vez de changelog obsoleto |
| Humano (Franco/dev) | lectura directa del repo | Deja de creer la DB `ioticos_god_level` (vacía) |
| `grep -rln CLAUDE.md --include=*.js/.vue/.json/.yml .` | **sin match fuera de node_modules** | Nada en código lo importa: cambiarlo no rompe build |

## 4 · Campos que entran / salen / mutan
| Campo (sección) | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|
| Descripción / componentes | | | ✅ 3→4 (edge-engine) | §2 nuevo |
| Ramas Git (tabla) | | ✅ (drift, no aporta) | | — |
| Estado del Desarrollo / changelog | | ✅ CORTAR | | vive en docs/wanomi.md |
| Roadmap Multi-Dispositivo | | ✅ SUPERADO (C1.6) | | — |
| 20 DEC + PCB + proveedor | | ✅ CORTAR (C1.7) | | docs/wanomi.md + informe |
| Convenciones descubiertas | ✅ (C0) | | | §4 nuevo |
| Arquitectura de la App (373-435) | | | ⏸ SE QUEDA por extracción sed (C1.8) | anexo transitorio |
| Variables de Entorno | | | ✅ +12 por nombre, DB corregida | §4 nuevo |
| EMQX Puertos | ✅ verificado | | 8883 marcado NO publicado | §4 nuevo |
| Firmware ESP8266 (config detallada) | | | ✅ → 1 línea legado (C1.5) | §6 nuevo |
| babel/NODE_PATH para modelos | ✅ (1.c, wanomi.md:1903-1904) | | | §4 nuevo |
| Gobierno / punteros a corpus | ✅ nuevo | | | §3 nuevo |
| Reglas duras del método (punteros) | ✅ nuevo | | | §5 nuevo |
| CANDADO | ✅ nuevo | | | §7 nuevo |

## 5 · Comportamiento de cada control (las 7 secciones del archivo nuevo)
| Control (sección) | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|
| §1 Qué es | ubica el proyecto (telco, Claro NEA) en 1 párrafo | sin datos verificables cambiantes | queda vago, no rompe |
| §2 Componentes | lista los 4 vivos | `docker ps` = 4 contenedores | si aparece un 5º sin doc → costura nueva |
| §3 Gobierno | 4 punteros, uno por línea | cada puntero resuelve a archivo existente | puntero colgado → §6 caso 3 |
| §4 Hechos de entorno | DB/puertos/auth/vars/seeds/babel | cada fila tiene comando (C0/B3/1.a-c) | hecho cambia → §6 caso 1 |
| §5 Reglas del método | cita fila del corpus, no la copia | `grep DEC-PROC-6 WanomiRefactor.md` | regla retirada → §6 caso 3 |
| §6 Legado | ESP8266 + dashboard-admin + colecciones legacy | punteros existen | — |
| §7 CANDADO | prohíbe arquitectura/estado/changelog | review rechaza lo prohibido | §6 caso 2 |

## 6 · Casos raros — ENUMERADOS (prohibido "etc.")
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | Un hecho verificado cambia (DB, puerto, header, set de vars) | §4 lleva fecha (2026-08-04); se RE-VERIFICA y se reemplaza la fila. La historia va a docs/wanomi.md, no se acumula acá |
| 2 | Alguien agrega changelog / estado / arquitectura nueva | Viola §7 CANDADO → se rechaza en review. Estado→docs/wanomi.md; arquitectura→mapa de costuras |
| 3 | Una regla/puntero citado se retira o renombra en el corpus | Queda colgado y es DETECTABLE porque se citó la fila, no el contenido. Se actualiza el puntero (si se hubiera copiado, la contradicción sería invisible) |
| 4 | Se agrega una var nueva de entorno | Va al `.env` correcto + restart. installer.txt es NO DECIDIDO (§4): no se exige, se deja el punto ciego a la vista hasta que haya decisión firmada |
| 5 | Se rota `JWT_SECRET` | Afecta node app + seed F3 (ambos firman/verifican con él). **NO afecta edge-engine** (1.a: no lo usa). Sin hedge |
| 6 | La sección Arquitectura (⏸ pendiente) se migra al mapa en Paso 2 | El bloque queda EN el CLAUDE.md nuevo (desde ~línea 71). Migrarlo al mapa = CORTAR esas líneas. El verbatim original vive en git history (pre-reemplazo) si hace falta. (NO re-correr `sed -n '374,435p'` post-aplicación: leería el archivo de 133 líneas y devolvería vacío) |

## 7 · Path real del consumidor (DEC-PROC-5)
- archivo:línea: el propio `CLAUDE.md` en la raíz del repo (no hay consumidor de código).
- Escribe por: **filesystem** — NO `.create()`/`.save()`/DB. Lo carga el harness como project-instructions al iniciar sesión; no pasa por Mongo ni por Express.

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|
| Cortar ya la Arquitectura de la App (stale, H8) | Conservarla pendiente hasta que exista el mapa | ¿Existe el mapa (Paso 2)? Hoy NO | RESUELTO por C1.8 (B) |
| Convención `force` como ejemplo válido | `force` no aparece como param | grep en routes → no está | RESUELTO (se cae `force`) |
| installer.txt es regla de sincronía | No hay fila firmada | grep installer.txt en corpus → solo log wanomi.md:339 | RESUELTO (NO DECIDIDO) |

## 9 · IDs reservados: **ninguno consumido.** Las 4 costuras candidatas del recon (CST-CAND-A/B/C/D) se allocan como `CST-01..04` en el Paso 2 (inventario).

## 10 · Cómo se prueba (corrido sobre `/tmp/claude-md-nuevo.md`)
- Recorte medido: `wc -l` = **131** (original 559 → **−77%**).
- Prohibidos: `Estado Actual`=0 · `Roadmap`=0 · `121212`/secretos=0.
- `DEC-01..20` aparecen SOLO como puntero de rango en §3 (medido: **2** ocurrencias — `DEC-11..20` y `DEC-01..10`), nunca con su contenido desarrollado. Control: `grep -E 'DEC-[0-2][0-9]'` menos los 2 punteros = 0 fuera de §3.
- `changelog`=**1**: es la línea del CANDADO §7 que lo PROHÍBE ("…ni changelog"), no un changelog. Aceptado.
- `ioticos_god_level`=**1**: única, en la nota "vacía, no usar". Aceptado.
- Cada puntero de §5 resuelve a FILA PROPIA, no mención suelta (criterio: DEC-PROC-1/2 se citan por todos lados pero NO tienen fila). Verificado 4/4 en 1.d: DEC-PROC-3 (l.419), DEC-PROC-5 (l.421), DEC-PROC-6 (l.422), DEC-PRED-1 (l.66) — 1 fila propia c/u.

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación |
|---|---|---|---|
| CST-CAND-A (app→DB) | doc dice `ioticos_god_level` | doc dice `iotix` + marca la vacía "no usar" | `grep MONGO_DATABASE app/.env`→iotix |
| CST-CAND-B (dos corpus) | sin puntero entre corpus | §3 explicita los 4 documentos y su dominio | punteros resuelven a archivo existente |
| CST-CAND-C (puertos EMQX) | doc lista 8883 como existente | §4 marca 8883 NO publicado | `docker ps` / compose sin 8883 |
| CST-CAND-D (componentes) | "3 componentes" | §2 lista 4 (edge-engine) | `docker ps` = 4 |

> El inventario formal (allocation CST-01..04) es Paso 2. Este bloque no cierra
> ninguna costura; las deja apuntadas para el mapa.

## 12 · Reversión
- En 1.c no hay nada que revertir en disco (la spec vive en el repo bajo harness/; el archivo nuevo se arma en /tmp).
- Al APLICAR (gate futuro): el procedimiento (a) extrae el anexo del CLAUDE.md ORIGINAL con `sed` antes de escribir nada y (b) hace `cp CLAUDE.md /tmp/CLAUDE.md.bak-<ts>` antes del `mv`. **Riesgo de pérdida = 0 CON este orden + el backup previo.** Con el orden anterior (heredoc primero) era pérdida silenciosa: el `>` truncaba CLAUDE.md antes de que el `sed` leyera de él. Además `git revert <hash>` restaura el viejo (íntegro en git history + citado en el recon 338db91).

---

## Procedimiento de armado (determinístico — cero drift)

El CLAUDE.md nuevo se ARMA, no se transcribe. Los §1..§7 se escriben una vez
(heredoc citado, sin expansión de `$VAR`/backticks); el bloque de Arquitectura
se EXTRAE mecánicamente del CLAUDE.md vigente. Ni marcador ni retipeado:

```bash
# 1. Extraer el CUERPO del anexo PRIMERO, del CLAUDE.md ORIGINAL (antes de truncar nada).
#    Rango 374,435 (NO 373): la línea 373 es el header viejo `## Arquitectura ... (./app/)`;
#    se reemplaza por el header COMBINADO del heredoc → un solo header, sin duplicado.
sed -n '374,435p' CLAUDE.md > /tmp/arq-block.md
wc -l /tmp/arq-block.md                 # esperado 62

# 2. Escribir §1..§7 (heredoc citado, sin expansión de $VAR/backticks).
#    El §1..§7 TERMINA con el header combinado del anexo + su nota (ver TEXTO COMPLETO).
cat <<'EOF' > /tmp/claude-md-nuevo.md
<<< §1..§7 del texto de abajo, con el header COMBINADO del anexo al final >>>
EOF

# 3. Anexar el cuerpo YA extraído (acá NO se re-lee CLAUDE.md)
cat /tmp/arq-block.md >> /tmp/claude-md-nuevo.md
wc -l /tmp/claude-md-nuevo.md           # esperado 133

# 4. Correr §10 sobre /tmp; recién entonces bajar a disco CON backup previo.
#    cp (no mv): deja el artefacto en /tmp por si hay que repetir.
cp CLAUDE.md /tmp/CLAUDE.md.bak-$(date +%s)
cp /tmp/claude-md-nuevo.md CLAUDE.md
```

> **El orden importa.** La rev 1.c-bis hacía el heredoc PRIMERO (`>` trunca
> CLAUDE.md) y DESPUÉS `sed -n … CLAUDE.md` — leía de un archivo ya vaciado:
> pérdida silenciosa. Acá el `sed` lee del original intacto antes de escribir.
> **El rango es 374,435 (no 373):** la l.373 del archivo viejo es el header
> `## Arquitectura ... (./app/)`, que al anexarse tras el header del heredoc
> producía DOS headers (defecto detectado y colapsado en 1.d-bis). Con el header
> combinado en el heredoc + el sed desde 374, queda un solo header.
> Verificado: `arq-block=62`, `final=133`. El gate de aplicación corre esto
> contra `CLAUDE.md` (no `/tmp`) para bajarlo a disco.

## TEXTO COMPLETO DEL CLAUDE.md NUEVO (§1..§7 — el cuerpo del heredoc)

> El CUERPO del bloque "Arquitectura de la Aplicación" (Stack: Nuxt 2 … en
> adelante) NO se pega acá: lo agrega el `sed -n '374,435p' CLAUDE.md` del
> procedimiento de arriba. Debajo va el cuerpo autoral + el header COMBINADO del
> anexo con su nota (ese header SÍ va en el heredoc; el sed arranca en 374 para
> no duplicarlo).

```markdown
# CLAUDE.md — Wanomi 3.0

## 1 · Qué es Wanomi 3.0
Plataforma IoT self-hosted para monitoreo de sites de telecomunicaciones,
heredera de IoTicos GL. Está en piloto con **Claro Argentina (NEA)** para dos
dolores del operador: anti-intrusión/anti-robo de shelters y BTS, y monitoreo
predictivo de grupos electrógenos (lectura del controlador por MODBUS + sensores
de vibración, combustible, temperatura). El firmware de campo corre en ESP32-S3;
los datos suben por MQTT a EMQX y se procesan por site en el edge-engine.

## 2 · Los 4 componentes vivos
1. **Infra Docker** — MongoDB + EMQX (broker MQTT). `docker_compose_production.yml`.
2. **App web + API** — Nuxt 2 (SPA) + Express como serverMiddleware, mismo proceso `node`.
3. **edge-engine** — motor de reglas/inferencia por site (contenedor `wanomi-edge`,
   corre `node /home/edge/edge-engine/index.js`). Es donde vive el motor.
4. **Firmware** — ESP32-S3 (línea telco). [ESP8266 = legado, ver §6.]

## 3 · Dónde vive el gobierno (punteros — no se copia contenido)
- Decisiones del refactor de software → `docsRefactor/WanomiRefactor.md` (familias DEC-REF / DEC-PROC / DEC-PRED).
- Bitácora maestra + estado + DEC-11..20 (fabricación PCB) → `docs/wanomi.md`.
- Decisiones de instalación DEC-01..10 → `docs/informe_instalacion.md`.
- Specs de fabricación PCB con netlist → `docs/pcb/{SEC,GEN,H1,FENCE}.md`.

> Dos corpus, sin migración: cada uno gobierna su dominio (software-refactor vs
> hardware/instalación). Se apunta, no se duplica.

## 4 · Hechos de entorno VERIFICADOS (2026-08-04)
- **Base MongoDB en uso: `iotix`** (15 colecciones). `ioticos_god_level` está VACÍA — no usar.
- **Compose en producción:** `docker_compose_production.yml` (contenedores: mongo, emqx, node, wanomi-edge). `docker restart node` recarga código de `api/routes/*.js`; cambios de front Nuxt requieren `docker_nuxt_build.yml`; rebuild de imagen solo al cambiar dependencias.
- **Puertos EMQX publicados:** 1883 (MQTT), 8083 (WS), 8085->8081 (REST API v4), 18083 (dashboard). **8883 (TLS) NO está publicado.**
- **Auth:** el middleware `checkAuth` lee el JWT del header **`token`** (NO `Authorization: Bearer`) — `app/api/middlewares/authentication.js:6` (`req.get('token')`). Los grants se releen de DB en cada request. Hay **2 middlewares**: `authentication.js` (JWT) y `scope.js` (RBAC).
- **Patrón POST:** payload envuelto en clave nombrada (`req.body.newDevice`, `newSite`, `newRule`, `newZone`), no objeto plano.
- **Patrón DELETE/filtros:** identificadores por `req.query` (`dId`, `siteCode`), no `req.body`.
- **Dos archivos `.env`:** `/.env` (infra Docker) y `app/.env` (app node, cargado por dotenv). Agregar una variable = actualizar el `.env` correcto + reiniciar el contenedor que la consume.
- **installer.txt (NO DECIDIDO):** no hay decisión firmada de mantener `installer.txt` sincronizado con `app/.env`. Único antecedente: `docs/wanomi.md:339` sumó `FORENSIC_HMAC_SECRET` a ambos. Hoy `installer.txt` y `app/.env` DIVERGEN en 16 claves. Tratar como punto ciego hasta que haya decisión.
- **Variables de `app/.env` (por NOMBRE, jamás valor):** API_PORT, APP_PORT, WEBHOOKS_HOST, MONGO_USERNAME, MONGO_PASSWORD, MONGO_HOST, MONGO_PORT, MONGO_DATABASE, MONGODB_URI, EMQX_DEFAULT_APPLICATION_SECRET, EMQX_NODE_SUPERUSER_USER, EMQX_NODE_SUPERUSER_PASSWORD, EMQX_API_HOST, EMQX_API_TOKEN, EMQX_RESOURCES_DELAY, JWT_SECRET, FORENSIC_HMAC_SECRET, AXIOS_BASE_URL, MQTT_PREFIX, MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS, MQTT_NOTIFICATION_HOST, SSLREDIRECT, SITE_ID, ENABLE_SIMULATOR_API, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_DEFAULT, TEST_USER_EMAIL, TEST_USER_PWD.
- **Chequear presencia de una var SIN filtrar su valor:** `[ -n "$VAR" ] && echo "$K=SET" || echo "$K=UNSET"`. NUNCA `${VAR:+SET}${VAR:-UNSET}` — esa construcción imprime el valor cuando la var está definida.
- **Importar modelos desde un script `node` standalone:** `@babel/register` + `@babel/preset-env` (NO `@nuxt/babel-preset-app`, falla por polyfills core-js) + `NODE_PATH=<app>/node_modules` para resolver dotenv/modelos (registrado en `docs/wanomi.md:1903-1904`). Además la mayoría de modelos son `export default` → `require(...).default`, pero `rule_pack.js` y `rule_definition.js` son `module.exports` → sin `.default`. El seed F3 (`tools/seed_rulepacks_f3/seed.js`) esquiva todo esto: siembra por **HTTP** contra la API con un JWT firmado con `JWT_SECRET`, sin importar modelos.
- **Alcance de rotación de `JWT_SECRET`:** invalida a la vez los tokens de la app node y del seed F3 (ambos firman/verifican con él). El edge-engine NO usa `JWT_SECRET` (verificado 2026-08-04: usa MONGODB_URI, MQTT_*, SITE_ID, TELEGRAM_*).

## 5 · Reglas duras del método (se cita la fila del corpus, no su contenido)
- Implementar sobre dirección firmada ≠ sobre especificación → `WanomiRefactor.md` · **DEC-PROC-6**.
- Pregunta que la spec no contesta ⇒ frena el bloque y vuelve a diseño → **DEC-PROC-6** + candado §0 de `plantillas/spec.md`.
- Procedencia de cada pieza: ¿configurable o hardcodeada? Toda "hardcodeada" es hallazgo estructural → **DEC-PROC-3**.
- Verificar contra el path productivo real, no un atajo (`insertOne` ≠ `.save()`) → **DEC-PROC-5**.
- No predecir donde no hay evidencia → **DEC-PRED-1**.

> El contenido de cada regla vive en el corpus. Acá solo el puntero: si se copia,
> se pudre y termina contradiciendo la fuente.

## 6 · Legado
- **ESP8266:** firmware propio de fases previas. Directorio `./ESP8266/` conservado, SIN uso desde `app/` ni compose. El firmware telco corre en ESP32-S3 (archivos nuevos). No borrar.
- **dashboard-admin:** `app/pages/dashboard-admin.vue` (+ build en `app/dist/`). Referido en WanomiRefactor.md.
- **Colecciones legacy en `iotix`:** las que el mapa de costuras marque en Paso 2.

## 7 · CANDADO
Este archivo NO contiene arquitectura, ni estado actual, ni changelog.
Arquitectura → mapa de costuras. Estado → docs/wanomi.md.
Decisiones → WanomiRefactor.md. Si algo de eso aparece acá, sobra.

---

## Arquitectura de la Aplicación (`./app/`) — ⏸ PENDIENTE DE MIGRAR AL MAPA DE COSTURAS (Paso 2)

> Bloque conservado VERBATIM del CLAUDE.md previo al reemplazo (decisión C1.8):
> describe la arquitectura y por eso viola el CANDADO de §7 — se conserva
> transitoriamente porque el mapa de costuras todavía no existe. Migrarlo =
> CORTAR estas líneas. El original íntegro vive en git history (commit previo
> al reemplazo) y está citado en el recon 338db91.
> Advertencia: el contenido es del archivo viejo y NO fue actualizado — por
> ejemplo menciona ESP8266 donde §6 declara que el firmware telco es ESP32-S3.
```

## Conteo (recorte) — MEDIDO
- CLAUDE.md original: **559 líneas** (`wc -l`).
- CLAUDE.md nuevo aplicado: **133 líneas** (`wc -l`, real; 131 del artefacto + 2 del header combinado del anexo colapsado en 1.d-bis).
- Recorte: **559 → 133 = −76%**.
- El grueso sale de changelog/Estado del Desarrollo, Roadmap, 20 DEC + PCB + proveedor + estado Fase 4. Nada se pierde: vive en `docs/wanomi.md` / `docs/informe_instalacion.md`.
