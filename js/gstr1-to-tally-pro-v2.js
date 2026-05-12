const $ = id => document.getElementById(id);
const round2 = n => Number((Number(n || 0)).toFixed(2));
const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const toCaps = v => String(v ?? '').trim().toUpperCase();
const esc = v => String(v ?? '').replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));

let globalDataByMonth = {};
let globalFY = null;
let nameMap = {};

function ensureMonthBucket(monthLabel) {
  if (!globalDataByMonth[monthLabel]) {
    globalDataByMonth[monthLabel] = {
      ALL_BILLS: [],
      B2B_RCM: [],
      B2CS: [],
      B2CL: [],
      CDN: [],
      AMENDMENTS: [],
      HSN: []
    };
  }
}

function formatMonthLabel(fp) {
  if (!fp || String(fp).length !== 6) return 'Unknown Month';
  const m = parseInt(String(fp).slice(0, 2), 10);
  const y = parseInt(String(fp).slice(2), 10);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function getFY(fp) {
  if (!fp || String(fp).length !== 6) return 'Unknown';
  const m = parseInt(String(fp).slice(0, 2), 10);
  const y = parseInt(String(fp).slice(2), 10);
  return m <= 3 ? `${y - 1}-${y}` : `${y}-${y + 1}`;
}

function getLastDayOfPeriod(fp) {
  if (!fp || String(fp).length !== 6) return { tally: '', display: '' };
  const m = parseInt(String(fp).slice(0, 2), 10);
  const y = parseInt(String(fp).slice(2), 10);
  const d = new Date(y, m, 0).getDate();
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return { tally: `${y}${mm}${dd}`, display: `${dd}-${mm}-${y}` };
}

function formatDate(dateStr, fp) {
  const fallback = getLastDayOfPeriod(fp);
  if (!dateStr) return fallback;
  const raw = String(dateStr).trim();
  if (!raw) return fallback;
  const p = raw.split(/[-/]/);
  if (p.length !== 3) return fallback;

  let d, m, y;
  if (p[0].length === 4) {
    y = p[0]; m = p[1]; d = p[2];
  } else {
    d = p[0]; m = p[1]; y = p[2];
  }

  d = String(parseInt(d, 10)).padStart(2, '0');
  m = String(parseInt(m, 10)).padStart(2, '0');
  y = String(y).length === 2 ? `20${y}` : String(y);

  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  if (isNaN(dt.getTime())) return fallback;

  return { tally: `${y}${m}${d}`, display: `${d}-${m}-${y}` };
}

function sumInvoiceItems(inv) {
  let tx = 0, cg = 0, sg = 0, ig = 0, cess = 0, qty = 0;
  (inv?.itms || []).forEach(itm => {
    const det = itm.itmdet || {};
    tx += num(det.txval);
    cg += num(det.camt);
    sg += num(det.samt);
    ig += num(det.iamt);
    cess += num(det.csamt);
    qty += num(det.qty);
  });
  return { tx: round2(tx), cg: round2(cg), sg: round2(sg), ig: round2(ig), cess: round2(cess), qty: round2(qty) };
}

function resolvePartyNameSync(gstin, fallbackName, pos) {
  const g = String(gstin || '').trim().toUpperCase();
  if (g && nameMap[g]) return toCaps(nameMap[g]);
  if (fallbackName) return toCaps(fallbackName);
  if (g) return `CUSTOMER - ${g}`;
  return `B2C CUSTOMER - ${toCaps(pos || 'UNKNOWN')}`;
}

function getMissingGSTINs() {
  const missing = new Set();
  Object.values(globalDataByMonth).forEach(monthData => {
    (monthData.ALL_BILLS || []).forEach(row => {
      if (row.GSTIN && row.GSTIN !== 'URP' && String(row.PartyName || '').startsWith('CUSTOMER - ')) {
        missing.add(String(row.GSTIN).trim().toUpperCase());
      }
    });
  });
  return [...missing].sort();
}

function updateMissingBox() {
  const el = $('missingGstinBox');
  if (el) el.value = getMissingGSTINs().join('\n');
}

async function ensureAuthenticated() {
  if (typeof supabaseClient === 'undefined') return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data || !data.session) {
    window.location.href = 'login.html';
    throw new Error('No active login session found.');
  }
  return data.session;
}

async function loadUserInfo() {
  try {
    const session = await ensureAuthenticated();
    $('userInfo').textContent = `Logged in as: ${session.user.email}`;
  } catch {
    $('userInfo').textContent = 'Session not found';
  }
}

