// Posiciones de scroll por ruta (para las tabs de ventanas). Lo escribe
// router.scrollBehavior.js al salir de cada página y lo lee el layout
// default para restaurarla al volver (con reintentos: el contenido crece
// async tras la navegación y un scrollTo inmediato clampearía).
const positions = {};

export function saveScrollPos(path, y) {
  if (path) positions[path] = y;
}

export function getScrollPos(path) {
  return positions[path] || 0;
}
