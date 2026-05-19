#!/bin/bash
# scripts/inventario.sh — Genera docs/INVENTARIO_AUTO.md a partir del estado del repo
# Uso: ./scripts/inventario.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

OUTPUT="docs/INVENTARIO_AUTO.md"

cat > "$OUTPUT" << EOF
# Inventario automático

**Generado**: $(date '+%Y-%m-%d %H:%M:%S')
**Branch**: $(git branch --show-current)
**Último commit**: $(git log -1 --format='%h — %s')

> ⚠️ ARCHIVO AUTO-GENERADO. NO EDITAR A MANO.
> Para regenerar: \`./scripts/inventario.sh\`

---

## Branch y estado del working tree

\`\`\`
$(git status -sb 2>&1 | head -30)
\`\`\`

---

## Modelos del backend (\`app/api/models/\`)

| Archivo | Tamaño | Última modificación |
|---|---|---|
EOF

ls -la app/api/models/ 2>/dev/null | grep "\.js$" | awk '{printf "| %s | %s bytes | %s %s %s |\n", $NF, $5, $6, $7, $8}' >> "$OUTPUT"

cat >> "$OUTPUT" << EOF

---

## Routes del backend (\`app/api/routes/\`)

| Archivo | Tamaño | Endpoints expuestos |
|---|---|---|
EOF

for f in app/api/routes/*.js; do
  if [ -f "$f" ]; then
    name=$(basename "$f")
    size=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")
    endpoints=$(grep -cE "router\.(get|post|put|delete)" "$f" 2>/dev/null || echo "0")
    echo "| $name | $size bytes | $endpoints endpoints |" >> "$OUTPUT"
  fi
done

if [ -d app/api/routes/bridges ]; then
  echo "" >> "$OUTPUT"
  echo "### Subdirectorio \`bridges/\`" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  for f in app/api/routes/bridges/*.js; do
    if [ -f "$f" ]; then
      name=$(basename "$f")
      size=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")
      echo "- $name ($size bytes)" >> "$OUTPUT"
    fi
  done
fi

cat >> "$OUTPUT" << EOF

---

## Pages del frontend (\`app/pages/\`)

\`\`\`
$(find app/pages -name "*.vue" -type f 2>/dev/null | sort | sed "s|^app/pages/||")
\`\`\`

---

## Componentes Vue (\`app/components/\`)

\`\`\`
$(find app/components -name "*.vue" -type f 2>/dev/null | sort | sed "s|^app/components/||")
\`\`\`

---

## Plugins, middlewares y store

### Plugins (\`app/plugins/\`)
$(ls app/plugins/ 2>/dev/null | sed 's/^/- /')

### Middlewares (\`app/middleware/\`)
$(ls app/middleware/ 2>/dev/null | sed 's/^/- /')

### Store (\`app/store/\`)
$(ls app/store/ 2>/dev/null | sed 's/^/- /')

---

## Simulador (\`tools/device_simulator/\`)

### Archivos principales
\`\`\`
$(ls -la tools/device_simulator/ 2>/dev/null | grep -v "node_modules\|devices_state\|^total\|^d.*\\.$" | awk 'NF>=9 {printf "%s %s\n", $5, $NF}')
\`\`\`

### Lib
\`\`\`
$(ls -la tools/device_simulator/lib/ 2>/dev/null | grep "\.js$" | awk '{printf "lib/%s %s bytes\n", $NF, $5}')
\`\`\`

---

## Últimos 30 commits (rama actual)

\`\`\`
$(git log --oneline -30)
\`\`\`

---

## Ramas locales y remotas

### Locales
\`\`\`
$(git branch | head -20)
\`\`\`

### Remotas
\`\`\`
$(git branch -r | head -20)
\`\`\`

---

## Estadísticas del repo

- **Total de modelos**: $(ls app/api/models/*.js 2>/dev/null | wc -l)
- **Total de routes**: $(ls app/api/routes/*.js 2>/dev/null | wc -l)
- **Total de pages**: $(find app/pages -name "*.vue" 2>/dev/null | wc -l)
- **Total de componentes Vue**: $(find app/components -name "*.vue" 2>/dev/null | wc -l)
- **Total de commits en la branch**: $(git rev-list --count HEAD)
- **Commits desde master**: $(git rev-list --count master..HEAD 2>/dev/null || echo "n/a")

EOF

echo "✅ Inventario regenerado: $OUTPUT"
echo "   Tamaño: $(wc -l < "$OUTPUT") líneas"
