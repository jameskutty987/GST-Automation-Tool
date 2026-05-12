(function () {
  const root = document.getElementById('module-gstr2b');
  if (!root) return;

  const $ = (id) => root.querySelector('#' + id) || document.getElementById(id);
  const state = { rows: [], summaryRows: [], fy: null, detectedKeys: new Set(), unknownKeys: new Set() };
  const SECTION_LABELS = {
    ALL: 'All sections', B2B: 'B2B', RCM: 'RCM', EXPORT: 'Export', CDNR: 'Credit / Debit Notes', CDNRA: 'Credit / Debit Amendments',
    B2BA: 'B2B Amendments', IMPG: 'Imports of goods', IMPGSEZ: 'Imports from SEZ', ISD: 'ISD', MISC: 'Miscellaneous'
  };

  const clean = v => String(v ?? '').trim();
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const round2 = n => +(Number(n || 0).toFixed(2));
  const fmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = v => String(v ?? '').replace(/[<>&'\"]/g, ch => ({ '<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;' }[ch]));

  function setStatus(msg, cls) { const el = $('statusBox2'); if (el) { el.textContent = msg; if (cls) el.dataset.state = cls; } }
  
  function formatMonthLabel(fp) { 
    const s = clean(fp); 
    if (s.length !== 6) return 'Unknown Month'; 
    const m = +s.slice(0,2), y = +s.slice(2); 
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); 
  }
  
  function getFY(fp) { 
    const s = clean(fp); 
    if (s.length !== 6) return 'Unknown'; 
    const m = +s.slice(0,2), y = +s.slice(2); 
    return m >= 4 ? `${y}-${y+1}` : `${y-1}-${y}`; 
  }

  function addRow(r) { state.rows.push({
    Month: r.Month || 'Unknown Month', FY: r.FY || 'Unknown', Period: r.Period || '', Section: r.Section || 'MISC', 
    Party: clean(r.Party) || 'Unknown Party', GSTIN: clean(r.GSTIN),
    Invoice: clean(r.Invoice) || 'UNKNOWN', Date: clean(r.Date), TallyDate: clean(r.TallyDate), HSN: clean(r.HSN), 
    Rate: clean(r.Rate),
    Taxable: round2(r.Taxable), IGST: round2(r.IGST), CGST: round2(r.CGST), SGST: round2(r.SGST), CESS: round2(r.CESS), 
    Total: round2(r.Total), ReverseCharge: r.ReverseCharge ? 'Y' : 'N', DocType: r.DocType || '', SourceKey: r.SourceKey || ''
  }); }

  function parseFile(json) {
    const data = json.data || json;
    const period = clean(data.rtnprd || data.fp || data.ret_period || json.rtnprd || json.fp || json.ret_period);
    if (!period || period.length !== 6) throw new Error('Missing return period.');
    
    const fy = getFY(period);
    if (!state.fy) state.fy = fy;
    
    const doc = data.docdata || json.docdata || data;
    const month = formatMonthLabel(period);
    const meta = { period, fy, month };

    // Parse B2B
    (doc.b2b || []).forEach(sup => {
      (sup.inv || []).forEach(inv => {
        addRow({
          Month: meta.month, FY: meta.fy, Period: meta.period, Section: 'B2B', Party: sup.trdnm || sup.ctin || '',
          GSTIN: sup.ctin || '', Invoice: inv.inum || '', Date: inv.dt || '', TallyDate: inv.dt || '', 
          HSN: inv.hsn || '', Rate: inv.rt || '', Taxable: num(inv.txval), IGST: num(inv.igst), CGST: num(inv.cgst), 
          SGST: num(inv.sgst), CESS: num(inv.cess), Total: num(inv.val), ReverseCharge: inv.rev === 'Y'
        });
      });
    });
    return state.rows.length;
  }

  function renderReport() {
    const wrap = $('reportTable');
    if (!wrap) return;
    const rows = state.rows;
    if (!rows.length) { wrap.innerHTML = 'No data loaded.'; return; }
    const cols = Object.keys(rows[0]);
    wrap.innerHTML = `<table class="g3-table"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${typeof r[c] === 'number' ? fmt(r[c]) : esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  async function processFiles() {
    const input = $('fileInput2');
    if (!input || !input.files.length) return;
    state.rows = [];
    for (const file of input.files) {
      const json = JSON.parse(await file.text());
      parseFile(json);
    }
    renderReport();
    setStatus(`Processed ${input.files.length} file(s).`, 'success');
  }

  $('processBtn')?.addEventListener('click', processFiles);
  $('dropzone')?.addEventListener('click', () => $('fileInput2')?.click());
})();
