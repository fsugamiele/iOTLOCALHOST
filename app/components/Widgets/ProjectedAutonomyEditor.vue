<template>
  <WidgetShell :config="config">
    <ProjectedAutonomy :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de projectedAutonomy.
// Espejo de ValueStatusEditor: presenter puro, guión neutro.
import WidgetShell       from '@/components/Widgets/WidgetShell.vue';
import ProjectedAutonomy from '@/components/Widgets/ProjectedAutonomy.vue';

export default {
  name: 'ProjectedAutonomyEditor',
  components: { WidgetShell, ProjectedAutonomy },
  props: {
    config: { type: Object, default: () => ({}) },
  },
};
</script>
