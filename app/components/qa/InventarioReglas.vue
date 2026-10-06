<template>
  <!-- DEC-REF-141 · Inventario de reglas (mockup 1:1): tabla agrupada por pack,
       con badge de calidad (🟢🟡🔴🟣🔁🧟⚠️), disparos 30d, último disparo, y el
       interruptor on/off por regla y por pack.
       Datos: GET /api/qa/inventory (prop `inventory`). Los toggles PATCHean los
       endpoints reales del interruptor (DEC-REF-121) y emiten eventos al padre,
       que recarga; este componente no muta estado local del motor. -->
  <div class="qa-panel">
    <div class="qa-panel__h">
      <b>Inventario de reglas</b>
      <span class="qa-panel__meta">
        {{ inventory.length }} reglas · {{ packIds.length }} packs · últimos 30 días
      </span>
    </div>

    <p v-if="!inventory.length" class="qa-empty">
      No hay reglas en ningún pack todavía.
    </p>

    <table v-else class="qa-table">
      <thead>
        <tr>
          <th>Regla</th>
          <th>Estado</th>
          <th class="qa-r">Disparos (30 d)</th>
          <th>Último</th>
          <th>En circulación</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="group in grouped">
          <!-- Fila de pack: interruptor del pack completo -->
          <tr class="qa-pack" :key="'pack-' + group.packId">
            <td colspan="3">
              📦 <code>{{ group.packId }}</code>
              <span class="qa-pack__sub">(pack completo)</span>
            </td>
            <td></td>
            <td class="qa-sw">
              <label class="qa-switch" :title="packToggling[group.packId] ? 'Cambiando…' : 'Interruptor del pack completo'">
                <input
                  type="checkbox"
                  :checked="group.enabled"
                  :disabled="!!packToggling[group.packId]"
                  @change="onTogglePack(group.packId, $event.target.checked)"
                >
                <span class="qa-sl"></span>
              </label>
            </td>
          </tr>
          <!-- Filas de reglas del pack -->
          <tr
            v-for="row in group.rules"
            :key="group.packId + '-' + row.ruleId"
            :class="{ 'qa-off': !row.enabled }"
          >
            <td class="qa-rl">
              {{ row.label }}
              <small>{{ row.ruleId }}</small>
            </td>
            <td>
              <span class="qa-badge" :class="'b-' + row.badge.key">
                {{ row.badge.emoji }} {{ badgeText(row.badge) }}
              </span>
            </td>
            <td class="qa-num">{{ formatNumber(row.fires30d) }}</td>
            <td>{{ relativeTime(row.lastFire) }}</td>
            <td class="qa-sw">
              <label class="qa-switch" :title="ruleKey(row) in ruleToggling ? 'Cambiando…' : 'Interruptor de la regla'">
                <input
                  type="checkbox"
                  :checked="row.enabled"
                  :disabled="ruleKey(row) in ruleToggling"
                  @change="onToggleRule(row, $event.target.checked)"
                >
                <span class="qa-sl"></span>
              </label>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script>
export default {
  name: 'QaInventarioReglas',
  props: {
    // inventory = data de GET /api/qa/inventory: [{ruleId,packId,label,
    // deviceType,enabled,fires30d,lastFire,badge:{key,emoji,label},findingIds}]
    inventory: { type: Array, default: () => [] },
  },
  data() {
    return {
      // Flags por-regla / por-pack en vuelo, para deshabilitar el input mientras
      // el PATCH viaja (evita doble disparo). La clave de regla es packId+ruleId.
      ruleToggling: {},
      packToggling: {},
    };
  },
  computed: {
    packIds() {
      return [...new Set(this.inventory.map(r => r.packId))];
    },
    // Agrupa el inventario por packId para la vista con fila-pack + reglas.
    // El `enabled` del pack se deriva: un pack está "en circulación" si no
    // todas sus reglas vienen apagadas por el pack. Como la API expone el
    // enabled EFECTIVO (pack && regla) por regla, el estado del pack no es
    // 100% recuperable fila a fila; se asume "pack activo" salvo que TODAS
    // sus reglas estén apagadas (señal de pack fuera de circulación).
    grouped() {
      const map = new Map();
      for (const r of this.inventory) {
        if (!map.has(r.packId)) map.set(r.packId, []);
        map.get(r.packId).push(r);
      }
      const out = [];
      for (const [packId, rules] of map.entries()) {
        const enabled = rules.some(r => r.enabled);
        out.push({ packId, rules, enabled });
      }
      return out;
    },
  },
  methods: {
    ruleKey(row) {
      return row.packId + '::' + row.ruleId;
    },
    badgeText(badge) {
      // Capitaliza la etiqueta que vino de la API (badge.label: 'sana', 'muerta'…).
      const l = badge.label || '';
      return l.charAt(0).toUpperCase() + l.slice(1);
    },
    formatNumber(n) {
      if (n == null) return '0';
      return Number(n).toLocaleString('es-AR');
    },
    // "hace 2 min" / "ayer" / "hace 3 d" a partir de un timestamp (ms epoch o
    // Date). Null/0 → "—" (nunca disparó).
    relativeTime(ts) {
      if (!ts) return '—';
      const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
      if (!Number.isFinite(t) || t <= 0) return '—';
      const diff = Date.now() - t;
      if (diff < 0) return 'recién';
      const min = Math.floor(diff / 60000);
      if (min < 1) return 'recién';
      if (min < 60) return `hace ${min} min`;
      const hs = Math.floor(min / 60);
      if (hs < 24) return `hace ${hs} h`;
      const d = Math.floor(hs / 24);
      if (d === 1) return 'ayer';
      return `hace ${d} d`;
    },
    // Interruptor de REGLA (DEC-REF-121). Emite al padre, que hace el PATCH a
    // /rulepacks/:packId/rules/:ruleId/enabled y recarga el inventario. Se
    // bloquea el input mientras tanto; si falla, el padre recarga y el checkbox
    // vuelve a reflejar el estado real (no queda inconsistente).
    onToggleRule(row, enabled) {
      const key = this.ruleKey(row);
      this.$set(this.ruleToggling, key, true);
      this.$emit('toggle-rule', {
        packId: row.packId,
        ruleId: row.ruleId,
        enabled,
        done: () => this.$delete(this.ruleToggling, key),
      });
    },
    onTogglePack(packId, enabled) {
      this.$set(this.packToggling, packId, true);
      this.$emit('toggle-pack', {
        packId,
        enabled,
        done: () => this.$delete(this.packToggling, packId),
      });
    },
  },
};
</script>

