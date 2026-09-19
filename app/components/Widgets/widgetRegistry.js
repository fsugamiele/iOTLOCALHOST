// DEC-REF-107 (Paso 1) — REGISTRO DE DESCRIPTORES DE WIDGET.
//
// Fuente única de verdad por tipo de widget para la página de plantillas.
// Reemplaza los 11 mini-formularios `v-if` calcados de templates.vue: cada
// tipo declara acá sus campos (`fields`), su config inicial (`defaultConfig`)
// y su normalización pre-guardado (`normalize`). El formulario genérico
// `WidgetConfigForm.vue` los renderiza.
//
// INVARIANTE (Paso 1 = refactor sin cambio de datos): el sub-documento que se
// guarda en `widgets[]` debe salir idéntico al del flujo anterior. Los
// descriptores se transcriben 1:1 de los forms/configs previos, incluido
// `deadband` (DEC-REF-105) solo en numberchart/valueStatus y su herencia de
// ficha, y las guardas de dedupe/normalización (DEC-REF-76/-97/-98).

// ── Opciones compartidas (antes inline en data() de templates.vue) ──────────

export const ICON_OPTIONS = [
  // Ambiente / Sensores
  { value: 'fa-thermometer-half', label: 'Temperatura' },
  { value: 'fa-tint',             label: 'Humedad' },
  { value: 'fa-wind',             label: 'Viento' },
  { value: 'fa-cloud',            label: 'Nube' },
  { value: 'fa-sun',              label: 'Sol / Luz' },
  { value: 'fa-fire',             label: 'Fuego / Calor' },
  { value: 'fa-snowflake',        label: 'Frío' },
  { value: 'fa-water',            label: 'Agua / Caudal' },
  // Energía
  { value: 'fa-bolt',             label: 'Electricidad' },
  { value: 'fa-plug',             label: 'Enchufe' },
  { value: 'fa-battery-full',     label: 'Batería Llena' },
  { value: 'fa-battery-half',     label: 'Batería Media' },
  { value: 'fa-battery-empty',    label: 'Batería Vacía' },
  // Hogar / Control
  { value: 'fa-home',             label: 'Casa' },
  { value: 'fa-lightbulb',        label: 'Foco' },
  { value: 'fa-fan',              label: 'Ventilador' },
  { value: 'fa-door-open',        label: 'Puerta Abierta' },
  { value: 'fa-door-closed',      label: 'Puerta Cerrada' },
  { value: 'fa-lock',             label: 'Candado' },
  { value: 'fa-lock-open',        label: 'Candado Abierto' },
  { value: 'fa-bath',             label: 'Baño' },
  // Estado / Sistema
  { value: 'fa-power-off',        label: 'Encendido/Apagado' },
  { value: 'fa-toggle-on',        label: 'Toggle Activo' },
  { value: 'fa-toggle-off',       label: 'Toggle Inactivo' },
  { value: 'fa-wifi',             label: 'WiFi' },
  { value: 'fa-signal',           label: 'Señal' },
  { value: 'fa-eye',              label: 'Sensor / Vista' },
  { value: 'fa-bell',             label: 'Alarma' },
  { value: 'fa-exclamation-triangle', label: 'Advertencia' },
  // Datos / Gráficos
  { value: 'fa-chart-line',       label: 'Gráfico Línea' },
  { value: 'fa-chart-bar',        label: 'Gráfico Barras' },
  { value: 'fa-database',         label: 'Base de Datos' },
  { value: 'fa-sync',             label: 'Sincronizar' },
  // Varios
  { value: 'fa-cog',              label: 'Configuración' },
  { value: 'fa-tools',            label: 'Herramientas' },
  { value: 'fa-map-marker-alt',   label: 'Ubicación' },
  { value: 'fa-clock',            label: 'Reloj / Tiempo' },
  { value: 'fa-car',              label: 'Vehículo' },
  { value: 'fa-industry',         label: 'Industria' },
  { value: 'fa-check-circle',     label: 'OK / Éxito' },
];

export const COLOR_OPTIONS = [
  { value: 'success', label: 'Verde',   hex: '#00f2c3' },
  { value: 'primary', label: 'Morado',  hex: '#e14eca' },
  { value: 'info',    label: 'Azul',    hex: '#1d8cf8' },
  { value: 'warning', label: 'Naranja', hex: '#ff8d72' },
  { value: 'danger',  label: 'Rojo',    hex: '#fd5d93' },
];

