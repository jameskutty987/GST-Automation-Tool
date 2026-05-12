<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GSTR-1 to Tally Pro V2</title>
  <link rel="stylesheet" href="css/styles.css" />
  <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
  <div class="app-shell">
    <div class="app-card">
      <div class="topbar">
        <div>
          <h1>GSTR-1 to Tally Pro V2</h1>
          <div class="small-note" id="userInfo">Checking session...</div>
        </div>
        <div class="btn-row" style="margin-top:0;">
          <button id="logoutBtn" type="button">Logout</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">GST Name Mapping</div>

        <div class="gst-grid">
          <div>
            <label for="missingGstinBox">Missing GSTINs</label>
            <textarea id="missingGstinBox" readonly placeholder="Missing GSTINs will appear here, one per line"></textarea>
            <div class="help-text">You can copy these or download them as Excel.</div>
          </div>

          <div>
            <label for="gstNamePasteBox">Paste GSTIN and Party Name</label>
            <textarea id="gstNamePasteBox" placeholder="32ABCDE1234F1Z5,ABC Traders&#10;29ABCDE1234F1Z7,XYZ Agencies"></textarea>
            <div class="help-text">Format: GSTIN, Party Name — one row per line.</div>
          </div>
        </div>

        <div class="btn-row">
          <button id="btnRefreshNames" type="button">Refresh Names</button>
          <button id="btnCopyMissing" type="button">Copy Missing GSTINs</button>
          <button id="btnDownloadMissingExcel" type="button">Download Missing GSTIN Excel</button>
          <button id="btnImportNames" type="button">Import GSTIN Name Excel/CSV</button>
          <button id="btnSavePastedNames" type="button">Save Pasted Names</button>
          <input type="file" id="importNamesInput" accept=".xlsx,.xls,.csv" class="hidden" />
        </div>
      </div>

      <div class="drop-zone" id="dropZone">
        <p><strong>Drag & Drop your GSTR-1 JSON file(s) here</strong></p>
        <p class="small-note">Upload multiple months to build a consolidated financial year report</p>
        <input type="file" id="fileInput" accept=".json" multiple />
      </div>

      <div id="loadingIndicator" class="status-loading">Processing files and validating financial year...</div>
      <div id="errorMsg" class="status-error"></div>

      <div class="controls-bar" id="controlsBar">
        <div class="filters">
          <label for="monthSelector">Month</label>
          <select id="monthSelector"></select>

          <label for="reportSelector">Report</label>
          <select id="reportSelector">
            <option value="B2B_RCM">B2B & RCM</option>
            <option value="B2CS">B2C Small</option>
            <option value="B2CL">B2C Large</option>
            <option value="CDN">Credit & Debit Note</option>
            <option value="AMENDMENTS">Amendments</option>
            <option value="HSN">HSN Summary</option>
            <option value="ALL_BILLS">All Bills</option>
          </select>
        </div>

        <div class="actions">
          <button id="btnUnifiedXML" class="btn-success" type="button">Download Tally XML</button>
          <button id="btnExcel" type="button">Download Excel Report</button>
          <button id="btnFullBillsExcel" type="button">Download Full Bills Excel</button>
        </div>
      </div>

      <div id="results" class="results-wrap">
        <div class="report-meta" id="reportMeta"></div>

        <div class="table-container">
          <table id="reportTable">
            <thead id="tableHead"></thead>
            <tbody id="tableBody"></tbody>
            <tfoot id="tableFooter"></tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script src="js/supabase-client.js"></script>
  <script src="js/gstr1-to-tally-pro-v2.js"></script>
</body>
</html>