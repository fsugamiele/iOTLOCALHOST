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

      <!-- Devices del site -->
      <div class="row" v-if="devices.length > 0">
        <div
          v-for="device in devices"
          :key="device.dId"
          class="col-md-6 col-lg-4"
        >
          <card>
            <template #header>
              <h4 class="card-title mb-0">{{ device.name }}</h4>
              <p class="card-category">
                {{ device.templateName || '— sin template' }}
              </p>
            </template>

            <!-- DEC-REF-98 D-3 (#73): cada widget se resuelve por tipo con
                 el resolver (composición Live con shell propia — muestra la
                 etiqueta). La fila label+valor solo servía para live-value
                 y no soportaba los widgets custom (booleanDwell,
                 equipmentAlarms). -->
            <div v-if="device.templateWidgets && device.templateWidgets.length > 0">
              <div
                v-for="(widget, i) in device.templateWidgets"
                :key="widget.widget + '-' + (widget.variable || i)"
              >
                <component
                  :is="resolveWidget(widget.widget, { context: 'live' })"
                  :config="liveConfig(device, widget)"
                />
              </div>
            </div>
            <p v-else class="text-muted mb-0">Sin variables declaradas.</p>
          </card>
        </div>
      </div>
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
  },

  async mounted() {
    await this.$store.dispatch('getDevices');
    await this.loadDetail();
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
</style>

<!-- DEC-REF-70 (f) · #50 — .site-pin vive en assets/sass/dashboard/custom/_leaflet-pins.scss (global). -->

