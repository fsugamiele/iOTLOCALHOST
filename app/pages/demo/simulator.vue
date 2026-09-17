<template>
  <div class="content">
    <!-- Header -->
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Panel de Simulador
          <small class="text-muted ml-2">— Wanomi 3.0</small>
        </h2>
        <p class="text-muted mb-4">
          Control de dispositivos simulados por equipo. Editá cualquier variable y
          aplicala para publicarla por MQTT, o dispará un escenario pre-grabado.
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

    <!-- Secciones por equipo -->
    <template v-else>
      <!-- Filtro de sitio (DEC-REF-100 D-2) -->
      <div class="row">
        <div class="col-md-4 col-sm-6">
          <el-select v-model="siteFilter" class="select-primary site-filter" size="small">
            <el-option value="ALL" label="Todos los sitios" />
            <el-option v-for="s in siteOptions" :key="s" :value="s" :label="s" />
          </el-select>
        </div>
      </div>

      <!-- ═══ GENERADOR DE ESCENARIOS (DEC-REF-100 D-8 · F8) ═══ -->
      <div class="row">
        <div class="col-12">
          <card>
            <div slot="header" class="d-flex justify-content-between align-items-center flex-wrap">
              <div>
                <h4 class="card-title mb-1">
                  <i class="tim-icons icon-spaceship" style="color:#e14eca; margin-right:8px"></i>
                  Generador de escenarios
                </h4>
                <p class="text-muted mb-0" style="font-size:12px">
                  Guiones con reloj: pasos (segundo + equipo + variable + valor) que se disparan
                  solos sobre los equipos del sitio. Máximo 50 pasos y 30 minutos.
                </p>
              </div>
              <base-button
                type="primary"
                size="sm"
                :disabled="!scriptSite"
                @click="openScriptEditor(null)"
              >
                <i class="tim-icons icon-simple-add"></i> Nuevo guion
              </base-button>
            </div>

            <div class="row mb-3">
              <div class="col-md-4 col-sm-6">
                <label class="control-label">Sitio del guion</label>
                <el-select v-model="scriptSite" class="select-primary" size="small" style="width:100%">
                  <el-option v-for="s in siteOptions" :key="s" :value="s" :label="s" />
                </el-select>
              </div>
            </div>

            <!-- Guion en ejecución en este sitio (bloqueo + barra) -->
            <div v-if="activeRun" class="scenario-status mb-3">
              <div class="status-running">
                <div class="d-flex justify-content-between align-items-center flex-wrap">
                  <div>
                    <i class="tim-icons icon-refresh-01 spin"></i>
                    <strong>Ejecutando:</strong> {{ activeRun.scriptName }}
                    <small class="ml-2">{{ activeRun.stepsDone }}/{{ activeRun.stepsTotal }} pasos · quedan {{ runRemainingSec }}s</small>
                  </div>
                  <base-button type="danger" size="sm" @click="stopScript">
                    <i class="tim-icons icon-button-pause"></i> Detener
                  </base-button>
                </div>
                <div class="progress-bar-wrapper mt-2">
                  <div class="progress-bar-fill" :style="{ width: runProgressPercent + '%' }"></div>
                </div>
                <small class="text-muted d-block mt-1">
                  Al terminar: {{ activeRun.cleanup === 'reset' ? 'los equipos vuelven a la normalidad (reset)' : 'los valores quedan como quedaron' }}.
                  Detener NO limpia: usá el Reset de cada equipo si hace falta.
                </small>
              </div>
            </div>

            <!-- Lista de guiones del sitio -->
            <div v-if="scripts.length" class="scenarios-grid">
              <div v-for="script in scripts" :key="script._id" class="scenario-button script-card">
                <div class="scenario-text">
                  <div class="scenario-name">{{ script.name }}</div>
                  <div class="scenario-description">
                    {{ script.description || 'sin descripción' }} ·
                    {{ script.steps.length }} pasos · {{ scriptDurationLabel(script) }} ·
                    {{ script.cleanup === 'reset' ? 'vuelve a la normalidad' : 'queda como quedó' }}
                  </div>
                </div>
                <div class="script-actions">
                  <el-tooltip content="Ejecutar" effect="light" :open-delay="300" placement="top">
                    <base-button type="success" icon size="sm" class="btn-link" :disabled="!!activeRun" @click="runScript(script)">
                      <i class="tim-icons icon-triangle-right-17"></i>
                    </base-button>
                  </el-tooltip>
                  <el-tooltip content="Editar" effect="light" :open-delay="300" placement="top">
                    <base-button type="warning" icon size="sm" class="btn-link" :disabled="!!activeRun" @click="openScriptEditor(script)">
                      <i class="fa fa-pencil"></i>
                    </base-button>
                  </el-tooltip>
                  <el-tooltip content="Duplicar" effect="light" :open-delay="300" placement="top">
                    <base-button type="info" icon size="sm" class="btn-link" @click="duplicateScript(script)">
                      <i class="fa fa-copy"></i>
                    </base-button>
                  </el-tooltip>
                  <el-tooltip content="Borrar" effect="light" :open-delay="300" placement="top">
                    <base-button type="danger" icon size="sm" class="btn-link" :disabled="!!activeRun" @click="deleteScript(script)">
                      <i class="fa fa-trash"></i>
                    </base-button>
                  </el-tooltip>
                </div>
              </div>
            </div>
            <p v-else class="text-muted">
              <small>No hay guiones para este sitio. Creá uno con "Nuevo guion" o cloná un escenario del catálogo (ícono <i class="fa fa-code-branch"></i> en cada tarjeta de equipo).</small>
            </p>
          </card>
        </div>
      </div>

      <div v-for="section in visibleSections" :key="section.key" class="row">
        <div class="col-12">
          <h3 class="section-title">
            <i :class="['tim-icons', section.icon]"></i>
            {{ section.title }}
          </h3>
          <EquipmentCard
            v-for="family in section.families"
            :key="family"
            :title="familyLabels[family] || family"
            :family="family"
            :devices="devicesByFamily[family]"
            :scenarios="scenarios"
            :note="section.notes && section.notes[family] || ''"
            :user-token="$store.state.auth.token"
            class="mb-4"
            @clone-scenario="onCloneScenario"
          />
        </div>
      </div>

      <p v-if="visibleSections.length === 0" class="text-muted">
        No hay dispositivos simulados para el sitio seleccionado.
      </p>
    </template>

    <!-- EDITOR DE GUION (DEC-REF-100 D-8 · F8) -->
    <el-dialog
      :title="scriptEditingId ? 'Editar guion' : 'Nuevo guion'"
      :visible.sync="scriptEditorOpen"
      width="760px"
      :close-on-click-modal="false"
    >
      <div class="row">
        <div class="col-md-6">
          <base-input v-model="scriptDraft.name" label="Nombre del guion" placeholder="ej: Corte de red con arranque de generador" />
        </div>
        <div class="col-md-6">
          <base-input v-model="scriptDraft.description" label="Descripción (opcional)" />
        </div>
      </div>

      <label class="control-label d-block mt-2">Al terminar el guion</label>
      <div class="d-flex" style="gap:16px">
        <label class="mb-0" style="cursor:pointer">
          <input type="radio" v-model="scriptDraft.cleanup" value="reset" />
          Volver a la normalidad (reset de los equipos)
        </label>
        <label class="mb-0" style="cursor:pointer">
          <input type="radio" v-model="scriptDraft.cleanup" value="hold" />
          Dejar los valores como quedaron
        </label>
      </div>

      <div class="d-flex justify-content-between align-items-center mt-4 mb-2">
        <h5 class="mb-0">Pasos <small class="text-muted">({{ scriptDraft.steps.length }}/50)</small></h5>
        <base-button type="info" size="sm" :disabled="scriptDraft.steps.length >= 50" @click="addStep">
          <i class="tim-icons icon-simple-add"></i> Agregar paso
        </base-button>
      </div>

      <div v-if="scriptDraft.steps.length === 0" class="text-muted" style="font-size:13px">
        Sin pasos todavía. Cada paso dice: a los N segundos, a este equipo, esta variable, este valor.
      </div>

      <div
        v-for="(step, i) in scriptDraft.steps"
        :key="i"
        class="script-step-row"
      >
        <div class="step-field step-at">
          <label>segundo</label>
          <input v-model.number="step.atSec" type="number" min="0" max="1800" class="form-control form-control-sm" />
        </div>
        <div class="step-field step-device">
          <label>equipo</label>
          <el-select
            v-model="step.dId"
            size="small"
            filterable
            style="width:100%"
            @change="onStepDeviceChange(step)"
          >
            <el-option
              v-for="d in scriptSiteDevices"
              :key="d.dId"
              :value="d.dId"
              :label="d.name"
            />
          </el-select>
        </div>
        <div class="step-field step-var">
          <label>variable</label>
          <el-select v-model="step.variable" size="small" filterable style="width:100%">
            <el-option
              v-for="w in stepVariables(step.dId)"
              :key="w.variable"
              :value="w.variable"
              :label="(w.variableFullName || w.variable) + (w.unit ? ' (' + w.unit + ')' : '')"
            />
          </el-select>
        </div>
        <div class="step-field step-value">
          <label>valor</label>
          <el-switch
            v-if="stepWidget(step) && stepWidget(step).variableType === 'bool'"
            v-model="step.value"
          />
          <input
            v-else-if="stepWidget(step) && (stepWidget(step).variableType === 'int' || stepWidget(step).variableType === 'float')"
            v-model="step.value"
            type="number"
            class="form-control form-control-sm"
          />
          <input v-else v-model="step.value" class="form-control form-control-sm" placeholder="valor" />
        </div>
        <div class="step-remove">
          <base-button type="danger" icon size="sm" class="btn-link" @click="scriptDraft.steps.splice(i, 1)">
            <i class="fa fa-trash"></i>
          </base-button>
        </div>
      </div>

      <div slot="footer">
        <base-button type="secondary" @click="scriptEditorOpen = false">Cancelar</base-button>
        <base-button type="primary" :disabled="!scriptDraftValid || savingScript" @click="saveScript">
          {{ savingScript ? 'Guardando...' : 'Guardar guion' }}
        </base-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import EquipmentCard from '~/components/Simulator/EquipmentCard.vue';
