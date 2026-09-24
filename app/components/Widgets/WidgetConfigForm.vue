<template>
  <div v-if="descriptor">
    <template v-for="(field, i) in visibleFields">

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

      <!-- SOURCE REPEATER (multi-fuente: cascada / planta DC) -->
      <div :key="i" v-else-if="field.kind === 'sourceRepeater'">
        <label class="control-label">{{ field.label }}</label>
        <div
          v-for="(src, idx) in sourceRows(field.model)"
          :key="idx"
          style="display:flex; gap:6px; align-items:center; margin-bottom:6px"
        >
          <el-select
            v-if="sheetVariables.length"
            v-model="src.variable"
            @change="onSourceVar(src, $event)"
            filterable
            placeholder="variable"
            size="small"
            class="select-info"
            style="flex:2"
          >
            <el-option v-for="v in sheetVariables" :key="v.name" :value="v.name" :label="v.label || v.name" />
          </el-select>
          <el-input v-else v-model="src.variable" placeholder="variable técnica" size="small" style="flex:2" />
          <el-input v-model="src.variableFullName" placeholder="etiqueta" size="small" style="flex:2" />
          <el-input v-model="src.unit" placeholder="unidad" size="small" style="width:72px" />
          <el-select
            v-if="field.withRole"
            v-model="src.role"
            placeholder="rol"
            size="small"
            class="select-primary"
            style="width:130px"
          >
            <!-- DEC-REF-113 F5 (#84): roles por descriptor (siteMap declara
                 los suyos); sin declarar, los de energía de abajo. -->
            <el-option v-for="r in (field.roleOptions || roleOptions)" :key="r.value" :value="r.value" :label="r.label" />
          </el-select>
          <!-- DEC-REF-113 F4 (#84) — semántica de "activo" por fuente
               (cascada): lista de valores que encienden la etapa; vacío =
               regla automática (on/1/true o número > 0). -->
          <el-input
            v-if="field.withActiveWhen"
            :value="(src.activeWhen || []).join(', ')"
            @input="$set(src, 'activeWhen', $event.split(',').map((x) => x.trim()).filter(Boolean))"
            placeholder="activo si = …"
            size="small"
            style="width:130px"
            title="Valores que significan activo, separados por coma (ej: RUNNING). Vacío = automático (on/1 o número > 0)."
          />
          <base-button size="sm" type="danger" icon @click="removeSource(field.model, idx)">
            <i class="fa fa-trash"></i>
          </base-button>
        </div>
        <base-button size="sm" type="default" @click="addSource(field.model)">
          <i class="fa fa-plus" style="margin-right:4px"></i>Fuente
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
      // DEC-REF-107 (Paso 5): roles de etapa para la cascada de energía.
      roleOptions: [
        { value: 'mains',     label: 'Red' },
        { value: 'ats',       label: 'ATS' },
        { value: 'genset',    label: 'Grupo' },
        { value: 'rectifier', label: 'Rectificador' },
        { value: 'battery',   label: 'Batería' },
        { value: 'other',     label: 'Otro' },
      ],
    };
  },
  computed: {
    // DEC-REF-107 (Paso 2): campos condicionales — un field con showIf solo
    // se muestra si su predicado sobre el config da true (p.ej. la config del
    // gauge solo aparece con render='gauge').
    visibleFields() {
      const fields = (this.descriptor && this.descriptor.fields) || [];
      return fields.filter((f) => !f.showIf || f.showIf(this.config));
    },
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
    // ── DEC-REF-107 (Paso 5): filas de fuentes (multi-fuente) ──────────
    sourceRows(path) {
      let arr = this.getByPath(path);
      if (!Array.isArray(arr)) {
        this.setByPath(path, [], 'text');
        arr = this.getByPath(path);
      }
      return arr;
    },
    addSource(path) {
      this.sourceRows(path).push({
        key: 's' + Math.random().toString(36).slice(2, 9),
        variable: '',
        variableFullName: '',
        unit: '',
        role: '',
      });
    },
    removeSource(path, idx) {
      this.sourceRows(path).splice(idx, 1);
    },
    // Al elegir la variable de la ficha, autocompleta etiqueta/unidad/tipo.
    onSourceVar(src, varName) {
      const v = this.sheetVariables.find((x) => x.name === varName);
      if (!v) return;
      if (!src.variableFullName) src.variableFullName = v.label || v.name;
      if (!src.unit) src.unit = v.unit || '';
      src.variableType = v.type || '';
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
