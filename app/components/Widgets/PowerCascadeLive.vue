<template>
  <WidgetShell :config="config">
    <MultiLiveValue :config="config" :presenter="PowerCascade" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 5) — composición LIVE de powerCascade (multi-fuente).
import WidgetShell    from '@/components/Widgets/WidgetShell.vue';
import MultiLiveValue from '@/components/MultiLiveValue.vue';
import PowerCascade   from '@/components/Widgets/PowerCascade.vue';

export default {
  name: 'PowerCascadeLive',
  components: { WidgetShell, MultiLiveValue },
  props: { config: { type: Object, default: () => ({}) } },
  data() { return { PowerCascade }; },
};
</script>
