<template>
  <WidgetShell :config="config">
    <MultiState :config="config" :value="sample" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de multiState.
// DEC-REF-107 (Paso 2, diseño): muestra el primer estado del catálogo (o '1')
// para que la preview refleje etiqueta + color de severidad configurados.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import MultiState  from '@/components/Widgets/MultiState.vue';

export default {
  name: 'MultiStateEditor',
  components: { WidgetShell, MultiState },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  computed: {
    sample() {
      const list = this.config.enumValues || [];
      return list.length ? list[0].value : '1';
    },
  },
};
</script>
