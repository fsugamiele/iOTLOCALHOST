<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" class="d-flex justify-content-between align-items-center">
            <div>
              <h3 class="card-title mb-1">{{ packId }}</h3>
              <p class="text-muted mb-0" v-if="pack">
                {{ pack.description || 'sin descripción' }}
              </p>
            </div>
            <base-button type="secondary" size="sm" @click="goBack">
              <i class="tim-icons icon-minimal-left"></i> Volver
            </base-button>
          </div>

          <p v-if="loading" class="text-muted">Cargando...</p>

          <template v-else-if="pack">
            <div class="row">
              <div class="col-md-3">
                <strong>deviceType:</strong> {{ pack.deviceType }}
              </div>
              <div class="col-md-2">
                <strong>version:</strong> {{ pack.version }}
              </div>
              <div class="col-md-2">
                <strong>canary:</strong>
                <span
                  class="badge"
                  :class="pack.canary ? 'badge-warning' : 'badge-secondary'"
                >
                  {{ pack.canary ? 'canary' : 'prod' }}
                </span>
              </div>
              <div class="col-md-5">
                <strong>actualizado:</strong> {{ formatDate(pack.updatedAt) }}
              </div>
            </div>

            <hr />

            <!-- SF-7 parte 2 · DEC-REF-66 — banner ámbar a nivel de página
                 con las warnings devueltas por el 200 del último PUT
                 (config semánticamente muerta detectada por validateC).
                 Sobrevive al cierre del modal y refleja el estado actual
                 del pack: el save handler lo re-asigna en cada PUT
                 (limpio → banner vacío; con avisos → banner actualizado).
                 La × permite descartar manualmente. -->
            <div v-if="saveWarnings.length" class="alert alert-warning">
              <button
                type="button"
                class="close"
                @click="saveWarnings = []"
                aria-label="Close"
              >×</button>
              <strong>Advertencias de configuración del pack:</strong>
              <ul class="mb-0 mt-2">
                <li v-for="(w, i) in saveWarnings" :key="i">{{ w }}</li>
              </ul>
            </div>

            <div class="d-flex justify-content-between align-items-center mb-3">
              <h4 class="mb-0">Reglas ({{ (pack.rules || []).length }})</h4>
              <base-button type="primary" size="sm" @click="openNewRule">
                <i class="tim-icons icon-simple-add"></i> Nueva regla
              </base-button>
            </div>

            <base-table
              v-if="(pack.rules || []).length > 0"
              :data="pack.rules"
              :columns="['ruleId', 'label', 'type', 'severity', 'variable', 'cooldownSec', 'acciones']"
              thead-classes="text-primary"
            >
              <template slot-scope="{ row, index }">
                <td>{{ row.ruleId }}</td>
                <td>{{ row.label }}</td>
                <td>{{ row.type }}</td>
                <td>
                  <span class="badge" :class="severityBadge(row.severity)">
                    {{ row.severity }}
                  </span>
                </td>
                <td>{{ row.variable }}</td>
                <td>{{ row.cooldownSec }}</td>
                <td>
                  <base-button
                    type="info"
                    size="sm"
                    @click="openEditRule(index)"
                    title="Editar regla"
                  >
                    <i class="tim-icons icon-pencil"></i>
                  </base-button>
                  <base-button
                    type="danger"
                    size="sm"
                    @click="openDeleteRule(index)"
                    title="Borrar regla"
                  >
                    <i class="tim-icons icon-simple-remove"></i>
                  </base-button>
                </td>
              </template>
            </base-table>

            <p v-else class="text-muted">
              Este pack no tiene reglas todavía. Usá "Nueva regla" para agregarlas.
            </p>
          </template>
        </card>
      </div>
    </div>

    <!-- MODAL: form de regla (nueva o edición) -->
    <el-dialog
      :title="ruleModalTitle"
      :visible.sync="ruleModal"
      width="720px"
      :close-on-click-modal="false"
    >
      <template v-if="ruleDraft">
        <!-- SF-7 parte 2 · DEC-REF-66.a/.b — mini-forms C y S incorporados
             (R23). El stub anterior "edición en roadmap futuro" queda
             obsoleto: ahora los 4 types se editan con paridad. -->
        <div class="row">
          <div class="col-md-4">
            <label>ruleId <span class="text-danger">*</span></label>
            <base-input
              v-model="ruleDraft.ruleId"
              placeholder="cummins-A0-oil-pressure-low"
              :disabled="editingIndex !== null"
            />
          </div>
          <div class="col-md-4">
            <label>label <span class="text-danger">*</span></label>
            <base-input v-model="ruleDraft.label" placeholder="Presión de aceite baja" />
          </div>
          <div class="col-md-4">
            <label>inferenceId <span class="text-danger">*</span></label>
            <base-input v-model="ruleDraft.inferenceId" placeholder="A0" />
          </div>
        </div>

        <div class="row">
          <div class="col-md-3">
            <label>type <span class="text-danger">*</span></label>
            <select v-model="ruleDraft.type" class="form-control">
              <option value="D">D (umbral)</option>
              <option value="cross">cross (árbol)</option>
              <option value="C">C (autocalibrado)</option>
              <option value="S">S (ventana)</option>
            </select>
          </div>
          <div class="col-md-3">
            <label>severity <span class="text-danger">*</span></label>
            <select v-model="ruleDraft.severity" class="form-control">
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
          </div>
          <div class="col-md-3">
            <label>deviceType <span class="text-danger">*</span></label>
            <!-- S6 — el deviceType de la REGLA también es referencia a ficha
                 (DEC-REF-91 adenda #60: 2ª superficie de texto libre; la 3ª,
                 CrossExprNode, sigue fuera de la rebanada). Default: la ficha
                 del pack (emptyRule). Mismo patrón que el selector de pack
                 (index.vue, S5). -->
            <el-select
              v-model="ruleDraft.deviceType"
              class="select-primary"
              style="width:100%"
              filterable
              :disabled="sheets.length === 0"
            >
              <el-option
                v-for="s in sheets"
                :key="s.deviceType"
                :label="s.manufacturer ? `${s.deviceType} — ${s.manufacturer} ${s.model || ''}`.trim() : s.deviceType"
                :value="s.deviceType"
              />
            </el-select>
            <small v-if="sheets.length === 0" class="text-warning">
              No hay fichas de equipo cargadas (o no se pudieron cargar).
            </small>
          </div>
          <div class="col-md-3">
            <label>variable <span class="text-danger">*</span></label>
            <!-- S6 — variables de la ficha del deviceType elegido en la regla.
                 Estricto cuando la ficha declara variables (decisión Franco,
                 #70); texto libre cuando no — espejo del criterio de warnings
                 del backend (rulepacks.js: una ficha con variables:[] no
                 tiene contra qué validar). -->
            <el-select
              v-if="draftVariables.length > 0"
              v-model="ruleDraft.variable"
              placeholder="Elegir variable de la ficha"
              class="select-primary"
              style="width:100%"
              filterable
            >
              <el-option
                v-for="v in draftVariables"
                :key="v.name"
                :label="v.label ? `${v.name} — ${v.label}` : v.name"
                :value="v.name"
              />
            </el-select>
            <base-input v-else v-model="ruleDraft.variable" placeholder="oil_pressure" />
            <small v-if="ruleSheet && draftVariables.length === 0" class="text-warning">
              La ficha {{ ruleDraft.deviceType }} no declara variables — texto libre.
            </small>
          </div>
        </div>

        <div class="row">
          <div class="col-md-4">
            <label>cooldownSec</label>
            <base-input v-model.number="ruleDraft.cooldownSec" type="number" />
          </div>
          <div class="col-md-4" v-if="ruleDraft.type === 'cross'">
            <label>graceSec</label>
            <base-input v-model.number="ruleDraft.graceSec" type="number" />
          </div>
        </div>

        <!-- typeD → condition simple -->
        <div v-if="ruleDraft.type === 'D'" class="mt-3">
          <h5>Condición</h5>
          <div class="row">
            <div class="col-md-4">
              <label>op</label>
              <select
                class="form-control"
                :value="(ruleDraft.condition || {}).op || 'gt'"
                @change="setConditionField('op', $event.target.value)"
              >
                <option value="lt">lt</option>
                <option value="lte">lte</option>
                <option value="gt">gt</option>
                <option value="gte">gte</option>
                <option value="eq">eq</option>
                <option value="neq">neq</option>
              </select>
            </div>
            <div class="col-md-4">
              <label>value</label>
              <base-input
                type="number"
                :value="(ruleDraft.condition || {}).value !== undefined ? ruleDraft.condition.value : ''"
                @input="setConditionField('value', numericOrRaw($event))"
              />
            </div>
          </div>
        </div>

        <!-- typecross → CrossExprNode -->
        <div v-else-if="ruleDraft.type === 'cross'" class="mt-3">
          <h5>Árbol crossExpr</h5>
          <p class="text-muted small">
            Grupos AND/OR y hojas de equipo. Límite de profundidad: 8
            (validateCrossTree en el backend). La hoja de suma se
            activa en SF-6.
          </p>
          <cross-expr-node
            v-if="ruleDraft.crossExpr"
            :value="ruleDraft.crossExpr"
            :depth="0"
            :max-depth="8"
            :is-root="true"
            @input="ruleDraft.crossExpr = $event"
          />
        </div>

        <!-- typeC → setpointSource + flags EDGE-2 + condition (DEC-REF-66.a) -->
        <div v-else-if="ruleDraft.type === 'C' && ruleDraft.setpointSource && ruleDraft.condition" class="mt-3">
          <h5>Autocalibrado (typeC)</h5>
          <div class="row">
            <div class="col-md-6">
              <label>setpointSource.variable <span class="text-danger">*</span></label>
              <base-input
                v-model="ruleDraft.setpointSource.variable"
                placeholder="key de siteState, ej: setpoint_oil_pressure"
              />
            </div>
            <div class="col-md-3">
              <label>fallbackToD</label>
              <div>
                <base-checkbox v-model="ruleDraft.fallbackToD">
                  Fallback a umbral fijo si falta setpoint
                </base-checkbox>
              </div>
            </div>
            <div class="col-md-3">
              <label>on_missing_ref</label>
              <select v-model="ruleDraft.on_missing_ref" class="form-control">
                <option value="ignore">ignore</option>
                <option value="alarm">alarm</option>
              </select>
            </div>
          </div>

          <p class="text-muted small mt-3 mb-2">
            Umbral de respaldo — lo exige el backend si Fallback está activo o al faltar referencia se alarma.
          </p>
          <div class="row">
            <div class="col-md-4">
              <label>condition.op</label>
              <select
                class="form-control"
                :value="(ruleDraft.condition || {}).op || 'gt'"
                @change="setConditionField('op', $event.target.value)"
              >
                <option value="lt">lt</option>
                <option value="lte">lte</option>
                <option value="gt">gt</option>
                <option value="gte">gte</option>
                <option value="eq">eq</option>
                <option value="neq">neq</option>
              </select>
            </div>
            <div class="col-md-4">
              <label>condition.value</label>
              <base-input
                type="number"
                :value="(ruleDraft.condition || {}).value !== undefined ? ruleDraft.condition.value : ''"
                @input="setConditionField('value', numericOrRaw($event))"
              />
            </div>
            <div class="col-md-4">
              <label
                title="Minutos consecutivos sin setpoint antes de escalar el aviso de configuración de INFO a ATENCIÓN. Escala la notificación de 'falta referencia', no la alarma operativa del equipo. Vacío = escalada desactivada."
              >
                escalateAfterMinutes
                <i class="tim-icons icon-alert-circle-exc"></i>
              </label>
              <base-input
                type="number"
                placeholder="vacío = desactivado"
                :value="ruleDraft.escalateAfterMinutes !== null && ruleDraft.escalateAfterMinutes !== undefined ? ruleDraft.escalateAfterMinutes : ''"
                @input="setEscalateAfterMinutes($event)"
              />
            </div>
          </div>
        </div>

        <!-- typeS → window (durationSec, countThreshold, matchCondition) (DEC-REF-66.b) -->
        <div v-else-if="ruleDraft.type === 'S' && ruleDraft.window" class="mt-3">
          <h5>Ventana (typeS)</h5>
          <div class="row">
            <div class="col-md-4">
              <label>window.durationSec <span class="text-danger">*</span></label>
              <base-input
                type="number"
                v-model.number="ruleDraft.window.durationSec"
              />
            </div>
            <div class="col-md-4">
              <label>window.countThreshold <span class="text-danger">*</span></label>
              <base-input
                type="number"
                v-model.number="ruleDraft.window.countThreshold"
              />
            </div>
          </div>

          <h6 class="mt-3">matchCondition</h6>
          <div class="row">
            <div class="col-md-4">
              <label>op</label>
              <select
                class="form-control"
                :value="((ruleDraft.window || {}).matchCondition || {}).op || 'gt'"
                @change="setWindowConditionField('op', $event.target.value)"
              >
                <option value="lt">lt</option>
                <option value="lte">lte</option>
                <option value="gt">gt</option>
                <option value="gte">gte</option>
                <option value="eq">eq</option>
                <option value="neq">neq</option>
              </select>
            </div>
            <div class="col-md-4">
              <label>value</label>
              <base-input
                type="number"
                :value="(((ruleDraft.window || {}).matchCondition || {}).value !== undefined ? ruleDraft.window.matchCondition.value : '')"
                @input="setWindowConditionField('value', numericOrRaw($event))"
              />
            </div>
          </div>
        </div>

      </template>

      <div slot="footer">
        <base-button type="secondary" @click="closeRuleModal">Cancelar</base-button>
        <base-button
          type="primary"
          @click="submitRule"
          :disabled="saving || !isRuleReady"
        >
          {{ saving ? 'Guardando...' : (editingIndex !== null ? 'Guardar cambios' : 'Agregar regla') }}
        </base-button>
      </div>
    </el-dialog>

    <!-- MODAL: borrar regla (confirmación simple, sin fricción de escritura —
         menor riesgo que borrar pack porque son parte del mismo pack que
         el usuario ya sabe que está editando). -->
    <el-dialog
      title="Borrar regla"
      :visible.sync="deleteRuleModal"
      width="400px"
      :close-on-click-modal="false"
    >
      <p v-if="deleteRuleTargetRuleId">
        Borrar regla <code>{{ deleteRuleTargetRuleId }}</code> del pack
        <code>{{ packId }}</code>? El motor edge recargará al guardar.
      </p>
      <div slot="footer">
        <base-button type="secondary" @click="deleteRuleModal = false">Cancelar</base-button>
        <base-button
          type="danger"
          @click="confirmDeleteRule"
          :disabled="saving"
        >
          {{ saving ? 'Guardando...' : 'Borrar regla' }}
        </base-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import CrossExprNode, { stripEditorKeys } from '@/components/CrossExprNode.vue';

// SF-5 Capa 3 · DEC-REF-62.d/e + DEC-REF-62-A — edición de reglas del
// pack + revalidación /me al mount (esta página gana superficie de
// escritura, por lo que adopta la misma revalidación fresca que el
// índice — DEC-REF-62-A).
//
// Guardado: el pack COMPLETO viaja por PUT canónico (SF-1 escribe pack
// entero, coherente). Version se auto-incrementa client-side en cada
// save de reglas — patrón "el pack cambió → version sube", cero
// fricción para el usuario, el número refleja cuántas ediciones tuvo.
// Los seeds hardcodean version manualmente; acá se automatiza porque
// no hay operador humano midiendo bumps.
//
// Types D y cross: edición completa. Types C y S: read-only con nota
// visible — el schema requiere config específica (setpointSource
// completo con register/scale/variable + flags EDGE-2 para C; window
// con durationSec/countThreshold/matchCondition para S) que amerita
// mini-forms propios; se defiere a roadmap futuro. Registrado como
// decisión tomada, no silenciado.
//
// S6 (#70) — los campos deviceType y variable de la regla dejan de ser
// texto libre: deviceType es selector de fichas (DEC-REF-91 adenda #60)
// y variable es selector estricto de las variables declaradas por la
// ficha elegida, con fallback a texto libre cuando la ficha no declara
// variables (decisión Franco, espejo del criterio de warnings del
// backend). CrossExprNode sigue fuera de la rebanada (alcance -91).

export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'rulepacks-detail',
  components: { CrossExprNode },
  data() {
    return {
      loading: true,
      pack: null,
      // Form modal
      ruleModal: false,
      ruleDraft: null,      // regla que se está editando/creando
      editingIndex: null,   // null = new, número = índice de la regla en pack.rules
      saving: false,
      // Delete rule modal
      deleteRuleModal: false,
      deleteRuleTargetIndex: null,
      // SF-7 parte 2 · DEC-REF-66 — warnings no bloqueantes que el
      // backend devuelve en el 200 del PUT (validateC ADVERTENCIAS de
      // config semánticamente muerta). Se muestran como banner ámbar
      // in-form; no bloquean el save.
      saveWarnings: [],
      // S6 — catálogo de fichas (lectura global D-1) para los selectores
      // de deviceType y variable del editor de reglas. Misma fuente que
      // el selector de pack (index.vue, S5).
      sheets: []
    };
  },
  computed: {
    packId() {
      return this.$route.params.packId;
    },
    ruleModalTitle() {
      if (this.editingIndex !== null) return 'Editar regla';
      return 'Nueva regla';
    },
    deleteRuleTargetRuleId() {
      if (this.deleteRuleTargetIndex === null || !this.pack) return '';
      const r = this.pack.rules[this.deleteRuleTargetIndex];
      return r ? r.ruleId : '';
    },
    // S6 — índice de fichas por deviceType para el editor de reglas.
    sheetByType() {
      const m = {};
      for (const s of this.sheets) m[s.deviceType] = s;
      return m;
    },
    // Ficha del deviceType elegido EN LA REGLA (no necesariamente la del
    // pack: una regla cross puede apuntar a otro equipo del sitio).
    ruleSheet() {
      if (!this.ruleDraft) return null;
      return this.sheetByType[this.ruleDraft.deviceType] || null;
    },
    // Variables declaradas por esa ficha. Vacío ⇒ el editor cae a texto
    // libre (una ficha con variables:[] no tiene contra qué validar —
    // mismo criterio que los warnings del backend, rulepacks.js).
    draftVariables() {
      return (this.ruleSheet && this.ruleSheet.variables) || [];
    },
    isRuleReady() {
      const r = this.ruleDraft;
      if (!r) return false;
      // Comunes obligatorios
      if (!r.ruleId || !r.label || !r.inferenceId) return false;
      if (!r.deviceType || !r.variable) return false;
      if (!r.severity || !r.type) return false;
      // typeD requiere condition.op y condition.value
      if (r.type === 'D') {
        if (!r.condition || !r.condition.op) return false;
        if (r.condition.value === '' || r.condition.value === null || r.condition.value === undefined) return false;
      }
      // typecross requiere crossExpr con forma mínima
      if (r.type === 'cross') {
        if (!r.crossExpr) return false;
      }
      // SF-7 parte 2 · DEC-REF-66.a — typeC: mínimos no-vacíos (setpointSource
      // existe + condition.op presente). La validación real la hace validateC
      // en el backend con warnings (DEC-REF-66-C: no clonar el contrato).
      if (r.type === 'C') {
        if (!r.setpointSource) return false;
        if (!r.condition || !r.condition.op) return false;
      }
      // SF-7 parte 2 · DEC-REF-66.b — typeS: window.durationSec > 0,
      // countThreshold >= 1, matchCondition.op presente.
      if (r.type === 'S') {
        if (!r.window) return false;
        if (!(r.window.durationSec > 0)) return false;
        if (!(r.window.countThreshold >= 1)) return false;
        if (!r.window.matchCondition || !r.window.matchCondition.op) return false;
      }
      return true;
    }
  },
  async mounted() {
    // DEC-REF-62-A — revalidación al mount también en el detalle
    // (adoptada al ganar la Capa 3 el editor).
    const ok = await this.revalidateSuperadmin();
    if (!ok) return;
    await this.loadPack();
    this.loadSheets();
  },
  methods: {
    // S6 — catálogo de fichas para los selectores del editor. Lectura
    // global (D-1). Si falla, deviceType queda deshabilitado y variable
    // cae a texto libre (draftVariables = []), con aviso visible.
    async loadSheets() {
      try {
        const res = await this.$axios.get('/equipmentsheet', {
          headers: { token: this.$store.state.auth.token }
        });
        this.sheets = res.data?.data || [];
      } catch (e) {
        this.sheets = [];
        this.$notify({
          type: 'warning',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error cargando fichas de equipo'
        });
      }
    },
    async revalidateSuperadmin() {
      try {
        const res = await this.$axios.get('/me', {
          headers: { token: this.$store.state.auth.token }
        });
        const grants = res.data?.data?.grants || [];
        const stillSuperadmin = grants.some(g => g.role === 'superadmin');
        if (!stillSuperadmin) {
          this.$notify({
            type: 'warning',
            icon: 'tim-icons icon-alert-circle-exc',
            message: 'Rol superadmin revocado. Redirigiendo al dashboard.'
          });
          this.$router.push('/dashboard');
          return false;
        }
        return true;
      } catch (e) {
        this.$router.push('/login');
        return false;
      }
    },
    async loadPack() {
      this.loading = true;
      try {
        const res = await this.$axios.get(
          `/rulepacks/${encodeURIComponent(this.packId)}`,
          { headers: { token: this.$store.state.auth.token } }
        );
        this.pack = res.data?.data || null;
      } catch (e) {
        const status = e.response?.status;
        const msg = e.response?.data?.error || 'Error cargando pack';
        this.$notify({
          type: status === 404 ? 'warning' : 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: msg
        });
        this.$router.push('/rulepacks');
      } finally {
        this.loading = false;
      }
    },
    goBack() {
      this.$router.push('/rulepacks');
    },
    formatDate(value) {
      if (!value) return '';
      const d = new Date(value);
      return d.toLocaleString();
    },
    severityBadge(sev) {
      if (sev === 'critical') return 'badge-danger';
      if (sev === 'warning')  return 'badge-warning';
      return 'badge-info';
    },
    isEditableType(t) {
      return t === 'D' || t === 'cross';
    },
    numericOrRaw(v) {
      if (v === '' || v === null || v === undefined) return '';
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    },
    emptyRule() {
      return {
        ruleId: '',
        label: '',
        inferenceId: '',
        type: 'D',
        severity: 'warning',
        deviceType: this.pack ? this.pack.deviceType : '',
        variable: '',
        cooldownSec: 300,
        graceSec: 0,
        condition: { op: 'gt', value: 0 },
        crossExpr: null
      };
    },
    openNewRule() {
      this.editingIndex = null;
      this.ruleDraft = this.emptyRule();
      this.ruleModal = true;
    },
    openEditRule(index) {
      this.editingIndex = index;
      // Copia profunda para no mutar la fuente hasta guardar.
      const original = this.pack.rules[index];
      const copy = JSON.parse(JSON.stringify(original));
      this.ruleDraft = copy;
      // Asegurar shape para types editables (D/cross intactos + C/S nuevos).
      // ensureShapeForType usa this.$set porque en Vue 2 los sub-objetos
      // agregados post-data() no son reactivos sin él.
      if (copy.type === 'D' && !copy.condition) {
        this.$set(this.ruleDraft, 'condition', { op: 'gt', value: 0 });
      }
      if (copy.type === 'cross' && !copy.crossExpr) {
        this.$set(this.ruleDraft, 'crossExpr', { op: 'AND', children: [] });
      }
      this.ensureShapeForType(copy.type);
      this.ruleModal = true;
    },
    closeRuleModal() {
      this.ruleModal = false;
      this.ruleDraft = null;
      this.editingIndex = null;
    },
    // SF-7 parte 2 · DEC-REF-66.a/.b — asegura los sub-objetos que los
    // mini-forms C y S bindean. $set obligatorio en Vue 2 (los campos
    // agregados post-creación no son reactivos sin él). No pisa valores
    // existentes: solo inicializa si el sub-objeto/flag falta.
    ensureShapeForType(type) {
      const r = this.ruleDraft;
      if (!r) return;
      if (type === 'C') {
        if (!r.setpointSource) this.$set(r, 'setpointSource', { variable: '' });
        if (r.fallbackToD === undefined) this.$set(r, 'fallbackToD', true);
        if (!r.on_missing_ref) this.$set(r, 'on_missing_ref', 'ignore');
        if (r.escalateAfterMinutes === undefined) this.$set(r, 'escalateAfterMinutes', null);
        if (!r.condition) this.$set(r, 'condition', { op: 'gt', value: 0 });
      }
      if (type === 'S') {
        if (!r.window) {
          this.$set(r, 'window', { durationSec: 60, countThreshold: 1, matchCondition: { op: 'gt', value: 0 } });
        } else if (!r.window.matchCondition) {
          this.$set(r.window, 'matchCondition', { op: 'gt', value: 0 });
        }
      }
    },
    setConditionField(field, value) {
      const cond = { ...(this.ruleDraft.condition || {}), [field]: value };
      this.$set(this.ruleDraft, 'condition', cond);
    },
    // SF-7 parte 2 · DEC-REF-66.b — espejo de setConditionField pero
    // sobre el path window.matchCondition. $set garantiza reactividad si
    // window o matchCondition faltaran (defensivo — normalmente
    // ensureShapeForType('S') ya los inicializó).
    setWindowConditionField(field, value) {
      if (!this.ruleDraft.window) {
        this.$set(this.ruleDraft, 'window', { durationSec: 0, countThreshold: 0, matchCondition: { op: 'gt', value: 0 } });
      }
      const mc = { ...(this.ruleDraft.window.matchCondition || {}), [field]: value };
      this.$set(this.ruleDraft.window, 'matchCondition', mc);
    },
    // Helper para escalateAfterMinutes: '' o valor no numérico → null
    // (schema default es null; opt-in EDGE-2 requiere número > 0).
    setEscalateAfterMinutes(value) {
      if (value === '' || value === null || value === undefined) {
        this.$set(this.ruleDraft, 'escalateAfterMinutes', null);
        return;
      }
      const n = Number(value);
      this.$set(this.ruleDraft, 'escalateAfterMinutes', Number.isFinite(n) ? n : null);
    },
    // Cuando el usuario cambia type, ajustar shape.
    // Watchers Vue no juegan bien con select v-model (Vue actualiza
    // antes de reactivar), así que hago la lógica en watch.
    async submitRule() {
      if (!this.isRuleReady) return;
      this.saving = true;
      try {
        // Preparar la regla final: strip de crossExpr keys si es cross,
        // limpiar campos irrelevantes según type.
        const finalRule = JSON.parse(JSON.stringify(this.ruleDraft));
        if (finalRule.type === 'D') {
          finalRule.crossExpr = null;
          delete finalRule.graceSec;
        } else if (finalRule.type === 'cross') {
          finalRule.crossExpr = stripEditorKeys(finalRule.crossExpr);
          finalRule.condition = null;
        }

        // Construir el pack nuevo (immutable): bump de version + rules
        // con la modificada.
        const nextRules = (this.pack.rules || []).slice();
        if (this.editingIndex !== null) {
          nextRules[this.editingIndex] = finalRule;
        } else {
          nextRules.push(finalRule);
        }
        await this.savePack(nextRules, this.editingIndex !== null ? 'edit' : 'add');
        this.closeRuleModal();
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error guardando regla'
        });
      } finally {
        this.saving = false;
      }
    },
    openDeleteRule(index) {
      this.deleteRuleTargetIndex = index;
      this.deleteRuleModal = true;
    },
    async confirmDeleteRule() {
      if (this.deleteRuleTargetIndex === null) return;
      this.saving = true;
      try {
        const nextRules = this.pack.rules.slice();
        nextRules.splice(this.deleteRuleTargetIndex, 1);
        await this.savePack(nextRules, 'delete');
        this.deleteRuleModal = false;
        this.deleteRuleTargetIndex = null;
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error borrando regla'
        });
      } finally {
        this.saving = false;
      }
    },
    async savePack(nextRules, actionLabel) {
      // Version auto-incrementada: cada save de reglas bumpea el
      // contador. Coherente con "el pack cambió → version sube".
      const nextVersion = (this.pack.version || 1) + 1;
      const packBody = {
        packId: this.packId,
        deviceType: this.pack.deviceType,
        version: nextVersion,
        description: this.pack.description || '',
        canary: !!this.pack.canary,
        rules: nextRules
      };
      const res = await this.$axios.put(
        `/rulepacks/${encodeURIComponent(this.packId)}`,
        { rulepack: packBody },
        { headers: { token: this.$store.state.auth.token } }
      );
      // SF-7 parte 2 · DEC-REF-66 — warnings del validator viajan en el 200.
      // Se pintan como banner ámbar in-form; no bloquean el save (el pack
      // ya está guardado en Mongo y el edge recargó).
      this.saveWarnings = (res.data && res.data.warnings) || [];
      const msgs = {
        add: 'Regla agregada',
        edit: 'Regla actualizada',
        delete: 'Regla borrada'
      };
      this.$notify({
        type: 'success',
        icon: 'tim-icons icon-check-2',
        message: `${msgs[actionLabel]} (v${res.data.version}). El motor edge recargó (SF-3).`
      });
      // Refrescar el pack desde el server.
      await this.loadPack();
    }
  },
  watch: {
    // S6 — al cambiar el deviceType de la regla, la variable elegida puede
    // quedar fuera de la ficha nueva: se resetea SOLO si la ficha nueva
    // declara variables y la actual no está entre ellas (si no declara,
    // el campo es texto libre y cualquier valor es válido). El guard de
    // oldType evita disparar en la apertura del modal (draft null→objeto).
    'ruleDraft.deviceType'(newType, oldType) {
      if (!this.ruleDraft || newType === oldType) return;
      if (oldType === undefined || oldType === '') return;
      const vars = this.draftVariables;
      if (vars.length > 0 && !vars.some(v => v.name === this.ruleDraft.variable)) {
        this.ruleDraft.variable = '';
      }
    },
    // Cuando el usuario cambia type en el form, ajustar shape del
    // draft para que los inputs relevantes tengan defaults.
    'ruleDraft.type'(newType, oldType) {
      if (!this.ruleDraft || newType === oldType) return;
      if (newType === 'D' && !this.ruleDraft.condition) {
        this.$set(this.ruleDraft, 'condition', { op: 'gt', value: 0 });
      }
      if (newType === 'cross' && !this.ruleDraft.crossExpr) {
        this.$set(this.ruleDraft, 'crossExpr', { op: 'AND', children: [] });
      }
      // SF-7 parte 2 · DEC-REF-66.a/.b — asegurar shape de C y S al
      // cambiar de tipo (no pisa valores existentes; solo inicializa
      // sub-objetos si faltan).
      if (newType === 'C' || newType === 'S') {
        this.ensureShapeForType(newType);
      }
    }
  }
};
</script>
