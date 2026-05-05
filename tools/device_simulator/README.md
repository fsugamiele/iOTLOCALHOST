# Device Simulator — WN-SITE-SEC

Simulador del controlador de seguridad WN-SITE-SEC para el piloto Claro Corrientes. Replica el comportamiento exacto de un ESP32-S3 real: obtiene credenciales MQTT del backend vía `/api/getdevicecredentials`, se conecta al broker EMQX, y publica eventos de sensores (apertura de puertas, movimiento PIR, vibración de cerco, loop de tierra, tags de batería) en formato `{userId}/{dId}/{variable}/sdata`. Permite disparar eventos manualmente desde el panel Vue o en modo automático para demos sin hardware.

## Configuración

1. Copiar el archivo de ejemplo y completar con los datos reales del piloto:

```bash
cp sites_real.example.json sites_real.json
```

2. Completar `sites_real.json` con los `siteCode` y datos de los sites reales.

3. Configurar variables de entorno (mismas que `app/.env`):

```
API_HOST=localhost
API_PORT=3001
USER_EMAIL=<email del operador>
USER_PASSWORD=<password>
```

**⚠️ NO commitear `sites_real.json` — contiene ubicaciones operativas de sites reales del piloto Claro Corrientes.**

## Invocación

```bash
# Modo demo continuo (publica eventos aleatorios en loop)
node tools/device_simulator/run.js --mode=auto

# Modo on-demand (espera comandos HTTP en localhost:7777)
node tools/device_simulator/run.js --mode=manual

# Simular site específico
node tools/device_simulator/run.js --site=CR00015
```

## Flujo de bootstrap (igual que ESP32 real)

1. `POST /api/getdevicecredentials` con `dId` + `password` del device
2. Recibe `username`, `password` MQTT, `topic`, `variables`
3. Conecta a EMQX con esas credenciales
4. Publica en `{userId}/{dId}/{variable}/sdata`

## Archivos

| Archivo | Descripción |
|---|---|
| `run.js` | Entrypoint principal |
| `sites_real.json` | Sites reales del piloto (gitignored) |
| `sites_real.example.json` | Template con datos ficticios |
| `site_images/` | Imágenes satelitales de los sites (gitignored) |
