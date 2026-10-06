<template>
  <!-- DEC-REF-116 (#83, B1) — card de regla: resumen legible + severidad +
       recomendación + acciones. El "Modo experto" abre el form completo
       (cross/C/S/tiempos). DEC-REF-121 (spec_interruptor_enabled): interruptor
       on/off quirúrgico (emite `toggle`; el PATCH no pasa por el editor-frase). -->
  <div class="rule-card" :class="['rule-card--' + rule.severity, { 'rule-card--off': !isEnabled }]">
    <div class="rule-card__head">
      <span class="rule-card__title">{{ rule.label || rule.ruleId }}</span>
      <span class="rule-card__head-right">
        <span v-if="!isEnabled" class="rule-card__off-chip" :title="offTitle">fuera de circulación</span>
        <span class="badge" :class="badge">{{ sevLabel }}</span>
      </span>
    </div>

    <div class="rule-card__body">{{ summary }}</div>

    <div v-if="rule.recommendation" class="rule-card__rec">
      <i class="fa fa-wrench"></i> {{ rule.recommendation }}
    </div>
    <div v-else class="rule-card__norec">
      <i class="fa fa-exclamation-triangle"></i> Sin recomendación
    </div>

    <div class="rule-card__foot">
      <span class="rule-card__type" :title="'tipo motor: ' + rule.type">{{ typeHint }}</span>
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
import { summarize, severityLabel, severityBadge } from '@/components/rules/ruleSentence.js';

export default {
  name: 'RuleCard',
  props: {
    rule:  { type: Object, required: true },
    index: { type: Number, required: true },
    sheets: { type: Array, default: () => [] },
  },
  computed: {
    summary()  { return summarize(this.rule, { sheets: this.sheets }); },
    sevLabel() { return severityLabel(this.rule.severity); },
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
        const mm = { slope: 'tendencia', projection: 'proyección', acceleration: 'aceleración', spread: 'desbalance', ratio: 'relación', divergence: 'diferencia', dutyCycle: 'uso %', cumulativeSince: 'acumulado', accumulator: 'acumulador', stepJump: 'salto abrupto', flatline: 'sensor clavado', staleness: 'deja de reportar', variance: 'inestable', baseline: 'fuera de lo normal' };
        return mm[this.rule.metric] || 'vigilancia avanzada';
      }
      const m = { D: 'umbral', cross: 'combinada', C: 'contra setpoint', S: 'en el tiempo' };
      return m[this.rule.type] || this.rule.type;
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
  margin-bottom: 12px;
  background: rgba(0, 0, 0, 0.015);
}
.rule-card--critical { border-left-color: #fd5d93; }
.rule-card--warning  { border-left-color: #ff8d72; }
.rule-card--info     { border-left-color: #1d8cf8; }

.rule-card__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.rule-card__title { font-weight: 600; }
.rule-card__body { margin-top: 6px; font-size: 0.9rem; }
.rule-card__rec  { margin-top: 6px; font-size: 0.8rem; color: #00997e; }
.rule-card__norec { margin-top: 6px; font-size: 0.78rem; color: #b0883a; opacity: 0.85; }
.rule-card__foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
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
body:not(.white-content) .rule-card { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
</style>
