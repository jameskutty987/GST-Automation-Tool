function escapeXml(value) {
  return String(value ?? "").replace(/[<>&'"]/g, ch => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;"
  }[ch]));
}

function round2(n) {
  return +(Number(n || 0).toFixed(2));
}

function toCaps(value) {
  return String(value || "").trim().toUpperCase();
}

function formatMonthLabel(fp) {
  if (!fp || fp.length !== 6) return "Unknown Month";
  const m = parseInt(fp.substring(0, 2), 10);
  const y = parseInt(fp.substring(2), 10);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function getFY(fp) {
  if (!fp || fp.length !== 6) return "Unknown";
  const m = parseInt(fp.substring(0, 2), 10);
  const y = parseInt(fp.substring(2), 10);
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function getLastDayOfPeriod(fp) {
  if (!fp || fp.length !== 6) return { tally: "", display: "" };
  const m = parseInt(fp.substring(0, 2), 10);
  const y = parseInt(fp.substring(2), 10);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    tally: `${y}${String(m).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`,
    display: `${String(lastDay).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`
  };
}

function formatDates(dateStr, fp) {
  const fallback = getLastDayOfPeriod(fp);
  if (!dateStr || !String(dateStr).trim()) return fallback;

  const raw = String(dateStr).trim();
  const parts = raw.split(/[-/]/);
  if (parts.length !== 3) return fallback;

  let d, m, y;
  if (parts[0].length === 4) {
    y = parts[0];
    m = parts[1];
    d = parts[2];
  } else {
    d = parts[0];
    m = parts[1];
    y = parts[2];
  }

  d = String(parseInt(d, 10)).padStart(2, "0");
  m = String(parseInt(m, 10)).padStart(2, "0");
  y = String(y).length === 2 ? `20${y}` : String(y);

  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return fallback;

  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  if (isNaN(dt.getTime())) return fallback;

  return {
    tally: `${y}${m}${d}`,
    display: `${d}-${m}-${y}`
  };
}

function sortMonthLabelsFY(labels) {
  const map = {};
  Object.values(globalDataByMonth).forEach(bucket => {
    (bucket.ALL_BILLS || []).forEach(row => {
      if (row.Month && row.Period) map[row.Month] = row.Period;
    });
    (bucket.HSN || []).forEach(row => {
      if (row.Month && row.Period) map[row.Month] = row.Period;
    });
  });
  return [...labels].sort((a, b) => String(map[a] || "").localeCompare(String(map[b] || "")));
}

async function ensureAuthenticated() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data || !data.session) {
    window.location.href = "login.html";
    throw new Error("No active login session found.");
  }
  return data.session;
}

async function loadUserInfo() {
  try {
    const session = await ensureAuthenticated();
    const user = session.user;
    userInfo.textContent = `Logged in as: ${user.email}`;
  } catch (err) {
    userInfo.textContent = "Session not found";
  }
}

async function fetchNameMapForGSTINs(gstins) {
  const cleaned = [...new Set(
    (gstins || [])
      .map(g => String(g || "").trim().toUpperCase())
      .filter(g => g && g !== "URP")
  )];

  if (!cleaned.length) return {};

  await ensureAuthenticated();

  const { data, error } = await supabaseClient
    .from("gst_master")
    .select("gstin, party_name")
    .in("gstin", cleaned);

  if (error) throw new Error(error.message);

  const nameMap = {};
  (data || []).forEach(row => {
    const gstin = String(row.gstin || "").trim().toUpperCase();
    const partyName = String(row.party_name || "").trim();
    if (gstin && partyName) nameMap[gstin] = partyName;
  });

  return nameMap;
}

function resolvePartyNameSync(gstin, fallbackName, pos, nameMap = {}) {
  const cleanGSTIN = String(gstin || "").trim().toUpperCase();
  if (cleanGSTIN && nameMap[cleanGSTIN]) return toCaps(nameMap[cleanGSTIN]);
  if (fallbackName && String(fallbackName).trim()) return toCaps(fallbackName);
  if (cleanGSTIN) return `CUSTOMER - ${cleanGSTIN}`;
  return `B2C CUSTOMER - ${toCaps(pos || "Unknown")}`;
}

function getMissingGSTINs() {
  const missing = new Set();
  Object.values(globalDataByMonth).forEach(monthData => {
    (monthData.ALL_BILLS || []).forEach(row => {
      if (
        row.GSTIN &&
        row.GSTIN !== "URP" &&
        String(row.PartyName || "").startsWith("CUSTOMER - ")
      ) {
        missing.add(String(row.GSTIN).trim().toUpperCase());
      }
    });
  });
  return [...missing].sort();
}

function updateMissingBox() {
  missingGstinBox.value = getMissingGSTINs().join("\n");
}

async function refreshNamesFromDB() {
  const gstins = [];
  Object.values(globalDataByMonth).forEach(monthData => {
    (monthData.ALL_BILLS || []).forEach(row => {
      if (row.GSTIN && row.GSTIN !== "URP") gstins.push(row.GSTIN);
    });
  });

  const nameMap = await fetchNameMapForGSTINs(gstins);

  Object.keys(globalDataByMonth).forEach(month => {
    const bucket = globalDataByMonth[month];

    if (bucket.ALL_BILLS) {
      bucket.ALL_BILLS = bucket.ALL_BILLS.map(row => {
        const gstin = String(row.GSTIN || "").trim().toUpperCase();
        if (gstin && gstin !== "URP" && nameMap[gstin]) {
          return { ...row, PartyName: toCaps(nameMap[gstin]) };
        }
        return row;
      });
    }

    ["B2B_RCM", "B2CS", "B2CL", "CDN", "AMENDMENTS"].forEach(reportKey => {
      if (bucket[reportKey]) {
        bucket[reportKey] = bucket[reportKey].map(row => {
          const gstin = String(row.GSTIN || "").trim().toUpperCase();
          if (gstin && gstin !== "URP" && nameMap[gstin]) {
            return { ...row, PartyName: toCaps(nameMap[gstin]) };
          }
          return row;
        });
      }
    });
  });

  updateMissingBox();
  renderView();
}

async function saveMappingsToSupabase(rows) {
  await ensureAuthenticated();

  const cleaned = rows
    .map(r => ({
      gstin: String(r.gstin || "").trim().toUpperCase(),
      party_name: toCaps(r.party_name || "")
    }))
    .filter(r => r.gstin.length === 15 && r.party_name);

  if (!cleaned.length) throw new Error("No valid GSTIN and Party Name rows found.");

  const { error } = await supabaseClient
    .from("gst_master")
    .upsert(cleaned, { onConflict: "gstin" });

  if (error) throw new Error(error.message);
}

