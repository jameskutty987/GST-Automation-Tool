const state = {
  rows: [],
  summaryRows: [],
  fy: null,
  detectedKeys: new Set(),
  unknownKeys: new Set(),
  lastXML: ''
};

const SECTION_LABELS = {
  ALL:'All sections', B2B:'B2B', RCM:'RCM', EXPORT:'Export',
  CDNR:'Credit / Debit Notes', CDNRA:'Credit / Debit Amendments',
  B2BA:'B2B Amendments', IMPG:'Imports of goods',
  IMPGSEZ:'Imports from SEZ', ISD:'ISD', MISC:'Miscellaneous'
};

const KNOWN_DOC_KEYS = ['b2b','b2ba','cdnr','cdnra','isd','impg','impgsez','ecoa','ecoma'];
const XML_ALLOWED_IGST_RATES = [0, 5, 12, 18, 28];
const XML_ALLOWED_HALF_RATES = [0, 2.5, 6, 9, 14];

const $ = id => document.getElementById(id);
const arr = v => Array.isArray(v) ? v : [];
const clean = v => String(v ?? '').trim();
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = n => +(Number(n || 0).toFixed(2));
const fmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
const esc = v => String(v ?? '').replace(/[<>&'"]/g, ch => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' }[ch]));

function setStatus(msg){ $('statusBox').textContent = Array.isArray(msg) ? msg.join('\n') : msg; }

function formatMonthLabel(fp){
  const s = clean(fp);
  if(s.length !== 6) return 'Unknown Month';
  const m = +s.slice(0,2), y = +s.slice(2);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month:'long', year:'numeric' });
}

function getFY(fp){
  const s = clean(fp);
  if(s.length !== 6) return 'Unknown';
  const m = +s.slice(0,2), y = +s.slice(2);
  return m >= 4 ? `${y}-${y+1}` : `${y-1}-${y}`;
}

function lastDay(fp){
  const s = clean(fp);
  if(s.length !== 6) return { tally:'', display:'' };
  const m = +s.slice(0,2), y = +s.slice(2);
  const d = new Date(y, m, 0).getDate();
  return {
    tally:`${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`,
    display:`${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}`
  };
}

function normDate(dateStr, fp){
  const fallback = lastDay(fp);
  const raw = clean(dateStr);
  if(!raw) return fallback;
  const p = raw.split(/[-/]/);
  if(p.length !== 3) return fallback;
  let d, m, y;
  if(p[0].length === 4){ y = p[0]; m = p[1]; d = p[2]; }
  else { d = p[0]; m = p[1]; y = p[2]; }
  d = String(parseInt(d,10)).padStart(2,'0');
  m = String(parseInt(m,10)).padStart(2,'0');
  y = String(y).length === 2 ? `20${y}` : String(y);
  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  if(isNaN(dt.getTime())) return fallback;
  return { tally:`${y}${m}${d}`, display:`${d}-${m}-${y}` };
}

function computedWholeRate(taxable, igst, cgst, sgst){
  const tx = num(taxable);
  if(tx <= 0) return '';
  return String(Math.round(((num(igst) + num(cgst) + num(sgst)) / tx) * 100));
}

function inferHSN(item={}, det={}, inv={}){
  return clean(item.hsn || item.hsnsc || det.hsn || det.hsnsc || inv.hsn || inv.hsnsc || '');
}

function aggItems(items, inv={}){
  let taxable=0, igst=0, cgst=0, sgst=0, cess=0;
  const hsns = new Set();
  arr(items).forEach(item=>{
    const det = item.itm_det || item;
    taxable += num(det.txval || item.txval);
    igst += num(det.iamt || det.igst || item.igst);
    cgst += num(det.camt || det.cgst || item.cgst);
    sgst += num(det.samt || det.sgst || item.sgst);
    cess += num(det.csamt || det.cess || item.cess);
    const h = inferHSN(item, det, inv);
    if(h) hsns.add(h);
  });
  const finalTaxable = round2(taxable), finalIgst = round2(igst), finalCgst = round2(cgst), finalSgst = round2(sgst);
  return { taxable:finalTaxable, igst:finalIgst, cgst:finalCgst, sgst:finalSgst, cess:round2(cess), hsn:[...hsns].join(', '), rate:computedWholeRate(finalTaxable, finalIgst, finalCgst, finalSgst) };
}

