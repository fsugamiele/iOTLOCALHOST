<template>
  <card>
    <div slot="header" class="equipment-header">
      <div>
        <h4 class="card-title mb-1">{{ title }}</h4>
        <span class="badge badge-info">{{ selectedDevice.templateName }}</span>
        <span class="text-muted ml-2">
          <i class="tim-icons icon-tag"></i>
          {{ selectedDevice.dId }} · sitio {{ selectedDevice.siteId }}
        </span>
      </div>
      <div class="equipment-header-actions">
        <!-- Selector de instancia cuando la familia tiene >1 device (ELTEK) -->
        <el-select
          v-if="devices.length > 1"
          v-model="selectedDId"
          size="small"
          class="instance-selector"
        >
          <el-option
            v-for="d in devices"
            :key="d.dId"
            :value="d.dId"
            :label="d.name"
          />
        </el-select>
        <button class="btn btn-sm btn-outline-danger" @click="resetDevice">
          <i class="tim-icons icon-refresh-01"></i> Reset
        </button>
      </div>
    </div>

    <p v-if="note" class="text-muted equipment-note">
      <i class="tim-icons icon-alert-circle-exc"></i> {{ note }}
    </p>

    <!-- Grilla de variables editables -->
    <div class="vars-grid">
      <div
        v-for="widget in widgets"
        :key="widget.variable"
        class="var-card"
        :class="{ 'is-dirty': isDirty(widget.variable) }"
      >
        <div class="var-label">
          {{ widget.variableFullName || widget.variable }}
          <small class="text-muted d-block">{{ widget.variable }}</small>
        </div>
        <div class="var-live">
          <small class="text-muted">live:</small>
          <span class="live-value">{{ liveDisplay(widget) }}</span>
        </div>
        <div class="var-control">
          <!-- bool -->
          <el-switch
            v-if="widget.variableType === 'bool'"
            v-model="editValues[widget.variable]"
            @change="markDirty(widget.variable)"
          />
          <!-- int / float -->
          <el-input
            v-else-if="widget.variableType === 'int' || widget.variableType === 'float'"
            v-model="editValues[widget.variable]"
            type="number"
            :step="widget.variableType === 'int' ? 1 : 'any'"
            size="small"
            :placeholder="widget.unit || ''"
            @input="markDirty(widget.variable)"
          />
          <!-- categorical (sin enumValues en template → input libre) -->
          <el-input
            v-else
            v-model="editValues[widget.variable]"
            size="small"
            placeholder="valor"
            @input="markDirty(widget.variable)"
          />
          <button
            class="btn btn-sm btn-primary apply-btn"
            :disabled="!isDirty(widget.variable) || applying[widget.variable]"
            @click="applyValue(widget)"
          >
            Aplicar
          </button>
        </div>
        <div v-if="isDirty(widget.variable)" class="dirty-flag">
          <small>modificado sin aplicar</small>
        </div>
      </div>
    </div>

    <hr class="scenarios-separator">

    <!-- Escenarios de esta familia -->
    <div class="scenarios-section">
      <h5 class="scenarios-title">
        <i class="tim-icons icon-spaceship"></i>
        Escenarios — {{ title }}
      </h5>

      <div class="scenario-status mb-3">
        <div v-if="activeScenario" class="status-running">
          <i class="tim-icons icon-refresh-01 spin"></i>
          <strong>Ejecutando:</strong> {{ activeScenario.name }}
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

      <div v-if="familyScenarios.length" class="scenarios-grid">
        <button
          v-for="scenario in familyScenarios"
          :key="scenario.name"
          class="scenario-button"
          :disabled="!!activeScenario"
          @click="triggerScenario(scenario)"
        >
          <div class="scenario-text">
            <div class="scenario-name">{{ scenario.name }}</div>
            <div class="scenario-description">{{ scenario.description }}</div>
          </div>
          <div class="scenario-duration">{{ durationLabel(scenario.duration_ms) }}</div>
        </button>
      </div>
      <p v-else class="text-muted">
        <small>No hay escenarios catalogados para este equipo.</small>
      </p>
    </div>
  </card>
</template>

