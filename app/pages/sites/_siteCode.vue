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
      <!-- F1 (#80 · DEC-REF-108) — Header de salud: semáforo global +
           alimentación activa + alarma prioritaria con recomendación.
           Primer elemento del contenido (top banner de la página). -->
      <div class="row">
        <div class="col-12">
          <SiteHealthHeader :status="status" :site-code="siteCode" :devices="devices" />
        </div>
      </div>

      <!-- Mapa + metadata del sitio -->
      <div class="row">
        <!-- DEC-REF-113 F7 (#84): mapa a la izquierda, grilla de datos del
             sitio a la derecha (apilado en pantallas chicas). -->
        <div class="col-12 col-xl-7">
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

            <!-- DEC-REF-113 F7 (#84): acciones del mapa — editar ubicación
                 (pin arrastrable → PUT /site) y medir distancias (2 clics). -->
            <div class="map-actions">
              <base-button v-if="hasCoords && !editingLocation" size="sm" type="default" @click="toggleEditLocation">
                <i class="fa fa-map-marker-alt" style="margin-right:4px"></i>Editar ubicación
              </base-button>
              <template v-if="editingLocation">
                <base-button size="sm" type="success" @click="saveLocation">
                  <i class="fa fa-check" style="margin-right:4px"></i>Guardar
                </base-button>
                <base-button size="sm" type="default" @click="cancelEditLocation">Cancelar</base-button>
                <span class="map-actions__hint">Arrastrá el pin a la posición correcta</span>
              </template>
              <base-button v-if="hasCoords && !editingLocation" size="sm" :type="measuring ? 'primary' : 'default'" @click="toggleMeasure">
                <i class="fa fa-ruler" style="margin-right:4px"></i>{{ measuring ? 'Midiendo — 2 clics en el mapa' : 'Medir distancia' }}
              </base-button>
              <base-button v-if="measurePoints.length && !editingLocation" size="sm" type="default" icon @click="clearMeasure" title="Limpiar medición">
                <i class="fa fa-eraser"></i>
              </base-button>
            </div>

            <div v-if="hasCoords" ref="mapEl" class="site-detail-map"></div>
            <p v-else class="text-muted">Este sitio no tiene coordenadas cargadas.</p>

            <div class="map-legend">
              <span class="legend-item"><span class="dot dot-critical"></span> Urgencia</span>
              <span class="legend-item"><span class="dot dot-warning"></span> Atención</span>
              <span class="legend-item"><span class="dot dot-ok"></span> Normal</span>
            </div>
          </card>
        </div>

        <!-- DEC-REF-113 F7 (#84): grilla de datos relevantes del sitio —
             ficha del sitio, equipos que lo conforman, operador/responsable
             y sitios cercanos con distancia calculada (haversine). -->
        <div class="col-12 col-xl-5">
          <card>
            <h5 class="card-category">Datos del sitio</h5>
            <dl class="site-data-grid">
              <div><dt>Código</dt><dd>{{ site.siteCode }}</dd></div>
              <div><dt>Tipo</dt><dd>{{ site.tipo || '—' }}</dd></div>
              <div><dt>Localidad</dt><dd>{{ [site.localidad, site.provincia].filter(Boolean).join(', ') || '—' }}</dd></div>
              <div><dt>Coordenadas</dt><dd>{{ coordsLabel }}</dd></div>
              <div><dt>Operador</dt><dd>{{ site.operatorCode || '—' }}</dd></div>
              <div><dt>Zona</dt><dd>{{ site.zoneCode || '—' }}</dd></div>
              <div v-if="site.cellOwner"><dt>Responsable</dt><dd>{{ site.cellOwner }}</dd></div>
            </dl>

            <h5 class="card-category site-data-section">Equipos ({{ devices.length }})</h5>
            <div v-if="devices.length" class="site-data-devices">
              <div v-for="d in devices" :key="d.dId" class="site-data-device">
                <span class="site-data-device__name">{{ d.name }}</span>
                <span class="site-data-device__meta">
                  {{ d.deviceType || d.templateName || '—' }}<template v-if="d.domain"> · {{ domainLabel(d.domain) }}</template>
                </span>
              </div>
            </div>
            <p v-else class="text-muted mb-0" style="font-size:0.85em">Sin equipos asociados.</p>

            <h5 class="card-category site-data-section">Sitios cercanos</h5>
            <div v-if="nearestSites.length">
              <div v-for="s in nearestSites" :key="s.siteCode" class="site-data-near">
                <nuxt-link :to="'/sites/' + s.siteCode">{{ s.nombre || s.siteCode }}</nuxt-link>
                <span class="site-data-near__km">{{ s.km }} km</span>
              </div>
            </div>
            <p v-else class="text-muted mb-0" style="font-size:0.85em">Sin otros sitios con coordenadas cargadas.</p>
          </card>
        </div>
      </div>

      <!-- Panel de widgets del sitio (DEC-REF-107 Paso 4): grilla
           arrastrable/redimensionable por widget; el layout se persiste por
           usuario y por sitio (/panellayout?dashboard=site-<code>). Reusa el
           andamiaje del Panel NOC (DEC-REF-101 D-7/D-8). Cada widget es un
           ítem: el tamaño ahora es real (antes `column` no se respetaba).
           DEC-REF-108 F2 (#80): los widgets se agrupan en TABS por dominio
           funcional (ficha.domain del equipo); cada tab tiene su propia
           grilla y su propio layout persistido (site-<code>-<dominio>). -->
      <template v-if="devices.length > 0">
        <div class="row" v-if="domains.length > 1">
          <div class="col-12">
            <el-tabs v-model="activeTab" @tab-click="onTabChange">
              <el-tab-pane
                v-for="d in domains"
                :key="d.key"
                :label="d.label"
                :name="d.key"
              />
            </el-tabs>
          </div>
        </div>
        <div class="row">
          <div class="col-12 site-panel-toolbar">
            <!-- DEC-REF-108 F3 (#80): vista Operador (solo widgets operativos)
                 vs Técnico (incluye los marcados "advanced" en la plantilla).
                 La preferencia se persiste POR USUARIO (site-prefs-viewmode). -->
            <div class="viewmode-toggle">
              <base-button
                size="sm"
                :type="viewMode === 'operador' ? 'primary' : 'default'"
                @click="setViewMode('operador')"
              >
                <i class="fa fa-eye" style="margin-right:6px"></i>Operador
              </base-button>
              <base-button
                size="sm"
                :type="viewMode === 'tecnico' ? 'primary' : 'default'"
                @click="setViewMode('tecnico')"
              >
                <i class="fa fa-user-cog" style="margin-right:6px"></i>Técnico
              </base-button>
            </div>
            <div>
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
              <button
                type="button"
                class="site-grid-cell__pin"
                title="Agregar al Panel"
                @click.stop="pinToPanel(itemMap[item.i])"
                @mousedown.stop
                @touchstart.stop
              >
                📌 Panel
              </button>
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
import { colToW, hFor } from '@/components/Widgets/gridSizing.js';
import { NOC_DEFAULT_LAYOUT } from '@/components/Noc/nocWidgets.js';
import SiteHealthHeader from '@/components/Site/SiteHealthHeader.vue';
// DEC-REF-108 F2 (#80): el proyecto NO registra Element UI globalmente —
// cada página importa sus componentes (patrón admin.vue). Sin esto los tabs
// no renderizan (custom element desconocido, silencioso en build).
import { Tabs, TabPane } from 'element-ui';

// Colores de severidad — mismo criterio que pages/sites/index.vue (DEC-REF-27).
const STATUS_COLOR = {
  critical: '#E24B4A',
  warning:  '#EF9F27',
  ok:       '#639922',
};

export default {
  name: 'SiteDetail',
  middleware: 'authenticated',
  components: { SiteHealthHeader, 'el-tabs': Tabs, 'el-tab-pane': TabPane },

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
      // DEC-REF-108 F2 (#80): tab de dominio activo ('general' = sin ficha/dominio).
      activeTab: 'general',
      // DEC-REF-108 F3 (#80): vista 'operador' (sin widgets advanced) o
      // 'tecnico' (todo). Se carga/persiste por usuario (site-prefs-viewmode).
      viewMode: 'operador',
      // DEC-REF-113 F7 (#84): mapa — edición de ubicación, medición de
      // distancias y lista de sitios (para los cercanos por haversine).
      editingLocation: false,
      measuring: false,
      measurePoints: [],
      measureLayer: null,
      allSites: [],
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
    // DEC-REF-113 F7 (#84): coordenadas legibles + sitios cercanos por
    // haversine (client-side, sin librerías nuevas).
    coordsLabel() {
      if (!this.hasCoords) return '—';
      return `${Number(this.site.lat).toFixed(5)}, ${Number(this.site.lng).toFixed(5)}`;
    },
    nearestSites() {
      if (!this.hasCoords || !this.allSites.length) return [];
      const me = { lat: Number(this.site.lat), lng: Number(this.site.lng) };
      return this.allSites
        .filter((s) => s.siteCode !== this.siteCode && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
        .map((s) => ({ siteCode: s.siteCode, nombre: s.nombre, km: Math.round(this.haversineKm(me, { lat: Number(s.lat), lng: Number(s.lng) }) * 10) / 10 }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 3);
    },

    // DEC-REF-108 F2 (#80): dominios presentes en el sitio, en orden fijo de
    // operación (energía primero, grupo después...). Fuente: ficha.domain de
    // cada equipo (viaja en /full); sin ficha/dominio ⇒ 'general'.
    domains() {
      const ORDER = ['energia', 'grupo', 'seguridad', 'infraestructura', 'general'];
      const present = new Set((this.devices || []).map(d => d.domain || 'general'));
      return ORDER.filter(k => present.has(k)).map(k => ({ key: k, label: this.domainLabel(k) }));
    },

    // DEC-REF-107 (Paso 4) + DEC-REF-108 F2: clave de layout por sitio Y
    // dominio (cada tab tiene su grilla propia) — y por usuario en la API.
    panelKey() {
      return 'site-' + this.siteCode + '-' + this.activeTab;
    },
    // Un ítem de grilla por (device, widget) DEL DOMINIO ACTIVO.
    // `i` estable: dId::índice.
    // DEC-REF-108 F3 (#80): en vista Operador se filtran los widgets
    // marcados "advanced" en la plantilla (solo vista Técnico).
    widgetItems() {
      const items = [];
      (this.devices || [])
        .filter(d => (d.domain || 'general') === this.activeTab)
        .forEach((device) => {
          (device.templateWidgets || []).forEach((widget, j) => {
            if (this.viewMode !== 'tecnico' && widget.advanced) return;
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
    await this.loadViewMode();
    await this.setupGrid();
    await this.loadAlarms();
    this.loadAllSites();  // DEC-REF-113 F7 (#84) — sitios cercanos (no bloquea)

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
    if (this._mapRO) { this._mapRO.disconnect(); this._mapRO = null; }
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

        // DEC-REF-108 F2 (#80): el tab inicial es el primer dominio presente
        // (orden operativo fijo: energía → grupo → seguridad → …).
        if (this.domains.length && !this.domains.some(d => d.key === this.activeTab)) {
          this.activeTab = this.domains[0].key;
        }

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

      // DEC-REF-113 F2 (#84) — autoajuste del mapa: Leaflet no escucha el
      // resize del contenedor (grilla, sidebar, tabs) → tiles grises/cortados.
      if (typeof ResizeObserver !== 'undefined') {
        this._mapRO = new ResizeObserver(() => { if (this.map) this.map.invalidateSize(); });
        this._mapRO.observe(this.$refs.mapEl);
      }

      // DEC-REF-113 F7 (#84) — clics del modo "Medir distancia".
      this.map.on('click', this.onMapClick);
    },

    // ── DEC-REF-113 F7 (#84) — ubicación editable + medición + cercanos ──
    haversineKm(a, b) {
      const R = 6371;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    },
    async loadAllSites() {
      try {
        const res = await this.$axios.get('/site', { headers: { token: this.$store.state.auth.token } });
        if (res.data && res.data.status === 'success' && Array.isArray(res.data.data)) {
          this.allSites = res.data.data;
        }
      } catch (e) {
        // Silencioso: sin la lista, la grilla solo pierde "sitios cercanos".
      }
    },
    toggleEditLocation() {
      if (!this.map || !this.marker) return;
      this.editingLocation = true;
      this.measuring = false;
      this.clearMeasure();
      this.marker.dragging.enable();
    },
    async saveLocation() {
      if (!this.marker) return;
      const ll = this.marker.getLatLng();
      try {
        const res = await this.$axios.put(
          '/site',
          { site: { siteCode: this.siteCode, lat: ll.lat, lng: ll.lng } },
          { headers: { token: this.$store.state.auth.token } },
        );
        if (res.data && res.data.status === 'success') {
          this.site.lat = ll.lat;
          this.site.lng = ll.lng;
          this.editingLocation = false;
          this.marker.dragging.disable();
        }
      } catch (e) {
        console.warn('[SiteDetail] saveLocation failed', e.message || e);
      }
    },
    cancelEditLocation() {
      if (this.marker) {
        this.marker.setLatLng([this.site.lat, this.site.lng]);
        this.marker.dragging.disable();
      }
      this.editingLocation = false;
    },
    toggleMeasure() {
      this.measuring = !this.measuring;
      if (!this.measuring) this.clearMeasure();
    },
    onMapClick(e) {
      if (!this.measuring || this.editingLocation) return;
      // Tercer clic reinicia la medición.
      if (this.measurePoints.length >= 2) this.clearMeasure();
      this.measurePoints.push(e.latlng);
      this.drawMeasure();
    },
    drawMeasure() {
      if (!this.map) return;
      if (this.measureLayer) { this.map.removeLayer(this.measureLayer); this.measureLayer = null; }
      if (!this.measurePoints.length) return;
      const pts = this.measurePoints;
      const items = pts.map((p) => L.circleMarker(p, { radius: 5, color: '#1d8cf8', fillOpacity: 0.9 }));
      if (pts.length === 2) {
        const km = this.map.distance(pts[0], pts[1]) / 1000;
        const label = km >= 1 ? km.toFixed(2) + ' km' : Math.round(km * 1000) + ' m';
        items.push(L.polyline(pts, { color: '#1d8cf8', dashArray: '6 4' }));
        const mid = L.latLng((pts[0].lat + pts[1].lat) / 2, (pts[0].lng + pts[1].lng) / 2);
        items.push(L.marker(mid, {
          interactive: false,
          icon: L.divIcon({ className: 'measure-label', html: `<span>${label}</span>` }),
        }));
      }
      this.measureLayer = L.layerGroup(items).addTo(this.map);
    },
    clearMeasure() {
      this.measurePoints = [];
      if (this.measureLayer && this.map) { this.map.removeLayer(this.measureLayer); this.measureLayer = null; }
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

    // DEC-REF-108 F2 (#80): label legible del dominio (tabs del sitio).
    domainLabel(key) {
      const LABELS = {
        energia: 'Energía y red',
        grupo: 'Grupo y combustible',
        seguridad: 'Seguridad física',
        infraestructura: 'Infraestructura',
        general: 'General',
      };
      return LABELS[key] || key;
    },

    // Cambio de tab: sale del modo personalizar y arma la grilla del nuevo
    // dominio (su layout persistido viaja en la clave site-<code>-<dominio>).
    async onTabChange() {
      this.customizing = false;
      this.gridReady = false;
      await this.setupGrid();
    },

    // ── DEC-REF-108 F3 (#80): vista Operador/Técnico ────────────────────
    // Preferencia global POR USUARIO (no por sitio): persiste en
    // /panellayout con dashboard 'site-prefs-viewmode' (settings libres
    // para claves site-*, validación del backend). El técnico no la
    // reactiva en cada visita — decisión de Franco en el diseño.
    async loadViewMode() {
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get('/panellayout?dashboard=site-prefs-viewmode', headers);
        const mode = res.data && res.data.data && res.data.data.settings && res.data.data.settings.siteViewMode;
        if (mode === 'tecnico' || mode === 'operador') this.viewMode = mode;
      } catch (err) {
        console.warn('[SiteDetail] loadViewMode error:', err.message || err);
      }
    },
    async setViewMode(mode) {
      if (mode === this.viewMode) return;
      this.viewMode = mode;
      this.customizing = false;
      this.gridReady = false;
      await this.setupGrid();
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        await this.$axios.put('/panellayout', {
          dashboard: 'site-prefs-viewmode',
          layout: [],
          settings: { siteViewMode: mode },
        }, headers);
      } catch (err) {
        console.warn('[SiteDetail] persist viewMode error:', err.message || err);
      }
    },

    // ── DEC-REF-107 (Paso 4): panel de widgets con grilla ──────────────
    // colToW/hFor viven en components/Widgets/gridSizing.js (reuso Panel).
    colToW,
    hFor,
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

    // Panel personalizable — "Agregar al Panel" (modo Personalizar): pinea
    // este widget al dashboard 'noc' del usuario. La config viaja congelada
    // en settings.pinned[] (snapshot) y el ítem de layout usa id
    // pin-<dId>::<índice> con la geometría default del widget.
    async pinToPanel(item) {
      const headers = { headers: { token: this.$store.state.auth.token } };
      const pinId = 'pin-' + item.i; // item.i = <dId>::<índice>
      const owner = this.ownerOf(item.device.dId);
      if (!owner) {
        this.$notify({ type: 'warning', message: 'No se pudo identificar el dueño del equipo' });
        return;
      }
      try {
        const res = await this.$axios.get('/panellayout?dashboard=noc', headers);
        const data = (res.data && res.data.data) || {};
        // Si el usuario nunca guardó su Panel, NO hay doc: hay que sembrar el
        // layout por defecto del catálogo NOC (nocWidgets.js, fuente única) —
        // si no, el primer pin dejaría el Panel solo con la tarjeta pineada.
        const layout = Array.isArray(data.layout)
          ? data.layout.slice()
          : NOC_DEFAULT_LAYOUT.map(it => ({ ...it }));
        const settings = data.settings || {};
        const pinned = Array.isArray(settings.pinned) ? settings.pinned.slice() : [];
        if (pinned.some((p) => p.i === pinId)) {
          this.$notify({ type: 'info', message: 'Esa tarjeta ya está en tu Panel' });
          return;
        }
        const bottomY = layout.reduce((acc, it) => Math.max(acc, it.y + it.h), 0);
        layout.push({
          i: pinId, x: 0, y: bottomY,
          w: this.colToW(item.widget.column), h: this.hFor(item.widget),
        });
        pinned.push({
          i: pinId,
          dId: item.device.dId,
          userId: owner,
          siteCode: this.siteCode,
          widget: item.widget,
        });
        settings.pinned = pinned;
        await this.$axios.put('/panellayout', { dashboard: 'noc', layout, settings }, headers);
        this.$notify({ type: 'success', message: 'Tarjeta agregada al Panel' });
      } catch (err) {
        console.warn('[SiteDetail] pinToPanel error:', err.message || err);
        this.$notify({ type: 'danger', message: 'No se pudo agregar la tarjeta al Panel' });
      }
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

/* DEC-REF-113 F7 (#84) — acciones del mapa + grilla de datos del sitio. */
.map-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.map-actions__hint { font-size: 0.8rem; color: #9aa5b1; }
.white-content .map-actions__hint { color: #525f7f; }

.site-data-section { margin-top: 18px; }
.site-data-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 18px;
  margin: 0;
}
.site-data-grid dt {
  font-size: 0.68rem;
  color: #9aa5b1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.white-content .site-data-grid dt { color: #525f7f; }
.site-data-grid dd { margin: 0; font-weight: 600; font-size: 0.95rem; }

.site-data-devices { display: flex; flex-direction: column; gap: 6px; }
.site-data-device {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(110, 118, 140, 0.18);
}
.site-data-device:last-child { border-bottom: none; }
.site-data-device__name { font-weight: 600; font-size: 0.9rem; }
.site-data-device__meta { font-size: 0.78rem; color: #9aa5b1; text-align: right; }
.white-content .site-data-device__meta { color: #525f7f; }

.site-data-near {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 0;
  border-bottom: 1px solid rgba(110, 118, 140, 0.18);
}
.site-data-near:last-child { border-bottom: none; }
.site-data-near__km { font-weight: 700; color: #1d8cf8; font-size: 0.9rem; }

/* Etiqueta de la medición (divIcon creado por Leaflet → ::v-deep). */
.site-detail-map ::v-deep .measure-label span {
  background: rgba(29, 140, 248, 0.92);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
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
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.viewmode-toggle {
  display: flex;
  gap: 4px;
}
.site-grid-cell {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
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
/* "Agregar al Panel" — chip dentro de la tarjeta del widget, esquina
   superior derecha (la celda es position:relative; el caption ocupa ~18px,
   así que top:22px cae dentro del card, sobre su header). */
.site-grid-cell__pin {
  position: absolute;
  right: 6px;
  top: 22px;
  z-index: 10;
  background: rgba(0, 242, 195, 0.12);
  border: 1px solid rgba(0, 184, 148, 0.5);
  border-radius: 20px;
  color: #00b894;
  cursor: pointer;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1;
  padding: 3px 8px;
  white-space: nowrap;
}
.site-grid-cell__pin:hover {
  background: #00f2c3;
  color: #06382d;
}
/* DEC-REF-113 F2 (#84) — afuera las barras de scroll internas: la celda
   oculta el desborde y el contenido se autoajusta (cadena flex de abajo). */
.site-grid-cell__body { flex: 1 1 auto; overflow: hidden; }
/* Cadena flex: el card y el cuerpo del widget llenan el alto de la celda,
   así los gráficos (gauge, sparkline, autonomía) crecen con el resize
   en lugar de quedar fijos en 150 px (::v-deep porque el estilo es scoped
   y esos nodos viven en componentes hijos). */
.site-grid-cell__body ::v-deep .card { height: 100%; display: flex; flex-direction: column; }
.site-grid-cell__body ::v-deep .card .card-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.site-grid-cell__body ::v-deep .widget-shell__body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; }
.site-grid-cell__body ::v-deep .widget-shell__body > * { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; }
/* DEC-REF-113 F3 (#84) — el gauge de autonomía llena su celda (antes canvas
   fijo de 150 px × 220 px: los valores quedaban pegados y distorsionados). */
.site-grid-cell__body ::v-deep .projected-autonomy { width: 100%; height: 100%; }
.site-grid-cell__body ::v-deep .projected-autonomy__canvas { width: 100%; height: 100%; min-height: 130px; max-width: none; }
.site-grid-cell--customizing {
  outline: 1px dashed rgba(255, 255, 255, 0.25);
  border-radius: 8px;
}

/* DEC-REF-112 — modo claro */
.white-content .site-grid-cell__cap { color: #525f7f; }
.white-content .site-grid-cell--customizing { outline-color: rgba(0, 0, 0, 0.2); }
</style>

<!-- DEC-REF-70 (f) · #50 — .site-pin vive en assets/sass/dashboard/custom/_leaflet-pins.scss (global). -->

