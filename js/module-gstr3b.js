(function(){
  const root = document.getElementById('module-gstr3b');
  if(!root) return;
  const $ = (id) => root.querySelector('#' + id);
  const state = { rowsByReport: {}, fy: null, returnType: 'GSTR-3B' };
  const reportMap = {
    'GSTR-3B': [
      '3.1 Outward supplies and RCM',
      '3.1.1 Section 9(5)',
      '3.2 Inter-state supplies',
      '4. Eligible ITC',
      '5.1 Interest and Late fee',
      '6.1 Payment of tax'
    ],
    'GSTR-1': [
      'B2B Outward Supply',
      'B2C Report',
      'Hsn wise Outward Supply Report'
    ]
  };
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const clean = v => String(v ?? '').trim();
  function monthLabel(period){
    const s = clean(period);
    if(s.length !== 6) return s || 'Unknown Month';
    const m = parseInt(s.slice(0,2),10) - 1;
    const y = parseInt(s.slice(2),10);
    return new Date(y, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  function getFY(period){
    const s = clean(period);
    const m = parseInt(s.slice(0,2),10);
    const y = parseInt(s.slice(2),10);
    return m <= 3 ? `${y-1}-${y}` : `${y}-${y+1}`;
  }
  function sortChrono(items){
    return [...items].sort((a,b)=>String(a.period).localeCompare(String(b.period)));
  }
  function sumInter(list){
    return {
      txval: (list || []).reduce((s,x)=>s + num(x?.txval), 0),
      iamt: (list || []).reduce((s,x)=>s + num(x?.iamt), 0)
    };
  }
  function extract3B(data){
    const period = data.ret_period || '000000';
    const month = monthLabel(period);
    const sup = data.sup_details || {};
    const osup = sup.osup_det || {};
    const isup_rev = sup.isup_rev || {};
    const osup_zero = sup.osup_zero || {};
    const osup_nil = sup.osup_nil_exmp || {};
    const osup_nongst = sup.osup_nongst || {};
    const sec95 = data.sec95_details || {};
    const eco_dtls = data.eco_dtls || {};
    const eco_det = sec95.eco_det || eco_dtls.eco_sup || {};
    const reg_det = sec95.reg_det || eco_dtls.eco_reg_sup || {};
    const inter = data.inter_sup || {};
    const u = sumInter(inter.unreg_details || []);
    const c = sumInter(inter.comp_details || []);
    const ui = sumInter(inter.uin_details || []);
    const itc_elg = data.itc_elg || {};
    const itc_avl = itc_elg.itc_avl || [];
    const rc_itc = itc_avl.find(x => x?.ty === 'ISRC') || {};
    const oth_itc = itc_avl.find(x => x?.ty === 'OTH') || {};
    const itc_inelg = (itc_elg.itc_inelg || []).find(x => x?.ty === 'RUL') || {};
    const itc_rev = (itc_elg.itc_rev || []).find(x => x?.ty === 'RUL') || {};
    const itc_net = itc_elg.itc_net || {};
    const intr_det = (data.intr_details || {}).intr_amt || ((data.intr_ltfee || {}).intr_details || {});
    const tax_pd = (((data.taxpayble || {}).returnsDbCdredList || {}).tax_paid || {});
    const pd_itc = tax_pd.pd_by_itc || [];
    const pd_cash = tax_pd.pd_by_cash || [];
    const sumItc = field => pd_itc.reduce((s,row)=>s + num(row?.[field]), 0);
    const sumCash = (head, field) => pd_cash.reduce((s,row)=>s + num((row?.[String(head).toLowerCase()] || {})[field]), 0);
    return {
      period,
      month,
      '3.1 Outward supplies and RCM': {
        Month: month,
        'Taxable Value': num(osup.txval), IGST: num(osup.iamt), CGST: num(osup.camt), 'SGST/UTGST': num(osup.samt), Cess: num(osup.csamt),
        'RCM Taxable': num(isup_rev.txval), 'RCM CGST': num(isup_rev.camt), 'RCM SGST': num(isup_rev.samt),
        'Zero Taxable': num(osup_zero.txval), 'Zero IGST': num(osup_zero.iamt), 'Zero CGST': num(osup_zero.camt), 'Zero SGST': num(osup_zero.samt), 'Zero Cess': num(osup_zero.csamt),
        'Nil Taxable': num(osup_nil.txval), 'Nil IGST': num(osup_nil.iamt), 'Nil CGST': num(osup_nil.camt), 'Nil SGST': num(osup_nil.samt), 'Nil Cess': num(osup_nil.csamt),
        'Non-GST Taxable': num(osup_nongst.txval), 'Non-GST IGST': num(osup_nongst.iamt), 'Non-GST CGST': num(osup_nongst.camt), 'Non-GST SGST': num(osup_nongst.samt), 'Non-GST Cess': num(osup_nongst.csamt)
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
        'Paid_IGST': sumCash('igst', 'intr'), 'Paid_CGST': sumCash('cgst', 'intr'), 'Paid_SGST': sumCash('sgst', 'intr'),
        'LF_IGST': sumCash('igst', 'fee'), 'LF_CGST': sumCash('cgst', 'fee'), 'LF_SGST': sumCash('sgst', 'fee')
      },
      '6.1 Payment of tax': {
        Month: month,
        'I_O': num(osup.iamt), 'I_R': num(isup_rev.iamt), 'I_L': num(osup.iamt) + num(isup_rev.iamt), 'I_I_U': sumItc('igst_igst_amt'), 'I_C_U': sumItc('igst_cgst_amt'), 'I_S_U': sumItc('igst_sgst_amt'), 'I_CP': sumCash('igst', 'tx'), 'I_IN': sumCash('igst', 'intr'), 'I_LF': sumCash('igst', 'fee'),
        'C_O': num(osup.camt), 'C_R': num(isup_rev.camt), 'C_L': num(osup.camt) + num(isup_rev.camt), 'C_C_U': sumItc('cgst_cgst_amt'), 'C_I_U': sumItc('cgst_igst_amt'), 'C_CP': sumCash('cgst', 'tx'), 'C_IN': sumCash('cgst', 'intr'), 'C_LF': sumCash('cgst', 'fee'),
        'S_O': num(osup.samt), 'S_R': num(isup_rev.samt), 'S_L': num(osup.samt) + num(isup_rev.samt), 'S_S_U': sumItc('sgst_sgst_amt'), 'S_I_U': sumItc('sgst_igst_amt'), 'S_CP': sumCash('sgst', 'tx'), 'S_IN': sumCash('sgst', 'intr'), 'S_LF': sumCash('sgst', 'fee')
      }
    };
  }
  function extract1(data){
    const period = data.fp || data.ret_period || '000000';
    const month = monthLabel(period);
    const b2b = [];
    (data.b2b || []).forEach(party => {
      (party.inv || []).forEach(inv => {
        (inv.itms || []).forEach(itm => {
          const det = itm.itm_det || {};
          b2b.push({
            Month: month,
            'Recipient GSTIN': party.ctin || '',
            'Invoice Number': inv.inum || '',
            'Invoice Date': inv.idt || '',
            'Invoice Value': num(inv.val),
            'Place of Supply': inv.pos || '',
            Rate: num(det.rt),
            'Taxable Value': num(det.txval),
            IGST: num(det.iamt),
            CGST: num(det.camt),
            SGST: num(det.samt)
          });
        });
      });
    });
    const b2c = [];
    (data.b2bl || []).forEach(b2bl => {
      (b2bl.inv || []).forEach(inv => {
        (inv.itms || []).forEach(itm => {
          const det = itm.itm_det || {};
          b2c.push({
            Month: month,
            Type: 'B2C-Large',
            'Invoice/POS': inv.inum || '',
            POS: b2bl.pos || '',
            Rate: num(det.rt),
            'Taxable Value': num(det.txval),
            IGST: num(det.iamt),
            CGST: 0,
            SGST: 0
          });
        });
      });
    });
    (data.b2cs || []).forEach(x => b2c.push({
      Month: month,
      Type: 'B2C-Small',
      'Invoice/POS': x.pos || '',
      POS: x.pos || '',
      Rate: num(x.rt),
      'Taxable Value': num(x.txval),
      IGST: num(x.iamt),
      CGST: num(x.camt),
      SGST: num(x.samt)
    }));
    const hsn = [];
    (((data.hsn || {}).data) || []).forEach(h => hsn.push({
      Month: month,
      'HSN Code': h.hsn_sc || '',
      Description: h.desc || '',
      UQC: h.uqc || '',
      Qty: num(h.qty),
      'Taxable Value': num(h.txval),
      Rate: num(h.rt),
      IGST: num(h.iamt),
      CGST: num(h.camt),
      SGST: num(h.samt)
    }));
    return { period, month, 'B2B Outward Supply': b2b, 'B2C Report': b2c, 'Hsn wise Outward Supply Report': hsn };
  }
  function renderTable(rows){
    const wrap = $('g3TableWrap');
    if(!rows || !rows.length){ wrap.innerHTML = '<div class="notice">No rows available for this report.</div>'; return; }
    const cols = Object.keys(rows[0]);
    let html = '<table class="g3-table"><thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
    for(const row of rows){
      html += '<tr>' + cols.map(c => `<td>${typeof row[c] === 'number' ? row[c].toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}) : String(row[c] ?? '')}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }
  function setMessage(msg, cls){
    const el = $('g3Message');
    el.className = cls || 'notice';
    el.textContent = msg;
  }
  function buildSummary(){
    const report = $('g3Report').value;
    const rows = state.rowsByReport[report] || [];
    $('g3Tags').innerHTML = [`<span class="tag">${state.returnType}</span>`, `<span class="tag">FY ${state.fy || 'N/A'}</span>`, `<span class="tag">${rows.length} rows</span>`].join('');
  }
  function renderCurrent(){
    const rows = state.rowsByReport[$('g3Report').value] || [];
    renderTable(rows);
    buildSummary();
  }
  async function processFiles(){
    const files = [...($('g3Files').files || [])];
    if(!files.length){ setMessage('Please choose one or more JSON files.','error'); return; }
    const returnType = $('g3ReturnType').value;
    state.returnType = returnType;
    state.rowsByReport = {};
    state.fy = null;
    try {
      const extracted = [];
      const fySet = new Set();
      const seenPeriods = new Set();
      const dup = [];
      for(const file of files){
        const raw = JSON.parse(await file.text());
        const period = raw.ret_period || raw.fp;
        if(!period) throw new Error(`Missing return period in ${file.name}`);
        const fy = getFY(period);
        fySet.add(fy);
        if(seenPeriods.has(period)) dup.push(monthLabel(period));
        seenPeriods.add(period);
        const ext = returnType === 'GSTR-3B' ? extract3B(raw) : extract1(raw);
        extracted.push(ext);
      }
      if(fySet.size > 1) throw new Error('Please upload files from a single financial year only.');
      state.fy = [...fySet][0];
      const sorted = sortChrono(extracted);
      const reports = reportMap[returnType];
      for(const rep of reports){
        state.rowsByReport[rep] = sorted.map(x => x[rep]).filter(Boolean).flat ? sorted.map(x => x[rep]).filter(Boolean).flat() : sorted.map(x => x[rep]).filter(Boolean);
        if(returnType === 'GSTR-1') state.rowsByReport[rep] = sorted.flatMap(x => x[rep] || []);
      }
      $('g3Report').innerHTML = reports.map(r => `<option value="${r}">${r}</option>`).join('');
      if(dup.length) setMessage(`Processed successfully. Duplicate periods kept latest for: ${[...new Set(dup)].join(', ')}`,'notice');
      else setMessage(`Processed ${files.length} file(s) successfully for FY ${state.fy}.`,'success');
      renderCurrent();
    } catch(err){
      renderTable([]);
      setMessage(err.message || 'Processing failed.','error');
    }
  }
  function downloadExcel(){
    const report = $('g3Report').value;
    const rows = state.rowsByReport[report] || [];
    if(!rows.length){ setMessage('No rows available to export.','error'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, report);
    XLSX.writeFile(wb, report.replace(/[^A-Za-z0-9]+/g, '_') + '.xlsx');
  }
  $('g3Process').addEventListener('click', processFiles);
  $('g3Report').addEventListener('change', renderCurrent);
  $('g3ReturnType').addEventListener('change', () => { $('g3Report').innerHTML = ''; renderTable([]); setMessage('Return type changed. Upload files and process again.','notice'); });
  $('g3Reset').addEventListener('click', () => { $('g3Files').value = ''; $('g3Report').innerHTML = ''; state.rowsByReport = {}; state.fy = null; renderTable([]); setMessage('Reset complete.','notice'); });
  $('g3Excel').addEventListener('click', downloadExcel);
  $('g3Files').addEventListener('change', () => setMessage('Files selected. Click Process files to continue.','notice'));
})();