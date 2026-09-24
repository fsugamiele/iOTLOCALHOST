<template>
  <span class="equipment-alarms">
    <template v-if="context === 'editor'">
      <!-- Mock editor: 2 alarmas de muestra, mismo render que live -->
      <span class="equipment-alarms__item" v-for="(m, i) in editorMock" :key="i"
            :class="'equipment-alarms--' + m.severity">
        <span class="equipment-alarms__badge">{{ m.severity }}</span>
        <span class="equipment-alarms__label">{{ m.label }}</span>
        <span class="equipment-alarms__age">hace {{ m.age }}</span>
      </span>
    </template>
    <template v-else-if="!siteContext">
      <span class="equipment-alarms__nodata">sin contexto de sitio</span>
    </template>
    <template v-else-if="!alarms || alarms.length === 0">
      <span class="equipment-alarms__ok">
        <i class="tim-icons icon-check-2"></i> Sin alarmas activas
      </span>
    </template>
    <template v-else>
      <!-- DEC-REF-108 F4 (#80) — consolidación: el mismo texto repetido
           (varios bits de un status word con el mismo label) se agrupa en UN
           ítem con contador ×N. La gravedad y la edad se conservan del grupo. -->
      <span class="equipment-alarms__item" v-for="a in groupedAlarms.slice(0, 5)" :key="a.ruleId"
            :class="'equipment-alarms--' + (a.severity || 'info')">
        <span class="equipment-alarms__badge">{{ a.severity || 'info' }}</span>
        <span class="equipment-alarms__label">{{ a.label || a.variableFullName || a.variable }}</span>
        <span v-if="a.count > 1" class="equipment-alarms__count">×{{ a.count }}</span>
        <span class="equipment-alarms__age">hace {{ ageLabel(a.time) }}</span>
        <!-- DEC-REF-100 D-4 — recomendación de la regla (ya viaja en el feed) -->
        <span v-if="a.recommendation" class="equipment-alarms__rec">→ {{ a.recommendation }}</span>
      </span>
      <span v-if="groupedAlarms.length > 5" class="equipment-alarms__more">
        +{{ groupedAlarms.length - 5 }} más
      </span>
    </template>
  </span>
</template>

<script>
// DEC-REF-98 D-3 (#73) — equipmentAlarms, presentación PURA.
// Lista las alarmas ACTIVAS del equipo (≤5 + contador). La activación
// la computa EquipmentAlarmsLive (último evento por ruleId ≠ resolve).
// `siteContext` false = la composición no tiene siteCode (la vista no
// es de sitio) → mensaje honesto, no lista vacía que mentiría "sin
// alarmas". Editor → 2 mocks para previsualizar densidad y colores.
export default {
  name: 'EquipmentAlarms',
  props: {
    alarms:      { type: Array, default: null },
    siteContext: { type: Boolean, default: true },
    context:     { type: String, default: 'live' },
  },
  data() {
    return {
      editorMock: [
        { severity: 'critical', label: 'Temperatura de motor alta', age: '12 min' },
        { severity: 'warning',  label: 'Nivel de combustible bajo', age: '1 h 5 min' },
      ],
    };
  },
  computed: {
    // DEC-REF-108 F4 (#80) — agrupa por (severidad + label): N bits de un
    // status word con el mismo texto son UN evento para el operador, con
    // contador. Orden estable: primera aparición en el feed (ya viene
    // ordenado por tiempo desc desde Live).
    groupedAlarms() {
      const list = Array.isArray(this.alarms) ? this.alarms : [];
      const map = new Map();
      for (const a of list) {
        const key = (a.severity || 'info') + '|' + (a.label || a.variableFullName || a.variable || '');
        const cur = map.get(key);
        if (cur) cur.count += 1;
        else map.set(key, { ...a, count: 1 });
      }
      return [...map.values()];
    },
  },
  methods: {
    ageLabel(t) {
      if (!Number.isFinite(t)) return '—';
      const s = Math.max(0, Math.round((Date.now() - t) / 1000));
      if (s < 60) return s + ' s';
      if (s < 3600) return Math.floor(s / 60) + ' min';
      const h = Math.floor(s / 3600);
      const m = Math.round((s % 3600) / 60);
      return m ? `${h} h ${m} min` : `${h} h`;
    },
  },
};
</script>

<style scoped>
.equipment-alarms { display: block; font-size: 0.75em; }
.equipment-alarms__item {
  display: flex; align-items: center; gap: 8px;
  padding: 3px 0;
}
.equipment-alarms__badge {
  text-transform: uppercase; font-size: 0.7em; font-weight: 700;
  padding: 1px 6px; border-radius: 3px;
  background: currentColor; color: #1e1e2f;
  min-width: 58px; text-align: center;
}
.equipment-alarms--critical { color: #fd5d93; }
.equipment-alarms--warning  { color: #ff8d72; }
.equipment-alarms--info     { color: #1d8cf8; }
.equipment-alarms__label { color: #d3d7e0; flex: 1; }
/* DEC-REF-113 F1 (#84) — modo claro: el label era gris casi blanco (invisible). */
.white-content .equipment-alarms__label { color: #2b3553; }
.equipment-alarms__count {
  background: rgba(255, 255, 255, 0.12); color: #d3d7e0;
  font-size: 0.8em; font-weight: 700; border-radius: 8px; padding: 0 6px;
}
.white-content .equipment-alarms__count { background: rgba(0, 0, 0, 0.08); color: #525f7f; }
.equipment-alarms__age { color: #6b7280; font-size: 0.85em; white-space: nowrap; }
.equipment-alarms__rec { flex-basis: 100%; color: #9aa0b4; font-size: 0.85em; font-style: italic; margin-left: 66px; }
.white-content .equipment-alarms__rec { color: #525f7f; }
.equipment-alarms__more { color: #6b7280; font-size: 0.85em; font-style: italic; }
.equipment-alarms__ok { color: #00bf9a; }
.equipment-alarms__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
</style>
