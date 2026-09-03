<template>
  <span class="tank-level" :class="'tank-level--' + status">
    <template v-if="!hasData">
      <span v-if="context === 'editor'" class="tank-level__na">—</span>
      <span v-else class="tank-level__nodata">sin dato</span>
    </template>
    <template v-else>
      <span class="tank-level__pct">{{ pct }}<small>%</small></span>
      <span v-if="liters !== null" class="tank-level__liters">
        {{ liters }} <small>{{ config.tankUnit || 'L' }}</small>
      </span>
      <span class="tank-level__bar">
        <span class="tank-level__fill" :style="{ width: pct + '%' }"></span>
      </span>
    </template>
  </span>
</template>

<script>
// DEC-REF-98 D-3 (#73) — tankLevel, presentación PURA.
// value = nivel 0-100 (%). Si la ficha/template declara tankCapacity,
// muestra el contenido absoluto (litros = % × capacidad). Color por
// thresholds (convención DEC-REF-70 g): para un tanque lo crítico es
// ABAJO → criticalLow/warningLow. Sin umbrales → azul neutro (no afirmar
// "ok" sin criterio, misma regla que ValueStatus).
export default {
  name: 'TankLevel',
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined && Number.isFinite(Number(this.value));
    },
    pct() {
      const n = Number(this.value);
      return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
    },
    liters() {
      const cap = Number(this.config.tankCapacity);
      if (!Number.isFinite(cap) || cap <= 0) return null;
      return Math.round(this.pct * cap / 100);
    },
    status() {
      if (!this.hasData) return this.context === 'editor' ? 'na' : 'nodata';
      const t = this.config.thresholds || {};
      const n = this.pct;
      if (t.criticalLow != null && n < t.criticalLow) return 'critical';
      if (t.warningLow  != null && n < t.warningLow)  return 'warning';
      if (t.criticalLow != null || t.warningLow != null) return 'ok';
      return 'unknown';
    },
  },
};
</script>

<style scoped>
.tank-level__pct { font-size: 1.4em; font-weight: 600; }
.tank-level__pct small { font-size: 0.5em; margin-left: 2px; }
.tank-level__liters { margin-left: 10px; color: #6b7280; font-size: 0.65em; }
.tank-level__bar {
  display: block; height: 8px; border-radius: 4px;
  background: rgba(255,255,255,0.1); margin-top: 6px; overflow: hidden;
}
.tank-level__fill { display: block; height: 100%; border-radius: 4px; background: currentColor; transition: width 0.4s; }

.tank-level           { color: #1d8cf8; }
.tank-level--ok       { color: #00bf9a; }
.tank-level--warning  { color: #ff8d72; }
.tank-level--critical { color: #fd5d93; }
.tank-level--unknown  { color: #1d8cf8; }
.tank-level--nodata, .tank-level--na { color: #6b7280; }
.tank-level__nodata { font-style: italic; opacity: 0.7; }
</style>