function addRow(r){
  const taxable = round2(r.Taxable), igst = round2(r.IGST), cgst = round2(r.CGST), sgst = round2(r.SGST);
  state.rows.push({
    Month:r.Month||'Unknown Month', FY:r.FY||'Unknown', Period:r.Period||'', Section:r.Section||'MISC',
    Party:clean(r.Party)||'Unknown Party', GSTIN:clean(r.GSTIN),
    Invoice:clean(r.Invoice)||'UNKNOWN', Date:clean(r.Date), TallyDate:clean(r.TallyDate),
    HSN:clean(r.HSN), Rate:clean(r.Rate || computedWholeRate(taxable, igst, cgst, sgst)),
    Taxable:taxable, IGST:igst, CGST:cgst, SGST:sgst, CESS:round2(r.CESS), Total:round2(r.Total),
    ReverseCharge:r.ReverseCharge?'Y':'N', DocType:r.DocType||'', SourceKey:r.SourceKey||'', Notes:r.Notes||''
  });
}

function parseB2B(list, meta){
  arr(list).forEach(sup=>{
    arr(sup.inv || sup.invoices).forEach(inv=>{
      const a = aggItems(inv.items || inv.itms || [], inv);
      const d = normDate(inv.dt || inv.idt, meta.period);
      const typ = clean(inv.typ).toUpperCase();
      const sec = clean(inv.rev) === 'Y' ? 'RCM' : (typ.includes('SEWP') || typ.includes('EXP') ? 'EXPORT' : 'B2B');
      const taxable = num(inv.txval || a.taxable);
      const igst = num(inv.igst || inv.iamt || a.igst);
      const cgst = num(inv.cgst || inv.camt || a.cgst);
      const sgst = num(inv.sgst || inv.samt || a.sgst);
      addRow({
        Month:meta.month, FY:meta.fy, Period:meta.period, Section:sec,
        Party:sup.trdnm || sup.lglNm || sup.ctin, GSTIN:sup.ctin||'',
        Invoice:inv.inum||'', Date:d.display, TallyDate:d.tally, HSN:a.hsn,
        Rate:computedWholeRate(taxable, igst, cgst, sgst), Taxable:taxable,
        IGST:igst, CGST:cgst, SGST:sgst, CESS:num(inv.cess || inv.csamt || a.cess),
        Total:num(inv.val || (a.taxable + a.igst + a.cgst + a.sgst + a.cess)),
        ReverseCharge:clean(inv.rev)==='Y', DocType:clean(inv.typ||'INV'), SourceKey:'b2b'
      });
    });
  });
}

function parseB2BA(list, meta){
  arr(list).forEach(sup=>{
    arr(sup.inv || sup.invoices).forEach(inv=>{
      const a = aggItems(inv.items || inv.itms || [], inv);
      const d = normDate(inv.dt || inv.idt || inv.oinvdt, meta.period);
      const taxable = num(inv.txval || a.taxable);
      const igst = num(inv.igst || inv.iamt || a.igst);
      const cgst = num(inv.cgst || inv.camt || a.cgst);
      const sgst = num(inv.sgst || inv.samt || a.sgst);
      addRow({
        Month:meta.month, FY:meta.fy, Period:meta.period, Section:'B2BA',
        Party:sup.trdnm || sup.lglNm || sup.ctin, GSTIN:sup.ctin||'',
        Invoice:inv.inum || inv.oinum || inv.oinvnum || '',
        Date:d.display, TallyDate:d.tally, HSN:a.hsn,
        Rate:computedWholeRate(taxable, igst, cgst, sgst), Taxable:taxable,
        IGST:igst, CGST:cgst, SGST:sgst, CESS:num(inv.cess || inv.csamt || a.cess),
        Total:num(inv.val || (a.taxable + a.igst + a.cgst + a.sgst + a.cess)),
        ReverseCharge:clean(inv.rev)==='Y', DocType:clean(inv.typ||'B2BA'), SourceKey:'b2ba'
      });
    });
  });
}