<style scoped>
/* DEC-REF-141 — tabla del inventario + switches (tema Wanomi teal). */
.qa-panel {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 18px;
  overflow: hidden;
}
.qa-panel__h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.qa-panel__meta {
  font-size: 12.5px;
  opacity: 0.65;
}
.qa-empty {
  padding: 18px;
  opacity: 0.65;
  margin: 0;
}
.qa-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13.5px;
}
.qa-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  opacity: 0.6;
  padding: 9px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.qa-table th.qa-r { text-align: right; }
.qa-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  vertical-align: middle;
}
.qa-table tr:last-child td { border-bottom: 0; }
.qa-pack td {
  background: rgba(0, 191, 154, 0.08);
  font-weight: 600;
}
.qa-pack__sub { font-weight: 400; opacity: 0.6; margin-left: 6px; font-size: 12px; }
.qa-off td:not(.qa-sw) { opacity: 0.45; }
.qa-num {
  font-variant-numeric: tabular-nums;
  text-align: right;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12.5px;
}
.qa-rl { font-weight: 600; }
.qa-rl small {
  display: block;
  font-weight: 400;
  opacity: 0.55;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 11px;
}
.qa-badge {
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.b-ok { background: rgba(31, 138, 91, 0.15); color: #1f8a5b; }
.b-dead { background: rgba(180, 35, 44, 0.15); color: #ec250d; }
.b-perm { background: rgba(122, 62, 168, 0.16); color: #8b46c0; }
.b-noisy { background: rgba(168, 106, 0, 0.18); color: #ff9f43; }
.b-flap { background: rgba(168, 106, 0, 0.18); color: #ff9f43; }
.b-zombie { background: rgba(122, 62, 168, 0.14); color: #a06cd0; }
.b-mismatch { background: rgba(43, 100, 166, 0.16); color: #2b64a6; }

/* switch — espejo del .pack-switch del repo (DEC-REF-121) */
.qa-sw { width: 64px; }
.qa-switch { position: relative; display: inline-block; width: 46px; height: 26px; margin: 0; }
.qa-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.qa-sl {
  position: absolute; inset: 0; background: #c3ccd6; border-radius: 999px;
  transition: .2s; cursor: pointer;
}
.qa-sl::before {
  content: ""; position: absolute; height: 20px; width: 20px; left: 3px; top: 3px;
  background: #fff; border-radius: 50%; transition: .2s; box-shadow: 0 1px 2px rgba(0,0,0,.3);
}
.qa-switch input:checked + .qa-sl { background: #00997e; }
.qa-switch input:checked + .qa-sl::before { transform: translateX(20px); }
.qa-switch input:disabled + .qa-sl { opacity: .5; cursor: progress; }

/* Modo claro */
.white-content .qa-panel { background: #fff; border-color: rgba(0, 0, 0, 0.09); }
.white-content .qa-panel__h { border-color: rgba(0, 0, 0, 0.08); }
.white-content .qa-table th { border-color: rgba(0, 0, 0, 0.08); color: #55706b; opacity: 1; }
.white-content .qa-table td { border-color: rgba(0, 0, 0, 0.06); }
.white-content .qa-rl small { color: #55706b; opacity: 1; }
</style>
