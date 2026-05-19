<template>
  <div class="device-panel">
    <!-- Mensaje inicial si no hay device seleccionado -->
    <div v-if="!device" class="empty-state">
      <i class="tim-icons icon-light-3"></i>
      <p class="text-muted">
        Seleccioná un dispositivo de la lista para ver sus sensores.
      </p>
    </div>

    <!-- Panel del device seleccionado -->
    <div v-else class="device-content">
      <!-- Subtítulo con info del device -->
      <div class="device-meta mb-3">
        <span class="badge badge-info">{{ device.templateName }}</span>
        <span class="text-muted ml-2">
          <i class="tim-icons icon-tag"></i>
          {{ device.dId }}
        </span>
      </div>

      <!-- Grilla de sensores -->
      <div class="sensors-grid">
        <div
          v-for="widget in widgets"
          :key="widget.variable"
          class="sensor-card"
          :class="sensorStateClass(widget)"
        >
          <div class="sensor-label">
            {{ widget.variableFullName }}
          </div>
          <div class="sensor-value">
            <!-- bool -->
            <template v-if="widget.variableType === 'bool'">
              <span :class="['bool-indicator', boolIsActive(widget) ? 'is-active' : 'is-idle']">
                <i :class="['tim-icons', boolIsActive(widget) ? 'icon-alert-circle-exc' : 'icon-check-2']"></i>
                <span>{{ boolLabel(widget) }}</span>
              </span>
            </template>
            <!-- int -->
            <template v-else-if="widget.variableType === 'int'">
              <span class="int-value">
                {{ intDisplay(widget) }}<small v-if="widget.variable === 'battery_beacons_count'" class="text-muted ml-1">/ 4</small>
              </span>
            </template>
            <!-- float -->
            <template v-else-if="widget.variableType === 'float'">
              <span class="float-value">{{ floatDisplay(widget) }}</span>
            </template>
            <!-- categorical -->
            <template v-else-if="widget.variableType === 'categorical'">
              <span :class="['badge', 'badge-' + categoricalVariant(widget)]">{{ categoricalLabel(widget) }}</span>
            </template>
            <!-- fallback -->
            <template v-else>
              <span class="int-value">{{ liveValues[widget.variable] !== undefined ? liveValues[widget.variable] : '—' }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- Footer con timestamp del último update -->
      <div class="last-update mt-3">
        <small class="text-muted">
          <i class="tim-icons icon-watch-time"></i>
          Última actualización: {{ lastUpdateLabel }}
        </small>
      </div>

      <!-- Separador entre sensores y escenarios -->
      <hr class="scenarios-separator">

      <!-- Sección de escenarios -->
      <div class="scenarios-section">
        <h5 class="scenarios-title">
          <i class="tim-icons icon-spaceship"></i>
          Escenarios disponibles
        </h5>

        <!-- Estado del escenario activo o idle -->
        <div class="scenario-status mb-3">
          <div v-if="activeScenario" class="status-running">
            <i class="tim-icons icon-refresh-01 spin"></i>
            <strong>Ejecutando:</strong> {{ scenarioDisplay(activeScenario.name) }}
            <small class="ml-2">quedan {{ remainingSeconds }}s</small>
            <div class="progress-bar-wrapper mt-2">
              <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
          </div>
          <div v-else class="status-idle">
            <span class="status-idle-dot"></span>
            <small class="text-muted">Idle — sin escenario activo</small>
          </div>
        </div>

        <!-- Grilla de botones de escenarios -->
        <div class="scenarios-grid">
          <button
            v-for="scenario in compatibleScenarios"
            :key="scenario.name"
            class="scenario-button"
            :disabled="!!activeScenario"
            @click="triggerScenario(scenario.name)"
          >
            <div class="scenario-icon">
              <i :class="['tim-icons', scenario.icon]"></i>
            </div>
            <div class="scenario-text">
              <div class="scenario-name">{{ scenario.label }}</div>
              <div class="scenario-description">{{ scenario.description }}</div>
            </div>
            <div class="scenario-duration">{{ scenario.duration_label }}</div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const SCENARIOS_BY_ROLE = {
  SEC: [
    {
      name: 'intrusion',
      label: 'Intrusión',
      description: 'Apertura por cerco + robo BLE',
      icon: 'icon-bell-55',
      duration_ms: 60000,
      duration_label: '60s',
    },
    {
      name: 'copper_theft',
      label: 'Robo de cobre',
      description: 'Movimiento de cobre + pérdida tierra',
      icon: 'icon-flash',
      duration_ms: 75000,
      duration_label: '75s',
    },
    {
      name: 'maintenance',
      label: 'Mantenimiento',
      description: 'Tarea programada — ignora alarmas',
      icon: 'icon-settings-gear-63',
      duration_ms: 90000,
      duration_label: '90s',
    },
  ],
  GEN: [
    {
      name: 'fuel_siphon',
      label: 'Robo de combustible',
      description: 'Sifoneo — nivel cae a 30%',
      icon: 'icon-spaceship',
      duration_ms: 15000,
      duration_label: '15s',
    },
    {
      name: 'genset_no_start',
      label: 'Falla de arranque',
      description: '3 intentos de crank sin éxito',
      icon: 'icon-button-power',
      duration_ms: 45000,
      duration_label: '45s',
    },
    {
      name: 'genset_vibration_anomaly',
      label: 'Vibración anómala',
      description: 'Predictivo: normal → warning → crítico',
      icon: 'icon-chart-bar-32',
      duration_ms: 30000,
      duration_label: '30s',
    },
    {
      name: 'battery_degraded',
      label: 'Batería degradada',
      description: 'Tensión baja al arrancar',
      icon: 'icon-battery-81',
      duration_ms: 20000,
      duration_label: '20s',
    },
  ],
};

export default {
  name: 'SimulatorDevicePanel',

  props: {
    device: {
      type: Object,
      default: null,
    },
    userId: {
      type: String,
      required: true,
    },
    userToken: {
      type: String,
      required: true,
    },
  },

  data() {
    return {
      liveValues: {},
      lastUpdateAt: null,
      activeHandlers: [],
      activeScenario: null,
      _scenarioTimer: null,
    };
  },

  computed: {
    widgets() {
      if (!this.device || !this.device.templateWidgets) return [];
      return this.device.templateWidgets;
    },

    lastUpdateLabel() {
      if (!this.lastUpdateAt) return '—';
      const seconds = Math.floor((Date.now() - this.lastUpdateAt) / 1000);
      if (seconds < 5) return 'hace un instante';
      if (seconds < 60) return `hace ${seconds} segundos`;
      const minutes = Math.floor(seconds / 60);
      return `hace ${minutes} min`;
    },

    deviceRole() {
      if (!this.device) return null;
      return this.device.name.endsWith('-SEC') ? 'SEC' : 'GEN';
    },

    compatibleScenarios() {
      if (!this.deviceRole) return [];
      return SCENARIOS_BY_ROLE[this.deviceRole] || [];
    },

    remainingSeconds() {
      if (!this.activeScenario) return 0;
      const elapsed = Date.now() - this.activeScenario.startedAt;
      const remaining = this.activeScenario.duration_ms - elapsed;
      return Math.max(0, Math.ceil(remaining / 1000));
    },

    progressPercent() {
      if (!this.activeScenario) return 0;
      const elapsed = Date.now() - this.activeScenario.startedAt;
      return Math.min(100, (elapsed / this.activeScenario.duration_ms) * 100);
    },
  },

  watch: {
    device: {
      immediate: true,
      handler(newDevice, oldDevice) {
        if (oldDevice) this.unsubscribeFromDevice(oldDevice);
        // Pre-inicializar todas las keys a null para que Vue 2 configure
        // getters/setters por key desde el inicio y la reactividad funcione.
        const initial = {};
        if (newDevice && newDevice.templateWidgets) {
          newDevice.templateWidgets.forEach(w => { initial[w.variable] = null; });
        }
        this.liveValues = initial;
        this.lastUpdateAt = null;
        this.activeScenario = null;
        if (this._scenarioTimer) {
          clearTimeout(this._scenarioTimer);
          this._scenarioTimer = null;
        }
        if (newDevice) this.subscribeToDevice(newDevice);
      },
    },
  },

  mounted() {
    this._labelInterval = setInterval(() => {
      this.$forceUpdate();
    }, 5000);
  },

  beforeDestroy() {
    if (this.device) this.unsubscribeFromDevice(this.device);
    if (this._labelInterval) clearInterval(this._labelInterval);
    if (this._scenarioTimer) clearTimeout(this._scenarioTimer);
  },

  methods: {
    subscribeToDevice(device) {
      if (!device.templateWidgets) return;
      for (const w of device.templateWidgets) {
        const topic = `${this.userId}/${device.dId}/${w.variable}/sdata`;
        const handler = (data) => this.onSdata(w.variable, data);
        this.$nuxt.$on(topic, handler);
        this.activeHandlers.push({ topic, handler });
      }
    },

    unsubscribeFromDevice(device) {
      for (const { topic, handler } of this.activeHandlers) {
        this.$nuxt.$off(topic, handler);
      }
      this.activeHandlers = [];
    },

    onSdata(variable, data) {
      if (data && data.value !== undefined) {
        this.$set(this.liveValues, variable, data.value);
        this.lastUpdateAt = Date.now();
      }
    },

    async triggerScenario(scenarioName) {
      if (this.activeScenario) return;
      const scenarioDef = this.compatibleScenarios.find(s => s.name === scenarioName);
      if (!scenarioDef) return;
      try {
        const headers = { headers: { token: this.userToken } };
        await this.$axios.post('/simulator/scenario', {
          dId: this.device.dId,
          name: scenarioName,
        }, headers);
        this.activeScenario = {
          name: scenarioName,
          startedAt: Date.now(),
          duration_ms: scenarioDef.duration_ms,
        };
        this._scenarioTimer = setTimeout(() => {
          this.activeScenario = null;
          this._scenarioTimer = null;
        }, scenarioDef.duration_ms);
      } catch (err) {
        console.warn('[Simulator] scenario trigger error:', err.message);
      }
    },

    scenarioDisplay(scenarioName) {
      const def = this.compatibleScenarios.find(s => s.name === scenarioName);
      return def?.label || scenarioName;
    },

    // ── Display helpers ───────────────────────────────────────────

    boolIsActive(widget) {
      const v = this.liveValues[widget.variable];
      if (v === null || v === undefined) return false;
      const raw = Number(v) === 1 || v === true;
      return widget.variable === 'ground_continuity' ? !raw : raw;
    },

    boolLabel(widget) {
      const v = this.liveValues[widget.variable];
      if (v === null || v === undefined) return '—';
      const raw = Number(v) === 1 || v === true;
      if (widget.variable === 'ground_continuity') {
        return raw ? 'Normal' : 'Cortada';
      }
      return raw ? 'Activo' : 'Inactivo';
    },

    intDisplay(widget) {
      const v = this.liveValues[widget.variable];
      return v !== null && v !== undefined ? Number(v) : '—';
    },

    floatDisplay(widget) {
      const v = this.liveValues[widget.variable];
      if (v === null || v === undefined) return '—';
      const num = Number(v);
      const m = widget.variableFullName.match(/\(([^)]+)\)/);
      const unit = m ? m[1] : '';
      return num.toFixed(1) + (unit ? ' ' + unit : '');
    },

    categoricalLabel(widget) {
      const v = this.liveValues[widget.variable];
      if (v === null || v === undefined) return '—';
      const labels = { normal: 'Normal', warning: 'Advertencia', anomaly: 'Anomalía', critical: 'Crítico' };
      return labels[v] || String(v);
    },

    categoricalVariant(widget) {
      const v = this.liveValues[widget.variable];
      if (v === 'critical') return 'danger';
      if (v === 'anomaly') return 'warning';
      if (v === 'warning') return 'info';
      return 'success';
    },

    sensorStateClass(widget) {
      const v = this.liveValues[widget.variable];
      if (v === null || v === undefined) return 'is-unknown';
      if (widget.variableType === 'bool') {
        const isInverted = widget.variable === 'ground_continuity';
        const isActive = Number(v) === 1 || v === true;
        const isAlarmed = isInverted ? !isActive : isActive;
        return isAlarmed ? 'is-alarm' : 'is-normal';
      }
      if (widget.variableType === 'categorical') {
        if (v === 'critical' || v === 'anomaly') return 'is-alarm';
        if (v === 'warning') return 'is-warning';
        return 'is-normal';
      }
      if (widget.variableType === 'int') {
        if (widget.variable === 'battery_beacons_count' && Number(v) < 4) return 'is-alarm';
        if (widget.variable === 'crank_attempts_failed' && Number(v) > 0) return 'is-alarm';
        return 'is-normal';
      }
      return 'is-normal';
    },
  },
};
</script>

