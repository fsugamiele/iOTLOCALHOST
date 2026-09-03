<template>
  <WidgetShell :config="config">
    <LiveValue :config="config" :presenter="ProjectedAutonomy" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición LIVE de projectedAutonomy.
// Espejo de ValueStatusLive: Shell + LiveValue + presenter puro.
import WidgetShell       from '@/components/Widgets/WidgetShell.vue';
import LiveValue         from '@/components/LiveValue.vue';
import ProjectedAutonomy from '@/components/Widgets/ProjectedAutonomy.vue';

export default {
  name: 'ProjectedAutonomyLive',
  components: { WidgetShell, LiveValue },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() { return { ProjectedAutonomy }; },
};
</script>
