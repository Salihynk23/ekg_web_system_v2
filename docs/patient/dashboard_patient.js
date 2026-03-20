const API_URL = "https://ekg-web-system-api.onrender.com";
const TOKEN = localStorage.getItem("token");

if (!TOKEN) {
  alert("Giriş yapmalısın");
  window.location.href = "../index.html";
}

let me = null;
let timer = null;
let chart = null;
let activeChartKey = null;

const TOTAL_SECONDS = 60;

const chartState = {
  ekg: {
    points: [],
    windowSize: TOTAL_SECONDS,
    sliderId: "ekgRange",
    infoId: "ekgRangeInfo",
    autoFollow: true,
    visibleSlice: [],
    seedValue: 1.0
  },
  hr: {
    points: [],
    windowSize: TOTAL_SECONDS,
    sliderId: "hrRange",
    infoId: "hrRangeInfo",
    autoFollow: true,
    visibleSlice: [],
    seedValue: 75
  },
  temp: {
    points: [],
    windowSize: TOTAL_SECONDS,
    sliderId: "tempRange",
    infoId: "tempRangeInfo",
    autoFollow: true,
    visibleSlice: [],
    seedValue: 36.8
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadMeAndCheckRole();
  bindRangeInputs();
  goHome();
});

function formatDT(dtStr) {
  if (!dtStr) return "-";
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleString("tr-TR");
}

function formatSecondLabel(dtStr) {
  if (!dtStr) return "-";
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/* ================= USER / ROLE ================= */
async function loadMeAndCheckRole() {
  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) throw new Error("me alınamadı");
    me = await res.json();

    if (me.role !== "patient") {
      alert("Bu sayfa sadece HASTA içindir.");
      localStorage.removeItem("token");
      window.location.href = "../index.html";
      return;
    }

    document.getElementById("pUsername").textContent = me.username ?? "-";
    document.getElementById("pId").textContent = me.id ?? "-";
    document.getElementById("pFullname").textContent = me.full_name ?? "-";
    document.getElementById("pAge").textContent = me.age ?? "-";
    document.getElementById("pHeight").textContent = me.height_cm ? `${me.height_cm} cm` : "-";
    document.getElementById("pWeight").textContent = me.weight_kg ? `${me.weight_kg} kg` : "-";

  } catch (err) {
    console.error("loadMeAndCheckRole error:", err);
    localStorage.removeItem("token");
    alert("Oturum geçersiz");
    window.location.href = "../index.html";
  }
}

/* ================= PAGE CONTROL ================= */
function hideAllPages() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
}

window.goHome = function () {
  stopLive();
  hideAllPages();
  const home = document.getElementById("home");
  if (home) home.classList.add("active");
  document.getElementById("backBtn").classList.add("hidden");
};

window.showSection = function (id) {
  stopLive();
  hideAllPages();

  const el = document.getElementById(id);
  if (el) el.classList.add("active");

  document.getElementById("backBtn").classList.toggle("hidden", id === "home");

  if (id === "ekg") startLiveECG();
  if (id === "hr") startLiveLatest("heart_rate", "BPM", "hrChart", 1000, "hr");
  if (id === "temp") startLiveLatest("temperature", "°C", "tempChart", 1000, "temp");
  if (id === "doctor") loadDoctorComment();
};

/* ================= CHART CORE ================= */
function stopLive() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (chart) {
    chart.destroy();
    chart = null;
  }
  activeChartKey = null;
}

function getAxisLimits(chartKey) {
  if (chartKey === "temp") {
    return { min: 35.5, max: 38.5, stepSize: 0.5 };
  }
  if (chartKey === "hr") {
    return { min: 40, max: 140, stepSize: 10 };
  }
  if (chartKey === "ekg") {
    return { min: 0.0, max: 2.2, stepSize: 0.2 };
  }
  return {};
}

function buildFixedLabels(state) {
  return state.visibleSlice.map(p => formatSecondLabel(p.time));
}

