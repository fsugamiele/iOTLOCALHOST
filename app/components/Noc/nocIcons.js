// R5 · G8 · 2 — Mini SVG inline para los headers de la tabla NOC.
// 14px, `fill` con currentColor → heredan el color del tema (dark/light).
// Funciones puras que devuelven strings — se emiten con v-html en el <th>.

const wrap = (inner) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" ` +
  `style="vertical-align:-2px;margin-right:4px" aria-hidden="true">${inner}</svg>`;

// Gota de combustible.
export const fuelIcon = () =>
  wrap('<path d="M12 2s-6 7.5-6 12a6 6 0 0 0 12 0c0-4.5-6-12-6-12z"/>');

// Termómetro.
export const tempIcon = () =>
  wrap(
    '<path d="M14 4a2 2 0 1 0-4 0v9.17a4 4 0 1 0 4 0V4zm-2 15a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>'
  );

// Rayo/tensión.
export const mainsIcon = () =>
  wrap('<path d="M13 2 4 14h7l-2 8 9-12h-7l2-8z"/>');

export default { fuelIcon, tempIcon, mainsIcon };
