<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <!-- Pantalla de tarjetas y pantalla del editor (propuesta aprobada 2026-10-19):
               "Volver a las reglas" sale del editor a las tarjetas; "Volver a los equipos"
               sale de las tarjetas a la lista de packs. El editor se refleja en ?regla=
               (el botón Atrás del navegador también vuelve a las tarjetas). -->
          <div slot="header" class="rp-head">
            <div class="rp-head__l">
              <nav class="rp-crumb" aria-label="Ubicación">
                <a href="#" @click.prevent="goBack">Reglas</a>
                <template v-if="pack"> › <a v-if="editorOpen" href="#" @click.prevent="volverAReglas">{{ packKindName }}</a><span v-else>{{ packKindName }}</span></template>
                <template v-if="editorOpen"> › {{ editorTitulo }}</template>
              </nav>
              <h3 class="card-title mb-0">{{ editorOpen ? editorTitulo : (pack ? 'Reglas de ' + packKindName : 'Reglas') }}</h3>
              <p v-if="pack && !editorOpen" class="rp-meta mb-0">
                Versión {{ pack.version }} ·
                <span class="badge" :class="pack.canary ? 'badge-warning' : 'badge-secondary'">{{ pack.canary ? 'en prueba' : 'en uso' }}</span>
                · actualizado {{ formatDate(pack.updatedAt) }}
                <template v-if="resumen.sitios != null"> · se aplica en {{ resumen.sitios === 1 ? '1 sitio' : resumen.sitios + ' sitios' }}</template>
                <template v-if="pack.description"> · {{ pack.description }}</template>
              </p>
            </div>
            <div class="rp-head__r">
              <template v-if="!editorOpen">
                <label v-if="pack" class="pack-switch" :title="packEnabled ? 'Reglas en circulación — clic para sacar de circulación TODAS las reglas de este equipo' : 'Reglas fuera de circulación — clic para reactivarlas'">
                  <input type="checkbox" :checked="packEnabled" @change="onTogglePack($event.target.checked)">
                  <span class="pack-sl"></span>
                  <span class="pack-switch__lbl">{{ packEnabled ? 'reglas activas' : 'reglas fuera de circulación' }}</span>
                </label>
                <base-button type="secondary" size="sm" @click="goBack">
                  <i class="tim-icons icon-minimal-left"></i> Volver a los equipos
                </base-button>
                <base-button v-if="pack" type="primary" size="sm" @click="openSentenceNew">
                  <i class="tim-icons icon-simple-add"></i> Nueva regla
                </base-button>
              </template>
              <base-button v-else type="secondary" size="sm" @click="volverAReglas">
                <i class="tim-icons icon-minimal-left"></i> Volver a las reglas
              </base-button>
            </div>
          </div>

          <p v-if="loading" class="text-muted">Cargando...</p>

          <template v-else-if="pack">
            <!-- SF-7 parte 2 · DEC-REF-66 — banner ámbar con las warnings del último PUT. -->
            <div v-if="saveWarnings.length" class="alert alert-warning">
              <button
                type="button"
                class="close"
                @click="saveWarnings = []"
                aria-label="Close"
              >×</button>
              <strong>Advertencias de configuración:</strong>
              <ul class="mb-0 mt-2">
                <li v-for="(w, i) in saveWarnings" :key="i">{{ w }}</li>
              </ul>
            </div>

            <!-- ═══ TARJETAS (pantalla completa) ═══ -->
            <div v-if="!editorOpen">
              <section class="rp-tiles" aria-label="Estado ahora">
                <button v-for="t in tiles" :key="t.k" type="button" class="rp-tile" :class="{ on: filtroEstado === t.k }" @click="filtroEstado = t.k">
                  <span class="rp-tile__lab"><i :class="'rp-dot rp-dot--' + t.k"></i>{{ t.lab }}</span>
                  <span class="rp-tile__n">{{ t.n }}</span>
                </button>
              </section>

              <div class="rp-tools">
                <div class="rp-tools__l">
                  <label for="rp-q" class="sr-only">Buscar regla</label>
                  <input id="rp-q" v-model="busqueda" class="form-control rp-q" placeholder="Buscar por nombre o medición">
                  <div class="rp-seg" role="group" aria-label="Gravedad">
                    <button v-for="g in GRAVEDADES" :key="g.v" type="button" :class="['sev-' + g.v, { on: filtroGrav === g.v }]" @click="filtroGrav = g.v">{{ g.t }}</button>
                  </div>
                </div>
                <span class="text-muted small">{{ tarjetas.length }} de {{ (pack.rules || []).length }} reglas</span>
              </div>

              <div class="rp-grid">
                <rule-card
                  v-for="t in tarjetas"
                  :key="t.rule.ruleId + '-' + t.index"
                  :rule="t.rule"
                  :index="t.index"
                  :sheets="sheets"
                  :ahora="estadoDe(t.rule) === 'off' ? null : (ahoraByRule[t.rule.ruleId] || null)"
                  :ultima="ultimaDe(t.rule)"
                  @edit="onCardEdit"
                  @delete="openDeleteRule"
                  @toggle="onToggleRule"
                />
              </div>

              <p v-if="!(pack.rules || []).length" class="text-muted text-center py-4">
                Este equipo no tiene reglas todavía. Usá "Nueva regla" para empezar.
              </p>
              <p v-else-if="!tarjetas.length" class="text-muted text-center py-4">
                Ninguna regla coincide con el filtro. <a href="#" @click.prevent="limpiarFiltros">Ver todas</a>
              </p>
            </div>

            <!-- ═══ EDITOR (pantalla completa) ═══ -->
            <template v-else>
              <!-- spec_editor_reglas_v2 — editor v2. El anterior queda como respaldo (Qi4): reglas
                   que v2 no representa ("N veces en T", desbalance, grupos anidados, sumas) o si se
                   elige "usar el editor anterior". -->
              <div v-if="useV2">
                <rule-editor-v2
                  ref="editorV2"
                  :key="'v2-' + editorSeq"
                  :pack="pack"
                  :sheets="sheets"
                  :rule="editorRule"
                  :editing-index="editorIndex"
                  :save-fn="saveFromV2"
                  @cancel="volverAReglas"
                />
                <p class="text-right mb-0 mt-2"><a href="#" class="small text-muted" @click.prevent="editorV1 = true">Usar el editor anterior</a></p>
              </div>
              <div v-else>
                <p v-if="editorRule && !v2Representa" class="small text-muted">Esta regla usa una forma que el editor nuevo todavía no muestra; se edita con el editor anterior.</p>
                <sentence-editor
                  :pack="pack"
                  :sheets="sheets"
                  :rule="editorRule"
                  :editing-index="editorIndex"
                  @save="onSentenceSave"
                  @cancel="volverAReglas"
                />
              </div>
            </template>
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
        ¿Borrar la regla <b>{{ deleteRuleTargetLabel }}</b>? Los equipos la dejan de vigilar apenas se guarda.
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
import { deviceTypeName, summarize, fillThresholdText } from '@/components/rules/ruleSentence.js';
import RuleEditorV2 from '@/components/rules/RuleEditorV2.vue';   // spec_editor_reglas_v2
import { ruleToModel } from '@/components/rules/ruleModelV2.js';

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
  components: { [Dialog.name]: Dialog, RuleCard, SentenceEditor, RuleEditorV2 },
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
      editorV1: false,
      editorSeq: 0,
      // Pantalla de tarjetas: filtros y datos del resumen (último aviso, sitios).
      filtroEstado: 'todas', filtroGrav: 'todas', busqueda: '',
      resumen: { sitios: null, ultimo: null, noAplica: {} },
      GRAVEDADES: [{ v: 'todas', t: 'Todas' }, { v: 'critical', t: 'Crítica' }, { v: 'warning', t: 'Advertencia' }, { v: 'info', t: 'Informativa' }],         // clave del editor v2: cambia solo al abrirlo (no al guardar)
      ahoraByRule: {},      // spec_editor_reglas_v2 (Qi2) — resumen "Ahora" por regla      // spec_editor_reglas_v2 (Qi4) — forzar el editor anterior
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
    // keep-alive: esta instancia es de UNA ruta; queda fija aunque la ruta global cambie
    // (si no, en segundo plano consulta con el parámetro de otra página → 404 / datos ajenos).
    packId() {
      if (this._paramFijo === undefined) this._paramFijo = this.$route.params.packId;
      return this._paramFijo;
    },
    // DEC-REF-121 — enabled !== false (pack histórico sin el campo = en circulación).
    packEnabled() {
      return !this.pack || this.pack.enabled !== false;
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
    deleteRuleTargetLabel() {
      const r = this.pack && this.deleteRuleTargetIndex !== null ? this.pack.rules[this.deleteRuleTargetIndex] : null;
      return (r && r.label) || 'sin nombre';
    },
    // spec_editor_reglas_v2 — ¿la regla abierta se puede editar en v2?
    v2Representa() { return !this.editorRule || ruleToModel(this.editorRule, this.pack) !== null; },
    useV2() { return !this.editorV1 && this.v2Representa; },
    // Nombre del tipo de equipo en palabras (nunca el código técnico).
    packKindName() { return this.pack ? deviceTypeName(this.pack.deviceType, this.sheets) : ''; },
    editorTitulo() {
      if (!this.editorRule) return 'Nueva regla';
      return `Editar «${fillThresholdText(this.editorRule.label, this.editorRule, this.sheets) || 'regla sin nombre'}»`;
    },
    tiles() {
      const rules = (this.pack && this.pack.rules) || [];
      const n = (k) => rules.filter(r => this.estadoDe(r) === k).length;
      return [
        { k: 'todas', lab: 'Todas', n: rules.length }, { k: 'ala', lab: 'En alarma', n: n('ala') },
        { k: 'obs', lab: 'Observando', n: n('obs') }, { k: 'sin', lab: 'Sin datos', n: n('sin') },
        { k: 'vig', lab: 'Vigilando', n: n('vig') }, { k: 'off', lab: 'Apagadas', n: n('off') },
      ];
    },
    // Tarjetas filtradas y ordenadas: primero lo que necesita atención.
    tarjetas() {
      const ORD = { ala: 0, obs: 1, sin: 2, vig: 3, off: 4 };
      const q = this.busqueda.trim().toLowerCase();
      return ((this.pack && this.pack.rules) || [])
        .map((rule, index) => ({ rule, index, e: this.estadoDe(rule) }))
        .filter(t => (this.filtroEstado === 'todas' || t.e === this.filtroEstado)
          && (this.filtroGrav === 'todas' || t.rule.severity === this.filtroGrav)
          && (!q || this.textoBusqueda(t.rule).includes(q)))
        .sort((a, b) => (ORD[a.e] - ORD[b.e]) || (a.index - b.index));
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
      // C2 — con "umbral de la ficha" (limitRef) o referencia (ref) no lleva value.
      if (r.type === 'D') {
        if (!r.condition || !r.condition.op) return false;
        const c = r.condition;
        if (!c.limitRef && !c.ref && (c.value === '' || c.value === null || c.value === undefined)) return false;
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
    this.iniciarAhora();
    this.abrirDesdeRuta();
  },
  // Atrás del navegador / "Volver a las reglas": si el editor tiene cambios sin guardar, pregunta.
  beforeRouteUpdate(to, from, next) {
    if (from.query.regla && !to.query.regla) {
      if (this.hayCambiosSinGuardar() && !window.confirm('Hay cambios sin guardar en la regla. ¿Salir igual?')) return next(false);
      this._editorPush = false;
      this.onSentenceCancel();
    }
    next();
    this.$nextTick(() => this.abrirDesdeRuta());
  },
  beforeDestroy() { clearInterval(this._ahoraI); },
  // keep-alive: una pestaña de pack que queda en segundo plano deja de consultar "Ahora".
  // (Antes seguía consultando con el packId de la ruta actual y las reglas de SU pack → 404.)
  deactivated() { clearInterval(this._ahoraI); this._ahoraI = null; },
  // keep-alive (layouts/default.vue): al VOLVER a esta pestaña no corre mounted();
  // se recargan los datos para no mostrar valores viejos (ej. ficha editada en otra).
  // El primer activated() viene pegado al mount → se saltea con _kaSeen.
  activated() {
    if (!this._kaSeen) { this._kaSeen = true; return; }
    this.iniciarAhora();
    if (this.editorOpen || this.ruleModal || this.wizardOpen || this.saving) return;
    this.loadPack();
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
    openSentenceNew(desdeRuta) {
      this.editorRule = null;
      this.editorIndex = null;
      this.editorSeq++;
      this.editorV1 = false;
      this.editorOpen = true;
      if (desdeRuta !== true) this.abrirEditorEnRuta(null);
    },
    onCardEdit(index, desdeRuta) {
      // B2 (todo inline): el editor-frase maneja D/S/C/cross-plano Y cross
      // anidado (CrossExprNode embebido). Ya no hay modal experto.
      this.editorRule = this.pack.rules[index];
      this.editorIndex = index;
      this.editorSeq++;
      this.editorV1 = false;
      this.editorOpen = true;
      if (desdeRuta !== true) this.abrirEditorEnRuta(index);
    },
    onCardExpert(index) {
      this.editorOpen = false;
      this.limpiarRutaEditor();
      this.openEditRule(index);   // form experto existente (ruleDraft)
    },
    async onSentenceSave({ rule, index }) {
      // Camino canónico: submitRule limpia por tipo + PUT del pack + bump + reload edge.
      this.ruleDraft = rule;
      this.editingIndex = index;
      this.editorOpen = false;
      this.limpiarRutaEditor();
      await this.submitRule();
    },
    // spec_editor_reglas_v2 — guardado desde el editor v2: mismo PUT del pack; devuelve si se guardó
    // (el editor pasa a mostrar "Ahora").
    // spec_editor_reglas_v2 (Qi2) — resumen "Ahora" de cada tarjeta (etapa de sus instancias).
    iniciarAhora() {
      clearInterval(this._ahoraI);
      this.cargarAhoraLista();
      this.cargarResumen();
      let n = 0;
      this._ahoraI = setInterval(() => { this.cargarAhoraLista(); if (++n % 4 === 0) this.cargarResumen(); }, 15000);
    },
    async cargarResumen() {
      if (!this.pack || document.hidden || this.pack.packId !== this.packId) return;
      try {
        const res = await this.$axios.get(`/rulepacks/${encodeURIComponent(this.pack.packId)}/summary`, { headers: { token: this.$store.state.auth.token } });
        const d = (res.data && res.data.data) || {};
        this.resumen = { sitios: d.sitios != null ? d.sitios : null, ultimo: d.ultimo || {}, noAplica: d.noAplica || {} };
      } catch (e) { /* sin dato: las tarjetas no muestran el último aviso */ }
    },
    estadoDe(r) {
      if (r.enabled === false || !this.packEnabled) return 'off';
      const a = this.ahoraByRule[r.ruleId];
      return a && ['ala', 'obs', 'sin'].includes(a.cls) ? a.cls : 'vig';
    },
    ultimaDe(r) {
      if (!this.resumen.ultimo) return null;
      const u = this.resumen.ultimo[r.ruleId];
      let txt;
      if (!u) txt = 'sin avisos en 30 días';
      else {
        const s = Math.max(0, Math.round((Date.now() - u.ts) / 1000));
        const hace = s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} días`;
        txt = `último aviso hace ${hace}`;
      }
      // spec_perfiles_controladora (Qp4) — equipos cuya controladora no tiene la medición.
      const na = (this.resumen.noAplica || {})[r.ruleId];
      if (na && na.length) txt += ` · no aplica en ${na.length === 1 ? na[0].name || na[0].dId : na.length + ' equipos'} (su controladora no mide ${[...new Set(na.map(x => x.variable))].join(', ')})`;
      return txt;
    },
    textoBusqueda(r) {
      let sum = '';
      try { sum = summarize(r, { sheets: this.sheets }) || ''; } catch (e) { /* sin resumen */ }
      return `${fillThresholdText(r.label, r, this.sheets) || ''} ${r.variable || ''} ${sum}`.toLowerCase();
    },
    limpiarFiltros() { this.filtroEstado = 'todas'; this.filtroGrav = 'todas'; this.busqueda = ''; },
    // ── navegación tarjetas ⇄ editor (?regla=<índice>|nueva) ──
    abrirEditorEnRuta(index) {
      const regla = index === null || index === undefined ? 'nueva' : String(index);
      if (this.$route.query.regla === regla) return;
      this._editorPush = true;
      this.$router.push({ query: { ...this.$route.query, regla } }).catch(() => {});
    },
    hayCambiosSinGuardar() {
      const ed = this.$refs.editorV2;
      return !!(this.editorOpen && ed && typeof ed.hayCambios === 'function' && ed.hayCambios());
    },
    volverAReglas() {
      if (this.$route.query.regla) {
        // Si el editor se abrió desde las tarjetas, Atrás vuelve a esa misma entrada del historial.
        if (this._editorPush) { this.$router.back(); return; }
        const q = { ...this.$route.query }; delete q.regla;
        this.$router.replace({ query: q }).catch(() => {});
        return;
      }
      if (this.hayCambiosSinGuardar() && !window.confirm('Hay cambios sin guardar en la regla. ¿Salir igual?')) return;
      this.onSentenceCancel();
    },
    abrirDesdeRuta() {
      const r = this.$route.query.regla;
      if (!r || !this.pack) return;
      if (r === 'nueva') { if (!this.editorOpen) this.openSentenceNew(true); return; }
      const i = Number(r);
      if (Number.isInteger(i) && this.pack.rules && this.pack.rules[i]) { if (!this.editorOpen || this.editorIndex !== i) this.onCardEdit(i, true); }
      else { const q = { ...this.$route.query }; delete q.regla; this.$router.replace({ query: q }).catch(() => {}); }
    },
    async cargarAhoraLista() {
      // Se consulta con el packId del pack cargado (no el de la ruta): reglas y pack siempre coinciden.
      if (!this.pack || document.hidden || this.pack.packId !== this.packId) return;
      const packId = this.pack.packId;
      const rules = (this.pack.rules || []).slice(0, 40);
      const out = {};
      await Promise.all(rules.map(async (r) => {
        try {
          const res = await this.$axios.get(`/rulepacks/${encodeURIComponent(packId)}/rules/${encodeURIComponent(r.ruleId)}/now`, { headers: { token: this.$store.state.auth.token } });
          const inst = ((res.data && res.data.data && res.data.data.instances) || []);
          const n = (steps) => inst.filter(x => steps.includes(x.step)).length;
          const eq = (k) => (k === 1 ? '1 equipo' : `${k} equipos`);
          if (n(['E3', 'E4', 'E6'])) out[r.ruleId] = { texto: `En alarma · ${eq(n(['E3', 'E4', 'E6']))}`, cls: 'ala', detalle: 'Hay alarmas abiertas de esta regla' };
          else if (n(['E2'])) out[r.ruleId] = { texto: `Observando · ${eq(n(['E2']))}`, cls: 'obs', detalle: 'Se cumple; avisa si sigue así el tiempo de espera' };
          else if (n(['E5'])) out[r.ruleId] = { texto: `Sin datos · ${eq(n(['E5']))}`, cls: 'sin', detalle: 'No llega la medición' };
          else out[r.ruleId] = { texto: 'Vigilando', cls: 'vig', detalle: 'Ningún equipo cumple las condiciones ahora' };
        } catch (e) { /* sin dato: la tarjeta no muestra el resumen */ }
      }));
      this.ahoraByRule = out;
    },
    async saveFromV2(rule, index) {
      this.saving = true;
      try {
        const nextRules = (this.pack.rules || []).slice();
        if (index !== null && index !== undefined) nextRules[index] = rule; else nextRules.push(rule);
        await this.savePack(nextRules, index !== null && index !== undefined ? 'edit' : 'add');
        // El editor sigue abierto ("Ahora" / seguir editando): queda apuntando a la regla recién
        // guardada, así un segundo guardado la actualiza en vez de agregarla de nuevo.
        const i = (this.pack.rules || []).findIndex(r => r.ruleId === rule.ruleId);
        if (i >= 0) { this.editorIndex = i; this.editorRule = this.pack.rules[i]; }
        return true;
      } catch (e) {
        this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: (e.response && e.response.data && e.response.data.error) || 'No se pudo guardar la regla' });
        return false;
      } finally { this.saving = false; }
    },
    // El editor se cerró por otro camino (guardado v1, modo experto): saca ?regla de la URL.
    limpiarRutaEditor() {
      if (!this.$route.query.regla) return;
      this._editorPush = false;
      const q = { ...this.$route.query }; delete q.regla;
      this.$router.replace({ query: q }).catch(() => {});
    },
    onSentenceCancel() {
      this.editorV1 = false;
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
      this.limpiarRutaEditor();
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
      // Nunca volver en silencio: el editor ya se cerró y el usuario cree que guardó.
      if (!this.isRuleReady) {
        this.$notify({
          type: 'warning',
          icon: 'tim-icons icon-alert-circle-exc',
          message: 'No se guardó: faltan datos de la regla (id, nombre, inferencia, equipo, variable o condición).'
        });
        return;
      }
      this.saving = true;
      try {
        // Preparar la regla final: strip de crossExpr keys si es cross,
        // limpiar campos irrelevantes según type.
        const finalRule = JSON.parse(JSON.stringify(this.ruleDraft));
        if (finalRule.type === 'D') {
          finalRule.crossExpr = null;   // D no usa crossExpr
        } else if (finalRule.type === 'cross') {
          finalRule.crossExpr = stripEditorKeys(finalRule.crossExpr);
          finalRule.condition = null;   // cross evalúa por crossExpr, no por condition
        }
        // DEC-REF-126 — NO se borran graceSec/resolveGraceSec: son inocuos para esos
        // tipos (el motor no los consume) pero borrarlos mutaba la regla al guardar
        // y rompía la idempotencia del round-trip del editor.

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
    // DEC-REF-121 (spec_interruptor_enabled) — interruptor on/off QUIRÚRGICO: PATCH de
    // un solo booleano, NO pasa por savePack/editor (que reescribe la regla entera y la
    // corrompería). El motor edge recarga (SF-3) y cierra limpio la alarma si estaba activa.
    async onToggleRule({ index, enabled }) {
      const rule = this.pack && this.pack.rules[index];
      if (!rule) return;
      try {
        await this.$axios.patch(
          `/rulepacks/${encodeURIComponent(this.packId)}/rules/${encodeURIComponent(rule.ruleId)}/enabled`,
          { enabled },
          { headers: { token: this.$store.state.auth.token } }
        );
        this.$notify({
          type: 'success', icon: 'tim-icons icon-check-2',
          message: `Regla ${enabled ? 'puesta en circulación' : 'sacada de circulación'}. El motor edge recargó (SF-3).`
        });
        await this.loadPack();
      } catch (e) {
        this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: 'No se pudo cambiar el estado de la regla.' });
      }
    },
    async onTogglePack(enabled) {
      try {
        await this.$axios.patch(
          `/rulepacks/${encodeURIComponent(this.packId)}/enabled`,
          { enabled },
          { headers: { token: this.$store.state.auth.token } }
        );
        this.$notify({
          type: 'success', icon: 'tim-icons icon-check-2',
          message: `Pack ${enabled ? 'puesto en circulación' : 'sacado de circulación'}. El motor edge recargó (SF-3).`
        });
        await this.loadPack();
      } catch (e) {
        this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: 'No se pudo cambiar el estado del pack.' });
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
        message: `${msgs[actionLabel]}. Los equipos ya la aplican.`
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
/* Pantalla de tarjetas (propuesta aprobada 2026-10-19) */
.rp-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
.rp-head__l { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rp-head__r { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.rp-head__r .btn { margin: 0; }
.rp-crumb { font-size: .78rem; opacity: .75; }
.rp-crumb a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.rp-meta { font-size: .82rem; opacity: .75; }
.rp-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.rp-tile { font: inherit; text-align: left; cursor: pointer; border: 1px solid rgba(0,0,0,.1); border-radius: 12px; padding: 10px 14px; background: transparent; color: inherit; display: flex; flex-direction: column; gap: 2px; min-height: 68px; }
.rp-tile.on { border-color: #00bf9a; box-shadow: 0 0 0 1px #00bf9a inset; }
.rp-tile__lab { display: flex; align-items: center; gap: 8px; font-size: .8rem; font-weight: 600; opacity: .8; }
.rp-tile__n { font-size: 1.6rem; font-weight: 700; line-height: 1.1; }
.rp-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: #9aa5a2; }
.rp-dot--ala { background: #d93a46; } .rp-dot--obs { background: #e8b730; } .rp-dot--sin { background: #9aa5a2; }
.rp-dot--vig { background: #1f8a5b; } .rp-dot--off { background: #c3ccd6; } .rp-dot--todas { background: #00bf9a; }
.rp-tools { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.rp-tools__l { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.rp-q { width: 280px; max-width: 100%; }
.rp-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid rgba(0,0,0,.15); border-radius: 999px; overflow: hidden; }
.rp-seg button { font: inherit; font-size: 13px; font-weight: 600; padding: 7px 14px; border: 0; background: transparent; color: inherit; opacity: .8; min-height: 38px; cursor: pointer; }
.rp-seg button.on { opacity: 1; background: #00bf9a; color: #062019; }
.rp-seg button.on.sev-info { background: #3b82c4; color: #fff; }
.rp-seg button.on.sev-warning { background: #e8b730; color: #2a1f00; }
.rp-seg button.on.sev-critical { background: #d93a46; color: #fff; }
.rp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }
@media (max-width: 480px) { .rp-grid { grid-template-columns: minmax(0, 1fr); } }
body:not(.white-content) .rp-tile { border-color: rgba(255,255,255,.12); }
body:not(.white-content) .rp-seg { border-color: rgba(255,255,255,.18); }

/* DEC-REF-121 — kill-switch del pack */
.pack-switch { position: relative; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; margin: 0; }
.pack-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.pack-switch .pack-sl { position: relative; display: inline-block; width: 40px; height: 22px; background: #c3ccd6; border-radius: 999px; transition: .2s; flex: 0 0 auto; }
.pack-switch .pack-sl::before { content: ""; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.pack-switch input:checked + .pack-sl { background: #00997e; }
.pack-switch input:checked + .pack-sl::before { transform: translateX(18px); }
.pack-switch__lbl { font-size: .72rem; text-transform: uppercase; letter-spacing: .03em; opacity: .7; }
</style>
