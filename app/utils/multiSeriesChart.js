// Franco 2026-11-17 — varias variables en un mismo gráfico (Tendencia del panel e Historial).
// Arma las opciones de Highcharts para N series de M variables:
//   · ejes Y por UNIDAD: dos variables en V comparten eje si sus valores andan por la misma zona
//     (se pueden comparar); si no (12 V de arranque y −54 V de la planta DC) van en ejes
//     separados para no aplastarse. Unidades distintas nunca comparten eje. Los ejes se alternan
//     a izquierda y derecha; una variable sin datos no ocupa eje;
//   · cada variable conserva su trazo (llena, guiones, puntos…) y su color en el eje, para que
//     se lea qué eje es de cuál;
//   · el cursor muestra todas las series juntas en ese momento.
// Sin dependencias: JS plano (DEC-STACK-1).

export const MAX_VARIABLES = 4;

const PALETTE = ['#4FC3F7', '#FFB74D', '#81C784', '#F06292', '#BA68C8', '#FFD54F', '#4DB6AC', '#E57373'];
const DASHES = ['Solid', 'ShortDash', 'ShortDot', 'DashDot'];

/**
 * series: [{ name, variable, label, unit, data: [[epochMsUTC, value], ...] }]
 * vars:   [{ variable, label, unit }] en el orden elegido por el usuario
 * opts:   { isLight, colorBy: 'series' | 'variable', height }
 */
export function buildMultiChart(series, vars, { isLight = false, colorBy = 'series' } = {}) {
  const textColor = isLight ? '#525f7f' : '#d4d2d2';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  // Compensación TZ: el backend manda epoch ms UTC; Highcharts lo dibuja como UTC.
  const offset = new Date().getTimezoneOffset() * 60 * 1000 * -1;

  const varIdx = new Map(vars.map((v, i) => [v.variable, i]));
  const colorDeVar = (v) => PALETTE[varIdx.get(v) % PALETTE.length];

  // Rango de valores de cada variable (todas sus series). Sin datos → no ocupa eje.
  const rango = new Map();
  series.forEach(s => (s.data || []).forEach(p => {
    if (typeof p[1] !== 'number' || !Number.isFinite(p[1])) return;
    const r = rango.get(s.variable) || { min: p[1], max: p[1] };
    r.min = Math.min(r.min, p[1]); r.max = Math.max(r.max, p[1]);
    rango.set(s.variable, r);
  }));
  // Grupos de eje: misma unidad y rangos que se tocan (con un margen de medio rango).
  const grupos = [];   // [{ unit, vars: [v], min, max }]
  vars.filter(v => rango.has(v.variable)).forEach(v => {
    const r = rango.get(v.variable), u = v.unit || '';
    const g = grupos.find(x => {
      if (x.unit !== u) return false;
      const pad = Math.max(x.max - x.min, r.max - r.min, Math.abs(x.max), Math.abs(r.max)) * 0.5;
      return r.min <= x.max + pad && r.max >= x.min - pad;
    });
    if (g) { g.vars.push(v); g.min = Math.min(g.min, r.min); g.max = Math.max(g.max, r.max); }
    else grupos.push({ unit: u, vars: [v], min: r.min, max: r.max });
  });
  const ejeDe = new Map();
  grupos.forEach((g, i) => g.vars.forEach(v => ejeDe.set(v.variable, i)));

  const yAxis = grupos.map((g, i) => {
    const u = g.unit, vs = g.vars;
    // Color del eje = el de su variable si es una sola y se colorea por variable; si no, el del texto.
    const col = colorBy === 'variable' && vs.length === 1 ? colorDeVar(vs[0].variable) : textColor;
    const titulo = vars.length > 1 ? (vs.length === 1 ? `${vs[0].label}${u ? ' (' + u + ')' : ''}` : (u || 'sin unidad')) : '';
    return {
      title: { text: titulo, style: { color: col } },
      labels: { style: { color: col }, format: u ? `{value} ${u}` : '{value}' },
      gridLineColor: i === 0 ? gridColor : 'transparent',
      opposite: i % 2 === 1,
    };
  });
  if (!yAxis.length) yAxis.push({ title: { text: '' }, labels: { style: { color: textColor } }, gridLineColor: gridColor });

  const out = series.map((s, i) => {
    const vi = varIdx.has(s.variable) ? varIdx.get(s.variable) : 0;
    return {
      name: s.name,
      yAxis: ejeDe.has(s.variable) ? ejeDe.get(s.variable) : 0,
      color: colorBy === 'variable' ? colorDeVar(s.variable) : PALETTE[i % PALETTE.length],
      dashStyle: DASHES[vi % DASHES.length],
      tooltip: { valueSuffix: s.unit ? ' ' + s.unit : '' },
      data: (s.data || []).map(p => [p[0] + offset, p[1]]),
    };
  });

  return {
    credits: { enabled: false },
    chart: { defaultSeriesType: 'line', backgroundColor: 'rgba(0,0,0,0)' },
    title: { text: '' },
    time: { useUTC: true },
    xAxis: { type: 'datetime', labels: { style: { color: textColor } }, gridLineColor: gridColor },
    yAxis,
    tooltip: { shared: true, xDateFormat: '%d/%m %H:%M', valueDecimals: 2 },
    legend: { itemStyle: { color: textColor }, itemHoverStyle: { color: isLight ? '#1d253b' : '#ffffff' } },
    plotOptions: { series: { label: { connectorAllowed: false }, marker: { enabled: false }, lineWidth: 2 } },
    series: out,
    responsive: {
      rules: [{
        condition: { maxWidth: 500 },
        chartOptions: { legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' }, yAxis: yAxis.map(() => ({ title: { text: '' } })) },
      }],
    },
  };
}

// Nombre visible de una variable: «Nivel de combustible (%)».
export function varTxt(v) {
  const n = v.label || v.variableFullName || v.variable;
  return v.unit ? `${n} (${v.unit})` : n;
}
