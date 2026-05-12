const state = {
    rows: [],
    summaryRows: [],
    fy: null,
    detectedKeys: new Set(),
    unknownKeys: new Set(),
    lastXML: ''
  };
  
  const SECTION_LABELS = {
    ALL:'All sections',
    B2B:'B2B',
    RCM:'RCM',
    EXPORT:'Export',
    CDNR:'Credit / Debit Notes',
    CDNRA:'Credit / Debit Amendments',
    B2BA:'B2B Amendments',
    IMPG:'Imports of goods',
    IMPGSEZ:'Imports from SEZ',
    ISD:'ISD',
    MISC:'Miscellaneous'
  };
  
  const KNOWN_DOC_KEYS = ['b2b','b2ba','cdnr','cdnra','isd','impg','impgsez','ecoa','ecoma'];
  const XML_ALLOWED_IGST_RATES = [0, 5, 12, 18, 28];
  const XML_ALLOWED_HALF_RATES = [0, 2.5, 6, 9, 14];
  
  const $ = id => document.getElementById(id);
  const arr = v => Array.isArray(v) ? v : [];
  const clean = v => String(v ?? '').trim();
  const num = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = n => +(Number(n || 0).toFixed(2));
  const fmt = n => Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
  const esc = v => String(v ?? '').replace(/[<>&'\"]/g, ch => ({
    '<':'&lt;',
    '>':'&gt;',
    '&':'&amp;',
    "'":'&apos;',
    '"':'&quot;'
  }[ch]));
  
  function setStatus(msg){
    $('statusBox').textContent = Array.isArray(msg) ? msg.join('\n') : msg;
  }
  
  function formatMonthLabel(fp){
    const s = clean(fp);
    if(s.length !== 6) return 'Unknown Month';
    const m = +s.slice(0,2);
    const y = +s.slice(2);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month:'long', year:'numeric' });
  }
  
  function getFY(fp){
    const s = clean(fp);
    if(s.length !== 6) return 'Unknown';
    const m = +s.slice(0,2);
    const y = +s.slice(2);
    return m >= 4 ? `${y}-${y+1}` : `${y-1}-${y}`;
  }
  
  function lastDay(fp){
    const s = clean(fp);
    if(s.length !== 6) return { tally:'', display:'' };
    const m = +s.slice(0,2);
    const y = +s.slice(2);
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
  
    let d,m,y;
    if(p[0].length === 4){
      y = p[0];
      m = p[1];
      d = p[2];
    } else {
      d = p[0];
      m = p[1];
      y = p[2];
    }
  
    d = String(parseInt(d,10)).padStart(2,'0');
    m = String(parseInt(m,10)).padStart(2,'0');
    y = String(y).length === 2 ? `20${y}` : String(y);
  
    const dt = new Date(`${y}-${m}-${d}T00:00:00`);
    if(isNaN(dt.getTime())) return fallback;
  
    return {
      tally:`${y}${m}${d}`,
      display:`${d}-${m}-${y}`
    };
  }
  
  function computedWholeRate(taxable, igst, cgst, sgst){
    const tx = num(taxable);
    if(tx <= 0) return '';
    const totalTax = num(igst) + num(cgst) + num(sgst);
    return String(Math.round((totalTax / tx) * 100));
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
  
    const finalTaxable = round2(taxable);
    const finalIgst = round2(igst);
    const finalCgst = round2(cgst);
    const finalSgst = round2(sgst);
  
    return {
      taxable:finalTaxable,
      igst:finalIgst,
      cgst:finalCgst,
      sgst:finalSgst,
      cess:round2(cess),
      hsn:[...hsns].join(', '),
      rate:computedWholeRate(finalTaxable, finalIgst, finalCgst, finalSgst)
    };
  }
  
  function addRow(r){
    const taxable = round2(r.Taxable);
    const igst = round2(r.IGST);
    const cgst = round2(r.CGST);
    const sgst = round2(r.SGST);
  
    state.rows.push({
      Month:r.Month || 'Unknown Month',
      FY:r.FY || 'Unknown',
      Period:r.Period || '',
      Section:r.Section || 'MISC',
      Party:clean(r.Party) || 'Unknown Party',
      GSTIN:clean(r.GSTIN),
      Invoice:clean(r.Invoice) || 'UNKNOWN',
      Date:clean(r.Date),
      TallyDate:clean(r.TallyDate),
      HSN:clean(r.HSN),
      Rate:clean(r.Rate || computedWholeRate(taxable, igst, cgst, sgst)),
      Taxable:taxable,
      IGST:igst,
      CGST:cgst,
      SGST:sgst,
      CESS:round2(r.CESS),
      Total:round2(r.Total),
      ReverseCharge:r.ReverseCharge ? 'Y' : 'N',
      DocType:r.DocType || '',
      SourceKey:r.SourceKey || '',
      Notes:r.Notes || ''
    });
  }
  
  function parseB2B(list, meta){
    arr(list).forEach(sup=>{
      arr(sup.inv || sup.invoices).forEach(inv=>{
        const a = aggItems(inv.items || inv.itms || [], inv);
        const d = normDate(inv.dt || inv.idt, meta.period);
        const typ = clean(inv.typ).toUpperCase();
  
        const sec = clean(inv.rev) === 'Y'
          ? 'RCM'
          : (typ.includes('SEWP') || typ.includes('EXP') ? 'EXPORT' : 'B2B');
  
        const taxable = num(inv.txval || a.taxable);
        const igst = num(inv.igst || inv.iamt || a.igst);
        const cgst = num(inv.cgst || inv.camt || a.cgst);
        const sgst = num(inv.sgst || inv.samt || a.sgst);
  
        addRow({
          Month:meta.month,
          FY:meta.fy,
          Period:meta.period,
          Section:sec,
          Party:sup.trdnm || sup.lglNm || sup.ctin,
          GSTIN:sup.ctin || '',
          Invoice:inv.inum || '',
          Date:d.display,
          TallyDate:d.tally,
          HSN:a.hsn,
          Rate:computedWholeRate(taxable, igst, cgst, sgst),
          Taxable:taxable,
          IGST:igst,
          CGST:cgst,
          SGST:sgst,
          CESS:num(inv.cess || inv.csamt || a.cess),
          Total:num(inv.val || (a.taxable + a.igst + a.cgst + a.sgst + a.cess)),
          ReverseCharge:clean(inv.rev) === 'Y',
          DocType:clean(inv.typ || 'INV'),
          SourceKey:'b2b'
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
          Month:meta.month,
          FY:meta.fy,
          Period:meta.period,
          Section:'B2BA',
          Party:sup.trdnm || sup.lglNm || sup.ctin,
          GSTIN:sup.ctin || '',
          Invoice:inv.inum || inv.oinum || inv.oinvnum || '',
          Date:d.display,
          TallyDate:d.tally,
          HSN:a.hsn,
          Rate:computedWholeRate(taxable, igst, cgst, sgst),
          Taxable:taxable,
          IGST:igst,
          CGST:cgst,
          SGST:sgst,
          CESS:num(inv.cess || inv.csamt || a.cess),
          Total:num(inv.val || (a.taxable + a.igst + a.cgst + a.sgst + a.cess)),
          ReverseCharge:clean(inv.rev) === 'Y',
          DocType:clean(inv.typ || 'B2BA'),
          SourceKey:'b2ba'
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
        const isCredit = docTypeRaw.includes('C');
        const isDebit = docTypeRaw.includes('D');
  
        addRow({
          Month:meta.month,
          FY:meta.fy,
          Period:meta.period,
          Section:section,
          Party:sup.trdnm || sup.lglNm || sup.ctin,
          GSTIN:sup.ctin || '',
          Invoice:note.nt_num || note.inum || note.docnum || '',
          Date:d.display,
          TallyDate:d.tally,
          HSN:a.hsn,
          Rate:computedWholeRate(taxable, igst, cgst, sgst),
          Taxable:taxable,
          IGST:igst,
          CGST:cgst,
          SGST:sgst,
          CESS:num(note.cess || note.csamt || a.cess),
          Total:num(note.val || (a.taxable + a.igst + a.cgst + a.sgst + a.cess)),
          ReverseCharge:clean(note.rev) === 'Y',
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
          Month:meta.month,
          FY:meta.fy,
          Period:meta.period,
          Section:section,
          Party:entry.trdnm || entry.portCode || entry.ctin || 'Import Supplier',
          GSTIN:entry.ctin || '',
          Invoice:item.boe_num || item.inum || entry.boe_num || `IMP-${meta.period}`,
          Date:d.display,
          TallyDate:d.tally,
          HSN:inferHSN(item, det, entry),
          Rate:computedWholeRate(taxable, igst, cgst, sgst),
          Taxable:taxable,
          IGST:igst,
          CGST:cgst,
          SGST:sgst,
          CESS:num(det.cess || det.csamt || item.cess || entry.cess),
          Total:num(item.val || entry.val || (num(det.txval) + num(det.igst || det.iamt) + num(det.cgst || det.camt) + num(det.sgst || det.samt) + num(det.cess || det.csamt))),
          DocType:'IMPORT',
          SourceKey:sourceKey
        });
      });
    });
  }
  
  function parseISD(list, meta){
    arr(list).forEach(item=>{
      const d = normDate(item.docdt || item.dt, meta.period);
  
      const taxable = num(item.txval);
      const igst = num(item.igst || item.iamt);
      const cgst = num(item.cgst || item.camt);
      const sgst = num(item.sgst || item.samt);
  
      addRow({
        Month:meta.month,
        FY:meta.fy,
        Period:meta.period,
        Section:'ISD',
        Party:item.trdnm || item.ctin || 'ISD',
        GSTIN:item.ctin || '',
        Invoice:item.docnum || item.inum || 'ISD-DOC',
        Date:d.display,
        TallyDate:d.tally,
        HSN:'',
        Rate:computedWholeRate(taxable, igst, cgst, sgst),
        Taxable:taxable,
        IGST:igst,
        CGST:cgst,
        SGST:sgst,
        CESS:num(item.cess || item.csamt),
        Total:num(item.val || (num(item.txval) + num(item.igst || item.iamt) + num(item.cgst || item.camt) + num(item.sgst || item.samt) + num(item.cess || item.csamt))),
        DocType:'ISD',
        SourceKey:'isd'
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
  
        const taxable = num(entry?.txval);
        const igst = num(entry?.igst || entry?.iamt);
        const cgst = num(entry?.cgst || entry?.camt);
        const sgst = num(entry?.sgst || entry?.samt);
  
        addRow({
          Month:meta.month,
          FY:meta.fy,
          Period:meta.period,
          Section:'MISC',
          Party:clean(entry?.trdnm || entry?.ctin || 'Unknown source'),
          GSTIN:clean(entry?.ctin || ''),
          Invoice:clean(entry?.inum || entry?.docnum || `${key}-${idx+1}`),
          Date:d.display,
          TallyDate:d.tally,
          HSN:inferHSN(entry, entry?.itm_det || {}, entry),
          Rate:computedWholeRate(taxable, igst, cgst, sgst),
          Taxable:taxable,
          IGST:igst,
          CGST:cgst,
          SGST:sgst,
          CESS:num(entry?.cess || entry?.csamt),
          Total:num(entry?.val || (num(entry?.txval) + num(entry?.igst || entry?.iamt) + num(entry?.cgst || entry?.camt) + num(entry?.sgst || entry?.samt) + num(entry?.cess || entry?.csamt))),
          DocType:'MISC',
          SourceKey:key,
          Notes:`Captured from unknown docdata key: ${key}`
        });
      });
    });
  }
  
  function parseFile(json){
    const data = json.data || json;
    const period = clean(
      data.rtnprd ||
      data.fp ||
      json.rtnprd ||
      json.fp
    );
  
    if(!period || period.length !== 6){
      throw new Error('Invalid or missing return period.');
    }
  
    const fy = getFY(period);
    if(!state.fy) state.fy = fy;
    if(state.fy !== fy){
      throw new Error(`Files span multiple financial years: ${state.fy} vs ${fy}`);
    }
  
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
    if(added === 0){
      throw new Error(`No usable rows found for return period ${period}. Detected keys: ${Object.keys(doc || {}).join(', ') || 'none'}`);
    }
  }
  
  function buildSummary(){
    const map = new Map();
    state.rows.forEach(r=>{
      const key = `${r.Month}||${r.Section}`;
      if(!map.has(key)){
        map.set(key,{
          Month:r.Month,
          Section:r.Section,
          Bills:0,
          Taxable:0,
          IGST:0,
          CGST:0,
          SGST:0,
          CESS:0,
          Total:0
        });
      }
      const s = map.get(key);
      s.Bills += 1;
      s.Taxable += r.Taxable;
      s.IGST += r.IGST;
      s.CGST += r.CGST;
      s.SGST += r.SGST;
      s.CESS += r.CESS;
      s.Total += r.Total;
    });
  
    state.summaryRows = [...map.values()]
      .map(r=>({
        ...r,
        Taxable:round2(r.Taxable),
        IGST:round2(r.IGST),
        CGST:round2(r.CGST),
        SGST:round2(r.SGST),
        CESS:round2(r.CESS),
        Total:round2(r.Total)
      }))
      .sort((a,b)=>new Date(a.Month)-new Date(b.Month) || a.Section.localeCompare(b.Section));
  }
  
  function getBills(){
    const sec = $('sectionSelect').value || 'ALL';
    const month = $('monthSelect').value || 'ALL';
    const q = clean($('searchInput').value).toLowerCase();
  
    return state.rows.filter(r =>
      (sec === 'ALL' || r.Section === sec) &&
      (month === 'ALL' || r.Month === month) &&
      (!q || [r.Party,r.GSTIN,r.Invoice,r.HSN,r.Rate,r.SourceKey,r.DocType].join(' ').toLowerCase().includes(q))
    );
  }
  
  function getSummary(){
    const sec = $('sectionSelect').value || 'ALL';
    const month = $('monthSelect').value || 'ALL';
  
    return state.summaryRows.filter(r =>
      (sec === 'ALL' || r.Section === sec) &&
      (month === 'ALL' || r.Month === month)
    );
  }
  
  function renderFilters(){
    const sections = ['ALL', ...new Set(state.rows.map(r=>r.Section))].sort((a,b)=>a.localeCompare(b));
    $('sectionSelect').innerHTML = sections
      .map(s=>`<option value="${s}">${SECTION_LABELS[s] || s}</option>`)
      .join('');
  
    const months = ['ALL', ...[...new Set(state.rows.map(r=>r.Month))].sort((a,b)=>new Date(a)-new Date(b))];
    $('monthSelect').innerHTML = months
      .map(m=>`<option value="${m}">${m}</option>`)
      .join('');
  
    $('detectedChips').innerHTML = [
      `FY ${esc(state.fy || 'Unknown')}`,
      `Rows ${state.rows.length}`,
      `Keys ${state.detectedKeys.size}`,
      state.unknownKeys.size ? `Misc ${state.unknownKeys.size}` : ''
    ].join('');
  }
  
  function renderReport(){
    const view = $('viewSelect').value;
    if(view === 'summary'){
      const rows = getSummary();
      $('reportTitle').textContent = 'Summary report';
      $('reportMeta').textContent = `${rows.length} summary rows`;
      if(!rows.length){
        $('reportTable').innerHTML = '<div class="empty">No summary rows available.</div>';
        return;
      }
      const cols = ['Month','Section','Bills','Taxable','IGST','CGST','SGST','CESS','Total'];
      $('reportTable').innerHTML = `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof r[c]==='number' ? fmt(r[c]) : esc(SECTION_LABELS[r[c]] || r[c])}</td>`).join('')}</tr>`).join('')
      }</tbody></table>`;
    } else {
      const rows = getBills();
      $('reportTitle').textContent = 'Bill wise details';
      $('reportMeta').textContent = `${rows.length} detail rows`;
      if(!rows.length){
        $('reportTable').innerHTML = '<div class="empty">No bill rows available.</div>';
        return;
      }
      const cols = Object.keys(rows[0] || {});
      $('reportTable').innerHTML = `<table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof r[c]==='number' ? fmt(r[c]) : esc(r[c])}</td>`).join('')}</tr>`).join('')
      }</tbody></table>`;
    }
  }
  
  function processFiles(files){
    if(!files || !files.length){
      setStatus('Please select one or more JSON files.');
      return;
    }
  
    state.rows = [];
    state.summaryRows = [];
    state.fy = null;
    state.detectedKeys = new Set();
    state.unknownKeys = new Set();
  
    try{
      const parsed = [];
      const fySet = new Set();
      const seen = new Set();
      const duplicates = [];
  
      const chain = Array.from(files).reduce((p, file) => p.then(async () => {
        const raw = JSON.parse(await file.text());
        const period = clean(raw.ret_period || raw.fp || raw.rtnprd);
        if(!period) throw new Error(`Missing return period in ${file.name}`);
        fySet.add(getFY(period));
        if(seen.has(period)) duplicates.push(formatMonthLabel(period));
        seen.add(period);
        parsed.push({ raw, period });
      }), Promise.resolve());
  
      chain.then(() => {
        if(fySet.size > 1) throw new Error('Please upload files from a single financial year only.');
        state.fy = [...fySet][0];
        parsed.sort((a,b)=>a.period.localeCompare(b.period)).forEach(x=>parseFile(x.raw));
        buildSummary();
        renderFilters();
        renderReport();
        const dup = [...new Set(duplicates)];
        setStatus(dup.length
          ? `Processed successfully. Duplicate periods kept latest for: ${dup.join(', ')}`
          : `Processed ${files.length} file(s) successfully for FY ${state.fy}.`);
      }).catch(err => setStatus(err.message || 'Processing failed.'));
    } catch(err){
      setStatus(err.message || 'Processing failed.');
    }
  }
  
  function init(){
    const fileInput = document.getElementById('fileInput2') || document.getElementById('fileInput');
    const processBtn = document.getElementById('processBtn');
    const viewSelect = $('viewSelect');
    const sectionSelect = $('sectionSelect');
    const monthSelect = $('monthSelect');
    const searchInput = $('searchInput');
    const reportTitle = $('reportTitle');
  
    if(fileInput && processBtn){
      processBtn.addEventListener('click', () => processFiles(fileInput.files));
      fileInput.addEventListener('change', () => setStatus('Files selected. Click Process files to continue.'));
    }
  
    [viewSelect, sectionSelect, monthSelect, searchInput].forEach(el => {
      if(el) el.addEventListener('change', renderReport);
      if(el) el.addEventListener('input', renderReport);
    });
  
    $('downloadExcelBtn2')?.addEventListener('click', () => {
      const rows = $('viewSelect').value === 'summary' ? getSummary() : getBills();
      if(!rows.length){
        setStatus('No data available for Excel export.');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, $('viewSelect').value === 'summary' ? 'Summary' : 'Details');
      XLSX.writeFile(wb, `GSTR2B_${($('viewSelect').value || 'report')}.xlsx`);
    });
  
    $('downloadXmlBtn2')?.addEventListener('click', () => {
      setStatus('XML export handling is not included in this split file. Keep your existing XML builder if needed.');
    });
  
    $('themeBtn')?.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme');
      document.body.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    });
  }
  
  init();