export const COLUMN_OPTIONS = [
  { value: 'col-3',  label: 'Pequeño (25%)'    },
  { value: 'col-4',  label: 'Pequeño (33%)'    },
  { value: 'col-5',  label: 'Mediano (42%)'    },
  { value: 'col-6',  label: 'Mediano (50%)'    },
  { value: 'col-7',  label: 'Mediano (58%)'    },
  { value: 'col-8',  label: 'Grande (66%)'     },
  { value: 'col-9',  label: 'Grande (75%)'     },
  { value: 'col-10', label: 'Grande (83%)'     },
  { value: 'col-11', label: 'Muy Grande (92%)' },
  { value: 'col-12', label: 'Completo (100%)'  },
];

// Tipos de dato que entiende valueStatus (DEC-REF-76).
const VARIABLE_TYPE_OPTIONS = [
  { value: 'float',       label: 'float — número con decimales' },
  { value: 'int',         label: 'int — número entero' },
  { value: 'bool',        label: 'bool — verdadero/falso' },
  { value: 'categorical', label: 'categorical — estado nombrado' },
];

// DEC-REF-107 (Paso 2): representaciones de la familia numérica. El usuario
// elige cómo se dibuja el mismo dato (desacople representación↔tipo).
const NUMERIC_TYPE_OPTIONS = [
  { value: 'float', label: 'float — número con decimales' },
  { value: 'int',   label: 'int — número entero' },
];
const RENDER_OPTIONS = [
  { value: 'valueStatus', label: 'Valor con luz de estado' },
  { value: 'gauge',       label: 'Gauge / tacómetro (autonomía, RPM, presión…)' },
  { value: 'tank',        label: 'Tanque — nivel con líquido (gasoil, batería…)' },
  { value: 'counter',     label: 'Contador surtidor (litros, horas, kWh…)' },
  { value: 'sparkline',   label: 'Sparkline — mini tendencia (historial)' },
  { value: 'icon',        label: 'Ícono + valor (estilo clásico)' },
];
// Helper de visibilidad condicional por representación.
const renderIn = (...vals) => (cfg) => vals.includes(cfg.render);

// ── Helpers de color/tamaño (antes métodos privados de templates.vue) ───────
export function colorHex(v)    { const c = COLOR_OPTIONS.find((o) => o.value === v); return c ? c.hex : '#aaa'; }
export function colorLabel(v)  { const c = COLOR_OPTIONS.find((o) => o.value === v); return c ? c.label : v; }
export function columnLabel(v) { const c = COLUMN_OPTIONS.find((o) => o.value === v); return c ? c.label : v; }

// Normalización numérica compartida (idéntica a la de addNewWidget):
// "" / NaN → null (romperían el cast a Number de Mongoose).
const toNumOrNull = (v) => (Number.isFinite(v) ? v : null);

// Etiqueta del campo `variable` cuando la fija la ficha (DEC-REF-97), común a
// todos los widgets de variable.
const VAR_LOCKED_LABEL = 'Variable (técnica — se fija desde la ficha, arriba)';

// ── Descriptores ─────────────────────────────────────────────────────────
// FieldSpec.kind ∈ text | number | variable | select | icon | color | size |
//                  enumRepeater | help
// FieldSpec.model = ruta al campo del config ('unit', 'thresholds.criticalLow').