async function fetchNameMapForGSTINs(gstins) {
  const cleaned = [...new Set((gstins || []).map(g => String(g).trim().toUpperCase()).filter(Boolean).filter(g => g !== 'URP'))];
  if (!cleaned.length || typeof supabaseClient === 'undefined') return {};
  await ensureAuthenticated();
  const { data, error } = await supabaseClient.from('gst_master').select('gstin, party_name').in('gstin', cleaned);
  if (error) throw new Error(error.message);
  const m = {};
  (data || []).forEach(row => {
    const g = String(row.gstin || '').trim().toUpperCase();
    const p = String(row.party_name || '').trim();
    if (g && p) m[g] = p;
  });
  return m;
}

async function refreshNamesFromDB() {
  const gstins = [];
  Object.values(globalDataByMonth).forEach(monthData => {
    (monthData.ALL_BILLS || []).forEach(row => {
      if (row.GSTIN && row.GSTIN !== 'URP') gstins.push(row.GSTIN);
    });
  });

  nameMap = await fetchNameMapForGSTINs(gstins);

  Object.keys(globalDataByMonth).forEach(month => {
    const bucket = globalDataByMonth[month];
    ['ALL_BILLS', 'B2B_RCM', 'B2CS', 'B2CL', 'CDN', 'AMENDMENTS'].forEach(key => {
      bucket[key] = bucket[key].map(row => {
        const gstin = String(row.GSTIN || '').trim().toUpperCase();
        if (gstin && gstin !== 'URP' && nameMap[gstin]) return { ...row, PartyName: toCaps(nameMap[gstin]) };
        return row;
      });
    });
  });

  updateMissingBox();
  renderView();
}

async function saveMappingsToSupabase(rows) {
  if (typeof supabaseClient === 'undefined') return;
  await ensureAuthenticated();
  const cleaned = rows
    .map(r => ({
      gstin: String(r.gstin || '').trim().toUpperCase(),
      party_name: toCaps(r.party_name || '')
    }))
    .filter(r => r.gstin.length === 15 && r.party_name);

  if (!cleaned.length) throw new Error('No valid GSTIN and Party Name rows found.');

  const { error } = await supabaseClient.from('gst_master').upsert(cleaned, { onConflict: 'gstin' });
  if (error) throw new Error(error.message);
}

async function savePastedNames() {
  const text = $('gstNamePasteBox').value.trim();
  if (!text) throw new Error('Paste GSTIN,PartyName rows first.');

  const rows = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(line => {
    const idx = line.indexOf(',');
    if (idx === -1) return null;
    return {
      gstin: line.slice(0, idx).trim(),
      party_name: line.slice(idx + 1).trim()
    };
  }).filter(Boolean);

  await saveMappingsToSupabase(rows);
  await refreshNamesFromDB();
}

async function importNamesFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const rows = jsonRows.map(row => {
    const normalized = {};
    Object.keys(row).forEach(k => normalized[String(k).trim().toLowerCase()] = row[k]);
    return {
      gstin: normalized.gstin || normalized['gst no'] || normalized['gst number'] || normalized['gstin no'] || normalized['gst no.'] || '',
      party_name: normalized.party_name || normalized['party name'] || normalized.name || normalized['legal name'] || normalized['trade name'] || ''
    };
  }).filter(r => r.gstin && r.party_name);

  await saveMappingsToSupabase(rows);
  await refreshNamesFromDB();
}

function pushAllBill(monthLabel, row) {
  globalDataByMonth[monthLabel].ALL_BILLS.push(row);
}

