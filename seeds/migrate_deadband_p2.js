require('dotenv').config();
const mongoose = require('mongoose');

// P2 (#79) — siembra de umbrales de cambio (deadband) en los templates
// existentes y heartbeatSec=300 donde falte. Con publicación por cambio
// (report-by-exception) el umbral ES la spec de ruido del sensor: nace en
// la ficha del fabricante; acá se siembra la flota ya creada para que no
// quede con deadband vacío (= publicar ante cualquier drift).
//
// Idempotente por construcción: solo escribe widgets con deadband
// undefined/null. Si el operador editó un umbral por UI, se respeta.
//
// Valores: criterio físico conservador (ruido típico del sensor, no el
// paso de alarma — las alarmas las sigue evaluando el motor con cada dato).
//
// Uso:
//   MONGODB_URI=... node seeds/migrate_deadband_p2.js --dry-run   (imprime, no escribe)
//   MONGODB_URI=... node seeds/migrate_deadband_p2.js             (aplica)

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido (base iotix, authSource=admin).');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');

// Umbral por nombre de variable. Las no listadas quedan sin umbral
// (cualquier cambio publica): contadores, bitmaps, enums, setpoints.
const DEADBAND_BY_VARIABLE = {
  // Temperaturas [°C]
  shelter_temp: 0.5, exhaust_temp: 0.5, coolant_temp: 0.5, temperature: 0.5,
  // Nivel de combustible [%]
  fuel_level: 1,
  // Tensiones [V]
  alternator_voltage: 0.3, battery_voltage: 0.3, dc_bus_voltage: 0.3,
  mains_voltage: 2, gen_voltage: 2,
  // Corrientes [A]
  crank_current: 2, dc_load_current: 1,
  // Frecuencias [Hz]
  mains_freq: 0.1, gen_freq: 0.1,
  // Grupo electrógeno
  oil_pressure: 1,   // psi
  rpm: 25,
  run_hours: 0.1,    // ~6 min de marcha
  load_kw: 0.5,
};

const HEARTBEAT_DEFAULT = 300;

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const col = mongoose.connection.db.collection('templates');

  const templates = await col.find({}).toArray();
  let touchedTemplates = 0, touchedWidgets = 0, touchedHb = 0;

  for (const t of templates) {
    const set = {};
    (t.widgets || []).forEach((w, i) => {
      if (!w || !w.variable) return;
      if (w.deadband !== undefined && w.deadband !== null) return; // respeta lo ya cargado
      const db = DEADBAND_BY_VARIABLE[w.variable];
      if (db !== undefined) {
        set[`widgets.${i}.deadband`] = db;
        touchedWidgets++;
        console.log(`  ${t.name} · ${w.variable} → deadband=${db}`);
      }
    });
    if (t.heartbeatSec === undefined || t.heartbeatSec === null) {
      set['heartbeatSec'] = HEARTBEAT_DEFAULT;
      touchedHb++;
      console.log(`  ${t.name} → heartbeatSec=${HEARTBEAT_DEFAULT}`);
    }
    if (Object.keys(set).length) {
      touchedTemplates++;
      if (!DRY) await col.updateOne({ _id: t._id }, { $set: set });
    }
  }

  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Templates tocados: ${touchedTemplates} · widgets con umbral: ${touchedWidgets} · heartbeat sembrado: ${touchedHb}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
