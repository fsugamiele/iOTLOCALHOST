require('dotenv').config();
const mongoose = require('mongoose');

// DEC-REF-108 F4 (#80) — upgrade de widgets de la flota existente.
// Idempotente por construcción (cada paso verifica antes de escribir).
//
//   1. FICHAS: siembra factoryRange (rango normal del fabricante) en las
//      variables analógicas + agrega autonomy_hours a cummins-pcc y GEN.
//   2. TEMPLATES: copia factoryRange de la ficha al widget (por variable).
//   3. TEMPLATES: convierte valueStatus → numeric/render=sparkline en las
//      variables analógicas visibles (valor + mini tendencia, decisión F4).
//   4. TEMPLATES: agrega el widget projectedAutonomy (autonomy_hours) a
//      Cummins y GEN si no existe.
//
// Uso:
//   MONGODB_URI=... node seeds/migrate_widgets_f4.js --dry-run
//   MONGODB_URI=... node seeds/migrate_widgets_f4.js

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido (base iotix, authSource=admin).');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');

// Rango normal por variable (criterio físico del fabricante/operación).
const FACTORY_RANGE = {
  mains_voltage: '200-240', gen_voltage: '200-240',
  mains_freq: '48-52', gen_freq: '48-52',
  battery_voltage: '10.5-14.5', alternator_voltage: '12-15',
  coolant_temp: '30-100', exhaust_temp: '0-600',
  oil_pressure: '20-60',
  dc_bus_voltage: '-58--42', dc_load_current: '0-300',
  temperature: '0-50', shelter_temp: '0-50',
  fuel_level: '0-100', rpm: '0-1800', load_kw: '0-20',
  run_hours: '0-50000', crank_current: '0-600',
  autonomy_hours: '0-10',
};

// Variables que pasan de valueStatus a numeric con render sparkline.
const SPARKLINE_BY_TEMPLATE = {
  'WN-ATS-InteliATS-PWR': ['mains_voltage', 'mains_freq', 'gen_voltage', 'gen_freq', 'load_kw'],
  'WN-ELTEK-SmartpackS': ['dc_bus_voltage', 'dc_load_current', 'temperature'],
  'WN-GEN-Cummins-PowerCommand': ['coolant_temp', 'battery_voltage', 'oil_pressure'],
  'WN-SITE-SEC v2': ['shelter_temp'],
};

const AUTONOMY_WIDGET = {
  variable: 'autonomy_hours',
  variableFullName: 'Autonomía estimada',
  variableType: 'float',
  variableSendFreq: 60,
  deadband: 0.1,
  unit: 'h',
  widget: 'projectedAutonomy',
  icon: 'fa-hourglass-half',
  class: 'primary',
  column: 'col-4',
  decimalPlaces: 1,
  factoryRange: '0-10',
  thresholds: { criticalLow: 2, warningLow: 4 },
};
const AUTONOMY_TEMPLATES = ['WN-GEN-Cummins-PowerCommand', 'WN-SITE-GEN v2'];

const AUTONOMY_FICHA_VAR = {
  name: 'autonomy_hours', label: 'Autonomía estimada', type: 'float',
  unit: 'h', factoryRange: '0-10', cadence: '60s', deadband: 0.1, limits: [
    { kind: 'warning', op: 'lt', value: 4, unit: 'h', source: 'wanomi' },
    { kind: 'trip',    op: 'lt', value: 2, unit: 'h', source: 'wanomi' },
  ],
};
const AUTONOMY_FICHAS = ['cummins-pcc', 'GEN'];

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const sheetsCol = db.collection('equipmentsheets');
  const tplCol = db.collection('templates');

  let nRangeFicha = 0, nAutonomyFicha = 0, nRangeWidget = 0, nSparkline = 0, nAutonomyWidget = 0;

  // ── 1. Fichas: factoryRange + autonomy_hours ──────────────────────────
  const sheets = await sheetsCol.find({}).toArray();
  for (const s of sheets) {
    let dirty = false;
    (s.variables || []).forEach(v => {
      const fr = FACTORY_RANGE[v.name];
      if (fr && !v.factoryRange) { v.factoryRange = fr; dirty = true; nRangeFicha++; }
    });
    if (AUTONOMY_FICHAS.includes(s.deviceType) && !(s.variables || []).some(v => v.name === 'autonomy_hours')) {
      s.variables = [...(s.variables || []), AUTONOMY_FICHA_VAR];
      dirty = true; nAutonomyFicha++;
      console.log(`  ficha ${s.deviceType} + autonomy_hours`);
    }
    if (dirty && !DRY) await sheetsCol.updateOne({ _id: s._id }, { $set: { variables: s.variables } });
  }

  // ── 2-4. Templates ────────────────────────────────────────────────────
  const rangeByDeviceTypeVar = new Map();
  sheets.forEach(s => (s.variables || []).forEach(v => {
    if (v.factoryRange) rangeByDeviceTypeVar.set(s.deviceType + '|' + v.name, v.factoryRange);
  }));

  const templates = await tplCol.find({}).toArray();
  for (const t of templates) {
    let dirty = false;
    (t.widgets || []).forEach(w => {
      if (!w || !w.variable) return;
      // 2. factoryRange desde la ficha (no pisa uno ya cargado/editado)
      if (!w.factoryRange) {
        const fr = rangeByDeviceTypeVar.get((t.deviceType || '') + '|' + w.variable);
        if (fr) { w.factoryRange = fr; dirty = true; nRangeWidget++; }
      }
      // 3. conversión a sparkline
      const conv = SPARKLINE_BY_TEMPLATE[t.name] || [];
      if (conv.includes(w.variable) && w.widget === 'valueStatus') {
        w.widget = 'numeric';
        w.render = 'sparkline';
        dirty = true; nSparkline++;
        console.log(`  ${t.name} · ${w.variable} → numeric/sparkline`);
      }
    });
    // 4. projectedAutonomy
    if (AUTONOMY_TEMPLATES.includes(t.name) && !(t.widgets || []).some(w => w.variable === 'autonomy_hours')) {
      t.widgets = [...(t.widgets || []), { ...AUTONOMY_WIDGET }];
      dirty = true; nAutonomyWidget++;
      console.log(`  ${t.name} + projectedAutonomy (autonomy_hours)`);
    }
    if (dirty && !DRY) await tplCol.updateOne({ _id: t._id }, { $set: { widgets: t.widgets } });
  }

  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}fichas: +${nRangeFicha} factoryRange, +${nAutonomyFicha} autonomy_hours · templates: +${nRangeWidget} factoryRange, ${nSparkline} sparklines, +${nAutonomyWidget} projectedAutonomy`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
