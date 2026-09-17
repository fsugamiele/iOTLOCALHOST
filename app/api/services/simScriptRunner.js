'use strict';
// ════════════════════════════════════════════════════════════════════
// simScriptRunner — reloj de guiones EN EL SERVIDOR (DEC-REF-100 D-8, F8)
//
// Un guion en ejecución es un set de setTimeout (uno por paso + uno de
// cleanup final) que publican `set_sensor` / `reset` por publishCommand —
// el MISMO camino del botón Aplicar de la UI. El proceso del simulador
// queda intacto.
//
// Riesgo declarado y aceptado (D-8): un restart del backend corta el guion
// en curso sin cleanup — mitigado con Detener explícito y el botón Reset
// por equipo que ya existe en la UI.
//
// Bloqueo por sitio: un solo guion activo por siteId (activeRuns es la
// fuente de verdad en memoria del proceso; single-instance por diseño).
// ════════════════════════════════════════════════════════════════════

const activeRuns = new Map(); // siteId → run
let runSeq = 0;

function publicView(run) {
  return {
    runId: run.runId,
    scriptId: run.scriptId,
    scriptName: run.scriptName,
    siteId: run.siteId,
    userId: run.userId,
    startedAt: run.startedAt,
    totalSec: run.totalSec,
    stepsTotal: run.stepsTotal,
    stepsDone: run.stepsDone,
    cleanup: run.cleanup,
  };
}

function isSiteBusy(siteId) {
  return activeRuns.has(siteId);
}

function listActive() {
  return [...activeRuns.values()].map(publicView);
}

function getRunBySite(siteId) {
  const run = activeRuns.get(siteId);
  return run ? publicView(run) : null;
}

// startRun({ script, userId, publishCommand }) → publicView
// script: doc SimScript (lean). publishCommand: (dId, command) → Promise.
function startRun({ script, userId, publishCommand }) {
  if (activeRuns.has(script.siteId)) {
    const err = new Error(`Ya hay un guion en ejecución en el sitio ${script.siteId}`);
    err.statusCode = 409;
    throw err;
  }

  const totalSec = Math.max(...script.steps.map(s => s.atSec), 0);
  const run = {
    runId: `run-${Date.now()}-${++runSeq}`,
    scriptId: String(script._id),
    scriptName: script.name,
    siteId: script.siteId,
    userId,
    startedAt: Date.now(),
    totalSec,
    stepsTotal: script.steps.length,
    stepsDone: 0,
    cleanup: script.cleanup,
    timers: [],
  };
  activeRuns.set(script.siteId, run);

  for (const step of script.steps) {
    const t = setTimeout(() => {
      publishCommand(step.dId, { command: 'set_sensor', sensor: step.variable, value: step.value })
        .catch(err => console.error(`[simScriptRunner] paso falló (${run.runId} ${step.dId}.${step.variable}):`, err.message));
      run.stepsDone++;
    }, step.atSec * 1000);
    run.timers.push(t);
  }

  // Timer final: +500 ms de cola para que los pasos con atSec === totalSec
  // disparen primero (mismo-ms FIFO no es garantía contractual).
  const involvedDIds = [...new Set(script.steps.map(s => s.dId))];
  const endTimer = setTimeout(() => {
    if (run.cleanup === 'reset') {
      for (const dId of involvedDIds) {
        publishCommand(dId, { command: 'reset' })
          .catch(err => console.error(`[simScriptRunner] reset falló (${run.runId} ${dId}):`, err.message));
      }
    }
    activeRuns.delete(script.siteId);
  }, totalSec * 1000 + 500);
  run.timers.push(endTimer);

  return publicView(run);
}

// stopRun(siteId) → publicView del run detenido, o null si no había.
// Detener NO aplica cleanup: los valores quedan donde están (el operador
// decide con el Reset por equipo).
function stopRun(siteId) {
  const run = activeRuns.get(siteId);
  if (!run) return null;
  for (const t of run.timers) clearTimeout(t);
  activeRuns.delete(siteId);
  return publicView(run);
}

module.exports = { startRun, stopRun, isSiteBusy, listActive, getRunBySite };
