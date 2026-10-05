<template>
  <card>
    <div slot="header" class="noc-trend-header">
      <h5 class="card-title mb-0">Tendencia · red</h5>
      <!-- R5 · G8 · 8 — clase condicional para forzar estilos de select
           en light theme (option nativo hereda mal el tema del padre en
           browsers). -->
      <div class="noc-trend-controls" :class="{ 'is-light': isLight }">
        <select v-model="selectedVariable" class="form-control form-control-sm">
          <option value="" disabled>Elegí una variable</option>
          <!-- R5 · G8 · 5 — solo tv.label (sin aggregation cruda). -->
          <option v-for="tv in trendVariables" :key="tv.variable" :value="tv.variable">
            {{ tv.unit ? ((tv.label || tv.variable) + ' (' + tv.unit + ')') : (tv.label || tv.variable) }}
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
      <div class="noc-trend-card-stat" v-if="lastData">
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
// DEC-REF-101 D-9/D-11 (#76): window e intervalo de refresco configurables
// desde el menú de la tarjeta (props defaultWindow/refreshSec); el selector
// interno de window sigue disponible como cambio ad-hoc.
const DEFAULT_VARIABLE = 'fuel_level';
const DEFAULT_WINDOW   = '24h';

// R5 · G8 · 5 — paleta explícita de series, 6 colores altos en contraste
// contra fondo oscuro Y claro. Asignados en orden estable por siteCode
// alfabético (el backend ya ordena las series por siteCode). Si hay más
// de 6 sites, se cicla — aceptable para la fase piloto (10 sites Claro).
const SERIES_PALETTE = ['#4FC3F7', '#FFB74D', '#81C784', '#F06292', '#BA68C8', '#FFD54F'];

export default {
  name: 'NocTrendChart',
  props: {
    trendVariables: { type: Array,  default: () => [] },
    isLight:        { type: Boolean, default: false },
    // DEC-REF-101 D-9/D-11 (#76) — configurables desde el menú de la tarjeta.
    refreshSec:     { type: Number, default: 60 },
    defaultWindow:  { type: String, default: DEFAULT_WINDOW },
  },
  data() {
    return {
      selectedVariable: '',
      selectedWindow:   this.defaultWindow,
      loading:          false,
      error:            null,
      lastData:         null,
      // DEC-REF-100 D-5 (F5) · DEC-REF-101 D-11: refresh automático en
      // silencio (sin spinner ni parpadeo — lastData se pisa cuando llega
      // la nueva). El intervalo lo fija refreshSec (menú de la tarjeta).
      refreshTimer:     null,
      _inFlight:        false,
    };
  },
  mounted() {
    this.startRefreshTimer();
    // DEC-REF-105 D-3 (extensión #79-c) — el gráfico también es event-driven:
    // cuando llega un sdata de LA VARIABLE seleccionada, se re-fetchea en
    // silencio (debounce 3 s para colapsar ráfagas). Con report-by-exception
    // ese evento ES "el valor cambió de verdad" — el punto nuevo aparece en
    // el gráfico en segundos, no en el próximo tick del timer. El timer de
    // refreshSec queda como red de seguridad (ventana que avanza, TZ, etc.).
    this._sdataHandler = ({ topic } = {}) => {
      if (!topic || !this.selectedVariable) return;
      const parts = topic.split('/');
      if (parts.length < 4 || parts[2] !== this.selectedVariable) return;
      if (this._sdataTimer) clearTimeout(this._sdataTimer);
      this._sdataTimer = setTimeout(() => {
        this._sdataTimer = null;
        this.fetchTrend({ silent: true });
      }, 3000);
    };
    this.$nuxt.$on('wanomi:sdata', this._sdataHandler);
  },
  beforeDestroy() {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    if (this._sdataTimer)  { clearTimeout(this._sdataTimer); this._sdataTimer = null; }
    if (this._sdataHandler){ this.$nuxt.$off('wanomi:sdata', this._sdataHandler); this._sdataHandler = null; }
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
      // R5 · G8 · 5 — color de serie asignado por índice de siteCode ordenado.
      const series = (this.lastData.series || []).map((s, i) => ({
        name: s.name,
        color: SERIES_PALETTE[i % SERIES_PALETTE.length],
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
    // D-9/D-11 (#76) — el menú de la tarjeta cambia el default persistido:
    // se aplica al selector y el watch de selectedWindow dispara el fetch.
    defaultWindow(w) {
      if (w && w !== this.selectedWindow) this.selectedWindow = w;
    },
    refreshSec() { this.startRefreshTimer(); },
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
    // DEC-REF-101 D-11 (#76) — timer propio del widget, intervalo del menú.
    startRefreshTimer() {
      if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
      const sec = Number(this.refreshSec);
      if (!Number.isFinite(sec) || sec <= 0) return;
      this.refreshTimer = setInterval(() => this.fetchTrend({ silent: true }), sec * 1000);
    },
    fmt(v) {
      if (v == null || !Number.isFinite(v)) return '—';
      return v.toString();
    },
    fmtDelta(v) {
      if (v == null || !Number.isFinite(v)) return '—';
      return (v > 0 ? '+' : '') + v.toString();
    },
    async fetchTrend({ silent = false } = {}) {
      if (!this.selectedVariable) return;
      if (this._inFlight) return; // refresh solapado — se espera al próximo tick
      this._inFlight = true;
      if (!silent) {
        this.loading = true;
        this.error = null;
      }
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const q = 'variable=' + encodeURIComponent(this.selectedVariable) +
                  '&window='  + encodeURIComponent(this.selectedWindow);
        const res = await this.$axios.get('/dashboard/noc/trend?' + q, headers);
        if (res.data.status !== 'success') {
          throw new Error(res.data.error || 'Error al cargar tendencia');
        }
        this.lastData = res.data.data;
        this.error = null;
      } catch (err) {
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }
        // En refresh silencioso no se pisa la data buena con un error transitorio.
        if (!silent) {
          this.error = (err.response && err.response.data && err.response.data.error) || err.message || 'Error inesperado al cargar la tendencia';
        }
      } finally {
        this._inFlight = false;
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

/* R5 · G8 · 8 — fix de contraste en los selects de variable y window.
   Colores hardcoded (bg del card oscuro es $card-black-background=#27293d en
   _variables.scss:899; texto del template dark es #d4d2d2). El estilo de
   <option> tiene soporte limitado en browsers (Chrome muestra el desplegable
   con estilo del sistema en Windows/Linux); si en la verificación visual el
   desplegable sigue ilegible, reportar como pendiente — la alternativa es un
   dropdown custom, fuera de scope de R5. */
.noc-trend-controls .form-control,
.noc-trend-controls .form-control option {
  background-color: #27293d;
  color: #d4d2d2;
}
.noc-trend-controls.is-light .form-control,
.noc-trend-controls.is-light .form-control option {
  background-color: #ffffff;
  color: #525f7f;
}
</style>
