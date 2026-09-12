document.addEventListener("DOMContentLoaded", () => {
  // --- UI Elements ---
  const views = {
    bulk: document.getElementById("wrapper-bulk"),
    single: document.getElementById("section-single"),
    settings: document.getElementById("section-settings"),
  };

  const bottomNavs = {
    bulk: document.getElementById("nav-bulk-btn"),
    single: document.getElementById("nav-single-btn"),
    settings: document.getElementById("nav-settings-btn"),
  };

  const inputs = {
    token: document.getElementById("cfg-token"),
    validationType: document.getElementById("cfg-validation-type"),
    nimPrefix: document.getElementById("cfg-nim-prefix"),
    semester: document.getElementById("cfg-semester"),
    tahunKegiatan: document.getElementById("cfg-tahun-kegiatan"),
    autoProcess: document.getElementById("cfg-auto-process"),
    pageFrom: document.getElementById("cfg-page-from"),
    pageTo: document.getElementById("cfg-page-to"),
    perPage: document.getElementById("cfg-per-page"),
    delay: document.getElementById("cfg-delay"),
    maxRetry: document.getElementById("cfg-max-retry"),
  };
  const tahunContainer = document.getElementById("cfg-tahun-container");

  const stats = {
    diambil: document.getElementById("stat-diambil"),
    filter: document.getElementById("stat-filter"),
    validasi: document.getElementById("stat-validasi"),
  };

  const mainActionBtn = document.getElementById("main-action");
  const mainActionIcon = document.getElementById("main-action-icon");
  const mainActionText = document.getElementById("main-action-text");

  const clearLogBtn = document.getElementById("clear-log-btn");
  const logContainer = document.getElementById("log-container");

  const singleInput = document.getElementById("single-id-input");
  const singleActionBtn = document.getElementById("single-action-btn");
  const singleStatusBox = document.getElementById("single-status-box");

  const closePanelBtn = document.getElementById("close-panel-btn");

  let isBulkRunning = false;
  let bulkState = "idle"; // "idle", "fetching", "fetched_ready", "validating"
  let allFetchedItems = [];
  let filteredItems = [];

  // --- Tab Switching Logic ---
  function switchTab(targetTab) {
    // Toggle View Panels
    Object.keys(views).forEach((tab) => {
      const panel = views[tab];
      if (panel) {
        if (tab === targetTab) {
          panel.classList.remove("hidden");
        } else {
          panel.classList.add("hidden");
        }
      }
    });

    // Toggle Bottom Navigation Buttons
    Object.keys(bottomNavs).forEach((tab) => {
      const btn = bottomNavs[tab];
      if (btn) {
        const icon = btn.querySelector("span");
        if (tab === targetTab) {
          btn.classList.add("active");
          if (icon) icon.style.fontVariationSettings = "'FILL' 1";
        } else {
          btn.classList.remove("active");
          if (icon) icon.style.fontVariationSettings = "'FILL' 0";
        }
      }
    });
  }

  // Register Switch Tab Listeners
  Object.keys(bottomNavs).forEach((tab) => {
    const btn = bottomNavs[tab];
    if (btn) {
      btn.addEventListener("click", () => switchTab(tab));
    }
  });

  function updateVisibility() {
    if (!inputs.validationType || !tahunContainer) return;
    if (inputs.validationType.value === "rekognisi") {
      tahunContainer.classList.remove("hidden");
    } else {
      tahunContainer.classList.add("hidden");
    }
  }

  // --- Configuration Persistence (localStorage) ---
  function loadConfig() {
    const accessToken = localStorage
      .getItem("access_token")
      ?.replace(/^__q_strn\|/, "");
    inputs.token.value =
      accessToken || localStorage.getItem("rekognisi_token") || "";
    if (inputs.validationType) {
      inputs.validationType.value =
        localStorage.getItem("rekognisi_validation_type") || "rekognisi";
    }
    if (inputs.nimPrefix) {
      inputs.nimPrefix.value =
        localStorage.getItem("rekognisi_nim_prefix") || "";
    }
    if (inputs.semester) {
      const storedSemester = localStorage.getItem("rekognisi_semester");
      inputs.semester.value =
        storedSemester !== null ? storedSemester : "20252";
    }
    if (inputs.tahunKegiatan) {
      inputs.tahunKegiatan.value =
        localStorage.getItem("rekognisi_tahun_kegiatan") || "";
    }
    if (inputs.autoProcess) {
      inputs.autoProcess.checked =
        localStorage.getItem("rekognisi_auto_process") !== "false";
    }
    inputs.pageFrom.value = localStorage.getItem("rekognisi_page_from") || "1";
    inputs.pageTo.value = localStorage.getItem("rekognisi_page_to") || "10";
    inputs.perPage.value = localStorage.getItem("rekognisi_per_page") || "100";
    inputs.delay.value = localStorage.getItem("rekognisi_delay") || "2500";
    inputs.maxRetry.value = localStorage.getItem("rekognisi_max_retry") || "5";
    updateVisibility();
  }

  function saveConfig() {
    localStorage.setItem("rekognisi_token", inputs.token.value.trim());
    if (inputs.validationType) {
      localStorage.setItem(
        "rekognisi_validation_type",
        inputs.validationType.value,
      );
    }
    if (inputs.nimPrefix) {
      localStorage.setItem(
        "rekognisi_nim_prefix",
        inputs.nimPrefix.value.trim(),
      );
    }
    if (inputs.semester) {
      localStorage.setItem("rekognisi_semester", inputs.semester.value.trim());
    }
    if (inputs.tahunKegiatan) {
      localStorage.setItem(
        "rekognisi_tahun_kegiatan",
        inputs.tahunKegiatan.value.trim(),
      );
    }
    if (inputs.autoProcess) {
      localStorage.setItem(
        "rekognisi_auto_process",
        inputs.autoProcess.checked,
      );
    }
    localStorage.setItem("rekognisi_page_from", inputs.pageFrom.value);
    localStorage.setItem("rekognisi_page_to", inputs.pageTo.value);
    localStorage.setItem("rekognisi_per_page", inputs.perPage.value);
    localStorage.setItem("rekognisi_delay", inputs.delay.value);
    localStorage.setItem("rekognisi_max_retry", inputs.maxRetry.value);
  }

  // Save changes automatically
  Object.values(inputs).forEach((input) => {
    if (!input) return;
    const eventType = input.type === "checkbox" ? "change" : "input";
    input.addEventListener(eventType, saveConfig);
    if (input.type !== "checkbox") {
      input.addEventListener("change", saveConfig);
    }
  });

  if (inputs.validationType) {
    inputs.validationType.addEventListener("change", updateVisibility);
  }

  // Load config on startup
  loadConfig();
  window.parent.postMessage({ action: "GET_ACCESS_TOKEN" }, "*");

  // --- Parent Communication ---
  closePanelBtn.addEventListener("click", () => {
    window.parent.postMessage({ action: "CLOSE_PANEL" }, "*");
  });

  // --- Log Management ---
  const addLog = (message, type = "info") => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const p = document.createElement("p");
    p.className = "log-entry";

    const timeSpan = document.createElement("span");
    timeSpan.className = "log-time";
    timeSpan.textContent = `[${time}] `;
    const messageSpan = document.createElement("span");
    messageSpan.className = `log-${["success", "error", "warning"].includes(type) ? type : "info"}`;
    messageSpan.textContent = message;

    p.append(timeSpan, messageSpan);

    if (logContainer.querySelector("p.italic")) {
      logContainer.innerHTML = "";
    }

    logContainer.appendChild(p);
    logContainer.scrollTop = logContainer.scrollHeight;
  };

  clearLogBtn.addEventListener("click", () => {
    logContainer.innerHTML = `<p class="empty-state">Log dibersihkan...</p>`;
  });

  // --- Search & Fetch Results Renderer ---
  const searchInput = document.getElementById("search-items-input");
  const fetchResultsSection = document.getElementById("section-fetch-results");
  const fetchItemsList = document.getElementById("fetch-items-list");
  const fetchCountLabel = document.getElementById("fetch-count");

  const renderFetchedItems = (items) => {
    if (!fetchItemsList) return;
    fetchItemsList.innerHTML = "";
    if (items.length === 0) {
      fetchItemsList.innerHTML = `<p class="empty-state">Tidak ada item yang cocok...</p>`;
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "fetch-item";

      let cardHTML = `
        <div class="fetch-item-head">
          <span class="fetch-item-nim">${item.nim}</span>
          <span class="fetch-item-semester">${item.semester}</span>
        </div>
        <div class="fetch-item-name">${item.nama}</div>
      `;

      if (item.namaAjuan) {
        cardHTML += `<div class="fetch-item-meta is-italic">Ajuan: ${item.namaAjuan}</div>`;
      }
      if (item.tahunKegiatan) {
        cardHTML += `<div class="fetch-item-meta">Tahun: ${item.tahunKegiatan}</div>`;
      }

      card.innerHTML = cardHTML;
      fetchItemsList.appendChild(card);
    });
  };

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase().trim();
      if (!query) {
        filteredItems = [...allFetchedItems];
        if (fetchItemsList) {
          fetchItemsList.innerHTML = `<p class="empty-state">Ketik NIM atau Nama Ajuan untuk mencari...</p>`;
        }
      } else {
        filteredItems = allFetchedItems.filter((item) => {
          const nimMatch = item.nim.toLowerCase().includes(query);
          const namaMatch = item.nama.toLowerCase().includes(query);
          const ajuanMatch = item.namaAjuan
            ? item.namaAjuan.toLowerCase().includes(query)
            : false;
          return nimMatch || namaMatch || ajuanMatch;
        });
        renderFetchedItems(filteredItems);
      }

      if (fetchCountLabel) {
        fetchCountLabel.textContent = `${filteredItems.length} Item`;
      }
      if (mainActionText) {
        if (!query) {
          mainActionText.textContent = `Mulai Validasi (${allFetchedItems.length} Item)`;
        } else {
          mainActionText.textContent = `Mulai Validasi (${filteredItems.length}/${allFetchedItems.length})`;
        }
      }
    });
  }

  // --- Bulk Validasi Action ---
  mainActionBtn.addEventListener("click", () => {
    if (!inputs.token.value.trim()) {
      alert("Harap masukkan Bearer Token terlebih dahulu di tab Settings!");
      switchTab("settings");
      return;
    }

    if (isBulkRunning || bulkState === "validating") {
      // Send STOP command to parent
      window.parent.postMessage({ action: "STOP_BULK" }, "*");
    } else if (bulkState === "fetched_ready") {
      // Start validation on filtered items
      const filteredIds = filteredItems.map((item) => item.id);
      if (filteredIds.length === 0) {
        alert("Tidak ada item yang cocok dengan pencarian untuk divalidasi!");
        return;
      }
      bulkState = "validating";
      // Send RESUME_BULK command to parent
      window.parent.postMessage(
        {
          action: "RESUME_BULK",
          token: inputs.token.value.trim(),
          filteredIds: filteredIds,
        },
        "*",
      );
    } else {
      // Gather config
      const config = {
        token: inputs.token.value.trim(),
        validationType: inputs.validationType
          ? inputs.validationType.value
          : "rekognisi",
        nimPrefix: inputs.nimPrefix ? inputs.nimPrefix.value.trim() : "",
        semesterAjuan: inputs.semester ? inputs.semester.value.trim() : "",
        tahunKegiatan: inputs.tahunKegiatan
          ? inputs.tahunKegiatan.value.trim()
          : "",
        autoProcess: inputs.autoProcess ? inputs.autoProcess.checked : true,
        pageFrom: parseInt(inputs.pageFrom.value, 10) || 1,
        pageTo: parseInt(inputs.pageTo.value, 10) || 10,
        perPage: parseInt(inputs.perPage.value, 10) || 100,
        delay: parseInt(inputs.delay.value, 10) || 2500,
        maxRetry: parseInt(inputs.maxRetry.value, 10) || 5,
      };

      bulkState = config.autoProcess ? "validating" : "fetching";
      // Send START command to parent
      window.parent.postMessage({ action: "START_BULK", config }, "*");
    }
  });

  // --- Single ID Action ---
  singleActionBtn.addEventListener("click", () => {
    const id = singleInput.value.trim();
    if (!id) {
      alert("Harap masukkan ID Ajuan!");
      return;
    }
    if (!inputs.token.value.trim()) {
      alert("Harap masukkan Bearer Token terlebih dahulu di tab Settings!");
      switchTab("settings");
      return;
    }

    singleStatusBox.className = "status-box is-loading";
    singleStatusBox.textContent = `Memproses validasi untuk ID #${id}...`;

    window.parent.postMessage(
      {
        action: "START_SINGLE",
        token: inputs.token.value.trim(),
        singleId: id,
        nimPrefix: inputs.nimPrefix ? inputs.nimPrefix.value.trim() : "",
        tahunKegiatan: inputs.tahunKegiatan
          ? inputs.tahunKegiatan.value.trim()
          : "",
        validationType: inputs.validationType
          ? inputs.validationType.value
          : "rekognisi",
      },
      "*",
    );
  });

  singleInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      singleActionBtn.click();
    }
  });

  // --- Message Listener from Parent (content.js) ---
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data) return;

    switch (data.action) {
      case "ACCESS_TOKEN":
        if (data.token && inputs.token) {
          inputs.token.value = data.token;
          saveConfig();
        }
        break;

      case "BULK_STATE_CHANGE":
        isBulkRunning = data.running;
        if (isBulkRunning) {
          bulkState = "validating";
          // Change button to running state
          mainActionBtn.className = "btn-filled is-running";
          mainActionIcon.textContent = "stop";
          mainActionText.textContent = "Berhenti Validasi";
          // Disable inputs
          Object.values(inputs).forEach((inp) => {
            if (inp) inp.disabled = true;
          });
        } else {
          bulkState = "idle";
          // Hide fetch results container if we finished completely
          if (fetchResultsSection) fetchResultsSection.classList.add("hidden");
          // Change button to idle state
          mainActionBtn.className = "btn-filled";
          mainActionIcon.textContent = "play_arrow";
          mainActionText.textContent = "Mulai Validasi";
          // Enable inputs
          Object.values(inputs).forEach((inp) => {
            if (inp) inp.disabled = false;
          });
        }
        break;

      case "BULK_FETCHED_READY":
        bulkState = "fetched_ready";
        isBulkRunning = false;
        allFetchedItems = data.items || [];
        filteredItems = [...allFetchedItems];

        // Show fetch results section
        if (fetchResultsSection) {
          fetchResultsSection.classList.remove("hidden");
        }

        // Reset search input
        if (searchInput) searchInput.value = "";

        // Render helper prompt instead of full list initially
        if (fetchItemsList) {
          fetchItemsList.innerHTML = `<p class="empty-state">Ketik NIM atau Nama Ajuan untuk mencari...</p>`;
        }

        // Update count
        if (fetchCountLabel) {
          fetchCountLabel.textContent = `${allFetchedItems.length} Item`;
        }

        // Enable inputs
        Object.values(inputs).forEach((inp) => {
          if (inp) inp.disabled = false;
        });

        // Update button text to "Mulai Validasi (X Item)"
        mainActionBtn.className = "btn-filled is-ready";
        mainActionIcon.textContent = "play_arrow";
        mainActionText.textContent = `Mulai Validasi (${allFetchedItems.length} Item)`;
        break;

      case "BULK_STATS_UPDATE":
        stats.diambil.textContent = data.stats.diambil;
        stats.filter.textContent = data.stats.filter;
        stats.validasi.textContent = data.stats.validasi;
        break;

      case "BULK_LOG":
        addLog(data.message, data.type);
        break;

      case "SINGLE_STATUS":
        singleStatusBox.classList.remove(
          "hidden",
          "is-ok",
          "is-loading",
          "is-warning",
          "is-error",
        );

        let boxClass = "is-error";
        if (data.status === "ok") {
          boxClass = "is-ok";
        } else if (data.status === "loading") {
          boxClass = "is-loading";
        } else if (data.status === "ineligible" || data.status === "warning") {
          boxClass = "is-warning";
        }

        singleStatusBox.className = `status-box select-text ${boxClass}`;
        singleStatusBox.innerHTML = data.message;
        break;
    }
  });
});
