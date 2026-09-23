<template>
  <component :is="sub" :value="value" :time="time" :config="config" :context="context" />
</template>

<script>
// DEC-REF-107 (Paso 2) — DISPATCHER de la familia numérica.
// Presenter puro que delega en la representación elegida por `config.render`.
// Desacople representación↔tipo: un solo tipo `numeric` con varias visuales.
import ValueStatus from '@/components/Widgets/ValueStatus.vue';
import Gauge       from '@/components/Widgets/Gauge.vue';
import TankLevel   from '@/components/Widgets/TankLevel.vue';
import CounterPump from '@/components/Widgets/CounterPump.vue';
import IconValue   from '@/components/Widgets/IconValue.vue';
import Sparkline   from '@/components/Widgets/Sparkline.vue';

const RENDERERS = {
  valueStatus: ValueStatus,
  gauge:       Gauge,
  tank:        TankLevel,
  counter:     CounterPump,
  icon:        IconValue,
  sparkline:   Sparkline,
};

export default {
  name: 'NumericValue',
  props: {
    value:   { default: null },
    time:    { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    // Representación efectiva. `numeric` la trae en config.render; el tipo
    // legacy `counter` (sin render) se dibuja como contador surtidor — así los
    // widgets counter ya existentes dejan de caer al fallback valueStatus.
    effectiveRender() {
      return this.config.render || (this.config.widget === 'counter' ? 'counter' : null);
    },
    // Fallback a valueStatus si render no está definido/known (compat).
    sub() { return RENDERERS[this.effectiveRender] || ValueStatus; },
  },
};
</script>
