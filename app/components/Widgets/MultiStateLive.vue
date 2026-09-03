<template>
  <WidgetShell :config="config">
    <LiveValue :config="config" :presenter="MultiState" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición LIVE de multiState.
// Espejo de ValueStatusLive: Shell + LiveValue + presenter puro.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import LiveValue   from '@/components/LiveValue.vue';
import MultiState  from '@/components/Widgets/MultiState.vue';

export default {
  name: 'MultiStateLive',
  components: { WidgetShell, LiveValue },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() { return { MultiState }; },
};
</script>
