<template>
  <div class="content">
    <!-- Header -->
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Detalle de sitio
          <small class="text-muted ml-2">— {{ siteCode }}</small>
        </h2>
        <p class="text-muted mb-4">
          <!-- R4 · G7 · 9 — volver contextual: al referrer (típicamente
               Panel o /sites), no siempre al mapa. -->
          <a href="#" @click.prevent="$router.back()"><i class="tim-icons icon-double-left"></i> Volver</a>
        </p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="row">
      <div class="col-12 text-center">
        <i class="tim-icons icon-refresh-01 spin"></i>
        Cargando sitio...
      </div>
    </div>

    <!-- Error / 404 / sin acceso -->
    <div v-else-if="loadError" class="row">
      <div class="col-12">
        <card>
          <div class="text-center text-danger">
            <i class="tim-icons icon-alert-circle-exc"></i>
            <h4>{{ loadError }}</h4>
            <p>
              <nuxt-link to="/sites">Volver al mapa</nuxt-link>
            </p>
          </div>
        </card>
      </div>
    </div>

    <!-- Contenido -->
    <template v-else>
      <!-- Mapa + metadata del sitio -->
      <div class="row">
        <div class="col-12">
          <card>
            <h4 class="card-title mb-1">
              {{ site.nombre }}
              <small class="text-muted ml-2">{{ site.tipo }}</small>
            </h4>
            <p class="text-muted mb-2" v-if="hasAddress">
              <span v-if="site.direccion">{{ site.direccion }}</span>
              <span v-if="site.localidad">, {{ site.localidad }}</span>
              <span v-if="site.provincia"> ({{ site.provincia }})</span>
            </p>

            <div v-if="hasCoords" ref="mapEl" class="site-detail-map"></div>
            <p v-else class="text-muted">Este sitio no tiene coordenadas cargadas.</p>

            <div class="map-legend">
              <span class="legend-item"><span class="dot dot-critical"></span> Urgencia</span>
              <span class="legend-item"><span class="dot dot-warning"></span> Atención</span>
              <span class="legend-item"><span class="dot dot-ok"></span> Normal</span>
            </div>
          </card>
        </div>
      </div>

      <!-- Panel de widgets del sitio (DEC-REF-107 Paso 4): grilla
           arrastrable/redimensionable por widget; el layout se persiste por
           usuario y por sitio (/panellayout?dashboard=site-<code>). Reusa el
           andamiaje del Panel NOC (DEC-REF-101 D-7/D-8). Cada widget es un
           ítem: el tamaño ahora es real (antes `column` no se respetaba). -->
      <template v-if="devices.length > 0">
        <div class="row">
          <div class="col-12 site-panel-toolbar">
            <base-button
              size="sm"
              :type="customizing ? 'success' : 'default'"
              @click="toggleCustomizing"
            >
              <i class="fa" :class="customizing ? 'fa-check' : 'fa-th-large'" style="margin-right:6px"></i>
              {{ customizing ? 'Listo' : 'Personalizar' }}
            </base-button>
            <base-button v-if="customizing" size="sm" type="default" @click="resetLayout">
              <i class="fa fa-undo" style="margin-right:6px"></i>Restablecer
            </base-button>
          </div>
        </div>

        <grid-layout
          v-if="gridReady"
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
            :min-w="2"
            :min-h="3"
          >
            <div v-if="itemMap[item.i]" class="site-grid-cell" :class="{ 'site-grid-cell--customizing': customizing }">
              <div class="site-grid-cell__cap">{{ itemMap[item.i].device.name }}</div>
              <div class="site-grid-cell__body">
                <component
                  :is="resolveWidget(itemMap[item.i].widget.widget, { context: 'live' })"
                  :config="liveConfig(itemMap[item.i].device, itemMap[item.i].widget)"
                />
              </div>
            </div>
          </grid-item>
        </grid-layout>
      </template>

      <div v-else class="row">
        <div class="col-12">
          <card>
            <p class="text-muted text-center mb-0">
              Este sitio no tiene dispositivos asociados.
            </p>
          </card>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { resolveWidget } from '@/components/Widgets/resolver.js';

// Colores de severidad — mismo criterio que pages/sites/index.vue (DEC-REF-27).
const STATUS_COLOR = {
  critical: '#E24B4A',
  warning:  '#EF9F27',
  ok:       '#639922',
};

