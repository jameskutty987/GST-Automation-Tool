// IDs from gstr3b.html:
// g3ReturnType, g3Files, g3Report, g3Process, g3Reset, g3Excel, g3Message, g3Tags, g3TableWrap

const $ = id => document.getElementById(id);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = n => +(Number(n || 0).toFixed(2));
const fmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = v => String(v ?? '').replace(/[<>&'"]/g, ch => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' }[ch]));

function setMsg(msg) { $('g3Message').textContent = Array.isArray(msg) ? msg.join('\n') : msg; }

function formatMonthLabel(p) {
  if (!p || p.length !== 6) return p || 'Unknown';
  const m = +p.slice(0,2), y = +p.slice(2);
  return new Date(y, m-1, 1).toLocaleString('en-US', { month:'long', year:'numeric' });
}

function getFY(p) {
  if (!p || p.length !== 6) return 'Unknown';
  const m = +p.slice(0,2), y = +p.slice(2);
  return m <= 3 ? `${y-1}-${y}` : `${y}-${y+1}`;
}

// ── GSTR3BEngine — exact port of app.py ──────────────────────────────────────
function extractAllSections(data) {
  const period = String(data.ret_period || data.fp || '').trim();
  const month  = formatMonthLabel(period);

  const sup       = data.sup_details     || {};
  const osup      = sup.osup_det         || {};
  const isup_rev  = sup.isup_rev         || {};
  const osup_zero = sup.osup_zero        || {};
  const osup_nil  = sup.osup_nil_exmp    || {};
  const osup_non  = sup.osup_nongst      || {};

  const sec95    = data.sec95_details || {};
  const eco_dtls = data.eco_dtls      || {};
  const eco_det  = sec95.eco_det  || eco_dtls.eco_sup     || {};
  const reg_det  = sec95.reg_det  || eco_dtls.eco_reg_sup || {};

  const inter  = data.inter_sup || {};
  const si = list => ({
    txval: (list || []).reduce((s, x) => s + num(x.txval), 0),
    iamt:  (list || []).reduce((s, x) => s + num(x.iamt),  0)
  });
  const u  = si(inter.unreg_details);
  const c  = si(inter.comp_details);
  const ui = si(inter.uin_details);

  const itc_elg = data.itc_elg || {};
  const itc_avl = itc_elg.itc_avl  || [];
  const rc_itc  = itc_avl.find(x => x.ty === 'ISRC') || {};
  const oth_itc = itc_avl.find(x => x.ty === 'OTH')  || {};
  const itc_inelg = (itc_elg.itc_inelg || []).find(x => x.ty === 'RUL') || {};
  const itc_rev   = (itc_elg.itc_rev   || []).find(x => x.ty === 'RUL') || {};
  const itc_net   = itc_elg.itc_net || {};

  const intr_det = (data.intr_details || {}).intr_amt
                || (data.intr_ltfee  || {}).intr_details || {};
  const lt_fee   = (data.in_lt_fee   || {}).lt_fee
                || (data.intr_ltfee  || {}).ltfee_details || {};

  const tax_pd  = ((data.taxpayble || {}).returnsDbCdredList || {}).tax_paid || {};
  const pd_itc  = tax_pd.pd_by_itc  || [];
  const pd_cash = tax_pd.pd_by_cash || [];
  const sumItc  = f  => pd_itc.reduce((s, r) => s + num(r[f]), 0);
  const sumCash = (head, f) => pd_cash.reduce((s, r) => s + num((r[head.toLowerCase()] || {})[f]), 0);

  return {
    period, month,
    '3.1 Outward supplies and RCM': {
      Month: month,
      'Taxable Value': num(osup.txval), 'IGST': num(osup.iamt), 'CGST': num(osup.camt), 'SGST/UTGST': num(osup.samt), 'Cess': num(osup.csamt),
      'RCM Taxable': num(isup_rev.txval), 'RCM CGST': num(isup_rev.camt), 'RCM SGST': num(isup_rev.samt),
      'Zero Taxable': num(osup_zero.txval), 'Zero IGST': num(osup_zero.iamt), 'Zero CGST': num(osup_zero.camt), 'Zero SGST': num(osup_zero.samt), 'Zero Cess': num(osup_zero.csamt),
      'Nil Taxable': num(osup_nil.txval), 'Nil IGST': num(osup_nil.iamt), 'Nil CGST': num(osup_nil.camt), 'Nil SGST': num(osup_nil.samt), 'Nil Cess': num(osup_nil.csamt),
      'Non-GST Taxable': num(osup_non.txval), 'Non-GST IGST': num(osup_non.iamt), 'Non-GST CGST': num(osup_non.camt), 'Non-GST SGST': num(osup_non.samt), 'Non-GST Cess': num(osup_non.csamt)
    },
    '3.1.1 Section 9(5)': {
      Month: month,
      'ECO Pays Taxable': num(eco_det.txval), 'ECO Pays IGST': num(eco_det.iamt), 'ECO Pays CGST': num(eco_det.camt), 'ECO Pays SGST': num(eco_det.samt), 'ECO Pays Cess': num(eco_det.csamt),
      'Through ECO Taxable': num(reg_det.txval), 'Through ECO IGST': num(reg_det.iamt), 'Through ECO CGST': num(reg_det.camt), 'Through ECO SGST': num(reg_det.samt), 'Through ECO Cess': num(reg_det.csamt)
    },
    '3.2 Inter-state supplies': {
      Month: month,
      'Unreg Taxable': u.txval, 'Unreg IGST': u.iamt,
      'Comp Taxable': c.txval, 'Comp IGST': c.iamt,
      'UIN Taxable': ui.txval, 'UIN IGST': ui.iamt
    },
    '4. Eligible ITC': {
      Month: month,
      'RC_IGST': num(rc_itc.iamt), 'RC_CGST': num(rc_itc.camt), 'RC_SGST': num(rc_itc.samt),
      'OTH_IGST': num(oth_itc.iamt), 'OTH_CGST': num(oth_itc.camt), 'OTH_SGST': num(oth_itc.samt),
      'INELG_IGST': num(itc_inelg.iamt), 'INELG_CGST': num(itc_inelg.camt), 'INELG_SGST': num(itc_inelg.samt),
      'REV_IGST': num(itc_rev.iamt), 'REV_CGST': num(itc_rev.camt), 'REV_SGST': num(itc_rev.samt),
      'NET_IGST': num(itc_net.iamt), 'NET_CGST': num(itc_net.camt), 'NET_SGST': num(itc_net.samt)
    },
    '5.1 Interest and Late fee': {
      Month: month,
      'Sys_IGST': num(intr_det.iamt), 'Sys_CGST': num(intr_det.camt), 'Sys_SGST': num(intr_det.samt),
      'Paid_IGST': sumCash('igst','intr'), 'Paid_CGST': sumCash('cgst','intr'), 'Paid_SGST': sumCash('sgst','intr'),
      'LF_IGST': sumCash('igst','fee'), 'LF_CGST': sumCash('cgst','fee'), 'LF_SGST': sumCash('sgst','fee')
    },
    '6.1 Payment of tax': {
      Month: month,
      'I_O': num(osup.iamt), 'I_R': num(isup_rev.iamt), 'I_L': round2(num(osup.iamt)+num(isup_rev.iamt)),
      'I_I_U': sumItc('igst_igst_amt'), 'I_C_U': sumItc('igst_cgst_amt'), 'I_S_U': sumItc('igst_sgst_amt'),
      'I_CP': sumCash('igst','tx'), 'I_IN': sumCash('igst','intr'), 'I_LF': sumCash('igst','fee'),
      'C_O': num(osup.camt), 'C_R': num(isup_rev.camt), 'C_L': round2(num(osup.camt)+num(isup_rev.camt)),
      'C_C_U': sumItc('cgst_cgst_amt'), 'C_I_U': sumItc('cgst_igst_amt'),
      'C_CP': sumCash('cgst','tx'), 'C_IN': sumCash('cgst','intr'), 'C_LF': sumCash('cgst','fee'),
      'S_O': num(osup.samt), 'S_R': num(isup_rev.samt), 'S_L': round2(num(osup.samt)+num(isup_rev.samt)),
      'S_S_U': sumItc('sgst_sgst_amt'), 'S_I_U': sumItc('sgst_igst_amt'),
      'S_CP': sumCash('sgst','tx'), 'S_IN': sumCash('sgst','intr'), 'S_LF': sumCash('sgst','fee')
    }
  };
}

