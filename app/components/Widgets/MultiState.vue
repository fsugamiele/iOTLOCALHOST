<template>
  <span class="multi-state" :class="'multi-state--' + status">
    <template v-if="!hasData">
      <span v-if="context === 'editor'" class="multi-state__na">—</span>
      <span v-else class="multi-state__nodata">sin dato</span>
    </template>
    <template v-else>
      <span class="multi-state__label">{{ label }}</span>
      <span v-if="!matched" class="multi-state__raw">({{ value }})</span>
    </template>
  </span>
</template>

<script>
// DEC-REF-98 D-3 (#73) — multiState, presentación PURA.
// value = estado nombrado del equipo (string). El catálogo es
// config.enumValues [{value, label, severity}] (widgetSchema, DEC-REF-76).
// Valor FUERA de catálogo → gris + valor crudo: la plataforma no inventa
// el significado de un estado que el fabricante no declaró.
export default {
  name: 'MultiState',
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined && this.value !== '';
    },
    entry() {
      const list = this.config.enumValues || [];
      return list.find((e) => String(e.value) === String(this.value)) || null;
    },
    matched() { return !!this.entry; },
    label() { return this.entry ? (this.entry.label || this.entry.value) : String(this.value); },
    status() {
      if (!this.hasData) return this.context === 'editor' ? 'na' : 'nodata';
      if (!this.entry) return 'unknown';
      const sev = this.entry.severity || 'info';
      return ['ok', 'warning', 'critical', 'info'].includes(sev) ? sev : 'info';
    },
  },
};
</script>

<style scoped>
.multi-state__label { font-size: 1.3em; font-weight: 600; }
.multi-state__raw { margin-left: 6px; font-size: 0.7em; opacity: 0.6; }

.multi-state           { color: #1d8cf8; }
.multi-state--ok       { color: #00bf9a; }
.multi-state--info     { color: #1d8cf8; }
.multi-state--warning  { color: #ff8d72; }
.multi-state--critical { color: #fd5d93; }
.multi-state--unknown  { color: #6b7280; }
.multi-state--nodata, .multi-state--na { color: #6b7280; }
.multi-state__nodata { font-style: italic; opacity: 0.7; }
</style>
