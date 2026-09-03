// DEC-REF-76 (iv) + DEC-REF-76-A (ii) — resolver tipo→componente CON CONTEXTO.
// Firma: resolveWidget(type, { context }) con context ∈ 'live' | 'editor'.
// Mapa a REFERENCIAS de componente (no strings). Los 4 legacy no están en
// plugins/globalComponents.js: importamos explícito acá.
//
// Los 4 legacy son AGNÓSTICOS al contexto (su modelo interno maneja su ciclo,
// se auto-encascaran). Los tipos del catálogo se resuelven a composiciones
// distintas por contexto:
//   'live'   → Live composition (WidgetShell + LiveValue + presenter puro)
//   'editor' → Editor composition (WidgetShell + presenter con context='editor')
//
// Fallback DEC-REF-75 §2: todo tipo del catálogo sin componente construido
// resuelve a ValueStatus{Live,Editor} — el dato queda correcto desde el día
// uno; la UI lo alcanza cuando se construyan las otras composiciones.

import Rtnumberchart          from '@/components/Widgets/Rtnumberchart.vue';
import Iotswitch              from '@/components/Widgets/Iotswitch.vue';
import Iotbutton              from '@/components/Widgets/Iotbutton.vue';
import Iotindicator           from '@/components/Widgets/Iotindicator.vue';
import ValueStatusLive        from '@/components/Widgets/ValueStatusLive.vue';
import ValueStatusEditor      from '@/components/Widgets/ValueStatusEditor.vue';
// DEC-REF-98 D-3 (#73) — los 6 widgets Wanomi 3.0.
import TankLevelLive          from '@/components/Widgets/TankLevelLive.vue';
import TankLevelEditor        from '@/components/Widgets/TankLevelEditor.vue';
import MultiStateLive         from '@/components/Widgets/MultiStateLive.vue';
import MultiStateEditor       from '@/components/Widgets/MultiStateEditor.vue';
import ProjectedAutonomyLive  from '@/components/Widgets/ProjectedAutonomyLive.vue';
import ProjectedAutonomyEditor from '@/components/Widgets/ProjectedAutonomyEditor.vue';
import DataFreshnessLive      from '@/components/Widgets/DataFreshnessLive.vue';
import DataFreshnessEditor    from '@/components/Widgets/DataFreshnessEditor.vue';
import BooleanDwellLive       from '@/components/Widgets/BooleanDwellLive.vue';
import BooleanDwellEditor     from '@/components/Widgets/BooleanDwellEditor.vue';
import EquipmentAlarmsLive    from '@/components/Widgets/EquipmentAlarmsLive.vue';
import EquipmentAlarmsEditor  from '@/components/Widgets/EquipmentAlarmsEditor.vue';

const LEGACY = {
  numberchart: Rtnumberchart,
  switch:      Iotswitch,
  button:      Iotbutton,
  indicator:   Iotindicator,
};

const CATALOG_LIVE = {
  valueStatus:       ValueStatusLive,
  tankLevel:         TankLevelLive,
  multiState:        MultiStateLive,
  projectedAutonomy: ProjectedAutonomyLive,
  dataFreshness:     DataFreshnessLive,
  booleanDwell:      BooleanDwellLive,
  equipmentAlarms:   EquipmentAlarmsLive,
  // Sumar acá cuando se construya cada tipo del catálogo:
  // counter, miniTrend, activeRecommendation, dcPlant, powerCascade.
};

const CATALOG_EDITOR = {
  valueStatus:       ValueStatusEditor,
  tankLevel:         TankLevelEditor,
  multiState:        MultiStateEditor,
  projectedAutonomy: ProjectedAutonomyEditor,
  dataFreshness:     DataFreshnessEditor,
  booleanDwell:      BooleanDwellEditor,
  equipmentAlarms:   EquipmentAlarmsEditor,
};

export function resolveWidget(type, opts) {
  const context = (opts && opts.context) || 'live';
  // Legacy → mismo componente en los dos contextos (auto-encascaran).
  if (LEGACY[type]) return LEGACY[type];
  // Catálogo por contexto, con fallback DEC-REF-75 §2 a valueStatus.
  const map = context === 'editor' ? CATALOG_EDITOR : CATALOG_LIVE;
  return map[type] || map.valueStatus;
}

export default resolveWidget;
