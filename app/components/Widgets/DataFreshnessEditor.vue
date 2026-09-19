<template>
  <WidgetShell :config="config">
    <DataFreshness :config="config" :time="sampleTime" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de dataFreshness.
// DEC-REF-107 (Paso 2, diseño): inyecta un timestamp de muestra (~45 s atrás)
// para que la preview muestre "hace 45 s" con su color por demora.
import WidgetShell   from '@/components/Widgets/WidgetShell.vue';
import DataFreshness from '@/components/Widgets/DataFreshness.vue';

export default {
  name: 'DataFreshnessEditor',
  components: { WidgetShell, DataFreshness },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() {
    return { sampleTime: Date.now() - 45000 };
  },
};
</script>
