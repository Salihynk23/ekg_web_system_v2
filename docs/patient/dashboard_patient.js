const API_URL = "https://ekg-web-system-api.onrender.com";
const TOKEN = localStorage.getItem("token");

if (!TOKEN) {
  alert("Giriş yapmalısın");
  window.location.href = "../index.html";
}

let me = null;
let chart = null;
let activeChartKey = null;

const patientChartState = {
  ekg: {
    points: [],
    windowSize: 60,
    sliderId: "ekgRange",
    infoId: "ekgRangeInfo",
    filterDays: 1,
    visibleSlice: []
  },
  hr: {
    points: [],
    windowSize: 60,
    sliderId: "hrRange",
    infoId: "hrRangeInfo",
    filterDays: 1,
    visibleSlice: []
  },
  temp: {
    points: [],
    windowSize: 60,
    sliderId: "tempRange",
    infoId: "tempRangeInfo",
    filterDays: 1,
    visibleSlice: []
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

function formatShortDT(dtStr) {
  if (!dtStr) return "";
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
  hideAllPages();
  const home = document.getElementById("home");
  if (home) home.classList.add("active");
  document.getElementById("backBtn").classList.add("hidden");

  if (chart) {
    chart.destroy();
    chart = null;
  }
  activeChartKey = null;
};

window.showSection = async function (id) {
  hideAllPages();

  const el = document.getElementById(id);
  if (el) el.classList.add("active");

  document.getElementById("backBtn").classList.toggle("hidden", id === "home");

  if (id === "overview") {
    await loadPatientOverview();
  }
  if (id === "ekg") {
    await loadPatientChart("ekg");
  }
  if (id === "hr") {
    await loadPatientChart("hr");
  }
  if (id === "temp") {
    await loadPatientChart("temp");
  }
  if (id === "doctor") {
    await loadDoctorComment();
  }
  if (id === "ai") {
    await loadMyAiLive();
  }
};

/* ================= OVERVIEW ================= */
async function loadPatientOverview() {
  try {
    const res = await fetch(`${API_URL}/measurements/latest`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const ekgEl = document.getElementById("patientLastEcg");
    const tempEl = document.getElementById("patientLastTemp");
    const hrEl = document.getElementById("patientLastHr");

    if (!res.ok) {
      if (ekgEl) ekgEl.textContent = "-";
      if (tempEl) tempEl.textContent = "-";
      if (hrEl) hrEl.textContent = "-";
      return;
    }

    const data = await res.json();

    if (ekgEl) ekgEl.textContent = Number(data.ecg_value).toFixed(3);
    if (tempEl) tempEl.textContent = `${Number(data.temperature).toFixed(2)} °C`;
    if (hrEl) hrEl.textContent = `${data.heart_rate} BPM`;

  } catch (e) {
    console.error("loadPatientOverview err:", e);
  }
}

/* ================= CHART ================= */
function getAxisLimits(chartKey) {
  if (chartKey === "temp") return { min: 35.5, max: 38.5, step: 0.5 };
  if (chartKey === "hr") return { min: 40, max: 140, step: 10 };
  if (chartKey === "ekg") return { min: 0.0, max: 2.2, step: 0.2 };
  return {};
}

function chartColor(chartKey) {
  if (chartKey === "ekg") return "#38bdf8";
  if (chartKey === "hr") return "#22c55e";
  return "#f59e0b";
}

function chartLabel(chartKey) {
  if (chartKey === "ekg") return "EKG";
  if (chartKey === "hr") return "BPM";
  return "°C";
}

function canvasId(chartKey) {
  if (chartKey === "ekg") return "ekgChart";
  if (chartKey === "hr") return "hrChart";
  return "tempChart";
}

function buildChart(chartKey) {
  const canvas = document.getElementById(canvasId(chartKey));
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  const axis = getAxisLimits(chartKey);
  activeChartKey = chartKey;

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: chartLabel(chartKey),
        data: [],
        borderColor: chartColor(chartKey),
        backgroundColor: chartColor(chartKey),
        borderWidth: 4,
        tension: chartKey === "ekg" ? 0.15 : 0.28,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: chartColor(chartKey),
        pointBorderWidth: 2,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#e7eaf3",
            font: { weight: "700" }
          }
        },
        tooltip: {
          backgroundColor: "rgba(11,16,32,.96)",
          titleColor: "#ffffff",
          bodyColor: "#e7eaf3",
          callbacks: {
            title(items) {
              const i = items[0]?.dataIndex ?? 0;
              const current = patientChartState[activeChartKey]?.visibleSlice?.[i];
              return current ? formatDT(current.created_at) : "";
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#aab1c7",
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
        },
        y: {
          min: axis.min,
          max: axis.max,
          ticks: {
            stepSize: axis.step,
            color: "#aab1c7"
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
        }
      }
    }
  });
}

