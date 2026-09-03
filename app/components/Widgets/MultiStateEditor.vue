<template>
  <WidgetShell :config="config">
    <MultiState :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de multiState.
// Espejo de ValueStatusEditor: presenter puro, guión neutro.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import MultiState  from '@/components/Widgets/MultiState.vue';

export default {
  name: 'MultiStateEditor',
  components: { WidgetShell, MultiState },
  props: {
    config: { type: Object, default: () => ({}) },
  },
};
</script>
