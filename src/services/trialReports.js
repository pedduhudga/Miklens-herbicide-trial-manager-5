/**
 * trialReports.js — Full-fidelity port of all export/report functions.
 * Matches exact PDF structure, colors, fonts, table layouts from legacy HTML app.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import pptxgen from 'pptxgenjs';

// ── COLORS ────────────────────────────────────────────────────────────────────
const TEAL    = [13, 148, 136];
const DARK    = [44, 62, 80];
const AMBER50 = [255, 251, 235];

// ── UTILS ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));
}
function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
function validateEfficacy(data) {
  if (!Array.isArray(data)) return [];
  return data.filter(o => o && (o.daa !== undefined || o.weedCover !== undefined));
}
function fmtDate(d) {
  if (!d) return 'N/A';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return d; }
}
function safeName(s) { return (s || 'trial').replace(/[^a-z0-9_\-]/gi, '_'); }
function dlBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function toBase64(src, maxPx = 400) {
  return new Promise(resolve => {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve(null), 5000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const r = img.width / img.height;
          let w = img.width, h = img.height;
          if (w > maxPx || h > maxPx) { if (r > 1) { w = maxPx; h = Math.round(maxPx / r); } else { h = maxPx; w = Math.round(maxPx * r); } }
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        } catch { resolve(null); }
      };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = normalizeSrc(src);
    } catch { resolve(null); }
  });
}
function photoSrc(p) {
  if (!p) return null;
  if (typeof p === 'string') return p;
  return p.fileData || p.url || p.src || null;
}
function normalizeSrc(src) {
  if (!src || typeof src !== 'string') return src;
  // Already a data URI — use as-is
  if (/^data:image\//i.test(src)) return src;
  // Google Drive URLs — thumbnail endpoint is CORS-blocked (302 redirect + no ACAO header).
  // Route through images.weserv.nl which fetches server-side and returns a CORS-safe response.
  const driveMatch = src.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) ||
                     src.match(/\/d\/([a-zA-Z0-9_-]{10,})/) ||
                     src.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (driveMatch) {
    const directUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    return `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=400&output=jpg`;
  }
  // For all other remote URLs proxy through images.weserv.nl to bypass CORS
  if (/^https?:\/\//i.test(src)) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=400&output=jpg`;
  }
  return src;
}
function addImgSafe(doc, data, x, y, w, h) {
  if (!data || !w || !h) return false;
  try { doc.addImage(data, data.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, w, h); return true; }
  catch { try { doc.addImage(data, 'JPEG', x, y, w, h); return true; } catch { return false; } }
}
function createDoc() {
  return new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
}
function calcWCE(efficacy) {
  const sp = {};
  efficacy.forEach(obs => {
    (obs.weedDetails || [{ species: 'Total', cover: obs.weedCover ?? 0 }]).forEach(wd => {
      const k = (wd.species || 'Total').trim();
      if (!sp[k]) sp[k] = [];
      sp[k].push({ daa: obs.daa, cover: wd.cover ?? obs.weedCover ?? 0 });
    });
  });
  return Object.entries(sp).map(([species, pts]) => {
    const sorted = pts.sort((a, b) => a.daa - b.daa);
    const first = sorted[0]?.cover ?? 0;
    const last  = sorted[sorted.length - 1]?.cover ?? 0;
    const wce   = first > 0 ? Math.max(0, ((first - last) / first) * 100) : 0;
    return { species, initialCover: first, finalCover: last, wce };
  });
}
function coverSummary(efficacy, trial) {
  const s = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
  if (s.length < 2) return trial.Conclusion || 'Insufficient observations for trajectory analysis.';
  const first = s[0].weedCover ?? 0;
  const last  = s[s.length - 1].weedCover ?? 0;
  const min   = Math.min(...s.map(o => o.weedCover ?? 100));
  const minD  = s.find(o => (o.weedCover ?? 100) === min)?.daa ?? 0;
  const dur   = (s[s.length - 1].daa ?? 0) - (s[0].daa ?? 0);
  return `Aggregate weed cover declined from ${first}% at baseline to a minimum of ${min}% at DAA ${minD}, and measured ${last}% at DAA ${s[s.length - 1].daa ?? 0}. The ${dur}-day observation window indicates ${last <= min + 5 ? 'sustained suppression' : 'early knockdown with partial regrowth'} following application.`;
}
function methodologySentence(trial, trialDate) {
  const p = [];
  if (trial.FormulationName) p.push(trial.FormulationName);
  if (trial.Dosage) p.push(`at ${trial.Dosage}`);
  if (trialDate) p.push(`was applied on ${trialDate}`);
  if (trial.Location) p.push(`at ${trial.Location}`);
  if (trial.WeedSpecies) p.push(`targeting ${trial.WeedSpecies}`);
  return p.join(' ') + (p.length ? '.' : '');
}
function timelineRows(efficacy) {
  return efficacy.map(o => {
    const c = o.weedCover ?? 0;
    const status = c <= 10 ? 'Excellent' : c <= 30 ? 'Good' : c <= 60 ? 'Fair' : 'Poor';
    const species = (o.weedDetails || []).map(w => w.species).filter(Boolean).join(', ') || 'Total';
    return [String(o.daa ?? '—'), species, status, o.notes || '—'];
  });
}
function pdfAddFooter(doc, label) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const n  = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`${label} | Page ${i} of ${n}`, pw / 2, ph - 6, { align: 'center' });
    doc.text(`Generated ${new Date().toLocaleDateString()}`, pw - 14, ph - 6, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
}
function pdfHeader(doc, title, subtitle) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...TEAL); doc.rect(0, 0, pw, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont(undefined, 'bold');
  doc.text(title, pw / 2, 22, { align: 'center' });
  if (subtitle) { doc.setFontSize(12); doc.setFont(undefined, 'normal'); doc.text(subtitle, pw / 2, 32, { align: 'center' }); }
  doc.setTextColor(0, 0, 0);
}
function secHeading(doc, text, y, ph, fs = 14) {
  if (y + 16 > ph - 20) { doc.addPage(); y = 20; }
  const pw = doc.internal.pageSize.getWidth();
  doc.setFontSize(fs); doc.setFont(undefined, 'bold'); doc.setTextColor(...TEAL);
  doc.text(text, 14, y);
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.4);
  doc.line(14, y + 2, pw - 14, y + 2);
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal'); doc.setFontSize(10);
  return y + 10;
}
async function addPhotoGrid(doc, photos, y, ph, maxSize = 50, showDates = true) {
  const pw = doc.internal.pageSize.getWidth();
  let xOff = 14;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]; const src = photoSrc(p); if (!src) continue;
    try {
      const imgData = await toBase64(src, 400); if (!imgData) continue;
      const img = new Image(); img.src = imgData;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      const ar = img.width > 0 ? img.width / img.height : 1;
      const iw = ar >= 1 ? maxSize : maxSize * ar;
      const ih = ar >= 1 ? maxSize / ar : maxSize;
      if (xOff + iw > pw - 14) { xOff = 14; y += maxSize + 14; }
      if (y + ih + 14 > ph - 20) { doc.addPage(); y = 20; xOff = 14; }
      addImgSafe(doc, imgData, xOff, y, iw, ih);
      doc.setFontSize(7);
      const label = p.label || (p.date ? `Photo: ${new Date(p.date).toLocaleDateString()}` : `Photo ${i + 1}`);
      doc.text(label, xOff, y + ih + 4, { maxWidth: iw + 8 });
      if (showDates && p.date && p.label) doc.text(new Date(p.date).toLocaleDateString(), xOff, y + ih + 8, { maxWidth: iw + 8 });
      xOff += iw + 12;
    } catch { /* skip */ }
  }
  return y + maxSize + 16;
}
function anovaTable(doc, stats, y, ph) {
  const anova = stats?.anovaResults?.anovaTable;
  if (anova) {
    const nf = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
    autoTable(doc, {
      startY: y,
      head: [['Source', 'DF', 'SS', 'MS', 'F', 'Prob']],
      body: [
        ['Treatments', anova.treatment?.df ?? '—', nf(anova.treatment?.ss), nf(anova.treatment?.ms), nf(anova.treatment?.f), anova.treatment?.sig || '—'],
        ['Blocks',     anova.block?.df     ?? '—', nf(anova.block?.ss),     nf(anova.block?.ms),     nf(anova.block?.f),     anova.block?.sig || '—'],
        ['Error',      anova.error?.df     ?? '—', nf(anova.error?.ss),     nf(anova.error?.ms),     '—', '—'],
        ['Total',      anova.total?.df     ?? '—', nf(anova.total?.ss),     '—', '—', '—'],
      ],
      headStyles: { fillColor: DARK }, theme: 'grid', styles: { fontSize: 9 }
    });
    return (doc.lastAutoTable?.finalY ?? y) + 10;
  }
  if (y + 14 > ph - 20) { doc.addPage(); y = 20; }
  doc.setFontSize(9); doc.setTextColor(100, 100, 100);
  doc.text('ANOVA not applicable for this single-replicate trial.', 14, y, { maxWidth: doc.internal.pageSize.getWidth() - 28 });
  doc.setTextColor(0, 0, 0); doc.setFontSize(10);
  return y + 12;
}
function conclusionNotes(doc, trial, y, ph) {
  const pw = doc.internal.pageSize.getWidth();
  ['Conclusion', 'Notes'].forEach(field => {
    if (!trial[field]) return;
    if (y + 20 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold'); doc.text(`${field}:`, 14, y); y += 6;
    doc.setFont(undefined, 'normal');
    const ls = doc.splitTextToSize(trial[field], pw - 28);
    if (y + ls.length * 5 > ph - 20) { doc.addPage(); y = 20; }
    doc.text(ls, 14, y); y += ls.length * 5 + 8;
  });
  return y;
}
async function addWeedIdSection(doc, weedPhotos, trial, y, ph) {
  if (!weedPhotos.length) return y;
  doc.addPage(); y = 20;
  y = secHeading(doc, '6. Weed Identification Record', y, ph);
  if (trial.WeedSpecies?.trim()) {
    doc.setFont(undefined, 'bold'); doc.text('Target Species:', 14, y); y += 5;
    doc.setFont(undefined, 'normal');
    doc.text(doc.splitTextToSize(trial.WeedSpecies, doc.internal.pageSize.getWidth() - 28), 14, y);
    y += 12;
  }
  for (const p of weedPhotos) {
    const src = photoSrc(p); if (!src) continue;
    if (y + 80 > ph - 20) { doc.addPage(); y = 20; }
    try {
      const imgData = await toBase64(src, 400); if (!imgData) continue;
      const img = new Image(); img.src = imgData;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      const ar = img.width > 0 ? img.width / img.height : 1;
      const iw = ar >= 1 ? 60 : 60 * ar; const ih = ar >= 1 ? 60 / ar : 60;
      addImgSafe(doc, imgData, 14, y, iw, ih);
      const best = p.identifications?.[0];
      doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(best?.name || 'Unknown Species', 82, y + 10);
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      doc.text(`Common name: ${best?.commonNames?.[0] || '—'}`, 82, y + 20);
      doc.text(`Confidence: ${best?.confidence ? (best.confidence * 100).toFixed(1) + '%' : 'N/A'}`, 82, y + 30);
      y += 72;
    } catch { /* skip */ }
  }
  return y;
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 1 — generateComprehensivePdf
//  Full multi-page PDF: header, metadata, weather, soil, ANOVA, efficacy,
//  WCE table, timeline, conclusion, ingredients, photo log, weed ID, brief
// ═════════════════════════════════════════════════════════════════════════════
export async function generateComprehensivePdf(trial, options = {}) {
  const { withIngredients = true, withWeeds = true, withTimeline = true,
          showPhotoDates = true, formulations = [] } = options;
  toast('Generating Comprehensive PDF…', 'info');
  const doc      = createDoc();
  const pw       = doc.internal.pageSize.getWidth();
  const ph       = doc.internal.pageSize.getHeight();
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const soil     = safeJsonParse(trial.SoilDataJSON, null);
  const trialDate = fmtDate(trial.Date);

  pdfHeader(doc, 'Herbicide Trial Report', trial.FormulationName);
  let y = 50;

  // 2-column metadata
  doc.setFontSize(10);
  const lx = 14, rx = pw / 2 + 10;
  const meta2 = [
    [`Investigator: ${trial.InvestigatorName || 'N/A'}`, `Date: ${trialDate}`],
    [`Location: ${trial.Location || 'N/A'}`,              `Dosage: ${trial.Dosage || 'N/A'}`],
    [`Result: ${trial.Result || 'Pending'}`,               `Replication: ${trial.Replication || 'N/A'}`],
    [`Status: ${(trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing'}`,
     trial.PlotNumber ? `Plot #: ${trial.PlotNumber}` : ''],
  ];
  meta2.forEach(([l, r]) => { doc.text(l, lx, y); if (r) doc.text(r, rx, y); y += 6; });
  y += 2;

  if (trial.WeedSpecies?.trim()) {
    doc.setFont(undefined, 'bold'); doc.text('Target Weed Species:', lx, y); y += 5;
    doc.setFont(undefined, 'normal');
    const wl = doc.splitTextToSize(trial.WeedSpecies, pw - 28);
    doc.text(wl, lx, y); y += wl.length * 5 + 5;
  }

  // Weather box
  if (trial.Temperature) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(241, 245, 249); doc.rect(lx, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Weather on Application Day:', 16, y);
    doc.setFont(undefined, 'normal');
    doc.text(`Temp: ${trial.Temperature}°C  |  Humidity: ${trial.Humidity || '—'}%  |  Wind: ${trial.Windspeed || '0'} km/h  |  Rain: ${trial.Rain || '0'} mm`, 16, y + 7);
    y += 24;
  }

  // Soil box
  if (soil && Object.keys(soil).length > 0) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(...AMBER50); doc.rect(lx, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Soil Profile (0-30 cm):', 16, y);
    doc.setFont(undefined, 'normal');
    const sl = `pH: ${soil.ph || '—'}  Clay: ${soil.clay || '—'}%  Sand: ${soil.sand || '—'}%  OC: ${soil.organicCarbon || '—'}  Texture: ${soil.texture || '—'}`;
    doc.text(doc.splitTextToSize(sl, pw - 34), 16, y + 7);
    y += 24;
  }

  y += 4;

  // Trial Design heading
  y = secHeading(doc, '1. Trial Design & Conditions', y, ph);

  // ANOVA
  y = secHeading(doc, '2. Statistical Analysis (ANOVA)', y, ph);
  y = anovaTable(doc, safeJsonParse(trial.StatisticsJSON, {}), y, ph);

  // Efficacy Analysis
  y = secHeading(doc, '3. Efficacy Analysis', y, ph);
  const summary = coverSummary(efficacy, trial);
  if (summary) {
    const cls = doc.splitTextToSize('Analysis: ' + summary, pw - 28);
    if (y + cls.length * 5 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFontSize(9); doc.text(cls, 14, y, { maxWidth: pw - 28 });
    y += cls.length * 5 + 8; doc.setFontSize(10);
  }
  const wce = calcWCE(efficacy);
  if (wce.length) {
    if (y + 30 > ph - 20) { doc.addPage(); y = 20; }
    autoTable(doc, {
      startY: y,
      head: [['Species', 'Initial Cover (%)', 'Final Cover (%)', 'WCE (%)']],
      body: wce.map(w => [w.species, w.initialCover.toFixed(1), w.finalCover.toFixed(1), w.wce.toFixed(1)]),
      headStyles: { fillColor: TEAL }, theme: 'striped', styles: { fontSize: 9 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // Timeline
  if (withTimeline && efficacy.length) {
    y = secHeading(doc, '4. Weed Status Timeline', y, ph);
    autoTable(doc, {
      startY: y,
      head: [['DA-A', 'Species', 'Status', 'Notes']],
      body: timelineRows(efficacy),
      headStyles: { fillColor: TEAL }, theme: 'striped', styles: { fontSize: 8 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  // Conclusion & Notes
  y = conclusionNotes(doc, trial, y, ph);

  // Ingredients
  if (withIngredients && trial.FormulationID) {
    const form = formulations.find(f => f.ID === trial.FormulationID);
    const ings = safeJsonParse(form?.IngredientsJSON, []);
    if (ings.length) {
      y = secHeading(doc, 'Formulation Ingredients', y, ph);
      autoTable(doc, {
        startY: y,
        head: [['Ingredient', 'Quantity', 'Unit']],
        body: ings.map(i => [i.name, i.quantity, i.unit]),
        headStyles: { fillColor: TEAL }, theme: 'striped'
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }
  }

  // Photos
  if (photos.length) {
    y = secHeading(doc, '5. Field Photo Log', y, ph);
    y = await addPhotoGrid(doc, photos, y, ph, 50, showPhotoDates);
  }

  // Weed ID
  if (withWeeds) y = await addWeedIdSection(doc, weedPhotos, trial, y, ph);

  // Executive Brief
  doc.addPage(); y = 20;
  y = secHeading(doc, 'One-Page Executive Brief', y, ph, 16);
  const brief = [
    ['Treatment', trial.FormulationName || '—'],
    ['Objective', `Assess post-application weed suppression of ${trial.FormulationName || 'treatment'} at ${trial.Location || 'test site'}.`],
    ['Key Finding', summary],
    ['Recommendation', (trial.Result === 'Excellent' || trial.Result === 'Good') ? 'Recommend for continued evaluation at expanded sites.' : 'Further evaluation required under varied conditions.'],
    ['Risk & Context', trial.Temperature ? `Applied under ${trial.Temperature}°C, ${trial.Humidity || '—'}% RH, ${trial.Windspeed || '0'} km/h wind.` : 'Weather conditions not recorded.'],
  ];
  brief.forEach(([label, val]) => {
    const wrapped = doc.splitTextToSize(val, pw - 28);
    if (y + wrapped.length * 5 + 10 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.text(`${label}:`, 14, y); y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(wrapped, 14, y); y += wrapped.length * 5 + 5;
    doc.setFontSize(10);
  });

  pdfAddFooter(doc, trial.FormulationName || 'Trial');
  doc.save(`Trial_Report_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.pdf`);
  toast('PDF downloaded!', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 2 — generateScientificReport  (scientific layout with AI narrative)
// ═════════════════════════════════════════════════════════════════════════════
export async function generateScientificReport(trial, options = {}) {
  const { withIngredients = false, aiSummary = '', showPhotoDates = true, formulations = [] } = options;
  toast('Generating Scientific Report…', 'info');
  const doc      = createDoc();
  const pw       = doc.internal.pageSize.getWidth();
  const ph       = doc.internal.pageSize.getHeight();
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const trialDate  = fmtDate(trial.Date);
  const summary    = coverSummary(efficacy, trial);
  const methodology = methodologySentence(trial, trialDate);

  // Header
  doc.setFillColor(...TEAL); doc.rect(0, 0, pw, 45, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24); doc.setFont(undefined, 'bold');
  doc.text('SCIENTIFIC TRIAL REPORT', pw / 2, 22, { align: 'center' });
  doc.setFontSize(13); doc.setFont(undefined, 'normal');
  doc.text(`Trial Protocol: ${trial.FormulationName}`, pw / 2, 34, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  let y = 55;

  // Metadata table (4-column)
  const metaRows = [
    ['Investigator', trial.InvestigatorName || 'N/A', 'Date', trialDate],
    ['Location', trial.Location || 'N/A', 'Dosage', trial.Dosage || 'N/A'],
    ['Status', (trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing', 'Result', trial.Result || 'Pending'],
    ['Weed Species', trial.WeedSpecies || 'N/A', 'Replication', trial.Replication || 'N/A'],
  ];
  autoTable(doc, {
    startY: y, body: metaRows, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 2: { fontStyle: 'bold', cellWidth: 35 } }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Executive Summary / AI Narrative
  y = secHeading(doc, 'Executive Summary', y, ph);
  const narrative = aiSummary ||
    `Methodology\n${methodology}\n\nResults\n${summary}\n\nConclusions\n${trial.Conclusion || 'See observations for detailed results.'}`;
  for (const rawLine of narrative.split('\n')) {
    const line = rawLine.trim();
    if (!line) { y += 3; continue; }
    if (/^(Methodology|Results|Conclusions?)\s*:?\s*$/i.test(line)) {
      if (y + 12 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(11);
      doc.text(line, 14, y); y += 7;
      doc.setFont(undefined, 'normal'); doc.setFontSize(10);
    } else {
      const wrapped = doc.splitTextToSize(line, pw - 28);
      if (y + wrapped.length * 5 > ph - 20) { doc.addPage(); y = 20; }
      doc.text(wrapped, 14, y); y += wrapped.length * 5 + 2;
    }
  }
  y += 8;

  // Trial Design
  y = secHeading(doc, '1. Trial Design & Conditions', y, ph);
  if (trial.Temperature) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(241, 245, 249); doc.rect(14, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Weather Conditions:', 16, y);
    doc.setFont(undefined, 'normal');
    doc.text(`Temp: ${trial.Temperature}°C  Humidity: ${trial.Humidity || '—'}%  Wind: ${trial.Windspeed || '0'} km/h  Rain: ${trial.Rain || '0'} mm`, 16, y + 7);
    y += 24;
  }
  const soil = safeJsonParse(trial.SoilDataJSON, null);
  if (soil && Object.keys(soil).length > 0) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(...AMBER50); doc.rect(14, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Soil Profile (0-30 cm):', 16, y);
    doc.setFont(undefined, 'normal');
    doc.text(`pH: ${soil.ph || '—'}  Clay: ${soil.clay || '—'}%  Sand: ${soil.sand || '—'}%  OC: ${soil.organicCarbon || '—'}  Texture: ${soil.texture || '—'}`, 16, y + 7);
    y += 24;
  }

  // ANOVA
  y = secHeading(doc, '2. Statistical Analysis (ANOVA)', y, ph);
  y = anovaTable(doc, safeJsonParse(trial.StatisticsJSON, {}), y, ph);

  // Efficacy
  y = secHeading(doc, '3. Efficacy Analysis', y, ph);
  const wce = calcWCE(efficacy);
  if (wce.length) {
    autoTable(doc, {
      startY: y,
      head: [['Species', 'Initial Cover (%)', 'Final Cover (%)', 'WCE (%)']],
      body: wce.map(w => [w.species, w.initialCover.toFixed(1), w.finalCover.toFixed(1), w.wce.toFixed(1)]),
      headStyles: { fillColor: TEAL }, theme: 'striped', styles: { fontSize: 9 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  } else {
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text('No structured efficacy observations recorded.', 14, y); y += 10;
    doc.setTextColor(0, 0, 0); doc.setFontSize(10);
  }

  // Timeline
  if (efficacy.length) {
    y = secHeading(doc, '4. Weed Status Timeline', y, ph);
    autoTable(doc, {
      startY: y,
      head: [['DA-A', 'Species', 'Status', 'Notes']],
      body: timelineRows(efficacy),
      headStyles: { fillColor: TEAL }, theme: 'striped', styles: { fontSize: 8 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  y = conclusionNotes(doc, trial, y, ph);

  // Ingredients
  if (withIngredients && trial.FormulationID) {
    const form = formulations.find(f => f.ID === trial.FormulationID);
    const ings = safeJsonParse(form?.IngredientsJSON, []);
    if (ings.length) {
      y = secHeading(doc, 'Formulation Ingredients', y, ph);
      autoTable(doc, { startY: y, head: [['Ingredient', 'Quantity', 'Unit']], body: ings.map(i => [i.name, i.quantity, i.unit]), headStyles: { fillColor: TEAL }, theme: 'striped' });
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }
  }

  // Photos
  if (photos.length) {
    y = secHeading(doc, '5. Field Photo Log', y, ph);
    y = await addPhotoGrid(doc, photos, y, ph, 50, showPhotoDates);
  }

  // Weed ID
  y = await addWeedIdSection(doc, weedPhotos, trial, y, ph);

  pdfAddFooter(doc, trial.FormulationName || 'Trial');
  doc.save(`Scientific_Report_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.pdf`);
  toast('Scientific Report downloaded!', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 3 — generatePpt  (PowerPoint slide deck)
// ═════════════════════════════════════════════════════════════════════════════
export async function generatePpt(trial) {
  toast('Generating PowerPoint…', 'info');
  const pptx     = new pptxgen();
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const wce      = calcWCE(efficacy);
  pptx.layout = 'LAYOUT_16x9';

  // Slide 1 – Title
  const s1 = pptx.addSlide();
  s1.background = { color: '0D9488' };
  s1.addText('HERBICIDE TRIAL REPORT', { x: 0.5, y: 1.5, w: 9, h: 1.2, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center' });
  s1.addText(trial.FormulationName || '—', { x: 0.5, y: 2.8, w: 9, h: 0.7, fontSize: 22, color: 'FFFFFF', align: 'center' });
  s1.addText(`${fmtDate(trial.Date)} | ${trial.Location || '—'} | ${trial.InvestigatorName || '—'}`, { x: 0.5, y: 3.6, w: 9, h: 0.5, fontSize: 14, color: 'E0F2F1', align: 'center' });

  // Slide 2 – Trial Details
  const s2 = pptx.addSlide();
  s2.addText('Trial Details', { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 24, bold: true, color: '0D9488' });
  s2.addTable([
    [{ text: 'Investigator', options: { bold: true } }, trial.InvestigatorName || '—', { text: 'Date', options: { bold: true } }, fmtDate(trial.Date)],
    [{ text: 'Location', options: { bold: true } }, trial.Location || '—', { text: 'Dosage', options: { bold: true } }, trial.Dosage || '—'],
    [{ text: 'Weed Species', options: { bold: true } }, trial.WeedSpecies || '—', { text: 'Result', options: { bold: true } }, trial.Result || 'Pending'],
    [{ text: 'Temperature', options: { bold: true } }, trial.Temperature ? `${trial.Temperature}°C` : '—', { text: 'Humidity', options: { bold: true } }, trial.Humidity ? `${trial.Humidity}%` : '—'],
    [{ text: 'Wind', options: { bold: true } }, trial.Windspeed ? `${trial.Windspeed} km/h` : '—', { text: 'Rain', options: { bold: true } }, trial.Rain ? `${trial.Rain} mm` : '—'],
    [{ text: 'Replication', options: { bold: true } }, trial.Replication || '—', { text: 'Status', options: { bold: true } }, (trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing'],
  ], { x: 0.4, y: 1.0, w: 9.2, fontSize: 13, colW: [1.8, 2.8, 1.8, 2.8], border: { pt: 0.5, color: 'CBD5E1' }, fill: { color: 'F8FAFC' } });

  // Slide 3 – WCE
  if (wce.length) {
    const s3 = pptx.addSlide();
    s3.addText('Efficacy Analysis – WCE per Species', { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: '0D9488' });
    const hdr = [{ text: 'Species', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } },
                 { text: 'Initial Cover (%)', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } },
                 { text: 'Final Cover (%)', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } },
                 { text: 'WCE (%)', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } }];
    s3.addTable([hdr, ...wce.map(w => [w.species, w.initialCover.toFixed(1), w.finalCover.toFixed(1), w.wce.toFixed(1)])],
      { x: 0.4, y: 1.0, w: 9.2, fontSize: 13, colW: [3, 2, 2, 2.2], border: { pt: 0.5, color: 'CBD5E1' } });
  }

  // Slide 4 – Timeline
  if (efficacy.length) {
    const s4 = pptx.addSlide();
    s4.addText('Weed Status Timeline', { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: '0D9488' });
    const hdr = [{ text: 'DAA', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } },
                 { text: 'Cover (%)', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } },
                 { text: 'Status', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } },
                 { text: 'Notes', options: { bold: true, color: 'FFFFFF', fill: { color: '0D9488' } } }];
    const rows = efficacy.sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0)).map(o => {
      const c = o.weedCover ?? 0;
      return [String(o.daa ?? '—'), String(c), c <= 10 ? 'Excellent' : c <= 30 ? 'Good' : c <= 60 ? 'Fair' : 'Poor', o.notes || '—'];
    });
    s4.addTable([hdr, ...rows], { x: 0.4, y: 1.0, w: 9.2, fontSize: 12, colW: [1.2, 2, 2, 4], border: { pt: 0.5, color: 'CBD5E1' } });
  }

  // Slide 5 – Photos (up to 4)
  if (photos.length) {
    const s5 = pptx.addSlide();
    s5.addText('Field Photo Log', { x: 0.4, y: 0.2, w: 9, h: 0.6, fontSize: 22, bold: true, color: '0D9488' });
    const pos = [[0.3, 0.9, 4.2, 3.0], [5.1, 0.9, 4.2, 3.0], [0.3, 4.1, 4.2, 3.0], [5.1, 4.1, 4.2, 3.0]];
    for (let i = 0; i < Math.min(photos.length, 4); i++) {
      const src = photoSrc(photos[i]); if (!src) continue;
      try {
        const imgData = await toBase64(src, 600); if (!imgData) continue;
        const [px, py, pw2, ph2] = pos[i];
        s5.addImage({ data: imgData, x: px, y: py, w: pw2, h: ph2 });
        s5.addText(photos[i].label || `Photo ${i + 1}`, { x: px, y: py + ph2 + 0.05, w: pw2, h: 0.3, fontSize: 9, color: '475569' });
      } catch { /* skip */ }
    }
  }

  // Slide 6 – Conclusion
  const s6 = pptx.addSlide();
  s6.addText('Conclusion & Notes', { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: '0D9488' });
  if (trial.Conclusion) s6.addText([{ text: 'Conclusion\n', options: { bold: true } }, { text: trial.Conclusion }], { x: 0.4, y: 1.0, w: 9.2, h: 2.5, fontSize: 13, color: '1E293B' });
  if (trial.Notes) s6.addText([{ text: 'Notes\n', options: { bold: true } }, { text: trial.Notes }], { x: 0.4, y: 3.8, w: 9.2, h: 2.0, fontSize: 12, color: '475569' });

  await pptx.writeFile({ fileName: `Trial_PPT_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.pptx` });
  toast('PowerPoint downloaded!', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 4 — exportToCSV  (observations spreadsheet — same as legacy)
// ═════════════════════════════════════════════════════════════════════════════
export function exportToCSV(trial) {
  exportMultipleTrialsToCSV([trial]);
}

export function exportMultipleTrialsToCSV(trials) {
  if (!trials || !trials.length) return;

  const header = ['Trial ID', 'Formulation', 'Investigator', 'Date', 'Location', 'Dosage',
                  'Weed Species', 'Result', 'DAA', 'Obs Date', 'Total Cover %',
                  'Species', 'Species Cover %', 'Status', 'Notes'];
  const rows = [];

  trials.forEach(trial => {
    const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
    if (efficacy.length) {
      efficacy.forEach(obs => {
        const details = obs.weedDetails?.length ? obs.weedDetails : [{ species: 'Total', cover: obs.weedCover ?? '' }];
        details.forEach((wd, di) => {
          rows.push([
            di === 0 ? trial.ID : '', di === 0 ? trial.FormulationName : '',
            di === 0 ? trial.InvestigatorName : '', di === 0 ? trial.Date : '',
            di === 0 ? trial.Location : '', di === 0 ? trial.Dosage : '',
            di === 0 ? trial.WeedSpecies : '', di === 0 ? trial.Result : '',
            obs.daa ?? '', obs.date || '', obs.weedCover ?? '',
            wd.species || 'Total', wd.cover ?? '', wd.status || '', obs.notes || ''
          ]);
        });
      });
    } else {
      rows.push([trial.ID, trial.FormulationName, trial.InvestigatorName, trial.Date,
                 trial.Location, trial.Dosage, trial.WeedSpecies, trial.Result,
                 '', '', '', '', '', '', '']);
    }
  });

  const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

  let filename = 'Trials_Export.csv';
  if (trials.length === 1) {
    const trial = trials[0];
    filename = `Trial_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.csv`;
  } else {
    filename = `Selected_Trials_${new Date().toISOString().split('T')[0]}.csv`;
  }

  dlBlob(new Blob([csv], { type: 'text/csv' }), filename);
  toast(`CSV exported (${trials.length} trial${trials.length > 1 ? 's' : ''})`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 5 — exportAllTrialsCSV  (all trials summary)
// ═════════════════════════════════════════════════════════════════════════════
export function exportAllTrialsCSV(trials, projects = []) {
  const header = ['Trial ID', 'Formulation', 'Investigator', 'Date', 'Location', 'Dosage',
                  'Weed Species', 'Result', 'Status', 'Project', 'Replication',
                  'Plot #', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)',
                  'Observations', 'Photos'];
  const rows = trials.map(t => {
    const proj = projects.find(p => p.ID === t.ProjectID);
    return [
      t.ID, t.FormulationName, t.InvestigatorName, t.Date, t.Location, t.Dosage,
      t.WeedSpecies, t.Result,
      (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Ongoing',
      proj?.Name || '', t.Replication || '', t.PlotNumber || '',
      t.Temperature || '', t.Humidity || '', t.Windspeed || '', t.Rain || '',
      safeJsonParse(t.EfficacyDataJSON, []).length,
      safeJsonParse(t.PhotoURLs, []).length,
    ];
  });
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  dlBlob(new Blob([csv], { type: 'text/csv' }), `All_Trials_${new Date().toISOString().split('T')[0]}.csv`);
  toast(`Exported ${trials.length} trials to CSV`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 6 — exportJson  (raw JSON backup)
// ═════════════════════════════════════════════════════════════════════════════
export function exportJson(trial) {
  const data = { ...trial, _exportedAt: new Date().toISOString(), _app: 'Herbicide Trial Manager' };
  dlBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `Trial_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.json`);
  toast('JSON exported', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 7 — exportFieldReportTxt  (plain text field report)
// ═════════════════════════════════════════════════════════════════════════════
export function exportFieldReportTxt(trial, projectName = '') {
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const wce = calcWCE(efficacy);
  const soil = safeJsonParse(trial.SoilDataJSON, null);
  const sep  = '─'.repeat(60);
  const lines = [
    '═'.repeat(60),
    '  HERBICIDE TRIAL — FIELD REPORT',
    '═'.repeat(60),
    `Trial ID:       ${trial.ID || '—'}`,
    `Formulation:    ${trial.FormulationName || '—'}`,
    `Investigator:   ${trial.InvestigatorName || '—'}`,
    `Date:           ${fmtDate(trial.Date)}`,
    `Location:       ${trial.Location || '—'}`,
    `Dosage:         ${trial.Dosage || '—'}`,
    `Weed Species:   ${trial.WeedSpecies || '—'}`,
    `Result:         ${trial.Result || 'Pending'}`,
    `Status:         ${(trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing'}`,
    projectName ? `Project:        ${projectName}` : null,
    trial.Replication ? `Replication:    ${trial.Replication}` : null,
    sep,
    'WEATHER ON APPLICATION DAY',
    sep,
    `Temperature:    ${trial.Temperature || '—'}°C`,
    `Humidity:       ${trial.Humidity || '—'}%`,
    `Wind Speed:     ${trial.Windspeed || '—'} km/h`,
    `Rain:           ${trial.Rain || '—'} mm`,
  ];
  if (soil && Object.keys(soil).length > 0) {
    lines.push(sep, 'SOIL PROFILE (0-30 cm)', sep,
      `pH: ${soil.ph || '—'}  Clay: ${soil.clay || '—'}%  Sand: ${soil.sand || '—'}%  OC: ${soil.organicCarbon || '—'}  Texture: ${soil.texture || '—'}`);
  }
  if (efficacy.length) {
    lines.push(sep, 'EFFICACY OBSERVATIONS', sep);
    efficacy.forEach(o => {
      lines.push(`DAA ${o.daa ?? '—'} | Cover: ${o.weedCover ?? '—'}% | ${o.notes || '—'}`);
      (o.weedDetails || []).forEach(wd => {
        if (wd.species && wd.species !== 'Total') lines.push(`  └ ${wd.species}: ${wd.cover ?? '—'}% — ${wd.status || ''}`);
      });
    });
  }
  if (wce.length) {
    lines.push(sep, 'WEED CONTROL EFFICIENCY (WCE)', sep);
    wce.forEach(w => lines.push(`  ${w.species}: ${w.wce.toFixed(1)}% (${w.initialCover.toFixed(1)}% → ${w.finalCover.toFixed(1)}%)`));
  }
  if (trial.Conclusion) lines.push(sep, 'CONCLUSION', sep, trial.Conclusion);
  if (trial.Notes)      lines.push(sep, 'NOTES', sep, trial.Notes);
  lines.push(sep, `Generated: ${new Date().toLocaleString()}`, '═'.repeat(60));

  const text = lines.filter(l => l !== null).join('\n');
  dlBlob(new Blob([text], { type: 'text/plain' }),
    `Field_Report_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.txt`);
  toast('Field report downloaded', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 8 — exportHtmlReport  (standalone printable HTML, same as legacy)
// ═════════════════════════════════════════════════════════════════════════════
export function exportHtmlReport(trial, projectName = '') {
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const wce      = calcWCE(efficacy);
  const soil     = safeJsonParse(trial.SoilDataJSON, null);
  const isFinalized = trial.IsCompleted === true || trial.IsCompleted === 'true';

  const badgeColor = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444', Control: '#8b5cf6' }[trial.Result] || '#6b7280';

  const photoHtml = photos.map((p, i) => {
    const src = photoSrc(p); if (!src) return '';
    const label = p.label || `Photo ${i + 1}`;
    const date  = p.date ? new Date(p.date).toLocaleDateString() : '';
    return `<div style="break-inside:avoid;display:inline-block;margin:6px;vertical-align:top;width:180px;">
      <img src="${src}" style="width:180px;height:135px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;" onerror="this.style.display='none'" />
      <p style="font-size:11px;color:#475569;margin:4px 0 0;">${label}</p>
      ${date ? `<p style="font-size:10px;color:#94a3b8;margin:2px 0 0;">${date}</p>` : ''}
    </div>`;
  }).join('');

  const weedPhotoHtml = weedPhotos.map((p, i) => {
    const src = photoSrc(p); if (!src) return '';
    const best = p.identifications?.[0];
    return `<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;">
      <img src="${src}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;" onerror="this.style.display='none'" />
      <div>
        <p style="font-weight:700;font-size:14px;margin:0;">${best?.name || 'Unknown Species'}</p>
        <p style="font-size:12px;color:#64748b;margin:4px 0;">Common: ${best?.commonNames?.[0] || '—'}</p>
        <p style="font-size:12px;color:#64748b;margin:0;">Confidence: ${best?.confidence ? (best.confidence * 100).toFixed(1) + '%' : 'N/A'}</p>
      </div>
    </div>`;
  }).join('');

  const obsRows = efficacy.map(o => {
    const c = o.weedCover ?? 0;
    const status = c <= 10 ? 'Excellent' : c <= 30 ? 'Good' : c <= 60 ? 'Fair' : 'Poor';
    const sc = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444' }[status] || '#6b7280';
    return `<tr>
      <td>${o.daa ?? '—'}</td><td>${o.date || '—'}</td><td>${c}%</td>
      <td style="color:${sc};font-weight:600;">${status}</td>
      <td>${(o.weedDetails || []).map(w => `${w.species}: ${w.cover ?? '—'}%`).join(', ') || '—'}</td>
      <td>${o.notes || '—'}</td>
    </tr>`;
  }).join('');

  const wceRows = wce.map(w => `<tr>
    <td>${w.species}</td><td>${w.initialCover.toFixed(1)}%</td>
    <td>${w.finalCover.toFixed(1)}%</td>
    <td style="font-weight:700;color:${w.wce >= 80 ? '#10b981' : w.wce >= 60 ? '#3b82f6' : w.wce >= 40 ? '#f59e0b' : '#ef4444'};">${w.wce.toFixed(1)}%</td>
  </tr>`).join('');

  const soilHtml = soil && Object.keys(soil).length > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:16px;">
      <p style="font-weight:700;color:#92400e;margin:0 0 6px;">Soil Profile (0-30 cm)</p>
      <p style="margin:0;font-size:13px;">pH: <strong>${soil.ph || '—'}</strong> &nbsp; Clay: <strong>${soil.clay || '—'}%</strong> &nbsp; Sand: <strong>${soil.sand || '—'}%</strong> &nbsp; OC: <strong>${soil.organicCarbon || '—'}</strong> &nbsp; Texture: <strong>${soil.texture || '—'}</strong></p>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trial Report — ${trial.FormulationName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #1e293b; background: #f8fafc; }
    .cover { background: linear-gradient(135deg, #0d9488, #0f766e); color: #fff; padding: 48px 40px; }
    .cover h1 { font-size: 32px; margin: 0 0 8px; }
    .cover p { font-size: 16px; margin: 4px 0; opacity: 0.9; }
    .badge { display: inline-block; padding: 4px 14px; border-radius: 999px; font-weight: 700; font-size: 14px; color: #fff; background: ${badgeColor}; margin-top: 12px; }
    .content { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
    .section { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .section h2 { font-size: 16px; color: #0d9488; margin: 0 0 14px; border-bottom: 2px solid #0d9488; padding-bottom: 6px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
    .meta-item { font-size: 13px; } .meta-item strong { color: #475569; display: block; font-size: 11px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #0d9488; color: #fff; padding: 8px 10px; text-align: left; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) td { background: #f8fafc; }
    .weather { background: #f1f5f9; border-radius: 8px; padding: 12px; display: flex; gap: 20px; flex-wrap: wrap; font-size: 13px; }
    .weather span { display: flex; align-items: center; gap: 6px; }
    @media print {
      body { background: #fff; }
      .no-print { display: none; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${trial.FormulationName || 'Herbicide Trial Report'}</h1>
    <p>Investigator: ${trial.InvestigatorName || '—'} &nbsp;|&nbsp; Date: ${fmtDate(trial.Date)} &nbsp;|&nbsp; Location: ${trial.Location || '—'}</p>
    ${projectName ? `<p>Project: ${projectName}</p>` : ''}
    <div class="badge">${trial.Result || 'Pending'}</div>
    ${isFinalized ? '<div class="badge" style="background:#8b5cf6;margin-left:6px;">Finalized</div>' : ''}
  </div>
  <div class="content">
    <div class="section">
      <h2>Trial Details</h2>
      <div class="meta-grid">
        <div class="meta-item"><strong>Trial ID</strong>${trial.ID || '—'}</div>
        <div class="meta-item"><strong>Formulation</strong>${trial.FormulationName || '—'}</div>
        <div class="meta-item"><strong>Investigator</strong>${trial.InvestigatorName || '—'}</div>
        <div class="meta-item"><strong>Application Date</strong>${fmtDate(trial.Date)}</div>
        <div class="meta-item"><strong>Location</strong>${trial.Location || '—'}</div>
        <div class="meta-item"><strong>Dosage</strong>${trial.Dosage || '—'}</div>
        <div class="meta-item"><strong>Target Weed Species</strong>${trial.WeedSpecies || '—'}</div>
        <div class="meta-item"><strong>Result</strong>${trial.Result || 'Pending'}</div>
        <div class="meta-item"><strong>Replication</strong>${trial.Replication || '—'}</div>
        <div class="meta-item"><strong>Plot #</strong>${trial.PlotNumber || '—'}</div>
      </div>
    </div>

    ${trial.Temperature ? `
    <div class="section">
      <h2>Weather on Application Day</h2>
      <div class="weather">
        <span>🌡️ Temp: <strong>${trial.Temperature}°C</strong></span>
        <span>💧 Humidity: <strong>${trial.Humidity || '—'}%</strong></span>
        <span>💨 Wind: <strong>${trial.Windspeed || '0'} km/h</strong></span>
        <span>🌧️ Rain: <strong>${trial.Rain || '0'} mm</strong></span>
      </div>
    </div>` : ''}

    ${soilHtml ? `<div class="section"><h2>Soil Profile</h2>${soilHtml}</div>` : ''}

    ${efficacy.length ? `
    <div class="section">
      <h2>Efficacy Observations</h2>
      <table><thead><tr><th>DAA</th><th>Date</th><th>Cover %</th><th>Status</th><th>Species Detail</th><th>Notes</th></tr></thead>
      <tbody>${obsRows}</tbody></table>
    </div>` : ''}

    ${wce.length ? `
    <div class="section">
      <h2>Weed Control Efficiency (WCE)</h2>
      <table><thead><tr><th>Species</th><th>Initial Cover</th><th>Final Cover</th><th>WCE %</th></tr></thead>
      <tbody>${wceRows}</tbody></table>
    </div>` : ''}

    ${trial.Conclusion ? `<div class="section"><h2>Conclusion</h2><p style="margin:0;line-height:1.7;">${trial.Conclusion}</p></div>` : ''}
    ${trial.Notes      ? `<div class="section"><h2>Notes</h2><p style="margin:0;line-height:1.7;">${trial.Notes}</p></div>` : ''}

    ${photos.length ? `<div class="section"><h2>Field Photos (${photos.length})</h2><div>${photoHtml}</div></div>` : ''}
    ${weedPhotos.length ? `<div class="section"><h2>Weed Identification Record</h2>${weedPhotoHtml}</div>` : ''}

    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">Generated ${new Date().toLocaleString()} — Herbicide Trial Manager</p>
  </div>
  <script>window.onload = () => { const b = document.createElement('button'); b.textContent = '🖨️ Print / Save PDF'; b.className = 'no-print'; b.style = 'position:fixed;bottom:20px;right:20px;background:#0d9488;color:#fff;border:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:9999;'; b.onclick = () => window.print(); document.body.appendChild(b); };<\/script>
</body>
</html>`;

  dlBlob(new Blob([html], { type: 'text/html' }),
    `Trial_HTML_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.html`);
  toast('HTML report downloaded', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 9 — shareTrial  (Web Share API or clipboard)
// ═════════════════════════════════════════════════════════════════════════════
export function shareTrial(trial) {
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const wce = calcWCE(efficacy);
  const wceText = wce.length
    ? '\nWCE: ' + wce.map(w => `${w.species} ${w.wce.toFixed(1)}%`).join(', ')
    : '';
  const text = `Herbicide Trial: ${trial.FormulationName}
Date: ${fmtDate(trial.Date)}
Location: ${trial.Location || '—'}
Dosage: ${trial.Dosage || '—'}
Target Weeds: ${trial.WeedSpecies || '—'}
Result: ${trial.Result || 'Pending'}${wceText}
${trial.Conclusion ? '\nConclusion: ' + trial.Conclusion : ''}`.trim();

  if (navigator.share) {
    navigator.share({ title: `Trial: ${trial.FormulationName}`, text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text)
      .then(() => toast('Trial details copied to clipboard', 'success'))
      .catch(() => toast('Copy failed', 'error'));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 10 — exportTrialDocx  (Word .docx — matches legacy DOC No Ing. / DOC w/ Ing.)
// ═════════════════════════════════════════════════════════════════════════════
export async function exportTrialDocx(trial, options = {}) {
  const { withIngredients = false, withWeeds = true, formulations = [] } = options;
  toast('Generating Word document…', 'info');

  const efficacy  = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos    = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const wce       = calcWCE(efficacy);
  const soil      = safeJsonParse(trial.SoilDataJSON, null);
  const trialDate = fmtDate(trial.Date);
  const isFinalized = trial.IsCompleted === true || trial.IsCompleted === 'true';
  const badgeColor  = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444', Control: '#8b5cf6' }[trial.Result] || '#6b7280';

  const metaRows = [
    ['Trial ID', trial.ID || '—', 'Formulation', trial.FormulationName || '—'],
    ['Investigator', trial.InvestigatorName || '—', 'Date', trialDate],
    ['Location', trial.Location || '—', 'Dosage', trial.Dosage || '—'],
    ['Weed Species', trial.WeedSpecies || '—', 'Result', trial.Result || 'Pending'],
    ['Replication', trial.Replication || '—', 'Plot #', trial.PlotNumber || '—'],
    ['Status', isFinalized ? 'Finalized' : 'Ongoing', '', ''],
  ];

  const metaTableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:11pt;margin-bottom:16px;">
      ${metaRows.map(([l1, v1, l2, v2]) => `
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px 10px;font-weight:bold;background:#f8fafc;width:22%;">${l1}</td>
          <td style="border:1px solid #cbd5e1;padding:6px 10px;width:28%;">${v1}</td>
          ${l2 ? `<td style="border:1px solid #cbd5e1;padding:6px 10px;font-weight:bold;background:#f8fafc;width:22%;">${l2}</td><td style="border:1px solid #cbd5e1;padding:6px 10px;width:28%;">${v2}</td>` : `<td colspan="2" style="border:1px solid #cbd5e1;"></td>`}
        </tr>`).join('')}
    </table>`;

  const weatherHtml = trial.Temperature ? `
    <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Weather on Application Day</h2>
    <p style="font-size:11pt;">Temp: <strong>${trial.Temperature}°C</strong> &nbsp;|&nbsp; Humidity: <strong>${trial.Humidity || '—'}%</strong> &nbsp;|&nbsp; Wind: <strong>${trial.Windspeed || '0'} km/h</strong> &nbsp;|&nbsp; Rain: <strong>${trial.Rain || '0'} mm</strong></p>` : '';

  const soilHtml = (soil && Object.keys(soil).length > 0) ? `
    <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Soil Profile (0-30 cm)</h2>
    <p style="font-size:11pt;">pH: <strong>${soil.ph || '—'}</strong> &nbsp; Clay: <strong>${soil.clay || '—'}%</strong> &nbsp; Sand: <strong>${soil.sand || '—'}%</strong> &nbsp; OC: <strong>${soil.organicCarbon || '—'}</strong> &nbsp; Texture: <strong>${soil.texture || '—'}</strong></p>` : '';

  const obsRows = efficacy.map(o => {
    const c = o.weedCover ?? 0;
    const status = c <= 10 ? 'Excellent' : c <= 30 ? 'Good' : c <= 60 ? 'Fair' : 'Poor';
    const sc = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444' }[status] || '#6b7280';
    return `<tr>
      <td style="border:1px solid #e2e8f0;padding:5px 8px;">${o.daa ?? '—'}</td>
      <td style="border:1px solid #e2e8f0;padding:5px 8px;">${o.date || '—'}</td>
      <td style="border:1px solid #e2e8f0;padding:5px 8px;">${c}%</td>
      <td style="border:1px solid #e2e8f0;padding:5px 8px;color:${sc};font-weight:bold;">${status}</td>
      <td style="border:1px solid #e2e8f0;padding:5px 8px;">${(o.weedDetails || []).map(w => `${w.species}: ${w.cover ?? '—'}%`).join(', ') || '—'}</td>
      <td style="border:1px solid #e2e8f0;padding:5px 8px;">${o.notes || '—'}</td>
    </tr>`;
  }).join('');

  const efficacyHtml = efficacy.length ? `
    <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Efficacy Observations</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      <thead><tr style="background:#0d9488;color:#fff;">
        <th style="padding:6px 8px;text-align:left;">DAA</th><th style="padding:6px 8px;text-align:left;">Date</th>
        <th style="padding:6px 8px;text-align:left;">Cover %</th><th style="padding:6px 8px;text-align:left;">Status</th>
        <th style="padding:6px 8px;text-align:left;">Species Detail</th><th style="padding:6px 8px;text-align:left;">Notes</th>
      </tr></thead>
      <tbody>${obsRows}</tbody>
    </table>` : '';

  const wceRows = wce.map(w => `<tr>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.species}</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.initialCover.toFixed(1)}%</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.finalCover.toFixed(1)}%</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;font-weight:bold;color:${w.wce >= 80 ? '#10b981' : w.wce >= 60 ? '#3b82f6' : w.wce >= 40 ? '#f59e0b' : '#ef4444'};">${w.wce.toFixed(1)}%</td>
  </tr>`).join('');

  const wceHtml = wce.length ? `
    <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Weed Control Efficiency (WCE)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      <thead><tr style="background:#0d9488;color:#fff;">
        <th style="padding:6px 8px;text-align:left;">Species</th><th style="padding:6px 8px;text-align:left;">Initial Cover</th>
        <th style="padding:6px 8px;text-align:left;">Final Cover</th><th style="padding:6px 8px;text-align:left;">WCE %</th>
      </tr></thead>
      <tbody>${wceRows}</tbody>
    </table>` : '';

  let ingredientsHtml = '';
  if (withIngredients && trial.FormulationID) {
    const form = formulations.find(f => f.ID === trial.FormulationID);
    const ings = safeJsonParse(form?.IngredientsJSON, []);
    if (ings.length) {
      const ingRows = ings.map(i => `<tr>
        <td style="border:1px solid #e2e8f0;padding:5px 8px;">${i.name || '—'}</td>
        <td style="border:1px solid #e2e8f0;padding:5px 8px;">${i.quantity || '—'}</td>
        <td style="border:1px solid #e2e8f0;padding:5px 8px;">${i.unit || '—'}</td>
      </tr>`).join('');
      ingredientsHtml = `
        <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Formulation Ingredients</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <thead><tr style="background:#0d9488;color:#fff;">
            <th style="padding:6px 8px;text-align:left;">Ingredient</th>
            <th style="padding:6px 8px;text-align:left;">Quantity</th>
            <th style="padding:6px 8px;text-align:left;">Unit</th>
          </tr></thead>
          <tbody>${ingRows}</tbody>
        </table>`;
    }
  }

  const photoHtml = photos.length ? `
    <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Field Photos (${photos.length})</h2>
    <p style="font-size:10pt;color:#64748b;font-style:italic;">Note: Photos are embedded in the HTML report export. This document lists ${photos.length} photo(s) on record.</p>
    <ul style="font-size:10pt;">
      ${photos.map((p, i) => `<li>${p.label || `Photo ${i + 1}`}${p.date ? ` — ${new Date(p.date).toLocaleDateString()}` : ''}</li>`).join('')}
    </ul>` : '';

  const weedIdHtml = (withWeeds && weedPhotos.length) ? `
    <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Weed Identification Record</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      <thead><tr style="background:#0d9488;color:#fff;">
        <th style="padding:6px 8px;text-align:left;">Species</th>
        <th style="padding:6px 8px;text-align:left;">Common Name</th>
        <th style="padding:6px 8px;text-align:left;">Confidence</th>
      </tr></thead>
      <tbody>
        ${weedPhotos.map(p => {
          const best = p.identifications?.[0];
          return `<tr>
            <td style="border:1px solid #e2e8f0;padding:5px 8px;">${best?.name || 'Unknown Species'}</td>
            <td style="border:1px solid #e2e8f0;padding:5px 8px;">${best?.commonNames?.[0] || '—'}</td>
            <td style="border:1px solid #e2e8f0;padding:5px 8px;">${best?.confidence ? (best.confidence * 100).toFixed(1) + '%' : 'N/A'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';

  const conclusionHtml = [
    trial.Conclusion ? `<h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Conclusion</h2><p style="font-size:11pt;line-height:1.7;">${trial.Conclusion}</p>` : '',
    trial.Notes ? `<h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Notes</h2><p style="font-size:11pt;line-height:1.7;">${trial.Notes}</p>` : '',
  ].join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>
      body { font-family: 'Calibri', Arial, sans-serif; color: #1e293b; margin: 40px; }
      h1 { font-size: 22pt; color: #0d9488; margin-bottom: 4px; }
      .badge { display: inline-block; background: ${badgeColor}; color: #fff; padding: 3px 12px; border-radius: 12px; font-size: 11pt; font-weight: bold; margin-top: 6px; }
      p { margin: 4px 0; }
    </style>
  </head><body>
    <h1>${trial.FormulationName || 'Herbicide Trial Report'}</h1>
    <p style="font-size:11pt;color:#475569;">Investigator: ${trial.InvestigatorName || '—'} &nbsp;|&nbsp; Date: ${trialDate} &nbsp;|&nbsp; Location: ${trial.Location || '—'}</p>
    <span class="badge">${trial.Result || 'Pending'}</span>
    ${isFinalized ? '<span class="badge" style="background:#8b5cf6;margin-left:6px;">Finalized</span>' : ''}

    <h2 style="color:#0d9488;font-size:14pt;border-bottom:2px solid #0d9488;padding-bottom:4px;margin-top:24px;">Trial Details</h2>
    ${metaTableHtml}
    ${weatherHtml}
    ${soilHtml}
    ${efficacyHtml}
    ${wceHtml}
    ${ingredientsHtml}
    ${conclusionHtml}
    ${photoHtml}
    ${weedIdHtml}
    <p style="text-align:center;color:#94a3b8;font-size:9pt;margin-top:32px;">Generated ${new Date().toLocaleString()} — Herbicide Trial Manager</p>
  </body></html>`;

  // Build a minimal Word-compatible RTF blob that Word/LibreOffice opens natively
  // We use the MHTML/Word-HTML trick: wrap HTML in a Word-compatible MIME envelope
  const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8"/>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>
    @page { size: A4; margin: 2.54cm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1e293b; }
    h1 { font-size: 18pt; color: #0d9488; }
    h2 { font-size: 13pt; color: #0d9488; border-bottom: 1pt solid #0d9488; padding-bottom: 3pt; margin-top: 18pt; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; }
    td, th { border: 1pt solid #cbd5e1; padding: 4pt 7pt; font-size: 10pt; }
    th { background: #0d9488; color: #fff; font-weight: bold; }
    .badge { background: ${badgeColor}; color: #fff; padding: 2pt 8pt; font-size: 10pt; font-weight: bold; }
  </style>
</head>
${html.replace(/<!DOCTYPE html>[\s\S]*?<\/head>/i, '').replace(/<\/html>/i, '')}</html>`;

  dlBlob(
    new Blob([wordHtml], { type: 'application/msword' }),
    `Trial_DOC_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.doc`
  );
  toast('Word document downloaded!', 'success');
}
