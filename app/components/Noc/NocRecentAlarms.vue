<template>
  <div class="row noc-recent">
    <div class="col-lg-6 col-md-12">
      <card class="noc-alarms-card">
        <div slot="header"><h5 class="card-title mb-0">Alertas recientes</h5></div>
        <div v-if="!recentAlarms || recentAlarms.length === 0" class="text-muted text-center p-3">
          Sin alertas recientes.
        </div>
        <ul v-else class="noc-alarms-list">
          <li v-for="a in recentAlarms" :key="a._id" class="noc-alarm-item">
            <div class="alarm-line-1">
              <span :class="['noc-badge', 'noc-badge-' + badgeVariant(a.severity)]">{{ a.severity }}</span>
              <span class="alarm-site">{{ a.siteCode }} · {{ a.siteName }}</span>
              <span v-if="a.kind === 'resolve'" class="noc-badge noc-badge-success ml-1">resuelto</span>
            </div>
            <div class="alarm-line-2">
              <span class="alarm-msg">{{ a.message }}</span>
              <span class="alarm-time text-muted">{{ agoLabel(a.time) }}</span>
            </div>
          </li>
        </ul>
      </card>
    </div>

    <div class="col-lg-6 col-md-12">
      <card class="noc-hist-card">
        <div slot="header">
          <h5 class="card-title mb-0">Alertas · 7 días</h5>
          <p class="card-category">Zona horaria: {{ severityHistogram7d.tz }}</p>
        </div>
        <div v-if="!severityHistogram7d.buckets || severityHistogram7d.buckets.length === 0" class="text-muted text-center p-3">
          Sin alarmas en 7 días.
        </div>
        <div v-else class="chart-area">
          <client-only>
            <highchart :options="chartOptions" style="height: 100%" />
          </client-only>
        </div>
      </card>
    </div>
  </div>
</template>

<script>
// Feed de alertas recientes + histograma barras stacked por severity.
// El día del histograma viene YA en TZ Buenos Aires (backend, $dateToString
// con TZ_OPERACION) — el frontend usa string YYYY-MM-DD como categoría literal,
// SIN compensación de TZ del navegador (a diferencia del /trend).
// Theme via prop isLight (patrón G5.4/2').
export default {
  name: 'NocRecentAlarms',
  props: {
    recentAlarms:        { type: Array,  default: () => [] },
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
          { name: 'critical', color: '#E24B4A', data: buckets.map(b => b.critical || 0) },
          { name: 'warning',  color: '#EF9F27', data: buckets.map(b => b.warning  || 0) },
          { name: 'info',     color: '#3aa2ff', data: buckets.map(b => b.info     || 0) },
        ],
      };
    },
  },
  methods: {
    badgeVariant(severity) {
      if (severity === 'critical') return 'danger';
      if (severity === 'warning')  return 'warning';
      return 'info';
    },
    agoLabel(ms) {
      const diff = Math.max(0, Date.now() - ms);
      if (diff < 60000)    return 'hace unos segundos';
      if (diff < 3600000)  return 'hace ' + Math.floor(diff / 60000) + ' min';
      if (diff < 86400000) return 'hace ' + Math.floor(diff / 3600000) + ' h';
      return 'hace ' + Math.floor(diff / 86400000) + ' d';
    },
  },
};
</script>

<style scoped>
.noc-alarms-list { list-style: none; padding: 0; margin: 0; max-height: 400px; overflow-y: auto; }
.noc-alarm-item  { padding: 0.55em 0.75em; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.noc-alarm-item:last-child { border-bottom: none; }
.alarm-line-1    { display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.25em; }
.alarm-site      { font-weight: 500; }
.alarm-line-2    { display: flex; justify-content: space-between; gap: 1em; font-size: 0.9em; }
.alarm-msg       { flex: 1; opacity: 0.9; }
.alarm-time      { white-space: nowrap; }
.chart-area      { height: 340px; }

/* Fallback de badges scoped (ajuste 5') — no dependemos de que el template
   Bootstrap traiga .badge-*. Colores alineados con DEC-REF-27. */
.noc-badge         { display: inline-block; padding: 0.25em 0.55em; border-radius: 0.35em; font-size: 0.75em; font-weight: 600; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
.noc-badge-danger  { background: #E24B4A; }
.noc-badge-warning { background: #EF9F27; color: #333; }
.noc-badge-success { background: #639922; }
.noc-badge-info    { background: #3aa2ff; }
</style>
