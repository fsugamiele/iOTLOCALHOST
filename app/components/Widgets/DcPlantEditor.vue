<template>
  <WidgetShell :config="config">
    <DcPlant :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 5) — composición EDITOR de dcPlant (métricas de muestra).
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import DcPlant     from '@/components/Widgets/DcPlant.vue';

export default {
  name: 'DcPlantEditor',
  components: { WidgetShell, DcPlant },
  props: { config: { type: Object, default: () => ({}) } },
};
</script>
