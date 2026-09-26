<template>
  <!-- DEC-REF-114 (#83, B1) — card de regla: resumen legible + severidad +
       recomendación + acciones. El "Modo experto" abre el form completo
       (cross/C/S/tiempos). El toggle on/off se difiere (el modelo no tiene
       campo `enabled` aún — adenda B1, va con B4). -->
  <div class="rule-card" :class="'rule-card--' + rule.severity">
    <div class="rule-card__head">
      <span class="rule-card__title">{{ rule.label || rule.ruleId }}</span>
      <span class="badge" :class="badge">{{ sevLabel }}</span>
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
    // Etiqueta de tipo secundaria (disenso de Motor: trazabilidad, no protagonista).
    typeHint() {
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
.rule-card__actions { display: flex; gap: 4px; }

/* Modo oscuro: el theme por defecto es claro (DEC-REF-112); en dark se invierte. */
body:not(.white-content) .rule-card { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
</style>
