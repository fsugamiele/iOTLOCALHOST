<template>
  <div class="content">
    <!-- Header simple -->
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Sitios
          <small class="text-muted ml-2">— monitoreo</small>
        </h2>
        <p class="text-muted mb-4">
          Mapa de sitios con estado en vivo. Hacé clic en un sitio para ver el detalle.
        </p>
      </div>
    </div>

    <!-- Estado de carga inicial -->
    <div v-if="loading" class="row">
      <div class="col-12 text-center">
        <i class="tim-icons icon-refresh-01 spin"></i>
        Cargando sitios...
      </div>
    </div>

    <!-- Error si la API responde mal -->
    <div v-else-if="loadError" class="row">
      <div class="col-12">
        <card>
          <div class="text-center text-danger">
            <i class="tim-icons icon-alert-circle-exc"></i>
            <h4>No se pudieron cargar los sitios</h4>
            <p>{{ loadError }}</p>
          </div>
        </card>
      </div>
    </div>

    <!-- Mapa -->
    <div v-show="!loading && !loadError" class="row">
      <div class="col-12">
        <card>
          <div ref="mapEl" class="sites-map"></div>
          <!-- Leyenda -->
          <div class="map-legend">
            <span class="legend-item"><span class="dot dot-critical"></span> Urgencia</span>
            <span class="legend-item"><span class="dot dot-warning"></span> Atención</span>
            <span class="legend-item"><span class="dot dot-ok"></span> Normal</span>
          </div>
        </card>
      </div>
    </div>
  </div>
</template>

<script>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Colores de estado (DEC-REF-27)
const STATUS_COLOR = {
  critical: '#E24B4A',
  warning: '#EF9F27',
  ok: '#639922',
};

export default {
  name: 'SitesMap',
  middleware: 'authenticated',

  data() {
    return {
      loading: true,
      loadError: null,
      sites: [],
      map: null,
      markers: [],
    };
  },

  async mounted() {
    this.initMap();
    await this.loadSites();
  },

  beforeDestroy() {
    // Teardown del mapa (DEC-STACK-1: ciclo de vida explícito, migrable)
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  },

  methods: {
    initMap() {
      // Centro aproximado NEA Argentina (Corrientes); zoom regional
      this.map = L.map(this.$refs.mapEl).setView([-28.5, -57.0], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(this.map);
    },

    async loadSites() {
      this.loading = true;
      this.loadError = null;

      const headers = { headers: { token: this.$store.state.auth.token } };

      try {
        const res = await this.$axios.get('/sites/status', headers);

        if (res.data.status !== 'success') {
          throw new Error(res.data.error || 'Error al cargar sitios');
        }

        this.sites = res.data.data || [];
        this.renderPins();

        if (this.sites.length === 0) {
          this.loadError = 'No hay sitios disponibles.';
        }
      } catch (err) {
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }
        this.loadError = err.message || 'Error inesperado al cargar los sitios';
        console.error('[Sites] loadSites error:', err);
      } finally {
        this.loading = false;
        // Leaflet necesita recalcular tamaño tras render (el div estaba oculto)
        this.$nextTick(() => {
          if (this.map) this.map.invalidateSize();
        });
      }
    },

    renderPins() {
      // Limpiar marcadores previos
      this.markers.forEach((m) => this.map.removeLayer(m));
      this.markers = [];

      this.sites
        .filter((s) => s.lat != null && s.lng != null)
        .forEach((s) => this.addPin(s));
    },

    addPin(site) {
      const color = STATUS_COLOR[site.status] || STATUS_COLOR.ok;
      // divIcon: pin de CSS puro, sin imagen → esquiva el bug de iconos en Webpack 4
      const icon = L.divIcon({
        className: 'site-pin-wrapper',
        html: `<span class="site-pin" style="background:${color}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker([site.lat, site.lng], { icon })
        .addTo(this.map)
        .bindTooltip(`${site.nombre || site.siteCode} (${site.siteCode})`);

      marker.on('click', () => {
        this.$router.push('/sites/' + site.siteCode);
      });

      this.markers.push(marker);
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

.sites-map {
  height: 480px;
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

<style>
.site-pin {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.35);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
}
</style>
