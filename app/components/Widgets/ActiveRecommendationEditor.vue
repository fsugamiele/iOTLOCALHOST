<template>
  <WidgetShell :config="config">
    <ActiveRecommendation context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 5) — composición EDITOR de activeRecommendation.
// El presenter muestra una recomendación de muestra en contexto editor (no hay
// feed sin sitio).
import WidgetShell          from '@/components/Widgets/WidgetShell.vue';
import ActiveRecommendation from '@/components/Widgets/ActiveRecommendation.vue';

export default {
  name: 'ActiveRecommendationEditor',
  components: { WidgetShell, ActiveRecommendation },
  props: {
    config: { type: Object, default: () => ({}) },
  },
};
</script>
