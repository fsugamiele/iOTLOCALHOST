<template>
  <card>
    <div slot="header" class="noc-trend-header">
      <h5 class="card-title mb-0">Tendencia · red</h5>
      <!-- R5 · G8 · 8 — clase condicional para forzar estilos de select
           en light theme (option nativo hereda mal el tema del padre en
           browsers). -->
      <div class="noc-trend-controls" :class="{ 'is-light': isLight }">
        <!-- Franco 2026-11-17 — varias variables a la vez (hasta MAX_VARIABLES), cada unidad con su eje. -->
        <el-select v-model="selectedVariables" multiple :multiple-limit="maxVars" collapse-tags
                   placeholder="Elegí una o más variables" size="small" class="select-primary noc-trend-vars"
                   aria-label="Variables del gráfico">
          <el-option v-for="tv in trendVariables" :key="tv.variable" :label="varTxt(tv)" :value="tv.variable" />
        </el-select>
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
    <div v-else-if="!selectedVariables.length" class="noc-state">
      Elegí una o más variables para ver la tendencia.
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
        <div v-for="st in stats" :key="st.variable">
          <span v-if="stats.length > 1" class="noc-trend-stat-var">{{ st.label }}:</span>
          <template v-if="st.aggregation === 'avg'">
            Actual: <strong>{{ fmt(st.cardStat.current) }}</strong>
            · Δ ventana: <strong :class="deltaClass(st.cardStat.delta)">{{ fmtDelta(st.cardStat.delta) }}</strong>
          </template>
          <template v-else-if="st.aggregation === 'range'">
            Min: <strong>{{ fmt(st.cardStat.min) }}</strong>
            · Max: <strong>{{ fmt(st.cardStat.max) }}</strong>
          </template>
        </div>
      </div>
    </div>
  </card>
</template>

<script>
import { Select, Option } from 'element-ui';
import { buildMultiChart, varTxt, MAX_VARIABLES } from '@/utils/multiSeriesChart';
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

export default {
  name: 'NocTrendChart',
  components: { [Select.name]: Select, [Option.name]: Option },
  props: {
    trendVariables: { type: Array,  default: () => [] },
    isLight:        { type: Boolean, default: false },
    // DEC-REF-101 D-9/D-11 (#76) — configurables desde el menú de la tarjeta.
    refreshSec:     { type: Number, default: 60 },
    defaultWindow:  { type: String, default: DEFAULT_WINDOW },
  },
  data() {
    return {
      selectedVariables: [],
      maxVars:          MAX_VARIABLES,
      selectedWindow:   this.defaultWindow,
      loading:          false,
      error:            null,
      // variable → respuesta de /dashboard/noc/trend (una por variable elegida)
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
      if (!topic || !this.selectedVariables.length) return;
      const parts = topic.split('/');
      if (parts.length < 4 || !this.selectedVariables.includes(parts[2])) return;
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
    // Las variables elegidas, en el orden en que se eligieron, con su nombre y unidad.
    elegidas() {
      return this.selectedVariables.map(v => this.trendVariables.find(tv => tv.variable === v) || { variable: v, label: v, unit: '' });
    },
    resultados() {
      if (!this.lastData) return [];
      return this.elegidas.map(v => ({ v, d: this.lastData[v.variable] })).filter(x => x.d);
    },
    hasNoData() {
      if (!this.lastData) return false;
      return this.resultados.every(({ d }) => !Array.isArray(d.series) || d.series.every(x => !x.points || !x.points.length));
    },
    stats() {
      return this.resultados.filter(({ d }) => d.cardStat).map(({ v, d }) => ({ variable: v.variable, label: v.label || v.variable, aggregation: d.aggregation, cardStat: d.cardStat }));
    },
    chartOptions() {
      if (!this.lastData) return {};
      const varios = this.elegidas.length > 1;
      // Una serie por sitio y variable. Con una sola variable, el nombre es el sitio (como antes).
      const series = [];
      this.resultados.forEach(({ v, d }) => (d.series || []).forEach(s => series.push({
        name: varios ? `${s.name} · ${v.label || v.variable}` : s.name,
        variable: v.variable, unit: v.unit || '', data: s.points || [],
      })));
      return buildMultiChart(series, this.elegidas, { isLight: this.isLight, colorBy: 'series' });
    },
  },
  watch: {
    selectedVariables() { this.fetchTrend(); },
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
        if (!Array.isArray(next) || !next.length) return;
        // Variables que dejaron de estar en el alcance del usuario salen de la selección.
        const validas = this.selectedVariables.filter(v => next.some(tv => tv.variable === v));
        if (validas.length !== this.selectedVariables.length) this.selectedVariables = validas;
        if (this.selectedVariables.length) return;
        const hasDefault = next.some(tv => tv.variable === DEFAULT_VARIABLE);
        this.selectedVariables = [hasDefault ? DEFAULT_VARIABLE : next[0].variable];
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
    varTxt,
    deltaClass(d) {
      if (d == null) return '';
      return d < 0 ? 'text-danger' : (d > 0 ? 'text-success' : '');
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
      if (!this.selectedVariables.length) { this.lastData = null; return; }
      if (this._inFlight) { if (!silent) this._pendiente = true; return; } // cambio del usuario durante una carga: se repite al terminar
      this._inFlight = true;
      if (!silent) {
        this.loading = true;
        this.error = null;
      }
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        // Un pedido por variable, en paralelo (cada uno usa el caché de 60 s del servidor).
        const vars = this.selectedVariables.slice();
        const resps = await Promise.all(vars.map(v => this.$axios.get('/dashboard/noc/trend?variable=' + encodeURIComponent(v) +
          '&window=' + encodeURIComponent(this.selectedWindow), headers)));
        const out = {};
        resps.forEach((res, i) => {
          if (res.data.status !== 'success') throw new Error(res.data.error || 'Error al cargar tendencia');
          out[vars[i]] = res.data.data;
        });
        // Si el usuario cambió la selección mientras se cargaba, se descarta (llega el pedido nuevo).
        if (vars.join('|') !== this.selectedVariables.join('|')) return;
        this.lastData = out;
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
        if (this._pendiente) { this._pendiente = false; this.fetchTrend(); }
      }
    },
  },
};
</script>

<style scoped>
.noc-trend-header    { display: flex; justify-content: space-between; align-items: center; gap: 0.75em; flex-wrap: wrap; }
.noc-trend-controls  { display: flex; gap: 0.5em; align-items: center; }
.noc-trend-controls .form-control { min-width: 140px; }
.noc-trend-vars      { min-width: 240px; max-width: 360px; }
.noc-trend-stat-var  { opacity: .8; margin-right: .35em; }
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
