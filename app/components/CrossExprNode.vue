<template>
  <div class="cross-node" :class="'depth-' + depth">
    <!-- HEADER: tipo de nodo + acciones -->
    <div class="d-flex align-items-center mb-2">
      <select
        class="form-control form-control-sm mr-2"
        style="max-width: 180px;"
        :value="nodeType"
        @change="onTypeChange($event.target.value)"
      >
        <option value="AND">Grupo AND</option>
        <option value="OR">Grupo OR</option>
        <option value="leafDevice">Hoja equipo</option>
        <!-- SF-6 · DEC-REF-65.e — hoja suma editable desde R16. Antes
             estaba con v-if="isSumLeaf" (solo si el nodo YA era sum).
             Ahora se ofrece siempre para permitir convertir. -->
        <option value="leafSum">Hoja suma</option>
      </select>

      <base-button
        v-if="!isRoot"
        type="danger"
        size="sm"
        @click="$emit('remove')"
        title="Quitar este nodo"
      >
        <i class="tim-icons icon-simple-remove"></i>
      </base-button>
    </div>

    <!-- NODO LÓGICO (AND/OR) -->
    <div v-if="isLogical" class="cross-logical pl-3">
      <div
        v-for="(child, i) in localChildren"
        :key="child.__editorKey"
        class="cross-child mb-2"
      >
        <cross-expr-node
          :value="child"
          :depth="depth + 1"
          :max-depth="maxDepth"
          @input="onChildInput(i, $event)"
          @remove="onChildRemove(i)"
        />
      </div>

      <div class="cross-actions mt-2">
        <base-button
          type="info"
          size="sm"
          @click="addLeafDevice"
          title="Agregar hoja equipo (deviceType + variable + condición)"
        >
          <i class="tim-icons icon-simple-add"></i> Agregar condición
        </base-button>
        <base-button
          type="info"
          size="sm"
          :disabled="depth + 1 >= maxDepth"
          @click="addLogicalGroup"
          :title="depth + 1 >= maxDepth
            ? 'Profundidad máxima ' + maxDepth + ' alcanzada (validateCrossTree en el backend rechaza más)'
            : 'Anidar un grupo AND/OR'"
        >
          <i class="tim-icons icon-vector"></i> Agregar grupo
        </base-button>
        <!-- SF-6 · DEC-REF-65.e — hoja de suma editable desde R16.
             Es una hoja terminal (no anida), así que no consume depth
             más allá de +1 (mismo criterio que "Agregar condición"). -->
        <base-button
          type="info"
          size="sm"
          @click="addLeafSum"
          title="Agregar hoja de suma (total sumado de una variable en N devices del mismo deviceType)"
        >
          <i class="tim-icons icon-simple-add"></i> Agregar suma
        </base-button>
      </div>

      <p v-if="localChildren.length === 0" class="text-muted small mt-2">
        Grupo vacío. Agregá al menos una condición o el backend
        rechazará con "{{ nodeType }} sin children".
      </p>
    </div>

    <!-- HOJA EQUIPO (deviceType, variable, condition) -->
    <div v-else-if="isLeafDevice" class="cross-leaf pl-3">
      <div class="row">
        <div class="col-md-4">
          <label class="small">deviceType</label>
          <base-input
            :value="value.deviceType || ''"
            placeholder="cummins-pcc"
            @input="updateLeaf('deviceType', $event)"
          />
        </div>
        <div class="col-md-4">
          <label class="small">variable</label>
          <base-input
            :value="value.variable || ''"
            placeholder="oil_pressure"
            @input="updateLeaf('variable', $event)"
          />
        </div>
        <div class="col-md-2">
          <label class="small">op</label>
          <select
            class="form-control"
            :value="value.condition && value.condition.op || 'gt'"
            @change="updateCondition('op', $event.target.value)"
          >
            <!-- Set exacto de ops que typeD.js soporta (OPS en línea 1-8). -->
            <option value="lt">lt</option>
            <option value="lte">lte</option>
            <option value="gt">gt</option>
            <option value="gte">gte</option>
            <option value="eq">eq</option>
            <option value="neq">neq</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="small">value</label>
          <base-input
            type="number"
            :value="value.condition && value.condition.value !== undefined ? value.condition.value : ''"
            @input="updateCondition('value', numericOrRaw($event))"
          />
        </div>
      </div>
    </div>

    <!-- HOJA SUMA — EDITABLE (SF-6 · DEC-REF-65.e) -->
    <div v-else-if="isSumLeaf" class="cross-sum pl-3">
      <p class="text-info small mb-2">
        <i class="tim-icons icon-notes"></i>
        Suma = Σ (variable) sobre todos los devices del deviceType en
        el site. Añadí renglones para sumar más de un deviceType.
      </p>

      <!-- Renglones dinámicos de (deviceType, variable) -->
      <div
        v-for="(term, i) in localSumTerms"
        :key="term.__editorKey"
        class="row mb-2 align-items-end"
      >
        <div class="col-md-5">
          <label class="small">deviceType</label>
          <base-input
            :value="term.deviceType || ''"
            placeholder="ELTEK"
            @input="updateSumTerm(i, 'deviceType', $event)"
          />
        </div>
        <div class="col-md-5">
          <label class="small">variable</label>
          <base-input
            :value="term.variable || ''"
            placeholder="dc_load_current"
            @input="updateSumTerm(i, 'variable', $event)"
          />
        </div>
        <div class="col-md-2">
          <base-button
            type="danger"
            size="sm"
            :disabled="localSumTerms.length <= 1"
            @click="removeSumTerm(i)"
            :title="localSumTerms.length <= 1 ? 'Se requiere al menos un renglón' : 'Quitar este renglón'"
          >
            <i class="tim-icons icon-simple-remove"></i>
          </base-button>
        </div>
      </div>

      <div class="mb-3">
        <base-button
          type="info"
          size="sm"
          @click="addSumTerm"
          title="Agregar otro par (deviceType, variable) a la suma"
        >
          <i class="tim-icons icon-simple-add"></i> Agregar renglón
        </base-button>
      </div>

      <!-- Condition del total -->
      <p class="small mb-1">Condición sobre el total sumado:</p>
      <div class="row">
        <div class="col-md-4">
          <label class="small">op</label>
          <select
            class="form-control"
            :value="(value.condition && value.condition.op) || 'gt'"
            @change="updateCondition('op', $event.target.value)"
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
          <label class="small">value</label>
          <base-input
            type="number"
            :value="value.condition && value.condition.value !== undefined ? value.condition.value : ''"
            @input="updateCondition('value', numericOrRaw($event))"
          />
        </div>
      </div>
    </div>

    <!-- FALLBACK: nodo desconocido -->
    <div v-else class="text-danger small pl-3">
      Nodo con forma no reconocida — el backend lo rechazará al guardar.
    </div>
  </div>
