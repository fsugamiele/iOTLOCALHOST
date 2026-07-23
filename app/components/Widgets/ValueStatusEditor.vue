<template>
  <WidgetShell :config="config">
    <ValueStatus :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-76-A (vi) — composición EDITOR del widget valueStatus.
// Shell + presenter puro con context='editor' (no hay fuente por
// definición → guión neutro en vez de "sin dato"). Se instancia en
// templates.vue (preview + lista) donde no hay device seleccionado.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import ValueStatus from '@/components/Widgets/ValueStatus.vue';

export default {
  name: 'ValueStatusEditor',
  components: { WidgetShell, ValueStatus },
  props: {
    config: { type: Object, required: true },
  },
};
</script>
