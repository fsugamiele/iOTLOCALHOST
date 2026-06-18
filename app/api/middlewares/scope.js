// Tenancy authorization helper (DEC-REF-33).
// Centraliza la traducción de grants[] (DEC-REF-29) a filtros Mongo.
// La autorización vive en el gate del Site; los derivados (Device, Template,
// ForensicEvent, Notification dentro de endpoints multi-colección) sueltan
// userId y filtran por siteId, confiando en el gate.
//
// CommonJS por consistencia con el resto de middlewares (authentication.js
// usa el mismo patrón require('../models/x').default).

const Site = require('../models/site.js').default;

// scopeFilterFor(grants, modelName) — pura en parámetros (no recibe req),
// pero hace I/O a Mongo para resolver siteCodes en modelos derivados.
//
// Retorna:
//   {}    → superadmin (match all)
//   null  → ningún grant alcanza este modelo (caller compone con userId)
//   { ... filtro Mongo positivo ... }
async function scopeFilterFor(grants, modelName) {
  if (grants.some(g => g.role === 'superadmin')) return {};

  // Grants con scope útil (operatorCode mínimo). Superadmin omite scope (lección 28.3).
  const scoped = grants.filter(g =>
    g.role !== 'superadmin' && g.scope && g.scope.operatorCode
  );
  if (scoped.length === 0) return null;

  if (modelName === 'Site') {
    return buildSiteScopeFilter(scoped);
  }

  // Derivadas: el join es por siteCode STRING (campo se llama siteId, recon 28.x.3).
  if (modelName === 'Notification' || modelName === 'ForensicEvent' || modelName === 'Device') {
    const siteFilter = buildSiteScopeFilter(scoped);
    const sites = await Site.find(siteFilter, { siteCode: 1, _id: 0 }).lean();
    if (sites.length === 0) return null;
    const codes = sites.map(s => s.siteCode);
    return { siteId: { $in: codes } };
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
// Composición "userId OR scope":
//   scope === null  → { userId }         (sin alcance vía grant — solo lo propio)
//   scope === {}    → {}                 (superadmin — descarta userId, ve TODO)
//   scope positivo  → { $or:[{userId}, scope] }
//
// Los reads de los endpoints user-facing usan SIEMPRE este wrapper —
// ningún endpoint reimplementa el filtro a mano (single point of authorization).
async function buildReadFilter(req, modelName) {
  const userId = req.userData._id;
  const grants = req.userData.grants || [];
  const scope  = await scopeFilterFor(grants, modelName);

  if (scope === null) return { userId };
  if (Object.keys(scope).length === 0) return {};
  return { $or: [ { userId }, scope ] };
}

module.exports = { scopeFilterFor, buildReadFilter };
