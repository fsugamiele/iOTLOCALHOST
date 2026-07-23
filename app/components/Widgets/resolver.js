// DEC-REF-76 (iv) — resolver tipo→componente.
// Mapa a REFERENCIAS de componente (no strings). Los 4 legacy no están en
// plugins/globalComponents.js: importamos explícito acá.
// Fallback firmado en DEC-REF-75 §2: todo tipo del catálogo sin componente
// construido → ValueStatus, sin error ni crash.

import Rtnumberchart from '@/components/Widgets/Rtnumberchart.vue';
import Iotswitch     from '@/components/Widgets/Iotswitch.vue';
import Iotbutton     from '@/components/Widgets/Iotbutton.vue';
import Iotindicator  from '@/components/Widgets/Iotindicator.vue';
import ValueStatus   from '@/components/Widgets/ValueStatus.vue';

const REGISTRY = {
  // Legacy — intactos por retrocompatibilidad.
  numberchart: Rtnumberchart,
  switch:      Iotswitch,
  button:      Iotbutton,
  indicator:   Iotindicator,
  // Catálogo DEC-REF-74/74-A — solo valueStatus construido en #52.
  valueStatus: ValueStatus,
  // Cuando se construya un tipo del catálogo (tankLevel, counter, multiState,
  // equipmentAlarms, miniTrend, projectedAutonomy, dataFreshness,
  // activeRecommendation, dcPlant, powerCascade, booleanDwell), sumarlo acá.
};

export function resolveWidget(type) {
  return REGISTRY[type] || ValueStatus;
}

export default resolveWidget;
