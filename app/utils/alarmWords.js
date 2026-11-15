// Propuesta Alarmas (2026-11) — palabras compartidas por la lista de Alarmas, el detalle y su
// gráfico: un solo lugar para escribir un valor, una hora o un tipo de equipo en lenguaje del
// operador. Sin términos del backend en pantalla.
import { deviceTypeName } from '@/components/rules/ruleSentence.js';

const p2 = (n) => String(n).padStart(2, '0');

// Número con coma decimal y signo menos tipográfico. dec: decimales máximos (default según tamaño).
export function num(v, dec) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const x = Number(v);
  const d = dec != null ? dec : (Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2);
  const f = Math.pow(10, d);
  const r = Math.round(x * f) / f;
  return (r < 0 ? '−' : '') + String(Math.abs(r)).replace('.', ',');
}

// Valor de una medición en palabras: enumerados por su etiqueta, sí/no, o número con unidad.
export function valor(v, meta, dec) {
  if (v == null) return '—';
  const m = meta || {};
  if (Array.isArray(m.enumValues) && m.enumValues.length) {
    const e = m.enumValues.find(z => String(typeof z === 'object' ? z.value : z) === String(v));
    if (e) return typeof e === 'object' ? (e.label || e.value) : e;
  }
  if (m.type === 'bool' || typeof v === 'boolean') return (v === true || v === 1 || v === '1') ? 'sí' : 'no';
  if (typeof v !== 'number') return String(v);
  return num(v, dec) + (m.unit ? ' ' + m.unit : '');
}

export function varNombre(x) {
  return (x && (x.label || (x.meta && x.meta.label) || (x.varMeta && x.varMeta.label)))
    || String((x && x.variable) || 'medición').replace(/_/g, ' ');
}

// {umbral} de los textos de la regla/ficha → valor del límite (o «el límite configurado»).
export function conUmbral(text, umbral) {
  const t = umbral && typeof umbral.value === 'number' ? valor(umbral.value, umbral) : 'el límite configurado';
  return String(text || '').replace(/\{umbral\}/g, t);
}

export function horaHM(ms) { if (ms == null) return '—'; const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; }
export function diaMes(ms) { if (ms == null) return '—'; const d = new Date(ms); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; }
// «13:14» si es de hoy; «02/11 13:14» si es de otro día.
export function cuando(ms, nowMs) {
  if (ms == null) return '—';
  const a = new Date(ms), b = new Date(nowMs || Date.now());
  const mismo = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  return mismo ? horaHM(ms) : `${diaMes(ms)} ${horaHM(ms)}`;
}

// Duración corta para leer de un vistazo: «45 s», «6 min», «2 h 10 min», «3 días».
export function lapso(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return m ? `${h} h ${m} min` : `${h} h`; }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return h && d < 3 ? `${d} ${d === 1 ? 'día' : 'días'} ${h} h` : `${d} ${d === 1 ? 'día' : 'días'}`;
}

// Nombre de uso del equipo (red, grupo, planta DC…) en lugar de su código.
const USO = {
  ELTEK: 'Planta DC', GEN: 'Grupo electrógeno', CUMMINS: 'Grupo electrógeno', 'cummins-pcc': 'Grupo electrógeno',
  ATS: 'Tablero de transferencia', TTA: 'Tablero de transferencia', SEC: 'Seguridad',
};
export function usoEquipo(deviceType) {
  if (!deviceType) return '';
  return USO[deviceType] || deviceTypeName(deviceType);
}

export const SEV_TXT = { critical: 'Crítica', warning: 'Advertencia', info: 'Informativa' };
export const sevKey = (s) => (['critical', 'warning', 'info'].includes(s) ? s : 'info');

// Cómo se cerró una alarma (mode del evento de cierre), en palabras.
export const CIERRE_TXT = {
  'resolve-by-condition': 'Se normalizó sola', 'resolve-by-setpoint-recovered': 'Volvió el límite del equipo',
  'resolve-by-ack': 'La confirmó el operador', 'resolve-by-service': 'Se registró el service',
  'resolve-by-edit': 'Se editó la regla', 'resolve-by-cleanup': 'Limpieza manual',
};
export function cierreTxt(mode) { return CIERRE_TXT[mode] || 'Se normalizó'; }