import { Select, Option, MessageBox } from 'element-ui';

const ATS_NOTE = 'Editar gen_status a mano propaga sharedState.gen_running al Cummins del sitio (el generador arranca/frena en consecuencia).';

export default {
  name: 'SimulatorPanel',
  middleware: 'authenticated',
  components: { EquipmentCard, [Select.name]: Select, [Option.name]: Option },

  data() {
    return {
      loading: true,
      loadError: null,
      devices: [],
      scenarios: [],
      siteFilter: 'ALL',
      // DEC-REF-100 D-8 (F8) — generador de escenarios
      scriptSite: '',
      scripts: [],
      activeRun: null,
      scriptEditorOpen: false,
      scriptEditingId: null,
      scriptDraft: { name: '', description: '', cleanup: 'reset', steps: [] },
      savingScript: false,
      runPollTimer: null,
      runTickTimer: null,
      // Orden y composición de las secciones del panel
      sectionDefs: [
        { key: 'gen',   title: 'Generador',    icon: 'icon-button-power', families: ['CUMMINS', 'GEN'] },
        { key: 'ats',   title: 'ATS',          icon: 'icon-refresh-02',   families: ['ATS'], notes: { ATS: ATS_NOTE } },
        { key: 'eltek', title: 'Rectificador', icon: 'icon-light-3',      families: ['ELTEK'] },
        { key: 'sec',   title: 'Seguridad',    icon: 'icon-bell-55',      families: ['SEC'] },
      ],
      familyLabels: {
        CUMMINS: 'Grupo electrógeno — Cummins PowerCommand',
        GEN: 'Grupo electrógeno — GEN legacy',
        ATS: 'Transferencia automática — InteliATS',
        ELTEK: 'Rectificador — Eltek Smartpack S',
        SEC: 'Seguridad perimetral',
      },
    };
  },

  computed: {
    // Sitios disponibles para el filtro (DEC-REF-100 D-2)
    siteOptions() {
      return [...new Set(this.devices.map(d => d.siteId).filter(Boolean))].sort();
    },

    filteredDevices() {
      if (this.siteFilter === 'ALL') return this.devices;
      return this.devices.filter(d => d.siteId === this.siteFilter);
    },

    // Agrupa devices por familia de rol, derivada del name (${siteCode}-${role}).
    // ELTEK-01/02/03 comparten familia 'ELTEK' (una sola tarjeta con selector).
    devicesByFamily() {
      const grouped = {};
      for (const d of this.filteredDevices) {
        const family = this.familyOf(d);
        if (!grouped[family]) grouped[family] = [];
        grouped[family].push(d);
      }
      return grouped;
    },

    visibleSections() {
      return this.sectionDefs
        .map(s => ({
          ...s,
          families: s.families.filter(f => (this.devicesByFamily[f] || []).length > 0),
        }))
        .filter(s => s.families.length > 0);
    },

    // ── Generador de escenarios (DEC-REF-100 D-8 · F8) ──
    scriptSiteDevices() {
      return this.devices.filter(d => d.siteId === this.scriptSite);
    },
    scriptDraftValid() {
      const d = this.scriptDraft;
      if (!d.name || !d.name.trim()) return false;
      if (!d.steps.length) return false;
      return d.steps.every(s =>
        Number.isFinite(Number(s.atSec)) && Number(s.atSec) >= 0 && Number(s.atSec) <= 1800 &&
        s.dId && s.variable && s.value !== '' && s.value !== null && s.value !== undefined
      );
    },
    runRemainingSec() {
      if (!this.activeRun) return 0;
      const elapsed = (Date.now() - this.activeRun.startedAt) / 1000;
      return Math.max(0, Math.ceil(this.activeRun.totalSec - elapsed));
    },
    runProgressPercent() {
      if (!this.activeRun || !this.activeRun.totalSec) return 0;
      const elapsed = (Date.now() - this.activeRun.startedAt) / 1000;
      return Math.min(100, (elapsed / this.activeRun.totalSec) * 100);
    },
  },

  watch: {
    scriptSite() {
      this.loadScripts();
      this.refreshActiveRun();
    },
  },

  async mounted() {
    await this.loadInitialData();
    // F8: default del sitio del generador + primera carga de guiones.
    if (this.siteOptions.length && !this.scriptSite) {
      this.scriptSite = this.siteOptions[0];
    }
    await this.loadScripts();
    await this.refreshActiveRun();
    // Tick de 1s para el conteo regresivo del guion activo.
    this.runTickTimer = setInterval(() => { if (this.activeRun) this.$forceUpdate(); }, 1000);
  },

  beforeDestroy() {
    if (this.runPollTimer) { clearTimeout(this.runPollTimer); this.runPollTimer = null; }
    if (this.runTickTimer) { clearInterval(this.runTickTimer); this.runTickTimer = null; }
  },

  methods: {
    familyOf(device) {
      const prefix = device.siteId ? device.siteId + '-' : '';
      const role = device.name && device.name.startsWith(prefix)
        ? device.name.slice(prefix.length)
        : device.name || '';
      return role.startsWith('ELTEK') ? 'ELTEK' : role;
    },

    async loadInitialData() {
      this.loading = true;
      this.loadError = null;

      const headers = { headers: { token: this.$store.state.auth.token } };

      try {
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
          return;
        }

        // Burst inmediato: reset de todos los devices para que las tarjetas
        // muestren valores sin esperar el próximo ciclo de publicación.
        this.devices.forEach(d => {
          this.$axios.post('/simulator/reset', { dId: d.dId }, headers)
            .catch(err => console.warn('[Simulator] reset burst error:', err.message));
        });

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

    // ── Generador de escenarios (DEC-REF-100 D-8 · F8) ─────────────
    async loadScripts() {
      if (!this.scriptSite) { this.scripts = []; return; }
      try {
        const res = await this.$axios.get('/simulator/scripts', {
          headers: { token: this.$store.state.auth.token },
          params: { siteId: this.scriptSite },
        });
        this.scripts = res.data.data || [];
      } catch (err) {
        console.warn('[Simulator] loadScripts error:', err.message || err);
      }
    },

    // Estado del reloj del servidor: ¿hay guion activo en este sitio?
    async refreshActiveRun() {
      try {
        const res = await this.$axios.get('/simulator/scripts/active', {
          headers: { token: this.$store.state.auth.token },
        });
        const runs = res.data.data || [];
        this.activeRun = runs.find(r => r.siteId === this.scriptSite) || null;
      } catch (err) {
        console.warn('[Simulator] refreshActiveRun error:', err.message || err);
      }
      // Polling de 2s solo mientras haya guion activo en el sitio.
      if (this.runPollTimer) { clearTimeout(this.runPollTimer); this.runPollTimer = null; }
      if (this.activeRun) {
        this.runPollTimer = setTimeout(() => this.refreshActiveRun(), 2000);
      }
    },

    stepVariables(dId) {
      const d = this.devices.find(x => x.dId === dId);
      return (d && d.templateWidgets) || [];
    },
    stepWidget(step) {
      return this.stepVariables(step.dId).find(w => w.variable === step.variable) || null;
    },
    onStepDeviceChange(step) {
      step.variable = '';
      step.value = '';
    },
    addStep() {
      const last = this.scriptDraft.steps[this.scriptDraft.steps.length - 1];
      const firstDevice = this.scriptSiteDevices[0];
      this.scriptDraft.steps.push({
        atSec: last ? last.atSec + 5 : 0,
        dId: last ? last.dId : (firstDevice ? firstDevice.dId : ''),
        variable: '',
        value: '',
      });
    },
    castStepValue(step) {
      const w = this.stepWidget(step);
      if (!w) return step.value;
      if (w.variableType === 'bool') return !!step.value;
      if (w.variableType === 'int') return parseInt(step.value, 10);
      if (w.variableType === 'float') return parseFloat(step.value);
      return String(step.value);
    },

    openScriptEditor(script) {
      if (script) {
        this.scriptEditingId = script._id;
        this.scriptDraft = {
          name: script.name,
          description: script.description || '',
          cleanup: script.cleanup || 'reset',
          steps: JSON.parse(JSON.stringify(script.steps || [])),
        };
      } else {
        this.scriptEditingId = null;
        this.scriptDraft = { name: '', description: '', cleanup: 'reset', steps: [] };
        this.addStep();
      }
      this.scriptEditorOpen = true;
    },

    // "Clonar y editar" del catálogo (F8): los pasos del escenario
    // pre-grabado ({at: ms, set: {var: valor}}) se expanden a pasos de
    // guion apuntando al equipo elegido en la tarjeta, y el guion queda
    // editable (puede sumar otros equipos del sitio).
    onCloneScenario({ scenario, dId, siteId }) {
      const steps = [];
      for (const s of (scenario.steps || [])) {
        for (const [variable, value] of Object.entries(s.set || {})) {
          steps.push({ atSec: Math.round(s.at / 1000), dId, variable, value });
        }
      }
      steps.sort((a, b) => a.atSec - b.atSec);
      if (siteId) this.scriptSite = siteId;
      this.scriptEditingId = null;
      this.scriptDraft = {
        name: `${scenario.name} (copia)`,
        description: scenario.description || '',
        cleanup: scenario.noCleanup ? 'hold' : 'reset',
        steps,
      };
      this.scriptEditorOpen = true;
      this.$notify({
        type: 'info',
        icon: 'tim-icons icon-check-2',
        message: `Escenario "${scenario.name}" clonado al editor — ajustalo y guardalo como guion del sitio.`,
      });
    },

    async saveScript() {
      if (!this.scriptDraftValid || this.savingScript) return;
      this.savingScript = true;
      const headers = { headers: { token: this.$store.state.auth.token } };
      const body = {
        name: this.scriptDraft.name,
        description: this.scriptDraft.description,
        siteId: this.scriptSite,
        cleanup: this.scriptDraft.cleanup,
        steps: this.scriptDraft.steps
          .map(s => ({ atSec: Number(s.atSec), dId: s.dId, variable: s.variable, value: this.castStepValue(s) }))
          .sort((a, b) => a.atSec - b.atSec),
      };
      try {
        const res = this.scriptEditingId
          ? await this.$axios.put(`/simulator/scripts/${this.scriptEditingId}`, body, headers)
          : await this.$axios.post('/simulator/scripts', body, headers);
        if (res.data.status === 'success') {
          this.$notify({
            type: 'success',
            icon: 'tim-icons icon-check-2',
            message: this.scriptEditingId ? '¡Guion actualizado!' : '¡Guion creado!',
          });
          this.scriptEditorOpen = false;
          await this.loadScripts();
        }
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || 'Error guardando el guion',
        });
      } finally {
        this.savingScript = false;
      }
    },

    async runScript(script) {
      try {
        const headers = { headers: { token: this.$store.state.auth.token } };
        await this.$axios.post(`/simulator/scripts/${script._id}/run`, null, headers);
        this.$notify({ type: 'success', icon: 'tim-icons icon-triangle-right-17', message: `Guion "${script.name}" en marcha` });
        await this.refreshActiveRun();
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || 'Error ejecutando el guion',
        });
      }
    },

    async stopScript() {
      if (!this.activeRun) return;
      try {
        const headers = { headers: { token: this.$store.state.auth.token } };
        await this.$axios.post(`/simulator/scripts/${this.activeRun.scriptId}/stop`, null, headers);
        this.$notify({ type: 'info', icon: 'tim-icons icon-button-pause', message: 'Guion detenido — los valores quedan como están' });
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || 'Error deteniendo el guion',
        });
      } finally {
        await this.refreshActiveRun();
      }
    },

    async duplicateScript(script) {
      try {
        const headers = { headers: { token: this.$store.state.auth.token } };
        await this.$axios.post(`/simulator/scripts/${script._id}/duplicate`, null, headers);
        await this.loadScripts();
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || 'Error duplicando el guion',
        });
      }
    },

    async deleteScript(script) {
      try {
        await MessageBox.confirm(`¿Borrar el guion "${script.name}"?`, 'Confirmar', {
          confirmButtonText: 'Borrar',
          cancelButtonText: 'Cancelar',
          type: 'warning',
        });
      } catch { return; }
      try {
        const headers = { headers: { token: this.$store.state.auth.token } };
        await this.$axios.delete(`/simulator/scripts/${script._id}`, headers);
        this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message: 'Guion borrado' });
        await this.loadScripts();
      } catch (err) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: err.response?.data?.error || 'Error borrando el guion',
        });
      }
    },

    scriptDurationLabel(script) {
      const total = Math.max(0, ...(script.steps || []).map(s => s.atSec || 0));
      if (total < 60) return `${total}s`;
      return `${Math.floor(total / 60)}m${total % 60 ? ' ' + (total % 60) + 's' : ''}`;
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

.section-title {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 1.2rem 0 0.8rem;
  color: rgba(255, 255, 255, 0.9);
}

.section-title i {
  margin-right: 0.5rem;
  color: #e14eca;
}

.site-filter {
  width: 100%;
  margin-bottom: 0.5rem;
}

/* ── Generador de escenarios (DEC-REF-100 D-8 · F8) ── */
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
.scenarios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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
}
.script-card {
  cursor: default;
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
.script-actions {
  display: flex;
  gap: 0.2rem;
  flex-shrink: 0;
}
.script-step-row {
  display: flex;
  gap: 0.6rem;
  align-items: flex-end;
  padding: 0.5rem;
  margin-bottom: 0.4rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.step-field label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
  display: block;
}
.step-at     { width: 90px; flex-shrink: 0; }
.step-device { flex: 1.2; min-width: 0; }
.step-var    { flex: 1.4; min-width: 0; }
.step-value  { width: 120px; flex-shrink: 0; }
.step-remove { flex-shrink: 0; }
</style>
