<template>
  <WidgetShell :config="config">
    <LiveValue :config="config" :presenter="DataFreshness" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición LIVE de dataFreshness.
// Espejo de ValueStatusLive: Shell + LiveValue + presenter puro.
// LiveValue entrega `time` (publish o seed) — ES el dato de este widget.
import WidgetShell   from '@/components/Widgets/WidgetShell.vue';
import LiveValue     from '@/components/LiveValue.vue';
import DataFreshness from '@/components/Widgets/DataFreshness.vue';

export default {
  name: 'DataFreshnessLive',
  components: { WidgetShell, LiveValue },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() { return { DataFreshness }; },
};
</script>