function parseCDN(list, meta, sourceKey, section){
  arr(list).forEach(sup=>{
    arr(sup.nt || sup.notes || sup.note || []).forEach(note=>{
      const a = aggItems(note.items || note.itms || [], note);
      const d = normDate(note.dt || note.nt_dt || note.idt, meta.period);
      const taxable = num(note.txval || a.taxable);
      const igst = num(note.igst || note.iamt || a.igst);
      const cgst = num(note.cgst || note.camt || a.cgst);
      const sgst = num(note.sgst || note.samt || a.sgst);
      const docTypeRaw = clean(note.ntty || note.typ || note.note_type || 'NOTE').toUpperCase();
      const isCredit = docTypeRaw.includes('C'), isDebit = docTypeRaw.includes('D');
      addRow({
        Month:meta.month, FY:meta.fy, Period:meta.period, Section:section,
        Party:sup.trdnm || sup.lglNm || sup.ctin, GSTIN:sup.ctin||'',
        Invoice:note.nt_num || note.inum || note.docnum || '',
        Date:d.display, TallyDate:d.tally, HSN:a.hsn,
        Rate:computedWholeRate(taxable, igst, cgst, sgst), Taxable:taxable,
        IGST:igst, CGST:cgst, SGST:sgst, CESS:num(note.cess || note.csamt || a.cess),
        Total:num(note.val || (a.taxable + a.igst + a.cgst + a.sgst + a.cess)),
        ReverseCharge:clean(note.rev)==='Y',
        DocType:isCredit ? 'CREDIT NOTE' : (isDebit ? 'DEBIT NOTE' : docTypeRaw || 'NOTE'),
        SourceKey:sourceKey
      });
    });
  });
}

function parseImports(list, meta, section, sourceKey){
  arr(list).forEach(entry=>{
    const items = entry.items || entry.itms || entry.boe || [entry];
    arr(items).forEach(item=>{
      const det = item.itm_det || item;
      const d = normDate(item.boe_dt || item.dt || entry.boe_dt || entry.dt, meta.period);
      const taxable = num(det.txval || item.txval || entry.txval);
      const igst = num(det.igst || det.iamt || item.igst || entry.igst);
      const cgst = num(det.cgst || det.camt || item.cgst || entry.cgst);
      const sgst = num(det.sgst || det.samt || item.sgst || entry.sgst);
      addRow({
        Month:meta.month, FY:meta.fy, Period:meta.period, Section:section,
        Party:entry.trdnm || entry.portCode || entry.ctin || 'Import Supplier', GSTIN:entry.ctin||'',
        Invoice:item.boe_num || item.inum || entry.boe_num || `IMP-${meta.period}`,
        Date:d.display, TallyDate:d.tally, HSN:inferHSN(item, det, entry),
        Rate:computedWholeRate(taxable, igst, cgst, sgst), Taxable:taxable,
        IGST:igst, CGST:cgst, SGST:sgst, CESS:num(det.cess || det.csamt || item.cess || entry.cess),
        Total:num(item.val || entry.val || (num(det.txval) + num(det.igst||det.iamt) + num(det.cgst||det.camt) + num(det.sgst||det.samt) + num(det.cess||det.csamt))),
        DocType:'IMPORT', SourceKey:sourceKey
      });
    });
  });
}

function parseISD(list, meta){
  arr(list).forEach(item=>{
    const d = normDate(item.docdt || item.dt, meta.period);
    const taxable = num(item.txval), igst = num(item.igst || item.iamt);
    const cgst = num(item.cgst || item.camt), sgst = num(item.sgst || item.samt);
    addRow({
      Month:meta.month, FY:meta.fy, Period:meta.period, Section:'ISD',
      Party:item.trdnm || item.ctin || 'ISD', GSTIN:item.ctin||'',
      Invoice:item.docnum || item.inum || 'ISD-DOC',
      Date:d.display, TallyDate:d.tally, HSN:'',
      Rate:computedWholeRate(taxable, igst, cgst, sgst), Taxable:taxable,
      IGST:igst, CGST:cgst, SGST:sgst, CESS:num(item.cess || item.csamt),
      Total:num(item.val || (num(item.txval)+num(item.igst||item.iamt)+num(item.cgst||item.camt)+num(item.sgst||item.samt)+num(item.cess||item.csamt))),
      DocType:'ISD', SourceKey:'isd'
    });
  });
}

function parseUnknown(doc, meta){
  Object.keys(doc || {}).forEach(key=>{
    if(KNOWN_DOC_KEYS.includes(key)) return;
    state.unknownKeys.add(key);
    const entries = Array.isArray(doc[key]) ? doc[key] : [doc[key]];
    entries.forEach((entry, idx)=>{
      const d = normDate(entry?.dt || entry?.idt || '', meta.period);
      const taxable = num(entry?.txval), igst = num(entry?.igst || entry?.iamt);
      const cgst = num(entry?.cgst || entry?.camt), sgst = num(entry?.sgst || entry?.samt);
      addRow({
        Month:meta.month, FY:meta.fy, Period:meta.period, Section:'MISC',
        Party:clean(entry?.trdnm || entry?.ctin || 'Unknown source'), GSTIN:clean(entry?.ctin||''),
        Invoice:clean(entry?.inum || entry?.docnum || `${key}-${idx+1}`),
        Date:d.display, TallyDate:d.tally, HSN:inferHSN(entry, entry?.itm_det||{}, entry),
        Rate:computedWholeRate(taxable, igst, cgst, sgst), Taxable:taxable,
        IGST:igst, CGST:cgst, SGST:sgst, CESS:num(entry?.cess || entry?.csamt),
        Total:num(entry?.val || (num(entry?.txval)+num(entry?.igst||entry?.iamt)+num(entry?.cgst||entry?.camt)+num(entry?.sgst||entry?.samt)+num(entry?.cess||entry?.csamt))),
        DocType:'MISC', SourceKey:key, Notes:`Captured from unknown docdata key: ${key}`
      });
    });
  });
}

