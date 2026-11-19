<template>
  <div class="content" style="padding: 1rem;">
    <h3>Históricos</h3>
    <p class="text-muted">Elegí sitio, dispositivo, una o más variables (hasta {{ maxVars }}) y el rango.</p>

    <div class="row" style="margin-bottom: 1rem;">
      <div class="col-md-3">
        <label>Sitio</label>
        <el-select v-model="selectedSiteCode" placeholder="Elegir sitio"
                   class="select-primary" style="width:100%"
                   :loading="loadingSites">
          <el-option v-for="s in sites"
                     :key="s.siteCode"
                     :label="s.nombre || s.siteCode"
                     :value="s.siteCode" />
        </el-select>
      </div>

      <div class="col-md-3">
        <label>Dispositivo</label>
        <el-select v-model="selectedDId" placeholder="Elegir dispositivo"
                   class="select-primary" style="width:100%"
                   :disabled="!selectedSiteCode">
          <el-option v-for="d in devicesForSite"
                     :key="d.dId"
                     :label="d.name"
                     :value="d.dId" />
        </el-select>
      </div>

      <div class="col-md-3">
        <label>Variables</label>
        <!-- Franco 2026-11-17 — varias variables juntas; cada unidad va con su propio eje. -->
        <el-select v-model="selectedVariables" multiple :multiple-limit="maxVars" collapse-tags
                   placeholder="Elegir una o más variables"
                   class="select-primary" style="width:100%"
                   :disabled="!selectedDId">
          <el-option v-for="w in variablesForDevice"
                     :key="w.variable"
                     :label="w.unit ? (w.variableFullName + ' (' + w.unit + ')') : w.variableFullName"
                     :value="w.variable" />
        </el-select>
      </div>

      <div class="col-md-3">
        <label>Rango</label>
        <el-select v-model="chartTimeAgo" class="select-primary" style="width:100%">
          <el-option v-for="r in rangePresets"
                     :key="r.minutes"
                     :label="r.label"
                     :value="r.minutes" />
        </el-select>
      </div>
    </div>

    <card>
      <HistoryChart
        :series="chartSeries"
        :vars="selectedVariableObjs"
        :loading="loadingHistory"
        :error="error"
      />
    </card>
  </div>
</template>

<script>
// 31.4c — Vista de históricos con selectores encadenados.
// Une historyClient (31.4a) + HistoryChart (31.4b). NO reimplementa permisos:
// /site y /device ya vienen filtrados por grants (DEC-REF-33/34).

import HistoryChart from '@/components/HistoryChart.vue';
import { fetchHistory } from '@/services/historyClient.js';
import { Select, Option } from 'element-ui';
import { MAX_VARIABLES } from '@/utils/multiSeriesChart';
const HIST_MAX_POINTS = 1500;   // puntos por variable: alcanza para el ancho de cualquier pantalla

