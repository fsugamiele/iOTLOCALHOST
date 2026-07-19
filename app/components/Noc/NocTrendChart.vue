<template>
  <card>
    <div slot="header" class="noc-trend-header">
      <h5 class="card-title mb-0">Tendencia · red</h5>
      <div class="noc-trend-controls">
        <select v-model="selectedVariable" class="form-control form-control-sm">
          <option value="" disabled>Elegí una variable</option>
          <option v-for="tv in trendVariables" :key="tv.variable" :value="tv.variable">
            {{ tv.variable }} ({{ tv.aggregation }})
          </option>
        </select>
        <select v-model="selectedWindow" class="form-control form-control-sm">
          <option value="24h">24 horas</option>
          <option value="7d">7 días</option>
          <option value="30d">30 días</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="noc-state">
      <i class="tim-icons icon-refresh-01 spin"></i> Cargando…
    </div>
    <div v-else-if="error" class="noc-state text-danger">
      <i class="tim-icons icon-alert-circle-exc"></i> {{ error }}
    </div>
    <div v-else-if="!selectedVariable" class="noc-state">
      Elegí una variable para ver la tendencia.
    </div>
    <div v-else-if="hasNoData" class="noc-state">
      Sin datos en el rango.
    </div>
    <div v-else>
      <div class="chart-area">
        <client-only>
          <highchart :options="chartOptions" style="height: 100%" />
        </client-only>
      </div>
      <div class="noc-trend-card-stat">
        <template v-if="lastData.aggregation === 'avg'">
          Actual: <strong>{{ fmt(lastData.cardStat.current) }}</strong>
          · Δ ventana: <strong :class="deltaClass">{{ fmtDelta(lastData.cardStat.delta) }}</strong>
        </template>
        <template v-else-if="lastData.aggregation === 'range'">
          Min: <strong>{{ fmt(lastData.cardStat.min) }}</strong>
          · Max: <strong>{{ fmt(lastData.cardStat.max) }}</strong>
        </template>
      </div>
    </div>
  </card>
</template>

<script>
// Componente del chart de tendencia. Consume /dashboard/noc/trend con el
// window elegido a nivel-componente (ajuste 5'): el selector de window vive
// SOLO acá; /dashboard/noc no lo recibe.
//
// aggregation viene del contrato — el frontend no re-agrega ni clasifica;
// solo cambia el mensaje del cardStat según lo que el backend declare.
// Theme-awareness via prop isLight (patrón G5.4/2': UN observer en el padre).
//
// Default inicial (GATE 6 · Franco): variable=fuel_level · window=24h.
// Si trendVariables no la trae (scope sin fuel), cae a la primera de la
// lista alfabética para no dejar el chart vacío en la carga inicial.
const DEFAULT_VARIABLE = 'fuel_level';
const DEFAULT_WINDOW   = '24h';

export default {
  name: 'NocTrendChart',
  props: {
    trendVariables: { type: Array,  default: () => [] },
    isLight:        { type: Boolean, default: false },
  },
  data() {
    return {
      selectedVariable: '',
      selectedWindow:   DEFAULT_WINDOW,
      loading:          false,
      error:            null,
      lastData:         null,
    };
  },
  computed: {
    hasNoData() {
      if (!this.lastData) return false;
      const s = this.lastData.series;
      return !Array.isArray(s) || s.length === 0 || s.every(x => !x.points || x.points.length === 0);
    },
    deltaClass() {
      const d = this.lastData && this.lastData.cardStat && this.lastData.cardStat.delta;
      if (d == null) return '';
      return d < 0 ? 'text-danger' : (d > 0 ? 'text-success' : '');
    },
    chartOptions() {
      if (!this.lastData) return {};
      const textColor = this.isLight ? '#525f7f' : '#d4d2d2';
      const gridColor = this.isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      // Compensación TZ del browser — mismo patrón que HistoryChart.vue:38.
      // Los buckets del contrato vienen en epoch ms UTC; Highcharts xAxis
      // 'datetime' interpreta UTC → offset para mostrar en TZ local.
      const offset = new Date().getTimezoneOffset() * 60 * 1000 * -1;
      const series = (this.lastData.series || []).map(s => ({
        name: s.name,
        data: (s.points || []).map(p => [p[0] + offset, p[1]]),
      }));
      return {
        credits: { enabled: false },
        chart: { defaultSeriesType: 'line', backgroundColor: 'rgba(0,0,0,0)' },
        title: { text: '' },
        xAxis: { type: 'datetime', labels: { style: { color: textColor } }, gridLineColor: gridColor },
        yAxis: { title: { text: '' }, labels: { style: { color: textColor } }, gridLineColor: gridColor },
        legend: { itemStyle: { color: textColor } },
        plotOptions: { series: { label: { connectorAllowed: false }, marker: { enabled: false } } },
        series,
        responsive: {
          rules: [{
            condition: { maxWidth: 500 },
            chartOptions: { legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' } },
          }],
        },
      };
    },
  },
  watch: {
    selectedVariable() { this.fetchTrend(); },
    selectedWindow()   { this.fetchTrend(); },
    trendVariables: {
      immediate: true,
      handler(next) {
        if (!Array.isArray(next) || !next.length || this.selectedVariable) return;
        const hasDefault = next.some(tv => tv.variable === DEFAULT_VARIABLE);
        this.selectedVariable = hasDefault ? DEFAULT_VARIABLE : next[0].variable;
      },
    },
  },
  methods: {
    fmt(v) {
      if (v == null || !Number.isFinite(v)) return '—';
      return v.toString();
    },
    fmtDelta(v) {
      if (v == null || !Number.isFinite(v)) return '—';
      return (v > 0 ? '+' : '') + v.toString();
    },
    async fetchTrend() {
      if (!this.selectedVariable) return;
      this.loading = true;
      this.error = null;
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const q = 'variable=' + encodeURIComponent(this.selectedVariable) +
                  '&window='  + encodeURIComponent(this.selectedWindow);
        const res = await this.$axios.get('/dashboard/noc/trend?' + q, headers);
        if (res.data.status !== 'success') {
          throw new Error(res.data.error || 'Error al cargar tendencia');
        }
        this.lastData = res.data.data;
      } catch (err) {
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }
        this.error = (err.response && err.response.data && err.response.data.error) || err.message || 'Error inesperado al cargar la tendencia';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.noc-trend-header    { display: flex; justify-content: space-between; align-items: center; gap: 0.75em; flex-wrap: wrap; }
.noc-trend-controls  { display: flex; gap: 0.5em; align-items: center; }
.noc-trend-controls .form-control { min-width: 140px; }
.chart-area          { position: relative; height: 380px; }
.noc-state           { display: flex; align-items: center; justify-content: center; height: 380px; opacity: 0.7; gap: 0.5em; }
.noc-trend-card-stat { padding: 0.6em 1em 0; font-size: 0.9em; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 0.5em; }
.spin                { animation: spin 1s linear infinite; }
@keyframes spin      { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
