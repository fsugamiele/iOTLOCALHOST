# Manejo de Secrets en Wanomi

Protocolo de manejo de credenciales y secrets en este proyecto.

## Tipos de secrets en el sistema

| Secret | Dónde vive | Ámbito |
|---|---|---|
| GitHub PAT | `~/.git-credentials` (chmod 600) | Push/pull al repo |
| Telegram Bot Token | `app/.env` (TELEGRAM_BOT_TOKEN) | Notificaciones |
| Telegram Chat ID | `app/.env` (TELEGRAM_CHAT_ID_DEFAULT) | Destino default |
| JWT secret | `app/.env` (JWT_SECRET) | Auth de la plataforma |
| MongoDB password | `app/.env` (MONGO_PASSWORD) | DB |
| EMQX superuser | `app/.env` | Broker MQTT |
| EMQX API token | `app/.env` (EMQX_API_TOKEN) | Webhooks |

## Reglas de oro

### Regla 1: Los secrets NUNCA pasan por el chat
- ❌ NO pegar tokens en mensajes a Claude
- ❌ NO pegar tokens en mensajes a Claude Code
- ❌ NO incluir secrets en outputs de comandos
- ✅ Los secrets viven en archivos locales con permisos restringidos

### Regla 2: Archivos con secrets

CONTIENEN secrets (no commitear, ya están en .gitignore):
- `~/.git-credentials`
- `/.env`
- `/app/.env`

NO contienen secrets pero documentan estructura (sí commitear):
- `/app/.env.example`
- `/SECRETS.md` (este archivo)

### Regla 3: Procedimiento para actualizar un secret

1. Generar el secret nuevo en el servicio
2. Abrir el archivo destino con un editor directamente (`nano`, `vim`)
3. Pegar el secret SOLO en el editor
4. Guardar y verificar permisos (`chmod 600`)
5. NO pegar el secret en chat, ni siquiera para "configurar"
6. Si una IA pide el secret, decirle que lo lea del archivo

### Regla 4: Rotación

Frecuencia mínima:
- GitHub PAT: cada 90 días (Fine-grained con expiración automática)
- Telegram bot token: solo si hay sospecha de exposición
- JWT secret: solo en upgrades mayores
- DB passwords: en cada cambio de personal con acceso

### Regla 5: Incidentes

Si un secret se expone:
1. **REVOCAR INMEDIATAMENTE** el secret en el servicio origen
2. Generar uno nuevo
3. Actualizar archivos de configuración
4. Documentar el incidente en wanomi.md (DEC-incident-N)
5. Identificar causa raíz y prevenir repetición

## Procedimientos de actualización sin exposición

### GitHub PAT (~/.git-credentials)

```bash
nano ~/.git-credentials
# Reemplazar github_pat_xxx por el nuevo PAT
# Guardar (Ctrl+O, Enter, Ctrl+X)
chmod 600 ~/.git-credentials
git fetch origin   # Verificar
```

### Telegram bot token (app/.env)

```bash
nano /root/IotLocalhost/app/.env
# Agregar/modificar:
# TELEGRAM_BOT_TOKEN=<nuevo_token>
# TELEGRAM_CHAT_ID_DEFAULT=<chat_id>
docker restart node   # Recargar env vars
```

## Auditoría de secrets en el history

```bash
cd /root/IotLocalhost
git log -p --all | grep -iE "ghp_|github_pat_|api[_-]?key|bearer" | head -20
```

Si hay match → rotar ese secret + considerar limpiar history.

## Historial de incidentes

- **2026-05-18**: Token Telegram bot expuesto en chat al recibir credenciales de BotFather. Revocado y rotado el mismo día.
- **2026-05-18**: PAT GitHub expuesto en chat durante setup del push inicial. Revocado y rotado el mismo día. Adopción del protocolo presente.
