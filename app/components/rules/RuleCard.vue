<template>
  <!-- DEC-REF-116 (#83, B1) — card de regla: resumen legible + severidad +
       recomendación + acciones. El "Modo experto" abre el form completo
       (cross/C/S/tiempos). DEC-REF-121 (spec_interruptor_enabled): interruptor
       on/off quirúrgico (emite `toggle`; el PATCH no pasa por el editor-frase). -->
  <div class="rule-card" :class="['rule-card--' + rule.severity, { 'rule-card--off': !isEnabled }]">
    <div class="rule-card__head">
      <span class="rule-card__title">{{ labelText || 'Regla sin nombre' }}</span>
      <span class="rule-card__head-right">
        <span v-if="!isEnabled" class="rule-card__off-chip" :title="offTitle">fuera de circulación</span>
        <span v-if="ahora" class="rule-card__now" :class="'rule-card__now--' + ahora.cls" :title="ahora.detalle">{{ ahora.texto }}</span>
        <span class="rule-card__sev" :class="'rule-card__sev--' + (rule.severity || 'info')">{{ sevLabel }}</span>
      </span>
    </div>

    <div class="rule-card__body">{{ summary }}</div>

    <div v-if="rule.recommendation" class="rule-card__rec">
      <i class="fa fa-wrench"></i> {{ recText }}
    </div>
    <div v-else class="rule-card__norec">
      <i class="fa fa-exclamation-triangle"></i> Sin recomendación
    </div>

    <div class="rule-card__meta">{{ tiempos }}<template v-if="ultima"> · {{ ultima }}</template></div>

    <div class="rule-card__foot">
      <span class="rule-card__type">{{ typeHint }}</span>
      <span class="rule-card__actions">
        <label class="rc-switch" :title="isEnabled ? 'En circulación — clic para sacar de circulación' : 'Fuera de circulación — clic para reactivar'">
          <input type="checkbox" :checked="isEnabled" @change="$emit('toggle', { index, enabled: $event.target.checked })">
          <span class="rc-sl"></span>
        </label>
        <base-button size="sm" type="info" @click="$emit('edit', index)" title="Editar">
          <i class="tim-icons icon-pencil"></i>
        </base-button>
        <base-button size="sm" type="danger" @click="$emit('delete', index)" title="Borrar">
          <i class="tim-icons icon-simple-remove"></i>
        </base-button>
      </span>
    </div>
  </div>
</template>

<script>
import { summarize, severityLabel, severityBadge, fillThresholdText } from '@/components/rules/ruleSentence.js';

export default {
  name: 'RuleCard',
  props: {
    rule:  { type: Object, required: true },
    index: { type: Number, required: true },
    sheets: { type: Array, default: () => [] },
    // spec_editor_reglas_v2 (Qi2) — resumen de "Ahora": { texto, cls, detalle }.
    ahora: { type: Object, default: null },
    // Último aviso en palabras ("último aviso hace 12 min" / "sin avisos en 30 días"); null = sin dato.
    ultima: { type: String, default: null },
  },
  computed: {
    summary()  { return summarize(this.rule, { sheets: this.sheets }); },
    // {umbral} → valor vigente (ficha o literal) — mismo criterio que el motor.
    labelText() { return fillThresholdText(this.rule.label, this.rule, this.sheets); },
    recText()   { return fillThresholdText(this.rule.recommendation, this.rule, this.sheets); },
    sevLabel() { return severityLabel(this.rule.severity); },
    tiempos() {
      if (this.rule.type === 'S') return 'Cuenta eventos en el tiempo';
      const cierre = this.rule.reset_behavior === 'manual' ? 'espera confirmación' : 'se cierra sola';
      return `Avisa tras ${Number(this.rule.graceSec) || 0} s · ${cierre}`;
    },
    badge()    { return severityBadge(this.rule.severity); },
    // DEC-REF-121 — enabled !== false (histórico sin el campo = en circulación).
    isEnabled() { return this.rule.enabled !== false; },
    offTitle() {
      if (this.isEnabled) return '';
      const by = this.rule.disabledBy ? ' por ' + this.rule.disabledBy : '';
      const rs = this.rule.disabledReason ? ' · ' + this.rule.disabledReason : '';
      return 'Fuera de circulación' + by + rs;
    },
    // Etiqueta de tipo secundaria (disenso de Motor: trazabilidad, no protagonista).
    typeHint() {
      if (this.rule.type === 'M') {
        const mm = { slope: 'tendencia', projection: 'proyección', acceleration: 'aceleración', spread: 'desbalance', ratio: 'relación', divergence: 'diferencia', dutyCycle: 'uso %', cumulativeSince: 'caída acumulada', accumulator: 'vida útil', stepJump: 'salto abrupto', flatline: 'sensor clavado', staleness: 'deja de reportar', variance: 'inestable', baseline: 'fuera de lo normal' };
        return mm[this.rule.metric] || 'vigilancia avanzada';
      }
      const m = { D: 'umbral', cross: 'combinada', C: 'contra el límite del equipo', S: 'en el tiempo' };
      return m[this.rule.type] || 'regla';
    },
  },
};
</script>

<style scoped>
.rule-card {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-left: 4px solid #8a94a6;
  border-radius: 10px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.015);
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}
.rule-card--critical { border-left-color: #d93a46; }
.rule-card--warning  { border-left-color: #e8b730; }
.rule-card--info     { border-left-color: #3b82c4; }

.rule-card__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.rule-card__title { font-weight: 600; }
.rule-card__body { margin-top: 6px; font-size: 0.9rem; }
.rule-card__rec  { margin-top: 6px; font-size: 0.8rem; color: #00997e; }
.rule-card__norec { margin-top: 6px; font-size: 0.78rem; color: #b0883a; opacity: 0.85; }
.rule-card__foot { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.07); }
.rule-card__meta { margin: 8px 0 10px; font-size: 0.78rem; opacity: 0.7; }
.rule-card__sev { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
.rule-card__sev--info { background: #3b82c4; color: #fff; }
.rule-card__sev--warning { background: #e8b730; color: #2a1f00; }
.rule-card__sev--critical { background: #d93a46; color: #fff; }
.rule-card__head { flex-wrap: wrap; }
.rule-card__head-right { flex-wrap: wrap; }
.rule-card__type { font-size: 0.7rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.03em; }
.rule-card__actions { display: flex; gap: 6px; align-items: center; }
.rule-card__head-right { display: flex; align-items: center; gap: 8px; }

/* DEC-REF-121 — fuera de circulación + interruptor on/off */
.rule-card--off { opacity: 0.55; }
.rule-card--off .rule-card__title { text-decoration: line-through; }
.rule-card__off-chip { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; color: #b0883a; border: 1px solid currentColor; border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.rc-switch { position: relative; display: inline-block; width: 38px; height: 21px; }
.rc-switch input { opacity: 0; width: 0; height: 0; }
.rc-sl { position: absolute; inset: 0; background: #c3ccd6; border-radius: 999px; cursor: pointer; transition: .2s; }
.rc-sl::before { content: ""; position: absolute; height: 15px; width: 15px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.rc-switch input:checked + .rc-sl { background: #00997e; }
.rc-switch input:checked + .rc-sl::before { transform: translateX(17px); }

/* Modo oscuro: el theme por defecto es claro (DEC-REF-112); en dark se invierte. */
.rule-card__now { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 3px 9px; margin-right: 6px; white-space: nowrap; }
.rule-card__now--vig { background: rgba(0,0,0,0.05); color: #55706b; }
.rule-card__now--obs { background: #fbf0d9; color: #a86a00; }
.rule-card__now--ala { background: #f0727a; color: #2a0b0e; }
.rule-card__now--sin { background: #fbe3e5; color: #b4232c; }
body:not(.white-content) .rule-card__now--vig { background: rgba(255,255,255,0.06); color: #b4c6c1; }
body:not(.white-content) .rule-card { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
body:not(.white-content) .rule-card__foot { border-top-color: rgba(255,255,255,0.08); }
</style>
