<template>
  <WidgetShell :config="config">
    <DataFreshness :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de dataFreshness.
// Espejo de ValueStatusEditor: presenter puro, guión neutro.
import WidgetShell   from '@/components/Widgets/WidgetShell.vue';
import DataFreshness from '@/components/Widgets/DataFreshness.vue';

export default {
  name: 'DataFreshnessEditor',
  components: { WidgetShell, DataFreshness },
  props: {
    config: { type: Object, default: () => ({}) },
  },
};
</script>
