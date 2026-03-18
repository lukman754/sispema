(() => {
  document.getElementById("sispema-tools")?.remove();

  // ── Helpers ──────────────────────────────────────────────────────
  function getCookie(name) {
    const match = document.cookie.split("; ").find((r) => r.startsWith(name + "="));
    return match ? decodeURIComponent(match.split("=")[1]) : "";
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function esc(v) {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? `"${s}"` : s;
  }

  // ── CSV builder (berkas dipecah per kolom) ────────────────────────
  // Normalisasi nama syarat → 2 kata pertama (deduplikasi variasi nama yg mirip)
  // Contoh: "Dokumentasi Kegiatan (Foto...)" → "Dokumentasi Kegiatan"
  //         "Link Publikasi (jika ada)"       → "Link Publikasi"
  function normSyarat(nama) {
    return String(nama || "").trim().split(/\s+/).slice(0, 2).join(" ");
  }

  function toCSV(results) {
    // Skip: "Surat Tugas Dosen Pembimbing" — "Surat Tugas Delegasi" tetap diambil
    const SKIP_SYARAT = (originalName) =>
      originalName.toLowerCase().includes("dosen pembimbing");

    // Kumpulkan semua nama_syarat unik (dinormalisasi 2 kata)
    const syaratSet = new Set();
    let maxAnggota = 0;
    results.forEach((item) => {
      const d = item.data ?? item;
      (d.berkas ?? []).forEach((b) => {
        if (!b.nama_syarat_prestasi) return;
        if (SKIP_SYARAT(b.nama_syarat_prestasi)) return;
        syaratSet.add(normSyarat(b.nama_syarat_prestasi));
      });
      // Hitung jumlah anggota terbanyak untuk menentukan lebar kolom
      maxAnggota = Math.max(maxAnggota, d.anggota?.length ?? 0);
    });
    const syaratList  = [...syaratSet];

    // Header anggota dinamis: NIM Anggota 1, Nama Anggota 1, NIM Anggota 2, ...
    const anggotaHeader = [];
    for (let i = 1; i <= maxAnggota; i++) {
      anggotaHeader.push(`NIM Anggota ${i}`, `Nama Anggota ${i}`);
    }

    const baseHeader = [
      "NIM Pengaju","Nama Mahasiswa","Email","Program Studi",
      "Jenis Prestasi","Kategori","Tingkat Wilayah","Jenis Juara",
      "Nama Prestasi","Penyelenggara",
      "Tgl Mulai","Tgl Selesai","Tgl Ajuan",
      "Jumlah Peserta","Status Validasi","Catatan",
      "ID Ajuan",
      ...anggotaHeader,
    ];
    const header = [...baseHeader, ...syaratList].join(",");

    // 1 row per prestasi — tidak ada duplikasi
    const rows = results.map((item) => {
      const d      = item.data ?? item;
      const berkas = d.berkas ?? [];

      // Map nama_syarat → url
      const berkasMap = {};
      berkas.forEach((b) => {
        if (!b.nama_syarat_prestasi) return;
        if (SKIP_SYARAT(b.nama_syarat_prestasi)) return;
        const key = normSyarat(b.nama_syarat_prestasi);
        if (!berkasMap[key]) {
          berkasMap[key] =
            b.url ?? `https://sispema.unpam.ac.id/prestasi/berkas/${b.id_berkas_ajuan_prestasi}`;
        }
      });

      const baseRow = [
        d.nim,
        d.mahasiswa?.nama_mahasiswa,
        d.mahasiswa?.email,
        d.program_studi?.nama_program_studi,
        d.id_jenis_prestasi,
        d.id_kategori_prestasi,
        d.id_jenis_tingkat_wilayah,
        d.id_jenis_juara_prestasi,
        d.nama_prestasi,
        d.nama_penyelenggara,
        d.tanggal_awal_lomba,
        d.tanggal_akhir_lomba,
        d.tanggal_ajuan,
        d.jumlah_peserta,
        d.validasi?.nama_status_validasi,
        d.catatan,
        d.id_ajuan_prestasi,
      ].map(esc);

      // Kolom anggota dinamis — dipad dengan "" jika jumlah anggota < maxAnggota
      const anggotaFields = [];
      for (let i = 0; i < maxAnggota; i++) {
        const a = d.anggota?.[i];
        anggotaFields.push(
          esc(a ? (a.mhs?.nim  ?? a.nim  ?? "") : ""),
          esc(a ? (a.mhs?.nama ?? a.nama ?? "") : ""),
        );
      }

      const berkasFields = syaratList.map((s) => esc(berkasMap[s] ?? ""));
      return [...baseRow, ...anggotaFields, ...berkasFields].join(",");
    });

    return "\uFEFF" + header + "\n" + rows.join("\n");
  }


  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── State ─────────────────────────────────────────────────────────
  const state = {
    token: localStorage.getItem("TOKEN") || "",
    xsrf:  localStorage.getItem("XSRF")  || getCookie("XSRF-TOKEN") || "",
  };

  // ── Auto-capture fetch ────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const h    = init?.headers || {};
    const auth = h["authorization"] || h["Authorization"] || "";
    const xsrf = h["x-xsrf-token"]  || h["X-XSRF-TOKEN"]  || "";
    if (auth && auth !== state.token) {
      state.token = auth; localStorage.setItem("TOKEN", auth);
      const el = document.getElementById("st-token"); if (el) el.value = auth;
      _log("🔑", "Bearer token auto-captured", "text-yellow-400");
    }
    if (xsrf && xsrf !== state.xsrf) {
      state.xsrf = xsrf; localStorage.setItem("XSRF", xsrf);
      const el = document.getElementById("st-xsrf"); if (el) el.value = xsrf;
      _log("🔐", "XSRF token auto-captured", "text-yellow-400");
    }
    return _fetch.apply(this, arguments);
  };

  // ── Auto-capture XHR ─────────────────────────────────────────────
  const _setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    const key = name.toLowerCase();
    if (key === "authorization" && value !== state.token) {
      state.token = value; localStorage.setItem("TOKEN", value);
      const el = document.getElementById("st-token"); if (el) el.value = value;
    }
    if (key === "x-xsrf-token" && value !== state.xsrf) {
      state.xsrf = value; localStorage.setItem("XSRF", value);
      const el = document.getElementById("st-xsrf"); if (el) el.value = value;
    }
    return _setHeader.apply(this, arguments);
  };

  // ── Inject Tailwind ───────────────────────────────────────────────
  if (!document.getElementById("st-tailwind")) {
    const s = document.createElement("script");
    s.id  = "st-tailwind";
    s.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(s);
  }
  if (!document.getElementById("st-font")) {
    const l = document.createElement("link");
    l.id   = "st-font";
    l.rel  = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(l);
  }

  const wrapper = document.createElement("div");
  wrapper.id = "sispema-tools";
  wrapper.style.cssText = "position:fixed;inset:0;z-index:999999;pointer-events:none;font-family:'Inter',sans-serif;";
  wrapper.innerHTML = `
<style>
  #sispema-tools *{box-sizing:border-box;}
  #st-panel ::-webkit-scrollbar{width:5px;height:5px;}
  #st-panel ::-webkit-scrollbar-track{background:#0a0a0a;}
  #st-panel ::-webkit-scrollbar-thumb{background:#333;border-radius:3px;}
  #st-panel input:focus,#st-panel select:focus{
    outline:none;border-color:#3b82f6!important;
    box-shadow:0 0 0 2px rgba(59,130,246,.15)!important;
  }
  @keyframes st-pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes st-spin{to{transform:rotate(360deg)}}
  .st-btn-sec{
    display:flex;align-items:center;justify-content:center;gap:5px;
    background:#1e1e1e;border:1px solid #2e2e2e;color:#c9d1d9;
    padding:7px 6px;border-radius:7px;cursor:pointer;font-size:11px;font-weight:500;
    font-family:'Inter',sans-serif;transition:all .15s;
  }
  .st-btn-sec:hover{background:#2a2a2a;border-color:#444;}
  .st-btn-pri{
    display:flex;align-items:center;justify-content:center;gap:5px;
    background:#2563eb;border:none;color:#fff;
    padding:7px 6px;border-radius:7px;cursor:pointer;font-size:11px;font-weight:600;
    font-family:'Inter',sans-serif;transition:all .15s;
    box-shadow:0 4px 14px rgba(37,99,235,.3);
  }
  .st-btn-pri:hover{background:#1d4ed8;}
</style>

<!-- FAB Circle Toggle -->
<button id="st-fab" title="SISPEMA Tools" style="
  pointer-events:auto;
  position:fixed;bottom:28px;right:28px;
  width:52px;height:52px;border-radius:50%;
  background:#2563eb;border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 6px 24px rgba(37,99,235,.45);
  transition:transform .2s,box-shadow .2s;
  z-index:2;
" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
  <svg id="st-fab-icon" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
    <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
  </svg>
</button>

<!-- Main Panel -->
<div id="st-panel" style="
  pointer-events:auto;
  display:none;
  position:fixed;top:16px;right:86px;
  width:900px;height:calc(100vh - 32px);
  background:#111;border:1px solid #222;border-radius:14px;
  box-shadow:0 30px 60px rgba(0,0,0,.8);
  overflow:hidden;
  flex-direction:column;
  z-index:1;
">

  <!-- Panel Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;
    padding:9px 16px;background:#161616;border-bottom:1px solid #222;flex-shrink:0;">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="background:#2563eb;padding:5px;border-radius:7px;display:flex;">
        <svg width="13" height="13" fill="none" stroke="#fff" stroke-width="2.5" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
      </div>
      <span style="font-size:13px;font-weight:700;color:#f0f0f0;letter-spacing:-.3px;">SISPEMA TOOLS
        <span style="font-size:10px;font-weight:400;color:#555;margin-left:6px;">v3.1.0</span>
      </span>
    </div>
    <!-- Auth indicator + hidden inputs -->
    <div style="display:flex;align-items:center;gap:10px;">
      <span id="st-auth-label" style="font-size:10px;color:#555;font-family:'JetBrains Mono',monospace;">auth: —</span>
      <input id="st-token" type="hidden" />
      <input id="st-xsrf"  type="hidden" />
      <span id="st-dot" style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;animation:st-pulse 2s infinite;"></span>
      <button id="st-panel-close" style="color:#444;background:none;border:none;cursor:pointer;padding:3px;display:flex;margin-left:4px;"
        onmouseover="this.style.color='#aaa'" onmouseout="this.style.color='#444'">
        <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Two Column Body -->
  <div style="display:grid;grid-template-columns:300px 1fr;flex:1;overflow:hidden;">

    <!-- ── LEFT: Controls ── -->
    <div style="display:flex;flex-direction:column;gap:12px;padding:14px;
      border-right:1px solid #1e1e1e;overflow-y:auto;">

      <!-- Filters -->
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;">FILTERS</span>
          <span style="font-size:9px;color:#444;">kosong = semua</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:#666;width:52px;flex-shrink:0;">Jenis</span>
            <select id="st-jenis" style="flex:1;background:#181818;border:1px solid #2a2a2a;color:#ccc;font-size:11px;border-radius:6px;padding:5px 8px;">
              <option value="">Semua</option>
              <option value="A">Akademik</option>
              <option value="N">Non Akademik</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:#666;width:52px;flex-shrink:0;">Kategori</span>
            <select id="st-kategori" style="flex:1;background:#181818;border:1px solid #2a2a2a;color:#ccc;font-size:11px;border-radius:6px;padding:5px 8px;">
              <option value="">Semua</option>
              <option value="I">Individu</option>
              <option value="K">Kelompok</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:#666;width:52px;flex-shrink:0;">Wilayah</span>
            <select id="st-wilayah" style="flex:1;background:#181818;border:1px solid #2a2a2a;color:#ccc;font-size:11px;border-radius:6px;padding:5px 8px;">
              <option value="">Semua</option>
              <option value="I">Internasional</option>
              <option value="N">Nasional</option>
              <option value="P">Provinsi</option>
              <option value="W">Wilayah</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Batch & Delay -->
      <div style="background:#161616;border:1px solid #222;border-radius:8px;padding:10px;">
        <span style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px;">BATCH CONFIG</span>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:10px;color:#666;">Batch</span>
              <input id="st-batch" type="number" value="10" min="1" max="50"
                style="width:46px;background:#0d0d0d;border:1px solid #2a2a2a;color:#ddd;font-size:11px;border-radius:5px;padding:3px 6px;text-align:center;" />
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:10px;color:#666;">Delay</span>
              <input id="st-delay" type="number" value="5" min="1" max="60"
                style="width:42px;background:#0d0d0d;border:1px solid #2a2a2a;color:#ddd;font-size:11px;border-radius:5px;padding:3px 6px;text-align:center;" />
              <span style="font-size:10px;color:#555;">dtk</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:10px;color:#666;">Limit</span>
            <input id="st-limit" type="number" value="0" min="0" placeholder="∞"
              style="width:50px;background:#0d0d0d;border:1px solid #2a2a2a;color:#ddd;font-size:11px;border-radius:5px;padding:3px 6px;text-align:center;" title="Batas jumlah data (0 = semua)" />
          </div>
        </div>
        <p id="st-eta-main" style="font-size:10px;color:#60a5fa;font-weight:600;">estimasi: —</p>
        <p id="st-eta-sub"  style="font-size:9px;color:#444;margin-top:1px;">—</p>
      </div>

      <!-- Action Buttons -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <button id="st-btn-xsrf"  class="st-btn-sec">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> XSRF
        </button>
        <button id="st-btn-save"  class="st-btn-sec">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg> Save
        </button>
        <button id="st-btn-test"  class="st-btn-sec" style="grid-column:span 2;">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Test
        </button>
        <button id="st-btn-load"  class="st-btn-pri" style="grid-column:span 2;">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> Load Data
        </button>
        <button id="st-btn-json"  class="st-btn-sec">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg> JSON
        </button>
        <button id="st-btn-csv"   class="st-btn-sec">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> CSV
        </button>
      </div>

      <!-- Footer info -->
      <div style="margin-top:auto;padding-top:10px;border-top:1px solid #1e1e1e;">
        <p style="font-size:9px;color:#444;">API: sispema.unpam.ac.id</p>
        <p style="font-size:9px;color:#333;margin-top:3px;">Ctrl+L — clear log</p>
      </div>
    </div>

    <!-- ── RIGHT: Log + Output ── -->
    <div style="display:flex;flex-direction:column;overflow:hidden;">

      <!-- Activity Log -->
      <div id="st-log" style="
        height:100px;flex-shrink:0;
        background:#0a0a0a;border-bottom:1px solid #1a1a1a;
        padding:8px 12px;overflow-y:auto;
      "></div>

      <!-- JSON Output -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:5px 12px;background:#141414;border-bottom:1px solid #1e1e1e;flex-shrink:0;">
          <span style="font-size:9px;color:#555;font-family:'JetBrains Mono',monospace;letter-spacing:.5px;">response.json</span>
          <span id="st-status-badge" style="font-size:9px;color:#22c55e;font-weight:700;font-family:'JetBrains Mono',monospace;letter-spacing:1px;">READY</span>
        </div>
        <textarea id="st-output" style="
          flex:1;width:100%;resize:none;border:none;
          background:#0a0a0a;color:#4ade80;font-size:11px;
          padding:10px 12px;font-family:'JetBrains Mono',monospace;line-height:1.6;
        " placeholder="// JSON output will appear here..."></textarea>
      </div>
    </div>

  </div>
</div>
  `;
  document.body.appendChild(wrapper);

  // ── Refs ─────────────────────────────────────────────────────────
  const tokenEl  = document.getElementById("st-token");
  const xsrfEl   = document.getElementById("st-xsrf");
  const logEl    = document.getElementById("st-log");
  const outputEl = document.getElementById("st-output");
  const delayEl  = document.getElementById("st-delay");
  const batchEl  = document.getElementById("st-batch");
  const limitEl  = document.getElementById("st-limit");
  const badge    = document.getElementById("st-status-badge");
  
  // Update auth indicator label in header
  function updateAuthLabel() {
    const el = document.getElementById("st-auth-label");
    if (el) el.textContent = tokenEl.value ? "auth: ✓" : "auth: —";
  }

  // ── Log ───────────────────────────────────────────────────────────
  const ICONS = { "✅":"#22c55e","❌":"#ef4444","⚠️":"#f59e0b","⏳":"#f59e0b",
                  "🔑":"#fbbf24","🔐":"#fbbf24","📄":"#6b7280","🔍":"#60a5fa","💡":"#a78bfa" };
  function _log(icon, msg, colorClass) {
    const color = ICONS[icon] ?? "#9ca3af";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;";
    row.innerHTML = `
      <span style="font-size:11px;line-height:1.5;">${icon}</span>
      <span style="font-size:11px;color:${colorClass ? "" : color};font-family:'JetBrains Mono',monospace;
        line-height:1.5;${colorClass ? `color:${color}` : ""}">${msg}</span>`;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── ETA ───────────────────────────────────────────────────────────
  function updateEta(total) {
    const limit   = Math.max(0, parseInt(limitEl.value) || 0);
    const count   = (limit > 0 && total > limit) ? limit : total;

    const batch   = Math.max(1, parseInt(batchEl.value) || 10);
    const delay   = Math.max(1, parseInt(delayEl.value) || 5);
    const nBatch  = Math.ceil((count || 1) / batch);
    const seconds = (nBatch - 1) * delay + nBatch * 1.5;
    document.getElementById("st-eta-main").textContent = count
      ? `estimasi: ~${Math.ceil(seconds / 60)} menit`
      : "estimasi: —";
    document.getElementById("st-eta-sub").textContent = count
      ? `${count} data, ${nBatch} batch${limit > 0 && total > limit ? " (limited)" : ""}`
      : "—";
  }
  [delayEl, batchEl, limitEl].forEach((el) => el.addEventListener("input", () => updateEta(0)));

  // ── Query builder ─────────────────────────────────────────────────
  function buildQuery(page, perPage = 100) {
    const jenis    = document.getElementById("st-jenis").value;
    const kategori = document.getElementById("st-kategori").value;
    const wilayah  = document.getElementById("st-wilayah").value;
    let q = `/api/prestasi/ajuan?page=${page}&per_page=${perPage}&id_status_validasi=4`;
    if (kategori) q += `&id_kategori_prestasi=${kategori}`;
    if (jenis)    q += `&id_jenis_prestasi=${jenis}`;
    if (wilayah)  q += `&id_jenis_tingkat_wilayah=${wilayah}`;
    return q;
  }

  function getFilterLabel() {
    return [
      document.getElementById("st-jenis").selectedOptions[0].text,
      document.getElementById("st-kategori").selectedOptions[0].text,
      document.getElementById("st-wilayah").selectedOptions[0].text,
    ].filter((v) => v !== "Semua").join("_") || "Semua";
  }

  // ── XSRF refresh ─────────────────────────────────────────────────
  function refreshXsrf() {
    const fromCookie = getCookie("XSRF-TOKEN");
    if (fromCookie && fromCookie !== xsrfEl.value) {
      xsrfEl.value = fromCookie;
      state.xsrf   = fromCookie;
      localStorage.setItem("XSRF", fromCookie);
      _log("🔐", "XSRF diperbarui dari cookie");
    }
  }

  // ── Init ──────────────────────────────────────────────────────────
  tokenEl.value = state.token;
  xsrfEl.value  = state.xsrf;
  refreshXsrf();
  updateAuthLabel();
  if (state.token) _log("✅", "Token dimuat dari localStorage");
  else _log("⏳", "Lakukan aksi di halaman untuk capture token...");

  // Ctrl+L clear logs
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "l") { e.preventDefault(); logEl.innerHTML = ""; }
  });

  // ── Button handlers ───────────────────────────────────────────────
  // ── FAB Circle Toggle ─────────────────────────────────────────────
  const panelEl  = document.getElementById("st-panel");
  const fabIconEl = document.getElementById("st-fab-icon");
  let panelOpen = false;

  function togglePanel(forceClose) {
    panelOpen = forceClose ? false : !panelOpen;
    panelEl.style.display = panelOpen ? "flex" : "none";
    // FAB icon: ⚡ saat tutup, × saat buka
    fabIconEl.innerHTML = panelOpen
      ? `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`
      : `<path d="M13 10V3L4 14h7v7l9-11h-7z"/>`;
  }

  document.getElementById("st-fab").onclick = () => togglePanel();
  document.getElementById("st-panel-close").onclick = () => togglePanel(true);
  document.getElementById("st-btn-xsrf").onclick = () => {
    refreshXsrf();
    _log("🔄", "XSRF di-refresh dari cookie");
  };

  document.getElementById("st-btn-save").onclick = () => {
    state.token = tokenEl.value;
    state.xsrf  = xsrfEl.value;
    localStorage.setItem("TOKEN", state.token);
    localStorage.setItem("XSRF", state.xsrf);
    _log("✅", "Token disimpan");
  };

  document.getElementById("st-btn-test").onclick = async () => {
    refreshXsrf();
    _log("🔍", "Testing auth...");
    try {
      const res  = await _fetch(buildQuery(1, 1), {
        headers: { authorization: tokenEl.value, "x-xsrf-token": xsrfEl.value, accept: "application/json" },
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok) {
        const total = json.total ?? json.data?.length ?? 0;
        badge.textContent = "200 OK";
        badge.style.color = "#22c55e";
        _log("✅", `Auth OK! Total dengan filter ini: ${total}`);
        updateEta(total);
      } else {
        badge.textContent = `${res.status} ERR`;
        badge.style.color = "#ef4444";
        _log("❌", `HTTP ${res.status} — ${JSON.stringify(json).slice(0, 80)}`);
        if (res.status === 401) _log("⚠️", "Token expired — navigasi halaman lain dulu");
      }
    } catch (e) { _log("❌", e.message); }
  };

  document.getElementById("st-btn-load").onclick = async () => {
    refreshXsrf();
    const tok        = tokenEl.value;
    const xs         = xsrfEl.value;
    const BATCH      = Math.max(1, parseInt(batchEl.value) || 10);
    const LIMIT      = Math.max(0, parseInt(limitEl.value) || 0);
    const batchDelay = Math.max(1, parseInt(delayEl.value) || 5) * 1000;

    if (!tok) return _log("⚠️", "Token kosong!");

    const headers = { authorization: tok, "x-xsrf-token": xs, accept: "application/json" };

    // Step 1
    _log("⏳", `Step 1: Fetch list — ${getFilterLabel()}`);
    outputEl.value = "";
    badge.textContent = "LOADING";
    badge.style.color = "#f59e0b";
    let page = 1, ids = [];

    while (true) {
      const res = await _fetch(buildQuery(page), { headers, credentials: "include" });
      if (res.status === 401) {
        _log("❌", "401 — navigasi halaman lain untuk refresh token");
        badge.textContent = "401 ERR"; badge.style.color = "#ef4444";
        return;
      }
      const json = await res.json();
      if (!json.data || json.data.length === 0) break;
      ids.push(...json.data.map((d) => d.id_ajuan_prestasi));
      _log("📄", `Page ${page} — ${json.data.length} ajuan (total: ${ids.length})`);
      page++;
      await sleep(500);
    }

    if (ids.length === 0) return _log("⚠️", "Tidak ada data dengan filter ini");

    // Terapkan Limit jika ada
    if (LIMIT > 0 && ids.length > LIMIT) {
      ids = ids.slice(0, LIMIT);
      _log("💡", `Limit diterapkan: hanya mengambil ${LIMIT} data teratas`);
    }

    updateEta(ids.length);
    _log("✅", `${ids.length} ajuan — ${document.getElementById("st-eta-main").textContent}`);

    // Step 2
    const results    = [];
    const totalBatch = Math.ceil(ids.length / BATCH);

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch    = ids.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      _log("🔍", `Batch ${batchNum}/${totalBatch} — ${batch.length} paralel...`);

      const settled = await Promise.allSettled(
        batch.map((id) =>
          _fetch(`/api/prestasi/ajuan/${id}`, { headers, credentials: "include" })
            .then((r) => {
              if (r.status === 429) throw new Error("429 Too Many Requests");
              if (!r.ok)           throw new Error(`HTTP ${r.status}`);
              return r.json();
            })
        )
      );

      settled.forEach((res, j) => {
        if (res.status === "fulfilled") {
          results.push(res.value);
        } else {
          _log("⚠️", `[${i+j+1}] ${batch[j].slice(0,8)}… ${res.reason}`);
          results.push({ id_ajuan_prestasi: batch[j], error: res.reason?.message });
        }
      });

      if (i + BATCH < ids.length) {
        _log("⏳", `Tunggu ${delayEl.value}s...`);
        await sleep(batchDelay);
      }
    }

    outputEl.value = JSON.stringify(results, null, 2);
    const ok = results.filter((r) => !r.error).length;
    badge.textContent = "200 OK"; badge.style.color = "#22c55e";
    _log("✅", `Selesai! ${ok}/${results.length} berhasil`);
    _log("💡", 'Klik "JSON" atau "CSV" untuk export');
  };

  document.getElementById("st-btn-json").onclick = () => {
    if (!outputEl.value) return _log("⚠️", "Output kosong");
    navigator.clipboard.writeText(outputEl.value)
      .then(() => _log("✅", "JSON berhasil dicopy!"))
      .catch(() => { outputEl.select(); _log("⚠️", "Select manual → Ctrl+C"); });
  };

  document.getElementById("st-btn-csv").onclick = () => {
    if (!outputEl.value) return _log("⚠️", "Output kosong, jalankan Load dulu");
    let results;
    try { results = JSON.parse(outputEl.value); }
    catch { return _log("❌", "Output bukan JSON valid"); }
    const csv      = toCSV(results);
    const label    = getFilterLabel().replace(/\s+/g, "_");
    const ts       = new Date().toISOString().slice(0, 10);
    const filename = `sispema_prestasi_${label}_${ts}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    _log("✅", `CSV disimpan: ${filename}`);
  };
})();