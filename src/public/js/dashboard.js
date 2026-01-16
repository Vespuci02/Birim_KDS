let map;
let storeMarkers = [];
let heatLayer = null;
let perfCache = [];

function formatMoney(n) {
  const num = Number(n || 0);
  return num.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " ₺";
}

function clearMarkers() {
  storeMarkers.forEach(m => map.removeLayer(m));
  storeMarkers = [];
}

async function loadPerformance(period) {
  const res = await fetch(`/api/stores/performance?period=${period}`);
  return res.json();
}

async function loadHeatmap(period) {
  const res = await fetch(`/api/heatmap?period=${period}`);
  return res.json();
}

function initMap(centerLat = 41.015, centerLng = 28.979) {
  map = L.map("map").setView([centerLat, centerLng], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
}

function colorByRank(rank, total) {
  const ratio = rank / Math.max(total - 1, 1);
  if (ratio <= 0.3) return "green";
  if (ratio <= 0.7) return "orange";
  return "red";
}

function renderTopBottomTables(rows) {
  const topBody = document.querySelector("#topTable tbody");
  const bottomBody = document.querySelector("#bottomTable tbody");
  topBody.innerHTML = "";
  bottomBody.innerHTML = "";

  const top5 = rows.slice(0, 5);
  const bottom5 = rows.slice().reverse().slice(0, 5);

  top5.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${r.magaza_adi}</td>
      <td><span class="ciroChip">${formatMoney(r.ciro)}</span></td>
      <td><a class="actionBtn" href="/stores/${r.magaza_id}">İncele</a></td>
      `;
    topBody.appendChild(tr);
  });

  bottom5.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${r.magaza_adi}</td>
      <td><span class="ciroChip">${formatMoney(r.ciro)}</span></td>
      <td><a class="actionBtn" href="/stores/${r.magaza_id}">İncele</a></td>
    `;
    bottomBody.appendChild(tr);
  });
}


function renderMarkers(rows) {
  clearMarkers();

  if (rows.length > 0) {
    map.setView([Number(rows[0].lat), Number(rows[0].lng)], 12);
  }

  rows.forEach((r, idx) => {
    const color = colorByRank(idx, rows.length);

    const marker = L.circleMarker([Number(r.lat), Number(r.lng)], {
      radius: 10,
      color,
      weight: 2,
      fillOpacity: 0.6
    }).addTo(map);

    marker.bindPopup(`
      <b>${r.magaza_adi}</b><br/>
      Ciro: ${formatMoney(r.ciro)}<br/>
      <a href="/stores/${r.magaza_id}">Detaya git</a>
    `);
    marker.on("click", async () => {
      selectedStoreId = r.magaza_id;
      await refreshBenchmarkPanel();
    });


    storeMarkers.push(marker);
  });
}
function applyMapFilter() {
  const filter = document.getElementById("mapFilter")?.value || "all";

  let rowsToShow = perfCache;

  if (filter === "top5") {
    rowsToShow = perfCache.slice(0, 5);
  } else if (filter === "bottom5") {
    rowsToShow = perfCache.slice().reverse().slice(0, 5);
  }

  renderMarkers(rowsToShow);
}


function renderHeatmap(points, show) {
  if (heatLayer) map.removeLayer(heatLayer);
  if (!show) return;

  heatLayer = L.heatLayer(points, {
    radius: 25,
    blur: 18,
    maxZoom: 17
  }).addTo(map);
}


async function refresh() {
  const period = document.getElementById("periodSelect").value;
  const showHeat = document.getElementById("heatToggle").checked;

  const [perf, heat] = await Promise.all([
    loadPerformance(period),
    loadHeatmap(period),
  ]);

  perfCache = perf;

  renderTopBottomTables(perf);
  applyMapFilter();
  renderHeatmap(heat, showHeat);
}

document.addEventListener("DOMContentLoaded", async () => {
  const mapFilterEl = document.getElementById("mapFilter");
  if (mapFilterEl) {
    mapFilterEl.addEventListener("change", () => {
      applyMapFilter();
    });
  }
  
  setAdPanelEmpty();

  document.getElementById("benchPeriod").addEventListener("change", async () => {
    await refreshBenchmarkPanel();
  });


  initMap();

  document.getElementById("periodSelect").addEventListener("change", refresh);
  document.getElementById("heatToggle").addEventListener("change", refresh);

  await refresh();
  initMahallePanel();

});
let selectedStoreId = null;

