<template>
  <WidgetShell :config="config">
    <LiveValue :config="config" :presenter="TankLevel" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición LIVE de tankLevel.
// Espejo de ValueStatusLive: Shell + LiveValue + presenter puro.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import LiveValue   from '@/components/LiveValue.vue';
import TankLevel   from '@/components/Widgets/TankLevel.vue';

export default {
  name: 'TankLevelLive',
  components: { WidgetShell, LiveValue },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() { return { TankLevel }; },
};
</script>
