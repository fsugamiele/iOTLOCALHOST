<template>
  <div class="counter-pump">
    <template v-if="hasData">
      <div class="counter-pump__head">
        <i class="fa fa-gas-pump counter-pump__pump"></i>
        <span v-if="config.variableFullName" class="counter-pump__label">{{ config.variableFullName }}</span>
      </div>
      <div class="counter-pump__display">
        <span
          v-for="(ch, i) in digits"
          :key="i"
          class="counter-pump__digit"
          :class="{ 'counter-pump__digit--sep': ch === '.' || ch === ',' }"
        >{{ ch }}</span>
        <span v-if="unit" class="counter-pump__unit">{{ unit }}</span>
      </div>
    </template>
    <template v-else>
      <span v-if="context === 'editor'" class="counter-pump__na">—</span>
      <span v-else class="counter-pump__nodata">sin dato</span>
    </template>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 2) — REPRESENTACIÓN `counter` de la familia numérica.
// Contador de dígitos mecánicos estilo surtidor de gasoil, para acumuladores
// (litros despachados, horas de marcha, kWh). Sin ECharts: dígitos en cajas.
export default {
  name: 'CounterPump',
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined && Number.isFinite(Number(this.value));
    },
    unit() { return this.config.unit || ''; },
    decimals() {
      return Number.isFinite(this.config.decimalPlaces) ? this.config.decimalPlaces : 0;
    },
    formatted() {
      const n = Number(this.value);
      // Separador de miles + decimales configurados.
      return n.toLocaleString('es-AR', {
        minimumFractionDigits: this.decimals,
        maximumFractionDigits: this.decimals,
      });
    },
    digits() {
      return this.formatted.split('');
    },
  },
};
</script>

<style scoped>
.counter-pump {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.counter-pump__head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9aa5b1;
  font-size: 0.8em;
}
.counter-pump__pump { color: #ff8d72; }
.counter-pump__display {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 8px 10px;
  background: #0b0f19;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
  flex-wrap: wrap;
}
.counter-pump__digit {
  font-family: "Courier New", monospace;
  font-weight: 700;
  font-size: 1.6em;
  color: #ffb648;
  background: #17130a;
  border-radius: 4px;
  padding: 2px 6px;
  min-width: 0.8em;
  text-align: center;
  text-shadow: 0 0 8px rgba(255, 182, 72, 0.5);
}
.counter-pump__digit--sep {
  background: transparent;
  padding: 2px 1px;
  text-shadow: none;
  min-width: auto;
}
.counter-pump__unit {
  margin-left: 6px;
  color: #9aa5b1;
  font-size: 0.75em;
  align-self: flex-end;
  padding-bottom: 4px;
}
.counter-pump__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
.counter-pump__na     { color: #6b7280; opacity: 0.7; font-size: 1.4em; }
</style>
