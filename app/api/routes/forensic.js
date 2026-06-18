const express     = require("express");
const router      = express.Router();
const crypto      = require("crypto");
const PDFDocument = require("pdfkit");
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter } = require("../middlewares/scope.js");

import Site          from "../models/site.js";
import ForensicEvent from "../models/forensic_event.js";
import Operator      from "../models/operator.js";

// GET /api/forensic-events?siteCode=...
router.get("/forensic-events", checkAuth, async (req, res) => {
  try {
    const { siteCode } = req.query;

    if (!siteCode) {
      return res.status(400).json({ status: "error", error: "siteCode is required" });
    }

    // Gate del Site (DEC-REF-33). Eventos derivados sueltan userId.
    const siteFilter = await buildReadFilter(req, 'Site');
    const site = await Site.findOne({ ...siteFilter, siteCode });
    if (!site) {
      return res.status(404).json({ status: "error", error: "site not found" });
    }

    const events = await ForensicEvent
      .find({ siteId: siteCode })
      .sort({ timestamp: -1 })
      .lean();

    return res.json({ status: "success", data: events });
  } catch (error) {
    console.log("ERROR GETTING FORENSIC EVENTS");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// GET /api/forensic-events/verify?siteCode=...
router.get("/forensic-events/verify", checkAuth, async (req, res) => {
  try {
    const { siteCode } = req.query;

    if (!siteCode) {
      return res.status(400).json({ status: "error", error: "siteCode is required" });
    }

    // Gate del Site (DEC-REF-33). Eventos derivados sueltan userId.
    const siteFilter = await buildReadFilter(req, 'Site');
    const site = await Site.findOne({ ...siteFilter, siteCode });
    if (!site) {
      return res.status(404).json({ status: "error", error: "site not found" });
    }

    const events = await ForensicEvent
      .find({ siteId: siteCode })
      .sort({ timestamp: 1 })
      .lean();

    const result = ForensicEvent.verifyChain(events);

    return res.json({ status: "success", data: { ...result, totalEvents: events.length } });
  } catch (error) {
    console.log("ERROR VERIFYING FORENSIC CHAIN");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Ajuste C: throw/catch para validación de epoch ms
function parseEpochMs(val, fieldName) {
  if (val === undefined || val === '') return null;
  const n = Number(val);
  if (isNaN(n) || n < 0) throw new Error(`${fieldName} must be a valid positive epoch ms`);
  return n;
}

function truncStr(s, max) {
  s = String(s);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function truncatePayload(payload) {
  const entries = Object.entries(payload || {});
  const shown   = entries.slice(0, 3).map(([k, v]) => `${k}: ${truncStr(String(v), 24)}`);
  if (entries.length > 3) shown.push(`+${entries.length - 3} more`);
  return shown.join('  ');
}

function formatTs(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function calcFingerprint(events) {
  return crypto.createHash('sha256')
    .update(events.map(e => e.hash).join(''))
    .digest('hex');
}

const COLORS         = { HIGH: '#e53935', CRITICAL: '#b71c1c', MEDIUM: '#f57c00', LOW: '#388e3c' };
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// ── PDF rendering ─────────────────────────────────────────────────────────────

function renderPage1(doc, site, events, chainResult, exportMeta, operatorLabel) {
  doc.addPage();
  const marginL  = doc.page.margins.left;
  const contentW = doc.page.width - marginL - doc.page.margins.right;

  doc.fontSize(18).font('Helvetica-Bold').text('Reporte Forense de Site', { align: 'center' });
  doc.fontSize(11).font('Helvetica').text('Wanomi — Plataforma IoT', { align: 'center' });
  doc.moveDown(1.5);

  // Site info
  doc.fontSize(11).font('Helvetica-Bold').text('Datos del site');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Site Code:    ${site.siteCode}`);
  doc.text(`Nombre:       ${site.nombre}`);
  doc.text(`Tipo:         ${site.tipo}   |   Operador: ${operatorLabel}`);
  if (site.lat != null)   doc.text(`Coordenadas:  ${site.lat}, ${site.lng}`);
  if (site.direccion)     doc.text(`Dirección:    ${site.direccion}`);
  // Ajuste B: sumar localidad, provincia, notes
  if (site.localidad)     doc.text(`Localidad:    ${site.localidad}`);
  if (site.provincia)     doc.text(`Provincia:    ${site.provincia}`);
  if (site.notes)         doc.text(`Notas:        ${truncStr(site.notes, 200)}`);
  doc.text(`Exportado:    ${formatTs(exportMeta.exportedAt)}   |   Operador: ${exportMeta.userId}`);
  doc.moveDown(1);

  // Stats
  doc.fontSize(11).font('Helvetica-Bold').text('Resumen estadístico');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Total de eventos: ${events.length}`);
  if (events.length > 0) {
    doc.text(`Primer evento:    ${formatTs(events[0].timestamp)}`);
    doc.text(`Último evento:    ${formatTs(events[events.length - 1].timestamp)}`);
    const bySev = {};
    for (const s of SEVERITY_ORDER) bySev[s] = events.filter(e => e.severity === s).length;
    doc.text(`Por severidad:    ${SEVERITY_ORDER.map(s => `${s}: ${bySev[s]}`).join('  |  ')}`);
  }
  doc.moveDown(1);

  // Ajuste A: banner con posicionamiento explícito para ambos casos
  doc.fontSize(12).font('Helvetica-Bold').text('Integridad de la cadena forense');
  doc.moveDown(0.3);

  if (chainResult.valid) {
    const bannerY = doc.y;
    const bannerH = 28;
    doc.rect(marginL, bannerY, contentW, bannerH).fill('#e8f5e9');
    doc.fillColor('#1b5e20').fontSize(11).font('Helvetica-Bold')
       .text('✓  CADENA VÁLIDA — todos los hashes verificados correctamente',
             marginL + 6, bannerY + 8, { width: contentW - 12 });
    doc.y = bannerY + bannerH + 4;
  } else {
    const bannerY = doc.y;
    const bannerH = 50;
    doc.rect(marginL, bannerY, contentW, bannerH).fill('#ffebee');
    doc.fillColor('#b71c1c').fontSize(11).font('Helvetica-Bold')
       .text(`⚠  CADENA COMPROMETIDA — ruptura detectada en evento #${chainResult.brokenAt + 1}`,
             marginL + 6, bannerY + 8, { width: contentW - 12 });
    doc.fillColor('#b71c1c').fontSize(9).font('Helvetica')
       .text(`Motivo: ${chainResult.reason}`,
             marginL + 6, bannerY + 28, { width: contentW - 12 });
    doc.y = bannerY + bannerH + 4;
  }
  doc.fillColor('#000000');
}

function renderEventsTable(doc, events, chainResult) {
  const COLS = [
    { label: '#',         width: 28  },
    { label: 'Timestamp', width: 112 },
    { label: 'Device',    width: 72  },
    { label: 'Kind',      width: 90  },
    { label: 'Severity',  width: 54  },
    { label: 'Payload',   width: 110 },
    { label: 'Hash',      width: 56  },
    { label: 'PrevHash',  width: 56  },
  ];
  const ROW_H   = 18;
  const HEAD_H  = 20;
  const LEFT    = doc.page.margins.left;
  const TABLE_W = COLS.reduce((s, c) => s + c.width, 0);

  function drawHeader(y) {
    doc.rect(LEFT, y, TABLE_W, HEAD_H).fill('#37474f');
    let x = LEFT;
    for (const col of COLS) {
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
         .text(col.label, x + 2, y + 5, { width: col.width - 4, ellipsis: true, lineBreak: false });
      x += col.width;
    }
    doc.fillColor('#000000');
    return y + HEAD_H;
  }

  function newTablePage() {
    doc.addPage();
    return drawHeader(doc.page.margins.top);
  }

  let rowY = drawHeader(doc.y + 6);

  for (let i = 0; i < events.length; i++) {
    const e        = events[i];
    const isBroken = !chainResult.valid && chainResult.brokenAt === i;
    const rowBg    = isBroken ? '#ffcdd2' : (i % 2 === 0 ? '#fafafa' : '#ffffff');

    if (rowY + ROW_H > doc.page.height - doc.page.margins.bottom) {
      rowY = newTablePage();
    }

    doc.rect(LEFT, rowY, TABLE_W, ROW_H).fill(rowBg);

    const cells = [
      String(i + 1),
      formatTs(e.timestamp),
      e.deviceId,
      e.eventKind,
      e.severity,
      truncatePayload(e.payload),
      e.hash     ? e.hash.slice(0, 12)     : '—',
      e.prevHash && e.prevHash !== 'GENESIS' ? e.prevHash.slice(0, 12) : (e.prevHash || '—'),
    ];

    let x = LEFT;
    for (let c = 0; c < COLS.length; c++) {
      const textColor = (c === 4)
        ? (COLORS[e.severity] || '#000000')
        : (isBroken ? '#b71c1c' : '#000000');
      doc.fillColor(textColor).fontSize(7).font('Helvetica')
         .text(cells[c], x + 2, rowY + 5, { width: COLS[c].width - 4, ellipsis: true, lineBreak: false });
      x += COLS[c].width;
    }
    rowY += ROW_H;
  }
  doc.fillColor('#000000');
}

function renderAnnexA(doc, events) {
  doc.addPage();
  doc.fontSize(13).font('Helvetica-Bold').text('Anexo A — Hashes completos');
  doc.moveDown(0.5);

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
    doc.fontSize(8).font('Helvetica-Bold')
       .text(`#${i + 1}  ${formatTs(e.timestamp)}  ${e.eventKind}`);
    doc.font('Courier').fontSize(7)
       .text(`     hash:     ${e.hash}`)
       .text(`     prevHash: ${e.prevHash}`);
    doc.moveDown(0.3);
  }
}

function renderAnnexB(doc, events) {
  doc.addPage();
  doc.fontSize(13).font('Helvetica-Bold').text('Anexo B — Payloads completos');
  doc.moveDown(0.5);

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    doc.fontSize(8).font('Helvetica-Bold')
       .text(`#${i + 1}  ${formatTs(e.timestamp)}  ${e.eventKind}  [${e.severity}]`);
    doc.font('Courier').fontSize(7)
       .text(JSON.stringify(e.payload || {}, null, 2));
    doc.moveDown(0.4);
  }
}

function renderFingerprint(doc, events, exportMeta) {
  doc.addPage();
  doc.fontSize(13).font('Helvetica-Bold').text('Verificación de integridad del export');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica')
     .text('El fingerprint es el SHA-256 de la concatenación de todos los hashes de los eventos exportados.')
     .text('Para verificar: recalcular SHA-256 sobre los valores del campo "hash" en el mismo orden y comparar.');
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(10).text('Fingerprint SHA-256:');
  doc.font('Courier').fontSize(8).text(exportMeta.fingerprint);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(10).text('Datos del export:');
  doc.font('Helvetica').fontSize(9);
  doc.text(`Operador (userId): ${exportMeta.userId}`);
  doc.text(`Timestamp export:  ${formatTs(exportMeta.exportedAt)}`);
  doc.text(`Total eventos:     ${events.length}`);
  if (exportMeta.from) doc.text(`Filtro desde:      ${formatTs(exportMeta.from)}`);
  if (exportMeta.to)   doc.text(`Filtro hasta:      ${formatTs(exportMeta.to)}`);
}

// ── Export endpoint ───────────────────────────────────────────────────────────

// GET /api/forensic-events/export?siteCode=...&from=...&to=...
router.get("/forensic-events/export", checkAuth, async (req, res) => {
  try {
    const userId       = req.userData._id;
    const { siteCode } = req.query;

    if (!siteCode) {
      return res.status(400).json({ status: "error", error: "siteCode is required" });
    }

    // Ajuste C: parseEpochMs con throw/catch
    let from, to;
    try {
      from = parseEpochMs(req.query.from, 'from');
      to   = parseEpochMs(req.query.to,   'to');
    } catch (err) {
      return res.status(400).json({ status: "error", error: err.message });
    }
    if (from !== null && to !== null && from > to) {
      return res.status(400).json({ status: "error", error: "from must be <= to" });
    }

    // Gate del Site (DEC-REF-33). Eventos derivados sueltan userId.
    // userId se conserva para exportMeta (Operador que exportó el PDF).
    const siteFilter = await buildReadFilter(req, 'Site');
    const site = await Site.findOne({ ...siteFilter, siteCode });
    if (!site) {
      return res.status(404).json({ status: "error", error: "site not found" });
    }

    // Bug fix: query construcción + fetch de eventos
    const query = { siteId: siteCode };
    if (from !== null || to !== null) {
      query.timestamp = {};
      if (from !== null) query.timestamp.$gte = from;
      if (to   !== null) query.timestamp.$lte = to;
    }
    const events = await ForensicEvent.find(query).sort({ timestamp: 1 }).lean();

    const chainResult = ForensicEvent.verifyChain(events);
    const fingerprint = calcFingerprint(events);
    const exportedAt  = Date.now();
    const exportMeta  = { userId, fingerprint, exportedAt, from, to };

    const dateStr  = new Date(exportedAt).toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `forensic_${siteCode}_${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Resolver el operador del árbol de tenancy (DEC-REF-28). Fallback a cellOwner
    // legacy si el lookup falla — un PDF forense NUNCA debe salir con campo vacío.
    let operatorLabel = site.cellOwner;
    if (site.operatorCode) {
      const operator = await Operator.findOne({ operatorCode: site.operatorCode });
      if (operator && operator.displayName) operatorLabel = operator.displayName;
    }

    const doc = new PDFDocument({ autoFirstPage: false, margin: 36 });

    // Ajuste 2: error handler + headersSent guard
    doc.on('error', err => {
      console.log('PDFDocument stream error:', err);
      res.destroy(err);
    });

    doc.pipe(res);

    renderPage1(doc, site, events, chainResult, exportMeta, operatorLabel);
    renderEventsTable(doc, events, chainResult);
    renderAnnexA(doc, events);
    renderAnnexB(doc, events);
    renderFingerprint(doc, events, exportMeta);

    doc.end();

  } catch (error) {
    console.log("ERROR GENERATING FORENSIC PDF");
    console.log(error);
    if (!res.headersSent) {
      return res.status(500).json({ status: "error", error: error.message });
    }
    res.destroy(error);
  }
});

module.exports = router;