function buildChart(canvasId, label, color, chartKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  activeChartKey = chartKey;

  const axis = getAxisLimits(chartKey);
  const state = chartState[chartKey];

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: buildFixedLabels(state),
      datasets: [{
        label,
        data: state.visibleSlice.map(p => p.value),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 4,
        tension: chartKey === "ekg" ? 0.15 : 0.28,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointHitRadius: 10,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: color,
        pointBorderWidth: 2,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#e7eaf3",
            font: {
              weight: "700",
              size: 15
            }
          }
        },
        tooltip: {
          backgroundColor: "rgba(11,16,32,.96)",
          titleColor: "#ffffff",
          bodyColor: "#e7eaf3",
          borderColor: "rgba(255,255,255,.15)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title(items) {
              const i = items[0]?.dataIndex ?? 0;
              const current = chartState[activeChartKey]?.visibleSlice?.[i];
              return current ? formatDT(current.time) : "";
            },
            label(context) {
              const value = context.parsed.y;
              return `${label}: ${Number(value).toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: {
          offset: false,
          ticks: {
            color: "#aab1c7",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
            font: {
              size: 12
            }
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          },
          border: {
            color: "rgba(255,255,255,.10)"
          }
        },
        y: {
          min: axis.min,
          max: axis.max,
          ticks: {
            stepSize: axis.stepSize,
            color: "#aab1c7",
            font: {
              size: 12
            }
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          },
          border: {
            color: "rgba(255,255,255,.10)"
          }
        }
      }
    }
  });
}

function bindRangeInputs() {
  ["ekg", "hr", "temp"].forEach(key => {
    const state = chartState[key];
    const slider = document.getElementById(state.sliderId);
    if (!slider) return;

    slider.addEventListener("input", () => {
      const sliderValue = Number(slider.value);
      const maxStart = Math.max(0, state.points.length - state.windowSize);
      state.autoFollow = sliderValue >= maxStart;
      renderWindow(key, sliderValue);
    });
  });
}

/* ================= FIXED 60s WINDOW ================= */
function seedInitialWindow(chartKey) {
  const state = chartState[chartKey];
  if (!state || state.points.length) return;

  const now = Date.now();

  for (let i = TOTAL_SECONDS - 1; i >= 0; i--) {
    state.points.push({
      time: new Date(now - i * 1000).toISOString(),
      value: state.seedValue,
      placeholder: true
    });
  }
}

function replaceSeedIfNeeded(chartKey) {
  const state = chartState[chartKey];
  if (!state.points.length) return;

  const hasOnlySeed = state.points.every(p => p.placeholder === true);
  if (hasOnlySeed) {
    state.points = [];
  }
}

function pushHistoryPoint(chartKey, value, timeStr = new Date().toISOString()) {
  const state = chartState[chartKey];
  if (!state) return;

  replaceSeedIfNeeded(chartKey);

  state.points.push({
    time: timeStr,
    value: Number(value),
    placeholder: false
  });

  if (state.points.length > 600) {
    state.points.shift();
  }

  updateSlider(chartKey);

  if (state.autoFollow) {
    moveToLatestWindow(chartKey);
  } else {
    const slider = document.getElementById(state.sliderId);
    const currentStart = Number(slider?.value || 0);
    renderWindow(chartKey, currentStart);
  }
}

function updateSlider(chartKey) {
  const state = chartState[chartKey];
  const slider = document.getElementById(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.max = maxStart;

  if (Number(slider.value) > maxStart) {
    slider.value = maxStart;
  }
}

function moveToLatestWindow(chartKey) {
  const state = chartState[chartKey];
  const slider = document.getElementById(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.value = maxStart;
  state.autoFollow = true;
  renderWindow(chartKey, maxStart);
}

function renderWindow(chartKey, startIndex = 0) {
  const state = chartState[chartKey];
  if (!state) return;

  const endIndex = Math.min(startIndex + state.windowSize, state.points.length);
  let slice = state.points.slice(startIndex, endIndex);

  if (slice.length < state.windowSize) {
    const missing = state.windowSize - slice.length;
    const firstTime = slice.length ? new Date(slice[0].time).getTime() : Date.now();

    const padding = [];
    for (let i = missing; i > 0; i--) {
      padding.push({
        time: new Date(firstTime - i * 1000).toISOString(),
        value: state.seedValue,
        placeholder: true
      });
    }
    slice = [...padding, ...slice];
  }

  state.visibleSlice = slice;

  if (chart && activeChartKey === chartKey) {
    chart.data.labels = slice.map(p => formatSecondLabel(p.time));
    chart.data.datasets[0].data = slice.map(p => p.value);
    chart.update("none");
  }

  const info = document.getElementById(state.infoId);
  if (info) {
    const realCount = state.points.length;
    const maxEnd = Math.min(startIndex + state.windowSize, realCount);
    if (!realCount) {
      info.textContent = `0-0 / 0`;
    } else {
      info.textContent = `${startIndex + 1}-${maxEnd} / ${realCount}`;
    }
  }
}

/* ================= LIVE DATA ================= */
async function startLiveLatest(field, label, canvasId, intervalMs, chartKey) {
  const colorMap = {
    hr: "#22c55e",
    temp: "#f59e0b"
  };

  seedInitialWindow(chartKey);
  renderWindow(chartKey, 0);

  chart = buildChart(canvasId, label, colorMap[chartKey], chartKey);
  if (!chart) return;

  moveToLatestWindow(chartKey);

  timer = setInterval(async () => {
    try {
      await fetch(`${API_URL}/measurements/fake?seconds=1`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` }
      });

      const latestRes = await fetch(`${API_URL}/measurements/latest`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (!latestRes.ok) return;

      const latest = await latestRes.json();
      pushHistoryPoint(
        chartKey,
        latest[field],
        latest.created_at || new Date().toISOString()
      );
    } catch (e) {
      console.log("live latest err", e);
    }
  }, intervalMs);
}

