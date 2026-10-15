<template>
  <!-- DEC-REF-116 (#83, B2) — una condición de la frase: [equipo?] [variable] [op] [valor].
       El equipo es opcional (solo en cross, para condiciones sobre otro device del sitio). -->
  <div class="cond-row">
    <el-select
      v-if="showEquipo"
      v-model="c.deviceType"
      size="small" class="select-info cond-equipo" filterable
      placeholder="equipo"
      @change="onEquipo"
    >
      <el-option v-for="s in sheets" :key="s.deviceType" :value="s.deviceType" :label="s.deviceType" />
    </el-select>

    <el-select
      v-if="variables.length"
      v-model="c.variable" size="small" filterable class="select-info cond-var"
      placeholder="variable" @change="onVariable"
    >
      <el-option v-for="v in variables" :key="v.name" :value="v.name" :label="varLabel(v)" />
    </el-select>
    <el-input v-else v-model="c.variable" size="small" class="cond-var" placeholder="variable técnica" />

    <el-select v-model="c.op" size="small" class="select-primary cond-op">
      <el-option v-for="op in operators" :key="op" :value="op" :label="opLabels[op]" />
    </el-select>

    <!-- spec_cascada_ficha C2 — el valor puede venir de la FICHA (se actualiza solo). -->
    <el-select v-if="limitOptions.length" v-model="c.limitRef" size="small" class="cond-src" @change="onLimitRef">
      <el-option value="" label="valor fijo" />
      <el-option v-for="o in limitOptions" :key="o.kind" :value="o.kind" :label="o.label" />
    </el-select>

    <el-input v-if="c.limitRef" :value="refValueText" size="small" class="cond-val" disabled />
    <el-select v-else-if="valueType === 'bool'" v-model="c.value" size="small" class="cond-val">
      <el-option :value="1" label="verdadero" />
      <el-option :value="0" label="falso" />
    </el-select>
    <el-input v-else v-model="c.value" size="small" class="cond-val"
      :type="valueType === 'categorical' || valueType === 'string' ? 'text' : 'number'"
      :placeholder="unit ? ('valor (' + unit + ')') : 'valor'" />

    <base-button v-if="removable" size="sm" type="danger" icon class="cond-rm" @click="$emit('remove')">
      <i class="fa fa-trash"></i>
    </base-button>
  </div>
</template>

<script>
import { Select, Option, Input } from 'element-ui';
import { OPERATORS, OPERATOR_LABELS } from '@/components/rules/ruleSentence.js';

export default {
  name: 'ConditionRow',
  components: { [Select.name]: Select, [Option.name]: Option, [Input.name]: Input },
  props: {
    condition:  { type: Object, required: true },
    sheets:     { type: Array,  default: () => [] },
    showEquipo: { type: Boolean, default: false },
    removable:  { type: Boolean, default: false },
  },
  data() { return { c: this.condition, operators: OPERATORS, opLabels: OPERATOR_LABELS }; },
  watch: { condition(nv) { this.c = nv; } },
  computed: {
    sheetByType() { const m = {}; for (const x of this.sheets) m[x.deviceType] = x; return m; },
    currentSheet() { return this.sheetByType[this.c.deviceType] || null; },
    variables() { return (this.currentSheet && this.currentSheet.variables) || []; },
    selectedVar() { return this.variables.find(v => v.name === this.c.variable) || null; },
    valueType() { return this.c.variableType || (this.selectedVar && this.selectedVar.type) || 'float'; },
    unit() { return this.c.unit || (this.selectedVar && this.selectedVar.unit) || ''; },
    // Límites de la ficha para esta variable en el sentido del comparador elegido.
    dirLimits() {
      const lims = (this.selectedVar && this.selectedVar.limits) || [];
      const dir = ['lt', 'lte'].includes(this.c.op) ? ['lt', 'lte'] : ['gt', 'gte'].includes(this.c.op) ? ['gt', 'gte'] : [this.c.op];
      return lims.filter(l => dir.includes(l.op) && typeof l.value === 'number');
    },
    limitOptions() {
      const lbl = { warning: 'umbral de atención (ficha)', trip: 'umbral crítico (ficha)' };
      return this.dirLimits.map(l => ({ kind: l.kind, label: `${lbl[l.kind] || l.kind}: ${l.value}${this.unit ? ' ' + this.unit : ''}` }));
    },
    refValueText() {
      const l = this.dirLimits.find(x => x.kind === this.c.limitRef);
      return l ? `${l.value}${this.unit ? ' ' + this.unit : ''} (ficha)` : 'no definido en la ficha';
    },
  },
  methods: {
    varLabel(v) { return (v.label || v.name) + (v.unit ? ` [${v.unit}]` : ''); },
    onLimitRef() {
      // Con referencia a la ficha el número no se guarda en la regla (lo resuelve el motor).
      if (this.c.limitRef) {
        const l = this.dirLimits.find(x => x.kind === this.c.limitRef);
        if (l) this.c.op = l.op;
        this.c.value = '';
      }
      this.$emit('change');
    },
    onEquipo() { this.c.variable = ''; this.c.variableLabel = ''; this.c.unit = ''; this.$emit('change'); },
    onVariable() {
      const v = this.selectedVar;
      if (v) { this.c.variableLabel = v.label || v.name; this.c.unit = v.unit || ''; this.c.variableType = v.type || 'float'; }
      this.$emit('change');
    },
  },
};
</script>

<style scoped>
.cond-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.cond-equipo { width: 120px; }
.cond-var { width: 170px; }
.cond-op  { width: 140px; }
.cond-val { width: 110px; }
.cond-src { width: 200px; }
.cond-rm { flex-shrink: 0; }
</style>
