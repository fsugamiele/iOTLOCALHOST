// Tenancy authorization helper (DEC-REF-33).
// Centraliza la traducción de grants[] (DEC-REF-29) a filtros Mongo.
// La autorización vive en el gate del Site; los derivados (Device, Template,
// ForensicEvent, Notification dentro de endpoints multi-colección) sueltan
// userId y filtran por siteId, confiando en el gate.
//
// CommonJS por consistencia con el resto de middlewares (authentication.js
// usa el mismo patrón require('../models/x').default).

const mongoose = require('mongoose');
const Site   = require('../models/site.js').default;
const Device = require('../models/device.js').default;

// DENY sentinel (DEC-REF-37) — modelos derivados sin tenencia propia (Notification,
// Template) que NO son alcanzados por ningún grant deben devolver "ningún doc",
// NO ownership por userId. El ownership-fallback de buildReadFilter dejaba pasar
// dato pegado al userId viejo post-TENANT-4 (causa raíz BACKLOG-TENANT-7).
//
// Símbolo para identidad referencial (=== en buildReadFilter). El filtro Mongo
// real ({ $expr: false }) se devuelve en buildReadFilter — Mongo evalúa false
// para cada doc, match 0. No depende de _id ni de generación de ObjectId.
const DENY = Symbol('scope-deny');
const DENY_FILTER = { $expr: false };

// Modelos sin tenencia propia: visibilidad DERIVADA del Site (Notification por
// siteId, ForensicEvent por siteId, Template por Device.templateId). NO conservan
// ownership-fallback cuando no hay grant — fail-close. ForensicEvent es dato
// forense generado por el motor edge de un sitio (no por un usuario suelto);
// hoy todos sus endpoints gatean por Site previo, pero DENY lo blinda contra
// un endpoint standalone futuro (defensa en profundidad, no premature hardening:
// el costo es nulo y el dato es sensible). Site y Device son distintos: Site
// es la raíz, y Device tiene siteId opcional en schema (un usuario sin grant
// debe poder ver sus propios devices).
function hasDenyFallback(modelName) {
  return modelName === 'Notification'
      || modelName === 'Template'
      || modelName === 'ForensicEvent';
}

// scopeFilterFor(grants, modelName) — pura en parámetros (no recibe req),
// pero hace I/O a Mongo para resolver siteCodes en modelos derivados.
//
// Retorna:
//   {}    → superadmin (match all)
//   null  → ningún grant alcanza este modelo, caller compone con userId (ownership)
//   DENY  → derivado sin tenencia propia sin alcance, caller materializa filtro 0-match (DEC-REF-37)
//   { ... filtro Mongo positivo ... }
async function scopeFilterFor(grants, modelName) {
  if (grants.some(g => g.role === 'superadmin')) return {};

  // Grants con scope útil (operatorCode mínimo). Superadmin omite scope (lección 28.3).
  const scoped = grants.filter(g =>
    g.role !== 'superadmin' && g.scope && g.scope.operatorCode
  );
  if (scoped.length === 0) {
    // DEC-REF-37: derivados sin tenencia propia → DENY; resto → null (ownership).
    return hasDenyFallback(modelName) ? DENY : null;
  }

  if (modelName === 'Site') {
    return buildSiteScopeFilter(scoped);
  }

  // Notification, ForensicEvent: derivados sin tenencia propia. Misma resolución
  // (siteId join). Alcance vacío → DENY (DEC-REF-37).
  if (modelName === 'Notification' || modelName === 'ForensicEvent') {
    const siteFilter = buildSiteScopeFilter(scoped);
    const sites = await Site.find(siteFilter, { siteCode: 1, _id: 0 }).lean();
    if (sites.length === 0) return DENY;
    const codes = sites.map(s => s.siteCode);
    return { siteId: { $in: codes } };
  }

  // Device: alcance vacío conserva null → ownership. Por diseño (recon estructural
  // #34: siteId opcional en schema, un usuario sin grant debe poder ver sus
  // propios devices).
  if (modelName === 'Device') {
    const siteFilter = buildSiteScopeFilter(scoped);
    const sites = await Site.find(siteFilter, { siteCode: 1, _id: 0 }).lean();
    if (sites.length === 0) return null;
    const codes = sites.map(s => s.siteCode);
    return { siteId: { $in: codes } };
  }

  if (modelName === 'Template') {
    const siteFilter = buildSiteScopeFilter(scoped);
    const sites = await Site.find(siteFilter, { siteCode: 1, _id: 0 }).lean();
    if (sites.length === 0) return DENY;  // DEC-REF-37
    const codes = sites.map(s => s.siteCode);

    // Site → Device → Template (dos saltos; el scope vive en el Site)
    const devices = await Device.find(
      { siteId: { $in: codes } },
      { templateId: 1, _id: 0 }
    ).lean();
    const tplIds = [...new Set(devices.map(d => d.templateId))]
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => mongoose.Types.ObjectId(id));
    if (tplIds.length === 0) return DENY;  // DEC-REF-37

    return { _id: { $in: tplIds } };
  }

  return null;
}