<style scoped>
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
}

.empty-state i {
  font-size: 3rem;
  color: rgba(255, 255, 255, 0.2);
  margin-bottom: 1rem;
}

.device-meta {
  font-size: 0.85rem;
}

.sensors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.8rem;
}

.sensor-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 0.9rem;
  transition: all 0.2s ease;
}

.sensor-card.is-alarm {
  background: rgba(252, 86, 117, 0.1);
  border-color: rgba(252, 86, 117, 0.5);
  box-shadow: 0 0 10px rgba(252, 86, 117, 0.2);
}

.sensor-card.is-warning {
  background: rgba(255, 141, 114, 0.1);
  border-color: rgba(255, 141, 114, 0.4);
}

.sensor-card.is-unknown {
  opacity: 0.5;
}

.sensor-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.4rem;
}

.sensor-value {
  font-size: 1.1rem;
  font-weight: 500;
}

.bool-indicator {
  display: inline-flex;
  align-items: center;
  font-size: 0.95rem;
}

.bool-indicator i {
  margin-right: 0.4rem;
}

.bool-indicator.is-idle {
  color: #00f2c3;
}

.bool-indicator.is-active {
  color: #fc5675;
}

.int-value, .float-value {
  font-family: 'Courier New', monospace;
  font-size: 1.2rem;
}