async function savePastedNames() {
  const text = gstNamePasteBox.value.trim();
  if (!text) throw new Error("Paste GSTIN,PartyName rows first.");

  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const rows = [];

  lines.forEach(line => {
    const idx = line.indexOf(",");
    if (idx === -1) return;
    rows.push({
      gstin: line.slice(0, idx).trim(),
      party_name: line.slice(idx + 1).trim()
    });
  });

  await saveMappingsToSupabase(rows);
  await refreshNamesFromDB();
}

async function importNamesFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const rows = jsonRows.map(row => {
    const normalized = {};
    Object.keys(row).forEach(k => {
      normalized[String(k).trim().toLowerCase()] = row[k];
    });
    return {
      gstin: normalized.gstin || normalized["gst no"] || normalized["gst number"] || normalized["gstin number"] || "",
      party_name: normalized.party_name || normalized["party name"] || normalized.name || normalized["legal name"] || normalized["trade name"] || ""
    };
  });

  await saveMappingsToSupabase(rows);
  await refreshNamesFromDB();
}

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

function pushAllBill(monthLabel, row) {
  globalDataByMonth[monthLabel].ALL_BILLS.push(row);
}

function sumInvoiceItems(inv) {
  let tx = 0, cg = 0, sg = 0, ig = 0, cess = 0, qty = 0;
  (inv.itms || []).forEach(itm => {
    const det = itm.itm_det || {};
    tx += parseFloat(det.txval || 0);
    cg += parseFloat(det.camt || 0);
    sg += parseFloat(det.samt || 0);
    ig += parseFloat(det.iamt || 0);
    cess += parseFloat(det.csamt || 0);
    qty += parseFloat(det.qty || 0);
  });
  return { tx, cg, sg, ig, cess, qty };
}

function normalizeHSNRows(hsnData, period, monthLabel, fy) {
  const rows = [];

  function pushRow(item, idx = 0, sourceLabel = "") {
    if (!item || typeof item !== "object") return;

    const hsn = String(item.hsn_sc || item.hsnsc || item.hsn || item.num || item.code || "").trim();
    const desc = String(item.desc || item.description || "").trim();
    const qty = parseFloat(item.qty || item.total_qty || 0);
    const txval = parseFloat(item.txval || item.taxable_value || 0);
    const igst = parseFloat(item.iamt || item.igst || 0);
    const cgst = parseFloat(item.camt || item.cgst || 0);
    const sgst = parseFloat(item.samt || item.sgst || 0);

    if (!hsn && !desc && qty === 0 && txval === 0 && igst === 0 && cgst === 0 && sgst === 0) return;

    rows.push({
      Month: monthLabel,
      FY: fy,
      Period: period,
      ReportType: "HSN",
      Source: sourceLabel,
      HSN: hsn || `HSN-${idx + 1}`,
      Description: desc,
      Quantity: round2(qty),
      TaxableValue: round2(txval),
      IGST: round2(igst),
      CGST: round2(cgst),
      SGST: round2(sgst)
    });
  }

  function processAny(value, sourceLabel = "") {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((item, idx) => pushRow(item, idx, sourceLabel));
      return;
    }

    if (typeof value === "object") {
      const directKeys = ["hsn_sc", "hsnsc", "hsn", "desc", "qty", "txval", "iamt", "camt", "samt"];
      const looksLikeHsnRow = directKeys.some(key => key in value);

      if (looksLikeHsnRow) {
        pushRow(value, 0, sourceLabel);
        return;
      }

      Object.entries(value).forEach(([key, child]) => processAny(child, key));
    }
  }

  processAny(hsnData, "HSN");
  return rows;
}

function aggregateHSNRows(rows) {
  const map = new Map();

  rows.forEach(r => {
    const key = String(r.HSN || "").trim();
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        HSN: key,
        Description: String(r.Description || "").trim(),
        Quantity: 0,
        TaxableValue: 0,
        IGST: 0,
        CGST: 0,
        SGST: 0
      });
    }

    const item = map.get(key);
    if (!item.Description && r.Description) item.Description = String(r.Description).trim();
    item.Quantity += Number(r.Quantity || 0);
    item.TaxableValue += Number(r.TaxableValue || 0);
    item.IGST += Number(r.IGST || 0);
    item.CGST += Number(r.CGST || 0);
    item.SGST += Number(r.SGST || 0);
  });

  return [...map.values()]
    .map(r => ({
      HSN: r.HSN,
      Description: r.Description,
      Quantity: round2(r.Quantity),
      TaxableValue: round2(r.TaxableValue),
      IGST: round2(r.IGST),
      CGST: round2(r.CGST),
      SGST: round2(r.SGST)
    }))
    .sort((a, b) => String(a.HSN).localeCompare(String(b.HSN), undefined, { numeric: true }));
}

