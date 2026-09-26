<template>
  <!-- DEC-REF-114 (#83) — editor-frase. Rediseño estético (Franco #83): pasos
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
              <base-button size="sm" :type="s.temporal ? 'primary' : 'default'" :disabled="!!s.setpoint" @click="toggleTemporal"><i class="fa fa-clock"></i> durante un tiempo</base-button>
              <base-button size="sm" :type="s.setpoint ? 'primary' : 'default'" :disabled="!!s.temporal" @click="toggleSetpoint"><i class="fa fa-sliders-h"></i> vs valor del equipo</base-button>
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
  describeCross,
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
    typeHint() { this.tick; return this.advanced ? TYPE_HINT.cross : (TYPE_HINT[inferType(this.s)] || ''); },
    // Respaldo en lenguaje natural, unificado: cualquier cross (simple 2+ o
    // avanzado) pasa por describeCross (labels de ficha); D/S/C por summarize.
    naturalText() {
      this.tick;
      const rule = this.buildRule();
      if (rule.type === 'cross') return describeCross(rule.crossExpr, this.sheets, this.sevLabel);
      return { mode: 'sentence', sentence: `Se disparará una alarma de ${this.sevLabel} cuando ${summarize(rule)}.`, lines: [] };
    },
    canSave() {
      if (!this.s.label) return false;
      if (this.advanced) return !!(this.advCross && Array.isArray(this.advCross.children) && this.advCross.children.length);
      const conds = this.s.conditions || [];
      if (!conds.length) return false;
      for (const c of conds) {
        if (!c.variable) return false;
        if (!this.s.setpoint && (c.value === '' || c.value === null || c.value === undefined)) return false;
      }
      if (this.s.setpoint && !this.s.setpoint.variable) return false;
      if (this.s.temporal && (!(this.s.temporal.durationMin > 0) || !(this.s.temporal.count >= 1))) return false;
      return true;
    },
  },
  methods: {
    touch() { this.tick++; },
    addCondition() {
      this.s.conditions.push(emptyCondition((this.pack && this.pack.deviceType) || ''));
      this.s.temporal = null; this.s.setpoint = null; this.touch();
    },
    removeCondition(i) { this.s.conditions.splice(i, 1); this.touch(); },
    toggleTemporal() { this.s.temporal = this.s.temporal ? null : { durationMin: 5, count: 1 }; if (this.s.temporal) this.s.setpoint = null; this.touch(); },
    toggleSetpoint() { this.s.setpoint = this.s.setpoint ? null : { variable: '' }; if (this.s.setpoint) this.s.temporal = null; this.touch(); },
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
