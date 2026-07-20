<template>
  <div class="content noc-dashboard">
    <div class="row">
      <div class="col-12">
        <h2 class="title mb-1">Dashboard operador NOC</h2>
        <p class="text-muted mb-4">Vista multi-sitio de tu scope.</p>
      </div>
    </div>

    <!-- R4 · G7 · 7 — layout se renderiza SIEMPRE. Cards muestran esqueleto
         placeholder mientras nocData es null. loadError arriba de todo si el
         primer fetch falla, sin ocultar el layout. -->

    <div v-if="loadError" class="row">
      <div class="col-12">
        <card>
          <div class="text-center text-danger">
            <i class="tim-icons icon-alert-circle-exc"></i>
            <span class="ml-2">{{ loadError }}</span>
          </div>
        </card>
      </div>
    </div>

    <template v-if="nocData">
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

    <template v-else>
      <!-- Skeleton KPIs -->
      <div class="row noc-kpi-strip">
        <div v-for="i in 4" :key="'k'+i" class="col-xl-3 col-md-6 col-12">
          <card class="card-stats noc-skeleton-card">
            <div class="skeleton skeleton-line skeleton-sm"></div>
            <div class="skeleton skeleton-line skeleton-lg mt-2"></div>
            <div class="skeleton skeleton-line skeleton-sm mt-2"></div>
          </card>
        </div>
      </div>
      <!-- Skeleton mapa/tabla -->
      <div class="row">
        <div class="col-xl-7 col-12">
          <card><div class="skeleton skeleton-block skeleton-map"></div></card>
        </div>
        <div class="col-xl-5 col-12">
          <card>
            <div v-for="i in 4" :key="'r'+i" class="skeleton skeleton-line skeleton-md mt-2"></div>
          </card>
        </div>
      </div>
      <!-- Skeleton trend -->
      <div class="row">
        <div class="col-12">
          <card><div class="skeleton skeleton-block skeleton-chart"></div></card>
        </div>
      </div>
      <!-- Skeleton alarmas/hist -->
      <div class="row">
        <div class="col-xl-6 col-12">
          <card>
            <div v-for="i in 5" :key="'a'+i" class="skeleton skeleton-line skeleton-md mt-2"></div>
          </card>
        </div>
        <div class="col-xl-6 col-12">
          <card><div class="skeleton skeleton-block skeleton-chart"></div></card>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
// Dashboard operador NOC multi-site (DEC-REF-69 · DEC-DASH-1a).
// Composición de 4 componentes del contrato /dashboard/noc.
//
// R4 · G7 · 7 — layout se pinta de inmediato con placeholders; el estado
// "página en blanco 20s" del R3 se cambió por skeletons por card. loadError
// aparece como banner encima sin ocultar el resto.
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
      loadError: null,
      nocData: null,
      pollTimer: null,
      isLight: false,
      themeObserver: null,
      // R7 · pedido Franco — refresh event-driven al recibir wanomi:notif.
      // Handler bindeado al bus $nuxt (mismo patrón que pages/sites/_siteCode.vue).
      _notifHandler: null,
      // Debounce del refresh: cuando un episodio dispara N notifs seguidas
      // (fire + escalada + resolve), no queremos correr /noc N veces. 1s
      // absorbe la ráfaga; después de eso el próximo notif dispara otro
      // refresh. TTL corto porque el operador quiere ver el cambio ya.
      _notifDebounceTimer: null,
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

    // R7 · real-time-lite: bus MQTT del layout emite wanomi:notif con cada
    // notificación (DEC-REF-55). Refrescamos el Panel en fresco (bypass
    // cache) para que el cambio de estado sea visible en <2s. No filtramos
    // por siteId porque el Panel es multi-site del scope.
    this._notifHandler = () => {
      if (this._notifDebounceTimer) clearTimeout(this._notifDebounceTimer);
      this._notifDebounceTimer = setTimeout(() => {
        this._notifDebounceTimer = null;
        this.loadNoc({ silent: true, fresh: true });
      }, 1000);
    };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  beforeDestroy() {
    if (this.pollTimer)          { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.themeObserver)      { this.themeObserver.disconnect(); this.themeObserver = null; }
    if (this._notifDebounceTimer){ clearTimeout(this._notifDebounceTimer); this._notifDebounceTimer = null; }
    if (this._notifHandler)      { this.$nuxt.$off('wanomi:notif', this._notifHandler); this._notifHandler = null; }
  },
  methods: {
    async loadNoc({ silent = false, fresh = false } = {}) {
      const headers = { headers: { token: this.$store.state.auth.token } };
      const url = '/dashboard/noc' + (fresh ? '?fresh=1' : '');
      try {
        const res = await this.$axios.get(url, headers);
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
      }
    },
  },
};
</script>

<style scoped>
.noc-dashboard  { min-height: 100vh; }
.spin           { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* R4 · G7 · 7 — skeleton placeholders, sin dependencias.
   Rectángulos + shimmer, tanto para tema oscuro como claro. */
.noc-skeleton-card { min-height: 145px; }
.skeleton          { background: rgba(255, 255, 255, 0.08); border-radius: 4px; position: relative; overflow: hidden; }
.skeleton::after   { content: ''; position: absolute; inset: 0;
                     background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
                     animation: skeleton-shine 1.4s infinite; }
.skeleton-line     { display: block; height: 12px; }
.skeleton-sm       { width: 40%; }
.skeleton-md       { width: 80%; }
.skeleton-lg       { width: 60%; height: 24px; }
.skeleton-block    { width: 100%; }
.skeleton-map      { height: 400px; }
.skeleton-chart    { height: 340px; }
@keyframes skeleton-shine { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
</style>