async function processGSTR1Files(files) {
  globalDataByMonth = {};
  globalFY = null;

  const parsedFiles = [];

  for (const file of files) {
    const text = await file.text();
    const data = JSON.parse(text);
    const period = data.fp || "000000";

    const currentFY = getFY(period);
    if (globalFY === null) {
      globalFY = currentFY;
    } else if (globalFY !== currentFY && currentFY !== "Unknown") {
      throw new Error(`CRITICAL ERROR: Data spans multiple Financial Years (${globalFY} vs ${currentFY}). Please upload files for a single FY only.`);
    }

    parsedFiles.push(data);
  }

  const allGSTINs = [];
  parsedFiles.forEach(data => {
    (data.b2b || []).forEach(party => { if (party.ctin) allGSTINs.push(String(party.ctin).trim().toUpperCase()); });
    (data.b2ba || []).forEach(party => { if (party.ctin) allGSTINs.push(String(party.ctin).trim().toUpperCase()); });
    (data.cdnr || []).forEach(party => { if (party.ctin) allGSTINs.push(String(party.ctin).trim().toUpperCase()); });
    (data.cdnra || []).forEach(party => { if (party.ctin) allGSTINs.push(String(party.ctin).trim().toUpperCase()); });
  });

  let nameMap = {};
  try {
    nameMap = await fetchNameMapForGSTINs(allGSTINs);
  } catch (e) {
    console.warn("Name fetch skipped:", e.message);
  }

  for (const data of parsedFiles) {
    const period = data.fp || "000000";
    const currentFY = getFY(period);
    const monthLabel = formatMonthLabel(period);

    ensureMonthBucket(monthLabel);

    (data.b2b || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, "", "", nameMap);

      (party.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDates(inv.idt, period);
        const isRCM = String(inv.rchrg || party.rchrg || "N").toUpperCase() === "Y";
        const typeLabel = isRCM ? "B2B RCM" : "B2B";

        const row = {
          Month: monthLabel,
          FY: currentFY,
          Period: period,
          Type: typeLabel,
          PartyName: toCaps(partyName),
          GSTIN: String(party.ctin || "").trim().toUpperCase(),
          Invoice: inv.inum || "UNKNOWN",
          DisplayDate: dates.display,
          TallyDate: dates.tally,
          Taxable: round2(totals.tx),
          IGST: round2(totals.ig),
          CGST: round2(totals.cg),
          SGST: round2(totals.sg),
          Cess: round2(totals.cess),
          Total: round2(parseFloat(inv.val || (totals.tx + totals.ig + totals.cg + totals.sg + totals.cess))),
          SourceSection: isRCM ? "4B" : "4A"
        };

        globalDataByMonth[monthLabel].B2B_RCM.push(row);
        pushAllBill(monthLabel, row);
      });
    });

    (data.b2cl || data.b2bl || []).forEach(item => {
      const pos = item.pos || "Unknown";
      const partyName = `B2C LARGE - ${toCaps(pos)}`;

      (item.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDates(inv.idt, period);

        const row = {
          Month: monthLabel,
          FY: currentFY,
          Period: period,
          Type: "B2C Large",
          PartyName: partyName,
          GSTIN: "URP",
          Invoice: inv.inum || "UNKNOWN",
          DisplayDate: dates.display,
          TallyDate: dates.tally,
          Taxable: round2(totals.tx),
          IGST: round2(totals.ig),
          CGST: round2(totals.cg),
          SGST: round2(totals.sg),
          Cess: round2(totals.cess),
          Total: round2(parseFloat(inv.val || (totals.tx + totals.ig + totals.cg + totals.sg + totals.cess))),
          POS: pos,
          SourceSection: "5"
        };

        globalDataByMonth[monthLabel].B2CL.push(row);
        pushAllBill(monthLabel, row);
      });
    });

    (data.b2cs || []).forEach((b2cs, idx) => {
      const pos = b2cs.pos || "Unknown";
      const dates = getLastDayOfPeriod(period);

      const row = {
        Month: monthLabel,
        FY: currentFY,
        Period: period,
        Type: "B2C Small",
        PartyName: `B2C SMALL - ${toCaps(pos)}`,
        GSTIN: "URP",
        Invoice: `B2CS-${pos}-${period}-${idx + 1}`,
        DisplayDate: dates.display,
        TallyDate: dates.tally,
        Taxable: round2(parseFloat(b2cs.txval || 0)),
        IGST: round2(parseFloat(b2cs.iamt || 0)),
        CGST: round2(parseFloat(b2cs.camt || 0)),
        SGST: round2(parseFloat(b2cs.samt || 0)),
        Cess: round2(parseFloat(b2cs.csamt || 0)),
        Total: round2(
          parseFloat(b2cs.txval || 0) +
          parseFloat(b2cs.iamt || 0) +
          parseFloat(b2cs.camt || 0) +
          parseFloat(b2cs.samt || 0) +
          parseFloat(b2cs.csamt || 0)
        ),
        POS: pos,
        Rate: parseFloat(b2cs.rt || 0),
        SourceSection: "7"
      };

      globalDataByMonth[monthLabel].B2CS.push(row);
      pushAllBill(monthLabel, row);
    });

    (data.cdnr || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, "", "", nameMap);

      (party.nt || []).forEach(note => {
        const totals = sumInvoiceItems(note);
        const dates = formatDates(note.ndt || note.idt, period);
        const noteType = String(note.ntty || note.typ || "C").toUpperCase();
        const displayType = noteType === "D" ? "Debit Note" : "Credit Note";

        const row = {
          Month: monthLabel,
          FY: currentFY,
          Period: period,
          Type: displayType,
          PartyName: toCaps(partyName),
          GSTIN: String(party.ctin || "").trim().toUpperCase(),
          Invoice: note.nt_num || note.ntnum || note.inum || "UNKNOWN",
          RefInvoice: note.inum || "",
          DisplayDate: dates.display,
          TallyDate: dates.tally,
          Taxable: round2(totals.tx),
          IGST: round2(totals.ig),
          CGST: round2(totals.cg),
          SGST: round2(totals.sg),
          Cess: round2(totals.cess),
          Total: round2(parseFloat(note.val || note.ntval || (totals.tx + totals.ig + totals.cg + totals.sg + totals.cess))),
          NoteNature: displayType,
          SourceSection: "9B-CDNR"
        };

        globalDataByMonth[monthLabel].CDN.push(row);
      });
    });

    (data.cdnur || []).forEach(noteBlock => {
      (noteBlock.nt || []).forEach(note => {
        const totals = sumInvoiceItems(note);
        const dates = formatDates(note.ndt || note.idt, period);
        const noteType = String(note.ntty || note.typ || "C").toUpperCase();
        const displayType = noteType === "D" ? "Debit Note" : "Credit Note";
        const pos = note.pos || noteBlock.pos || "Unknown";

        const row = {
          Month: monthLabel,
          FY: currentFY,
          Period: period,
          Type: displayType,
          PartyName: `URP - ${toCaps(pos)}`,
          GSTIN: "URP",
          Invoice: note.nt_num || note.ntnum || note.inum || "UNKNOWN",
          RefInvoice: note.inum || "",
          DisplayDate: dates.display,
          TallyDate: dates.tally,
          Taxable: round2(totals.tx),
          IGST: round2(totals.ig),
          CGST: round2(totals.cg),
          SGST: round2(totals.sg),
          Cess: round2(totals.cess),
          Total: round2(parseFloat(note.val || note.ntval || (totals.tx + totals.ig + totals.cg + totals.sg + totals.cess))),
          NoteNature: displayType,
          POS: pos,
          SourceSection: "9B-CDNUR"
        };

        globalDataByMonth[monthLabel].CDN.push(row);
      });
    });

    (data.b2ba || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, "", "", nameMap);

      (party.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDates(inv.idt, period);

        globalDataByMonth[monthLabel].AMENDMENTS.push({
          Month: monthLabel,
          FY: currentFY,
          Period: period,
          Type: "B2B Amendment",
          PartyName: toCaps(partyName),
          GSTIN: String(party.ctin || "").trim().toUpperCase(),
          Invoice: inv.inum || "UNKNOWN",
          OriginalInvoice: inv.oinum || "",
          DisplayDate: dates.display,
          TallyDate: dates.tally,
          Taxable: round2(totals.tx),
          IGST: round2(totals.ig),
          CGST: round2(totals.cg),
          SGST: round2(totals.sg),
          Cess: round2(totals.cess),
          Total: round2(parseFloat(inv.val || (totals.tx + totals.ig + totals.cg + totals.sg + totals.cess))),
          SourceSection: "9A-B2BA"
        });
      });
    });

    (data.b2cla || []).forEach(item => {
      const pos = item.pos || "Unknown";

      (item.inv || []).forEach(inv => {
        const totals = sumInvoiceItems(inv);
        const dates = formatDates(inv.idt, period);

        globalDataByMonth[monthLabel].AMENDMENTS.push({
          Month: monthLabel,
          FY: currentFY,
          Period: period,
          Type: "B2CL Amendment",
          PartyName: `B2C LARGE - ${toCaps(pos)}`,
          GSTIN: "URP",
          Invoice: inv.inum || "UNKNOWN",
          OriginalInvoice: inv.oinum || "",
          DisplayDate: dates.display,
          TallyDate: dates.tally,
          Taxable: round2(totals.tx),
          IGST: round2(totals.ig),
          CGST: round2(totals.cg),
          SGST: round2(totals.sg),
          Cess: round2(totals.cess),
          Total: round2(parseFloat(inv.val || (totals.tx + totals.ig + totals.cg + totals.sg + totals.cess))),
          POS: pos,
          SourceSection: "9A-B2CLA"
        });
      });
    });

    (data.b2csa || []).forEach((item, idx) => {
      const pos = item.pos || "Unknown";
      const dates = getLastDayOfPeriod(period);

      globalDataByMonth[monthLabel].AMENDMENTS.push({
        Month: monthLabel,
        FY: currentFY,
        Period: period,
        Type: "B2CS Amendment",
        PartyName: `B2C SMALL - ${toCaps(pos)}`,
        GSTIN: "URP",
        Invoice: `B2CSA-${pos}-${period}-${idx + 1}`,
        OriginalInvoice: item.omon || "",
        DisplayDate: dates.display,
        TallyDate: dates.tally,
        Taxable: round2(parseFloat(item.txval || 0)),
        IGST: round2(parseFloat(item.iamt || 0)),
        CGST: round2(parseFloat(item.camt || 0)),
        SGST: round2(parseFloat(item.samt || 0)),
        Cess: round2(parseFloat(item.csamt || 0)),
        Total: round2(
          parseFloat(item.txval || 0) +
          parseFloat(item.iamt || 0) +
          parseFloat(item.camt || 0) +
          parseFloat(item.samt || 0) +
          parseFloat(item.csamt || 0)
        ),
        POS: pos,
        SourceSection: "10-B2CSA"
      });
    });

    (data.cdnra || []).forEach(party => {
      const partyName = resolvePartyNameSync(party.ctin, "", "", nameMap);

      (party.nt || []).forEach(note => {
        const totals = sumInvoiceItems(note);
        const dates = formatDates(note.ndt || note.idt, period);
        const noteType = String(note.ntty || note.typ || "C").toUpperCase();
        const displayType = noteType === "D" ? "Debit Note Amendment" : "Credit Note Amendment";

        globalDataByMonth[monthLabel].AMENDMENTS.push({
          Month: monthLabel,
          FY: currentFY,
          Period: period,
          Type: displayType,
          PartyName: toCaps(partyName),
          GSTIN: String(party.ctin || "").trim().toUpperCase(),
          Invoice: note.nt_num || note.ntnum || note.inum || "UNKNOWN",
          OriginalInvoice: note.ont_num || note.oinum || "",
          DisplayDate: dates.display,
          TallyDate: dates.tally,
          Taxable: round2(totals.tx),
          IGST: round2(totals.ig),
          CGST: round2(totals.cg),
          SGST: round2(totals.sg),
          Cess: round2(totals.cess),
          Total: round2(parseFloat(note.val || note.ntval || (totals.tx + totals.ig + totals.cg + totals.sg + totals.cess))),
          SourceSection: "9C-CDNRA"
        });
      });
    });

    const hsnRows = normalizeHSNRows(
      data.hsn || data.hsn_sc || data.hsnsum || data.hsnData || data,
      period,
      monthLabel,
      currentFY
    );
    globalDataByMonth[monthLabel].HSN.push(...hsnRows);
  }

  updateMissingBox();
}

