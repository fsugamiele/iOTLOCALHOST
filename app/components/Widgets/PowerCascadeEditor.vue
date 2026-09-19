<template>
  <WidgetShell :config="config">
    <PowerCascade :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 5) — composición EDITOR de powerCascade (cadena de muestra).
import WidgetShell  from '@/components/Widgets/WidgetShell.vue';
import PowerCascade from '@/components/Widgets/PowerCascade.vue';

export default {
  name: 'PowerCascadeEditor',
  components: { WidgetShell, PowerCascade },
  props: { config: { type: Object, default: () => ({}) } },
};
</script>
