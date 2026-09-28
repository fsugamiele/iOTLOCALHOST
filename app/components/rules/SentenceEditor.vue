<template>
  <!-- DEC-REF-116 (#83) — editor-frase. Rediseño estético (Franco #83): pasos
       numerados con aire + confirmación al pie (tarjeta de alarma real + "En
       palabras"). Color unificado: teal = acción que avanza · gris = secundario
       · rojo = solo quitar · los colores fuertes viven solo en la severidad. -->
  <div class="sentence-editor">
    <h5 class="se-title">{{ editingIndex === null ? 'Nueva regla' : 'Editar regla' }}</h5>

    <!-- ── PASO 1 · ¿Qué vigilar? ── -->
    <div class="se-step">
      <div class="se-num">1</div>
      <div class="se-step-body">
        <div class="se-step-q">¿Qué querés vigilar?</div>

        <!-- MODO SIMPLE -->
        <template v-if="!advanced">
          <div v-if="s.conditions.length > 1" class="se-join">
            <el-radio-group v-model="s.join" size="small">
              <el-radio-button label="AND">TODAS (Y)</el-radio-button>
              <el-radio-button label="OR">CUALQUIERA (O)</el-radio-button>
            </el-radio-group>
            <small class="text-muted" style="margin-left:8px">de estas condiciones:</small>
          </div>

          <condition-row
            v-for="(c, i) in s.conditions" :key="i"
            :condition="c" :sheets="sheets"
            :show-equipo="s.conditions.length > 1" :removable="s.conditions.length > 1"
            @remove="removeCondition(i)" @change="touch"
          />

          <div class="se-mods">
            <base-button size="sm" type="primary" @click="addCondition"><i class="fa fa-plus"></i> condición</base-button>
            <template v-if="s.conditions.length === 1">
              <base-button size="sm" :type="activeMod==='temporal'?'primary':'default'" :disabled="activeMod && activeMod!=='temporal'" @click="toggleTemporal"><i class="fa fa-clock"></i> durante un tiempo</base-button>
              <base-button size="sm" :type="activeMod==='setpoint'?'primary':'default'" :disabled="activeMod && activeMod!=='setpoint'" @click="toggleSetpoint"><i class="fa fa-sliders-h"></i> vs valor del equipo</base-button>
              <base-button size="sm" :type="activeMod==='trend'?'primary':'default'" :disabled="activeMod && activeMod!=='trend'" @click="toggleTrend"><i class="fa fa-chart-line"></i> tendencia</base-button>
              <base-button size="sm" :type="activeMod==='projection'?'primary':'default'" :disabled="activeMod && activeMod!=='projection'" @click="toggleProjection"><i class="fa fa-bullseye"></i> proyección</base-button>
              <base-button size="sm" :type="activeMod==='spread'?'primary':'default'" :disabled="activeMod && activeMod!=='spread'" @click="toggleSpread"><i class="fa fa-balance-scale"></i> desbalance</base-button>
              <base-button size="sm" :type="activeMod==='compare'?'primary':'default'" :disabled="activeMod && activeMod!=='compare'" @click="toggleCompare"><i class="fa fa-divide"></i> relación</base-button>
              <base-button size="sm" :type="activeMod==='dutyCycle'?'primary':'default'" :disabled="activeMod && activeMod!=='dutyCycle'" @click="toggleDutyCycle"><i class="fa fa-percent"></i> uso %</base-button>
              <base-button size="sm" :type="activeMod==='cumulative'?'primary':'default'" :disabled="activeMod && activeMod!=='cumulative'" @click="toggleCumulative"><i class="fa fa-gas-pump"></i> acumulado</base-button>
              <base-button size="sm" :type="activeMod==='stepJump'?'primary':'default'" :disabled="activeMod && activeMod!=='stepJump'" @click="toggleStepJump"><i class="fa fa-bolt"></i> salto abrupto</base-button>
              <base-button size="sm" :type="activeMod==='flatline'?'primary':'default'" :disabled="activeMod && activeMod!=='flatline'" @click="toggleFlatline"><i class="fa fa-minus"></i> sensor clavado</base-button>
              <base-button size="sm" :type="activeMod==='staleness'?'primary':'default'" :disabled="activeMod && activeMod!=='staleness'" @click="toggleStaleness"><i class="fa fa-plug"></i> deja de reportar</base-button>
            </template>
            <base-button v-if="s.conditions.length > 1" size="sm" type="default" @click="toGrouped" title="Combinar en grupos anidados (Y/O dentro de Y/O)"><i class="fa fa-sitemap"></i> agrupar condiciones</base-button>
          </div>

          <div v-if="s.temporal" class="se-extra">
            … y se mantenga
            <el-input v-model.number="s.temporal.count" size="small" type="number" class="se-mini" /> vez/veces en
            <el-input v-model.number="s.temporal.durationMin" size="small" type="number" class="se-mini" /> minutos.
          </div>
          <div v-if="s.setpoint" class="se-extra">
            … comparado con el valor que reporta el equipo:
            <el-select v-if="variablesOfFirst.length" v-model="s.setpoint.variable" size="small" filterable class="se-sp">
              <el-option v-for="v in variablesOfFirst" :key="v.name" :value="v.name" :label="v.label || v.name" />
            </el-select>
            <el-input v-else v-model="s.setpoint.variable" size="small" class="se-sp" placeholder="variable del setpoint" />
          </div>

          <!-- M · tendencia (slope) -->
          <div v-if="s.trend" class="se-extra">
            … su <b>tendencia</b>:
            <el-select v-model="s.trend.direction" size="small" class="se-dir">
              <el-option value="down" label="baja" />
              <el-option value="up" label="sube" />
            </el-select>
            más de
            <el-input v-model.number="s.trend.rate" size="small" type="number" class="se-mini" />
            {{ trendUnit }}/min, medido en los últimos
            <el-input v-model.number="s.trend.windowMin" size="small" type="number" class="se-mini" /> min.
          </div>

          <!-- M · proyección (projection) -->
          <div v-if="s.projection" class="se-extra">
            … va a <b>llegar a</b>
            <el-input v-model.number="s.projection.target" size="small" type="number" class="se-mini" /> {{ trendUnit }}
            en menos de
            <el-input v-model.number="s.projection.hoursThreshold" size="small" type="number" class="se-mini" /> h
            <span class="text-muted">(ventana</span>
            <el-input v-model.number="s.projection.windowMin" size="small" type="number" class="se-mini" /> <span class="text-muted">min)</span>.
          </div>

          <!-- M2 · desbalance entre equipos (spread) -->
          <div v-if="s.spread" class="se-extra">
            … medido como <b>desbalance</b> (máx − mín) de esta variable entre los <b>{{ deviceTypeLabel }}</b> del sitio.
            El valor de arriba es el umbral del desbalance; la alarma <b>señala el equipo fuera de línea</b>.
          </div>

          <!-- M2 · relación / diferencia entre dos datos (ratio / divergence) -->
          <div v-if="s.compare" class="se-extra">
            … comparada como
            <el-select v-model="s.compare.kind" size="small" class="se-cmp">
              <el-option value="ratio" label="relación (÷)" />
              <el-option value="divergence" label="diferencia (|−|)" />
            </el-select>
            con
            <el-select v-if="variablesOfFirst.length" v-model="s.compare.variable2" size="small" filterable class="se-sp">
              <el-option v-for="v in variablesOfFirst" :key="v.name" :value="v.name" :label="v.label || v.name" />
            </el-select>
            <el-input v-else v-model="s.compare.variable2" size="small" class="se-sp" placeholder="segunda variable" />
            y el resultado sea
            <el-select v-model="s.compare.op" size="small" class="se-cmp">
              <el-option v-for="op in operators" :key="op" :value="op" :label="opLabels[op]" />
            </el-select>
            <el-input v-model.number="s.compare.value" size="small" type="number" class="se-mini" />.
          </div>

          <!-- M3 · % de uso en ventana (dutyCycle) -->
          <div v-if="s.dutyCycle" class="se-extra">
            … medido como <b>% del tiempo en uso</b> (el valor de arriba es el umbral %), en los últimos
            <el-input v-model.number="s.dutyCycle.windowMin" size="small" type="number" class="se-mini" /> min.
          </div>

          <!-- M3 · acumulado desde reinicio (cumulativeSince) -->
          <div v-if="s.cumulative" class="se-extra">
            … medido como lo <b>acumulado desde la última recarga</b> (el motor detecta la recarga solo);
            el valor de arriba es el umbral. Persiste aunque se reinicie el equipo.
          </div>

          <!-- M4 · salto abrupto en un paso (stepJump) -->
          <div v-if="s.stepJump" class="se-extra">
            … medido como un <b>salto en un solo paso</b> (el valor de arriba es el tamaño mínimo del salto),
            dentro de una ventana de
            <el-input v-model.number="s.stepJump.windowMin" size="small" type="number" class="se-mini" /> min.
          </div>

          <!-- M4 · sensor clavado (flatline) -->
          <div v-if="s.flatline" class="se-extra">
            … detecta un <b>sensor clavado</b>: la lectura no cambia (rango ≤ el valor de arriba, la tolerancia)
            durante
            <el-input v-model.number="s.flatline.windowMin" size="small" type="number" class="se-mini" /> min.
          </div>

          <!-- M4 · deja de reportar (staleness) -->
          <div v-if="s.staleness" class="se-extra">
            … si el equipo <b>deja de reportar</b> esa variable por más del valor de arriba (en <b>minutos</b>).
            Se vigila por reloj, aunque el equipo no envíe nada.
          </div>
        </template>

        <!-- MODO AVANZADO -->
        <template v-else>
          <div class="se-adv-head">
            <span><i class="fa fa-sitemap"></i> Condición combinada (grupos anidados Y/O)</span>
            <base-button size="sm" type="default" @click="toSimple" title="Volver a condiciones simples (se pierde el anidamiento)"><i class="fa fa-arrow-left"></i> modo simple</base-button>
          </div>
          <cross-expr-node v-if="advCross" :value="advCross" :depth="0" :max-depth="8" :is-root="true" :sheets="sheets" @input="onAdvInput" />
        </template>
      </div>
    </div>

    <!-- ── PASO 2 · ¿Qué tan grave? ── -->
    <div class="se-step">
      <div class="se-num">2</div>
      <div class="se-step-body">
        <div class="se-step-q">¿Qué tan grave es?</div>
        <el-select v-model="s.severity" size="small" class="select-primary se-sev">
          <el-option v-for="sev in severities" :key="sev.value" :value="sev.value" :label="sev.label">
            <span class="badge" :class="sev.badge" style="margin-right:6px">{{ sev.label }}</span>
            <small class="text-muted">{{ sev.help }}</small>
          </el-option>
        </el-select>
      </div>
    </div>

    <!-- ── PASO 3 · ¿Qué hacer? ── -->
    <div class="se-step">
      <div class="se-num">3</div>
      <div class="se-step-body">
        <div class="se-step-q">¿Qué debe hacer el operador?</div>
        <el-input v-model="s.recommendation" size="small" type="textarea" :rows="2"
          placeholder="Ej: Enviar técnico — el sitio corre riesgo de quedarse sin energía" />
        <p v-if="!s.recommendation" class="se-warn"><i class="fa fa-exclamation-triangle"></i> Sin recomendación, la alarma no dice qué hacer.</p>
      </div>
    </div>

    <!-- ── PASO 4 · Nombre ── -->
    <div class="se-step">
      <div class="se-num">4</div>
      <div class="se-step-body">
        <div class="se-step-q">Nombre de la regla</div>
        <el-input v-model="s.label" size="small" placeholder="Ej: Presión de aceite baja" />
      </div>
    </div>

    <div class="se-divider"></div>

    <!-- ── CONFIRMACIÓN ── -->
    <div class="se-confirm-h">Así queda tu regla</div>
    <div class="se-alarm" :class="'se-alarm--' + s.severity">
      <div class="se-alarm-l1">
        <span class="se-alarm-lab">{{ s.label || 'Regla sin nombre' }}</span>
        <span class="badge" :class="badge">{{ sevLabel }}</span>
      </div>
      <div class="se-alarm-l2">{{ typeHint }}</div>
      <div v-if="s.recommendation" class="se-alarm-rec">→ {{ s.recommendation }}</div>
    </div>

    <div class="se-nl">
      <div class="se-nl-title"><i class="fa fa-quote-left"></i> En palabras</div>
      <p v-if="naturalText.mode === 'sentence'" class="se-nl-text">{{ naturalText.sentence }}</p>
      <template v-else>
        <p class="se-nl-text mb-1">{{ naturalText.sentence }}</p>
        <ul class="se-nl-list">
          <li v-for="(ln, i) in naturalText.lines" :key="i"
            :class="ln.group ? 'se-nl-group' : 'se-nl-leaf'"
            :style="{ paddingLeft: (ln.depth * 16 + 4) + 'px' }">
            <span v-if="ln.group">{{ ln.text }}</span>
            <span v-else>• {{ ln.text }}</span>
          </li>
        </ul>
      </template>
    </div>

    <div class="se-actions">
      <base-button size="sm" type="default" @click="$emit('cancel')">Cancelar</base-button>
      <base-button size="sm" type="primary" :disabled="!canSave" @click="save"><i class="tim-icons icon-check-2"></i> Guardar regla</base-button>
    </div>
  </div>
</template>

<script>
import { Select, Option, Input, RadioGroup, RadioButton } from 'element-ui';
import ConditionRow from '@/components/rules/ConditionRow.vue';
import CrossExprNode, { stripEditorKeys } from '@/components/CrossExprNode.vue';
import {
  SEVERITIES, severityLabel, severityBadge, summarize, inferType, coerceValue,
  sentenceToRule, ruleToSentence, emptySentence, emptyCondition, genRuleId, genInferenceId,
  describeCross, OPERATORS, OPERATOR_LABELS,
} from '@/components/rules/ruleSentence.js';

const TYPE_HINT = { D: 'umbral simple', S: 'condición en el tiempo', C: 'contra el valor del equipo', cross: 'condición combinada' };
function firstLeafVar(node) {
  if (!node) return '';
  if (node.variable) return node.variable;
  if (Array.isArray(node.children)) { for (const ch of node.children) { const v = firstLeafVar(ch); if (v) return v; } }
  return '';
}

export default {
  name: 'SentenceEditor',
  components: {
    ConditionRow, CrossExprNode,
    [Select.name]: Select, [Option.name]: Option, [Input.name]: Input,
    [RadioGroup.name]: RadioGroup, [RadioButton.name]: RadioButton,
  },
  props: {
    pack: { type: Object, required: true },
    sheets: { type: Array, default: () => [] },
    rule: { type: Object, default: null },
    editingIndex: { default: null },
  },
  data() {
    const s = this.rule ? ruleToSentence(this.rule) : emptySentence(this.pack && this.pack.deviceType);
    return {
      severities: SEVERITIES, s, tick: 0,
      advanced: !!s.nested,
      advCross: s.nested && this.rule ? JSON.parse(JSON.stringify(this.rule.crossExpr)) : null,
    };
  },
  watch: {
    rule(nv) {
      this.s = nv ? ruleToSentence(nv) : emptySentence(this.pack && this.pack.deviceType);
      this.advanced = !!this.s.nested;
      this.advCross = this.s.nested && nv ? JSON.parse(JSON.stringify(nv.crossExpr)) : null;
      this.touch();
    },
  },
  computed: {
    sheetByType() { const m = {}; for (const x of this.sheets) m[x.deviceType] = x; return m; },
    variablesOfFirst() {
      const dt = (this.s.conditions[0] && this.s.conditions[0].deviceType) || (this.pack && this.pack.deviceType);
      const sh = this.sheetByType[dt]; return (sh && sh.variables) || [];
    },
    sevLabel() { return severityLabel(this.s.severity); },
    badge() { return severityBadge(this.s.severity); },
    trendUnit() { return (this.s.conditions[0] && this.s.conditions[0].unit) || ''; },
    deviceTypeLabel() { return (this.pack && this.pack.deviceType) || 'equipos'; },
    operators() { return OPERATORS; },
    opLabels() { return OPERATOR_LABELS; },
    activeMod() {
      if (this.s.temporal) return 'temporal';
      if (this.s.setpoint) return 'setpoint';
      if (this.s.trend) return 'trend';
      if (this.s.projection) return 'projection';
      if (this.s.spread) return 'spread';
      if (this.s.compare) return 'compare';
      if (this.s.dutyCycle) return 'dutyCycle';
      if (this.s.cumulative) return 'cumulative';
      if (this.s.stepJump) return 'stepJump';
      if (this.s.flatline) return 'flatline';
      if (this.s.staleness) return 'staleness';
      return null;
    },
    typeHint() {
      this.tick;
      if (this.advanced) return TYPE_HINT.cross;
      if (this.s.trend) return 'tendencia';
      if (this.s.projection) return 'proyección';
      if (this.s.spread) return 'desbalance';
      if (this.s.compare) return this.s.compare.kind === 'ratio' ? 'relación' : 'diferencia';
      if (this.s.dutyCycle) return 'uso %';
      if (this.s.cumulative) return 'acumulado';
      if (this.s.stepJump) return 'salto abrupto';
      if (this.s.flatline) return 'sensor clavado';
      if (this.s.staleness) return 'deja de reportar';
      return TYPE_HINT[inferType(this.s)] || '';
    },
    // Respaldo en lenguaje natural, unificado: cualquier cross (simple 2+ o
    // avanzado) pasa por describeCross (labels de ficha); D/S/C por summarize.
    naturalText() {
      this.tick;
      const rule = this.buildRule();
      if (rule.type === 'cross') return describeCross(rule.crossExpr, this.sheets, this.sevLabel);
      return { mode: 'sentence', sentence: `Se disparará una alarma de ${this.sevLabel} cuando ${summarize(rule, { sheets: this.sheets })}.`, lines: [] };
    },
    canSave() {
      if (!this.s.label) return false;
      if (this.advanced) return !!(this.advCross && Array.isArray(this.advCross.children) && this.advCross.children.length);
      const conds = this.s.conditions || [];
      if (!conds.length) return false;
      for (const c of conds) {
        if (!c.variable) return false;
        // spread SÍ usa c.value (umbral del desbalance); setpoint/trend/projection/compare no.
        if (!this.s.setpoint && !this.s.trend && !this.s.projection && !this.s.compare && (c.value === '' || c.value === null || c.value === undefined)) return false;
      }
      if (this.s.setpoint && !this.s.setpoint.variable) return false;
      if (this.s.temporal && (!(this.s.temporal.durationMin > 0) || !(this.s.temporal.count >= 1))) return false;
      if (this.s.trend && (!(this.s.trend.rate > 0) || !(this.s.trend.windowMin > 0))) return false;
      if (this.s.projection && (this.s.projection.target === '' || this.s.projection.target == null || !(this.s.projection.hoursThreshold > 0) || !(this.s.projection.windowMin > 0))) return false;
      if (this.s.compare && (!this.s.compare.variable2 || this.s.compare.value === '' || this.s.compare.value === null || this.s.compare.value === undefined)) return false;
      if (this.s.dutyCycle && !(this.s.dutyCycle.windowMin > 0)) return false;
      if (this.s.stepJump && !(this.s.stepJump.windowMin > 0)) return false;
      if (this.s.flatline && !(this.s.flatline.windowMin > 0)) return false;
      // staleness: sólo requiere la variable + el valor (minutos) — ya cubierto por el chequeo genérico.
      return true;
    },
  },
  methods: {
    touch() { this.tick++; },
    // Limpia todos los modificadores (S/C/M) y activa uno solo (garantiza exclusión).
    clearMods() { this.s.temporal = this.s.setpoint = this.s.trend = this.s.projection = this.s.spread = this.s.compare = this.s.dutyCycle = this.s.cumulative = this.s.stepJump = this.s.flatline = this.s.staleness = null; },
    addCondition() {
      this.s.conditions.push(emptyCondition((this.pack && this.pack.deviceType) || ''));
      this.clearMods(); this.touch();
    },
    removeCondition(i) { this.s.conditions.splice(i, 1); this.touch(); },
    toggleTemporal() { const on = !this.s.temporal; this.clearMods(); if (on) this.s.temporal = { durationMin: 5, count: 1 }; this.touch(); },
    toggleSetpoint() { const on = !this.s.setpoint; this.clearMods(); if (on) this.s.setpoint = { variable: '' }; this.touch(); },
    // M1 · tendencia (slope) y proyección (projection).
    toggleTrend() { const on = !this.s.trend; this.clearMods(); if (on) this.s.trend = { direction: 'down', rate: 0.3, windowMin: 10 }; this.touch(); },
    toggleProjection() { const on = !this.s.projection; this.clearMods(); if (on) this.s.projection = { target: '', hoursThreshold: 2, windowMin: 30 }; this.touch(); },
    // M2 · desbalance entre equipos (spread) y relación/diferencia (ratio/divergence).
    toggleSpread() { const on = !this.s.spread; this.clearMods(); if (on) { this.s.spread = true; if (this.s.conditions[0]) this.s.conditions[0].op = 'gt'; } this.touch(); },
    toggleCompare() { const on = !this.s.compare; this.clearMods(); if (on) this.s.compare = { kind: 'ratio', variable2: '', op: 'lt', value: '' }; this.touch(); },
    // M3 · % de uso (dutyCycle) y acumulado desde recarga (cumulativeSince).
    toggleDutyCycle() { const on = !this.s.dutyCycle; this.clearMods(); if (on) { this.s.dutyCycle = { windowMin: 60 }; if (this.s.conditions[0]) this.s.conditions[0].op = 'gt'; } this.touch(); },
    toggleCumulative() { const on = !this.s.cumulative; this.clearMods(); if (on) { this.s.cumulative = true; if (this.s.conditions[0]) this.s.conditions[0].op = 'gt'; } this.touch(); },
    // M4 · salto abrupto (stepJump), sensor clavado (flatline), deja de reportar (staleness).
    toggleStepJump() { const on = !this.s.stepJump; this.clearMods(); if (on) { this.s.stepJump = { windowMin: 10 }; if (this.s.conditions[0]) this.s.conditions[0].op = 'gte'; } this.touch(); },
    toggleFlatline() { const on = !this.s.flatline; this.clearMods(); if (on) { this.s.flatline = { windowMin: 5 }; if (this.s.conditions[0]) this.s.conditions[0].op = 'lte'; } this.touch(); },
    toggleStaleness() { const on = !this.s.staleness; this.clearMods(); if (on) { this.s.staleness = true; if (this.s.conditions[0]) this.s.conditions[0].op = 'gte'; } this.touch(); },
    // Convierte las condiciones planas en un árbol crossExpr y pasa a avanzado.
    toGrouped() {
      const dt = (this.pack && this.pack.deviceType) || '';
      this.advCross = {
        op: this.s.join === 'OR' ? 'OR' : 'AND',
        children: this.s.conditions.map(c => ({
          deviceType: c.deviceType || dt, variable: c.variable,
          condition: { op: c.op, value: coerceValue(c.value, c.variableType) },
        })),
      };
      this.advanced = true; this.touch();
    },
    toSimple() {
      this.s.conditions = [emptyCondition((this.pack && this.pack.deviceType) || '')];
      this.s.join = 'AND'; this.advCross = null; this.advanced = false; this.touch();
    },
    onAdvInput(node) { this.advCross = node; this.touch(); },
    buildRule() {
      if (!this.advanced) return sentenceToRule(this.s, this.pack, this.rule, this.editingIndex);
      const dt = (this.pack && this.pack.deviceType) || '';
      const ex = this.rule;
      const crossExpr = stripEditorKeys(JSON.parse(JSON.stringify(this.advCross || { op: 'AND', children: [] })));
      const rule = {
        ruleId: ex ? ex.ruleId : genRuleId(this.pack, dt, this.s.label, this.editingIndex),
        label: this.s.label,
        variableLabel: (ex && ex.variableLabel) || '',
        inferenceId: ex ? ex.inferenceId : genInferenceId(this.pack, this.s.label, this.editingIndex),
        type: 'cross', severity: this.s.severity, recommendation: this.s.recommendation || '',
        deviceType: dt, variable: firstLeafVar(crossExpr) || (ex && ex.variable) || 'combined',
        cooldownSec: (ex && ex.cooldownSec) || 300, condition: null, crossExpr,
      };
      if (ex) { if (ex.graceSec != null) rule.graceSec = ex.graceSec; if (ex.resolveGraceSec != null) rule.resolveGraceSec = ex.resolveGraceSec; }
      return rule;
    },
    save() { if (this.canSave) this.$emit('save', { rule: this.buildRule(), index: this.editingIndex }); },
  },
};
</script>

<style scoped>
.sentence-editor { padding: 4px 2px; }
.se-title { margin-bottom: 20px; font-weight: 600; }

/* ── pasos numerados con aire ── */
.se-step { display: flex; gap: 14px; margin-bottom: 22px; }
.se-num { flex: 0 0 26px; height: 26px; border-radius: 50%; background: rgba(0,191,154,0.16); color: #00806c; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.se-step-body { flex: 1; min-width: 0; }
.se-step-q { font-size: 13px; font-weight: 600; margin: 2px 0 12px; }

.se-join { margin-bottom: 10px; }
.se-mods { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.se-extra { margin: 10px 0 4px; padding: 9px 12px; border-radius: 9px; background: rgba(0,0,0,0.03); font-size: 0.9rem; line-height: 2; }
.se-mini { width: 70px; }
.se-dir { width: 88px; }
.se-cmp { width: 130px; }
.se-sp { width: 200px; }
.se-sev { width: 220px; }
.se-adv-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.9rem; }
.se-warn { color: #b0883a; font-size: 0.75rem; margin-top: 6px; }

/* ── divisor + confirmación ── */
.se-divider { height: 1px; background: var(--se-line, #e6e9f0); margin: 6px 0 18px; }
.se-confirm-h { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #8898aa; margin-bottom: 12px; }

.se-alarm { border: 1px solid #e6e9f0; border-left: 4px solid #8a94a6; border-radius: 10px; padding: 12px 14px; background: rgba(0,0,0,0.015); }
.se-alarm--critical { border-left-color: #fd5d93; }
.se-alarm--warning  { border-left-color: #ff8d72; }
.se-alarm--info     { border-left-color: #1d8cf8; }
.se-alarm-l1 { display: flex; align-items: center; gap: 8px; }
.se-alarm-lab { font-weight: 600; }
.se-alarm-l2 { font-size: 0.72rem; color: #8898aa; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.03em; }
.se-alarm-rec { font-size: 0.85rem; color: #00806c; margin-top: 7px; }

.se-nl { margin-top: 12px; padding: 10px 14px; border-radius: 10px; background: rgba(0,191,154,0.07); border-left: 3px solid #00bf9a; }
.se-nl-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; color: #00806c; font-weight: 600; margin-bottom: 5px; }
.se-nl-text { margin: 0; font-size: 0.9rem; line-height: 1.55; }
.se-nl-list { list-style: none; margin: 4px 0 0; padding: 0; }
.se-nl-list li { font-size: 0.85rem; line-height: 1.7; }
.se-nl-group { font-weight: 600; }

.se-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

/* botones del editor: chicos y sobrios */
.se-mods /deep/ .btn,
.se-actions /deep/ .btn { font-size: 0.72rem; padding: 7px 13px; border-radius: 8px; }
.se-mods /deep/ .btn i { font-size: 0.8rem; margin-right: 3px; }

/* modo oscuro (el tema por defecto es claro, DEC-REF-112) */
body:not(.white-content) .se-extra { background: rgba(255,255,255,0.04); }
body:not(.white-content) .se-alarm { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.1); }
body:not(.white-content) .se-divider { background: rgba(255,255,255,0.1); }
body:not(.white-content) .se-nl { background: rgba(0,191,154,0.12); }
body:not(.white-content) .se-nl-title, body:not(.white-content) .se-alarm-rec { color: #2ce0c0; }
</style>
