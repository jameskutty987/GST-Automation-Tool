(function () {
  const root = document.getElementById("module-gstr1");
  if (!root) return;

  const dropZone = root.querySelector("#uploadDropZone");
  const fileInput = root.querySelector("#fileInput");
  const statusBox = root.querySelector("#statusBox");
  const fyLabel = root.querySelector("#fyLabel");
  const moduleStatus = root.querySelector("#moduleStatus");
  const controlsBar = root.querySelector("#controlsBar");
  const resultsWrap = root.querySelector("#resultsWrap");
  const reportTable = root.querySelector("#reportTable");
  const reportMeta = root.querySelector("#reportMeta");
  const reportType = root.querySelector("#reportType");
  const monthSelector = root.querySelector("#monthSelector");
  const downloadExcelBtn = root.querySelector("#downloadExcelBtn");
  const downloadXmlBtn = root.querySelector("#downloadXmlBtn");
  const downloadFullBillsBtn = root.querySelector("#downloadFullBillsBtn");
  const clearBtn = root.querySelector("#clearBtn");
  const refreshNamesBtn = root.querySelector("#refreshNamesBtn");
  const importNamesBtn = root.querySelector("#importNamesBtn");
  const downloadMissingBtn = root.querySelector("#downloadMissingBtn");
  const logoutInnerBtn = root.querySelector("#logoutInnerBtn");
  const importNamesInput = root.querySelector("#importNamesInput");
  const gstNamePasteBox = root.querySelector("#gstNamePasteBox");
  const missingGstinBox = root.querySelector("#missingGstinBox");

  const state = { rows: [], fy: null, months: [] };

  const round2 = (n) => +(Number(n || 0).toFixed(2));
  const clean = (v) => String(v ?? "").trim();
  const esc = (v) => String(v ?? "").replace(/[<>&'"]/g, ch => ({
    "<":"&lt;",
    ">":"&gt;",
    "&":"&amp;",
    "'":"&apos;",
    '"':"&quot;"
  }[ch]));

  function setStatus(msg) {
    if (moduleStatus) moduleStatus.value = msg;
    if (statusBox) statusBox.textContent = msg;
  }

  function ensureUIReady() {
    if (controlsBar) controlsBar.style.display = "flex";
    if (resultsWrap) resultsWrap.style.display = "block";
  }

  function getFY(fp) {
    const s = clean(fp);
    if (s.length !== 6) return "Unknown";
    const m = +s.slice(0, 2);
    const y = +s.slice(2);
    return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  function formatMonthLabel(fp) {
    const s = clean(fp);
    if (s.length !== 6) return "Unknown Month";
    const m = +s.slice(0, 2);
    const y = +s.slice(2);
    return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }

  function lastDay(fp) {
    const s = clean(fp);
    if (s.length !== 6) return { tally: "", display: "" };
    const m = +s.slice(0, 2);
    const y = +s.slice(2);
    const d = new Date(y, m, 0).getDate();
    return {
      tally: `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`,
      display: `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`
    };
  }

  function normDate(dateStr, fp) {
    const fallback = lastDay(fp);
    const raw = clean(dateStr);
    if (!raw) return fallback;
    const p = raw.split(/[-/]/);
    if (p.length !== 3) return fallback;

    let d, m, y;
    if (p[0].length === 4) {
      y = p[0]; m = p[1]; d = p[2];
    } else {
      d = p[0]; m = p[1]; y = p[2];
    }

    d = String(parseInt(d, 10)).padStart(2, "0");
    m = String(parseInt(m, 10)).padStart(2, "0");
    y = String(y).length === 2 ? `20${y}` : String(y);

    const dt = new Date(`${y}-${m}-${d}T00:00:00`);
    if (isNaN(dt.getTime())) return fallback;
    return { tally: `${y}${m}${d}`, display: `${d}-${m}-${y}` };
  }

  function refreshSelectors() {
    const months = [...new Set(state.rows.map(r => r.Month))].sort((a, b) => new Date(a) - new Date(b));
    state.months = months;

    if (monthSelector) {
      monthSelector.innerHTML = `<option value="ALL">All months</option>` +
        months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    }

    if (reportType && !reportType.options.length) {
      reportType.innerHTML = `
        <option value="b2b">B2B</option>
        <option value="b2c">B2C</option>
        <option value="hsn">HSN</option>
      `;
    }
  }

  function renderTable() {
    const monthFilter = monthSelector?.value || "ALL";
    const view = reportType?.value || "b2b";
    const rows = state.rows.filter(r => {
      const monthOk = monthFilter === "ALL" || r.Month === monthFilter;
      const viewOk = view === "b2b" ? r.Section === "B2B" : view === "b2c" ? r.Section === "B2C" : r.Section === "HSN";
      return monthOk && viewOk;
    });

    if (!rows.length) {
      reportMeta.textContent = "No rows available.";
      reportTable.innerHTML = `<div class="empty">No data loaded.</div>`;
      return;
    }

    const cols = Object.keys(rows[0]);
    reportMeta.textContent = `${rows.length} rows`;
    reportTable.innerHTML = `
      <table>
        <thead>
          <tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `<tr>${cols.map(c => `<td>${typeof row[c] === "number" ? row[c].toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : esc(row[c])}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function parseRowsFromFile(fileJson) {
    const fp = clean(fileJson.fp || fileJson.rtnprd || fileJson.ret_period || "");
    const fy = getFY(fp);
    const month = formatMonthLabel(fp);
    const doc = fileJson.docdata || fileJson.docsumm || fileJson;
    const rows = [];

    (doc.b2b || []).forEach(party => {
      (party.inv || []).forEach(inv => {
        (inv.itms || []).forEach(itm => {
          const det = itm.itm_det || {};
          rows.push({
            Month: month,
            Section: "B2B",
            Party: party.trdnm || party.lglNm || party.ctin || "",
            GSTIN: party.ctin || "",
            Invoice: inv.inum || "",
            Date: normDate(inv.idt || inv.dt, fp).display,
            TallyDate: normDate(inv.idt || inv.dt, fp).tally,
            HSN: det.hsn || det.hsnsc || "",
            Rate: det.rt || "",
            Taxable: round2(det.txval),
            IGST: round2(det.iamt),
            CGST: round2(det.camt),
            SGST: round2(det.samt),
            Total: round2(inv.val || (det.txval + det.iamt + det.camt + det.samt))
          });
        });
      });
    });

    (doc.b2cs || []).forEach(item => {
      rows.push({
        Month: month,
        Section: "B2C",
        Party: item.trdnm || item.ctin || "",
        GSTIN: item.ctin || "",
        Invoice: item.inum || "",
        Date: normDate(item.dt, fp).display,
        TallyDate: normDate(item.dt, fp).tally,
        HSN: item.hsn || "",
        Rate: item.rt || "",
        Taxable: round2(item.txval),
        IGST: round2(item.iamt),
        CGST: round2(item.camt),
        SGST: round2(item.samt),
        Total: round2(item.val || (item.txval + item.iamt + item.camt + item.samt))
      });
    });

    const hsnArr = doc.hsn?.data || doc.hsn || doc.hsn_data || [];
    (hsnArr || []).forEach(item => {
      rows.push({
        Month: month,
        Section: "HSN",
        Party: "",
        GSTIN: "",
        Invoice: "",
        Date: "",
        TallyDate: "",
        HSN: item.hsn_sc || item.hsn || "",
        Rate: item.rt || "",
        Taxable: round2(item.txval),
        IGST: round2(item.iamt),
        CGST: round2(item.camt),
        SGST: round2(item.samt),
        Total: round2((item.txval || 0) + (item.iamt || 0) + (item.camt || 0) + (item.samt || 0))
      });
    });

    return { rows, fy };
  }

  async function processFiles(files) {
    if (!files || !files.length) {
      setStatus("Please select one or more GSTR-1 JSON files.");
      return;
    }

    state.rows = [];
    state.fy = null;

    try {
      for (const file of files) {
        const json = JSON.parse(await file.text());
        const parsed = parseRowsFromFile(json);
        if (!state.fy) state.fy = parsed.fy;
        state.rows.push(...parsed.rows);
      }

      fyLabel.value = state.fy || "Unknown";
      ensureUIReady();
      refreshSelectors();
      renderTable();
      setStatus(`Processed ${files.length} file(s) successfully.`);
    } catch (err) {
      setStatus(err.message || "Failed to process files.");
    }
  }

  function openFilePicker() {
    fileInput?.click();
  }

  if (dropZone && fileInput) {
    dropZone.addEventListener("click", openFilePicker);
    dropZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFilePicker();
      }
    });
    dropZone.setAttribute("tabindex", "0");
    dropZone.style.cursor = "pointer";

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const files = e.dataTransfer?.files;
      if (files && files.length) processFiles(files);
    });

    fileInput.addEventListener("change", () => processFiles(fileInput.files));
  } else {
    console.error("GSTR-1 upload elements not found. Check IDs uploadDropZone and fileInput.");
  }

  monthSelector?.addEventListener("change", renderTable);
  reportType?.addEventListener("change", renderTable);

  clearBtn?.addEventListener("click", () => {
    state.rows = [];
    state.fy = null;
    fyLabel.value = "";
    setStatus("Waiting for files");
    reportTable.innerHTML = "";
    reportMeta.textContent = "No data loaded.";
  });

  downloadExcelBtn?.addEventListener("click", () => setStatus("Excel download not wired in this rewrite yet."));
  downloadXmlBtn?.addEventListener("click", () => setStatus("XML download not wired in this rewrite yet."));
  downloadFullBillsBtn?.addEventListener("click", () => setStatus("Full bills download not wired in this rewrite yet."));
  refreshNamesBtn?.addEventListener("click", () => setStatus("Refresh names not wired in this rewrite yet."));
  importNamesBtn?.addEventListener("click", () => importNamesInput?.click());
  importNamesInput?.addEventListener("change", () => setStatus("Import names file selected."));
  downloadMissingBtn?.addEventListener("click", () => setStatus("Missing GSTIN list not wired in this rewrite yet."));
  logoutInnerBtn?.addEventListener("click", async () => {
    if (window.supabaseClient) {
      await supabaseClient.auth.signOut();
      document.getElementById("authScreen")?.classList.remove("hidden");
      document.getElementById("dashboard")?.classList.add("hidden");
    }
  });

  setStatus("Upload one or more GSTR-1 JSON files from the same financial year.");
})();