async function startLiveECG() {
  seedInitialWindow("ekg");
  renderWindow("ekg", 0);

  chart = buildChart("ekgChart", "EKG", "#38bdf8", "ekg");
  if (!chart) return;

  moveToLatestWindow("ekg");

  timer = setInterval(async () => {
    try {
      await fetch(`${API_URL}/measurements/fake?seconds=1`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` }
      });

      const ecgRes = await fetch(`${API_URL}/measurements/ecg?limit=1`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (!ecgRes.ok) return;

      const series = await ecgRes.json();
      if (Array.isArray(series) && series.length) {
        const row = series[0];
        const v = row.value ?? row.ecg ?? null;
        const t = row.created_at || row.time || new Date().toISOString();
        if (v !== null) pushHistoryPoint("ekg", v, t);
      }
    } catch (e) {
      console.log("live ecg err", e);
    }
  }, 1000);
}

window.goLiveWindow = function (chartKey) {
  moveToLatestWindow(chartKey);
};

/* ================= DOCTOR COMMENT ================= */
async function loadDoctorComment() {
  const box = document.getElementById("doctorCommentText");
  const timeBox = document.getElementById("doctorCommentTime");
  if (!box || !timeBox) return;

  box.textContent = "Yükleniyor...";
  timeBox.textContent = "";

  try {
    const res = await fetch(`${API_URL}/comments/me/latest`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) {
      box.textContent = "Henüz doktor yorumu yok.";
      return;
    }

    const data = await res.json();
    if (!data.comment) {
      box.textContent = "Henüz doktor yorumu yok.";
      return;
    }

    box.textContent = data.comment.comment ?? "Henüz doktor yorumu yok.";
    timeBox.textContent = `Tarih: ${formatDT(data.comment.created_at)} | Doktor ID: ${data.comment.doctor_id}`;
  } catch (e) {
    console.error("loadDoctorComment err:", e);
    box.textContent = "Yorum alınamadı (backend açık mı?)";
    timeBox.textContent = "";
  }
}

window.toggleMyHistory = async function () {
  const wrap = document.getElementById("myHistoryWrap");
  wrap.classList.toggle("hidden");
  if (!wrap.classList.contains("hidden")) {
    await loadMyHistory();
  }
};

async function loadMyHistory() {
  const list = document.getElementById("myHistoryList");
  list.innerHTML = "Yükleniyor...";

  try {
    const res = await fetch(`${API_URL}/comments/me`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) {
      list.innerHTML = "Geçmiş alınamadı.";
      return;
    }

    const rows = await res.json();
    if (!rows.length) {
      list.innerHTML = "Geçmiş yorum yok.";
      return;
    }

    list.innerHTML = "";
    rows.forEach(r => {
      const item = document.createElement("div");
      item.className = "patient-card";
      item.style.margin = "0";
      item.innerHTML = `
        <div style="white-space:pre-wrap;">${escapeHtml(r.comment)}</div>
        <div style="margin-top:8px; color: var(--muted); font-size:12px;">
          ${formatDT(r.created_at)} | Doktor ID: ${r.doctor_id}
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) {
    console.error(e);
    list.innerHTML = "Geçmiş alınamadı.";
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================= LOGOUT ================= */
window.logout = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "../index.html";
};