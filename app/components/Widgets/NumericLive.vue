<template>
  <WidgetShell :config="config">
    <LiveValue :config="config" :presenter="NumericValue" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 2) — composición LIVE de la familia numérica.
// Shell + LiveValue (fuente MQTT) + dispatcher NumericValue (elige la visual).
import WidgetShell  from '@/components/Widgets/WidgetShell.vue';
import LiveValue    from '@/components/LiveValue.vue';
import NumericValue from '@/components/Widgets/NumericValue.vue';

export default {
  name: 'NumericLive',
  components: { WidgetShell, LiveValue },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() { return { NumericValue }; },
};
</script>
