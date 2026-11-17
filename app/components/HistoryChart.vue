<template>
  <div class="history-chart-wrapper">
    <div v-if="loading && !hayDatos" class="history-chart-state">
      <i class="tim-icons icon-refresh-01 spin"></i> Cargando…
    </div>
    <div v-else-if="error" class="history-chart-state history-chart-error">
      <i class="tim-icons icon-alert-circle-exc"></i> {{ error }}
    </div>
    <div v-else-if="!vars.length" class="history-chart-state">
      Elegí una o más variables
    </div>
    <div v-else-if="!hayDatos" class="history-chart-state">
      Sin datos en este rango
    </div>
    <div v-else class="chart-area" style="height: 360px">
      <client-only>
        <highchart style="height: 100%" :options="chartOptions"/>
      </client-only>
    </div>
  </div>
</template>

<script>
// 31.4b — Componente presentational de chart histórico (DEC-STACK-1).
// Sin fetch, sin auth, sin store, sin saber del backend. Solo dibuja.
// Franco 2026-11-17 — varias variables juntas: una serie por variable, un eje Y por unidad
// (utils/multiSeriesChart). La autorización vive en el backend (DEC-REF-33/34).
import { buildMultiChart } from '@/utils/multiSeriesChart';

export default {
  name: 'HistoryChart',
  props: {
    series:  { type: Array,   default: () => [] },   // [{ name, variable, unit, data: [[time, value]] }]
    vars:    { type: Array,   default: () => [] },   // [{ variable, label, unit }] en el orden elegido
    loading: { type: Boolean, default: false },
    error:   { type: String,  default: null },
  },
  computed: {
    hayDatos() { return this.series.some(s => s.data && s.data.length); },
    chartOptions() {
      const isLight = typeof document !== 'undefined' && document.body.classList.contains('white-content');
      return buildMultiChart(this.series, this.vars, { isLight, colorBy: 'variable' });
    },
  },
};
</script>

<style>
.history-chart-wrapper { width: 100%; }
.history-chart-state {
  display: flex; align-items: center; justify-content: center;
  height: 360px; color: #999; gap: 0.5rem;
}
.history-chart-error { color: #fd5d93; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