export default {
  name: 'SiteDetail',
  middleware: 'authenticated',

  data() {
    return {
      loading: true,
      loadError: null,
      site: null,
      devices: [],
      status: 'ok',
      map: null,
      marker: null,
      // Feed A5 (DEC-REF-43/54): alarms + mapa variable→severidad + cursor.
      alarms: [],
      variableSeverity: {},
      alarmsCursor: null,
      // Real-time-lite A7 (DEC-REF-44/54): handler bindeado a $nuxt bus.
      _notifHandler: null,

      // DEC-REF-107 (Paso 4): panel de widgets con grilla arrastrable.
      customizing: false,
      gridReady: false,
      layout: [],
      panelSettings: {},
      lastLayout: null,
    };
  },

  computed: {
    siteCode() {
      return this.$route.params.siteCode;
    },
    hasCoords() {
      return this.site && this.site.lat != null && this.site.lng != null;
    },
    hasAddress() {
      return this.site && (this.site.direccion || this.site.localidad || this.site.provincia);
    },

    // DEC-REF-107 (Paso 4): clave de layout por sitio (y por usuario en la API).
    panelKey() {
      return 'site-' + this.siteCode;
    },
    // Un ítem de grilla por (device, widget). `i` estable: dId::índice.
    widgetItems() {
      const items = [];
      (this.devices || []).forEach((device) => {
        (device.templateWidgets || []).forEach((widget, j) => {
          items.push({
            i: device.dId + '::' + j,
            device,
            widget,
            defW: this.colToW(widget.column),
            defH: this.hFor(widget),
          });
        });
      });
      return items;
    },
    itemMap() {
      const map = {};
      this.widgetItems.forEach((it) => { map[it.i] = it; });
      return map;
    },
  },

  async mounted() {
    await this.$store.dispatch('getDevices');
    await this.loadDetail();
    await this.setupGrid();
    await this.loadAlarms();

    // Real-time-lite (DEC-REF-44/54/55): re-fetch acotado del feed al recibir
    // una notif por MQTT. Usa la ACL browser existente (DEC-REF-38); NO abre
    // tópicos nuevos. Filtro por siteId (DEC-REF-55): evita re-fetch cuando
    // la notif es de otro site del scope. Legacy path (payload.siteId=null)
    // no dispara re-fetch por diseño.
    // DEC-REF-65-A · el pin del detalle también gana refresh silencioso
    // (patrón R13 replicado desde pages/sites/index.vue): setIcon in-place
    // sin loading ni parpadeo. Cierra la brecha que R13 declaró como
    // "no aplica al detalle porque loadAlarms ya era silencioso" — cubría
    // el feed, no el pin del site.
    this._notifHandler = (payload) => {
      if (!payload || payload.siteId !== this.siteCode) return;
      this.loadAlarms().catch((e) => console.warn('[SiteDetail] loadAlarms on notif failed', e));
      this.refreshStatusSilently().catch((e) => console.warn('[SiteDetail] silent status refresh failed', e));
    };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },

  beforeDestroy() {
    if (this._notifHandler) {
      this.$nuxt.$off('wanomi:notif', this._notifHandler);
      this._notifHandler = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  },

  methods: {
    async loadDetail() {
      this.loading = true;
      this.loadError = null;

      const headers = { headers: { token: this.$store.state.auth.token } };

      try {
        // Doble fetch en paralelo: foto del site (/full) + color del pin (/sites/status).
        // /full no devuelve status; reusar /sites/status mantiene el mismo criterio
        // de color que el listado (DEC-REF-27) sin endpoint nuevo.
        const [fullRes, statusRes] = await Promise.all([
          this.$axios.get('/site/' + encodeURIComponent(this.siteCode) + '/full', headers),
          this.$axios.get('/sites/status', headers),
        ]);

        if (fullRes.data.status !== 'success') {
          throw new Error(fullRes.data.error || 'Error al cargar el sitio');
        }

        this.site = fullRes.data.data.site;
        this.devices = fullRes.data.data.devices || [];

        // Status del site puntual. Si no aparece (sin notifs recientes), default 'ok'.
        const statusList = (statusRes.data && statusRes.data.data) || [];
        const me = statusList.find((s) => s.siteCode === this.siteCode);
        this.status = (me && me.status) || 'ok';
      } catch (err) {
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (err.response && err.response.status === 404) {
          // 404 cubre dos casos: site inexistente y sin grant (DEC-REF-37 gate del Site).
          this.loadError = 'Sitio no encontrado o sin acceso.';
          return;
        }
        this.loadError = err.message || 'Error inesperado al cargar el sitio';
        console.error('[SiteDetail] loadDetail error:', err);
      } finally {
        this.loading = false;
        if (!this.loadError && this.site && this.hasCoords) {
          this.$nextTick(() => {
            this.initMap();
            if (this.map) this.map.invalidateSize();
          });
        }
      }
    },

    async loadAlarms() {
      // Feed A5 (DEC-REF-43/54). Refresh acotado invocado en mounted + en
      // cada `wanomi:notif` (DEC-REF-44). Silent on error — no rompe la
      // vista del site aunque el feed falle transitoriamente.
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get(
          '/site/' + encodeURIComponent(this.siteCode) + '/alarms?limit=50',
          headers,
        );
        if (res.data && res.data.status === 'success' && res.data.data) {
          this.alarms = res.data.data.alarms || [];
          this.variableSeverity = res.data.data.variableSeverity || {};
          this.alarmsCursor = res.data.data.cursor || null;
        }
      } catch (err) {
        console.warn('[SiteDetail] /alarms fetch error', err.message);
      }
    },

    initMap() {
      if (this.map) return;

      this.map = L.map(this.$refs.mapEl).setView([this.site.lat, this.site.lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(this.map);

      this.marker = L.marker([this.site.lat, this.site.lng], { icon: this.iconForStatus(this.status) })
        .addTo(this.map)
        .bindTooltip(`${this.site.nombre || this.site.siteCode} (${this.site.siteCode})`);
    },

    iconForStatus(status) {
      const color = STATUS_COLOR[status] || STATUS_COLOR.ok;
      return L.divIcon({
        className: 'site-pin-wrapper',
        html: `<span class="site-pin" style="background:${color}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
    },

    // DEC-REF-65-A · espejo del refreshSitesSilently de sites/index.vue.
    // Fetch silencioso de /sites/status, se queda con el status del site
    // actual, y aplica setIcon in-place SOLO si el status cambió. Sin
    // loading, sin re-crear el mapa, sin pisar loadError visible.
    async refreshStatusSilently() {
      const headers = { headers: { token: this.$store.state.auth.token } };
      let nextStatus;
      try {
        const res = await this.$axios.get('/sites/status', headers);
        if (!res.data || res.data.status !== 'success') return;
        const list = res.data.data || [];
        const me = list.find((s) => s.siteCode === this.siteCode);
        nextStatus = (me && me.status) || 'ok';
      } catch (err) {
        console.warn('[SiteDetail] silent /sites/status fetch failed:', err.message || err);
        return;
      }
      if (nextStatus === this.status) return;
      this.status = nextStatus;
      if (this.marker) this.marker.setIcon(this.iconForStatus(nextStatus));
    },

    resolveWidget,

    // ── DEC-REF-107 (Paso 4): panel de widgets con grilla ──────────────
    // col-N → ancho de grilla (3..12); default 4. El tamaño ahora es real.
    colToW(column) {
      const m = /col-(\d+)/.exec(column || '');
      const n = m ? parseInt(m[1], 10) : 4;
      return Math.max(2, Math.min(12, n));
    },
    // Alto default por tipo/representación (unidades de fila de 30px).
    hFor(widget) {
      const t = widget.widget;
      if (t === 'numeric') {
        const r = widget.render;
        if (r === 'gauge' || r === 'tank') return 8;
        if (r === 'sparkline') return 6;
        if (r === 'counter') return 5;
        return 4; // valueStatus / icon
      }
      const H = {
        powerCascade: 6, dcPlant: 7, equipmentAlarms: 8, activeRecommendation: 5,
        numberchart: 8, tankLevel: 8, projectedAutonomy: 8,
        valueStatus: 4, multiState: 4, dataFreshness: 4, booleanDwell: 4,
        indicator: 4, switch: 4, button: 4,
      };
      return H[t] || 5;
    },
    buildDefaultLayout() {
      const COLS = 12;
      let x = 0, y = 0, rowH = 0;
      const out = [];
      this.widgetItems.forEach((it) => {
        const w = Math.min(COLS, it.defW);
        const h = it.defH;
        if (x + w > COLS) { x = 0; y += rowH; rowH = 0; }
        out.push({ i: it.i, x, y, w, h });
        x += w;
        rowH = Math.max(rowH, h);
      });
      return out;
    },
    async setupGrid() {
      if (this.loadError || !this.devices.length) { this.gridReady = false; return; }
      const def = this.buildDefaultLayout();
      const headers = { headers: { token: this.$store.state.auth.token } };
      let saved = null;
      try {
        const res = await this.$axios.get('/panellayout?dashboard=' + encodeURIComponent(this.panelKey), headers);
        const d = res.data && res.data.data;
        if (d && Array.isArray(d.layout)) saved = d.layout;
        this.panelSettings = (d && d.settings) || {};
      } catch (err) {
        console.warn('[SiteDetail] loadLayout error:', err.message || err);
      }
      if (saved && saved.length) {
        // Merge: posición guardada para los ítems que aún existen; default para
        // ítems nuevos (devices/widgets agregados desde el último guardado).
        const byId = {};
        saved.forEach((s) => { byId[s.i] = s; });
        this.layout = def.map((it) => {
          const s = byId[it.i];
          return s ? { i: it.i, x: s.x, y: s.y, w: s.w, h: s.h } : it;
        });
      } else {
        this.layout = def;
      }
      this.gridReady = true;
    },
    saveLayout() {
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(async () => {
        this._saveTimer = null;
        const headers = { headers: { token: this.$store.state.auth.token } };
        try {
          await this.$axios.put('/panellayout', {
            dashboard: this.panelKey,
            layout: this.lastLayout || this.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
            settings: this.panelSettings,
          }, headers);
        } catch (err) {
          console.warn('[SiteDetail] saveLayout error:', err.message || err);
        }
      }, 800);
    },
    async resetLayout() {
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        await this.$axios.delete('/panellayout?dashboard=' + encodeURIComponent(this.panelKey), headers);
      } catch (err) {
        console.warn('[SiteDetail] resetLayout error:', err.message || err);
      }
      this.layout = this.buildDefaultLayout();
      this.panelSettings = {};
      this.lastLayout = null;
    },
    toggleCustomizing() {
      this.customizing = !this.customizing;
    },
    onLayoutUpdated(newLayout) {
      // NO reasignar this.layout acá (loop infinito: la lib muta in place y su
      // watcher re-emite layout-updated — lección DEC-REF-101/#76). Solo copiar
      // para persistir.
      this.lastLayout = newLayout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
      this.saveLayout();
      // ECharts/Leaflet no escuchan resize del contenedor: disparo window resize
      // para que re-fluyan tras arrastrar/redimensionar.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
    },

    liveConfig(device, widget) {
      // DEC-REF-98 D-3 (#73): viaja el widget COMPLETO (thresholds,
      // tankCapacity, tankUnit, enumValues, cadenceExpected,
      // dwellWindowHours, decimalPlaces...) + identidad de la fuente
      // (userId del owner, dId) + contexto de sitio (equipmentAlarms
      // filtra el feed de alarmas por siteCode/dId).
      return {
        ...widget,
        userId: this.ownerOf(device.dId),
        dId: device.dId,
        siteCode: this.siteCode,
      };
    },

    ownerOf(dId) {
      const list = this.$store.state.devices || [];
      const d = list.find((x) => x.dId === dId);
      return d ? d.userId : null;
    },
  },
};
</script>

<style scoped>
.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
  margin-right: 0.5rem;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.site-detail-map {
  height: 360px;
  width: 100%;
  border-radius: 8px;
}

.map-legend {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.dot-critical { background: #E24B4A; }
.dot-warning  { background: #EF9F27; }
.dot-ok       { background: #639922; }

/* DEC-REF-107 (Paso 4): panel de widgets del sitio. */
.site-panel-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 10px;
}
.site-grid-cell {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.site-grid-cell__cap {
  font-size: 0.72rem;
  color: #9aa5b1;
  margin-bottom: 2px;
  padding-left: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.site-grid-cell__body { flex: 1 1 auto; overflow: auto; }
.site-grid-cell--customizing {
  outline: 1px dashed rgba(255, 255, 255, 0.25);
  border-radius: 8px;
}

/* DEC-REF-112 — modo claro */
.white-content .site-grid-cell__cap { color: #525f7f; }
.white-content .site-grid-cell--customizing { outline-color: rgba(0, 0, 0, 0.2); }
</style>

<!-- DEC-REF-70 (f) · #50 — .site-pin vive en assets/sass/dashboard/custom/_leaflet-pins.scss (global). -->

