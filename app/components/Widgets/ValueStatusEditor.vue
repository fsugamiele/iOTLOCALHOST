<template>
  <WidgetShell :config="config">
    <ValueStatus :config="config" :value="sample" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-76-A (vi) — composición EDITOR del widget valueStatus.
// DEC-REF-107 (Paso 2, diseño): inyecta un valor de MUESTRA en contexto
// editor para que la preview refleje la config gráfica (color por umbral,
// unidad, decimales) en vez del guión neutro. El sample varía por tipo.
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import ValueStatus from '@/components/Widgets/ValueStatus.vue';

export default {
  name: 'ValueStatusEditor',
  components: { WidgetShell, ValueStatus },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  computed: {
    sample() {
      switch (this.config.variableType) {
        case 'bool':        return true;
        case 'categorical': return 'OK';
        case 'int':         return 42;
        default:            return 23.5;  // float
      }
    },
  },
};
</script>
