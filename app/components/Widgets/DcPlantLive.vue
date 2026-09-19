<template>
  <WidgetShell :config="config">
    <MultiLiveValue :config="config" :presenter="DcPlant" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 5) — composición LIVE de dcPlant (multi-fuente).
import WidgetShell    from '@/components/Widgets/WidgetShell.vue';
import MultiLiveValue from '@/components/MultiLiveValue.vue';
import DcPlant        from '@/components/Widgets/DcPlant.vue';

export default {
  name: 'DcPlantLive',
  components: { WidgetShell, MultiLiveValue },
  props: { config: { type: Object, default: () => ({}) } },
  data() { return { DcPlant }; },
};
</script>
