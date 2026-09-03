<template>
  <WidgetShell :config="config">
    <EquipmentAlarms context="editor" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — composición EDITOR de equipmentAlarms.
// El presenter muestra 2 mocks en contexto editor (no hay feed sin sitio).
import WidgetShell     from '@/components/Widgets/WidgetShell.vue';
import EquipmentAlarms from '@/components/Widgets/EquipmentAlarms.vue';

export default {
  name: 'EquipmentAlarmsEditor',
  components: { WidgetShell, EquipmentAlarms },
  props: {
    config: { type: Object, default: () => ({}) },
  },
};
</script>
