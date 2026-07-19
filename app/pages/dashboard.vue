<template>
  <div class="content noc-dashboard">
    <div class="row">
      <div class="col-12">
        <h2 class="title mb-1">Dashboard operador NOC</h2>
        <p class="text-muted mb-4">Vista multi-sitio de tu scope.</p>
      </div>
    </div>

    <div v-if="loading && !nocData" class="row">
      <div class="col-12 text-center">
        <i class="tim-icons icon-refresh-01 spin"></i> Cargando…
      </div>
    </div>

    <div v-else-if="loadError" class="row">
      <div class="col-12">
        <card>
          <div class="text-center text-danger">
            <i class="tim-icons icon-alert-circle-exc"></i>
            <h4>No se pudo cargar el dashboard</h4>
            <p>{{ loadError }}</p>
          </div>
        </card>
      </div>
    </div>

    <template v-else-if="nocData">
      <noc-kpi-strip
        :kpis="nocData.kpis"
        scope="red"
      />

      <noc-site-board
        :sites="nocData.sites"
        :is-light="isLight"
      />

      <div class="row">
        <div class="col-12">
          <noc-trend-chart
            :trend-variables="nocData.trendVariables"
            :is-light="isLight"
          />
        </div>
      </div>

      <noc-recent-alarms
        :recent-alarms="nocData.recentAlarms"
        :severity-histogram7d="nocData.severityHistogram7d"
        :is-light="isLight"
      />
    </template>
  </div>
</template>

<script>
// Dashboard operador NOC multi-site (DEC-REF-69 · DEC-DASH-1a).
// Composición de 4 componentes del contrato /dashboard/noc.
//
// Theme-awareness (ajuste 2'): UN MutationObserver sobre document.body en
// esta página; `isLight` baja como prop a los 4 componentes. Ni
// SidebarSharePlugin ni el store se tocan.
//
// Polling (ajuste 5'): setInterval de 60s SOLO sobre /dashboard/noc. El
// /dashboard/noc/trend se dispara desde el propio componente cuando cambia
// el selector (variable o window).
import NocKpiStrip     from '@/components/Noc/NocKpiStrip.vue';
import NocSiteBoard    from '@/components/Noc/NocSiteBoard.vue';
import NocTrendChart   from '@/components/Noc/NocTrendChart.vue';
import NocRecentAlarms from '@/components/Noc/NocRecentAlarms.vue';

const POLL_INTERVAL_MS = 60000;

export default {
  name: 'DashboardNoc',
  middleware: 'authenticated',
  components: { NocKpiStrip, NocSiteBoard, NocTrendChart, NocRecentAlarms },
  data() {
    return {
      loading: true,
      loadError: null,
      nocData: null,
      pollTimer: null,
      isLight: false,
      themeObserver: null,
    };
  },
  async mounted() {
    if (typeof document !== 'undefined') {
      this.isLight = document.body.classList.contains('white-content');
      this.themeObserver = new MutationObserver(() => {
        this.isLight = document.body.classList.contains('white-content');
      });
      this.themeObserver.observe(document.body, {
        attributes: true, attributeFilter: ['class'],
      });
    }
    await this.loadNoc();
    this.pollTimer = setInterval(() => this.loadNoc({ silent: true }), POLL_INTERVAL_MS);
  },
  beforeDestroy() {
    if (this.pollTimer)     { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.themeObserver) { this.themeObserver.disconnect(); this.themeObserver = null; }
  },
  methods: {
    async loadNoc({ silent = false } = {}) {
      if (!silent) this.loading = true;
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get('/dashboard/noc', headers);
        if (res.data.status !== 'success') {
          throw new Error(res.data.error || 'Error al cargar el dashboard');
        }
        this.nocData = res.data.data;
        this.loadError = null;
      } catch (err) {
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!silent) this.loadError = err.message || 'Error inesperado';
        console.warn('[NOC] loadNoc error:', err.message || err);
      } finally {
        if (!silent) this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.noc-dashboard  { min-height: 100vh; }
.spin           { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
