<template>
  <WidgetShell :config="config">
    <SiteMap :config="config" context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-108 F5 (#80) — composición EDITOR de siteMap (plano de muestra).
import WidgetShell from '@/components/Widgets/WidgetShell.vue';
import SiteMap     from '@/components/Widgets/SiteMap.vue';

export default {
  name: 'SiteMapEditor',
  components: { WidgetShell, SiteMap },
  props: { config: { type: Object, default: () => ({}) } },
};
</script>
