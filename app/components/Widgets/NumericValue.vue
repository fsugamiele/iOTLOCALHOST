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

const RENDERERS = {
  valueStatus: ValueStatus,
  gauge:       Gauge,
  tank:        TankLevel,
  counter:     CounterPump,
  icon:        IconValue,
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
    // Fallback a valueStatus si render no está definido/known (compat).
    sub() { return RENDERERS[this.config.render] || ValueStatus; },
  },
};
</script>