<script>
import { Input, Switch, Select, Option } from 'element-ui';

export default {
  name: 'SimulatorEquipmentCard',

  components: {
    [Input.name]: Input,
    [Switch.name]: Switch,
    [Select.name]: Select,
    [Option.name]: Option,
  },

  props: {
    title: { type: String, required: true },
    // Devices de la misma familia (ej. los 3 ELTEK del sitio)
    devices: { type: Array, required: true },
    // Familia de rol usada para filtrar escenarios: SEC | GEN | CUMMINS | ATS | ELTEK
    family: { type: String, required: true },
    // Catálogo enriquecido: [{name, description, duration_ms, roles, noCleanup}]
    scenarios: { type: Array, default: () => [] },
    note: { type: String, default: '' },
    userToken: { type: String, required: true },
  },

  data() {
    return {
      selectedDId: this.devices[0] ? this.devices[0].dId : null,
      liveValues: {},
      editValues: {},
      dirty: {},
      applying: {},
      activeHandlers: [],
      activeScenario: null,
      _scenarioTimer: null,
    };
  },

  computed: {
    selectedDevice() {
      return this.devices.find(d => d.dId === this.selectedDId) || this.devices[0];
    },

    widgets() {
      return (this.selectedDevice && this.selectedDevice.templateWidgets) || [];
    },

    familyScenarios() {
      // Match por familia; ELTEK-01/02/03 comparten familia 'ELTEK'
      return this.scenarios.filter(s =>
        Array.isArray(s.roles) && s.roles.some(r => this.family === r || this.family.startsWith(r))
      );
    },

    remainingSeconds() {
      if (!this.activeScenario) return 0;
      const elapsed = Date.now() - this.activeScenario.startedAt;
      return Math.max(0, Math.ceil((this.activeScenario.duration_ms - elapsed) / 1000));
    },

    progressPercent() {
      if (!this.activeScenario) return 0;
      const elapsed = Date.now() - this.activeScenario.startedAt;
      return Math.min(100, (elapsed / this.activeScenario.duration_ms) * 100);
    },
  },

  watch: {
    selectedDId: {
      immediate: true,
      handler(newDId, oldDId) {
        if (oldDId) this.unsubscribe();
        this.initValues();
        if (newDId) this.subscribe(newDId);
      },
    },
  },

  mounted() {
    this._labelInterval = setInterval(() => this.$forceUpdate(), 1000);
  },

  beforeDestroy() {
    this.unsubscribe();
    if (this._labelInterval) clearInterval(this._labelInterval);
    if (this._scenarioTimer) clearTimeout(this._scenarioTimer);
  },

  methods: {
    initValues() {
      // Pre-inicializar keys para reactividad Vue 2
      const live = {};
      const edit = {};
      this.widgets.forEach(w => {
        live[w.variable] = null;
        edit[w.variable] = w.variableType === 'bool' ? false : null;
      });
      this.liveValues = live;
      this.editValues = edit;
      this.dirty = {};
      this.applying = {};
      this.activeScenario = null;
      if (this._scenarioTimer) {
        clearTimeout(this._scenarioTimer);
        this._scenarioTimer = null;
      }
    },

    subscribe(dId) {
      // DEC-REF-100 D-1 — suscribir por namespace del OWNER del device
      // (el layout re-emite con el topic completo, que lleva el userId del
      // owner). Antes se usaba el userId del usuario logueado: con devices
      // de otro owner no llegaba ningún live.
      const device = this.devices.find(d => d.dId === dId);
      const owner = device && device.userId;
      if (!owner) return;
      for (const w of this.widgets) {
        const topic = `${owner}/${dId}/${w.variable}/sdata`;
        const handler = (data) => this.onSdata(w.variable, data);
        this.$nuxt.$on(topic, handler);
        this.activeHandlers.push({ topic, handler });
      }
    },

    unsubscribe() {
      for (const { topic, handler } of this.activeHandlers) {
        this.$nuxt.$off(topic, handler);
      }
      this.activeHandlers = [];
    },

    onSdata(variable, data) {
      if (data && data.value !== undefined) {
        this.$set(this.liveValues, variable, data.value);
        // Si el usuario no editó el campo, seguir al live
        if (!this.dirty[variable]) {
          const w = this.widgets.find(x => x.variable === variable);
          const v = w && w.variableType === 'bool'
            ? (Number(data.value) === 1 || data.value === true)
            : data.value;
          this.$set(this.editValues, variable, v);
        }
      }
    },

    liveDisplay(widget) {
      const v = this.liveValues[widget.variable];
      if (v === null || v === undefined) return '—';
      if (widget.variableType === 'bool') return (Number(v) === 1 || v === true) ? 'Activo' : 'Inactivo';
      if (widget.variableType === 'float') return Number(v).toFixed(1) + (widget.unit ? ' ' + widget.unit : '');
      if (widget.variableType === 'int') return String(Number(v)) + (widget.unit ? ' ' + widget.unit : '');
      return String(v);
    },

    markDirty(variable) {
      this.$set(this.dirty, variable, true);
    },

    isDirty(variable) {
      return !!this.dirty[variable];
    },

    castValue(widget) {
      const raw = this.editValues[widget.variable];
      if (widget.variableType === 'bool') return !!raw;
      if (widget.variableType === 'int') return parseInt(raw, 10);
      if (widget.variableType === 'float') return parseFloat(raw);
      return String(raw);
    },

    async applyValue(widget) {
      const value = this.castValue(widget);
      if ((widget.variableType === 'int' || widget.variableType === 'float') && !isFinite(value)) {
        this.$notify({ type: 'warning', icon: 'tim-icons icon-alert-circle-exc', message: `Valor inválido para ${widget.variable}` });
        return;
      }
      this.$set(this.applying, widget.variable, true);
      try {
        const headers = { headers: { token: this.userToken } };
        await this.$axios.post('/simulator/set', {
          dId: this.selectedDevice.dId,
          sensor: widget.variable,
          value,
        }, headers);
        this.$set(this.dirty, widget.variable, false);
        this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message: `${widget.variable} = ${value}` });
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || `Error aplicando ${widget.variable}`,
        });
      } finally {
        this.$set(this.applying, widget.variable, false);
      }
    },

    async triggerScenario(scenario) {
      if (this.activeScenario) return;
      try {
        const headers = { headers: { token: this.userToken } };
        await this.$axios.post('/simulator/scenario', {
          dId: this.selectedDevice.dId,
          name: scenario.name,
        }, headers);
        this.activeScenario = {
          name: scenario.name,
          startedAt: Date.now(),
          duration_ms: scenario.duration_ms,
        };
        this._scenarioTimer = setTimeout(() => {
          this.activeScenario = null;
          this._scenarioTimer = null;
        }, scenario.duration_ms);
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || `Error disparando ${scenario.name}`,
        });
      }
    },

    async resetDevice() {
      try {
        const headers = { headers: { token: this.userToken } };
        await this.$axios.post('/simulator/reset', { dId: this.selectedDevice.dId }, headers);
        this.$notify({ type: 'info', icon: 'tim-icons icon-refresh-01', message: `Reset enviado a ${this.selectedDevice.name}` });
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || 'Error en reset',
        });
      }
    },

    durationLabel(ms) {
      if (!ms) return '—';
      const s = Math.round(ms / 1000);
      if (s < 60) return `${s}s`;
      return `${Math.floor(s / 60)}m${s % 60 ? ' ' + (s % 60) + 's' : ''}`;
    },
  },
};
</script>

<style scoped>
.equipment-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.equipment-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.instance-selector {
  min-width: 180px;
}

.equipment-note {
  font-size: 0.8rem;
  margin-bottom: 0.8rem;
}

.vars-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.8rem;
}

.var-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 0.8rem;
}

.var-card.is-dirty {
  border-color: rgba(225, 78, 202, 0.5);
}

.var-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.3rem;
}

.var-live {
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.live-value {
  font-family: 'Courier New', monospace;
  margin-left: 0.3rem;
}

.var-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.var-control .el-input {
  flex: 1;
}

.apply-btn {
  flex-shrink: 0;
}

.dirty-flag {
  color: #e14eca;
  margin-top: 0.3rem;
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
