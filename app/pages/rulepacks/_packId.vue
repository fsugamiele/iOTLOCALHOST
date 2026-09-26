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

            <!-- DEC-REF-114 (#83, B1) — página de 3 zonas: lista de cards +
                 editor-frase inline. El "Modo experto" (modal ruleDraft, abajo)
                 se conserva para cross/C/S y parámetros finos. -->
            <div class="rules-layout">
              <!-- Zona izquierda: cards -->
              <div class="rules-list">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <h4 class="mb-0">Reglas ({{ (pack.rules || []).length }})</h4>
                  <base-button v-if="!editorOpen" type="primary" size="sm" @click="openSentenceNew">
                    <i class="tim-icons icon-simple-add"></i> Nueva regla
                  </base-button>
                </div>

                <rule-card
                  v-for="(row, index) in (pack.rules || [])"
                  :key="row.ruleId + '-' + index"
                  :rule="row"
                  :index="index"
                  :sheets="sheets"
                  @edit="onCardEdit"
                  @delete="openDeleteRule"
                />

                <p v-if="!(pack.rules || []).length" class="text-muted">
                  Este pack no tiene reglas todavía. Usá "Nueva regla" para empezar.
                </p>
              </div>

              <!-- Zona derecha: editor-frase inline -->
              <div class="rules-editor">
                <card v-if="editorOpen">
                  <sentence-editor
                    :pack="pack"
                    :sheets="sheets"
                    :rule="editorRule"
                    :editing-index="editorIndex"
                    @save="onSentenceSave"
                    @cancel="onSentenceCancel"
                  />
                </card>
                <div v-else class="rules-editor__empty text-muted">
                  <i class="tim-icons icon-bulb-63" style="font-size:1.6rem"></i>
                  <p class="mt-2">Elegí <b>Nueva regla</b> o editá una para configurarla acá.</p>
                </div>
              </div>
            </div>
          </template>
        </card>
      </div>
    </div>

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
import { Dialog } from 'element-ui';
import { stripEditorKeys } from '@/components/CrossExprNode.vue';
import RuleCard from '@/components/rules/RuleCard.vue';           // DEC-REF-114 (#83, B1)
import SentenceEditor from '@/components/rules/SentenceEditor.vue';

// DEC-REF-100 D-7 (F6) — capa de presentación del wizard: mismos labels que
// OPERATOR_LABELS del backend (api/models/rule_definition.js — la identidad
// interna lt/gt/... NO se toca; esto es solo idioma de usuario, mismo
// criterio que fichas.vue).
const OPERATOR_LABELS = {
  gt: 'mayor que', gte: 'mayor o igual que',
  lt: 'menor que', lte: 'menor o igual que',
  eq: 'igual a',   neq: 'distinto de',
};
const WIZ_OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];
const WIZ_SEVERITIES = [
  { value: 'info',     label: 'Informativa', help: 'Queda registrada, sin urgencia' },
  { value: 'warning',  label: 'Atención',    help: 'Hay que revisarlo pronto' },
  { value: 'critical', label: 'Crítica',     help: 'Requiere acción inmediata' },
];
const WIZ_STEP_NAMES = ['Equipo', 'Variable', 'Condición', 'Aviso'];

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
  components: { [Dialog.name]: Dialog, RuleCard, SentenceEditor },
  data() {
    return {
      loading: true,
      pack: null,
      // Form modal
      ruleModal: false,
      ruleDraft: null,      // regla que se está editando/creando (Modo experto)
      editingIndex: null,   // null = new, número = índice de la regla en pack.rules
      saving: false,
      // DEC-REF-114 (#83, B1) — editor-frase inline (type D).
      editorOpen: false,
      editorRule: null,     // regla D a editar, o null (nueva)
      editorIndex: null,
      // Delete rule modal
      deleteRuleModal: false,
      deleteRuleTargetIndex: null,
      // DEC-REF-100 D-7 (F7): sección "Opciones avanzadas" del formulario
      // clásico. Cerrada por default; se abre sola para C/S/cross (su
      // configuración vive adentro) o al venir del wizard.
      advancedOpen: false,
      // SF-7 parte 2 · DEC-REF-66 — warnings no bloqueantes que el
      // backend devuelve en el 200 del PUT (validateC ADVERTENCIAS de
      // config semánticamente muerta). Se muestran como banner ámbar
      // in-form; no bloquean el save.
      saveWarnings: [],
      // S6 — catálogo de fichas (lectura global D-1) para los selectores
      // de deviceType y variable del editor de reglas. Misma fuente que
      // el selector de pack (index.vue, S5).
      sheets: [],
      // DEC-REF-100 D-7 (F6) — wizard guiado de reglas type D.
      OPERATOR_LABELS,
      WIZ_OPS,
      WIZ_SEVERITIES,
      wizStepNames: WIZ_STEP_NAMES,
      wizardOpen: false,
      wizardStep: 1,
      wizEditingIndex: null, // null = alta; número = edición de regla type D
      wiz: {
        deviceType: '',
        variable: '',
        op: 'lt',
        value: '',
        severity: 'warning',
        recommendation: '',
        label: ''
      }
    };
  },
  computed: {
    packId() {
      return this.$route.params.packId;
    },
    ruleModalTitle() {
      // DEC-REF-100 D-7 (F7): el formulario clásico es el modo avanzado.
      if (this.editingIndex !== null) return 'Editar regla (modo avanzado)';
      return 'Nueva regla (modo avanzado)';
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
    // DEC-REF-100 D-7 (F6) — computeds del wizard (espejo de ruleSheet/
    // draftVariables pero sobre wiz.deviceType).
    wizSheet() {
      return this.sheetByType[this.wiz.deviceType] || null;
    },
    wizVariables() {
      return (this.wizSheet && this.wizSheet.variables) || [];
    },
    wizVariableLabel() {
      const v = this.wizVariables.find(x => x.name === this.wiz.variable);
      return (v && v.label) || this.wiz.variable || 'la variable';
    },
    wizVariableUnit() {
      const v = this.wizVariables.find(x => x.name === this.wiz.variable);
      return (v && v.unit) || '';
    },
    wizStepReady() {
      if (this.wizardStep === 1) return !!this.wiz.deviceType;
      if (this.wizardStep === 2) return !!this.wiz.variable;
      if (this.wizardStep === 3) {
        return this.wiz.value !== '' && this.wiz.value !== null &&
               this.wiz.value !== undefined && Number.isFinite(Number(this.wiz.value));
      }
      return !!this.wiz.label;
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
    // DEC-REF-100 D-7 (F6) — la regla contada en lenguaje de usuario para
    // la tabla legible.
    ruleSentence(r) {
      const varName = r.variableLabel || r.variable || '';
      const unit = r.unit ? ` ${r.unit}` : '';
      if (r.type === 'D' && r.condition) {
        return `${varName} ${OPERATOR_LABELS[r.condition.op] || r.condition.op} ${r.condition.value}${unit}`;
      }
      if (r.type === 'C' && r.setpointSource) {
        return `${varName} contra el setpoint real del equipo (${r.setpointSource.variable || 'auto'})`;
      }
      if (r.type === 'S' && r.window) {
        const mc = r.window.matchCondition;
        const cond = mc ? ` ${OPERATOR_LABELS[mc.op] || mc.op} ${mc.value}${unit}` : '';
        return `${varName}${cond}, ${r.window.countThreshold} veces en ${Math.round((r.window.durationSec || 0) / 60)} min`;
      }
      if (r.type === 'cross') return 'condición combinada entre equipos';
      return varName;
    },
    // ── Wizard guiado (DEC-REF-100 D-7 · F6) ───────────────────────────
    openWizardNew() {
      this.wizEditingIndex = null;
      this.wiz = {
        deviceType: this.pack ? this.pack.deviceType : '',
        variable: '',
        op: 'lt',
        value: '',
        severity: 'warning',
        recommendation: '',
        label: ''
      };
      this.wizardStep = 1;
      this.wizardOpen = true;
    },
    openWizardEdit(index) {
      const r = this.pack.rules[index];
      this.wizEditingIndex = index;
      this.wiz = {
        deviceType: r.deviceType,
        variable: r.variable,
        op: (r.condition && r.condition.op) || 'gt',
        value: r.condition && r.condition.value !== undefined ? r.condition.value : '',
        severity: r.severity || 'warning',
        recommendation: r.recommendation || '',
        label: r.label || ''
      };
      this.wizardStep = 1;
      this.wizardOpen = true;
    },
    slugifyText(s) {
      return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 40) || 'regla';
    },
    // ruleId autogenerado y oculto al usuario: deviceType + slug del label,
    // con sufijo numérico si ya existe en el pack (excluyendo la regla en
    // edición).
    genRuleId() {
      const base = `${this.wiz.deviceType}-${this.slugifyText(this.wiz.label)}`;
      const taken = new Set((this.pack.rules || [])
        .filter((_, i) => i !== this.wizEditingIndex)
        .map(r => r.ruleId));
      let id = base;
      let n = 2;
      while (taken.has(id)) { id = `${base}-${n}`; n++; }
      return id;
    },
    // inferenceId autogenerado: código corto derivado del label.
    genInferenceId() {
      const base = this.slugifyText(this.wiz.label).replace(/-/g, '_').toUpperCase().slice(0, 20) || 'REGLA';
      const taken = new Set((this.pack.rules || [])
        .filter((_, i) => i !== this.wizEditingIndex)
        .map(r => r.inferenceId));
      let id = base;
      let n = 2;
      while (taken.has(id)) { id = `${base}_${n}`; n++; }
      return id;
    },
    buildRuleFromWizard() {
      const existing = this.wizEditingIndex !== null ? this.pack.rules[this.wizEditingIndex] : null;
      const v = this.wizVariables.find(x => x.name === this.wiz.variable);
      const rule = {
        ruleId: existing ? existing.ruleId : this.genRuleId(),
        label: this.wiz.label,
        variableLabel: (v && v.label) || (existing && existing.variableLabel) || '',
        inferenceId: existing ? existing.inferenceId : this.genInferenceId(),
        type: 'D',
        severity: this.wiz.severity,
        recommendation: this.wiz.recommendation || '',
        deviceType: this.wiz.deviceType,
        variable: this.wiz.variable,
        cooldownSec: existing && existing.cooldownSec ? existing.cooldownSec : 300,
        condition: { op: this.wiz.op, value: this.wiz.value === '' ? 0 : Number(this.wiz.value) },
        crossExpr: null
      };
      if ((v && v.unit) || (existing && existing.unit)) rule.unit = (v && v.unit) || existing.unit;
      return rule;
    },
    async submitWizard() {
      if (!this.wizStepReady) return;
      this.ruleDraft = this.buildRuleFromWizard();
      this.editingIndex = this.wizEditingIndex;
      this.wizardOpen = false;
      // Reusa el camino canónico: limpieza por type + savePack con bump
      // de version + recarga del edge (submitRule ya lo hace).
      await this.submitRule();
    },
    // Deriva al formulario clásico conservando lo cargado en el wizard
    // (F7: ahí viven C/S/cross, tiempos y resto de parámetros).
    wizardToAdvanced() {
      this.ruleDraft = this.buildRuleFromWizard();
      this.editingIndex = this.wizEditingIndex;
      this.wizardOpen = false;
      this.ensureShapeForType('D');
      this.advancedOpen = true; // pidió opciones avanzadas: se las muestro
      this.ruleModal = true;
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
        resolveGraceSec: 0,
        condition: { op: 'gt', value: 0 },
        crossExpr: null
      };
    },
    // ── DEC-REF-114 (#83, B1): editor-frase (type D) ──────────────────
    openSentenceNew() {
      this.editorRule = null;
      this.editorIndex = null;
      this.editorOpen = true;
    },
    onCardEdit(index) {
      // B2 (todo inline): el editor-frase maneja D/S/C/cross-plano Y cross
      // anidado (CrossExprNode embebido). Ya no hay modal experto.
      this.editorRule = this.pack.rules[index];
      this.editorIndex = index;
      this.editorOpen = true;
    },
    onCardExpert(index) {
      this.editorOpen = false;
      this.openEditRule(index);   // form experto existente (ruleDraft)
    },
    async onSentenceSave({ rule, index }) {
      // Camino canónico: submitRule limpia por tipo + PUT del pack + bump + reload edge.
      this.ruleDraft = rule;
      this.editingIndex = index;
      this.editorOpen = false;
      await this.submitRule();
    },
    onSentenceCancel() {
      this.editorOpen = false;
      this.editorRule = null;
      this.editorIndex = null;
    },
    onSentenceExpert(rule) {
      // Escala del editor-frase al form completo conservando lo cargado.
      this.ruleDraft = rule;
      this.editingIndex = this.editorIndex;
      this.ensureShapeForType(rule.type || 'D');
      this.advancedOpen = true;
      this.editorOpen = false;
      this.ruleModal = true;
    },
    openNewRule() {
      this.editingIndex = null;
      this.ruleDraft = this.emptyRule();
      this.advancedOpen = false;
      this.ruleModal = true;
    },
    openEditRule(index) {
      // DEC-REF-100 D-7 (F6): las reglas de umbral (type D) se editan en el
      // wizard guiado; C/S/cross van directo al formulario avanzado.
      if (this.pack.rules[index] && this.pack.rules[index].type === 'D') {
        this.openWizardEdit(index);
        return;
      }
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
      // C/S/cross configuran en la sección avanzada: se abre sola (F7).
      this.advancedOpen = copy.type !== 'D';
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
        } else {
          // DEC-REF-102 D-2 — resolveGraceSec no aplica a C/S (C resuelve por
          // setpoint recuperado; S es temporal por su propia ventana).
          delete finalRule.resolveGraceSec;
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
    // DEC-REF-100 D-7 (F6) — mismo reset de variable pero sobre el wizard.
    'wiz.deviceType'(newType, oldType) {
      if (!this.wiz || newType === oldType) return;
      if (oldType === undefined || oldType === '') return;
      const vars = this.wizVariables;
      if (vars.length > 0 && !vars.some(v => v.name === this.wiz.variable)) {
        this.wiz.variable = '';
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
      // F7: la configuración de C/S/cross vive en la sección avanzada —
      // se abre sola para que el usuario no se quede mirando un form
      // vacío tras elegir el tipo.
      if (newType !== 'D') this.advancedOpen = true;
    }
  }
};
</script>

<style>
/* DEC-REF-100 D-7 (F6) — estilos del wizard guiado. No-scoped porque
   el-dialog teletransporta el contenido al body (scoped no aplicaría). */
.wiz-steps {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wiz-step {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #9a9a9a;
}
.wiz-step.active {
  background: #00f2c3;
  color: #fff;
}
.wiz-step.done {
  background: rgba(0, 210, 130, 0.2);
  color: #00d69a;
}
.wiz-sentence {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 15px;
  padding: 14px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}
.wiz-sentence .wiz-op {
  width: 190px;
}
.wiz-sentence .wiz-value {
  width: 110px;
  display: inline-block;
}
.wiz-severities {
  display: flex;
  gap: 12px;
}
.wiz-sev {
  flex: 1;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
}
.wiz-sev.active {
  border-color: #00f2c3;
  background: rgba(225, 78, 202, 0.08);
}
.wiz-sev input[type="radio"] {
  display: none;
}
/* F7 — sección "Opciones avanzadas" del formulario clásico de reglas */
.adv-toggle {
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  padding: 8px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.adv-toggle i {
  margin-right: 8px;
}
.adv-body {
  padding: 6px 4px 0;
  border-left: 2px solid rgba(225, 78, 202, 0.35);
  margin-left: 4px;
  padding-left: 14px;
}

/* DEC-REF-112 — modo claro */
.white-content .wiz-step { background: rgba(0, 0, 0, 0.06); color: #525f7f; }
.white-content .wiz-sentence { background: rgba(0, 0, 0, 0.03); }

/* DEC-REF-114 (#83, B1) — página de 3 zonas (cards | editor) */
.rules-layout { display: flex; gap: 20px; align-items: flex-start; }
.rules-list { flex: 1 1 42%; min-width: 0; }
.rules-editor { flex: 1 1 58%; min-width: 0; }
.rules-editor__empty {
  border: 1px dashed rgba(0, 0, 0, 0.12); border-radius: 10px;
  padding: 28px; text-align: center;
}
body:not(.white-content) .rules-editor__empty { border-color: rgba(255, 255, 255, 0.12); }
@media (max-width: 991px) { .rules-layout { flex-direction: column; } .rules-list, .rules-editor { flex-basis: auto; width: 100%; } }
</style>