function buildSiteScopeFilter(scoped) {
  const ors = scoped.map(g => {
    const f = { operatorCode: g.scope.operatorCode };
    if (g.scope.zoneCode) f.zoneCode = g.scope.zoneCode;
    if (g.scope.siteCode) f.siteCode = g.scope.siteCode;
    return f;
  });
  return ors.length === 1 ? ors[0] : { $or: ors };
}

// buildReadFilter(req, modelName) — wrapper que compone alcance del grant
// con el filtro por userId del dueño actual.
//
// Composición:
//   scope === DENY  → DENY_FILTER             (DEC-REF-37 — derivado sin tenencia, sin grant alcance)
//   scope === null  → { userId }              (sin alcance vía grant — solo lo propio)
//   scope === {}    → {}                      (superadmin — descarta userId, ve TODO)
//   scope positivo  → { $or:[{userId}, scope] }
//
// Los reads de los endpoints user-facing usan SIEMPRE este wrapper —
// ningún endpoint reimplementa el filtro a mano (single point of authorization).
async function buildReadFilter(req, modelName) {
  const userId = req.userData._id;
  const grants = req.userData.grants || [];
  const scope  = await scopeFilterFor(grants, modelName);

  if (scope === DENY) return DENY_FILTER;        // DEC-REF-37: 0-match filter, NO ownership fallback.
  if (scope === null) return { userId };
  if (Object.keys(scope).length === 0) return {};
  return { $or: [ { userId }, scope ] };
}

// resolveScopedDIds(req) — devuelve array de dIds alcanzables por el usuario actual.
// Resolución para colecciones que NO tienen siteId propio (Data): el alcance del
// grant se materializa como un set de dIds, NO como un filtro directo sobre la
// colección. El caller (30.2: dataprovider.js) compondrá con un {dId:{$in:[...]}}.
//
// Reusa scopeFilterFor(grants, 'Site') — única traducción grants→filtro, alineado
// con DEC-REF-33 (single point of authorization). La materialización a dIds se
// hace sobre Device (que tiene userId Y siteId):
//   scope === null   (sin grant útil)  → dIds de devices del propio userId
//   scope === {}     (superadmin)      → todos los dIds
//   scope positivo                      → dIds de devices propios OR en sites del scope
//
// El caso "sin grant" SIGUE devolviendo devices del userId aunque no tengan siteId
// poblado — no rompe al dueño con devices huérfanos (Device.siteId es opcional en
// el schema; 10/10 poblados hoy pero la garantía debe sostenerse en el helper).
//
// Costo: 1 query (superadmin/sin-grant) o 2 (con scope: Site.find + Device.distinct).
// Sin migración de datos, sin índice nuevo (Device.userId/.siteId sin índice
// secundario hoy — 10 devices, irrelevante; queda para BACKLOG-PERF-1).
async function resolveScopedDIds(req) {
  const userId = req.userData._id;
  const grants = req.userData.grants || [];
  const scope  = await scopeFilterFor(grants, 'Site');

  if (scope === null)                  return Device.distinct('dId', { userId });
  if (Object.keys(scope).length === 0) return Device.distinct('dId');

  const sites = await Site.find(scope, { siteCode: 1, _id: 0 }).lean();
  const siteCodes = sites.map(s => s.siteCode);

  const orParts = [{ userId }];
  if (siteCodes.length) orParts.push({ siteId: { $in: siteCodes } });
  return Device.distinct('dId', { $or: orParts });
}

// resolveScopedDIdsWithOwner(req) — como resolveScopedDIds pero devuelve
// [{ dId, userId }] en lugar de [dId]. Necesario para construir ACLs MQTT B-narrow
// (DEC-REF-38): el topic `{owner}/{dId}/...` requiere el userId del dueño ACTUAL
// del device, no sólo el dId. Reusa `scopeFilterFor('Site')` — misma autorización
// centralizada (DEC-REF-33), no la reimplementa. Mismas 3 ramas que resolveScopedDIds.
//
// scopeFilterFor('Site') nunca retorna DENY (Site no está en hasDenyFallback);
// las 3 ramas alcanzables son null / {} / scope positivo.
async function resolveScopedDIdsWithOwner(req) {
  const userId = req.userData._id;
  const grants = req.userData.grants || [];
  const scope  = await scopeFilterFor(grants, 'Site');

  let query;
  if (scope === null) {
    query = { userId };
  } else if (Object.keys(scope).length === 0) {
    query = {};
  } else {
    const sites = await Site.find(scope, { siteCode: 1, _id: 0 }).lean();
    const siteCodes = sites.map(s => s.siteCode);
    const orParts = [{ userId }];
    if (siteCodes.length) orParts.push({ siteId: { $in: siteCodes } });
    query = { $or: orParts };
  }

  const devices = await Device.find(query, { dId: 1, userId: 1, _id: 0 }).lean();
  return devices.map(d => ({ dId: d.dId, userId: d.userId }));
}

module.exports = { scopeFilterFor, buildReadFilter, resolveScopedDIds, resolveScopedDIdsWithOwner };
