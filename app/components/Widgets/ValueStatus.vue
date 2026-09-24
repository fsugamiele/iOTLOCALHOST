<template>
  <span class="value-status" :class="'value-status--' + status">
    <template v-if="!hasData">
      <!-- DEC-REF-76-A (iv): tres estados. "no aplica" (context editor,
           no hay fuente) → guión neutro; "sin dato" (context live, valor
           null tras publish) → texto explícito. "esperando" lo maneja el
           wrapper LiveValue, no ValueStatus. -->
      <span v-if="context === 'editor'" class="value-status__na">—</span>
      <span v-else class="value-status__nodata">sin dato</span>
    </template>
    <template v-else-if="isNumeric">
      <span class="value-status__num">{{ display }}</span><small v-if="unit" class="ml-1 value-status__unit">{{ unit }}</small>
      <!-- DEC-REF-108 F4 (#80) — banda de rango normal del fabricante
           (factoryRange de la ficha, "min-max" — soporta negativos: "-58--42").
           El punto marca dónde cae el valor dentro del rango sano. -->
      <span v-if="range" class="value-status__range">
        <span class="value-status__range-track"></span>
        <span class="value-status__range-marker" :style="{ left: rangePct + '%' }"></span>
        <span class="value-status__range-ends">{{ range.min }} · {{ range.max }}</span>
      </span>
    </template>
    <template v-else-if="isBool">
      <span class="value-status__bool">{{ boolLabel }}</span>
    </template>
    <template v-else>
      <span class="value-status__raw">{{ value }}</span>
    </template>
  </span>
</template>

<script>
// DEC-REF-76 — widget (1) valueStatus, presentación PURA.
// Sin MQTT, sin store, sin fetch, sin mounted/beforeDestroy.
// Recibe value + config y renderiza. LiveValue lo envuelve para el path
// MQTT del site page; el resolver de widget lo usa como fallback DEC-REF-75 §2.
// DEC-REF-76-A: prop context distingue 'live' (hay fuente) vs 'editor'
// (no hay fuente por definición) para no afirmar "sin dato" cuando miente.

export default {
  name: 'ValueStatus',
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },  // 'live' | 'editor'
  },
  computed: {
    hasData() {
      // 0 es dato válido (contraejemplo: oil_pressure=0 con motor parado).
      // Solo null/undefined cuentan como "sin dato".
      return this.value !== null && this.value !== undefined;
    },
    isNumeric() {
      return this.config.variableType === 'float' || this.config.variableType === 'int';
    },
    isBool() {
      return this.config.variableType === 'bool';
    },
    unit() { return this.config.unit || ''; },
    decimalPlaces() {
      // Defensa en profundidad: Number.isFinite() en vez de `!= null`.
      // "" != null es TRUE y colapsaría toFixed a 0 decimales; null pasa
      // el gate correcto, pero un consumidor futuro que preserve "" (v-model
      // sobre input vacío) rompía la preview. Number.isFinite descarta
      // "", null, undefined, NaN — todo lo que no es un número real.
      if (Number.isFinite(this.config.decimalPlaces)) return this.config.decimalPlaces;
      if (this.config.variableType === 'float') return 1;
      if (this.config.variableType === 'int')   return 0;
      return null;
    },
    display() {
      const n = Number(this.value);
      if (!Number.isFinite(n)) return String(this.value);
      const dp = this.decimalPlaces;
      return dp != null ? n.toFixed(dp) : String(n);
    },
    boolLabel() {
      const v = this.value;
      return (v === true || v === 1 || v === '1' || v === 'true') ? 'Activo' : 'Inactivo';
    },
    thresholds() { return this.config.thresholds || {}; },
    // DEC-REF-108 F4 (#80) — parseo de factoryRange ("min-max", admite
    // negativos y decimales: "-58--42", "10.5-14.5"). null si no parsea.
    range() {
      const raw = this.config.factoryRange;
      if (!raw || typeof raw !== 'string') return null;
      const m = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!m) return null;
      const min = Number(m[1]), max = Number(m[2]);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
      return { min, max };
    },
    rangePct() {
      if (!this.range || !this.hasData) return 0;
      const n = Number(this.value);
      if (!Number.isFinite(n)) return 0;
      const pct = ((n - this.range.min) / (this.range.max - this.range.min)) * 100;
      return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
    },
    hasAnyThreshold() {
      const t = this.thresholds;
      return t.criticalLow != null || t.warningLow != null ||
             t.warningHigh != null || t.criticalHigh != null;
    },
    // Reglas DEC-REF-76 (iii):
    //   sin dato          → 'nodata' (gris)
    //   no numérico       → 'unknown' (sin color operativo)
    //   sin umbrales      → 'unknown' (SIN color: afirmar "ok" sin criterio es
    //                        reportar algo que no se sabe)
    //   con umbrales      → críticos primero, warning después, si no cae → ok
    // La luz NO informa frescura (eso es widget 8 dataFreshness).
    status() {
      if (!this.hasData)         return this.context === 'editor' ? 'na' : 'nodata';
      if (!this.isNumeric)       return 'unknown';
      if (!this.hasAnyThreshold) return 'unknown';
      const n = Number(this.value);
      if (!Number.isFinite(n))   return 'unknown';
      const t = this.thresholds;
      if (t.criticalLow  != null && n < t.criticalLow)  return 'critical';
      if (t.criticalHigh != null && n > t.criticalHigh) return 'critical';
      if (t.warningLow   != null && n < t.warningLow)   return 'warning';
      if (t.warningHigh  != null && n > t.warningHigh)  return 'warning';
      return 'ok';
    },
  },
};
</script>

<style scoped>
/* Cromo/tipografía base en azul primario (DEC-REF-70 g). */
.value-status              { color: #00bf9a; }
.value-status__unit        { color: #6b7280; }
.value-status__nodata      { color: #6b7280; opacity: 0.7; font-style: italic; }
.value-status__na          { color: #6b7280; opacity: 0.7; }

/* Estado operativo — verde/ámbar/rojo reservado a esto (DEC-REF-70 g). */
.value-status--ok          { color: #00bf9a; }
.value-status--warning     { color: #ff8d72; }
.value-status--critical    { color: #fd5d93; }

/* Sin umbrales cargados o valor no evaluable → cromo neutro (azul base). */
.value-status--unknown     { color: #00bf9a; }
.value-status--nodata      { color: #6b7280; }
.value-status--na          { color: #6b7280; }

/* DEC-REF-108 F4 (#80) — banda de rango normal (factoryRange de la ficha). */
.value-status__range {
  display: block;
  position: relative;
  height: 4px;
  margin-top: 6px;
}
.value-status__range-track {
  position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
}
.white-content .value-status__range-track { background: rgba(0, 0, 0, 0.12); }
.value-status__range-marker {
  position: absolute; top: -2px;
  width: 4px; height: 8px;
  border-radius: 2px;
  background: currentColor;
  transform: translateX(-50%);
}
.value-status__range-ends {
  position: absolute; top: 8px; left: 0; right: 0;
  font-size: 0.62em; color: #6b7280;
  display: block; text-align: center;
}
</style>