function parseFile(json){
  const data = json.data || json;
  const period = clean(data.rtnprd || data.fp || json.rtnprd || json.fp);
  if(!period || period.length !== 6) throw new Error('Invalid or missing return period.');
  const fy = getFY(period);
  if(!state.fy) state.fy = fy;
  if(state.fy !== fy) throw new Error(`Files span multiple financial years: ${state.fy} vs ${fy}`);
  const meta = { period, fy, month: formatMonthLabel(period) };
  const doc = data.docdata || json.docdata || data.docsumm || json.docsumm || data;
  const beforeCount = state.rows.length;
  Object.keys(doc || {}).forEach(k => state.detectedKeys.add(k));
  parseB2B(doc.b2b, meta);
  parseB2BA(doc.b2ba, meta);
  parseCDN(doc.cdnr, meta, 'cdnr', 'CDNR');
  parseCDN(doc.cdnra, meta, 'cdnra', 'CDNRA');
  parseImports(doc.impg, meta, 'IMPG', 'impg');
  parseImports(doc.impgsez, meta, 'IMPGSEZ', 'impgsez');
  parseISD(doc.isd, meta);
  parseUnknown(doc, meta);
  const added = state.rows.length - beforeCount;
  if(added === 0) throw new Error(`No usable rows found for period ${period}. Detected keys: ${Object.keys(doc||{}).join(', ')||'none'}`);
}

function buildSummary(){
  const map = new Map();
  state.rows.forEach(r=>{
    const key = `${r.Month}||${r.Section}`;
    if(!map.has(key)) map.set(key,{ Month:r.Month, Section:r.Section, Bills:0, Taxable:0, IGST:0, CGST:0, SGST:0, CESS:0, Total:0 });
    const s = map.get(key);
    s.Bills++; s.Taxable+=r.Taxable; s.IGST+=r.IGST; s.CGST+=r.CGST; s.SGST+=r.SGST; s.CESS+=r.CESS; s.Total+=r.Total;
  });
  state.summaryRows = [...map.values()]
    .map(r=>({ ...r, Taxable:round2(r.Taxable), IGST:round2(r.IGST), CGST:round2(r.CGST), SGST:round2(r.SGST), CESS:round2(r.CESS), Total:round2(r.Total) }))
    .sort((a,b)=>new Date(a.Month)-new Date(b.Month) || a.Section.localeCompare(b.Section));
}

function getBills(){
  const sec = $('sectionSelect').value||'ALL', month = $('monthSelect').value||'ALL';
  const q = clean($('searchInput').value).toLowerCase();
  return state.rows.filter(r=> (sec==='ALL'||r.Section===sec) && (month==='ALL'||r.Month===month) && (!q||[r.Party,r.GSTIN,r.Invoice,r.HSN,r.Rate,r.SourceKey,r.DocType].join(' ').toLowerCase().includes(q)));
}

function getSummary(){
  const sec = $('sectionSelect').value||'ALL', month = $('monthSelect').value||'ALL';
  return state.summaryRows.filter(r=> (sec==='ALL'||r.Section===sec) && (month==='ALL'||r.Month===month));
}

function renderFilters(){
  const sections = ['ALL', ...new Set(state.rows.map(r=>r.Section))].sort((a,b)=>a.localeCompare(b));
  $('sectionSelect').innerHTML = sections.map(s=>`<option value="${esc(s)}">${esc(SECTION_LABELS[s]||s)}</option>`).join('');
  const months = ['ALL', ...[...new Set(state.rows.map(r=>r.Month))].sort((a,b)=>new Date(a)-new Date(b))];
  $('monthSelect').innerHTML = months.map(m=>`<option value="${esc(m)}">${esc(m==='ALL'?'All months':m)}</option>`).join('');
  $('detectedChips').innerHTML = [
    `<span class="chip">FY ${esc(state.fy||'Unknown')}</span>`,
    `<span class="chip">Rows ${state.rows.length}</span>`,
    `<span class="chip">Keys ${state.detectedKeys.size}</span>`,
    state.unknownKeys.size ? `<span class="chip">Misc ${state.unknownKeys.size}</span>` : ''
  ].join('');
}