function normalizeHSNRows(hsnData, period, monthLabel, fy) {
  const rows = [];
  function pushRow(item, idx = 0, sourceLabel = 'HSN') {
    if (!item || typeof item !== 'object') return;
    const hsn = String(item.hsn_sc || item.hsnsc || item.hsn || item.num || item.code || '').trim();
    const desc = String(item.desc || item.description || '').trim();
    const qty = num(item.qty || item.totalqty || 0);
    const txval = num(item.txval || item.taxablevalue || 0);
    const igst = num(item.iamt || item.igst || 0);
    const cgst = num(item.camt || item.cgst || 0);
    const sgst = num(item.samt || item.sgst || 0);
    if (!hsn && !desc && qty === 0 && txval === 0 && igst === 0 && cgst === 0 && sgst === 0) return;
    rows.push({ Month: monthLabel, FY: fy, Period: period, ReportType: 'HSN', Source: sourceLabel, HSN: hsn, 'HSN-Index': idx + 1, Description: desc, Quantity: round2(qty), TaxableValue: round2(txval), IGST: round2(igst), CGST: round2(cgst), SGST: round2(sgst) });
  }
  function processAny(value, sourceLabel = 'HSN') {
    if (!value) return;
    if (Array.isArray(value)) { value.forEach((item, idx) => pushRow(item, idx, sourceLabel)); return; }
    if (typeof value === 'object') {
      const directKeys = ['hsn_sc', 'hsnsc', 'hsn', 'desc', 'qty', 'txval', 'iamt', 'camt', 'samt'];
      if (directKeys.some(key => key in value)) { pushRow(value, 0, sourceLabel); return; }
      Object.entries(value).forEach(([key, child]) => processAny(child, key));
    }
  }
  processAny(hsnData, 'HSN');
  return rows;
}

function aggregateHSNRows(rows) {
  const map = new Map();
  rows.forEach(r => {
    const key = String(r.HSN || '').trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, { HSN: key, Description: String(r.Description || '').trim(), Quantity: 0, TaxableValue: 0, IGST: 0, CGST: 0, SGST: 0 });
    const item = map.get(key);
    if (!item.Description && r.Description) item.Description = String(r.Description).trim();
    item.Quantity += num(r.Quantity || 0);
    item.TaxableValue += num(r.TaxableValue || 0);
    item.IGST += num(r.IGST || 0);
    item.CGST += num(r.CGST || 0);
    item.SGST += num(r.SGST || 0);
  });
  return [...map.values()].map(r => ({ ...r, Quantity: round2(r.Quantity), TaxableValue: round2(r.TaxableValue), IGST: round2(r.IGST), CGST: round2(r.CGST), SGST: round2(r.SGST) })).sort((a, b) => String(a.HSN).localeCompare(String(b.HSN), undefined, { numeric: true }));
}

