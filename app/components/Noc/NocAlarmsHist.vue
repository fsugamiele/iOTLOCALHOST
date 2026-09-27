<template>
  <!-- Histograma de alertas 7 días del Panel (split de NocRecentAlarms —
       Panel personalizable: feed e histograma son widgets independientes). -->
  <div class="noc-alarms-hist">
    <p class="card-category noc-hist-tz">Zona horaria: {{ severityHistogram7d.tz }}</p>
    <div v-if="!severityHistogram7d.buckets || severityHistogram7d.buckets.length === 0" class="text-muted text-center p-3">
      Sin alarmas en 7 días.
    </div>
    <div v-else class="chart-area">
      <client-only>
        <highchart :options="chartOptions" style="height: 100%" />
      </client-only>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NocAlarmsHist',
  props: {
    severityHistogram7d: { type: Object, default: () => ({ tz: '', buckets: [] }) },
    isLight:             { type: Boolean, default: false },
  },
  computed: {
    chartOptions() {
      const textColor = this.isLight ? '#525f7f' : '#d4d2d2';
      const gridColor = this.isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      const buckets = this.severityHistogram7d.buckets || [];
      const categories = buckets.map(b => b.day);
      return {
        credits: { enabled: false },
        chart:   { type: 'column', backgroundColor: 'rgba(0,0,0,0)' },
        title:   { text: '' },
        xAxis:   { categories, labels: { style: { color: textColor } }, gridLineColor: gridColor },
        yAxis:   {
          min: 0, title: { text: '' },
          labels: { style: { color: textColor } },
          gridLineColor: gridColor,
          stackLabels: { enabled: false },
        },
        legend:      { itemStyle: { color: textColor } },
        plotOptions: { column: { stacking: 'normal', borderWidth: 0 } },
        series: [
          { name: 'Crítica',     color: '#E24B4A', data: buckets.map(b => b.critical || 0) },
          { name: 'Advertencia', color: '#EF9F27', data: buckets.map(b => b.warning  || 0) },
          { name: 'Informativa', color: '#3aa2ff', data: buckets.map(b => b.info     || 0) },
        ],
      };
    },
  },
};
</script>

<style scoped>
.noc-alarms-hist { height: 100%; display: flex; flex-direction: column; }
.noc-hist-tz     { margin: 0 0 4px; }
/* El gráfico llena el widget (autoajustable a la grilla). */
.chart-area      { flex: 1 1 auto; min-height: 150px; }
</style>
