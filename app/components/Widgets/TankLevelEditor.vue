<template>
  <WidgetShell :config="config">
    <TankLevel :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de tankLevel.
// Espejo de ValueStatusEditor: presenter puro, guión neutro.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import TankLevel   from '@/components/Widgets/TankLevel.vue';

export default {
  name: 'TankLevelEditor',
  components: { WidgetShell, TankLevel },
  props: {
    config: { type: Object, default: () => ({}) },
  },
};
</script>
