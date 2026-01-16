let chart;

function formatMoney(n) {
  const num = Number(n || 0);
  return num.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " ₺";
}

async function loadTrend(storeId, period) {
  const res = await fetch(`/api/stores/${storeId}/trend?period=${period}`);
  return res.json();
}

async function loadTopProducts(storeId, period) {
  const res = await fetch(`/api/stores/${storeId}/top-products?period=${period}`);
  return res.json();
}

function renderTrendChart(rows) {
  const labels = rows.map(r => r.label);
  const values = rows.map(r => Number(r.ciro || 0));

  const ctx = document.getElementById("trendChart");

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Ciro",
        data: values
      }]
    },
    options: {
      responsive: true
    }
  });
}

function renderProductsTable(rows) {
  const tbody = document.querySelector("#productsTable tbody");
  tbody.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.urun_ad}</td>
      <td>${Number(r.adet || 0)}</td>
      <td>${formatMoney(r.ciro)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function refreshAll() {
  const storeId = window.STORE_ID;
  const period = document.getElementById("periodSelect").value;

  const [trend, products] = await Promise.all([
    loadTrend(storeId, period),
    loadTopProducts(storeId, period)
  ]);

  renderTrendChart(trend);
  renderProductsTable(products);
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("periodSelect").addEventListener("change", refreshAll);
  await refreshAll();
});