// ── State ─────────────────────────────────────────────────────────────────────
let g3Data   = [];   // array of extracted section objects
let g3FY     = null;

const REPORT_OPTIONS = {
  'GSTR-3B': [
    '3.1 Outward supplies and RCM',
    '3.1.1 Section 9(5)',
    '3.2 Inter-state supplies',
    '4. Eligible ITC',
    '5.1 Interest and Late fee',
    '6.1 Payment of tax'
  ]
};

function sortByPeriod(arr) {
  return arr.slice().sort((a, b) => {
    const d = p => new Date(+p.slice(2), +p.slice(0,2)-1, 1);
    return d(a.period) - d(b.period);
  });
}

// ── Populate report dropdown ──────────────────────────────────────────────────
function populateReports() {
  const type = $('g3ReturnType').value;
  const opts = REPORT_OPTIONS[type] || [];
  $('g3Report').innerHTML = opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
}

// ── Render table ──────────────────────────────────────────────────────────────
function renderTable() {
  if (!g3Data.length) return;
  const reportKey = $('g3Report').value;
  const sorted = sortByPeriod(g3Data);

  const rows = sorted.map(d => d[reportKey]).filter(Boolean);
  if (!rows.length) {
    $('g3TableWrap').innerHTML = '<p style="color:var(--muted,#888);padding:16px">No data for this report.</p>';
    return;
  }

  const cols = Object.keys(rows[0]);

  // totals row
  const totals = {};
  cols.forEach(col => {
    if (col === 'Month') { totals[col] = 'TOTAL'; return; }
    totals[col] = round2(rows.reduce((s, r) => s + num(r[col]), 0));
  });

  let html = `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:rgba(88,166,255,.12)">
      ${cols.map(c => `<th style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap;text-align:${c==='Month'?'left':'right'}">${esc(c)}</th>`).join('')}
    </tr></thead>
    <tbody>`;

  rows.forEach(r => {
    html += `<tr>
      ${cols.map(c => `<td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.05);text-align:${c==='Month'?'left':'right'};white-space:nowrap">
        ${c === 'Month' ? esc(r[c]) : fmt(r[c])}
      </td>`).join('')}
    </tr>`;
  });

  // totals footer
  html += `<tr style="font-weight:700;background:rgba(88,166,255,.08)">
    ${cols.map(c => `<td style="padding:10px 12px;border-top:2px solid rgba(88,166,255,.3);text-align:${c==='Month'?'left':'right'};white-space:nowrap">
      ${c === 'Month' ? 'TOTAL' : fmt(totals[c])}
    </td>`).join('')}
  </tr>`;

  html += `</tbody></table>`;
  $('g3TableWrap').innerHTML = `<div style="overflow-x:auto;max-height:65vh;overflow-y:auto">${html}</div>`;

  // tags
  $('g3Tags').innerHTML = [
    `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(88,166,255,.12);font-size:12px;margin:4px">FY ${esc(g3FY || 'Unknown')}</span>`,
    `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(88,166,255,.12);font-size:12px;margin:4px">Periods: ${g3Data.length}</span>`,
    `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(88,166,255,.12);font-size:12px;margin:4px">${esc(reportKey)}</span>`
  ].join('');
}