function getAllRowsForReport(reportKey) {
  const months = sortMonthLabelsFY(Object.keys(globalDataByMonth));
  const out = [];
  months.forEach(month => {
    const bucket = globalDataByMonth[month];
    if (bucket && bucket[reportKey]) out.push(...bucket[reportKey]);
  });
  return out;
}

function getRowsForCurrentSelection() {
  const selectedMonth = monthSelector.value;
  const selectedReport = reportSelector.value;

  if (selectedReport === "HSN") {
    if (selectedMonth === "CONSOLIDATED") {
      return aggregateHSNRows(getAllRowsForReport("HSN"));
    }
    const monthRows = (globalDataByMonth[selectedMonth] && globalDataByMonth[selectedMonth].HSN) || [];
    return aggregateHSNRows(monthRows);
  }

  if (selectedMonth === "CONSOLIDATED") {
    return getAllRowsForReport(selectedReport);
  }

  return (globalDataByMonth[selectedMonth] && globalDataByMonth[selectedMonth][selectedReport]) || [];
}

function clearTable() {
  tableHead.innerHTML = "";
  tableBody.innerHTML = "";
  tableFooter.innerHTML = "";
}

function createHeadRow(columns) {
  const tr = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    tr.appendChild(th);
  });
  tableHead.appendChild(tr);
}

function appendBodyRow(values) {
  const tr = document.createElement("tr");
  values.forEach(val => {
    const td = document.createElement("td");
    td.textContent = val == null ? "" : String(val);
    tr.appendChild(td);
  });
  tableBody.appendChild(tr);
}

function createFooterRow(values) {
  const tr = document.createElement("tr");
  values.forEach(val => {
    const td = document.createElement("td");
    td.textContent = val == null ? "" : String(val);
    tr.appendChild(td);
  });
  tableFooter.appendChild(tr);
}

function updateDropdown() {
  monthSelector.innerHTML = "";
  const consolidatedOption = document.createElement("option");
  consolidatedOption.value = "CONSOLIDATED";
  consolidatedOption.textContent = "Consolidated (Whole FY)";
  monthSelector.appendChild(consolidatedOption);

  const sortedMonths = sortMonthLabelsFY(Object.keys(globalDataByMonth));
  sortedMonths.forEach(month => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = month;
    monthSelector.appendChild(option);
  });

  monthSelector.value = sortedMonths.length > 1 ? "CONSOLIDATED" : (sortedMonths[0] || "CONSOLIDATED");
}

