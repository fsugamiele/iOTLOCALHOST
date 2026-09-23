<template>
  <WidgetShell :config="config">
    <NumericValue :config="config" :value="sample" :time="sampleTime" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 2) — composición EDITOR de la familia numérica.
// Inyecta un valor de MUESTRA acorde a la representación elegida para que la
// preview refleje la config gráfica (nivel, aguja, dígitos, color por umbral).
import WidgetShell  from '@/components/Widgets/WidgetShell.vue';
import NumericValue from '@/components/Widgets/NumericValue.vue';

export default {
  name: 'NumericEditor',
  components: { WidgetShell, NumericValue },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() {
    return { sampleTime: Date.now() - 45000 };
  },
  computed: {
    sample() {
      // Render efectivo: el tipo legacy `counter` (sin render) se muestra como contador.
      const render = this.config.render || (this.config.widget === 'counter' ? 'counter' : null);
      switch (render) {
        case 'tank':    return 62;
        case 'counter': return 12480;
        case 'gauge': {
          const max = Number(this.config.gaugeMax);
          return Number.isFinite(max) && max > 0 ? Math.round(max * 0.62) : 42;
        }
        default:        return 23.5;  // valueStatus / icon
      }
    },
  },
};
</script>