async function processGSTR1Files(files) {
  globalDataByMonth = {};
  globalFY = null;
  const parsedFiles = [];

  for (const file of files) {
    const text = await file.text();
    const data = JSON.parse(text);
    const period = data.fp || '000000';
    const currentFY = getFY(period);
    if (globalFY === null) globalFY = currentFY;
    else if (globalFY !== currentFY && currentFY !== 'Unknown') throw new Error(`CRITICAL ERROR: Data spans multiple Financial Years (${globalFY} vs ${currentFY}). Please upload files for a single FY only.`);
    parsedFiles.push(data);
  }

  let gstins = [];
  parsedFiles.forEach(data => {
    (data.b2b || []).forEach(party => { if (party.ctin) gstins.push(String(party.ctin).trim().toUpperCase()); });
    (data.b2ba || []).forEach(party => { if (party.ctin) gstins.push(String(party.ctin).trim().toUpperCase()); });
    (data.cdnr || []).forEach(party => { if (party.ctin) gstins.push(String(party.ctin).trim().toUpperCase()); });
    (data.cdnra || []).forEach(party => { if (party.ctin) gstins.push(String(party.ctin).trim().toUpperCase()); });
  });

  try {
    nameMap = await fetchNameMapForGSTINs(gstins);
  } catch (e) {
    console.warn('Name fetch skipped', e.message);
  }

  for (const data of parsedFiles) {
    const period = data.fp || '000000';
    const currentFY = getFY(period);
    const monthLabel = formatMonthLabel(period);
    ensureMonthBucket(monthLabel);

    (data.b2b || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, '', '');
      (party.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDate(inv.idt, period);
        const isRCM = String(inv.rchrg || party.rchrg || 'N').toUpperCase() === 'Y';
        const typeLabel = isRCM ? 'B2B RCM' : 'B2B';
        const row = { Month: monthLabel, FY: currentFY, Period: period, Type: typeLabel, PartyName: toCaps(partyName), GSTIN: String(party.ctin || '').trim().toUpperCase(), Invoice: inv.inum || 'UNKNOWN', DisplayDate: dates.display, TallyDate: dates.tally, Taxable: round2(totals.tx), IGST: round2(totals.ig), CGST: round2(totals.cg), SGST: round2(totals.sg), Cess: round2(totals.cess), Total: round2(num(inv.val) || totals.tx + totals.ig + totals.cg + totals.sg + totals.cess), SourceSection: isRCM ? '4B' : '4A' };
        globalDataByMonth[monthLabel].B2B_RCM.push(row);
        pushAllBill(monthLabel, row);
      });
    });

    (data.b2cl || data.b2bl || []).forEach(item => {
      const pos = item.pos || 'Unknown';
      const partyName = `B2C LARGE - ${toCaps(pos)}`;
      (item.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDate(inv.idt, period);
        const row = { Month: monthLabel, FY: currentFY, Period: period, Type: 'B2C Large', PartyName: partyName, GSTIN: 'URP', Invoice: inv.inum || 'UNKNOWN', DisplayDate: dates.display, TallyDate: dates.tally, Taxable: round2(totals.tx), IGST: round2(totals.ig), CGST: round2(totals.cg), SGST: round2(totals.sg), Cess: round2(totals.cess), Total: round2(num(inv.val) || totals.tx + totals.ig + totals.cg + totals.sg + totals.cess), POS: pos, SourceSection: '5' };
        globalDataByMonth[monthLabel].B2CL.push(row);
        pushAllBill(monthLabel, row);
      });
    });

    (data.b2cs || []).forEach((b2cs, idx) => {
      const pos = b2cs.pos || 'Unknown';
      const dates = getLastDayOfPeriod(period);
      const tx = round2(num(b2cs.txval));
      const ig = round2(num(b2cs.iamt));
      const cg = round2(num(b2cs.camt));
      const sg = round2(num(b2cs.samt));
      const cess = round2(num(b2cs.csamt));
      const row = { Month: monthLabel, FY: currentFY, Period: period, Type: 'B2C Small', PartyName: `B2C SMALL - ${toCaps(pos)}`, GSTIN: 'URP', Invoice: `B2CS-${pos}-${period}-${idx + 1}`, DisplayDate: dates.display, TallyDate: dates.tally, Taxable: tx, IGST: ig, CGST: cg, SGST: sg, Cess: cess, Total: round2(tx + ig + cg + sg + cess), POS: pos, Rate: num(b2cs.rt), SourceSection: '7' };
      globalDataByMonth[monthLabel].B2CS.push(row);
      pushAllBill(monthLabel, row);
    });

    (data.cdnr || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, '', '');
      (party.nt || []).forEach(note => {
        const totals = sumInvoiceItems(note);
        const dates = formatDate(note.ndt || note.idt, period);
        const noteType = String(note.ntty || note.typ || 'C').toUpperCase();
        const displayType = noteType === 'D' ? 'Debit Note' : 'Credit Note';
        const row = { Month: monthLabel, FY: currentFY, Period: period, Type: displayType, PartyName: toCaps(partyName), GSTIN: String(party.ctin || '').trim().toUpperCase(), Invoice: note.nt_num || note.ntnum || note.inum || 'UNKNOWN', RefInvoice: note.inum || '', DisplayDate: dates.display, TallyDate: dates.tally, Taxable: round2(totals.tx), IGST: round2(totals.ig), CGST: round2(totals.cg), SGST: round2(totals.sg), Cess: round2(totals.cess), Total: round2(num(note.val || note.ntval) || totals.tx + totals.ig + totals.cg + totals.sg + totals.cess), NoteNature: displayType, SourceSection: '9B-CDNR' };
        globalDataByMonth[monthLabel].CDN.push(row);
      });
    });

    (data.b2ba || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, '', '');
      (party.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDate(inv.idt, period);
        globalDataByMonth[monthLabel].AMENDMENTS.push({ Month: monthLabel, FY: currentFY, Period: period, Type: 'B2B Amendment', PartyName: toCaps(partyName), GSTIN: String(party.ctin || '').trim().toUpperCase(), Invoice: inv.inum || 'UNKNOWN', OriginalInvoice: inv.oinum || '', DisplayDate: dates.display, TallyDate: dates.tally, Taxable: round2(totals.tx), IGST: round2(totals.ig), CGST: round2(totals.cg), SGST: round2(totals.sg), Cess: round2(totals.cess), Total: round2(num(inv.val) || totals.tx + totals.ig + totals.cg + totals.sg + totals.cess), SourceSection: '9A-B2BA' });
      });
    });

    (data.b2cla || []).forEach(item => {
      const pos = item.pos || 'Unknown';
      (item.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDate(inv.idt, period);
        globalDataByMonth[monthLabel].AMENDMENTS.push({ Month: monthLabel, FY: currentFY, Period: period, Type: 'B2CL Amendment', PartyName: `B2C LARGE - ${toCaps(pos)}`, GSTIN: 'URP', Invoice: inv.inum || 'UNKNOWN', OriginalInvoice: inv.oinum || '', DisplayDate: dates.display, TallyDate: dates.tally, Taxable: round2(totals.tx), IGST: round2(totals.ig), CGST: round2(totals.cg), SGST: round2(totals.sg), Cess: round2(totals.cess), Total: round2(num(inv.val) || totals.tx + totals.ig + totals.cg + totals.sg + totals.cess), POS: pos, SourceSection: '9A-B2CLA' });
      });
    });

    (data.b2csa || []).forEach((item, idx) => {
      const pos = item.pos || 'Unknown';
      const dates = getLastDayOfPeriod(period);
      globalDataByMonth[monthLabel].AMENDMENTS.push({ Month: monthLabel, FY: currentFY, Period: period, Type: 'B2CS Amendment', PartyName: `B2C SMALL - ${toCaps(pos)}`, GSTIN: 'URP', Invoice: `B2CSA-${pos}-${period}-${idx + 1}`, OriginalInvoice: item.omon || '', DisplayDate: dates.display, TallyDate: dates.tally, Taxable: round2(num(item.txval)), IGST: round2(num(item.iamt)), CGST: round2(num(item.camt)), SGST: round2(num(item.samt)), Cess: round2(num(item.csamt)), Total: round2(num(item.txval) + num(item.iamt) + num(item.camt) + num(item.samt) + num(item.csamt)), POS: pos, SourceSection: '10-B2CSA' });
    });

    (data.cdnra || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, '', '');
      (party.nt || []).forEach(note => {
        const totals = sumInvoiceItems(note);
        const dates = formatDate(note.ndt || note.idt, period);
        const noteType = String(note.ntty || note.typ || 'C').toUpperCase();
        const displayType = noteType === 'D' ? 'Debit Note Amendment' : 'Credit Note Amendment';
        globalDataByMonth[monthLabel].AMENDMENTS.push({ Month: monthLabel, FY: currentFY, Period: period, Type: displayType, PartyName: toCaps(partyName), GSTIN: String(party.ctin || '').trim().toUpperCase(), Invoice: note.nt_num || note.ntnum || note.inum || 'UNKNOWN', OriginalInvoice: note.ont_num || note.oinum || '', DisplayDate: dates.display, TallyDate: dates.tally, Taxable: round2(totals.tx), IGST: round2(totals.ig), CGST: round2(totals.cg), SGST: round2(totals.sg), Cess: round2(totals.cess), Total: round2(num(note.val || note.ntval) || totals.tx + totals.ig + totals.cg + totals.sg + totals.cess), SourceSection: '9C-CDNRA' });
      });
    });

    const hsnRows = normalizeHSNRows(data.hsn || data.hsn_sc || data.hsnsum || data.hsnData || data, period, monthLabel, currentFY);
    globalDataByMonth[monthLabel].HSN.push(...hsnRows);
  }

  updateMissingBox();
}

