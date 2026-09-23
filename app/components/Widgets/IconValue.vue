<template>
  <div class="icon-value" :class="'icon-value--' + status">
    <i v-if="config.icon" class="fa icon-value__icon" :class="config.icon"></i>
    <div class="icon-value__body">
      <template v-if="hasData">
        <span class="icon-value__num">{{ display }}</span>
        <small v-if="unit" class="icon-value__unit">{{ unit }}</small>
      </template>
      <template v-else>
        <span v-if="context === 'editor'" class="icon-value__na">—</span>
        <span v-else class="icon-value__nodata">sin dato</span>
      </template>
    </div>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 2) — REPRESENTACIÓN `icon` de la familia numérica.
// Ícono + número + unidad (estilo Wanomi primitivo). Color por umbral igual
// que valueStatus (si hay thresholds), si no cromo neutro.
export default {
  name: 'IconValue',
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined && Number.isFinite(Number(this.value));
    },
    unit() { return this.config.unit || ''; },
    decimals() {
      return Number.isFinite(this.config.decimalPlaces) ? this.config.decimalPlaces : (this.config.variableType === 'int' ? 0 : 1);
    },
    display() {
      const n = Number(this.value);
      return Number.isFinite(n) ? n.toFixed(this.decimals) : String(this.value);
    },
    status() {
      if (!this.hasData) return this.context === 'editor' ? 'na' : 'nodata';
      const t = this.config.thresholds || {};
      const n = Number(this.value);
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
.icon-value { display: flex; align-items: center; gap: 12px; color: #00bf9a; }
.icon-value__icon { font-size: 2em; opacity: 0.9; }
.icon-value__body { display: flex; align-items: baseline; gap: 4px; }
.icon-value__num { font-size: 1.6em; font-weight: 600; }
.icon-value__unit { color: #6b7280; font-size: 0.8em; }

.icon-value--ok       { color: #00bf9a; }
.icon-value--warning  { color: #ff8d72; }
.icon-value--critical { color: #fd5d93; }
.icon-value--unknown  { color: #00bf9a; }
.icon-value--nodata, .icon-value--na { color: #6b7280; }
.icon-value__nodata { font-style: italic; opacity: 0.7; }
</style>