</template>

<script>
// SF-5 Capa 3 · DEC-REF-62.e — editor visual recursivo de crossExpr.
// Renderiza y edita el árbol AND/OR + hoja equipo. Hoja de suma
// modelada pero NO creable desde la UI (activada en SF-6, DEC-REF-63);
// el componente sí la renderiza read-only para robustez si viniera en
// datos.
//
// Recursión Vue: `name: 'cross-expr-node'` permite auto-referencia en
// el template. Es el PRIMER patrón recursivo del codebase — atención a
// `key` estable en el v-for de children (índice NO alcanza si hay
// remove; usar id local generado `__editorKey`).
//
// Contrato:
//   - v-model: recibe/emite el nodo COMPLETO cada vez que cambia.
//     El padre reemplaza referencia (immutable style) → Vue re-render.
//   - depth (Number): profundidad actual, empieza en 0 en el root.
//   - maxDepth (Number, default 8): límite de anidamiento
//     (ruleValidation.js:18 rechaza con "profundidad > 8" en el backend).
//     Botón "Agregar grupo" queda disabled con tooltip explicativo al
//     llegar al límite — aviso client-side ANTES del submit.
//   - isRoot (Boolean, default false): oculta el botón "Quitar" en la
//     raíz (el editor de reglas la reemplaza con "Convertir a typeD"
//     si el usuario cambia de mente).
//
// El nodo se persiste en Mongo como Mixed (`crossExpr: Mixed` en
// rule_definition.js:42); mongoose acepta cualquier shape. Al guardar,
// se strippean los `__editorKey` (helper `stripEditorKeys` — llamado
// desde el padre en pages/rulepacks/_packId.vue).

const uid = (() => {
  let n = 0;
  return () => `k${++n}`;
})();

function ensureKey(node) {
  if (node && typeof node === 'object' && !node.__editorKey) {
    node.__editorKey = uid();
  }
  return node;
}

