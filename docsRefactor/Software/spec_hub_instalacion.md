# Spec — Perfil Hub: instalación del sistema en la Orange Pi 4 Pro (2026-11-18)

> Bloque «Perfil Hub» previsto en `analisis_hub_g2_2026-10-16.md` (H4–H6) y DEC-ARCH-3.
> **Estado: PROPUESTA — falta la firma de Franco.** Nada de esto se implementa antes de la firma
> (DEC-PROC-6).

## 0 · Definido por Franco (2026-11-18)
| # | Definición |
|---|---|
| F1 | **Primero el banco de 24 h** en el escritorio con el simulador (H6). Después, el sitio. |
| F2 | La placa **todavía no tiene sistema operativo**. |
| F3 | La base del hub arranca **limpia + configuración**: fichas, reglas, perfiles, plantillas, sitio CR00061 y sus equipos. Sin telemetría ni alarmas de desarrollo. |
| F4 | Acceso **solo por la red local** durante el banco. El acceso remoto se decide antes de ir al sitio. |

Ya firmado y vigente: DEC-ARCH-1 (base local por hub), DEC-REF-68 (opción A: todo en Docker,
arranque autónomo), DEC-ARCH-3 (Orange Pi 4 Pro, 4 GB, microSD), H1 (supervisor en el hub),
H5 (la interfaz llega compilada), H6 (banco de 24 h).

## 1 · Hechos verificados en el repo (no se predicen)
- `docker_compose_production.yml`: `mongo:4.4`, `emqx/emqx:4.2.3`, cuatro `node:14` (node, wanomi-edge, wanomi-sim, wanomi-qa). Sin límites de memoria, sin rotación de registros, Mongo con caché por defecto.
- `node` arranca con `sh -c "npm run start"` (`nuxt start`): sin interfaz compilada entra en bucle (BACKLOG-OPS-4) y su salida no llega a `docker logs` (BACKLOG-OPS-5).
- `app/node_modules` se monta desde el disco del equipo: el de la PC (x86) **no sirve** en la placa (ARM). Todas las dependencias son JavaScript puro (`bcryptjs`, no `bcrypt`), así que alcanza con instalarlas en la placa.
- Las reglas de EMQX se pierden en un arranque en frío (BACKLOG-OPS-1, tres episodios). En el hub, cada corte de energía es un arranque en frío.

## 2 · Decisiones a firmar
| # | Decisión | Propuesta |
|---|---|---|
| HB-1 | **Compose propio del hub** | `docker_compose_hub.yml`: mongo, emqx, node, wanomi-edge, wanomi-qa. El simulador (`wanomi-sim`) va en un perfil `banco` que solo se enciende durante el banco. Sin contenedor de compilación. |
| HB-2 | **Arranque de `node`** (OPS-4 y OPS-5) | `node` como proceso principal (sin `sh` ni `npm` en el medio): los registros vuelven a verse y el reinicio es limpio. Si falta la interfaz compilada, sale con un mensaje claro en el registro en lugar de quedar en bucle. |
| HB-3 | **Reglas de EMQX tras un corte** (OPS-1) | Volumen persistente para los datos de EMQX y, al arrancar, la reconciliación que ya existe. El script de verificación (HB-7) confirma que las reglas estén creadas. Criterio de aceptación en el banco: 3 cortes de energía seguidos y los datos se siguen guardando solos. |
| HB-4 | **Cuidado de la microSD y la memoria** | Rotación de registros (10 MB × 3 archivos por contenedor). Caché de Mongo **PROVISORIO 1 GB** y límites de memoria por contenedor **PROVISORIOS**: se fijan con la medición del banco. |
| HB-5 | **Hora** | Zona `America/Argentina/Buenos_Aires` en todos los contenedores y sincronización de hora en el sistema operativo. |
| HB-6 | **Paquete de instalación** | Se compila la interfaz en la PC (como hoy). Un script arma un archivo con el código, la interfaz compilada y la versión (commit). En la placa: copiar, descomprimir, instalar las dependencias para ARM y levantar. Los secretos del hub (`.env`) **se generan en la placa**, distintos de los de desarrollo, y nunca pasan por el chat. |
| HB-7 | **Verificación en un paso** | `tools/hub/verificar.sh` revisa contenedores sanos, Mongo, reglas de EMQX, motor conectado, datos guardándose en los últimos minutos, hora y espacio libre. Responde OK o qué falla. |
| HB-8 | **Datos iniciales** (F3) | `tools/hub/exportar_config.sh` en la PC exporta solo la configuración (sitios, equipos, plantillas, fichas, reglas, perfiles, usuarios y credenciales MQTT de los equipos). `tools/hub/importar_config.sh` la carga en la placa. Solo lectura sobre la base de desarrollo. |
| HB-9 | **Banco de 24 h** (H6) | `tools/hub/medir.sh` registra cada minuto CPU y RAM por contenedor, temperatura de la placa y MB escritos en la microSD. Con el gabinete cerrado. Al final: informe con los valores para fijar HB-4. |

## 3 · Riesgos a verificar en la etapa 2 (preparar la placa)
- **Imagen de EMQX 4.2.3 para ARM:** a confirmar con un `docker pull` en la placa. Si no existe, se elige la versión 4.x más cercana que tenga imagen ARM y se registra.
- **Mongo 4.4 en ARM:** la A733 es ARMv8.2, así que no tiene el límite de la Zero 3 (DEC-ARCH-3). A confirmar igual.
- **`node:14` está fuera de soporte** (deuda ya registrada en DEC-REF-68). No se cambia en este bloque.

## 4 · Etapas
1. **Sistema listo para el hub** (en desarrollo, sin la placa): HB-1 a HB-8.
2. **Preparar la placa:** sistema operativo, Docker, hora y riesgos de §3.
3. **Banco de 24 h:** HB-9 y las pruebas de corte de HB-3.
4. **Sitio CR00061.**
