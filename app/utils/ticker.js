// Wanomi · FASE 1 rediseño alarmas — reloj global compartido para los
// contadores de edad "activa hace HH:MM:SS". UN solo setInterval para
// toda la app (no uno por tarjeta): los componentes leen `ticker.now`
// reactivo y se suscriben con acquireTicker()/releaseTicker().
import Vue from 'vue';

export const ticker = new Vue({
  data: { now: Date.now() },
});

let intervalId = null;
let refs = 0;

export function startTicker() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => { ticker.now = Date.now(); }, 1000);
}

export function stopTicker() {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}

// API con contador de referencias para componentes: el intervalo vive
// mientras haya al menos un consumidor montado (sin fugas).
export function acquireTicker() {
  refs += 1;
  startTicker();
}

export function releaseTicker() {
  refs = Math.max(0, refs - 1);
  if (refs === 0) stopTicker();
}

// Edad fluida en HH:MM:SS SIEMPRE (decisión: el mockup usa HH:MM:SS
// incluso bajo la hora; se prefiere consistencia sobre MM:SS condicional).
export function formatAgeHHMMSS(sinceMs, now = Date.now()) {
  if (sinceMs == null) return '--:--:--';
  const total = Math.max(0, Math.floor((now - sinceMs) / 1000));
  const p = n => (n < 10 ? '0' + n : '' + n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${p(h)}:${p(m)}:${p(s)}`;
}
