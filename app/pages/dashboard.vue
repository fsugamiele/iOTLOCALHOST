<template>
  <div class="content noc-dashboard">
    <div class="row">
      <div class="col-12 d-flex align-items-center justify-content-between">
        <div>
          <h2 class="title mb-1">{{ pageTitle }}</h2>
          <p class="text-muted mb-4">Vista multi-sitio de tu scope.</p>
        </div>
        <!-- DEC-REF-101 D-7/D-10 (#76): modo personalizar = drag + resize de
             tarjetas; los cambios se guardan solos en el layout del usuario. -->
        <div class="mb-4">
          <base-button
            v-if="customizing"
            size="sm"
            type="default"
            @click="resetLayout"
          >
            <i class="tim-icons icon-refresh-01"></i> Restablecer
          </base-button>
          <base-button
            size="sm"
            :type="customizing ? 'primary' : 'default'"
            class="ml-2"
            @click="toggleCustomizing"
          >
            <i class="tim-icons icon-settings"></i>
            {{ customizing ? 'Listo' : 'Personalizar panel' }}
          </base-button>
        </div>
      </div>
    </div>

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

    <!-- DEC-REF-101 D-7/D-8 (#76) — grilla vue-grid-layout. Cada tarjeta es
         movible/redimensionable en modo personalizar; layout + settings se
         persisten en Mongo por usuario (GET/PUT /panellayout). Mientras una
         tarjeta no tiene datos todavía muestra skeleton dentro del shell. -->
    <grid-layout
      v-if="initialLoaded"
      :layout.sync="layout"
      :col-num="12"
      :row-height="30"
      :margin="[12, 12]"
      :is-draggable="customizing"
      :is-resizable="customizing"
      :vertical-compact="true"
      :use-css-transforms="true"
      @layout-updated="onLayoutUpdated"
    >
      <grid-item
        v-for="item in layout"
        :key="item.i"
        :i="item.i"
        :x="item.x"
        :y="item.y"
        :w="item.w"
        :h="item.h"
        :min-w="3"
        :min-h="4"
      >
        <panel-widget-shell
          :title="widgetTitle(item.i)"
          :customizing="customizing"
          :refresh-sec="refreshSecOf(item.i)"
          :show-window="item.i === 'trend'"
          :window="windowOf(item.i)"
          @rename="renameWidget(item.i)"
          @set-refresh="setRefresh(item.i, $event)"
          @set-window="setWindow(item.i, $event)"
        >
          <template v-if="nocSlices[item.i]">
            <noc-kpi-strip
              v-if="item.i === 'kpis'"
              :kpis="nocSlices.kpis.kpis"
              scope="red"
            />
            <noc-site-board
              v-else-if="item.i === 'sites'"
              :sites="nocSlices.sites.sites || []"
              :is-light="isLight"
            />
            <noc-trend-chart
              v-else-if="item.i === 'trend'"
              :trend-variables="nocSlices.trend.trendVariables || []"
              :is-light="isLight"
              :refresh-sec="refreshSecOf('trend')"
              :default-window="windowOf('trend')"
            />
            <noc-recent-alarms
              v-else-if="item.i === 'alarms'"
              :recent-alarms="nocSlices.alarms.recentAlarms || []"
              :severity-histogram7d="nocSlices.alarms.severityHistogram7d || { buckets: [] }"
              :is-light="isLight"
            />
          </template>
          <div v-else class="p-2">
            <div class="skeleton skeleton-line skeleton-md"></div>
            <div class="skeleton skeleton-block skeleton-chart mt-2"></div>
          </div>
        </panel-widget-shell>
      </grid-item>
    </grid-layout>

    <template v-else>
      <!-- Skeleton inicial (pre primera respuesta viva) -->
      <div class="row noc-kpi-strip">
        <div v-for="i in 4" :key="'k'+i" class="col-xl-3 col-md-6 col-12">
          <card class="card-stats noc-skeleton-card">
            <div class="skeleton skeleton-line skeleton-sm"></div>
            <div class="skeleton skeleton-line skeleton-lg mt-2"></div>
            <div class="skeleton skeleton-line skeleton-sm mt-2"></div>
          </card>
        </div>
      </div>
      <div class="row">
        <div class="col-12">
          <card><div class="skeleton skeleton-block skeleton-map"></div></card>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
// Dashboard operador NOC multi-site (DEC-REF-69 · DEC-DASH-1a · DEC-REF-101).
//
// DEC-REF-101 (#76) — el Panel es diseñable por el usuario:
//   D-7  grilla vue-grid-layout (drag + resize en modo "Personalizar").
//   D-8  layout + settings persistidos en Mongo por usuario
//        (GET/PUT/DELETE /panellayout?dashboard=noc); sin doc guardado se
//        aplica DEFAULT_LAYOUT.
//   D-9  menú por tarjeta (PanelWidgetShell, esquina superior derecha):
//        renombrar, intervalo de refresco, ventana del gráfico (trend).
//   D-10 alcance v1: los 4 componentes existentes, ninguno agregable aún.
//   D-11 refresco POR tarjeta: cada widget tiene su timer con su intervalo
//        y su propia copia de los datos (nocSlices[id]) — una tarjeta a
//        10 s no fuerza a las demás a 10 s.
//
// Theme-awareness via isLight con UN MutationObserver sobre body (G5.4/2').
import NocKpiStrip     from '@/components/Noc/NocKpiStrip.vue';
import NocSiteBoard    from '@/components/Noc/NocSiteBoard.vue';
import NocTrendChart   from '@/components/Noc/NocTrendChart.vue';
import NocRecentAlarms from '@/components/Noc/NocRecentAlarms.vue';
import PanelWidgetShell from '@/components/Noc/PanelWidgetShell.vue';
import { MessageBox } from 'element-ui';

const WIDGETS = [
  { i: 'kpis',   title: 'Indicadores' },
  { i: 'sites',  title: 'Sitios' },
  { i: 'trend',  title: 'Tendencia de variables' },
  { i: 'alarms', title: 'Alarmas' },
];

const DEFAULT_LAYOUT = [
  { i: 'kpis',   x: 0, y: 0,  w: 12, h: 5  },
  { i: 'sites',  x: 0, y: 5,  w: 7,  h: 15 },
  { i: 'trend',  x: 7, y: 5,  w: 5,  h: 9  },
  { i: 'alarms', x: 7, y: 14, w: 5,  h: 11 },
];

const DEFAULT_REFRESH_SEC = 60;
const DEFAULT_WINDOW = '24h';

export default {
  name: 'DashboardNoc',
  middleware: 'authenticated',
  components: { NocKpiStrip, NocSiteBoard, NocTrendChart, NocRecentAlarms, PanelWidgetShell },
  data() {
    return {
      loadError: null,
      isLight: false,
      themeObserver: null,
      // D-7/D-8 — layout y settings del usuario (null hasta loadLayout).
      layout: DEFAULT_LAYOUT.map(item => ({ ...item })),
      settings: {},
      customizing: false,
      // D-11 — una copia del payload /dashboard/noc por tarjeta; cada una se
      // actualiza con el timer de SU intervalo.
      nocSlices: { kpis: null, sites: null, trend: null, alarms: null },
      widgetTimers: {},
      initialLoaded: false,
      lastLayout: null,
      _saveTimer: null,
      // R7 · pedido Franco — refresh event-driven al recibir wanomi:notif.
      _notifHandler: null,
      // R8 · fix Franco (resolve no actualiza) — race MQTT/Mongo: el browser
      // recibe el notif antes que Mongo tenga el doc. Doble refresh 1s+4s.
      _notifFastTimer: null,
      _notifSlowTimer: null,
    };
  },
  computed: {
    pageTitle() {
      return 'Dashboard operador NOC';
    },
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
    await this.loadLayout();
    await this.loadInitial();
    this.setupTimers();

    // R7 · real-time-lite: bus MQTT del layout emite wanomi:notif con cada
    // notificación (DEC-REF-55). Refrescamos TODAS las tarjetas (una alarma
    // nueva toca KPIs, sitios y alarmas). Doble refresh por la race
    // MQTT/Mongo (R8). El evento no respeta los intervalos por tarjeta a
    // propósito: es la señal de "algo cambió ahora".
    this._notifHandler = () => {
      if (this._notifFastTimer) clearTimeout(this._notifFastTimer);
      if (this._notifSlowTimer) clearTimeout(this._notifSlowTimer);
      this._notifFastTimer = setTimeout(() => {
        this._notifFastTimer = null;
        this.refreshAllSlices();
      }, 1000);
      this._notifSlowTimer = setTimeout(() => {
        this._notifSlowTimer = null;
        this.refreshAllSlices();
      }, 4000);
    };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  beforeDestroy() {
    this.clearTimers();
    if (this.themeObserver)  { this.themeObserver.disconnect(); this.themeObserver = null; }
    if (this._notifFastTimer){ clearTimeout(this._notifFastTimer); this._notifFastTimer = null; }
    if (this._notifSlowTimer){ clearTimeout(this._notifSlowTimer); this._notifSlowTimer = null; }
    if (this._saveTimer)     { clearTimeout(this._saveTimer); this._saveTimer = null; }
    if (this._notifHandler)  { this.$nuxt.$off('wanomi:notif', this._notifHandler); this._notifHandler = null; }
  },
  methods: {
    widgetDef(id) {
      return WIDGETS.find(w => w.i === id) || { i: id, title: id };
    },
    widgetTitle(id) {
      const s = this.settings[id];
      return (s && s.title) ? s.title : this.widgetDef(id).title;
    },
    refreshSecOf(id) {
      const s = this.settings[id];
      return (s && s.refreshSec) ? s.refreshSec : DEFAULT_REFRESH_SEC;
    },
    windowOf(id) {
      const s = this.settings[id];
      return (s && s.window) ? s.window : DEFAULT_WINDOW;
    },

    // ── Carga inicial (DEC-REF-100 D-5 · DEC-REF-101 D-4) ──────────────
    // Fase viva primero (~120 ms: TODO el panel salvo uptime si no hay HIT
    // de su caché de 1 h) → todas las slices. Full después completa uptime.
    async loadInitial() {
      await this.fetchInto(null, '/dashboard/noc?phase=vivo', { silent: true });
      this.initialLoaded = true;
      await this.fetchInto(null, '/dashboard/noc', { silent: true });
    },

    // fetchInto: id=null llena TODAS las slices (carga inicial / notif);
    // id=<widget> llena solo la suya (timer por tarjeta, D-11).
    async fetchInto(id, url, { silent = false } = {}) {
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get(url, headers);
        if (res.data.status !== 'success') {
          throw new Error(res.data.error || 'Error al cargar el dashboard');
        }
        if (id) {
          this.$set(this.nocSlices, id, res.data.data);
        } else {
          WIDGETS.forEach(w => this.$set(this.nocSlices, w.i, res.data.data));
        }
        this.loadError = null;
      } catch (err) {
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!silent) this.loadError = err.message || 'Error inesperado';
        console.warn('[NOC] fetch error:', err.message || err);
      }
    },

    refreshAllSlices() {
      return this.fetchInto(null, '/dashboard/noc', { silent: true });
    },

    // D-11 — un timer por tarjeta con su propio intervalo.
    setupTimers() {
      this.clearTimers();
      WIDGETS.forEach(w => {
        const sec = this.refreshSecOf(w.i);
        if (!Number.isFinite(sec) || sec <= 0) return;
        this.widgetTimers[w.i] = setInterval(
          () => this.fetchInto(w.i, '/dashboard/noc', { silent: true }),
          sec * 1000
        );
      });
    },
    clearTimers() {
      Object.values(this.widgetTimers).forEach(t => clearInterval(t));
      this.widgetTimers = {};
    },

    // ── Persistencia del layout (D-8) ──────────────────────────────────
    async loadLayout() {
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get('/panellayout?dashboard=noc', headers);
        const data = res.data && res.data.data;
        if (data && Array.isArray(data.layout) && data.layout.length) {
          // Solo widgets conocidos (defensa ante layouts de versiones viejas).
          const known = data.layout.filter(item => WIDGETS.some(w => w.i === item.i));
          if (known.length === WIDGETS.length) this.layout = known;
          this.settings = data.settings || {};
        }
      } catch (err) {
        console.warn('[NOC] loadLayout error:', err.message || err);
      }
    },
    saveLayout() {
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(async () => {
        this._saveTimer = null;
        const headers = { headers: { token: this.$store.state.auth.token } };
        try {
          await this.$axios.put('/panellayout', {
            dashboard: 'noc',
            layout: this.lastLayout || this.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
            settings: this.settings,
          }, headers);
        } catch (err) {
          console.warn('[NOC] saveLayout error:', err.message || err);
        }
      }, 800);
    },
    async resetLayout() {
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        await this.$axios.delete('/panellayout?dashboard=noc', headers);
      } catch (err) {
        console.warn('[NOC] resetLayout error:', err.message || err);
      }
      this.layout = DEFAULT_LAYOUT.map(item => ({ ...item }));
      this.settings = {};
      this.setupTimers();
    },

    toggleCustomizing() {
      this.customizing = !this.customizing;
    },
    onLayoutUpdated(newLayout) {
      // NUNCA reasignar this.layout acá: la librería muta el array in place
      // y su watcher sobre `layout` vuelve a emitir layout-updated
      // (GridLayout.vue:244-246) ⇒ reasignar un array nuevo genera un LOOP
      // INFINITO que congela la pestaña (medido en #76). Solo se copia para
      // persistir.
      this.lastLayout = newLayout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
      this.saveLayout();
      // Highcharts/Leaflet no escuchan resize del contenedor: disparo el
      // evento de ventana para que re-fluyan tras arrastrar/redimensionar.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
    },

    // ── Menú por tarjeta (D-9) ─────────────────────────────────────────
    async renameWidget(id) {
      try {
        const { value } = await MessageBox.prompt('Nombre de la tarjeta', 'Renombrar', {
          inputValue: this.widgetTitle(id),
          inputPlaceholder: this.widgetDef(id).title,
          confirmButtonText: 'Guardar',
          cancelButtonText: 'Cancelar',
          inputValidator: v => (v && v.trim().length > 0 && v.trim().length <= 80) || 'Entre 1 y 80 caracteres',
        });
        const title = value.trim();
        this.$set(this.settings, id, { ...(this.settings[id] || {}), title });
        this.saveLayout();
      } catch (e) {
        /* cancelado por el usuario */
      }
    },
    setRefresh(id, sec) {
      this.$set(this.settings, id, { ...(this.settings[id] || {}), refreshSec: sec });
      this.saveLayout();
      this.setupTimers();
    },
    setWindow(id, win) {
      this.$set(this.settings, id, { ...(this.settings[id] || {}), window: win });
      this.saveLayout();
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