export const WIDGET_REGISTRY = {

  // ── VALOR NUMÉRICO (DEC-REF-107 Paso 2) ──────────────────────────────
  // Un solo tipo por FORMA DE DATO; la visual la elige el usuario en `render`.
  // Los campos gráficos se muestran según la representación (showIf).
  numeric: {
    type: 'numeric',
    label: 'Valor Numérico — sensor (representación configurable)',
    icon: 'fa-tachometer-alt',
    group: 'wanomi',
    isVariableWidget: true,
    dedupeKey: 'variable',
    fields: [
      { kind: 'variable', model: 'variable', label: 'Variable (nombre técnico, ej: rpm)', lockedLabel: VAR_LOCKED_LABEL },
      { kind: 'text',     model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'select',   model: 'variableType', label: 'Tipo de dato', options: NUMERIC_TYPE_OPTIONS },
      { kind: 'text',     model: 'unit',             label: 'Unidad (ej: rpm, psi, %, L)' },
      { kind: 'number',   model: 'variableSendFreq', label: 'Frecuencia de Envío (seg)' },
      { kind: 'number',   model: 'deadband',         label: 'Umbral de cambio (opcional — publica solo si el valor varía al menos esto)' },
      // Selector de representación gráfica.
      { kind: 'select',   model: 'render', label: 'Representación gráfica', options: RENDER_OPTIONS },
      // Campos condicionales según la representación:
      { kind: 'icon',     model: 'icon', showIf: renderIn('icon') },
      { kind: 'number',   model: 'decimalPlaces', label: 'Decimales', showIf: renderIn('valueStatus', 'icon', 'counter', 'gauge', 'sparkline') },
      { kind: 'number',   model: 'gaugeMin', label: 'Mínimo del gauge (opcional — automático si vacío)', showIf: renderIn('gauge') },
      { kind: 'number',   model: 'gaugeMax', label: 'Máximo del gauge (opcional — automático si vacío)', showIf: renderIn('gauge') },
      { kind: 'number',   model: 'chartTimeAgo', label: 'Ventana de historial (min)', showIf: renderIn('sparkline') },
      { kind: 'number',   model: 'tankCapacity', label: 'Capacidad del tanque (opcional)', showIf: renderIn('tank') },
      { kind: 'text',     model: 'tankUnit', label: 'Unidad de capacidad (ej: L)', showIf: renderIn('tank') },
      { kind: 'number',   model: 'thresholds.criticalLow',  label: 'Umbral crítico bajo (color)',  showIf: renderIn('valueStatus', 'gauge', 'tank', 'icon') },
      { kind: 'number',   model: 'thresholds.warningLow',   label: 'Umbral warning bajo (color)',   showIf: renderIn('valueStatus', 'gauge', 'tank', 'icon') },
      { kind: 'number',   model: 'thresholds.warningHigh',  label: 'Umbral warning alto (color)',   showIf: renderIn('valueStatus', 'gauge', 'icon') },
      { kind: 'number',   model: 'thresholds.criticalHigh', label: 'Umbral crítico alto (color)',   showIf: renderIn('valueStatus', 'gauge', 'icon') },
      { kind: 'help', text: 'La representación no cambia el dato: elegís cómo se dibuja el mismo sensor. Los umbrales pintan el color/zonas del gráfico.' },
      { kind: 'size',     model: 'column' },
    ],
    defaultConfig: () => ({
      variable: '',
      variableFullName: '',
      variableType: 'float',
      unit: '',
      variableSendFreq: 60,
      deadband: null,
      decimalPlaces: null,
      render: 'valueStatus',
      icon: 'fa-tachometer-alt',
      column: 'col-4',
      widget: 'numeric',
      thresholds: { criticalLow: null, warningLow: null, warningHigh: null, criticalHigh: null },
      gaugeMin: null,
      gaugeMax: null,
      tankCapacity: null,
      tankUnit: 'L',
      chartTimeAgo: 60,
    }),
    normalize(cfg) {
      const n = (v) => (Number.isFinite(v) ? v : null);
      cfg.deadband = n(cfg.deadband);
      cfg.decimalPlaces = n(cfg.decimalPlaces);
      cfg.gaugeMin = n(cfg.gaugeMin);
      cfg.gaugeMax = n(cfg.gaugeMax);
      cfg.tankCapacity = n(cfg.tankCapacity);
      cfg.chartTimeAgo = Number.isFinite(cfg.chartTimeAgo) && cfg.chartTimeAgo > 0 ? cfg.chartTimeAgo : 60;
      cfg.thresholds = {
        criticalLow:  n(cfg.thresholds && cfg.thresholds.criticalLow),
        warningLow:   n(cfg.thresholds && cfg.thresholds.warningLow),
        warningHigh:  n(cfg.thresholds && cfg.thresholds.warningHigh),
        criticalHigh: n(cfg.thresholds && cfg.thresholds.criticalHigh),
      };
      cfg.variableSendFreq = Number.isFinite(cfg.variableSendFreq) ? cfg.variableSendFreq : 60;
    },
  },

  // ── LEGACY (grupo input/output) ──────────────────────────────────────
  numberchart: {
    type: 'numberchart',
    label: 'Number Chart — Sensor Numérico (entrada ←)',
    icon: 'fa-chart-line',
    group: 'input',
    isVariableWidget: false,
    dedupeKey: 'variableFullName',
    fields: [
      { kind: 'text',   model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'text',   model: 'unit',             label: 'Unidad' },
      { kind: 'number', model: 'decimalPlaces',    label: 'Decimales' },
      { kind: 'icon',   model: 'icon' },
      { kind: 'number', model: 'variableSendFreq', label: 'Frecuencia de Envío (seg)' },
      { kind: 'number', model: 'deadband',         label: 'Umbral de cambio (opcional — publica solo si el valor varía al menos esto)' },
      { kind: 'number', model: 'chartTimeAgo',     label: 'Historial del Gráfico (min)' },
      { kind: 'text',   model: 'tasmotaPath',      label: 'Tasmota Path (opcional, ej: DHT11.Temperature)', placeholder: 'DHT11.Temperature' },
      { kind: 'color',  model: 'class' },
      { kind: 'size',   model: 'column' },
    ],
    defaultConfig: () => ({
      userId: 'sampleuserid',
      selectedDevice: { name: 'Home', dId: '8888' },
      variableFullName: 'temperature',
      variable: 'varname',
      variableType: 'input',
      variableSendFreq: '30',
      deadband: null,
      unit: '°C',
      class: 'success',
      column: 'col-12',
      decimalPlaces: 2,
      widget: 'numberchart',
      icon: 'fa-thermometer-half',
      chartTimeAgo: 60,
      demo: true,
      tasmotaPath: '',
    }),
    normalize(cfg) {
      cfg.deadband = toNumOrNull(cfg.deadband);
    },
  },

  indicator: {
    type: 'indicator',
    label: 'Indicador Booleano — On/Off (entrada ←)',
    icon: 'fa-toggle-on',
    group: 'input',
    isVariableWidget: false,
    dedupeKey: 'variableFullName',
    fields: [
      { kind: 'text',  model: 'variableFullName', label: 'Nombre de Variable' },
      // variableSendFreq es texto libre en indicator (paridad con el form previo).
      { kind: 'text',  model: 'variableSendFreq', label: 'Frecuencia de Envío (seg)' },
      { kind: 'text',  model: 'tasmotaPath',      label: 'Tasmota Path (opcional, ej: POWER)', placeholder: 'POWER' },
      { kind: 'icon',  model: 'icon' },
      { kind: 'color', model: 'class' },
      { kind: 'size',  model: 'column' },
    ],
    defaultConfig: () => ({
      userId: 'userid',
      selectedDevice: { name: 'Home', dId: '8888' },
      variableFullName: 'Estado',
      variable: 'varname',
      variableType: 'input',
      variableSendFreq: '30',
      class: 'success',
      widget: 'indicator',
      icon: 'fa-toggle-on',
      column: 'col-6',
      tasmotaPath: '',
    }),
    normalize() {},
  },

  switch: {
    type: 'switch',
    label: 'Switch — Control On/Off (salida →)',
    icon: 'fa-power-off',
    group: 'output',
    isVariableWidget: false,
    dedupeKey: 'variableFullName',
    fields: [
      { kind: 'text',  model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'text',  model: 'tasmotaPath',      label: 'Tasmota Path (opcional, ej: POWER)', placeholder: 'POWER' },
      { kind: 'icon',  model: 'icon' },
      { kind: 'color', model: 'class' },
      { kind: 'size',  model: 'column' },
    ],
    defaultConfig: () => ({
      userId: 'userid',
      selectedDevice: { name: 'Home', dId: '8888' },
      variableFullName: 'Luz',
      variable: 'varname',
      variableType: 'output',
      class: 'danger',
      widget: 'switch',
      icon: 'fa-lightbulb',
      column: 'col-6',
      tasmotaPath: '',
    }),
    normalize() {},
  },

  button: {
    type: 'button',
    label: 'Botón — Envío de Comando (salida →)',
    icon: 'fa-hand-pointer',
    group: 'output',
    isVariableWidget: false,
    dedupeKey: 'variableFullName',
    fields: [
      { kind: 'text',  model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'text',  model: 'message',          label: 'Mensaje a Enviar' },
      { kind: 'text',  model: 'text',             label: 'Texto del Botón' },
      { kind: 'text',  model: 'tasmotaPath',      label: 'Tasmota Path (opcional, ej: POWER)', placeholder: 'POWER' },
      { kind: 'icon',  model: 'icon' },
      { kind: 'color', model: 'class' },
      { kind: 'size',  model: 'column' },
    ],
    defaultConfig: () => ({
      userId: 'userid',
      selectedDevice: {
        name: 'Home',
        dId: '8888',
        templateName: 'Power Sensor',
        templateId: '984237562348756ldksjfh',
        saverRule: false,
      },
      variableFullName: 'Bomba',
      variable: 'var1',
      variableType: 'output',
      icon: 'fa-power-off',
      column: 'col-4',
      widget: 'button',
      class: 'danger',
      message: "{'fanstatus': 'stop'}",
      text: 'Enviar',
      tasmotaPath: '',
    }),
    normalize() {},
  },

  // ── CATÁLOGO ─────────────────────────────────────────────────────────
  valueStatus: {
    type: 'valueStatus',
    label: 'Valor con Estado — luz por umbral (catálogo)',
    icon: 'fa-signal',
    group: 'catalog',
    isVariableWidget: true,
    dedupeKey: 'variable',
    fields: [
      { kind: 'variable', model: 'variable', label: 'Variable (nombre técnico del mapa del equipo, ej: oil_pressure)', lockedLabel: VAR_LOCKED_LABEL },
      { kind: 'text',     model: 'variableFullName', label: 'Nombre de Variable (sin unidad entre paréntesis)' },
      { kind: 'select',   model: 'variableType', label: 'Tipo de dato', options: VARIABLE_TYPE_OPTIONS },
      { kind: 'text',     model: 'unit',             label: 'Unidad (opcional, ej: °C, psi, %)' },
      { kind: 'number',   model: 'variableSendFreq', label: 'Frecuencia de Envío (seg)' },
      { kind: 'number',   model: 'deadband',         label: 'Umbral de cambio (opcional — publica solo si el valor varía al menos esto)' },
      { kind: 'number',   model: 'decimalPlaces',    label: 'Decimales (opcional; vacío = default por tipo)' },
      { kind: 'icon',     model: 'icon' },
      { kind: 'size',     model: 'column' },
    ],
    defaultConfig: () => ({
      variable: '',
      variableFullName: '',
      variableType: 'float',
      unit: '',
      variableSendFreq: 60,
      deadband: null,
      decimalPlaces: null,
      icon: 'fa-signal',
      column: 'col-4',
      widget: 'valueStatus',
    }),
    normalize(cfg) {
      cfg.deadband = toNumOrNull(cfg.deadband);
      cfg.decimalPlaces = toNumOrNull(cfg.decimalPlaces);
      cfg.variableSendFreq = Number.isFinite(cfg.variableSendFreq) ? cfg.variableSendFreq : 60;
    },
  },

  // ── WANOMI 3.0 (DEC-REF-98 D-3) ──────────────────────────────────────
  tankLevel: {
    type: 'tankLevel',
    label: 'Nivel de Tanque — % con litros (Wanomi 3.0)',
    icon: 'fa-tint',
    group: 'wanomi',
    isVariableWidget: true,
    dedupeKey: 'variable',
    fields: [
      { kind: 'variable', model: 'variable', label: 'Variable (nombre técnico, ej: fuel_level)', lockedLabel: VAR_LOCKED_LABEL },
      { kind: 'text',     model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'number',   model: 'tankCapacity',     label: 'Capacidad del tanque (opcional, en la unidad de abajo)' },
      { kind: 'text',     model: 'tankUnit',         label: 'Unidad de capacidad (ej: L)' },
      { kind: 'number',   model: 'thresholds.warningLow',  label: 'Umbral warning bajo (% — opcional)' },
      { kind: 'number',   model: 'thresholds.criticalLow', label: 'Umbral crítico bajo (% — opcional)' },
      { kind: 'icon',     model: 'icon' },
      { kind: 'size',     model: 'column' },
    ],
    defaultConfig: () => ({
      variable: '',
      variableFullName: '',
      unit: '%',
      icon: 'fa-tint',
      column: 'col-4',
      widget: 'tankLevel',
      tankCapacity: null,
      tankUnit: 'L',
      thresholds: { warningLow: null, criticalLow: null },
    }),
    normalize(cfg) {
      cfg.thresholds = {
        warningLow: toNumOrNull(cfg.thresholds.warningLow),
        criticalLow: toNumOrNull(cfg.thresholds.criticalLow),
      };
      cfg.tankCapacity = toNumOrNull(cfg.tankCapacity);
    },
  },

  multiState: {
    type: 'multiState',
    label: 'Estado Múltiple — estado nombrado con catálogo (Wanomi 3.0)',
    icon: 'fa-toggle-on',
    group: 'wanomi',
    isVariableWidget: true,
    dedupeKey: 'variable',
    fields: [
      { kind: 'variable',     model: 'variable', label: 'Variable (nombre técnico, ej: genset_state)', lockedLabel: VAR_LOCKED_LABEL },
      { kind: 'text',         model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'enumRepeater', model: 'enumValues', label: 'Catálogo de estados',
        help: 'Valor fuera del catálogo → el widget lo muestra en gris con el valor crudo (la plataforma no inventa significados).' },
      { kind: 'icon',         model: 'icon' },
      { kind: 'size',         model: 'column' },
    ],
    defaultConfig: () => ({
      variable: '',
      variableFullName: '',
      icon: 'fa-toggle-on',
      column: 'col-4',
      widget: 'multiState',
      enumValues: [],
    }),
    normalize(cfg) {
      cfg.enumValues = (cfg.enumValues || []).filter((e) => (e.value || '').trim() !== '');
    },
  },

  projectedAutonomy: {
    type: 'projectedAutonomy',
    label: 'Autonomía Proyectada — horas que publica el equipo (Wanomi 3.0)',
    icon: 'fa-battery-half',
    group: 'wanomi',
    isVariableWidget: true,
    dedupeKey: 'variable',
    fields: [
      { kind: 'variable', model: 'variable', label: 'Variable (nombre técnico, ej: autonomy_hours)', lockedLabel: VAR_LOCKED_LABEL },
      { kind: 'text',     model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'number',   model: 'thresholds.warningLow',  label: 'Umbral warning bajo (horas — opcional)' },
      { kind: 'number',   model: 'thresholds.criticalLow', label: 'Umbral crítico bajo (horas — opcional)' },
      { kind: 'help',     text: 'La autonomía la calcula y publica el equipo (la ficha la declara); la plataforma no estima consumo.' },
      { kind: 'icon',     model: 'icon' },
      { kind: 'size',     model: 'column' },
    ],
    defaultConfig: () => ({
      variable: '',
      variableFullName: '',
      unit: 'h',
      icon: 'fa-battery-half',
      column: 'col-4',
      widget: 'projectedAutonomy',
      thresholds: { warningLow: null, criticalLow: null },
    }),
    normalize(cfg) {
      cfg.thresholds = {
        warningLow: toNumOrNull(cfg.thresholds.warningLow),
        criticalLow: toNumOrNull(cfg.thresholds.criticalLow),
      };
    },
  },

  dataFreshness: {
    type: 'dataFreshness',
    label: 'Frescura de Datos — hace cuánto llegó el dato (Wanomi 3.0)',
    icon: 'fa-sync',
    group: 'wanomi',
    isVariableWidget: true,
    dedupeKey: 'variable',
    fields: [
      { kind: 'variable', model: 'variable', label: 'Variable a vigilar (nombre técnico)', lockedLabel: VAR_LOCKED_LABEL },
      { kind: 'text',     model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'number',   model: 'cadenceExpected',  label: 'Cadencia esperada (seg)' },
      { kind: 'help',     text: 'Color por demora: ok ≤ 1× cadencia · warning ≤ 2× · crítico > 2×. Sin cadencia → solo edad, sin juicio.' },
      { kind: 'icon',     model: 'icon' },
      { kind: 'size',     model: 'column' },
    ],
    defaultConfig: () => ({
      variable: '',
      variableFullName: '',
      icon: 'fa-sync',
      column: 'col-4',
      widget: 'dataFreshness',
      cadenceExpected: 120,
    }),
    normalize(cfg) {
      cfg.cadenceExpected = Number.isFinite(cfg.cadenceExpected) && cfg.cadenceExpected > 0
        ? cfg.cadenceExpected
        : 120;
    },
  },

  booleanDwell: {
    type: 'booleanDwell',
    label: 'Permanencia Booleana — cuánto lleva en este estado (Wanomi 3.0)',
    icon: 'fa-clock',
    group: 'wanomi',
    isVariableWidget: true,
    dedupeKey: 'variable',
    fields: [
      { kind: 'variable', model: 'variable', label: 'Variable booleana (nombre técnico, ej: mains_fail)', lockedLabel: VAR_LOCKED_LABEL },
      { kind: 'text',     model: 'variableFullName', label: 'Nombre de Variable' },
      { kind: 'number',   model: 'dwellWindowHours', label: 'Ventana de historial (horas)' },
      { kind: 'help',     text: 'Si el último cambio de estado es anterior a la ventana, el widget dice "al menos {ventana}" — nunca afirma una permanencia mayor a la observada.' },
      { kind: 'icon',     model: 'icon' },
      { kind: 'size',     model: 'column' },
    ],
    defaultConfig: () => ({
      variable: '',
      variableFullName: '',
      icon: 'fa-clock',
      column: 'col-4',
      widget: 'booleanDwell',
      dwellWindowHours: 24,
    }),
    normalize(cfg) {
      cfg.dwellWindowHours = Number.isFinite(cfg.dwellWindowHours) && cfg.dwellWindowHours > 0
        ? cfg.dwellWindowHours
        : 24;
    },
  },

  equipmentAlarms: {
    type: 'equipmentAlarms',
    label: 'Alarmas del Equipo — feed del sitio filtrado (Wanomi 3.0)',
    icon: 'fa-bell',
    group: 'wanomi',
    isVariableWidget: false,
    dedupeKey: 'type',  // uno por plantilla (su fuente es el feed del sitio, no una variable)
    fields: [
      { kind: 'text', model: 'variableFullName', label: 'Título del Widget' },
      { kind: 'help', text: 'Sin variable: en la vista del sitio lista las alarmas activas del equipo (feed de alarmas del sitio filtrado por dispositivo). Uno por plantilla alcanza.' },
      { kind: 'icon', model: 'icon' },
      { kind: 'size', model: 'column' },
    ],
    defaultConfig: () => ({
      variableFullName: 'Alarmas del equipo',
      icon: 'fa-bell',
      column: 'col-6',
      widget: 'equipmentAlarms',
    }),
    normalize() {},
  },

  // ── RECOMENDACIÓN ACTIVA (DEC-REF-107 Paso 5) ────────────────────────
  // Sin variable: su fuente es el feed de alarmas del sitio; muestra LA acción
  // recomendada de la alarma activa más severa del equipo. Uno por plantilla.
  activeRecommendation: {
    type: 'activeRecommendation',
    label: 'Recomendación Activa — la acción sugerida del equipo',
    icon: 'fa-lightbulb',
    group: 'wanomi',
    isVariableWidget: false,
    dedupeKey: 'type',
    fields: [
      { kind: 'text', model: 'variableFullName', label: 'Título del Widget' },
      { kind: 'help', text: 'Sin variable: muestra la acción recomendada de la alarma activa más severa del equipo (la recomendación ya viaja en el feed del sitio). Uno por plantilla alcanza.' },
      { kind: 'icon', model: 'icon' },
      { kind: 'size', model: 'column' },
    ],
    defaultConfig: () => ({
      variableFullName: 'Acción recomendada',
      icon: 'fa-lightbulb',
      column: 'col-6',
      widget: 'activeRecommendation',
    }),
    normalize() {},
  },
};

// Orden del selector de tipos (idéntico al del template previo).
export const WIDGET_SELECTOR_GROUPS = [
  { group: null,        types: ['numberchart', 'indicator', 'switch', 'button', 'valueStatus'] },
  { group: 'Wanomi 3.0', types: ['tankLevel', 'multiState', 'projectedAutonomy', 'dataFreshness', 'booleanDwell', 'equipmentAlarms'] },
];

export function getDescriptor(type) {
  return WIDGET_REGISTRY[type] || null;
}

export default WIDGET_REGISTRY;