function renderReport(){
  const view = $('viewSelect').value;
  if(view==='summary'){
    const rows = getSummary();
    $('reportTitle').textContent = 'Summary report';
    $('reportMeta').textContent = `${rows.length} summary rows`;
    if(!rows.length){ $('reportTable').innerHTML='<div class="empty">No summary rows for the selected filter.</div>'; return; }
    let html = '<table><thead><tr><th>Month</th><th>Section</th><th>Bills</th><th>Total taxable value</th><th>Total IGST</th><th>Total CGST</th><th>Total SGST</th><th>Total CESS</th><th>Total invoice value</th></tr></thead><tbody>';
    rows.forEach(r=>{ html += `<tr><td>${esc(r.Month)}</td><td>${esc(SECTION_LABELS[r.Section]||r.Section)}</td><td>${r.Bills}</td><td>${fmt(r.Taxable)}</td><td>${fmt(r.IGST)}</td><td>${fmt(r.CGST)}</td><td>${fmt(r.SGST)}</td><td>${fmt(r.CESS)}</td><td>${fmt(r.Total)}</td></tr>`; });
    html += '</tbody></table>';
    $('reportTable').innerHTML = html;
    return;
  }
  const rows = getBills();
  $('reportTitle').textContent = 'Bill wise details';
  $('reportMeta').textContent = `${rows.length} bill rows`;
  if(!rows.length){ $('reportTable').innerHTML='<div class="empty">No bill rows for the selected filter.</div>'; return; }
  let html = '<table><thead><tr><th>Month</th><th>Section</th><th>Date</th><th>Party</th><th>GST no</th><th>Invoice</th><th>HSN no</th><th>Rate of tax</th><th>Taxable value</th><th>IGST</th><th>CGST</th><th>SGST</th><th>CESS</th><th>Invoice value</th><th>Doc type</th></tr></thead><tbody>';
  rows.forEach(r=>{ html += `<tr><td>${esc(r.Month)}</td><td>${esc(SECTION_LABELS[r.Section]||r.Section)}</td><td>${esc(r.Date)}</td><td>${esc(r.Party)}</td><td>${esc(r.GSTIN)}</td><td>${esc(r.Invoice)}</td><td>${esc(r.HSN)}</td><td>${esc(r.Rate)}</td><td>${fmt(r.Taxable)}</td><td>${fmt(r.IGST)}</td><td>${fmt(r.CGST)}</td><td>${fmt(r.SGST)}</td><td>${fmt(r.CESS)}</td><td>${fmt(r.Total)}</td><td>${esc(r.DocType)}</td></tr>`; });
  html += '</tbody></table>';
  $('reportTable').innerHTML = html;
}

function excelData(){
  if($('viewSelect').value==='summary'){
    return getSummary().map(r=>({ month:r.Month, section:SECTION_LABELS[r.Section]||r.Section, bills:r.Bills, total_taxable_value:r.Taxable, total_igst:r.IGST, total_cgst:r.CGST, total_sgst:r.SGST, total_cess:r.CESS, total_invoice_value:r.Total }));
  }
  return getBills().map(r=>({ month:r.Month, section:SECTION_LABELS[r.Section]||r.Section, date:r.Date, party:r.Party, gst_no:r.GSTIN, invoice:r.Invoice, hsn_no:r.HSN, rate_of_tax:r.Rate, taxable_value:r.Taxable, igst:r.IGST, cgst:r.CGST, sgst:r.SGST, cess:r.CESS, invoice_value:r.Total, doc_type:r.DocType }));
}

