// spec_supervisor_confiabilidad_v2 (R4) — formato de números. Un valor no finito se muestra "—":
// la UI nunca imprime NaN / Infinity (§0 de la spec).
export const fin = (v) => typeof v === 'number' && isFinite(v);
export const fmt = (v, d = 1) => (!fin(v) ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (v, d = 2) => (!fin(v) ? '—' : `${fmt(v, d)} %`);
export const horas = (v) => (!fin(v) ? '—' : v < 1 ? `${Math.round(v * 60)} min` : `${fmt(v, 1)} h`);
export const fecha = (t) => (t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const fechaLarga = (t) => (t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const VEREDICTOS = {
  avisa_de_mas: { txt: 'Avisa de más', cls: 'atn', orden: 0 },
  no_evalua: { txt: 'No puede evaluar', cls: 'mal', orden: 1 },
  inalcanzable: { txt: 'Inalcanzable', cls: 'mal', orden: 2 },
  umbral_revisar: { txt: 'Umbral a revisar', cls: 'info', orden: 3 },
  proteccion: { txt: 'Protección sin disparos', cls: 'ok', orden: 4 },
  sana: { txt: 'Sana', cls: 'ok', orden: 5 },
};
// Controles de integridad: nombre en lenguaje llano y el criterio exacto con que se evalúa.
export const CONTROLES = {
  I1: { nombre: 'Cierre en otro equipo', criterio: 'Un cierre sin aviso abierto de la misma regla en ese equipo, mientras otro equipo de la misma regla sí la tenía abierta (busca también avisos de hasta 90 días antes de la ventana).' },
  I4: { nombre: 'Cierre sin aviso', criterio: 'Un cierre sin ningún aviso abierto del par regla + equipo, ni en la ventana de 48 h ni antes (hasta 90 días).' },
  I2: { nombre: 'Avisos repetidos sin cierre', criterio: 'Más de un aviso del mismo par regla + equipo sin un cierre entre ellos.' },
  I3: { nombre: 'Prende y apaga rápido', criterio: 'Ciclos aviso → cierre → aviso del mismo par en menos de 90 s.' },
  I5: { nombre: 'Encendida con la medición normal', criterio: 'Alarma abierta mientras la medición lleva más de 30 min (+ la espera de cierre de la regla) sin cumplir la condición.' },
  I6: { nombre: 'Valor del aviso ≠ medición', criterio: 'Ninguna lectura entre el inicio de la espera de la regla y el aviso (± 2 min) coincide con el valor del aviso (± 2 %).' },
  I15: { nombre: 'Motor y consola no coinciden', criterio: 'Alarmas abiertas en el motor vs. activas en la consola, con 120 s de margen.' },
  I7: { nombre: 'Cálculo derivado inconsistente', criterio: 'El supervisor recalcula consumo y autonomía con fórmulas propias y compara con lo publicado.' },
  I8: { nombre: 'Valor físicamente imposible', criterio: 'Lecturas fuera del rango plausible de la medición.' },
  I13: { nombre: 'La regla cambió (deriva)', criterio: 'La definición viva difiere de su versión de referencia. Si el cambio es intencional, aceptala como nueva referencia.' },
  I14: { nombre: 'Cambió lo que calcula la regla', criterio: 'Cambió la métrica o la ventana de una regla de tendencia respecto de su referencia.' },
  INGESTA: { nombre: 'Dato que dejó de llegar', criterio: 'Una medición sin lecturas hace más de 3 veces su cadencia habitual (mínimo 30 min).' },
  MUERTA: { nombre: 'Muerta (control viejo)', criterio: 'Reemplazado por «Calidad de las reglas» (motor completo). Se cierra solo.' },
  PERMANENTE: { nombre: 'Permanente (control viejo)', criterio: 'Reemplazado por «Calidad de las reglas». Se cierra solo.' },
  RUIDOSA: { nombre: 'Ruidosa (control viejo)', criterio: 'Reemplazado por «Calidad de las reglas». Se cierra solo.' },
};