export default {
  name: 'History',
  middleware: 'authenticated',
  components: {
    HistoryChart,
    [Option.name]: Option,
    [Select.name]: Select,
  },
  data() {
    return {
      sites: [],
      selectedSiteCode: null,
      selectedDId:      null,
      selectedVariables: [],         // slugs, en el orden elegido
      maxVars:          MAX_VARIABLES,
      chartTimeAgo:     60,          // default: última hora
      samplesBy:        {},          // variable → muestras
      loadingSites:     false,
      loadingHistory:   false,
      error:            null,
      rangePresets: [
        { label: 'Última hora', minutes: 60 },
        { label: '24 horas',    minutes: 1440 },
        { label: '7 días',      minutes: 10080 },
        { label: '30 días',     minutes: 43200 },   // decisión producto #32
      ],
    };
  },
  computed: {
    selectedSite() {
      return this.sites.find(s => s.siteCode === this.selectedSiteCode) || null;
    },
    devicesForSite() {
      // device.siteId guarda el siteCode (string) — recon 28.x.3 / 31.x.
      return (this.$store.state.devices || [])
        .filter(d => d.siteId === this.selectedSiteCode);
    },
    selectedDevice() {
      return this.devicesForSite.find(d => d.dId === this.selectedDId) || null;
    },
    variablesForDevice() {
      const widgets = this.selectedDevice && this.selectedDevice.template
        ? this.selectedDevice.template.widgets || []
        : [];
      return widgets.filter(w => w.variableType === 'int' || w.variableType === 'float');
    },
    selectedVariableObjs() {
      return this.selectedVariables
        .map(v => this.variablesForDevice.find(w => w.variable === v))
        .filter(Boolean)
        .map(w => ({ variable: w.variable, label: w.variableFullName || w.variable, unit: w.unit || '' }));
    },
    chartSeries() {
      return this.selectedVariableObjs
        .filter(v => Array.isArray(this.samplesBy[v.variable]))
        .map(v => ({ name: v.unit ? `${v.label} (${v.unit})` : v.label, variable: v.variable, unit: v.unit,
          data: this.samplesBy[v.variable].filter(x => typeof x.value === 'number').map(x => [x.time, x.value]) }));
    },
  },
  watch: {
    selectedSiteCode() {
      this.selectedDId = null;
      this.selectedVariables = [];
      this.samplesBy = {};
      this.error = null;
    },
    selectedDId() {
      this.selectedVariables = [];
      this.samplesBy = {};
      this.error = null;
    },
    selectedVariables() {
      this.fetchHistory(false);   // solo trae las que faltan
    },
    chartTimeAgo() {
      this.fetchHistory(true);    // otro rango: se vuelven a traer todas
    },
  },
  async mounted() {
    this.loadingSites = true;
    try {
      // sites y devices son independientes → en paralelo, pero esperamos a AMBOS
      // antes de habilitar la UI, para que devicesForSite nunca compute sobre un
      // store vacío si el usuario elige site rápido (anti dropdown-vacío-fantasma).
      const [sitesRes] = await Promise.all([
        this.$axios.get('/site', { headers: { token: this.$store.state.auth.token } }),
        this.$store.dispatch('getDevices'),
      ]);
      this.sites = (sitesRes.data && sitesRes.data.data) || [];
    } catch (e) {
      this.error = e.message || 'Error cargando datos iniciales';
    } finally {
      this.loadingSites = false;
    }
  },
  methods: {
    // Trae las variables elegidas en paralelo. todo=false: solo las que todavía no están cargadas.
    async fetchHistory(todo) {
      if (!this.selectedDevice) return;
      const dev = this.selectedDevice.dId, rango = this.chartTimeAgo;
      // Coherencia anti-timing: las variables deben pertenecer al device actual.
      const vars = this.selectedVariables.filter(v => this.variablesForDevice.some(w => w.variable === v));
      const base = todo ? {} : { ...this.samplesBy };
      Object.keys(base).forEach(k => { if (!vars.includes(k)) delete base[k]; });
      const faltan = vars.filter(v => !base[v]);
      if (!faltan.length) { this.samplesBy = base; return; }
      const pedido = this._pedido = (this._pedido || 0) + 1;
      this.loadingHistory = true;
      this.error = null;
      try {
        const res = await Promise.all(faltan.map(variable => fetchHistory({
          axios: this.$axios, token: this.$store.state.auth.token, dId: dev, variable, chartTimeAgo: rango,
          maxPoints: HIST_MAX_POINTS,   // 7 y 30 días: el servidor agrupa (antes mandaba todo crudo y se tildaba)
        })));
        if (pedido !== this._pedido) return;   // llegó tarde: ya hay un pedido más nuevo
        faltan.forEach((v, i) => { base[v] = res[i] || []; });
        this.samplesBy = base;
      } catch (e) {
        if (pedido !== this._pedido) return;
        this.error = e.message || 'Error cargando históricos';
      } finally {
        if (pedido === this._pedido) this.loadingHistory = false;
      }
    },
  },
};
</script>
