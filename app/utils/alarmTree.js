// Wanomi · FASE 1 rediseño alarmas — árbol de cascadas y agrupación de
// repeticiones. Funciones puras extraídas de NocAlarmsFeed.itemsOrdered
// (misma lógica, mismo comportamiento) para reutilizar en AlarmCard,
// drawer, consola y widget.

// (F1.b) — cascada agrupada con recursión y red de seguridad (C2).
// Un ítem cuyo correlationParent apunta al ruleId de otro ítem PRESENTE
// se renderiza inmediatamente debajo de su madre (recursivo). Si la
// madre NO está, va suelto en su posición cronológica marcado como
// cascada huérfana. Cierres defensivos: auto-parent no genera edge;
// ciclos blindados por el Set `emitted`; red de seguridad final
// appendea lo no emitido.
// Devuelve una NUEVA lista plana con `isCascade` en cada ítem.
export function buildAlarmTree(items) {
  const list = Array.isArray(items) ? items : [];
  const rulesInList = new Set(list.map(i => i.ruleId));
  const children = new Map();

  list.forEach(i => {
    if (i.correlationParent
        && i.correlationParent !== i.ruleId
        && rulesInList.has(i.correlationParent)) {
      if (!children.has(i.correlationParent)) children.set(i.correlationParent, []);
      children.get(i.correlationParent).push(i);
    }
  });

  const out = [];
  const emitted = new Set();

  const pushWithDescendants = (item, cascadeMarked) => {
    if (emitted.has(item._id)) return;
    out.push({ ...item, isCascade: cascadeMarked });
    emitted.add(item._id);
    const kids = children.get(item.ruleId) || [];
    kids.forEach(k => pushWithDescendants(k, true));
  };

  list.forEach(i => {
    if (emitted.has(i._id)) return;
    if (i.correlationParent
        && i.correlationParent !== i.ruleId
        && rulesInList.has(i.correlationParent)) return;
    const orphanCascade = !!(i.correlationParent && !rulesInList.has(i.correlationParent));
    pushWithDescendants(i, orphanCascade);
  });

  // Red de seguridad (C2): cualquier ítem no emitido — típicamente por
  // un ciclo cerrado sin raíz externa — al final, marcado como cascada.
  list.forEach(i => {
    if (!emitted.has(i._id)) {
      out.push({ ...i, isCascade: !!i.correlationParent });
      emitted.add(i._id);
    }
  });

  return out;
}

// Agrupa repeticiones de la misma alarma (misma ruleId + dId + severity)
// para el contador ×N. Devuelve grupos en orden de primera aparición:
//   { key, representative, count, items }
// `representative` es el primer ítem visto — el llamador debe pasar la
// lista ya ordenada (más reciente primero si la tarjeta muestra la última).
export function groupRepeats(items) {
  const list = Array.isArray(items) ? items : [];
  const groups = new Map();
  list.forEach(i => {
    const key = `${i.ruleId}|${i.dId}|${i.severity}`;
    if (!groups.has(key)) {
      groups.set(key, { key, representative: i, count: 0, items: [] });
    }
    const g = groups.get(key);
    g.count += 1;
    g.items.push(i);
  });
  return Array.from(groups.values());
}

// FASE 3/5 — adapta un ítem de GET /api/alarms (episodio FASE 2) al
// modelo que consume AlarmCard: _id (key de árbol/v-for), time (ms para
// AgeTicker), siteCode (línea de contexto) y kind (detección de
// resuelta). Conserva todos los campos originales (notificationId,
// siteId, state, repeatCount, childCount, ...).
export function apiAlarmToCard(item) {
  return {
    ...item,
    _id: item.notificationId,
    time: item.firedAt,
    siteCode: item.siteId,
    kind: item.state === 'resolved' ? 'resolve' : 'fire',
  };
}

// FASE 3 — árbol padre→hijos para la prop `children` de AlarmCard
// (el endpoint trae childCount pero no los hijos: se derivan de la
// lista activa). Un ítem cuyo correlationParent apunta al ruleId de
// otro ítem PRESENTE cuelga de su madre; si la madre no está (huérfano)
// o es auto-parent, va como raíz. Red de seguridad: ítems atrapados en
// un ciclo salen como raíces al final. Preserva el orden de entrada.
// Devuelve [{ alarm, children: [alarm...] }].
export function buildCascadeNodes(items) {
  const list = Array.isArray(items) ? items : [];
  const rulesInList = new Set(list.map(i => i.ruleId));
  const byRule = new Map();
  list.forEach(i => {
    if (!byRule.has(i.ruleId)) byRule.set(i.ruleId, []);
    byRule.get(i.ruleId).push(i);
  });

  const roots = [];
  const childrenOf = new Map();
  const emitted = new Set();

  list.forEach(i => {
    if (emitted.has(i._id)) return;
    emitted.add(i._id);
    if (i.correlationParent
        && i.correlationParent !== i.ruleId
        && rulesInList.has(i.correlationParent)) {
      const parent = byRule.get(i.correlationParent)[0];
      if (!childrenOf.has(parent._id)) childrenOf.set(parent._id, []);
      childrenOf.get(parent._id).push(i);
      return;
    }
    roots.push(i);
  });

  // Ciclos cerrados sin raíz externa: lo no emitido sale como raíz.
  list.forEach(i => {
    if (!emitted.has(i._id)) { roots.push(i); emitted.add(i._id); }
  });

  return roots.map(r => ({ alarm: r, children: childrenOf.get(r._id) || [] }));
}