// ── Process files ─────────────────────────────────────────────────────────────
async function g3Process() {
  const files = [...$('g3Files').files];
  const type  = $('g3ReturnType').value;

  if (!files.length) { alert('Please select at least one JSON file.'); return; }
  if (type !== 'GSTR-3B') { setMsg('GSTR-1 support coming soon. Please select GSTR-3B.'); return; }

  g3Data = []; g3FY = null;
  $('g3TableWrap').innerHTML = '';
  $('g3Tags').innerHTML = '';

  const notes = [];
  const seenPeriods = new Set();

  for (const file of files) {
    notes.push(`Reading ${file.name}…`);
    let json;
    try { json = JSON.parse(await file.text()); }
    catch (e) { alert(`Invalid JSON: ${file.name}`); return; }

    const data   = json.data || json;
    const period = String(data.ret_period || data.fp || '').trim();
    if (!period || period.length !== 6) { alert(`Missing ret_period in: ${file.name}`); return; }

    const fy = getFY(period);
    if (!g3FY) g3FY = fy;
    if (g3FY !== fy) { alert(`Files span multiple financial years: ${g3FY} vs ${fy}. Upload a single FY only.`); return; }

    if (seenPeriods.has(period)) {
      notes.push(`⚠️ Duplicate period ${formatMonthLabel(period)} — keeping latest.`);
      g3Data = g3Data.filter(d => d.period !== period);
    }
    seenPeriods.add(period);
    g3Data.push(extractAllSections(data));
  }

  notes.push(`✅ Processed ${files.length} file(s)`, `FY: ${g3FY}`, `Periods: ${g3Data.length}`);
  setMsg(notes);
  renderTable();
}

// ── Excel download ────────────────────────────────────────────────────────────
function g3Excel() {
  const reportKey = $('g3Report').value;
  const sorted = sortByPeriod(g3Data);
  const rows = sorted.map(d => d[reportKey]).filter(Boolean);
  if (!rows.length) { alert('No data for current report.'); return; }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, reportKey.slice(0, 31));
  XLSX.writeFile(wb, `${reportKey.replace(/[\s./()]/g,'_')}_FY${g3FY || 'Unknown'}.xlsx`);
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function g3Reset() {
  g3Data = []; g3FY = null;
  $('g3Files').value   = '';
  $('g3TableWrap').innerHTML = '';
  $('g3Tags').innerHTML      = '';
  setMsg('Choose return type, upload JSON files, and click Process files.');
}

// ── Bind events ───────────────────────────────────────────────────────────────
$('g3ReturnType').addEventListener('change', populateReports);
$('g3Report').addEventListener('change', renderTable);
$('g3Process').addEventListener('click', async () => {
  try { await g3Process(); }
  catch (err) { console.error(err); alert(err.message || 'Error'); setMsg(`Error: ${err.message}`); }
});
$('g3Reset').addEventListener('click', g3Reset);
$('g3Excel').addEventListener('click', g3Excel);

// ── Init ──────────────────────────────────────────────────────────────────────
populateReports();