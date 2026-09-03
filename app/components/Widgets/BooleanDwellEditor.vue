<template>
  <WidgetShell :config="config">
    <BooleanDwell :windowHours="windowHours" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de booleanDwell.
// Presenter puro sin valor → guión neutro. dwellSince no aplica en
// editor (no hay historial que observar); la ventana configurada sí
// viaja para que el preview respete la config del widget.
import WidgetShell  from '@/components/Widgets/WidgetShell.vue';
import BooleanDwell from '@/components/Widgets/BooleanDwell.vue';

export default {
  name: 'BooleanDwellEditor',
  components: { WidgetShell, BooleanDwell },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  computed: {
    windowHours() {
      const h = Number(this.config.dwellWindowHours);
      return Number.isFinite(h) && h > 0 ? h : 24;
    },
  },
};
</script>