function renderSummaryReport(reportKey) {
  clearTable();

  createHeadRow(["Month", "Count", "Taxable", "IGST", "CGST", "SGST", "Total"]);

  const months = monthSelector.value === "CONSOLIDATED"
    ? sortMonthLabelsFY(Object.keys(globalDataByMonth))
    : [monthSelector.value];

  let grandCount = 0, grandTax = 0, grandIg = 0, grandCg = 0, grandSg = 0, grandTotal = 0;

  months.forEach(month => {
    const bucketRows = (globalDataByMonth[month] && globalDataByMonth[month][reportKey]) || [];
    let count = bucketRows.length, tax = 0, ig = 0, cg = 0, sg = 0, total = 0;

    bucketRows.forEach(r => {
      tax += Number(r.Taxable || r.TaxableValue || 0);
      ig += Number(r.IGST || 0);
      cg += Number(r.CGST || 0);
      sg += Number(r.SGST || 0);
      total += Number(r.Total || 0);
    });

    grandCount += count;
    grandTax += tax;
    grandIg += ig;
    grandCg += cg;
    grandSg += sg;
    grandTotal += total;

    appendBodyRow([
      month,
      count,
      round2(tax).toFixed(2),
      round2(ig).toFixed(2),
      round2(cg).toFixed(2),
      round2(sg).toFixed(2),
      round2(total).toFixed(2)
    ]);
  });

  createFooterRow([
    "TOTAL",
    grandCount,
    round2(grandTax).toFixed(2),
    round2(grandIg).toFixed(2),
    round2(grandCg).toFixed(2),
    round2(grandSg).toFixed(2),
    round2(grandTotal).toFixed(2)
  ]);
}

function renderBillsTable(rows) {
  clearTable();

  createHeadRow([
    "Month",
    "Type",
    "Invoice",
    "Date",
    "Party Name",
    "GSTIN",
    "Taxable",
    "IGST",
    "CGST",
    "SGST",
    "Total"
  ]);

  let tax = 0, ig = 0, cg = 0, sg = 0, total = 0;

  rows.forEach(r => {
    tax += Number(r.Taxable || 0);
    ig += Number(r.IGST || 0);
    cg += Number(r.CGST || 0);
    sg += Number(r.SGST || 0);
    total += Number(r.Total || 0);

    appendBodyRow([
      r.Month,
      r.Type,
      r.Invoice,
      r.DisplayDate,
      r.PartyName,
      r.GSTIN,
      round2(r.Taxable).toFixed(2),
      round2(r.IGST).toFixed(2),
      round2(r.CGST).toFixed(2),
      round2(r.SGST).toFixed(2),
      round2(r.Total).toFixed(2)
    ]);
  });

  createFooterRow([
    "TOTAL", "", "", "", "", "",
    round2(tax).toFixed(2),
    round2(ig).toFixed(2),
    round2(cg).toFixed(2),
    round2(sg).toFixed(2),
    round2(total).toFixed(2)
  ]);
}

function renderHSNTable(rows) {
  clearTable();

  createHeadRow([
    "HSN",
    "Description",
    "Taxable Value",
    "IGST",
    "CGST",
    "SGST"
  ]);

  let tax = 0, ig = 0, cg = 0, sg = 0;

  rows.forEach(r => {
    tax += Number(r.TaxableValue || 0);
    ig += Number(r.IGST || 0);
    cg += Number(r.CGST || 0);
    sg += Number(r.SGST || 0);

    appendBodyRow([
      r.HSN,
      r.Description,
      round2(r.TaxableValue).toFixed(2),
      round2(r.IGST).toFixed(2),
      round2(r.CGST).toFixed(2),
      round2(r.SGST).toFixed(2)
    ]);
  });

  createFooterRow([
    "TOTAL",
    "",
    round2(tax).toFixed(2),
    round2(ig).toFixed(2),
    round2(cg).toFixed(2),
    round2(sg).toFixed(2)
  ]);
}

function renderView() {
  const selectedMonth = monthSelector.value;
  const selectedReport = reportSelector.value;
  const rows = getRowsForCurrentSelection();

  reportMeta.textContent = `FY: ${globalFY || "-"} | Month: ${selectedMonth} | Report: ${selectedReport} | Rows: ${rows.length}`;

  if (selectedReport === "HSN") {
    renderHSNTable(rows);
    return;
  }

  if (selectedReport === "ALL_BILLS") {
    renderBillsTable(rows);
    return;
  }

  renderSummaryReport(selectedReport);
}

const IGST_ALLOWED_RATES = [0, 5, 12, 18, 28];
const GST_HALF_ALLOWED_RATES = [0, 2.5, 6, 9, 14];

function formatRateLabel(rate) {
  return Number.isInteger(rate) ? String(rate) : String(rate).replace(/\.0$/, "");
}

function nearestAllowedRate(rate, allowedRates) {
  let nearest = allowedRates[0];
  let minDiff = Math.abs(rate - nearest);

  for (const r of allowedRates) {
    const diff = Math.abs(rate - r);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = r;
    }
  }

  return { nearest, diff: minDiff };
}

function detectTaxBucket(taxAmount, taxable, allowedRates, ledgerPrefix) {
  const amount = round2(taxAmount);
  const base = Number(taxable || 0);

  if (amount <= 0.001) {
    return {
      rate: 0,
      rawRate: 0,
      ledgerName: `${ledgerPrefix} 0% ALC`,
      amount
    };
  }

  if (base <= 0.001) {
    return {
      rate: null,
      rawRate: 0,
      ledgerName: "WRONG% TAX",
      amount
    };
  }

  const rawRate = (amount / base) * 100;
  const { nearest, diff } = nearestAllowedRate(rawRate, allowedRates);

  if (diff > 1) {
    return {
      rate: null,
      rawRate,
      ledgerName: "WRONG% TAX",
      amount
    };
  }

  return {
    rate: nearest,
    rawRate,
    ledgerName: `${ledgerPrefix} ${formatRateLabel(nearest)}% ALC`,
    amount
  };
}

function buildNarration(igstInfo, cgstInfo, sgstInfo) {
  const parts = [];
  if (igstInfo && igstInfo.amount > 0.001) parts.push(`IGST ${formatRateLabel(igstInfo.rate ?? round2(igstInfo.rawRate))}%`);
  if (cgstInfo && cgstInfo.amount > 0.001) parts.push(`CGST ${formatRateLabel(cgstInfo.rate ?? round2(cgstInfo.rawRate))}%`);
  if (sgstInfo && sgstInfo.amount > 0.001) parts.push(`SGST ${formatRateLabel(sgstInfo.rate ?? round2(sgstInfo.rawRate))}%`);
  return parts.join(" | ");
}

function addLedgerXml(ledgerName, parentName) {
  const name = toCaps(ledgerName);
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${escapeXml(name)}" ACTION="Create"><NAME.LIST TYPE="String"><NAME>${escapeXml(name)}</NAME></NAME.LIST><PARENT>${escapeXml(parentName)}</PARENT></LEDGER></TALLYMESSAGE>\n`;
}

