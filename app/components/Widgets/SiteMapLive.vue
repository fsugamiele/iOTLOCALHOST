<template>
  <WidgetShell :config="config">
    <MultiLiveValue :config="config" :presenter="SiteMap" />
  </WidgetShell>
</template>

<script>
// DEC-REF-108 F5 (#80) — composición LIVE de siteMap (multi-fuente, mismo
// andamiaje que PowerCascadeLive).
import WidgetShell    from '@/components/Widgets/WidgetShell.vue';
import MultiLiveValue from '@/components/MultiLiveValue.vue';
import SiteMap        from '@/components/Widgets/SiteMap.vue';

export default {
  name: 'SiteMapLive',
  components: { WidgetShell, MultiLiveValue },
  props: { config: { type: Object, default: () => ({}) } },
  data() { return { SiteMap }; },
};
</script>
