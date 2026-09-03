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
      <span class="equipment-alarms__item" v-for="a in alarms.slice(0, 5)" :key="a.ruleId"
            :class="'equipment-alarms--' + (a.severity || 'info')">
        <span class="equipment-alarms__badge">{{ a.severity || 'info' }}</span>
        <span class="equipment-alarms__label">{{ a.label || a.variableFullName || a.variable }}</span>
        <span class="equipment-alarms__age">hace {{ ageLabel(a.time) }}</span>
      </span>
      <span v-if="alarms.length > 5" class="equipment-alarms__more">
        +{{ alarms.length - 5 }} más
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
.equipment-alarms__age { color: #6b7280; font-size: 0.85em; white-space: nowrap; }
.equipment-alarms__more { color: #6b7280; font-size: 0.85em; font-style: italic; }
.equipment-alarms__ok { color: #00bf9a; }
.equipment-alarms__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
</style>
