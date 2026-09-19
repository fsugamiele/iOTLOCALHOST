<template>
  <div v-if="descriptor">
    <template v-for="(field, i) in descriptor.fields">

      <!-- VARIABLE (DEC-REF-97): libre sin ficha; fijada/disabled con ficha -->
      <div :key="i" v-if="field.kind === 'variable'">
        <base-input
          v-if="!sheetVariables.length"
          :value="getByPath(field.model)"
          @input="setByPath(field.model, $event, 'text')"
          :label="field.label"
          type="text"
        />
        <base-input
          v-else
          :value="getByPath(field.model)"
          :label="field.lockedLabel"
          type="text"
          disabled
        />
      </div>

      <!-- TEXT -->
      <base-input
        :key="i"
        v-else-if="field.kind === 'text'"
        :value="getByPath(field.model)"
        @input="setByPath(field.model, $event, 'text')"
        :label="field.label"
        :placeholder="field.placeholder || ''"
        type="text"
      />

      <!-- NUMBER -->
      <base-input
        :key="i"
        v-else-if="field.kind === 'number'"
        :value="getByPath(field.model)"
        @input="setByPath(field.model, $event, 'number')"
        :label="field.label"
        type="number"
      />

      <!-- SELECT (opciones inline, ej. variableType) -->
      <div :key="i" v-else-if="field.kind === 'select'">
        <label class="control-label">{{ field.label }}</label>
        <el-select
          :value="getByPath(field.model)"
          @input="setByPath(field.model, $event, 'text')"
          :placeholder="field.label"
          style="width:100%; margin-bottom:20px"
          class="select-primary"
        >
          <el-option
            v-for="opt in field.options"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
      </div>

      <!-- ICON -->
      <div :key="i" v-else-if="field.kind === 'icon'">
        <label class="control-label">Ícono</label>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px">
          <el-select
            :value="getByPath(field.model)"
            @input="setByPath(field.model, $event, 'text')"
            placeholder="Ícono"
            style="flex:1"
            class="select-primary"
          >
            <el-option v-for="ic in iconOptions" :key="ic.value" :value="ic.value" :label="ic.label">
              <i class="fa" :class="ic.value" style="margin-right:8px; width:16px; text-align:center"></i>{{ ic.label }}
            </el-option>
          </el-select>
          <i class="fa fa-2x" :class="getByPath(field.model)" style="min-width:28px; text-align:center; opacity:0.85"></i>
        </div>
      </div>

      <!-- COLOR -->
      <div :key="i" v-else-if="field.kind === 'color'">
        <label class="control-label">Color de Widget</label>
        <el-select
          :value="getByPath(field.model)"
          @input="setByPath(field.model, $event, 'text')"
          placeholder="Color de Widget"
          style="width:100%; margin-bottom:20px"
          class="select-primary"
        >
          <el-option v-for="c in colorOptions" :key="c.value" :value="c.value" :label="c.label">
            <span :style="colorDotStyle(c.hex)"></span>{{ c.label }}
          </el-option>
        </el-select>
      </div>

      <!-- SIZE (column) -->
      <div :key="i" v-else-if="field.kind === 'size'">
        <label class="control-label">Tamaño del Widget</label>
        <el-select
          :value="getByPath(field.model)"
          @input="setByPath(field.model, $event, 'text')"
          placeholder="Tamaño del Widget"
          style="width:100%"
          class="select-primary"
        >
          <el-option v-for="col in columnOptions" :key="col.value" :value="col.value" :label="col.label" />
        </el-select>
        <br /><br />
      </div>

      <!-- ENUM REPEATER (catálogo de multiState) -->
      <div :key="i" v-else-if="field.kind === 'enumRepeater'">
        <label class="control-label">{{ field.label }}</label>
        <div
          v-for="(ev, idx) in enumRows(field.model)"
          :key="idx"
          style="display:flex; gap:6px; align-items:center; margin-bottom:6px"
        >
          <el-input v-model="ev.value" placeholder="valor (ej: 1)" style="flex:1" size="small" />
          <el-input v-model="ev.label" placeholder="etiqueta (ej: En marcha)" style="flex:2" size="small" />
          <el-select v-model="ev.severity" style="width:110px" size="small" class="select-primary">
            <el-option value="ok" label="ok" />
            <el-option value="info" label="info" />
            <el-option value="warning" label="warning" />
            <el-option value="critical" label="critical" />
          </el-select>
          <base-button size="sm" type="danger" icon @click="enumRows(field.model).splice(idx, 1)">
            <i class="fa fa-trash"></i>
          </base-button>
        </div>
        <base-button
          size="sm"
          type="default"
          @click="enumRows(field.model).push({ value: '', label: '', severity: 'info' })"
        >
          <i class="fa fa-plus" style="margin-right:4px"></i>Estado
        </base-button>
        <p v-if="field.help" class="text-muted" style="font-size:11px; margin:8px 0 16px">{{ field.help }}</p>
      </div>

      <!-- HELP (texto explicativo) -->
      <p
        :key="i"
        v-else-if="field.kind === 'help'"
        class="text-muted"
        style="font-size:11px; margin-bottom:16px"
      >{{ field.text }}</p>

    </template>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 1) — FORMULARIO GENÉRICO dirigido por descriptor.
// Renderiza `descriptor.fields` contra el objeto `config` (el borrador del
// widget). Reemplaza los 11 mini-formularios `v-if` de templates.vue.
//
// Mutación: escribe directo sobre las claves internas de `config` (mismo
// patrón que el flujo previo, que mutaba `previewConfig`). Solo se reasigna
// el objeto `config` completo desde el padre (no acá), así que no dispara el
// warning de mutación de prop de Vue.
import { Select, Option, Input } from 'element-ui';
import { ICON_OPTIONS, COLOR_OPTIONS, COLUMN_OPTIONS } from '@/components/Widgets/widgetRegistry.js';

export default {
  name: 'WidgetConfigForm',
  components: {
    [Select.name]: Select,
    [Option.name]: Option,
    [Input.name]: Input,
  },
  props: {
    descriptor: { type: Object, default: null },
    config: { type: Object, default: () => ({}) },
    sheetVariables: { type: Array, default: () => [] },
  },
  data() {
    return {
      iconOptions: ICON_OPTIONS,
      colorOptions: COLOR_OPTIONS,
      columnOptions: COLUMN_OPTIONS,
    };
  },
  methods: {
    getByPath(path) {
      return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.config);
    },
    setByPath(path, val, kind) {
      const coerced = kind === 'number' ? this.coerceNumber(val) : val;
      const keys = path.split('.');
      let o = this.config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (o[keys[i]] == null) this.$set(o, keys[i], {});
        o = o[keys[i]];
      }
      this.$set(o, keys[keys.length - 1], coerced);
    },
    // Espejo de v-model.number: '' se preserva, numérico se parsea, no-numérico
    // queda como string (la normalización del descriptor lo colapsa a null).
    coerceNumber(val) {
      if (val === '' || val == null) return val;
      const n = parseFloat(val);
      return isNaN(n) ? val : n;
    },
    // Garantiza que el array del enumRepeater exista y sea reactivo.
    enumRows(path) {
      let arr = this.getByPath(path);
      if (!Array.isArray(arr)) {
        this.setByPath(path, [], 'text');
        arr = this.getByPath(path);
      }
      return arr;
    },
    colorDotStyle(hex) {
      return {
        display: 'inline-block',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background: hex || '#aaa',
        marginRight: '8px',
        border: '1px solid rgba(255,255,255,0.3)',
        verticalAlign: 'middle',
      };
    },
  },
};
</script>