function getAdjustmentLedgerName(value) {
  return Math.abs(Number(value || 0)) > 10 ? "OUTPUT ADJUSTMENT ALC" : "ROUND OFF ALC";
}

function createVoucherXml({
  voucherType,
  voucherNumber,
  reference,
  date,
  partyLedgerName,
  partyAmount,
  billType = "New Ref",
  narration = "",
  ledgerEntries = []
}) {
  const partyName = toCaps(partyLedgerName);
  const partyAmt = round2(partyAmount).toFixed(2);

  let xml = `<TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
  xml += `<VOUCHER VCHTYPE="${escapeXml(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`;
  xml += `<DATE>${date}</DATE>\n`;
  xml += `<VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>\n`;
  xml += `<VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>\n`;
  xml += `<REFERENCE>${escapeXml(reference || voucherNumber)}</REFERENCE>\n`;
  xml += `<BASICBUYERNAME>${escapeXml(partyName)}</BASICBUYERNAME>\n`;
  xml += `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>\n`;
  xml += `<ISINVOICE>No</ISINVOICE>\n`;
  xml += `<PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>\n`;
  xml += `<NARRATION>${escapeXml(narration)}</NARRATION>\n`;

  xml += `<LEDGERENTRIES.LIST>\n`;
  xml += `<LEDGERNAME>${escapeXml(partyName)}</LEDGERNAME>\n`;
  xml += `<ISDEEMEDPOSITIVE>${partyAmt < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>\n`;
  xml += `<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n`;
  xml += `<ISLASTDEEMEDPOSITIVE>${partyAmt < 0 ? "Yes" : "No"}</ISLASTDEEMEDPOSITIVE>\n`;
  xml += `<AMOUNT>${partyAmt}</AMOUNT>\n`;
  xml += `<BILLALLOCATIONS.LIST>\n`;
  xml += `<NAME>${escapeXml(reference || voucherNumber)}</NAME>\n`;
  xml += `<BILLTYPE>${escapeXml(billType)}</BILLTYPE>\n`;
  xml += `<AMOUNT>${partyAmt}</AMOUNT>\n`;
  xml += `</BILLALLOCATIONS.LIST>\n`;
  xml += `</LEDGERENTRIES.LIST>\n`;

  ledgerEntries.forEach(entry => {
    const amt = round2(entry.amount).toFixed(2);
    xml += `<LEDGERENTRIES.LIST>\n`;
    xml += `<LEDGERNAME>${escapeXml(toCaps(entry.ledgerName))}</LEDGERNAME>\n`;
    xml += `<ISDEEMEDPOSITIVE>${Number(entry.amount) < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>\n`;
    xml += `<AMOUNT>${amt}</AMOUNT>\n`;
    xml += `</LEDGERENTRIES.LIST>\n`;
  });

  xml += `</VOUCHER>\n`;
  xml += `</TALLYMESSAGE>\n`;

  return xml;
}

function buildSalesVoucherXml(t) {
  const total = round2(t.Total || 0);
  const taxable = round2(t.Taxable || 0);
  const igst = round2(t.IGST || 0);
  const cgst = round2(t.CGST || 0);
  const sgst = round2(t.SGST || 0);

  const igstInfo = detectTaxBucket(igst, taxable, IGST_ALLOWED_RATES, "OUTPUT IGST");
  const cgstInfo = detectTaxBucket(cgst, taxable, GST_HALF_ALLOWED_RATES, "OUTPUT CGST");
  const sgstInfo = detectTaxBucket(sgst, taxable, GST_HALF_ALLOWED_RATES, "OUTPUT SGST");

  const entries = [
    { ledgerName: "SALES ACCOUNT", amount: taxable }
  ];

  if (igst > 0.001) entries.push({ ledgerName: igstInfo.ledgerName, amount: igst });
  if (cgst > 0.001) entries.push({ ledgerName: cgstInfo.ledgerName, amount: cgst });
  if (sgst > 0.001) entries.push({ ledgerName: sgstInfo.ledgerName, amount: sgst });

  const currentCredits = round2(entries.reduce((a, b) => a + b.amount, 0));
  const diff = round2(total - currentCredits);
  if (Math.abs(diff) > 0.001) entries.push({ ledgerName: getAdjustmentLedgerName(diff), amount: diff });

  return createVoucherXml({
    voucherType: "Sales",
    voucherNumber: t.Invoice,
    reference: t.Invoice,
    date: t.TallyDate,
    partyLedgerName: t.PartyName,
    partyAmount: -total,
    billType: "New Ref",
    narration: buildNarration(igstInfo, cgstInfo, sgstInfo),
    ledgerEntries: entries
  });
}

function buildCreditNoteVoucherXml(t) {
  const total = round2(t.Total || 0);
  const taxable = round2(t.Taxable || 0);
  const igst = round2(t.IGST || 0);
  const cgst = round2(t.CGST || 0);
  const sgst = round2(t.SGST || 0);

  const igstInfo = detectTaxBucket(igst, taxable, IGST_ALLOWED_RATES, "OUTPUT IGST");
  const cgstInfo = detectTaxBucket(cgst, taxable, GST_HALF_ALLOWED_RATES, "OUTPUT CGST");
  const sgstInfo = detectTaxBucket(sgst, taxable, GST_HALF_ALLOWED_RATES, "OUTPUT SGST");

  const entries = [
    { ledgerName: "SALES ACCOUNT", amount: -taxable }
  ];

  if (igst > 0.001) entries.push({ ledgerName: igstInfo.ledgerName, amount: -igst });
  if (cgst > 0.001) entries.push({ ledgerName: cgstInfo.ledgerName, amount: -cgst });
  if (sgst > 0.001) entries.push({ ledgerName: sgstInfo.ledgerName, amount: -sgst });

  const currentDebits = Math.abs(round2(entries.reduce((a, b) => a + b.amount, 0)));
  const diff = round2(total - currentDebits);
  if (Math.abs(diff) > 0.001) entries.push({ ledgerName: getAdjustmentLedgerName(diff), amount: -diff });

  return createVoucherXml({
    voucherType: "Credit Note",
    voucherNumber: t.Invoice,
    reference: t.RefInvoice || t.Invoice,
    date: t.TallyDate,
    partyLedgerName: t.PartyName,
    partyAmount: total,
    billType: "Agst Ref",
    narration: `CREDIT NOTE AGAINST ${t.RefInvoice || t.Invoice}${buildNarration(igstInfo, cgstInfo, sgstInfo) ? " | " + buildNarration(igstInfo, cgstInfo, sgstInfo) : ""}`,
    ledgerEntries: entries
  });
}