function getAllRowsForReport(reportKey) {
  const months = Object.keys(globalDataByMonth).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out = [];
  months.forEach(month => {
    const bucket = globalDataByMonth[month];
    if (bucket && bucket[reportKey]) out.push(...bucket[reportKey]);
  });
  return out;
}

function getRowsForCurrentSelection() {
  const selectedMonth = $('monthSelector').value;
  const selectedReport = $('reportSelector').value;
  if (selectedReport === 'HSN') {
    const rows = selectedMonth === 'CONSOLIDATED'
      ? getAllRowsForReport('HSN')
      : (globalDataByMonth[selectedMonth]?.HSN || []);
    return aggregateHSNRows(rows);
  }
  if (selectedMonth === 'CONSOLIDATED') return getAllRowsForReport(selectedReport);
  return globalDataByMonth[selectedMonth]?.[selectedReport] || [];
}

function clearTable() {
  $('tableHead').innerHTML = '';
  $('tableBody').innerHTML = '';
  $('tableFooter').innerHTML = '';
}

function createHeadRow(columns) {
  const tr = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    tr.appendChild(th);
  });
  $('tableHead').appendChild(tr);
}

function appendBodyRow(values) {
  const tr = document.createElement('tr');
  values.forEach(val => {
    const td = document.createElement('td');
    td.textContent = val == null ? '' : String(val);
    tr.appendChild(td);
  });
  $('tableBody').appendChild(tr);
}

