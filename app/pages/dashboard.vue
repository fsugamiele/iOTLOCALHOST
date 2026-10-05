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
        <div class="mb-4 d-flex align-items-center">
          <!-- Panel personalizable: catálogo extensible de tarjetas generales.
               Las de sitio se agregan desde la página del sitio ("Agregar al
               Panel"). Futuras colecciones de widgets se suman a este menú. -->
          <el-dropdown trigger="click" size="mini" placement="bottom-end" @command="toggleNocWidget">
            <base-button size="sm" type="primary">
              <i class="tim-icons icon-simple-add"></i> Agregar tarjeta
            </base-button>
            <el-dropdown-menu slot="dropdown">
              <template v-for="g in catalogGroups">
                <el-dropdown-item :key="'g-' + g" disabled class="noc-catalog-group">{{ g }}</el-dropdown-item>
                <el-dropdown-item
                  v-for="w in WIDGETS.filter(x => x.group === g)"
                  :key="'add-' + w.i"
                  :command="w.i"
                >
                  <i v-if="nocWidgetActive(w.i)" class="tim-icons icon-check-2"></i>
                  {{ w.title }}
                </el-dropdown-item>
              </template>
              <el-dropdown-item divided disabled class="noc-catalog-hint">
                Las tarjetas de un sitio se agregan desde la página del sitio, con "Agregar al Panel".
              </el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
          <base-button
            v-if="customizing"
            size="sm"
            type="default"
            class="ml-2"
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
      v-if="initialLoaded && layout.length"
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
        :min-w="isPinnedId(item.i) ? 2 : 3"
        :min-h="isPinnedId(item.i) ? 3 : 4"
      >
        <!-- Tarjeta pineada desde un Sitio: mismo render que la página de
             Sitios (resolveWidget contexto live; el componente se suscribe
             solo al bus MQTT del layout). -->
        <panel-widget-shell
          v-if="isPinnedId(item.i) && pinnedOf(item.i)"
          :title="widgetTitle(item.i)"
          :customizing="customizing"
          :show-refresh="false"
          :site-code="pinnedOf(item.i).siteCode"
          removable
          @rename="renameWidget(item.i)"
          @goto-site="gotoSite(pinnedOf(item.i).siteCode)"
          @remove="removeWidget(item.i)"
        >
          <component
            :is="resolveWidget(pinnedOf(item.i).widget.widget, { context: 'live' })"
            :config="pinnedConfig(pinnedOf(item.i))"
          />
        </panel-widget-shell>

        <panel-widget-shell
          v-else-if="!isPinnedId(item.i)"
          :title="widgetTitle(item.i)"
          :customizing="customizing"
          :refresh-sec="refreshSecOf(item.i)"
          :show-window="item.i === 'trend'"
          :window="windowOf(item.i)"
          removable
          @rename="renameWidget(item.i)"
          @set-refresh="setRefresh(item.i, $event)"
          @set-window="setWindow(item.i, $event)"
          @remove="removeWidget(item.i)"
        >
          <template v-if="nocSlices[sliceOf(item.i)]">
            <noc-kpi-card
              v-if="isKpiWidget(item.i)"
              :kpi-key="kpiKeyOf(item.i)"
              :kpi="(nocSlices.kpis.kpis || {})[kpiKeyOf(item.i)] || {}"
            />
            <noc-site-map
              v-else-if="item.i === 'map'"
              :sites="nocSlices.sites.sites || []"
              :is-light="isLight"
            />
            <noc-sites-table
              v-else-if="item.i === 'sites-table'"
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
            <noc-alarms-feed
              v-else-if="item.i === 'alarms-feed'"
              :recent-alarms="nocSlices.alarms.recentAlarms || []"
            />
            <noc-alarms-hist
              v-else-if="item.i === 'alarms-hist'"
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

    <!-- Panel vacío (el usuario quitó todas las tarjetas) -->
    <div v-else-if="initialLoaded" class="row">
      <div class="col-12">
        <card>
          <p class="text-muted text-center mb-0">
            Tu panel está vacío. Usá <b>Agregar tarjeta</b> para sumar tarjetas
            generales, o pineá widgets desde la página de un sitio.
          </p>
        </card>
      </div>
    </div>

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
//   D-10 Panel personalizable: cada indicador es un widget ATÓMICO del
//        catálogo (nocWidgets.js) — se pueden quitar y re-agregar desde
//        "Agregar tarjeta"; además conviven widgets pineados desde Sitios
//        (id pin-<dId>::<i>, config en settings.pinned[], render via
//        resolveWidget contexto live). Layouts con ids legacy
//        (kpis/sites/alarms) se migran al set atómico en loadLayout.
//   D-11 refresco POR tarjeta: cada widget tiene su timer con su intervalo
//        y su propia copia de los datos (nocSlices[id]) — una tarjeta a
//        10 s no fuerza a las demás a 10 s.
//
// Theme-awareness via isLight con UN MutationObserver sobre body (G5.4/2').
import NocKpiCard      from '@/components/Noc/NocKpiCard.vue';
import NocSiteMap      from '@/components/Noc/NocSiteMap.vue';
import NocSitesTable   from '@/components/Noc/NocSitesTable.vue';
import NocTrendChart   from '@/components/Noc/NocTrendChart.vue';
import NocAlarmsFeed   from '@/components/Noc/NocAlarmsFeed.vue';
import NocAlarmsHist   from '@/components/Noc/NocAlarmsHist.vue';
import PanelWidgetShell from '@/components/Noc/PanelWidgetShell.vue';
import { resolveWidget } from '@/components/Widgets/resolver.js';
import { NOC_WIDGETS, KPI_KEY_BY_WIDGET, NOC_DEFAULT_LAYOUT, NOC_LEGACY_IDS }
  from '@/components/Noc/nocWidgets.js';
import { MessageBox, Dropdown, DropdownMenu, DropdownItem } from 'element-ui';

// Panel personalizable: cada indicador es un widget ATÓMICO del catálogo
// (antes las 4 tarjetas kpis/sites/alarms agrupaban varios adentro).
const WIDGETS = NOC_WIDGETS;
const DEFAULT_LAYOUT = NOC_DEFAULT_LAYOUT;
// Slices del payload /dashboard/noc (varios widgets pueden colgar de una).
const SLICES = ['kpis', 'sites', 'trend', 'alarms'];

const DEFAULT_REFRESH_SEC = 60;
const DEFAULT_WINDOW = '24h';
// P3 (#79) — red de seguridad del Panel (única pasada periódica; el
// refresco de datos es por evento vía wanomi:sdata / wanomi:notif).
const SAFETY_REFRESH_SEC = 60;

export default {
  name: 'DashboardNoc',
  middleware: 'authenticated',
  components: {
    NocKpiCard, NocSiteMap, NocSitesTable, NocTrendChart, NocAlarmsFeed, NocAlarmsHist, PanelWidgetShell,
    'el-dropdown': Dropdown, 'el-dropdown-menu': DropdownMenu, 'el-dropdown-item': DropdownItem,
  },
  data() {
    return {
      WIDGETS,
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
    // Grupos del catálogo "Agregar tarjeta", en el orden del catálogo.
    catalogGroups() {
      return [...new Set(WIDGETS.map(w => w.group))];
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
    // P3 (#79) — actualización EVENT-DRIVEN de todas las tarjetas a la vez.
    // Con publicación por cambio (P2), cada sdata entrante es un cambio real
    // de alguna variable monitorizada: se refrescan TODAS las slices juntas
    // (mismo dato, mismo instante — fin del efecto "cada tarjeta a su hora").
    // Debounce 2 s para colapsar ráfagas (latido de varios devices a la vez).
    this.subscribeBus();
  },
  // keep-alive (tabs de ventanas): al dormir la página se pausan los timers
  // y suscripciones (sin esto, cada página visitada seguía polleando la API
  // en segundo plano para siempre); al despertar se reanuda todo y se
  // recarga el layout — así aparecen las tarjetas pineadas desde Sitios
  // mientras el Panel estaba dormido.
  activated() {
    if (!this.initialLoaded) return; // la primera activación ya la cubre mounted()
    this.setupTimers();
    this.subscribeBus();
    this.loadLayout();
    this.refreshAllSlices();
  },
  deactivated() {
    this.clearTimers();
    this.unsubscribeBus();
  },
  beforeDestroy() {
    this.clearTimers();
    this.unsubscribeBus();
    if (this.themeObserver)  { this.themeObserver.disconnect(); this.themeObserver = null; }
    if (this._saveTimer)     { clearTimeout(this._saveTimer); this._saveTimer = null; }
  },
  methods: {
    resolveWidget,
    // ── Suscripción al bus MQTT del layout (pausada en keep-alive sleep) ──
    subscribeBus() {
      if (this._busOn) return;
      this._busOn = true;
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
      this._sdataHandler = () => {
        if (this._sdataTimer) clearTimeout(this._sdataTimer);
        this._sdataTimer = setTimeout(() => {
          this._sdataTimer = null;
          this.refreshAllSlices();
        }, 2000);
      };
      this.$nuxt.$on('wanomi:sdata', this._sdataHandler);
    },
    unsubscribeBus() {
      this._busOn = false;
      if (this._notifHandler)  { this.$nuxt.$off('wanomi:notif', this._notifHandler); this._notifHandler = null; }
      if (this._sdataHandler)  { this.$nuxt.$off('wanomi:sdata', this._sdataHandler); this._sdataHandler = null; }
      if (this._notifFastTimer){ clearTimeout(this._notifFastTimer); this._notifFastTimer = null; }
      if (this._notifSlowTimer){ clearTimeout(this._notifSlowTimer); this._notifSlowTimer = null; }
      if (this._sdataTimer)    { clearTimeout(this._sdataTimer); this._sdataTimer = null; }
    },
    // ── Widgets atómicos NOC ───────────────────────────────────────────
    // Varios widgets pueden colgar de la misma slice del payload /noc
    // (los 4 kpi-* de 'kpis'; map y sites-table de 'sites'; feed e hist de
    // 'alarms'). sliceOf resuelve cuál alimenta a cada widget.
    sliceOf(id) {
      const def = WIDGETS.find(w => w.i === id);
      return def ? def.slice : null;
    },
    isKpiWidget(id) {
      return Object.prototype.hasOwnProperty.call(KPI_KEY_BY_WIDGET, id);
    },
    kpiKeyOf(id) {
      return KPI_KEY_BY_WIDGET[id] || null;
    },
    // ── Panel personalizable: tarjetas pineadas desde Sitios ───────────
    // Su config viaja congelada en settings.pinned[] (snapshot al pinear);
    // el id de grilla es pin-<dId>::<índice>.
    isPinnedId(id) {
      return typeof id === 'string' && id.startsWith('pin-');
    },
    pinnedList() {
      return Array.isArray(this.settings.pinned) ? this.settings.pinned : [];
    },
    pinnedOf(id) {
      return this.pinnedList().find(p => p.i === id) || null;
    },
    pinnedConfig(p) {
      // Mismo contrato que liveConfig() de la página de Sitios (DEC-REF-98
      // D-3): widget completo + identidad de fuente + contexto de sitio.
      return { ...p.widget, userId: p.userId, dId: p.dId, siteCode: p.siteCode };
    },
    nocWidgetActive(id) {
      return this.layout.some(it => it.i === id);
    },
    bottomY() {
      return this.layout.reduce((acc, it) => Math.max(acc, it.y + it.h), 0);
    },
    // Catálogo "Agregar tarjeta": si está activa la quita, si no la agrega
    // con su geometría default al final de la grilla.
    toggleNocWidget(id) {
      if (this.nocWidgetActive(id)) return this.removeWidget(id);
      const def = DEFAULT_LAYOUT.find(it => it.i === id) || { w: 6, h: 6 };
      this.layout.push({ i: id, x: 0, y: this.bottomY(), w: def.w, h: def.h });
      this.syncLastLayout();
      this.saveLayout();
    },
    removeWidget(id) {
      const idx = this.layout.findIndex(it => it.i === id);
      if (idx !== -1) this.layout.splice(idx, 1);
      if (this.isPinnedId(id)) {
        // La pineada se da de baja completa (su config vive en settings.pinned);
        // las NOC conservan sus settings para re-agregar con el mismo título.
        this.$delete(this.settings, id);
        this.$set(this.settings, 'pinned', this.pinnedList().filter(p => p.i !== id));
      }
      this.syncLastLayout();
      this.saveLayout();
    },
    gotoSite(siteCode) {
      this.$router.push('/sites/' + siteCode);
    },
    // saveLayout() persiste lastLayout si existe; tras mutar this.layout por
    // código (quitar/agregar tarjeta) hay que refrescarlo o se guarda una
    // copia vieja y la tarjeta quitada "resucita" en el próximo guardado.
    syncLastLayout() {
      this.lastLayout = this.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    },

    widgetDef(id) {
      return WIDGETS.find(w => w.i === id) || { i: id, title: id };
    },
    widgetTitle(id) {
      const s = this.settings[id];
      if (s && s.title) return s.title;
      if (this.isPinnedId(id)) {
        const p = this.pinnedOf(id);
        if (p) return (p.widget.variableFullName || p.widget.variable || p.dId) + ' · ' + p.siteCode;
      }
      return this.widgetDef(id).title;
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
          SLICES.forEach(s => this.$set(this.nocSlices, s, res.data.data));
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

    // P3 (#79) — UN solo timer de red de seguridad para todo el Panel.
    // Antes (D-11) cada tarjeta polleaba /noc con su propio refreshSec:
    // tarjetas actualizándose a distinta hora con snapshots distintos —
    // el "caos" reportado. Ahora el refresco es por evento (wanomi:sdata /
    // wanomi:notif) y este timer solo cubre deriva de reloj/ventanas
    // (histograma, edades) si no llega ningún evento.
    setupTimers() {
      this.clearTimers();
      this.widgetTimers._safety = setInterval(
        () => this.refreshAllSlices(),
        SAFETY_REFRESH_SEC * 1000
      );
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
        if (data && Array.isArray(data.layout)) {
          this.settings = data.settings || {};
          // El layout guardado ES el set activo del usuario. Se filtran ids
          // desconocidos: NOC de catálogo o pineadas presentes en
          // settings.pinned (defensa ante layouts de versiones viejas).
          let known = data.layout.filter(item =>
            WIDGETS.some(w => w.i === item.i) ||
            (this.isPinnedId(item.i) && this.pinnedOf(item.i))
          );
          // Migración de layouts pre-desagregación (ids kpis/sites/alarms):
          // se reemplazan por el set atómico default, conservando pineadas.
          const migrated = data.layout.some(it => NOC_LEGACY_IDS.includes(it.i));
          if (migrated) {
            const pins = known.filter(it => this.isPinnedId(it.i));
            known = DEFAULT_LAYOUT.map(it => ({ ...it })).concat(pins);
          }
          this.layout = known;
          // Limpieza de settings huérfanos (el backend rechaza ids
          // desconocidos en el PUT): solo catálogo vigente + pin-* + pinned.
          let pruned = false;
          Object.keys(this.settings).forEach(k => {
            if (k === 'pinned') return;
            if (!WIDGETS.some(w => w.i === k) && !this.isPinnedId(k)) { this.$delete(this.settings, k); pruned = true; }
          });
          // Persistir la migración/limpieza para no repetirla en cada carga.
          if (migrated || pruned) { this.syncLastLayout(); this.saveLayout(); }
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

/* DEC-REF-112 — modo claro: skeletons de carga visibles sobre fondo claro */
.white-content .skeleton { background: rgba(0, 0, 0, 0.06); }

/* Hint del catálogo "Agregar tarjeta" (texto largo en ítem deshabilitado) */
.noc-catalog-hint  { white-space: normal !important; max-width: 260px; line-height: 1.4; font-size: 11px; }
/* Headers de grupo del catálogo */
.noc-catalog-group { text-transform: uppercase; letter-spacing: 1px; font-size: 10.5px; opacity: 0.6; }
</style>
