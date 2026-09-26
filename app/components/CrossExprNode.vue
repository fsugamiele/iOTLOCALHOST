<template>
  <!-- DEC-REF-114 (#83) — editor visual de condiciones combinadas (crossExpr).
       Rediseño de PRESENTACIÓN (Franco #83, híbrido "B-compacto"):
         · raíz  = tarjeta con encabezado de color pleno (teal=Y / ámbar=O)
         · anida = riel de color + badge (no acumula cajas al profundizar)
       La hoja usa los MISMOS selects de ficha que el modo simple (equipo y
       variable salen de las equipmentsheets). Lenguaje de operador, sin jerga.
       El CONTRATO de datos (nodo que entra/sale, stripEditorKeys, maxDepth)
       queda idéntico al original DEC-REF-62/63/65 — sin riesgo de regresión. -->
  <div class="cn" :class="[isRoot ? 'cn--root' : 'cn--sub', opClass]">

    <!-- ══════════ GRUPO LÓGICO (Y / O) ══════════ -->
    <div v-if="isLogical" class="cn-group" :class="isRoot ? 'cn-group--root' : 'cn-group--sub'">
      <div class="cn-ghead">
        <span v-if="isRoot" class="cn-banner">Se dispara cuando {{ opWord }}</span>
        <span v-else class="cn-chip" :class="opClass"><span class="cn-dot"></span>{{ opChip }}</span>

        <span class="cn-seg" role="group" aria-label="conector lógico">
          <button type="button" class="y" :class="{ on: nodeType === 'AND' }" @click="setGroupOp('AND')">TODAS</button>
          <button type="button" class="o" :class="{ on: nodeType === 'OR' }" @click="setGroupOp('OR')">CUALQUIERA</button>
        </span>

        <base-button v-if="!isRoot" type="danger" size="sm" class="cn-rm-group" @click="$emit('remove')" title="Quitar este grupo">
          <i class="tim-icons icon-simple-remove"></i>
        </base-button>
      </div>

      <div class="cn-gbody">
        <div v-for="(child, i) in localChildren" :key="child.__editorKey" class="cn-child">
          <cross-expr-node
            :value="child"
            :depth="depth + 1"
            :max-depth="maxDepth"
            :sheets="sheets"
            @input="onChildInput(i, $event)"
            @remove="onChildRemove(i)"
          />
        </div>

        <p v-if="localChildren.length === 0" class="cn-empty">
          <i class="fa fa-info-circle"></i> Este grupo está vacío — agregá al menos una condición.
        </p>

        <div class="cn-actions">
          <base-button type="primary" size="sm" @click="addLeafDevice">
            <i class="tim-icons icon-simple-add"></i> condición
          </base-button>
          <base-button
            type="default" size="sm"
            :disabled="depth + 1 >= maxDepth"
            @click="addLogicalGroup"
            :title="depth + 1 >= maxDepth ? 'Llegaste al máximo de anidamiento' : 'Combiná varias condiciones bajo su propia lógica Y/O'"
          >
            <i class="tim-icons icon-vector"></i> agrupar condiciones
          </base-button>
          <base-button type="default" size="sm" class="cn-sumbtn" @click="addLeafSum" title="Sumar una medición entre varios equipos del sitio">
            Σ sumar entre equipos
          </base-button>
        </div>

        <p v-if="localChildren.length" class="cn-hint">{{ opHint }}</p>
      </div>
    </div>

    <!-- ══════════ HOJA: CONDICIÓN DE UN EQUIPO ══════════ -->
    <div v-else-if="isLeafDevice" class="cn-leaf">
      <el-select
        v-if="sheets.length"
        :value="value.deviceType || ''" size="small" filterable class="select-info cn-equipo"
        placeholder="equipo" @change="onLeafEquipo"
      >
        <el-option v-for="s in sheets" :key="s.deviceType" :value="s.deviceType" :label="s.deviceType" />
      </el-select>
      <el-input v-else :value="value.deviceType || ''" size="small" class="cn-equipo" placeholder="equipo" @input="onLeafEquipo" />

      <el-select
        v-if="leafVariables.length"
        :value="value.variable || ''" size="small" filterable class="select-info cn-var"
        placeholder="variable" @change="onLeafVariable"
      >
        <el-option v-for="v in leafVariables" :key="v.name" :value="v.name" :label="varLabel(v)" />
      </el-select>
      <el-input v-else :value="value.variable || ''" size="small" class="cn-var" placeholder="variable técnica" @input="onLeafVariable" />

      <el-select :value="condOp" size="small" class="select-primary cn-op" @change="updateCondition('op', $event)">
        <el-option v-for="(lbl, op) in OPERATOR_LABELS" :key="op" :value="op" :label="lbl" />
      </el-select>

      <el-select v-if="leafValueType === 'bool'" :value="condValue" size="small" class="cn-val" @change="updateCondition('value', $event)">
        <el-option :value="1" label="verdadero" />
        <el-option :value="0" label="falso" />
      </el-select>
      <el-input
        v-else :value="condValue === undefined ? '' : condValue" size="small" class="cn-val"
        :type="leafValueType === 'categorical' || leafValueType === 'string' ? 'text' : 'number'"
        :placeholder="leafUnit ? ('valor (' + leafUnit + ')') : 'valor'"
        @input="updateCondition('value', numericOrRaw($event))"
      />
      <span v-if="leafUnit" class="cn-unit">{{ leafUnit }}</span>

      <base-button type="danger" size="sm" icon class="cn-rm" @click="$emit('remove')" title="Quitar condición">
        <i class="tim-icons icon-simple-remove"></i>
      </base-button>
    </div>

    <!-- ══════════ HOJA: SUMA ENTRE EQUIPOS ══════════ -->
    <div v-else-if="isSumLeaf" class="cn-sum">
      <div class="cn-sum-head">
        <span class="cn-sum-title">Σ Suma entre equipos</span>
        <base-button type="danger" size="sm" icon class="cn-rm" @click="$emit('remove')" title="Quitar suma">
          <i class="tim-icons icon-simple-remove"></i>
        </base-button>
      </div>
      <p class="cn-sum-desc">
        Suma el total de una medición entre varios equipos del sitio
        (ej: la carga DC total de todos los rectificadores) y compara ese total contra un valor.
      </p>

      <div v-for="(term, i) in localSumTerms" :key="term.__editorKey" class="cn-sum-term">
        <el-select
          v-if="sheets.length"
          :value="term.deviceType || ''" size="small" filterable class="select-info cn-equipo"
          placeholder="equipo" @change="onSumTermDevice(i, $event)"
        >
          <el-option v-for="s in sheets" :key="s.deviceType" :value="s.deviceType" :label="s.deviceType" />
        </el-select>
        <el-input v-else :value="term.deviceType || ''" size="small" class="cn-equipo" placeholder="equipo" @input="updateSumTerm(i, 'deviceType', $event)" />

        <el-select
          v-if="variablesFor(term.deviceType).length"
          :value="term.variable || ''" size="small" filterable class="select-info cn-var"
          placeholder="variable" @change="updateSumTerm(i, 'variable', $event)"
        >
          <el-option v-for="v in variablesFor(term.deviceType)" :key="v.name" :value="v.name" :label="varLabel(v)" />
        </el-select>
        <el-input v-else :value="term.variable || ''" size="small" class="cn-var" placeholder="variable técnica" @input="updateSumTerm(i, 'variable', $event)" />

        <base-button type="danger" size="sm" icon class="cn-rm" :disabled="localSumTerms.length <= 1" @click="removeSumTerm(i)"
          :title="localSumTerms.length <= 1 ? 'Se necesita al menos un equipo' : 'Quitar este equipo de la suma'">
          <i class="tim-icons icon-simple-remove"></i>
        </base-button>
      </div>

      <base-button type="default" size="sm" class="cn-sum-add" @click="addSumTerm">
        <i class="tim-icons icon-simple-add"></i> agregar equipo a la suma
      </base-button>

      <div class="cn-sum-cond">
        <span class="cn-sum-cond-lbl">El total sumado es</span>
        <el-select :value="condOp" size="small" class="select-primary cn-op" @change="updateCondition('op', $event)">
          <el-option v-for="(lbl, op) in OPERATOR_LABELS" :key="op" :value="op" :label="lbl" />
        </el-select>
        <el-input :value="condValue === undefined ? '' : condValue" size="small" type="number" class="cn-val" placeholder="valor"
          @input="updateCondition('value', numericOrRaw($event))" />
      </div>
    </div>

    <!-- FALLBACK -->
    <div v-else class="cn-unknown">
      Esta condición tiene una forma no reconocida y no se podrá guardar.
    </div>
  </div>
</template>

<script>
// DEC-REF-114 (#83) — rediseño de presentación del editor de crossExpr.
// El contrato de datos NO cambia: v-model del nodo completo (estilo inmutable),
// depth/maxDepth, isRoot, y stripEditorKeys al guardar (desde el padre).
// NUEVO: prop `sheets` (equipmentsheets) para poblar equipo/variable con los
// mismos selects que el modo simple (ConditionRow). Si un equipo no tiene
// ficha, cae a input de texto libre (mismo fallback que ConditionRow).
import { Select, Option, Input } from 'element-ui';

const uid = (() => { let n = 0; return () => `k${++n}`; })();

const OPERATOR_LABELS = {
  gt: 'mayor que', gte: 'mayor o igual que',
  lt: 'menor que', lte: 'menor o igual que',
  eq: 'igual a',   neq: 'distinto de',
};

function ensureKey(node) {
  if (node && typeof node === 'object' && !node.__editorKey) node.__editorKey = uid();
  return node;
}

export default {
  name: 'cross-expr-node',
  components: { [Select.name]: Select, [Option.name]: Option, [Input.name]: Input },
  props: {
    value: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    maxDepth: { type: Number, default: 8 },
    isRoot: { type: Boolean, default: false },
    sheets: { type: Array, default: () => [] },
  },
  data() { return { OPERATOR_LABELS }; },
  computed: {
    nodeType() {
      if (this.value.op === 'AND') return 'AND';
      if (this.value.op === 'OR')  return 'OR';
      if (Array.isArray(this.value.sum)) return 'leafSum';
      return 'leafDevice';
    },
    isLogical()    { return this.nodeType === 'AND' || this.nodeType === 'OR'; },
    isLeafDevice() { return this.nodeType === 'leafDevice'; },
    isSumLeaf()    { return this.nodeType === 'leafSum'; },
    opClass()  { return this.nodeType === 'OR' ? 'o' : 'y'; },
    opWord()   { return this.nodeType === 'OR' ? 'AL MENOS UNA de estas condiciones se cumple:' : 'TODAS estas condiciones se cumplen:'; },
    opChip()   { return this.nodeType === 'OR' ? 'O · al menos una' : 'Y · todas'; },
    opHint()   { return this.nodeType === 'OR'
      ? 'Se cumple cuando al menos una de las condiciones de adentro se cumple.'
      : 'Se cumple cuando todas las condiciones de adentro se cumplen a la vez.'; },

    condOp()    { return (this.value.condition && this.value.condition.op) || 'gt'; },
    condValue() { return this.value.condition ? this.value.condition.value : undefined; },

    localChildren() { return (this.value.children || []).map(ensureKey); },
    localSumTerms() { return (this.value.sum || []).map(ensureKey); },

    sheetByType() { const m = {}; for (const s of this.sheets) m[s.deviceType] = s; return m; },
    leafVariables() { const s = this.sheetByType[this.value.deviceType]; return (s && s.variables) || []; },
    leafSelectedVar() { return this.leafVariables.find(v => v.name === this.value.variable) || null; },
    leafValueType() { return (this.leafSelectedVar && this.leafSelectedVar.type) || 'float'; },
    leafUnit() { return (this.leafSelectedVar && this.leafSelectedVar.unit) || ''; },
  },
  methods: {
    varLabel(v) { return (v.label || v.name) + (v.unit ? ` [${v.unit}]` : ''); },
    variablesFor(deviceType) { const s = this.sheetByType[deviceType]; return (s && s.variables) || []; },

    emitUpdate(next) { this.$emit('input', ensureKey(next)); },
    setGroupOp(op) { if (this.nodeType === op) return; this.emitUpdate({ ...this.value, op }); },

    onChildInput(i, newChild) {
      const next = this.value.children.slice(); next[i] = newChild;
      this.emitUpdate({ ...this.value, children: next });
    },
    onChildRemove(i) {
      const next = this.value.children.slice(); next.splice(i, 1);
      this.emitUpdate({ ...this.value, children: next });
    },
    addLeafDevice() {
      const leaf = { deviceType: '', variable: '', condition: { op: 'gt', value: 0 } };
      this.emitUpdate({ ...this.value, children: [...(this.value.children || []), ensureKey(leaf)] });
    },
    addLogicalGroup() {
      if (this.depth + 1 >= this.maxDepth) return;
      const group = { op: 'AND', children: [] };
      this.emitUpdate({ ...this.value, children: [...(this.value.children || []), ensureKey(group)] });
    },
    addLeafSum() {
      const leaf = { sum: [{ deviceType: '', variable: '' }], condition: { op: 'gt', value: 0 } };
      this.emitUpdate({ ...this.value, children: [...(this.value.children || []), ensureKey(leaf)] });
    },

    // hoja equipo
    onLeafEquipo(dt) { this.emitUpdate({ ...this.value, deviceType: dt, variable: '' }); },
    onLeafVariable(v) { this.emitUpdate({ ...this.value, variable: v }); },
    updateLeaf(field, value) { this.emitUpdate({ ...this.value, [field]: value }); },
    updateCondition(field, value) {
      const cond = { ...(this.value.condition || {}), [field]: value };
      this.emitUpdate({ ...this.value, condition: cond });
    },

    // hoja suma
    addSumTerm() {
      const term = { deviceType: '', variable: '' };
      this.emitUpdate({ ...this.value, sum: [...(this.value.sum || []), ensureKey(term)] });
    },
    removeSumTerm(i) {
      if ((this.value.sum || []).length <= 1) return;
      const next = this.value.sum.slice(); next.splice(i, 1);
      this.emitUpdate({ ...this.value, sum: next });
    },
    updateSumTerm(i, field, value) {
      const next = this.value.sum.slice(); next[i] = { ...next[i], [field]: value };
      if (field === 'deviceType') next[i].variable = '';
      this.emitUpdate({ ...this.value, sum: next });
    },
    onSumTermDevice(i, dt) { this.updateSumTerm(i, 'deviceType', dt); },

    numericOrRaw(v) {
      if (v === '' || v === null || v === undefined) return '';
      const n = Number(v); return Number.isFinite(n) ? n : v;
    },
  },
};

function stripEditorKeys(node) {
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const key of Object.keys(node)) {
    if (key === '__editorKey') continue;
    const v = node[key];
    if (Array.isArray(v)) out[key] = v.map(stripEditorKeys);
    else if (v && typeof v === 'object') out[key] = stripEditorKeys(v);
    else out[key] = v;
  }
  return out;
}
export { stripEditorKeys };
</script>

<style scoped>
/* DEC-REF-114 — paleta: teal = Y (todas) · ámbar = O (al menos una) */
.cn { --teal:#00bf9a; --teal-d:#00806c; --teal-soft:rgba(0,191,154,.10); --teal-soft2:rgba(0,191,154,.18);
      --amber:#f5a623; --amber-d:#b9791a; --amber-soft:rgba(245,166,35,.12); --amber-soft2:rgba(245,166,35,.22);
      --line:#e6e9f0; --muted:#8898aa; }

/* ── grupo raíz: tarjeta con encabezado de color pleno ── */
.cn-group--root { border:1px solid var(--line); border-radius:12px; overflow:hidden; }
.cn-group--root > .cn-ghead { padding:9px 12px; color:#fff; }
.cn--root.y .cn-group--root > .cn-ghead { background:var(--teal); }
.cn--root.o .cn-group--root > .cn-ghead { background:var(--amber); }
.cn-group--root > .cn-gbody { padding:10px 12px 12px; }
.cn-banner { font-size:12px; font-weight:600; letter-spacing:.02em; flex:1; }

/* ── grupo anidado: riel de color + badge ── */
.cn-group--sub { position:relative; padding:6px 0 6px 14px; margin:6px 0; border-radius:0 8px 8px 0; }
.cn-group--sub::before { content:""; position:absolute; left:0; top:0; bottom:0; width:4px; border-radius:4px; }
.cn--sub.y .cn-group--sub::before { background:var(--teal); }
.cn--sub.o .cn-group--sub::before { background:var(--amber); }
.cn--sub.y .cn-group--sub { background:linear-gradient(90deg,var(--teal-soft),transparent 55%); }
.cn--sub.o .cn-group--sub { background:linear-gradient(90deg,var(--amber-soft),transparent 55%); }

.cn-ghead { display:flex; align-items:center; gap:10px; }
.cn-group--sub > .cn-ghead { margin-bottom:6px; }

.cn-chip { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; border-radius:20px; padding:3px 12px; flex:1; }
.cn-chip .cn-dot { width:8px; height:8px; border-radius:50%; }
.cn-chip.y { color:var(--teal-d); background:var(--teal-soft2); } .cn-chip.y .cn-dot { background:var(--teal); }
.cn-chip.o { color:var(--amber-d); background:var(--amber-soft2); } .cn-chip.o .cn-dot { background:var(--amber); }

/* toggle segmentado Y/O */
.cn-seg { display:inline-flex; border:1px solid rgba(255,255,255,.5); border-radius:20px; overflow:hidden; font-size:11px; font-weight:600; }
.cn-group--sub .cn-seg { border-color:var(--line); }
.cn-seg button { border:none; background:transparent; color:inherit; opacity:.75; padding:3px 11px; cursor:pointer; font-family:inherit; font-weight:600; }
.cn-group--sub .cn-seg button { color:var(--muted); opacity:1; }
.cn-seg button.on.y { background:var(--teal); color:#fff; opacity:1; }
.cn-seg button.on.o { background:var(--amber); color:#fff; opacity:1; }
.cn-rm-group { flex-shrink:0; }

.cn-child { margin-bottom:4px; }
.cn-actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
.cn-sumbtn { border-style:dashed !important; }
.cn-hint { font-size:11px; color:var(--muted); margin:8px 2px 0; }
.cn-empty { font-size:12px; color:var(--muted); margin:6px 2px; }

/* ── hoja condición ── */
.cn-leaf { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:4px 0; }
.cn-equipo { width:120px; } .cn-var { width:160px; } .cn-op { width:140px; } .cn-val { width:96px; }
.cn-unit { font-size:12px; color:var(--muted); }
.cn-rm { flex-shrink:0; }

/* ── hoja suma ── */
.cn-sum { border:1px dashed var(--amber); border-radius:10px; padding:10px 12px; background:var(--amber-soft); margin:4px 0; }
.cn-sum-head { display:flex; align-items:center; justify-content:space-between; }
.cn-sum-title { font-size:12px; font-weight:600; color:var(--amber-d); }
.cn-sum-desc { font-size:11.5px; color:var(--muted); margin:4px 0 10px; line-height:1.5; }
.cn-sum-term { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
.cn-sum-add { margin:2px 0 10px; }
.cn-sum-cond { display:flex; align-items:center; gap:8px; flex-wrap:wrap; border-top:1px solid var(--line); padding-top:10px; }
.cn-sum-cond-lbl { font-size:12px; color:var(--muted); }

.cn-unknown { color:#fd5d93; font-size:12px; padding:6px 0; }

/* ── modo oscuro (el tema por defecto es claro, DEC-REF-112) ── */
body:not(.white-content) .cn-group--root { border-color:rgba(255,255,255,.12); }
body:not(.white-content) .cn-hint,
body:not(.white-content) .cn-empty,
body:not(.white-content) .cn-unit,
body:not(.white-content) .cn-sum-desc,
body:not(.white-content) .cn-sum-cond-lbl { color:rgba(255,255,255,.5); }
body:not(.white-content) .cn-sum-cond { border-top-color:rgba(255,255,255,.12); }
</style>