function dl(name, content, type){
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function formatRateLabel(rate){ return Number.isInteger(rate) ? String(rate) : String(rate).replace(/\.0$/,''); }

function nearestAllowedRate(rate, allowedRates){
  let nearest = allowedRates[0], minDiff = Math.abs(rate - nearest);
  for(const r of allowedRates){ const diff = Math.abs(rate - r); if(diff < minDiff){ minDiff = diff; nearest = r; } }
  return { nearest, diff: minDiff };
}

function detectTaxBucket(taxAmount, taxable, allowedRates, ledgerPrefix){
  const amount = round2(taxAmount), base = Number(taxable||0);
  if(amount <= 0.001) return { rate:0, rawRate:0, ledgerName:`${ledgerPrefix} 0% alc`, amount };
  if(base <= 0.001) return { rate:null, rawRate:0, ledgerName:'wrong% tax', amount };
  const rawRate = (amount / base) * 100;
  const { nearest, diff } = nearestAllowedRate(rawRate, allowedRates);
  if(diff > 1) return { rate:null, rawRate, ledgerName:'wrong% tax', amount };
  return { rate:nearest, rawRate, ledgerName:`${ledgerPrefix} ${formatRateLabel(nearest)}% alc`, amount };
}

function buildNarration(igstInfo, cgstInfo, sgstInfo){
  const parts = [];
  if(igstInfo?.amount > 0.001) parts.push(`IGST ${formatRateLabel(igstInfo.rate ?? round2(igstInfo.rawRate))}%`);
  if(cgstInfo?.amount > 0.001) parts.push(`CGST ${formatRateLabel(cgstInfo.rate ?? round2(cgstInfo.rawRate))}%`);
  if(sgstInfo?.amount > 0.001) parts.push(`SGST ${formatRateLabel(sgstInfo.rate ?? round2(sgstInfo.rawRate))}%`);
  return parts.join(' | ');
}

function addLedgerXml(ledgerName, parentName, gstin=''){
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(ledgerName)}" ACTION="Create"><NAME.LIST TYPE="String"><NAME>${esc(ledgerName)}</NAME></NAME.LIST><PARENT>${esc(parentName)}</PARENT>${gstin?`<PARTYGSTIN>${esc(gstin)}</PARTYGSTIN>`:''}</LEDGER></TALLYMESSAGE>\n`;
}

function getAdjustmentLedgerName(value){ return Math.abs(Number(value||0)) > 10 ? 'Input Adjustment alc' : 'Round Off alc'; }