function buildDebitNoteVoucherXml(t) {
  const total = round2(t.Total || 0);
  const taxable = round2(t.Taxable || 0);
  const igst = round2(t.IGST || 0);
  const cgst = round2(t.CGST || 0);
  const sgst = round2(t.SGST || 0);

  const igstInfo = detectTaxBucket(igst, taxable, IGST_ALLOWED_RATES, "INPUT IGST");
  const cgstInfo = detectTaxBucket(cgst, taxable, GST_HALF_ALLOWED_RATES, "INPUT CGST");
  const sgstInfo = detectTaxBucket(sgst, taxable, GST_HALF_ALLOWED_RATES, "INPUT SGST");

  const entries = [
    { ledgerName: "PURCHASE ACCOUNT", amount: taxable }
  ];

  if (igst > 0.001) entries.push({ ledgerName: igstInfo.ledgerName, amount: igst });
  if (cgst > 0.001) entries.push({ ledgerName: cgstInfo.ledgerName, amount: cgst });
  if (sgst > 0.001) entries.push({ ledgerName: sgstInfo.ledgerName, amount: sgst });

  const currentCredits = round2(entries.reduce((a, b) => a + b.amount, 0));
  const diff = round2(total - currentCredits);
  if (Math.abs(diff) > 0.001) entries.push({ ledgerName: getAdjustmentLedgerName(diff), amount: diff });

  return createVoucherXml({
    voucherType: "Debit Note",
    voucherNumber: t.Invoice,
    reference: t.RefInvoice || t.Invoice,
    date: t.TallyDate,
    partyLedgerName: t.PartyName,
    partyAmount: -total,
    billType: "Agst Ref",
    narration: `DEBIT NOTE AGAINST ${t.RefInvoice || t.Invoice}${buildNarration(igstInfo, cgstInfo, sgstInfo) ? " | " + buildNarration(igstInfo, cgstInfo, sgstInfo) : ""}`,
    ledgerEntries: entries
  });
}

function generateTallyXML() {
  const billRows = monthSelector.value === "CONSOLIDATED"
    ? getAllRowsForReport("ALL_BILLS")
    : ((globalDataByMonth[monthSelector.value] && globalDataByMonth[monthSelector.value].ALL_BILLS) || []);

  const cdnRows = monthSelector.value === "CONSOLIDATED"
    ? getAllRowsForReport("CDN")
    : ((globalDataByMonth[monthSelector.value] && globalDataByMonth[monthSelector.value].CDN) || []);

  const salesRows = billRows.filter(r => ["B2B", "B2B RCM", "B2C Large", "B2C Small"].includes(r.Type));
  const transactions = [...salesRows, ...cdnRows];

  const uniqueLedgers = new Map();
  const allLedgerNames = new Set([
    "SALES ACCOUNT",
    "PURCHASE ACCOUNT",
    "ROUND OFF ALC",
    "OUTPUT ADJUSTMENT ALC",
    "WRONG% TAX"
  ]);

  transactions.forEach(t => {
    const partyName = toCaps(t.PartyName);
    if (!uniqueLedgers.has(partyName)) uniqueLedgers.set(partyName, t.GSTIN);

    const taxable = Number(t.Taxable || 0);
    const igst = Number(t.IGST || 0);
    const cgst = Number(t.CGST || 0);
    const sgst = Number(t.SGST || 0);

    if (t.Type === "Debit Note") {
      if (igst > 0.001) allLedgerNames.add(detectTaxBucket(igst, taxable, IGST_ALLOWED_RATES, "INPUT IGST").ledgerName);
      if (cgst > 0.001) allLedgerNames.add(detectTaxBucket(cgst, taxable, GST_HALF_ALLOWED_RATES, "INPUT CGST").ledgerName);
      if (sgst > 0.001) allLedgerNames.add(detectTaxBucket(sgst, taxable, GST_HALF_ALLOWED_RATES, "INPUT SGST").ledgerName);
    } else {
      if (igst > 0.001) allLedgerNames.add(detectTaxBucket(igst, taxable, IGST_ALLOWED_RATES, "OUTPUT IGST").ledgerName);
      if (cgst > 0.001) allLedgerNames.add(detectTaxBucket(cgst, taxable, GST_HALF_ALLOWED_RATES, "OUTPUT CGST").ledgerName);
      if (sgst > 0.001) allLedgerNames.add(detectTaxBucket(sgst, taxable, GST_HALF_ALLOWED_RATES, "OUTPUT SGST").ledgerName);
    }
  });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n<HEADER>\n<VERSION>1</VERSION>\n<TALLYREQUEST>Import</TALLYREQUEST>\n<TYPE>Data</TYPE>\n<ID>Vouchers</ID>\n</HEADER>\n<BODY>\n<DATA>\n`;

  allLedgerNames.forEach(name => {
    let parent = "Duties & Taxes";
    if (name === "SALES ACCOUNT") parent = "Sales Accounts";
    if (name === "PURCHASE ACCOUNT") parent = "Purchase Accounts";
    xml += addLedgerXml(name, parent);
  });

  uniqueLedgers.forEach((gstin, name) => {
    xml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${escapeXml(toCaps(name))}" ACTION="Create"><NAME.LIST TYPE="String"><NAME>${escapeXml(toCaps(name))}</NAME></NAME.LIST><PARENT>Sundry Debtors</PARENT>${gstin && gstin !== "URP" ? `<PARTYGSTIN>${escapeXml(gstin)}</PARTYGSTIN>` : ""}<ISBILLWISEON>Yes</ISBILLWISEON></LEDGER></TALLYMESSAGE>\n`;
  });

  salesRows.forEach(t => {
    xml += buildSalesVoucherXml(t);
  });

  cdnRows.forEach(t => {
    if (t.Type === "Credit Note") {
      xml += buildCreditNoteVoucherXml(t);
    } else if (t.Type === "Debit Note") {
      xml += buildDebitNoteVoucherXml(t);
    }
  });

  xml += `</DATA>\n</BODY>\n</ENVELOPE>`;
  return xml;
}

function buildExcelRows(reportKey, rows) {
  if (reportKey === "HSN") {
    return rows.map(r => ({
      HSN: r.HSN,
      Description: r.Description,
      TaxableValue: r.TaxableValue,
      IGST: r.IGST,
      CGST: r.CGST,
      SGST: r.SGST
    }));
  }

  if (reportKey === "ALL_BILLS") {
    return rows.map(r => ({
      Month: r.Month,
      Type: r.Type,
      InvoiceNo: r.Invoice,
      Date: r.DisplayDate,
      PartyName: r.PartyName,
      GSTIN: r.GSTIN,
      Taxable: r.Taxable,
      IGST: r.IGST,
      CGST: r.CGST,
      SGST: r.SGST,
      Cess: r.Cess,
      Total: r.Total,
      Section: r.SourceSection
    }));
  }

  return rows.map(r => ({
    Month: r.Month,
    Type: r.Type,
    InvoiceNo: r.Invoice,
    OriginalInvoice: r.OriginalInvoice || "",
    RefInvoice: r.RefInvoice || "",
    Date: r.DisplayDate,
    PartyName: r.PartyName,
    GSTIN: r.GSTIN,
    Taxable: r.Taxable,
    IGST: r.IGST,
    CGST: r.CGST,
    SGST: r.SGST,
    Cess: r.Cess,
    Total: r.Total,
    Section: r.SourceSection
  }));
}

