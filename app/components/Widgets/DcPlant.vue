<template>
  <div class="dc-plant">
    <div
      v-for="(m, i) in metrics"
      :key="i"
      class="dc-plant__cell"
      :class="'dc-plant__cell--' + m.status"
    >
      <div class="dc-plant__label">{{ m.label }}</div>
      <div class="dc-plant__value">
        <span>{{ m.display }}</span><small v-if="m.unit"> {{ m.unit }}</small>
      </div>
    </div>
    <div v-if="!metrics.length" class="dc-plant__empty">sin métricas configuradas</div>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 5) — dcPlant, presentación PURA multi-fuente.
// Salud de la planta DC: tensión de barra, corriente, batería… Cada source es
// una métrica en vivo (values[key].value). Color por umbral si la source lo
// declara (thresholds propios); si no, cromo neutro.
export default {
  name: 'DcPlant',
  props: {
    values:  { type: Object, default: () => ({}) },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    metrics() {
      if (this.context === 'editor') {
        return [
          { label: 'Tensión barra', display: '54.2', unit: 'V', status: 'ok' },
          { label: 'Corriente',     display: '12.3', unit: 'A', status: 'ok' },
          { label: 'Batería',       display: '25',   unit: '°C', status: 'ok' },
        ];
      }
      return (this.config.sources || []).map((s) => {
        const entry = this.values[s.key];
        const v = entry ? entry.value : undefined;
        const has = v !== undefined && v !== null && Number.isFinite(Number(v));
        return {
          label: s.variableFullName || s.variable,
          unit: s.unit || '',
          display: has ? this.fmt(Number(v), s) : '—',
          status: has ? this.statusOf(Number(v), s) : 'nodata',
        };
      });
    },
  },
  methods: {
    fmt(n, s) {
      const dp = Number.isFinite(s.decimalPlaces) ? s.decimalPlaces : (s.variableType === 'int' ? 0 : 1);
      return n.toFixed(dp);
    },
    statusOf(n, s) {
      const t = s.thresholds || {};
      if (t.criticalLow != null && n < t.criticalLow) return 'critical';
      if (t.criticalHigh != null && n > t.criticalHigh) return 'critical';
      if (t.warningLow != null && n < t.warningLow) return 'warning';
      if (t.warningHigh != null && n > t.warningHigh) return 'warning';
      if (t.criticalLow != null || t.warningLow != null || t.warningHigh != null || t.criticalHigh != null) return 'ok';
      return 'unknown';
    },
  },
};
</script>

<style scoped>
.dc-plant {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.dc-plant__cell {
  flex: 1 1 90px;
  min-width: 90px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid #1d8cf8;
}
.dc-plant__label { font-size: 0.72em; color: #9aa5b1; }
.dc-plant__value { font-size: 1.4em; font-weight: 600; color: #fff; }
.dc-plant__value small { font-size: 0.55em; color: #6b7280; }
.dc-plant__empty { color: #6b7280; font-style: italic; opacity: 0.7; }

.dc-plant__cell--ok       { border-left-color: #00bf9a; }
.dc-plant__cell--warning  { border-left-color: #ff8d72; }
.dc-plant__cell--critical { border-left-color: #fd5d93; }
.dc-plant__cell--unknown  { border-left-color: #1d8cf8; }
.dc-plant__cell--nodata   { border-left-color: #4a5160; }
</style>