function createFooterRow(values) {
  const tr = document.createElement('tr');
  values.forEach(val => {
    const td = document.createElement('td');
    td.textContent = val == null ? '' : String(val);
    tr.appendChild(td);
  });
  $('tableFooter').appendChild(tr);
}

function updateDropdown() {
  const monthSelector = $('monthSelector');
  monthSelector.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = 'CONSOLIDATED';
  opt.textContent = 'Consolidated Whole FY';
  monthSelector.appendChild(opt);

  const months = Object.keys(globalDataByMonth).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  months.forEach(month => {
    const o = document.createElement('option');
    o.value = month;
    o.textContent = month;
    monthSelector.appendChild(o);
  });

  monthSelector.value = 'CONSOLIDATED';
}

function renderSummaryReport(reportKey) {
  clearTable();
  createHeadRow(['Month', 'Count', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total']);
  const months = $('monthSelector').value === 'CONSOLIDATED' ? Object.keys(globalDataByMonth).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [$('monthSelector').value];

  let grandCount = 0, grandTax = 0, grandIg = 0, grandCg = 0, grandSg = 0, grandTotal = 0;
  months.forEach(month => {
    const bucketRows = globalDataByMonth[month]?.[reportKey] || [];
    const count = bucketRows.length;
    let tax = 0, ig = 0, cg = 0, sg = 0, total = 0;
    bucketRows.forEach(r => {
      tax += num(r.Taxable || r.TaxableValue || 0);
      ig += num(r.IGST || 0);
      cg += num(r.CGST || 0);
      sg += num(r.SGST || 0);
      total += num(r.Total || 0);
    });
    grandCount += count; grandTax += tax; grandIg += ig; grandCg += cg; grandSg += sg; grandTotal += total;
    appendBodyRow([month, count, round2(tax).toFixed(2), round2(ig).toFixed(2), round2(cg).toFixed(2), round2(sg).toFixed(2), round2(total).toFixed(2)]);
  });
  createFooterRow(['TOTAL', grandCount, round2(grandTax).toFixed(2), round2(grandIg).toFixed(2), round2(grandCg).toFixed(2), round2(grandSg).toFixed(2), round2(grandTotal).toFixed(2)]);
}

function renderBillsTable(rows) {
  clearTable();
  createHeadRow(['Month', 'Type', 'Invoice', 'Date', 'Party Name', 'GSTIN', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total']);
  let tax = 0, ig = 0, cg = 0, sg = 0, total = 0;
  rows.forEach(r => {
    tax += num(r.Taxable || 0);
    ig += num(r.IGST || 0);
    cg += num(r.CGST || 0);
    sg += num(r.SGST || 0);
    total += num(r.Total || 0);
    appendBodyRow([r.Month, r.Type, r.Invoice, r.DisplayDate, r.PartyName, r.GSTIN, round2(r.Taxable).toFixed(2), round2(r.IGST).toFixed(2), round2(r.CGST).toFixed(2), round2(r.SGST).toFixed(2), round2(r.Total).toFixed(2)]);
  });
  createFooterRow(['TOTAL', '', '', '', '', '', round2(tax).toFixed(2), round2(ig).toFixed(2), round2(cg).toFixed(2), round2(sg).toFixed(2), round2(total).toFixed(2)]);
}

function renderHSNTable(rows) {
  clearTable();
  createHeadRow(['HSN', 'Description', 'Taxable Value', 'IGST', 'CGST', 'SGST']);
  let tax = 0, ig = 0, cg = 0, sg = 0;
  rows.forEach(r => {
    tax += num(r.TaxableValue || 0);
    ig += num(r.IGST || 0);
    cg += num(r.CGST || 0);
    sg += num(r.SGST || 0);
    appendBodyRow([r.HSN, r.Description, round2(r.TaxableValue).toFixed(2), round2(r.IGST).toFixed(2), round2(r.CGST).toFixed(2), round2(r.SGST).toFixed(2)]);
  });
  createFooterRow(['TOTAL', '', round2(tax).toFixed(2), round2(ig).toFixed(2), round2(cg).toFixed(2), round2(sg).toFixed(2)]);
}

function renderView() {
  const selectedReport = $('reportSelector').value;
  const rows = getRowsForCurrentSelection();
  $('reportMeta').textContent = `FY ${globalFY || 'Unknown'} - Month ${$('monthSelector').value} - Report ${selectedReport} - Rows ${rows.length}`;
  if (selectedReport === 'HSN') return renderHSNTable(rows);
  if (selectedReport === 'ALL_BILLS') return renderBillsTable(rows);
  renderSummaryReport(selectedReport);
}

function buildExcelRows(reportKey, rows) {
  if (reportKey === 'HSN') return rows.map(r => ({ HSN: r.HSN, Description: r.Description, TaxableValue: r.TaxableValue, IGST: r.IGST, CGST: r.CGST, SGST: r.SGST }));
  if (reportKey === 'ALL_BILLS') return rows.map(r => ({ Month: r.Month, Type: r.Type, InvoiceNo: r.Invoice, Date: r.DisplayDate, PartyName: r.PartyName, GSTIN: r.GSTIN, Taxable: r.Taxable, IGST: r.IGST, CGST: r.CGST, SGST: r.SGST, Cess: r.Cess, Total: r.Total, Section: r.SourceSection }));
  return rows.map(r => ({ Month: r.Month, Type: r.Type, InvoiceNo: r.Invoice, OriginalInvoice: r.OriginalInvoice || '', RefInvoice: r.RefInvoice || '', Date: r.DisplayDate || '', PartyName: r.PartyName || '', GSTIN: r.GSTIN || '', Taxable: r.Taxable || r.TaxableValue || 0, IGST: r.IGST || 0, CGST: r.CGST || 0, SGST: r.SGST || 0, Cess: r.Cess || 0, Total: r.Total || 0, Section: r.SourceSection || '' }));
}

function generateTallyXML() {
  const billRows = $('monthSelector').value === 'CONSOLIDATED'
    ? getAllRowsForReport('ALL_BILLS')
    : (globalDataByMonth[$('monthSelector').value]?.ALL_BILLS || []);
  const cdnRows = $('monthSelector').value === 'CONSOLIDATED'
    ? getAllRowsForReport('CDN')
    : (globalDataByMonth[$('monthSelector').value]?.CDN || []);

  const salesRows = billRows.filter(r => ['B2B', 'B2B RCM', 'B2C Large', 'B2C Small'].includes(r.Type));
  const transactions = [...salesRows, ...cdnRows];

  const uniqueLedgers = new Map();
  const allLedgerNames = new Set(['SALES ACCOUNT', 'PURCHASE ACCOUNT', 'ROUND OFF ALC', 'OUTPUT ADJUSTMENT ALC', 'WRONG TAX']);

  transactions.forEach(t => {
    const partyName = toCaps(t.PartyName);
    if (!uniqueLedgers.has(partyName)) uniqueLedgers.set(partyName, t.GSTIN);
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER><BODY><DATA>';

  allLedgerNames.forEach(name => {
    let parent = 'Duties & Taxes';
    if (name === 'SALES ACCOUNT') parent = 'Sales Accounts';
    if (name === 'PURCHASE ACCOUNT') parent = 'Purchase Accounts';
    xml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST TYPE="String"><NAME>${esc(name)}</NAME></NAME.LIST><PARENT>${esc(parent)}</PARENT><ISBILLWISEON>Yes</ISBILLWISEON></LEDGER></TALLYMESSAGE>`;
  });

  uniqueLedgers.forEach((gstin, name) => {
    xml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(toCaps(name))}" ACTION="Create"><NAME.LIST TYPE="String"><NAME>${esc(toCaps(name))}</NAME></NAME.LIST><PARENT>Sundry Debtors</PARENT>${gstin && gstin !== 'URP' ? `<PARTYGSTIN>${esc(gstin)}</PARTYGSTIN>` : ''}<ISBILLWISEON>Yes</ISBILLWISEON></LEDGER></TALLYMESSAGE>`;
  });

  xml += '</DATA></BODY></ENVELOPE>';
  return xml;
}

async function handleFiles(files) {
  try {
    $('errorMsg').textContent = '';
    $('loadingIndicator').style.display = 'block';
    $('results').style.display = 'none';
    $('controlsBar').style.display = 'none';

    const jsonFiles = Array.from(files || []).filter(f => f.name.toLowerCase().endsWith('.json'));
    if (!jsonFiles.length) throw new Error('Please upload valid JSON files.');

    await processGSTR1Files(jsonFiles);

    if (!Object.keys(globalDataByMonth).length) throw new Error('No valid data found in the files.');

    updateDropdown();
    renderView();
    $('controlsBar').style.display = 'flex';
    $('results').style.display = 'block';
  } catch (err) {
    console.error(err);
    $('errorMsg').textContent = err.message || 'Error while processing files.';
  } finally {
    $('loadingIndicator').style.display = 'none';
  }
}

function bindUploadZone() {
  const dropZone = $('dropZone');
  const fileInput = $('fileInput');

  dropZone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'dragend'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (files?.length) await handleFiles(files);
  });

  fileInput.addEventListener('change', async e => {
    const files = e.target.files;
    if (files?.length) await handleFiles(files);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const monthSelector = $('monthSelector');
  const reportSelector = $('reportSelector');

  monthSelector.addEventListener('change', renderView);
  reportSelector.addEventListener('change', renderView);

  $('btnRefreshNames').addEventListener('click', async () => {
    try { await refreshNamesFromDB(); alert('Names refreshed successfully.'); } catch (err) { alert(err.message); }
  });

  $('btnCopyMissing').addEventListener('click', async () => {
    const missing = getMissingGSTINs();
    if (!missing.length) return alert('No missing GSTINs found.');
    await navigator.clipboard.writeText(missing.join('\n'));
    alert('Missing GSTINs copied.');
  });

  $('btnDownloadMissingExcel').addEventListener('click', () => {
    const missing = getMissingGSTINs();
    if (!missing.length) return alert('No missing GSTINs found.');
    const ws = XLSX.utils.json_to_sheet(missing.map(g => ({ GSTIN: g })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Missing GSTINs');
    XLSX.writeFile(wb, 'Missing_GSTINs.xlsx');
  });

  $('btnImportNames').addEventListener('click', () => $('importNamesInput').click());
  $('importNamesInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try { await importNamesFile(file); alert('GST names imported successfully.'); } catch (err) { alert(err.message); } finally { e.target.value = ''; }
  });

  $('btnSavePastedNames').addEventListener('click', async () => {
    try { await savePastedNames(); alert('GST names saved successfully.'); } catch (err) { alert(err.message); }
  });

  $('btnUnifiedXML').addEventListener('click', () => {
    const fileName = $('monthSelector').value === 'CONSOLIDATED'
      ? `TALLY_IMPORT_CONSOLIDATED_FY_${globalFY || 'UNKNOWN'}.XML`
      : `TALLY_IMPORT_${$('monthSelector').value.replace(/\s+/g, '_').toUpperCase()}.XML`;
    const xmlString = generateTallyXML();
    const blob = new Blob([xmlString], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('btnExcel').addEventListener('click', () => {
    const selectedReport = $('reportSelector').value;
    const rows = getRowsForCurrentSelection();
    if (!rows.length) return alert('No data available for this report.');
    const dataToExport = buildExcelRows(selectedReport, rows);
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedReport);
    const fileLabel = $('monthSelector').value === 'CONSOLIDATED'
      ? `${selectedReport}_FY_${globalFY || 'UNKNOWN'}.xlsx`
      : `${selectedReport}_${$('monthSelector').value.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileLabel);
  });

  $('btnFullBillsExcel').addEventListener('click', () => {
    const rows = $('monthSelector').value === 'CONSOLIDATED'
      ? getAllRowsForReport('ALL_BILLS')
      : (globalDataByMonth[$('monthSelector').value]?.ALL_BILLS || []);
    if (!rows.length) return alert('No full bills data available.');
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Month: r.Month, FY: r.FY, Period: r.Period, Type: r.Type, InvoiceNo: r.Invoice, Date: r.DisplayDate, TallyDate: r.TallyDate, PartyName: r.PartyName, GSTIN: r.GSTIN, Taxable: r.Taxable, IGST: r.IGST, CGST: r.CGST, SGST: r.SGST, Cess: r.Cess, Total: r.Total, Section: r.SourceSection
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Full Bills');
    const fileLabel = $('monthSelector').value === 'CONSOLIDATED'
      ? `GSTR1_Full_Bills_FY_${globalFY || 'UNKNOWN'}.xlsx`
      : `GSTR1_Full_Bills_${$('monthSelector').value.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileLabel);
  });

  $('logoutBtn').addEventListener('click', async () => {
    if (typeof supabaseClient !== 'undefined') await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });

  bindUploadZone();
  await loadUserInfo();
});