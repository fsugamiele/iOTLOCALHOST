// DEC-REF-98 D-1 (#73) — extractor heurístico de fichas desde PDF del
// fabricante. BEST-EFFORT ASISTIDO: propone un draft que la UI precarga
// en el modal de alta para REVISIÓN HUMANA; nada persiste sin confirmación
// (el guardado sigue siendo POST /equipmentsheet, DEC-REF-94/-97 D-1).
//
// Estrategia: texto plano vía pdfjs-dist (pdf-parse@1.1.1 quedó descartado:
// su pdf.js 1.x interno no traga los xref que emiten generadores comunes
// — medido "bad XRef entry" sobre PDF de pdfkit válido para pdftotext) →
// líneas reconstruidas por coordenada Y → candidatas por keyword de
// dominio o unidad conocida → normalización a la forma del modelo
// (equipment_sheet.js: name técnico snake_case, label, type, unit,
// factoryRange). Lo que parece variable pero no cierra la forma va a
// `rawCandidates` (la UI lo lista para revisión, no lo descarta mudo).

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Unidades reconocidas (datasheets de grupos electrógenos / controladores).
// Orden importa: las compuestas primero para que el match sea el más largo.
const UNITS = [
  'kVA', 'kWh', 'kW', 'kPa', 'MPa', 'Bar', 'bar', 'psi', 'PSI',
  '°C', '°F', 'Hz', 'RPM', 'rpm', 'V', 'A', 'mA',
  '%', 'L/h', 'l/h', 'L', 'h', 'min', 's',
];

// Keywords de dominio (es/en) — una línea con keyword ES candidata aunque
// no traiga unidad en la misma línea.
const KEYWORDS = [
  'pressure', 'presión', 'presion', 'temperature', 'temperatura',
  'level', 'nivel', 'voltage', 'tensión', 'tension', 'voltaje',
  'current', 'corriente', 'frequency', 'frecuencia', 'fuel', 'combustible',
  'battery', 'batería', 'bateria', 'speed', 'velocidad', 'oil', 'aceite',
  'coolant', 'refrigerante', 'power', 'potencia', 'alarm', 'alarma',
  'status', 'estado', 'running', 'marcha', 'autonomy', 'autonomía', 'autonomia',
];

const BOOL_HINTS = ['status', 'estado', 'alarm', 'alarma', 'running', 'marcha', 'switch', 'fail'];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Unidad como TOKEN: borde de palabra o entre paréntesis, opcionalmente
// precedida por número o rango. Sin esto, unidades de 1 letra ("V", "A",
// "s", "L") se comen letras del label ("Voltage" → "oltage" — medido en
// la primera corrida del extractor).
function unitTokenRe(u) {
  return new RegExp(
    '(?:^|[\\s(\\[])(?:[0-9]+(?:[.,][0-9]+)?\\s*(?:-|\\.\\.|a\\b|to)\\s*[0-9]+(?:[.,][0-9]+)?\\s*)?\\(?' +
    escapeRe(u) + '\\)?(?=$|[\\s)\\],.;:])'
  );
}

// "Oil Pressure" → oil_pressure (name técnico, DEC-REF-94: viaja en el topic).
function toTechnicalName(label) {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tildes fuera
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function detectUnit(line) {
  for (const u of UNITS) {
    if (unitTokenRe(u).test(line)) return u;
  }
  return '';
}

function detectRange(line) {
  // "0-100", "0..10", "0 a 100", "0 to 150 psi"
  const m = line.match(/(-?\d+(?:[.,]\d+)?)\s*(?:-|\.\.|a\b|to)\s*(-?\d+(?:[.,]\d+)?)/);
  return m ? `${m[1]} - ${m[2]}` : '';
}

function detectType(line, unit) {
  const l = line.toLowerCase();
  if (BOOL_HINTS.some((h) => l.includes(h))) return 'bool';
  if (unit || detectRange(line)) return 'float';
  return '';
}

// Heurística débil de encabezado: las primeras líneas no vacías suelen
// traer fabricante y modelo. Se proponen como draft editable, nunca como
// dato firme.
function detectHeader(lines) {
  const head = lines.slice(0, 10).map((s) => s.trim()).filter(Boolean);
  return {
    manufacturer: head[0] ? head[0].slice(0, 80) : '',
    model: head[1] ? head[1].slice(0, 80) : '',
  };
}

// Texto plano por página: getTextContent devuelve items con transform
// [a,b,c,d,x,y]; agrupo por Y (redondeada) y ordeno por X dentro de la
// línea — el stream de un PDF no garantiza orden de lectura.
async function pdfToLines(buffer) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    verbosity: 0,  // ERRORS only: el warning de standard fonts no aporta (el texto sale igual)
  }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, str: item.str });
    }
    const sortedY = [...rows.keys()].sort((a, b) => b - a);  // Y crece hacia arriba
    for (const y of sortedY) {
      const line = rows.get(y).sort((a, b) => a.x - b.x).map((i) => i.str).join(' ');
      lines.push(line);
    }
  }
  return { lines, numPages: doc.numPages };
}

async function extractFromPdf(buffer) {
  const { lines: rawLines, numPages } = await pdfToLines(buffer);
  const lines = rawLines.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const header = detectHeader(lines);
  const variables = [];
  const rawCandidates = [];
  const seen = new Set();

  for (const line of lines) {
    if (line.length < 4 || line.length > 140) continue;
    const unit = detectUnit(line);
    const hasKeyword = KEYWORDS.some((k) => line.toLowerCase().includes(k));
    if (!unit && !hasKeyword) continue;

    // Label: la línea sin rangos numéricos ni la unidad detectada (solo
    // como token — nunca por substring).
    let label = line
      .replace(/\(?\d+(?:[.,]\d+)?\s*(?:-|\.\.|a\b|to)\s*\d+(?:[.,]\d+)?\s*\)?/g, ' ');
    if (unit) {
      label = label.replace(unitTokenRe(unit), ' ');
    }
    label = label.replace(/\s{2,}/g, ' ').replace(/[()[\]]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 80);

    const name = toTechnicalName(label);
    const type = detectType(line, unit);

    if (!name || name.length < 3) {
      rawCandidates.push(line);
      continue;
    }
    if (seen.has(name)) continue;

    const variable = {
      name,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      type: type || 'float',
      unit,
      factoryRange: detectRange(line),
      cadence: '',
      limits: [],
    };
    variables.push(variable);
    seen.add(name);
  }

  return {
    manufacturer: header.manufacturer,
    model: header.model,
    variables,
    rawCandidates,
    pages: numPages,
  };
}

module.exports = { extractFromPdf };