async function loadBenchmark(storeId, period) {
  const res = await fetch(`/api/stores/${storeId}/benchmark?period=${period}`);
  return res.json();
}

function setAdPanelEmpty() {
  document.getElementById("adEmpty").style.display = "block";
  document.getElementById("adContent").style.display = "none";
}

function setAdPanelData(data) {
  const t = data.target;
  const b = data.benchmark;

  document.getElementById("adEmpty").style.display = "none";
  document.getElementById("adContent").style.display = "block";

  const badge = document.getElementById("adBadge");
  badge.className = "adBadge " + (data.recommendation === "REKLAM VER" ? "good" : "bad");
  badge.textContent = data.recommendation;

  document.getElementById("adStoreName").textContent = t.magaza_adi;

  document.getElementById("tCiro").textContent = formatMoney(t.ciro);
  document.getElementById("avgCiro").textContent = formatMoney(b.avgNearest3Ciro);

  document.getElementById("tPop").textContent =
    t.mahalle_nufus == null ? "-" : String(t.mahalle_nufus);

  document.getElementById("avgPop").textContent =
    b.avgNearest3Pop == null ? "-" : String(Math.round(b.avgNearest3Pop));

  document.getElementById("ratio").textContent =
    b.ciroRatio == null ? "-" : `${Math.round(b.ciroRatio * 100)}%`;

  document.getElementById("adReason").textContent = data.reason;

  const tbody = document.querySelector("#adTable tbody");
  tbody.innerHTML = "";
  data.neighbors.forEach(n => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${n.magaza_adi}</td>
      <td>${n.distance_m} m</td>
      <td>${n.mahalle_nufus ?? "-"}</td>
      <td>${formatMoney(n.ciro)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function refreshBenchmarkPanel() {
  if (!selectedStoreId) return;

  const period = document.getElementById("benchPeriod").value;
  const data = await loadBenchmark(selectedStoreId, period);
  setAdPanelData(data);
}

async function loadMahalleList() {
  const res = await fetch("/api/mahalle/list");
  return res.json();
}

async function loadNewStoreDecision(mahalleId, period) {
  const res = await fetch(`/api/mahalle/new-store-decision?mahalle_id=${mahalleId}&period=${period}`);
  return res.json();
}

function getDashboardPeriod() {
  const el = document.getElementById("periodSelect") || document.getElementById("period");
  return el ? el.value : "3m";
}

function renderNewStoreDecision(data) {
  document.getElementById("newStoreEmpty").style.display = "none";
  document.getElementById("newStoreContent").style.display = "block";

  const badge = document.getElementById("newStoreBadge");
  badge.className = "adBadge " + (data.badge === "GOOD" ? "good" : data.badge === "BAD" ? "bad" : "");
  badge.textContent = data.decision;

  document.getElementById("newStoreMahalle").textContent = data.mahalle.mahalle_ad;

  document.getElementById("nsPop").textContent = data.mahalle.nufus ?? "-";
  document.getElementById("nsCiro").textContent = formatMoney(data.stats.ciro || 0);
  document.getElementById("nsOrders").textContent = data.stats.siparisSayisi ?? "-";
  document.getElementById("nsDist").textContent =
    data.stats.nearestDistM == null ? "-" : `${Math.round(data.stats.nearestDistM)} m`;
  document.getElementById("nsNearCount").textContent = data.stats.storesWithin ?? "-";

  document.getElementById("nsReason").textContent = data.reason || "";
}

async function initMahallePanel() {
  const select = document.getElementById("mahalleSelect");
  if (!select) return;

  const rows = await loadMahalleList();
  select.innerHTML = `<option value="" selected>Mahalle seç...</option>` +
    rows.map(r => `<option value="${r.mahalle_id}">${r.mahalle_ad}</option>`).join("");

  select.addEventListener("change", async () => {
    const val = select.value;
    if (!val) {
      document.getElementById("newStoreEmpty").style.display = "block";
      document.getElementById("newStoreContent").style.display = "none";
      return;
    }
    const period = getDashboardPeriod();
    const data = await loadNewStoreDecision(val, period);
    renderNewStoreDecision(data);
  });

  const periodEl = document.getElementById("periodSelect") || document.getElementById("period");
  if (periodEl) {
    periodEl.addEventListener("change", async () => {
      if (!select.value) return;
      const data = await loadNewStoreDecision(select.value, getDashboardPeriod());
      renderNewStoreDecision(data);
    });
  }
}