.last-update {
  text-align: right;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 0.5rem;
}

.scenarios-separator {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 1.5rem 0;
}

.scenarios-title {
  font-size: 0.95rem;
  font-weight: 500;
  margin-bottom: 1rem;
  color: rgba(255, 255, 255, 0.9);
}

.scenarios-title i {
  margin-right: 0.4rem;
  color: #e14eca;
}

.scenario-status {
  background: rgba(255, 255, 255, 0.03);
  padding: 0.7rem 1rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.status-running {
  font-size: 0.9rem;
  color: #e14eca;
}

.status-running i {
  margin-right: 0.4rem;
}

.spin {
  display: inline-block;
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.progress-bar-wrapper {
  background: rgba(255, 255, 255, 0.05);
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #e14eca, #ff8d72);
  transition: width 0.5s linear;
}

.status-idle {
  display: flex;
  align-items: center;
}

.status-idle-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00f2c3;
  margin-right: 0.5rem;
}

.scenarios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.7rem;
}

.scenario-button {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 0.8rem 1rem;
  color: white;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.scenario-button:hover:not(:disabled) {
  background: rgba(225, 78, 202, 0.1);
  border-color: rgba(225, 78, 202, 0.4);
  transform: translateY(-1px);
}

.scenario-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.scenario-icon {
  font-size: 1.3rem;
  color: #e14eca;
  margin-right: 0.8rem;
  flex-shrink: 0;
}

.scenario-text {
  flex: 1;
  min-width: 0;
}

.scenario-name {
  font-size: 0.95rem;
  font-weight: 500;
  margin-bottom: 0.15rem;
}

.scenario-description {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.scenario-duration {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin-left: 0.6rem;
  flex-shrink: 0;
}
</style>
