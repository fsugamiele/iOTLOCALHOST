<template>
  <div class="content" style="padding: 1rem;">
    <h3>Históricos</h3>
    <p class="text-muted">Selector encadenado: sitio → dispositivo → variable → rango.</p>

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
        <label>Variable</label>
        <el-select v-model="selectedVariable" placeholder="Elegir variable"
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
        :samples="samples"
        :variableFullName="selectedVariableObj ? selectedVariableObj.variableFullName : ''"
        :unit="selectedVariableObj ? (selectedVariableObj.unit || '') : ''"
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
      selectedVariable: null,        // slug
      chartTimeAgo:     60,          // default: última hora
      samples:          [],
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
    selectedVariableObj() {
      return this.variablesForDevice.find(w => w.variable === this.selectedVariable) || null;
    },
  },
  watch: {
    selectedSiteCode() {
      this.selectedDId = null;
      this.selectedVariable = null;
      this.samples = [];
      this.error = null;
    },
    selectedDId() {
      this.selectedVariable = null;
      this.samples = [];
      this.error = null;
    },
    selectedVariable() {
      if (this.selectedVariable) this.fetchHistory();
    },
    chartTimeAgo() {
      if (this.selectedVariable) this.fetchHistory();
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
    async fetchHistory() {
      if (!this.selectedDevice || !this.selectedVariable) return;
      // Coherencia anti-timing: la variable debe pertenecer al device actual.
      const coherente = this.variablesForDevice.some(
        w => w.variable === this.selectedVariable
      );
      if (!coherente) return;

      this.loadingHistory = true;
      this.error = null;
      try {
        this.samples = await fetchHistory({
          axios:        this.$axios,
          token:        this.$store.state.auth.token,
          dId:          this.selectedDevice.dId,
          variable:     this.selectedVariable,
          chartTimeAgo: this.chartTimeAgo,
        });
      } catch (e) {
        this.error = e.message || 'Error cargando históricos';
        this.samples = [];
      } finally {
        this.loadingHistory = false;
      }
    },
  },
};
</script>
