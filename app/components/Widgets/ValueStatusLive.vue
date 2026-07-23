<template>
  <WidgetShell :config="config">
    <LiveValue :config="config" :presenter="ValueStatus" />
  </WidgetShell>
</template>

<script>
// DEC-REF-76-A (vi) — composición LIVE del widget valueStatus.
// Shell + fuente MQTT + presenter puro. Se instancia en contextos donde
// hay dispositivo y stream (dashboard-admin, futuras vistas de site que
// usen el resolver). Fallback DEC-REF-75 §2 para tipos del catálogo no
// construidos aún.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import LiveValue   from '@/components/LiveValue.vue';
import ValueStatus from '@/components/Widgets/ValueStatus.vue';

export default {
  name: 'ValueStatusLive',
  components: { WidgetShell, LiveValue },
  props: {
    config: { type: Object, required: true },
  },
  data() { return { ValueStatus }; },
};
</script>
