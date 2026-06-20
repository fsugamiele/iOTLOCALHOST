// 31.4a — Módulo de fetch puro para históricos. JS plano (DEC-STACK-1).
// Sin Vue, sin estado, sin imports de store. Migrable a Vue 3 sin reescritura.
//
// El gate de grants vive en el backend (DEC-REF-33/34). Este módulo NO
// reimplementa autorización: solo envuelve la llamada y devuelve el array
// de samples tal cual lo devuelve el backend.
//
// El caller pasa `axios` y `token` explícitos — sin acoplamiento al $axios
// de Nuxt ni al Vuex store. Testeable plano desde Node (sin Nuxt corriendo).

/**
 * fetchHistory({ axios, token, dId, variable, chartTimeAgo })
 *   → Promise<Array<{ time:number, value:any, ... }>>
 *
 * Invisibilidad de DEC-REF-34: si el dId está fuera del scope del caller,
 * el backend responde { status:"success", data:[] }. Esta función refleja
 * eso devolviendo [] (NO throw). Errores reales (network, 5xx) sí throwen.
 *
 * @param {Object} axios    cliente axios con baseURL configurado (debe
 *                          resolver `/get-small-charts-data` al endpoint
 *                          montado en `/api`).
 * @param {string} token    JWT del caller, va en header `token` (no Bearer).
 * @param {string} dId      device id.
 * @param {string} variable slug de la variable (ej. "battery_beacons_count").
 * @param {number} chartTimeAgo minutos hacia atrás (mismo contrato que el
 *                              caller actual, Rtnumberchart.vue).
 * @returns {Promise<Array>}
 */
export async function fetchHistory({ axios, token, dId, variable, chartTimeAgo }) {
  const res = await axios.get('/get-small-charts-data', {
    headers: { token },
    params:  { dId, variable, chartTimeAgo },
  });
  return res.data.data;
}
