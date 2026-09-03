<template>
  <span class="projected-autonomy" :class="'projected-autonomy--' + status">
    <template v-if="!hasData">
      <span v-if="context === 'editor'" class="projected-autonomy__na">—</span>
      <span v-else class="projected-autonomy__nodata">sin dato</span>
    </template>
    <template v-else>
      <span class="projected-autonomy__value">{{ formatted }}</span>
      <span class="projected-autonomy__suffix">de autonomía</span>
    </template>
  </span>
</template>

<script>
// DEC-REF-98 D-3 (#73) — projectedAutonomy, presentación PURA.
// value = horas de autonomía que PUBLICA EL EQUIPO (la calcula el
// controlador del fabricante — la ficha la declara; la plataforma no
// estima consumo, presenta). Si el equipo no la publica → "sin dato".
// Color por thresholds con criterio tanque: lo crítico es ABAJO
// (criticalLow/warningLow, en horas).
export default {
  name: 'ProjectedAutonomy',
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined && Number.isFinite(Number(this.value));
    },
    hours() { return Number(this.value); },
    formatted() {
      const h = this.hours;
      if (h < 1) return Math.round(h * 60) + ' min';
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return mm ? `${hh} h ${mm} min` : `${hh} h`;
    },
    status() {
      if (!this.hasData) return this.context === 'editor' ? 'na' : 'nodata';
      const t = this.config.thresholds || {};
      const n = this.hours;
      if (t.criticalLow != null && n < t.criticalLow) return 'critical';
      if (t.warningLow  != null && n < t.warningLow)  return 'warning';
      if (t.criticalLow != null || t.warningLow != null) return 'ok';
      return 'unknown';
    },
  },
};
</script>

<style scoped>
.projected-autonomy__value { font-size: 1.4em; font-weight: 600; }
.projected-autonomy__suffix { margin-left: 8px; color: #6b7280; font-size: 0.65em; }

.projected-autonomy           { color: #1d8cf8; }
.projected-autonomy--ok       { color: #00bf9a; }
.projected-autonomy--warning  { color: #ff8d72; }
.projected-autonomy--critical { color: #fd5d93; }
.projected-autonomy--unknown  { color: #1d8cf8; }
.projected-autonomy--nodata, .projected-autonomy--na { color: #6b7280; }
.projected-autonomy__nodata { font-style: italic; opacity: 0.7; }
</style>
