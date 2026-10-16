// Wanomi · FASE 4 rediseño alarmas — helpers de formato compartidos por las
// páginas /alarmas y /alarmas/:id. formatDuration replica exactamente la
// función de NocAlarmsFeed.vue (fuente original, no tocada por pertenecer al
// NOC); si un día cambia allá, cambiar acá también o unificar import.

// Duración legible: "42 s", "12 min 30 s", "2 h 5 min". null → null.
export function formatDuration(sec) {
  if (sec == null) return null;
  if (sec < 60) return sec + ' s';
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m} min ${s} s` : `${m} min`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

// HH:MM:SS local.
export function formatTime(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// DD/MM/YYYY HH:MM:SS local.
export function formatDateTime(ms) {
  if (ms == null) return '—';
  const d = new Date(ms);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime(ms)}`;
}