function generateXML(){
  const rows = getBills();
  if(!rows.length) return '';
  const purchaseLedger = clean($('ledgerPurchase').value)||'Purchase Account';
  const igstLedgerBase = clean($('ledgerIgst').value)||'Input Igst';
  const cgstLedgerBase = clean($('ledgerCgst').value)||'Input Cgst';
  const sgstLedgerBase = clean($('ledgerSgst').value)||'Input Sgst';
  const uniquePartyLedgers = new Map();
  const taxLedgers = new Set(['Round Off alc','Input Adjustment alc','wrong% tax']);

  rows.forEach(r=>{
    const gstin = clean(r.GSTIN).toUpperCase();
    if(r.Party && !uniquePartyLedgers.has(r.Party)) uniquePartyLedgers.set(r.Party, gstin);
    const taxable = Number(r.Taxable||0), igst = Number(r.IGST||0), cgst = Number(r.CGST||0), sgst = Number(r.SGST||0);
    const igstInfo = detectTaxBucket(igst, taxable, XML_ALLOWED_IGST_RATES, igstLedgerBase);
    const cgstInfo = detectTaxBucket(cgst, taxable, XML_ALLOWED_HALF_RATES, cgstLedgerBase);
    const sgstInfo = detectTaxBucket(sgst, taxable, XML_ALLOWED_HALF_RATES, sgstLedgerBase);
    if(igst > 0.001) taxLedgers.add(igstInfo.ledgerName);
    if(cgst > 0.001) taxLedgers.add(cgstInfo.ledgerName);
    if(sgst > 0.001) taxLedgers.add(sgstInfo.ledgerName);
  });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n<HEADER>\n<VERSION>1</VERSION>\n<TALLYREQUEST>Import</TALLYREQUEST>\n<TYPE>Data</TYPE>\n<ID>Vouchers</ID>\n</HEADER>\n<BODY>\n<DATA>\n`;
  xml += addLedgerXml(purchaseLedger, 'Purchase Accounts');
  [...taxLedgers].forEach(name=>{ xml += addLedgerXml(name, 'Duties & Taxes'); });
  uniquePartyLedgers.forEach((gstin, name)=>{
    xml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST TYPE="String"><NAME>${esc(name)}</NAME></NAME.LIST><PARENT>Sundry Creditors</PARENT>${gstin&&gstin!=='URP'?`<PARTYGSTIN>${esc(gstin)}</PARTYGSTIN>`:''}<ISBILLWISEON>Yes</ISBILLWISEON></LEDGER></TALLYMESSAGE>\n`;
  });

  rows.forEach(r=>{
    const section = clean(r.Section).toUpperCase(), docType = clean(r.DocType).toUpperCase();
    const isCreditNote = section==='CDNR' || section==='CDNRA' || docType.includes('CREDIT');
    const voucherType = isCreditNote ? 'Credit Note' : 'Purchase';
    const total = round2(r.Total||0), taxable = round2(r.Taxable||0);
    let igst = round2(r.IGST||0), cgst = round2(r.CGST||0), sgst = round2(r.SGST||0);
    let initialBalanceAdjustment = 0;
    if(cgst > 0 && sgst > 0 && Math.abs(cgst - sgst) > 0.001){
      if(cgst >= sgst) sgst = cgst; else cgst = sgst;
      initialBalanceAdjustment = round2(total - (taxable + igst + cgst + sgst));
    }
    const igstInfo = detectTaxBucket(igst, taxable, XML_ALLOWED_IGST_RATES, igstLedgerBase);
    const cgstInfo = detectTaxBucket(cgst, taxable, XML_ALLOWED_HALF_RATES, cgstLedgerBase);
    const sgstInfo = detectTaxBucket(sgst, taxable, XML_ALLOWED_HALF_RATES, sgstLedgerBase);
    const debitedBeforeFinal = round2(taxable + igst + cgst + sgst + initialBalanceAdjustment);
    const finalBalanceAdjustment = round2(total - debitedBeforeFinal);
    const narration = buildNarration(igstInfo, cgstInfo, sgstInfo);
    const voucherDate = /^[0-9]{8}$/.test(String(r.TallyDate||'')) ? String(r.TallyDate) : lastDay(r.Period).tally;
    const totalStr = total.toFixed(2), taxableStr = taxable.toFixed(2);

    xml += `<TALLYMESSAGE xmlns:UDF="TallyUDF">\n<VOUCHER VCHTYPE="${esc(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">\n<DATE>${voucherDate}</DATE>\n<VOUCHERTYPENAME>${esc(voucherType)}</VOUCHERTYPENAME>\n<VOUCHERNUMBER>${esc(r.Invoice)}</VOUCHERNUMBER>\n<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>\n<ISINVOICE>No</ISINVOICE>\n<PARTYLEDGERNAME>${esc(r.Party)}</PARTYLEDGERNAME>\n<NARRATION>${esc(narration)}</NARRATION>\n`;

    if(isCreditNote){
      xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(r.Party)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>\n<AMOUNT>${totalStr}</AMOUNT>\n<BILLALLOCATIONS.LIST>\n<NAME>${esc(r.Invoice)}</NAME>\n<BILLTYPE>New Ref</BILLTYPE>\n<AMOUNT>${totalStr}</AMOUNT>\n</BILLALLOCATIONS.LIST>\n</LEDGERENTRIES.LIST>\n`;
      xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(purchaseLedger)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<AMOUNT>-${taxableStr}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
      if(igst > 0.001) xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(igstInfo.ledgerName)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<AMOUNT>-${igst.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
      if(cgst > 0.001) xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(cgstInfo.ledgerName)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<AMOUNT>-${cgst.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
      if(sgst > 0.001) xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(sgstInfo.ledgerName)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<AMOUNT>-${sgst.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
    } else {
      xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(r.Party)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>\n<AMOUNT>-${totalStr}</AMOUNT>\n<BILLALLOCATIONS.LIST>\n<NAME>${esc(r.Invoice)}</NAME>\n<BILLTYPE>New Ref</BILLTYPE>\n<AMOUNT>-${totalStr}</AMOUNT>\n</BILLALLOCATIONS.LIST>\n</LEDGERENTRIES.LIST>\n`;
      xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(purchaseLedger)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n<AMOUNT>${taxableStr}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
      if(igst > 0.001) xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(igstInfo.ledgerName)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n<AMOUNT>${igst.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
      if(cgst > 0.001) xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(cgstInfo.ledgerName)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n<AMOUNT>${cgst.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
      if(sgst > 0.001) xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(sgstInfo.ledgerName)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n<AMOUNT>${sgst.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`;
    }

    if(Math.abs(initialBalanceAdjustment) > 0.001){ const al = getAdjustmentLedgerName(initialBalanceAdjustment); xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(al)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>${initialBalanceAdjustment<0?'Yes':'No'}</ISDEEMEDPOSITIVE>\n<AMOUNT>${initialBalanceAdjustment.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`; }
    if(Math.abs(finalBalanceAdjustment) > 0.001){ const al = getAdjustmentLedgerName(finalBalanceAdjustment); xml += `<LEDGERENTRIES.LIST>\n<LEDGERNAME>${esc(al)}</LEDGERNAME>\n<ISDEEMEDPOSITIVE>${finalBalanceAdjustment<0?'Yes':'No'}</ISDEEMEDPOSITIVE>\n<AMOUNT>${finalBalanceAdjustment.toFixed(2)}</AMOUNT>\n</LEDGERENTRIES.LIST>\n`; }

    xml += `</VOUCHER>\n</TALLYMESSAGE>\n`;
  });

  xml += `</DATA>\n</BODY>\n</ENVELOPE>`;
  return xml;
}

async function processFiles(){
  const files = [...$('fileInput').files];
  if(!files.length){ alert('Please select at least one JSON file.'); return; }
  state.rows=[]; state.summaryRows=[]; state.detectedKeys=new Set(); state.unknownKeys=new Set(); state.fy=null; state.lastXML='';
  const notes = [];
  for(const file of files){
    notes.push(`Reading ${file.name}`);
    let json;
    try { json = JSON.parse(await file.text()); } catch(e){ throw new Error(`Invalid JSON in file: ${file.name}`); }
    parseFile(json);
  }
  buildSummary(); renderFilters(); renderReport(); state.lastXML='';
  notes.push(`Processed ${files.length} file(s)`, `Financial year: ${state.fy||'Unknown'}`, `Rows created: ${state.rows.length}`);
  if(state.unknownKeys.size) notes.push(`Miscellaneous keys: ${[...state.unknownKeys].join(', ')}`);
  setStatus(notes);
}

function refresh(){ renderReport(); state.lastXML=''; }

function renderFileChips(){
  const files = [...$('fileInput').files];
  $('fileChips').innerHTML = files.length ? files.map(f=>`<span class="chip">${esc(f.name)}</span>`).join('') : '<span class="chip">No files selected</span>';
}

function bind(){
  $('processBtn').addEventListener('click', async()=>{ try{ await processFiles(); } catch(err){ console.error(err); alert(err.message||'Processing failed'); setStatus(`Error: ${err.message||err}`); } });
  $('downloadExcelBtn').addEventListener('click', ()=>{
    const data = excelData();
    if(!data.length){ alert('No rows for current selection.'); return; }
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, $('viewSelect').value==='summary'?'Summary':'Bills');
    const arrData = XLSX.write(wb, { type:'array', bookType:'xlsx' });
    dl(`gstr-2b-${$('sectionSelect').value.toLowerCase()}-${$('viewSelect').value}.xlsx`, new Blob([arrData],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
  $('downloadXmlBtn').addEventListener('click', ()=>{
    const xml = generateXML();
    if(!xml){ alert('No bill rows available for current selection.'); return; }
    const sec = $('sectionSelect').value||'ALL', month = $('monthSelect').value||'ALL';
    state.lastXML = xml;
    dl(`gstr-2b-tally-${sec.toLowerCase()}-${month.replace(/\s+/g,'_')}.xml`, xml, 'application/xml;charset=utf-8');
  });
  ['sectionSelect','viewSelect','monthSelect'].forEach(id=>{ $(id).addEventListener('change', refresh); });
  $('searchInput').addEventListener('input', refresh);
  $('themeBtn').addEventListener('click', ()=>{
    const root = document.documentElement, mode = root.getAttribute('data-theme')==='dark'?'light':'dark';
    root.setAttribute('data-theme', mode);
    $('themeBtn').textContent = mode==='dark'?'🌙 Night mode':'☀️ Light mode';
  });
  const dz = $('dropzone');
  ['dragenter','dragover'].forEach(ev=>{ dz.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); dz.classList.add('drag'); }); });
  ['dragleave','dragend'].forEach(ev=>{ dz.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag'); }); });
  dz.addEventListener('drop', async e=>{
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag');
    const files = e.dataTransfer?.files;
    if(files && files.length){
      try{ const dt = new DataTransfer(); Array.from(files).forEach(f=>dt.items.add(f)); $('fileInput').files = dt.files; } catch(err){ console.warn(err); }
      renderFileChips();
      try{ await processFiles(); } catch(err){ console.error(err); alert(err.message||'Processing failed'); setStatus(`Error: ${err.message||err}`); }
    }
  });
  $('fileInput').addEventListener('change', async()=>{ renderFileChips(); try{ await processFiles(); } catch(err){ console.error(err); alert(err.message||'Processing failed'); setStatus(`Error: ${err.message||err}`); } });
}

(function init(){ renderFileChips(); bind(); })();