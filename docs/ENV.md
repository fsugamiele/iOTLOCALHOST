# Topología de entorno — Wanomi

## DEV (entorno de desarrollo local)
- **Mongo**: Docker, stack `docker-compose.yml`, volumen `./mongodata`
- **EMQX**: Docker, stack `docker-compose.yml`
- **Node**: proceso local (fuera de Docker), `cd app && npm run start`
- Comando para levantar infra: `docker compose -f docker-compose.yml up -d`
- Comando para parar infra: `docker compose -f docker-compose.yml down`

## PROD (servidor)
- Todo en Docker, stack `docker_compose_production.yml`
- Comando: `docker compose -f docker_compose_production.yml up -d`

## Regla operativa
NUNCA mezclar containers de ambos stacks en la misma sesión.
El stack de prod NO se usa en máquina de desarrollo.