export default {
  name: 'cross-expr-node',
  props: {
    value: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    maxDepth: { type: Number, default: 8 },
    isRoot: { type: Boolean, default: false }
  },
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
    // Enriquece children con __editorKey estable in-place. Vue 2 no
    // avisa por mutar campos internos de objetos prop; el emit
    // posterior al padre no se ve afectado porque el key se strippea
    // al guardar.
    localChildren() {
      const children = this.value.children || [];
      return children.map(ensureKey);
    },
    // SF-6 · DEC-REF-65.e — igual patrón que localChildren pero sobre el
    // array `sum` de renglones {deviceType, variable}. `key` estable para
    // que Vue no reordene al remover.
    localSumTerms() {
      const terms = this.value.sum || [];
      return terms.map(ensureKey);
    }
  },
  methods: {
    emitUpdate(next) {
      this.$emit('input', ensureKey(next));
    },
    onTypeChange(newType) {
      // Reset estructural: cambiar de tipo resetea la forma. Preservar
      // solo lo que tenga sentido (nada compatible entre AND/OR/leaf).
      let next;
      if (newType === 'AND' || newType === 'OR') {
        next = { op: newType, children: [] };
      } else if (newType === 'leafDevice') {
        next = { deviceType: '', variable: '', condition: { op: 'gt', value: 0 } };
      } else if (newType === 'leafSum') {
        // SF-6 · DEC-REF-65.e — shape aceptado por ruleValidation.js:32-45:
        // sum array no vacío + condition con op y value numérico.
        next = { sum: [{ deviceType: '', variable: '' }], condition: { op: 'gt', value: 0 } };
      }
      this.emitUpdate(next);
    },
    onChildInput(i, newChild) {
      const nextChildren = this.value.children.slice();
      nextChildren[i] = newChild;
      this.emitUpdate({ ...this.value, children: nextChildren });
    },
    onChildRemove(i) {
      const nextChildren = this.value.children.slice();
      nextChildren.splice(i, 1);
      this.emitUpdate({ ...this.value, children: nextChildren });
    },
    addLeafDevice() {
      const leaf = { deviceType: '', variable: '', condition: { op: 'gt', value: 0 } };
      this.emitUpdate({
        ...this.value,
        children: [...(this.value.children || []), ensureKey(leaf)]
      });
    },
    addLogicalGroup() {
      if (this.depth + 1 >= this.maxDepth) return;
      const group = { op: 'AND', children: [] };
      this.emitUpdate({
        ...this.value,
        children: [...(this.value.children || []), ensureKey(group)]
      });
    },
    // SF-6 · DEC-REF-65.e — agregar hoja de suma como hijo del nodo
    // lógico actual. Shape mismo que en onTypeChange('leafSum').
    addLeafSum() {
      const leaf = { sum: [{ deviceType: '', variable: '' }], condition: { op: 'gt', value: 0 } };
      this.emitUpdate({
        ...this.value,
        children: [...(this.value.children || []), ensureKey(leaf)]
      });
    },
    // SF-6 · DEC-REF-65.e — mutaciones sobre el array `sum` de la hoja.
    // Cada mutation emite el nodo completo (immutable style) al padre.
    addSumTerm() {
      const term = { deviceType: '', variable: '' };
      this.emitUpdate({
        ...this.value,
        sum: [...(this.value.sum || []), ensureKey(term)]
      });
    },
    removeSumTerm(i) {
      // ruleValidation exige sum no vacío — no permitir quitar el último.
      if ((this.value.sum || []).length <= 1) return;
      const nextSum = this.value.sum.slice();
      nextSum.splice(i, 1);
      this.emitUpdate({ ...this.value, sum: nextSum });
    },
    updateSumTerm(i, field, value) {
      const nextSum = this.value.sum.slice();
      nextSum[i] = { ...nextSum[i], [field]: value };
      this.emitUpdate({ ...this.value, sum: nextSum });
    },
    updateLeaf(field, value) {
      this.emitUpdate({ ...this.value, [field]: value });
    },
    updateCondition(field, value) {
      const cond = { ...(this.value.condition || {}), [field]: value };
      this.emitUpdate({ ...this.value, condition: cond });
    },
    numericOrRaw(v) {
      // Preservar string vacío para no romper "" → 0; parsear cuando
      // hay contenido no vacío. Valores no-numéricos (para eq/neq con
      // strings tipo 'RUNNING') pasan como string.
      if (v === '' || v === null || v === undefined) return '';
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
  }
};

// Helper para strip de __editorKey antes de guardar. Recursivo,
// immutable. Exportado como named export además del componente
// default para import desde la página del editor.
function stripEditorKeys(node) {
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const key of Object.keys(node)) {
    if (key === '__editorKey') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      out[key] = v.map(stripEditorKeys);
    } else if (v && typeof v === 'object') {
      out[key] = stripEditorKeys(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

export { stripEditorKeys };
</script>

<style scoped>
.cross-node {
  border-left: 2px solid rgba(255,255,255,0.1);
  padding-left: 8px;
  margin-bottom: 4px;
}
.cross-node.depth-0 { border-left-color: rgba(88, 103, 221, 0.6); }
.cross-node.depth-1 { border-left-color: rgba(88, 103, 221, 0.45); }
.cross-node.depth-2 { border-left-color: rgba(88, 103, 221, 0.3); }
.cross-child {
  padding: 4px;
  background: rgba(255,255,255,0.02);
  border-radius: 4px;
}
.cross-sum pre {
  max-height: 120px;
  overflow: auto;
}
</style>