function bindRangeInputs() {
  ["ekg", "hr", "temp"].forEach(key => {
    const slider = document.getElementById(patientChartState[key].sliderId);
    if (!slider) return;

    slider.addEventListener("input", () => {
      renderWindow(key, Number(slider.value));
    });
  });
}

function renderWindow(chartKey, startIndex = 0) {
  const state = patientChartState[chartKey];
  if (!state) return;

  const endIndex = Math.min(startIndex + state.windowSize, state.points.length);
  const slice = state.points.slice(startIndex, endIndex);
  state.visibleSlice = slice;

  if (chart && activeChartKey === chartKey) {
    chart.data.labels = slice.map(p => formatShortDT(p.created_at));
    chart.data.datasets[0].data = slice.map(p => p.value);
    chart.update("none");
  }

  const info = document.getElementById(state.infoId);
  if (info) {
    if (!slice.length) info.textContent = "Veri yok";
    else info.textContent = `${startIndex + 1}-${endIndex} / ${state.points.length}`;
  }
}

function updateSlider(chartKey) {
  const state = patientChartState[chartKey];
  const slider = document.getElementById(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.max = maxStart;
  if (Number(slider.value) > maxStart) slider.value = maxStart;
}

window.goLiveWindow = function (chartKey) {
  const state = patientChartState[chartKey];
  const slider = document.getElementById(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.value = maxStart;
  renderWindow(chartKey, maxStart);
};

window.setPatientFilter = async function (chartKey, days) {
  patientChartState[chartKey].filterDays = days;
  await loadPatientChart(chartKey);
};

async function loadPatientChart(chartKey) {
  const kindMap = {
    ekg: "ecg",
    hr: "heart_rate",
    temp: "temperature"
  };

  try {
    const days = patientChartState[chartKey].filterDays;
    const res = await fetch(
      `${API_URL}/measurements/${kindMap[chartKey]}?limit=500&days=${days}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` }
      }
    );

    if (!res.ok) {
      patientChartState[chartKey].points = [];
    } else {
      patientChartState[chartKey].points = await res.json();
    }

    if (chart) {
      chart.destroy();
      chart = null;
    }

    chart = buildChart(chartKey);
    updateSlider(chartKey);

    const maxStart = Math.max(0, patientChartState[chartKey].points.length - patientChartState[chartKey].windowSize);
    const slider = document.getElementById(patientChartState[chartKey].sliderId);
    if (slider) slider.value = maxStart;

    renderWindow(chartKey, maxStart);

  } catch (e) {
    console.error("loadPatientChart err:", e);
  }
}

/* ================= AI LIVE ================= */
async function loadMyAiLive() {
  try {
    const res = await fetch(`${API_URL}/matlab/analysis/patient/${me.id}/latest`);
    if (!res.ok) return;

    const data = await res.json();
    if (!data.result) return;

    const r = data.result;

    document.getElementById("aiClass").textContent = r.ai_class ?? "-";
    document.getElementById("aiRisk").textContent = r.risk_level ?? "-";
    document.getElementById("aiScore").textContent = r.risk_score ?? "-";
    document.getElementById("aiDiagnosis").textContent = r.diagnosis ?? "-";
    document.getElementById("aiModel").textContent = r.model_name ?? "-";
    document.getElementById("aiComment").textContent = r.ai_comment ?? "-";

    const dt = new Date(r.created_at + "Z");
    document.getElementById("aiTime").textContent =
      dt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });

  } catch (err) {
    console.error("AI live error:", err);
  }
}

setInterval(() => {
  const aiPage = document.getElementById("ai");
  if (aiPage && aiPage.classList.contains("active") && me) {
    loadMyAiLive();
  }
}, 5000);

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