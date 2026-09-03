<template>
  <span class="boolean-dwell" :class="'boolean-dwell--' + (isOn ? 'on' : 'off')">
    <template v-if="!hasData">
      <span v-if="context === 'editor'" class="boolean-dwell__na">—</span>
      <span v-else class="boolean-dwell__nodata">sin dato</span>
    </template>
    <template v-else>
      <span class="boolean-dwell__state">{{ isOn ? 'Activo' : 'Inactivo' }}</span>
      <span class="boolean-dwell__since">
        <template v-if="dwellSince">desde hace {{ dwellLabel }}</template>
        <template v-else>al menos {{ windowLabel }} en este estado</template>
      </span>
    </template>
  </span>
</template>

<script>
// DEC-REF-98 D-3 (#73) — booleanDwell, presentación PURA.
// Cuánto lleva el booleano en su estado actual. `dwellSince` (ms) lo
// computa BooleanDwellLive del historial + stream. Si la ventana de
// historial no alcanzó para ver un cambio, se dice "al menos" — nunca
// se afirma una permanencia mayor a la observada.
// Misma nota de pureza que DataFreshness: timer propio (30 s) en live.
export default {
  name: 'BooleanDwell',
  props: {
    value:      { default: null },
    dwellSince: { default: null },
    windowHours:{ type: Number, default: 24 },
    context:    { type: String, default: 'live' },
  },
  data() {
    return { now: Date.now(), timer: null };
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined;
    },
    isOn() {
      const v = this.value;
      return v === true || v === 1 || v === '1' || v === 'true';
    },
    dwellSec() {
      if (!Number.isFinite(this.dwellSince)) return null;
      return Math.max(0, Math.round((this.now - this.dwellSince) / 1000));
    },
    dwellLabel() { return this.formatDur(this.dwellSec); },
    windowLabel() { return this.formatDur(this.windowHours * 3600); },
  },
  methods: {
    formatDur(s) {
      if (s == null) return '';
      if (s < 60) return s + ' s';
      if (s < 3600) return Math.floor(s / 60) + ' min';
      const h = Math.floor(s / 3600);
      const m = Math.round((s % 3600) / 60);
      return m ? `${h} h ${m} min` : `${h} h`;
    },
  },
  mounted() {
    if (this.context === 'live') {
      this.timer = setInterval(() => { this.now = Date.now(); }, 30000);
    }
  },
  beforeDestroy() {
    if (this.timer) clearInterval(this.timer);
  },
};
</script>

<style scoped>
.boolean-dwell__state { font-size: 1.3em; font-weight: 600; }
.boolean-dwell__since { margin-left: 8px; color: #6b7280; font-size: 0.65em; }
.boolean-dwell--on  .boolean-dwell__state { color: #00bf9a; }
.boolean-dwell--off .boolean-dwell__state { color: #6b7280; }
.boolean-dwell__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
.boolean-dwell__na { color: #6b7280; }
</style>
