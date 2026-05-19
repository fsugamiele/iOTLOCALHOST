<template>
  <div class="content">
    <!-- Header simple -->
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Panel de Simulador
          <small class="text-muted ml-2">— modo demo</small>
        </h2>
        <p class="text-muted mb-4">
          Control de dispositivos simulados para la demostración a clientes.
          Los datos se publican en tiempo real al broker MQTT.
        </p>
      </div>
    </div>

    <!-- Estado de carga inicial -->
    <div v-if="loading" class="row">
      <div class="col-12 text-center">
        <i class="tim-icons icon-refresh-01 spin"></i>
        Cargando dispositivos simulados...
      </div>
    </div>

    <!-- Error si la API responde mal -->
    <div v-else-if="loadError" class="row">
      <div class="col-12">
        <card>
          <div class="text-center text-danger">
            <i class="tim-icons icon-alert-circle-exc"></i>
            <h4>No se pudo cargar el panel</h4>
            <p>{{ loadError }}</p>
            <p class="text-muted">
              Verificá que <code>ENABLE_SIMULATOR_API=true</code> esté
              configurado en el backend.
            </p>
          </div>
        </card>
      </div>
    </div>

    <!-- Layout master-detail -->
    <div v-else class="row">
      <!-- Columna izquierda: lista de devices -->
      <div class="col-md-4 col-lg-3">
        <card>
          <h4 slot="header" class="card-title">Dispositivos</h4>
          <DeviceList
            :devices="devices"
            :selected-d-id="selectedDevice ? selectedDevice.dId : null"
            @select-device="onDeviceSelected"
            @reset-device="onResetDevice"
          />
        </card>
      </div>

      <!-- Columna derecha: panel del device seleccionado -->
      <div class="col-md-8 col-lg-9">
        <card>
          <h4 slot="header" class="card-title">
            {{ selectedDevice ? selectedDevice.name : 'Selecciona un dispositivo' }}
          </h4>
          <DevicePanel
            :device="selectedDevice"
            :user-id="userId"
            :user-token="$store.state.auth.token"
          />
        </card>
      </div>
    </div>
  </div>
</template>

<script>
import DeviceList from '~/components/Simulator/DeviceList.vue';
import DevicePanel from '~/components/Simulator/DevicePanel.vue';

export default {
  name: 'SimulatorPanel',
  middleware: 'authenticated',
  components: { DeviceList, DevicePanel },

  data() {
    return {
      loading: true,
      loadError: null,
      devices: [],
      scenarios: [],
      selectedDevice: null,
    };
  },

  computed: {
    userId() {
      return this.$store.state.auth?.userData?._id || '';
    },
  },

  async mounted() {
    await this.loadInitialData();
  },

  methods: {
    async loadInitialData() {
      this.loading = true;
      this.loadError = null;

      const headers = { headers: { token: this.$store.state.auth.token } };

      try {
        // Fetch en paralelo
        const [devicesRes, scenariosRes] = await Promise.all([
          this.$axios.get('/simulator/devices', headers),
          this.$axios.get('/simulator/scenarios', headers),
        ]);

        if (devicesRes.data.status !== 'success') {
          throw new Error(devicesRes.data.error || 'Error al cargar dispositivos');
        }
        if (scenariosRes.data.status !== 'success') {
          throw new Error(scenariosRes.data.error || 'Error al cargar escenarios');
        }

        this.devices = devicesRes.data.data || [];
        this.scenarios = scenariosRes.data.data || [];

        if (this.devices.length === 0) {
          this.loadError = 'No hay dispositivos simulados disponibles.';
        }

      } catch (err) {
        // Auth 401 → redirect al login (patrón del proyecto)
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }

        // Endpoint 404 → simulator API deshabilitada
        if (err.response && err.response.status === 404) {
          this.loadError = 'API del simulador no disponible. Verificá que ENABLE_SIMULATOR_API=true en el backend.';
        } else {
          this.loadError = err.message || 'Error inesperado al cargar el panel';
        }
        console.error('[Simulator] loadInitialData error:', err);
      } finally {
        this.loading = false;
      }
    },

    async onDeviceSelected(device) {
      this.selectedDevice = device;
      // Forzar burst inmediato de todos los sensores para que el panel
      // muestre valores sin esperar el próximo ciclo de 30s.
      await this.callReset(device.dId);
    },

    async onResetDevice(dId) {
      await this.callReset(dId);
    },

    async callReset(dId) {
      try {
        const headers = { headers: { token: this.$store.state.auth.token } };
        await this.$axios.post('/simulator/reset', { dId }, headers);
      } catch (err) {
        console.warn('[Simulator] reset error:', err.message);
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

.device-list-placeholder {
  list-style: none;
  padding-left: 0;
}

.device-list-placeholder li {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.device-list-placeholder li:last-child {
  border-bottom: none;
}

.placeholder {
  min-height: 200px;
}
</style>
