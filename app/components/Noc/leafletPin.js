// DEC-REF-27 · fuente única del pin de site — extraído en R3 de #49 (ajuste 3').
// Consumido por pages/sites/index.vue (mapa principal) y components/Noc/NocSiteBoard.vue
// (mini-mapa del NOC). Si aparece un tercer consumidor, sigue aterrizando aquí.
import L from 'leaflet';

export const STATUS_COLOR = {
  critical: '#E24B4A',
  warning:  '#EF9F27',
  ok:       '#639922',
};

export function iconForStatus(status) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.ok;
  // divIcon: pin de CSS puro, sin imagen — esquiva el bug de iconos en Webpack 4.
  return L.divIcon({
    className: 'site-pin-wrapper',
    html: `<span class="site-pin" style="background:${color}"></span>`,
    iconSize:   [18, 18],
    iconAnchor: [9, 9],
  });
}
