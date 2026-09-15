(function () {
  "use strict";

  // Check if extension UI is already injected
  if (document.getElementById("sispema-validator-root-container")) return;

  // --- Inject CSS for Host Page ---
  const hostStyle = document.createElement("style");
  hostStyle.id = "sispema-validator-host-styles";
  hostStyle.textContent = `
    #sispema-validator-root-container {
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        z-index: 9999999;
        font-family: system-ui, -apple-system, sans-serif;
        pointer-events: none;
    }
    #sispema-validator-iframe {
        position: absolute;
        top: 0;
        right: 0;
        width: 375px;
        height: 100vh;
        border: none;
        border-left: 1px solid #d1c3ca;
        box-shadow: -5px 0 25px rgba(0,0,0,0.15);
        background: #f8f9fa;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto;
    }
    #sispema-validator-iframe.open {
        transform: translateX(0);
    }
    #sispema-validator-toggle {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #57344f;
        color: white;
        border: none;
        box-shadow: 0 4px 15px rgba(87, 52, 79, 0.4);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto;
        font-size: 24px;
        font-weight: bold;
    }
    #sispema-validator-toggle:hover {
        transform: scale(1.08);
        background: #714b67;
        box-shadow: 0 6px 20px rgba(87, 52, 79, 0.5);
    }
    #sispema-validator-toggle:active {
        transform: scale(0.95);
    }
    #sispema-validator-toggle.hidden-toggle {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.5) translateY(50px);
    }
  `;
  document.head.appendChild(hostStyle);

  // --- Create Container and DOM Elements ---
  const container = document.createElement("div");
  container.id = "sispema-validator-root-container";

  const iframe = document.createElement("iframe");
  iframe.id = "sispema-validator-iframe";
  iframe.src = chrome.runtime.getURL("panel.html");

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "sispema-validator-toggle";
  toggleBtn.innerHTML = "⚡";
  toggleBtn.title = "Buka Auto Validator";

  container.appendChild(iframe);
  container.appendChild(toggleBtn);
  document.body.appendChild(container);

  // --- State Variables for Validation ---
  let isBulkRunning = false;
  let bulkStats = { diambil: 0, filter: 0, validasi: 0 };
  let fetchedIdsList = [];
  let filteredIdsList = [];
  let validatedIdsList = [];
  let currentProgress = 0;
  let activeConfig = null;

  // --- UI Open/Close Actions ---
  function openPanel() {
    iframe.classList.add("open");
    toggleBtn.classList.add("hidden-toggle");
  }

  function closePanel() {
    iframe.classList.remove("open");
    toggleBtn.classList.remove("hidden-toggle");
  }

  toggleBtn.addEventListener("click", openPanel);

  // --- Helper Functions ---
  const getXsrfToken = () => {
    return decodeURIComponent(
      document.cookie
        .split("; ")
        .find((r) => r.startsWith("XSRF-TOKEN="))
        ?.split("=")[1] || "",
    );
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const KATEGORI_LUARAN_IDS = [
    "KLU01",
    "KLU02",
    "KLU03",
    "KLU04",
    "KLU05",
    "KLU06",
    "KLU09",
    "KLU12",
    "KLU13",
    "KLU14",
    "KLU16",
    "KLU17",
    "KLU18",
    "KLU19",
    "KLU20",
  ];

  // --- Fetch rate-limiting engine ---
  const fetchWithRateLimit = async (
    url,
    token,
    maxRetry,
    delayMs,
    logCb,
    options = {},
  ) => {
    const xsrf = getXsrfToken();
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      if (!isBulkRunning && options.method !== "GET") {
        // Stop fetching if cancelled during active request
        return null;
      }
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-XSRF-TOKEN": xsrf,
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
          ...options,
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const waitMs =
            retryAfter && !isNaN(parseInt(retryAfter))
              ? parseInt(retryAfter) * 1000
              : 3000 * attempt;
          logCb(`Rate limit terdeteksi, menunggu ${waitMs}ms...`, "warning");
          await delay(waitMs);
          continue;
        }

        if (!res.ok) {
          logCb(`Error ${res.status}: ${res.statusText}`, "error");
          return null;
        }

        const ct = res.headers.get("Content-Type") || "";
        if (ct.includes("application/json")) return res.json();
        return null;
      } catch (err) {
        logCb(`Koneksi error: ${err.message}`, "error");
        await delay(2000 * attempt);
      }
    }
    logCb(`Gagal memproses setelah ${maxRetry} percobaan`, "error");
    return null;
  };

  // --- API Wrapper Functions ---
  // const getIds = async (page, config, logCb) => {
  //   let url = `${API_BASE}?page=${page}&per_page=${config.perPage}&id_status_validasi=0`;
  //   if (config.semesterAjuan) {
  //     url += `&id_semester_ajuan=${config.semesterAjuan}`;
  //   }
  //   const res = await fetchWithRateLimit(
  //     url,
  //     config.token,
  //     config.maxRetry,
  //     config.delay,
  //     logCb,
  //     { method: "GET" },
  //   );
  //   return res?.data?.map((item) => item.id_ajuan_rekognisi_kegiatan) || [];
  // };

  const parseApprovalStatus = (str) => {
    if (!str) return null;
    const match = str.match(/^(\d+)\/(\d+)\s+Disetujui/i);
    if (!match) return null;
    const current = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    return { current, total, allApproved: current === total && total > 0 };
  };

  const findIdAjuanKey = (item) => {
    if (!item) return "";
    const key = Object.keys(item).find((k) => k.startsWith("id_ajuan"));
    return key ? item[key] : "";
  };

  const findNamaAjuanKey = (item) => {
    if (!item) return "";
    const key = Object.keys(item).find((k) => k.startsWith("nama_ajuan"));
    return key ? item[key] : "";
  };

  const TYPE_CONFIGS = {
    rekognisi: {
      apiBase: "https://sispema.unpam.ac.id/api/rekognisi-kegiatan/ajuan",
      apiValidasi:
        "https://sispema.unpam.ac.id/api/rekognisi-kegiatan/validasi",
      mapListItem: (item) => ({
        id: item.id_ajuan_rekognisi_kegiatan || findIdAjuanKey(item),
        nim: item.ucr || item.mahasiswa?.nim || "",
        nama: item.mahasiswa?.nama || "",
        namaAjuan: item.nama_ajuan || findNamaAjuanKey(item),
        semester: item.id_semester_ajuan || "",
        tahunKegiatan: item.tahun_kegiatan || "",
      }),
      isEligible: (detail) => {
        const vPembimbing = detail.v_pembimbing ?? null;
        const vAnggota = detail.v_anggota ?? null;
        const pemb = parseApprovalStatus(vPembimbing);
        const ang = parseApprovalStatus(vAnggota);
        const pembNull = vPembimbing === null;
        const angNull = vAnggota === null;

        if (pemb?.allApproved && ang?.allApproved) return true;
        if (pembNull && angNull) return true;
        if (pembNull && ang?.allApproved) return true;
        if (angNull && pemb?.allApproved) return true;
        return false;
      },
    },
    luaran: {
      apiBase: "https://sispema.unpam.ac.id/api/luaran/ajuan",
      apiValidasi: "https://sispema.unpam.ac.id/api/luaran/validasi",
      mapListItem: (item) => ({
        id: item.id_ajuan_luaran || findIdAjuanKey(item),
        nim: item.ucr || item.mahasiswa?.nim || "",
        nama: item.mahasiswa?.nama || "",
        namaAjuan:
          item.nama_ajuan_luaran || item.nama_luaran || findNamaAjuanKey(item),
        semester: item.id_semester || item.id_semester_ajuan || "",
        kategoriLuaran:
          item.id_kategori_luaran ||
          item.kategori_luaran?.id_kategori_luaran ||
          "",
        namaKategoriLuaran: item.kategori_luaran?.nama_kategori_luaran || "",
      }),
      isEligible: (detail) => {
        return true;
      },
    },
    publikasi: {
      apiBase: "https://sispema.unpam.ac.id/api/publikasi/ajuan",
      apiValidasi: "https://sispema.unpam.ac.id/api/publikasi/validasi",
      mapListItem: (item) => ({
        id: item.id_ajuan_publikasi || findIdAjuanKey(item),
        nim: item.ucr || item.mahasiswa?.nim || "",
        nama: item.mahasiswa?.nama || "",
        namaAjuan: item.nama_ajuan_publikasi || findNamaAjuanKey(item),
        semester: item.id_semester_ajuan || item.id_semester || "",
        kategoriPublikasi:
          item.id_kategori_publikasi ||
          item.kategori_publikasi?.id_kategori_publikasi ||
          "",
        namaKategoriPublikasi:
          item.kategori_publikasi?.nama_kategori_publikasi || "",
      }),
      isEligible: (detail) => {
        return true;
      },
    },
    prestasi: {
      apiBase: "https://sispema.unpam.ac.id/api/prestasi/ajuan",
      apiValidasi: "https://sispema.unpam.ac.id/api/prestasi/validasi",
      statusValidasiQuery: "1",
      mapListItem: (item) => ({
        id: item.id_ajuan_prestasi || findIdAjuanKey(item),
        nim: item.ucr || item.mahasiswa?.nim || item.nim || "",
        nama: item.mahasiswa?.nama_mahasiswa || item.mahasiswa?.nama || "",
        namaAjuan: item.nama_prestasi || findNamaAjuanKey(item),
        semester: item.id_semester_ajuan || item.id_semester || "",
      }),
      isEligible: (detail) => {
        return true;
      },
    },
  };

  const getIds = async (page, config, logCb) => {
    const typeCfg =
      TYPE_CONFIGS[config.validationType] || TYPE_CONFIGS.rekognisi;
    const statusVal = typeCfg.statusValidasiQuery ?? "0";
    let url = `${typeCfg.apiBase}?page=${page}&per_page=${config.perPage}&id_status_validasi=${statusVal}`;
    if (config.semesterAjuan) {
      if (config.validationType === "luaran") {
        url += `&id_semester=${config.semesterAjuan}`;
      } else {
        url += `&id_semester_ajuan=${config.semesterAjuan}`;
      }
    }
    if (config.validationType === "luaran" && config.kategoriLuaran) {
      url += `&id_kategori_luaran=${encodeURIComponent(config.kategoriLuaran)}`;
    }
    if (config.validationType === "rekognisi" && config.kategoriRekognisi) {
      url += `&id_kategori_rekognisi_kegiatan=${encodeURIComponent(config.kategoriRekognisi)}`;
    }
    if (config.validationType === "publikasi" && config.kategoriPublikasi) {
      url += `&id_kategori_publikasi=${encodeURIComponent(config.kategoriPublikasi)}`;
    }
    const res = await fetchWithRateLimit(
      url,
      config.token,
      config.maxRetry,
      config.delay,
      logCb,
      { method: "GET" },
    );
    return res?.data?.map(typeCfg.mapListItem) || [];
  };

  const getLuaranCategories = async (token, logCb) => {
    const res = await fetchWithRateLimit(
      "https://sispema.unpam.ac.id/api/luaran/kategori",
      token,
      3,
      1500,
      logCb,
      { method: "GET" },
    );
    return (res?.data || []).filter((category) =>
      KATEGORI_LUARAN_IDS.includes(category.id_kategori_luaran),
    );
  };

  const getRekognisiCategories = async (token, logCb) => {
    const res = await fetchWithRateLimit(
      "https://sispema.unpam.ac.id/api/rekognisi-kegiatan/kategori",
      token,
      3,
      1500,
      logCb,
      { method: "GET" },
    );
    return res?.data || [];
  };

  const getDetailAjuan = async (id, token, config, logCb) => {
    const typeCfg =
      TYPE_CONFIGS[config.validationType] || TYPE_CONFIGS.rekognisi;
    const json = await fetchWithRateLimit(
      `${typeCfg.apiBase}/${id}`,
      token,
      config.maxRetry,
      config.delay,
      logCb,
      {
        method: "GET",
      },
    );
    return json?.data || null;
  };

  const validateAjuan = async (id, token, config, logCb) => {
    const typeCfg =
      TYPE_CONFIGS[config.validationType] || TYPE_CONFIGS.rekognisi;
    const payload = { id_status_validasi: "4", catatan: "lengkap" };
    const json = await fetchWithRateLimit(
      `${typeCfg.apiValidasi}/${id}`,
      token,
      config.maxRetry,
      config.delay,
      logCb,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
    return json?.code === 200 || json?.title?.toLowerCase() === "sukses";
  };

  const executeValidationLoop = async (
    itemsToValidate,
    config,
    iframeLog,
    updateIframeStats,
  ) => {
    isBulkRunning = true;
    for (let i = 0; i < itemsToValidate.length; i++) {
      if (!isBulkRunning) break;

      const item = itemsToValidate[i];
      const id = item.id;
      const nim = item.nim;
      let logPrefix = `NIM: ${nim} - ${item.nama} - Semester: ${item.semester}`;
      if (item.tahunKegiatan) {
        logPrefix += ` - Tahun: ${item.tahunKegiatan}`;
      }

      if (config.nimPrefix && !nim.startsWith(config.nimPrefix)) {
        iframeLog(
          `[${i + 1}/${itemsToValidate.length}] ${logPrefix} - Dilewati karena tidak berawalan "${config.nimPrefix}".`,
          "info",
        );
        continue;
      }

      if (config.semesterAjuan) {
        const itemSem = item.semester || "";
        if (itemSem && String(itemSem) !== String(config.semesterAjuan)) {
          iframeLog(
            `[${i + 1}/${itemsToValidate.length}] ${logPrefix} - Dilewati karena semester (${itemSem}) tidak sesuai dengan "${config.semesterAjuan}".`,
            "info",
          );
          continue;
        }
      }

      if (config.validationType === "rekognisi" && config.tahunKegiatan) {
        const itemTahun = item.tahunKegiatan || "";
        if (itemTahun && String(itemTahun) !== String(config.tahunKegiatan)) {
          iframeLog(
            `[${i + 1}/${itemsToValidate.length}] ${logPrefix} - Dilewati karena tahun kegiatan (${itemTahun}) tidak sesuai dengan "${config.tahunKegiatan}".`,
            "info",
          );
          continue;
        }
      }

      iframeLog(
        `[${i + 1}/${itemsToValidate.length}] Memeriksa ${logPrefix}`,
        "info",
      );

      const detail = await getDetailAjuan(id, config.token, config, iframeLog);
      if (!detail) {
        iframeLog(`${logPrefix} - Gagal mengambil detail ajuan.`, "error");
        continue;
      }

      if (detail.tahun_kegiatan && !logPrefix.includes("Tahun:")) {
        logPrefix += ` - Tahun: ${detail.tahun_kegiatan}`;
      }

      if (config.semesterAjuan) {
        const detailSem = detail.id_semester || detail.id_semester_ajuan || "";
        if (detailSem && String(detailSem) !== String(config.semesterAjuan)) {
          iframeLog(
            `[${i + 1}/${itemsToValidate.length}] ${logPrefix} - Dilewati karena semester detail (${detailSem}) tidak sesuai dengan "${config.semesterAjuan}".`,
            "info",
          );
          continue;
        }
      }

      if (config.validationType === "rekognisi" && config.tahunKegiatan) {
        const detailTahun = detail.tahun_kegiatan || "";
        if (
          detailTahun &&
          String(detailTahun) !== String(config.tahunKegiatan)
        ) {
          iframeLog(
            `[${i + 1}/${itemsToValidate.length}] ${logPrefix} - Dilewati karena tahun kegiatan (${detailTahun}) tidak sesuai dengan "${config.tahunKegiatan}".`,
            "info",
          );
          continue;
        }
      }

      const typeCfg =
        TYPE_CONFIGS[config.validationType] || TYPE_CONFIGS.rekognisi;
      if (typeCfg.isEligible(detail)) {
        iframeLog(`${logPrefix} - LOLOS filter kelayakan.`, "success");
        filteredIdsList.push(id);
        bulkStats.filter = filteredIdsList.length;
        updateIframeStats();

        // Proceed to validation
        iframeLog(`${logPrefix} - Mengirim validasi...`, "info");
        const okVal = await validateAjuan(id, config.token, config, iframeLog);
        if (okVal) {
          validatedIdsList.push(id);
          bulkStats.validasi = validatedIdsList.length;
          updateIframeStats();
          iframeLog(`✅ Validasi SUKSES untuk ${logPrefix}`, "success");
        } else {
          iframeLog(`❌ Validasi GAGAL untuk ${logPrefix}`, "error");
        }
      } else {
        iframeLog(`${logPrefix} - Tidak lolos filter kelayakan.`, "info");
      }

      await delay(config.delay);
    }

    isBulkRunning = false;
    iframeLog("Seluruh proses validasi bulk selesai!", "success");
    iframe.contentWindow.postMessage(
      { action: "BULK_STATE_CHANGE", running: false },
      "*",
    );
  };

  // --- Message Communication Listener ---
  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data) return;

    // Helper to log to iframe
    const iframeLog = (msg, type = "info") => {
      iframe.contentWindow.postMessage(
        { action: "BULK_LOG", message: msg, type },
        "*",
      );
    };

    // Helper to update stats in iframe
    const updateIframeStats = () => {
      iframe.contentWindow.postMessage(
        { action: "BULK_STATS_UPDATE", stats: bulkStats },
        "*",
      );
    };

    switch (data.action) {
      case "CLOSE_PANEL":
        closePanel();
        break;

      case "GET_ACCESS_TOKEN": {
        const token = localStorage
          .getItem("access_token")
          ?.replace(/^__q_strn\|/, "");
        iframe.contentWindow.postMessage(
          { action: "ACCESS_TOKEN", token: token || "" },
          "*",
        );
        break;
      }

      case "GET_LUARAN_CATEGORIES": {
        const token = localStorage
          .getItem("access_token")
          ?.replace(/^__q_strn\|/, "");
        const categories = await getLuaranCategories(token, () => {});
        iframe.contentWindow.postMessage(
          { action: "LUARAN_CATEGORIES", categories },
          "*",
        );
        break;
      }

      case "GET_PUBLIKASI_CATEGORIES": {
        const token = localStorage
          .getItem("access_token")
          ?.replace(/^__q_strn\|/, "");
        const res = await fetchWithRateLimit(
          "https://sispema.unpam.ac.id/api/publikasi/kategori",
          token,
          3,
          1500,
          () => {},
          { method: "GET" },
        );
        iframe.contentWindow.postMessage(
          { action: "PUBLIKASI_CATEGORIES", categories: res?.data || [] },
          "*",
        );
        break;
      }

      case "GET_REKOGNISI_CATEGORIES": {
        const token = localStorage
          .getItem("access_token")
          ?.replace(/^__q_strn\|/, "");
        const categories = await getRekognisiCategories(token, () => {});
        iframe.contentWindow.postMessage(
          { action: "REKOGNISI_CATEGORIES", categories },
          "*",
        );
        break;
      }

      case "CLEAR_FETCHED_IDS":
        fetchedIdsList = [];
        filteredIdsList = [];
        validatedIdsList = [];
        currentProgress = 0;
        bulkStats = { diambil: 0, filter: 0, validasi: 0 };
        activeConfig = null;
        updateIframeStats();
        break;

      case "START_BULK":
        if (isBulkRunning) return;
        isBulkRunning = true;

        // Save config globally
        activeConfig = data.config;

        iframe.contentWindow.postMessage(
          { action: "BULK_STATE_CHANGE", running: true },
          "*",
        );

        // Reset stats
        bulkStats = { diambil: 0, filter: 0, validasi: 0 };
        fetchedIdsList = [];
        filteredIdsList = [];
        validatedIdsList = [];
        currentProgress = 0;
        updateIframeStats();

        iframeLog("Memulai pengambilan ID...", "info");

        // Loop fetching IDs pages in parallel batches
        const startConfig = data.config;
        const totalPages = [];
        for (let p = startConfig.pageFrom; p <= startConfig.pageTo; p++) {
          totalPages.push(p);
        }

        const concurrency = 15; // Fetch 15 pages in parallel
        let hasReachedEnd = false;

        for (let i = 0; i < totalPages.length; i += concurrency) {
          if (!isBulkRunning || hasReachedEnd) break;

          const batch = totalPages.slice(i, i + concurrency);
          iframeLog(
            `Memuat batch halaman ${batch[0]} - ${batch[batch.length - 1]} secara paralel...`,
            "info",
          );

          const results = await Promise.all(
            batch.map(async (p) => {
              if (!isBulkRunning) return { page: p, ids: [] };
              const ids = await getIds(p, startConfig, iframeLog);
              return { page: p, ids };
            }),
          );

          // Sort results by page number to insert in order
          results.sort((a, b) => a.page - b.page);

          for (const res of results) {
            if (!isBulkRunning) break;
            if (res.ids.length === 0) {
              iframeLog(
                `Halaman ${res.page}: Tidak ada data ID lagi.`,
                "warning",
              );
              hasReachedEnd = true;
              break;
            }
            fetchedIdsList.push(...res.ids);
            bulkStats.diambil = fetchedIdsList.length;
            updateIframeStats();
            iframeLog(
              `Halaman ${res.page} berhasil dimuat: +${res.ids.length} ID`,
              "success",
            );
          }

          if (hasReachedEnd) break;

          // Short delay between batches to avoid flooding the server
          if (i + concurrency < totalPages.length) {
            await delay(1200);
          }
        }

        iframeLog(
          `Total ID terkumpul untuk diproses: ${fetchedIdsList.length}`,
          "success",
        );

        if (fetchedIdsList.length > 0) {
          if (startConfig.autoProcess) {
            iframeLog("Memulai filter kelayakan dan validasi...", "info");
            await executeValidationLoop(
              fetchedIdsList,
              startConfig,
              iframeLog,
              updateIframeStats,
            );
          } else {
            // Pause and wait for search review
            isBulkRunning = false;
            iframe.contentWindow.postMessage(
              { action: "BULK_FETCHED_READY", items: fetchedIdsList },
              "*",
            );
            iframeLog(
              "Fetch data selesai. Silakan cari/filter item dan klik 'Mulai Validasi' untuk memproses.",
              "warning",
            );
          }
        } else {
          isBulkRunning = false;
          iframe.contentWindow.postMessage(
            { action: "BULK_STATE_CHANGE", running: false },
            "*",
          );
          iframeLog("Tidak ada data untuk diproses.", "warning");
        }
        break;

      case "RESUME_BULK":
        if (isBulkRunning) return;
        if (!activeConfig) {
          iframeLog(
            "Konfigurasi bulk tidak ditemukan. Harap ulangi proses dari awal.",
            "error",
          );
          return;
        }

        isBulkRunning = true;
        iframe.contentWindow.postMessage(
          { action: "BULK_STATE_CHANGE", running: true },
          "*",
        );

        // Filter global fetchedIdsList based on matching IDs passed from panel
        const resumeFilteredIds = data.filteredIds || [];
        const itemsToValidate = fetchedIdsList.filter((item) =>
          resumeFilteredIds.includes(item.id),
        );

        iframeLog(
          `Memulai validasi pada ${itemsToValidate.length} item pilihan...`,
          "info",
        );
        await executeValidationLoop(
          itemsToValidate,
          activeConfig,
          iframeLog,
          updateIframeStats,
        );
        break;

      case "STOP_BULK":
        isBulkRunning = false;
        iframeLog("Menghentikan proses validasi bulk...", "warning");
        iframe.contentWindow.postMessage(
          { action: "BULK_STATE_CHANGE", running: false },
          "*",
        );
        break;

      case "START_SINGLE":
        const token = data.token;
        const singleId = data.singleId;
        const tempConfig = {
          maxRetry: 3,
          delay: 1500,
          validationType: data.validationType,
        };

        const sendSingleStatus = (status, message) => {
          iframe.contentWindow.postMessage(
            { action: "SINGLE_STATUS", status, message },
            "*",
          );
        };

        const detail = await getDetailAjuan(
          singleId,
          token,
          tempConfig,
          (m, t) => {},
        );
        if (!detail) {
          sendSingleStatus(
            "error",
            `❌ Gagal mengambil detail untuk ID: ${singleId}. Periksa token atau koneksi Anda.`,
          );
          return;
        }

        const typeCfg =
          TYPE_CONFIGS[data.validationType] || TYPE_CONFIGS.rekognisi;
        const singleNim = detail.ucr || detail.mahasiswa?.nim || "";
        const singleNama = detail.mahasiswa?.nama || "";
        const singleSemester =
          detail.id_semester_ajuan || detail.id_semester || "";
        let singleInfo = `<b>NIM:</b> ${singleNim}<br/><b>Nama:</b> ${singleNama}<br/><b>Semester:</b> ${singleSemester}`;
        if (detail.tahun_kegiatan) {
          singleInfo += `<br/><b>Tahun Kegiatan:</b> ${detail.tahun_kegiatan}`;
        }

        if (data.nimPrefix && !singleNim.startsWith(data.nimPrefix)) {
          sendSingleStatus(
            "ineligible",
            `⚠️ <b>DILEWATI</b> (NIM tidak berawalan "${data.nimPrefix}"):<br/>${singleInfo}`,
          );
          return;
        }

        if (data.validationType === "rekognisi" && data.tahunKegiatan) {
          const singleTahun = detail.tahun_kegiatan || "";
          if (
            singleTahun &&
            String(singleTahun) !== String(data.tahunKegiatan)
          ) {
            sendSingleStatus(
              "ineligible",
              `⚠️ <b>DILEWATI</b> (Tahun Kegiatan ${singleTahun} tidak sesuai "${data.tahunKegiatan}"):<br/>${singleInfo}`,
            );
            return;
          }
        }

        if (!typeCfg.isEligible(detail)) {
          let pemb = detail.v_pembimbing ?? "belum disetujui";
          let angg = detail.v_anggota ?? "belum disetujui";
          sendSingleStatus(
            "ineligible",
            `⚠️ <b>TIDAK LOLOS KELAYAKAN</b>:<br/>${singleInfo}<br/>` +
              `<span class="opacity-70">Persetujuan:</span> Pembimbing: ${pemb}, Anggota: ${angg}`,
          );
          return;
        }

        sendSingleStatus(
          "loading",
          `Lolos filter kelayakan. Mengirim validasi...<br/>${singleInfo}`,
        );
        const ok = await validateAjuan(
          singleId,
          token,
          tempConfig,
          (m, t) => {},
        );
        if (ok) {
          sendSingleStatus(
            "ok",
            `✅ <b>SUKSES!</b> Validasi berhasil dicatat:<br/>${singleInfo}`,
          );
        } else {
          sendSingleStatus(
            "fail",
            `❌ <b>GAGAL!</b> Validasi gagal dikirim:<br/>${singleInfo}`,
          );
        }
        break;
    }
  });
})();
