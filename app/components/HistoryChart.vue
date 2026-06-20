<template>
  <div class="history-chart-wrapper">
    <div v-if="loading" class="history-chart-state">
      <i class="tim-icons icon-refresh-01 spin"></i> Cargando…
    </div>
    <div v-else-if="error" class="history-chart-state history-chart-error">
      <i class="tim-icons icon-alert-circle-exc"></i> {{ error }}
    </div>
    <div v-else-if="!samples || samples.length === 0" class="history-chart-state">
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
// Mismo patrón visual que Rtnumberchart.vue (consistencia UI con dashboard).
// La autorización vive en el backend (DEC-REF-33/34); este componente NO
// reimplementa permisos.
export default {
  name: 'HistoryChart',
  props: {
    samples:          { type: Array,   default: () => [] },
    variableFullName: { type: String,  default: '' },
    loading:          { type: Boolean, default: false },
    error:            { type: String,  default: null },
  },
  computed: {
    chartOptions() {
      // Compensación timezone: el backend devuelve epoch ms; Highcharts xAxis
      // 'datetime' interpreta como UTC. Mismo ajuste que Rtnumberchart.vue.
      const offset = new Date().getTimezoneOffset() * 60 * 1000 * -1;
      const data = (this.samples || []).map(s => [s.time + offset, s.value]);
      return {
        credits: { enabled: false },
        chart:   { defaultSeriesType: 'line', backgroundColor: 'rgba(0,0,0,0)' },
        title:   { text: '' },
        xAxis: {
          type: 'datetime',
          labels: { style: { color: '#d4d2d2' } },
        },
        yAxis: {
          title:  { text: '' },
          labels: { style: { color: '#d4d2d2', font: '11px Trebuchet MS, Verdana, sans-serif' } },
        },
        plotOptions: {
          series: { label: { connectorAllowed: false } },
        },
        series: [{
          name: this.variableFullName,
          data,
          color: '#e14eca',
        }],
        legend: { itemStyle: { color: '#d4d2d2' } },
        responsive: {
          rules: [{
            condition: { maxWidth: 500 },
            chartOptions: { legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' } },
          }],
        },
      };
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