async function handleFiles(files) {
  try {
    errorMsg.textContent = "";
    loadingIndicator.style.display = "block";
    results.style.display = "none";
    controlsBar.style.display = "none";

    const allFiles = Array.from(files || []);
    const jsonFiles = allFiles.filter(f => f.name.toLowerCase().endsWith(".json"));

    if (jsonFiles.length === 0) {
      throw new Error("Please upload valid JSON files.");
    }

    await processGSTR1Files(jsonFiles);

    if (Object.keys(globalDataByMonth).length === 0) {
      throw new Error("No valid data found in the files.");
    }

    updateDropdown();
    renderView();
    controlsBar.style.display = "flex";
    results.style.display = "block";
  } catch (err) {
    console.error(err);
    errorMsg.textContent = err.message || "Error while processing files.";
  } finally {
    loadingIndicator.style.display = "none";
  }
}

function bindUploadZone() {
  dropZone.addEventListener("click", () => fileInput.click());

  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "dragend"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");

    const files = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : null;
    if (!files || !files.length) return;

    await handleFiles(files);
  });

  fileInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    await handleFiles(files);
  });
}

const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const monthSelector = document.getElementById("monthSelector");
const reportSelector = document.getElementById("reportSelector");
const controlsBar = document.getElementById("controlsBar");
const results = document.getElementById("results");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const tableFooter = document.getElementById("tableFooter");
const btnUnifiedXML = document.getElementById("btnUnifiedXML");
const btnExcel = document.getElementById("btnExcel");
const btnFullBillsExcel = document.getElementById("btnFullBillsExcel");
const errorMsg = document.getElementById("errorMsg");
const loadingIndicator = document.getElementById("loadingIndicator");
const reportMeta = document.getElementById("reportMeta");

const missingGstinBox = document.getElementById("missingGstinBox");
const gstNamePasteBox = document.getElementById("gstNamePasteBox");
const btnRefreshNames = document.getElementById("btnRefreshNames");
const btnCopyMissing = document.getElementById("btnCopyMissing");
const btnDownloadMissingExcel = document.getElementById("btnDownloadMissingExcel");
const btnImportNames = document.getElementById("btnImportNames");
const btnSavePastedNames = document.getElementById("btnSavePastedNames");
const importNamesInput = document.getElementById("importNamesInput");

let globalDataByMonth = {};
let globalFY = null;

monthSelector.addEventListener("change", renderView);
reportSelector.addEventListener("change", renderView);

btnRefreshNames.addEventListener("click", async () => {
  try {
    await refreshNamesFromDB();
    alert("Names refreshed successfully.");
  } catch (err) {
    alert(err.message);
  }
});

btnCopyMissing.addEventListener("click", async () => {
  const missing = getMissingGSTINs();
  if (!missing.length) {
    alert("No missing GSTINs found.");
    return;
  }
  await navigator.clipboard.writeText(missing.join("\n"));
  alert("Missing GSTINs copied.");
});

btnDownloadMissingExcel.addEventListener("click", () => {
  const missing = getMissingGSTINs();
  if (!missing.length) {
    alert("No missing GSTINs found.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(missing.map(g => ({ GSTIN: g })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Missing GSTINs");
  XLSX.writeFile(wb, "Missing_GSTINs.xlsx");
});

btnImportNames.addEventListener("click", () => importNamesInput.click());

importNamesInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    await importNamesFile(file);
    alert("GST names imported successfully.");
  } catch (err) {
    alert(err.message);
  } finally {
    e.target.value = "";
  }
});

btnSavePastedNames.addEventListener("click", async () => {
  try {
    await savePastedNames();
    alert("GST names saved successfully.");
  } catch (err) {
    alert(err.message);
  }
});

btnUnifiedXML.addEventListener("click", () => {
  const fileName = monthSelector.value === "CONSOLIDATED"
    ? `TALLY_IMPORT_CONSOLIDATED_FY_${globalFY}.XML`
    : `TALLY_IMPORT_${monthSelector.value.replace(/\s+/g, "_").toUpperCase()}.XML`;

  const xmlString = generateTallyXML();
  const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
});

btnExcel.addEventListener("click", () => {
  const selectedReport = reportSelector.value;
  const rows = getRowsForCurrentSelection();

  if (!rows.length) {
    alert("No data available for this report.");
    return;
  }

  const dataToExport = buildExcelRows(selectedReport, rows);
  const ws = XLSX.utils.json_to_sheet(dataToExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, selectedReport);

  const fileLabel = monthSelector.value === "CONSOLIDATED"
    ? `${selectedReport}_FY_${globalFY}.xlsx`
    : `${selectedReport}_${monthSelector.value.replace(/\s+/g, "_")}.xlsx`;

  XLSX.writeFile(wb, fileLabel);
});

btnFullBillsExcel.addEventListener("click", () => {
  const rows = monthSelector.value === "CONSOLIDATED"
    ? getAllRowsForReport("ALL_BILLS")
    : ((globalDataByMonth[monthSelector.value] && globalDataByMonth[monthSelector.value].ALL_BILLS) || []);

  if (!rows.length) {
    alert("No full bills data available.");
    return;
  }

  const dataToExport = rows.map(r => ({
    Month: r.Month,
    FY: r.FY,
    Period: r.Period,
    Type: r.Type,
    InvoiceNo: r.Invoice,
    Date: r.DisplayDate,
    TallyDate: r.TallyDate,
    PartyName: r.PartyName,
    GSTIN: r.GSTIN,
    Taxable: r.Taxable,
    IGST: r.IGST,
    CGST: r.CGST,
    SGST: r.SGST,
    Cess: r.Cess,
    Total: r.Total,
    Section: r.SourceSection
  }));

  const ws = XLSX.utils.json_to_sheet(dataToExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Full Bills");
  const fileLabel = monthSelector.value === "CONSOLIDATED"
    ? `GSTR1_Full_Bills_FY_${globalFY}.xlsx`
    : `GSTR1_Full_Bills_${monthSelector.value.replace(/\s+/g, "_")}.xlsx`;

  XLSX.writeFile(wb, fileLabel);
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
});

bindUploadZone();
loadUserInfo();