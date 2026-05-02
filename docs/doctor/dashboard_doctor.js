const API_URL = "https://ekg-web-system-api.onrender.com";
const TOKEN = localStorage.getItem("token");

if (!TOKEN) {
  alert("Giriş yapmalısın");
  window.location.href = "../index.html";
}

let currentDoctor = null;
let selectedPatient = null;
let doctorChart = null;
let doctorActiveChartKey = null;

/* ================= LIVE TIMERS ================= */
let doctorLiveTimers = {
  ekg: null,
  hr: null,
  temp: null,
  vitals: null
};

/* ================= MODES ================= */
const doctorMode = {
  ekg: "live",
  hr: "live",
  temp: "live"
};

const doctorPausedByUser = {
  ekg: false,
  hr: false,
  temp: false
};

/* ================= LIVE STATE ================= */
const doctorLiveState = {
  ekg: {
    data: [],
    labels: [],
    counter: 0,
    maxKeep: 2500,
    windowSize: 320
  },
  hr: {
    data: [],
    labels: [],
    counter: 0,
    maxKeep: 1200,
    windowSize: 120,
    value: 76,
    target: 78
  },
  temp: {
    data: [],
    labels: [],
    counter: 0,
    maxKeep: 1200,
    windowSize: 120,
    value: 36.60,
    target: 36.62
  }
};

/* ================= ECG SYNTH ================= */
let doctorBeatTime = 0;
const LIVE_ECG_DT = 0.05;     // daha yumuşak akış
const LIVE_HR_MS = 2000;      // 2 saniyede 1 nabız noktası
const LIVE_TEMP_MS = 3000;    // 3 saniyede 1 sıcaklık noktası
const LIVE_VITALS_REFRESH_MS = 5000;
const DOCTOR_AUTO_REFRESH_MS = 5000;

/* ================= CHART STATE ================= */
const doctorChartState = {
  ekg: {
    points: [],
    windowSize: 320,
    sliderId: "doctorEkgRange",
    infoId: "doctorEkgRangeInfo",
    filterDays: 1,
    visibleSlice: [],
    autoRefreshTimer: null
  },
  hr: {
    points: [],
    windowSize: 120,
    sliderId: "doctorHrRange",
    infoId: "doctorHrRangeInfo",
    filterDays: 1,
    visibleSlice: [],
    autoRefreshTimer: null
  },
  temp: {
    points: [],
    windowSize: 120,
    sliderId: "doctorTempRange",
    infoId: "doctorTempRangeInfo",
    filterDays: 1,
    visibleSlice: [],
    autoRefreshTimer: null
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  goHome();
  bindDoctorRangeInputs();
  await loadMeDoctor();
  await loadPatients();
});

function $(id) {
  return document.getElementById(id);
}

function parseUtcDate(dtStr) {
  if (!dtStr) return null;
  const hasTZ = /Z$|[+-]\d{2}:\d{2}$/.test(dtStr);
  const raw = hasTZ ? dtStr : `${dtStr}Z`;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatDT(dtStr) {
  const d = parseUtcDate(dtStr);
  if (!d) return dtStr || "-";
  return d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul"
  });
}

function formatShortDT(dtStr) {
  const d = parseUtcDate(dtStr);
  if (!d) return dtStr || "";
  return d.toLocaleTimeString("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function nowShortTime() {
  return new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function smoothTowards(current, target, alpha) {
  return current + (target - current) * alpha;
}

function appendLivePoint(key, label, value) {
  const s = doctorLiveState[key];
  s.labels.push(label);
  s.data.push(value);

  if (s.labels.length > s.maxKeep) {
    s.labels.shift();
    s.data.shift();
  }
}

/* ================= AUTH ================= */
async function loadMeDoctor() {
  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) throw new Error("me alınamadı");
    const me = await res.json();

    if (me.role !== "doctor") {
      alert("Bu sayfa sadece doktorlar içindir.");
      logout(true);
      return;
    }

    currentDoctor = me;
    const el = $("docInfo");
    if (el) el.textContent = `${me.username} (id: ${me.id})`;
  } catch (e) {
    console.error(e);
    alert("Oturum geçersiz");
    logout(true);
  }
}

async function loadPatients() {
  const select = $("patientSelect");
  if (!select) return;

  try {
    const res = await fetch(`${API_URL}/users/patients`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) throw new Error("patients alınamadı");

    const patients = await res.json();
    select.innerHTML = `<option value="">— Hasta seçiniz —</option>`;

    patients.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.username} (id:${p.id})`;
      opt.dataset.username = p.username;
      opt.dataset.role = p.role;
      select.appendChild(opt);
    });

  } catch (err) {
    console.error(err);
    alert("Hasta listesi alınamadı. Backend açık mı?");
  }
}

window.onPatientChange = async function () {
  const select = $("patientSelect");
  const menu = $("doctorMenu");
  const info = $("patientInfo");
  const detailCard = $("patientDetailCard");

  if (!select) return;

  const val = select.value;

  if (!val) {
    selectedPatient = null;
    stopAllDoctorLive();
    stopAllDoctorAutoRefresh();

    if (menu) menu.classList.add("hidden");
    if (detailCard) detailCard.classList.add("hidden");
    if (info) info.textContent = "Henüz hasta seçilmedi.";

    const selectedLabel = $("selectedPatientLabel");
    if (selectedLabel) selectedLabel.textContent = "-";

    if ($("doctorText")) $("doctorText").value = "";

    if (doctorChart) {
      doctorChart.destroy();
      doctorChart = null;
    }
    doctorActiveChartKey = null;

    goHome();
    return;
  }

  const opt = select.options[select.selectedIndex];
  selectedPatient = {
    id: Number(val),
    username: opt.dataset.username || opt.textContent,
    role: opt.dataset.role || "patient"
  };

  if (info) info.textContent = `✅ Aktif Hasta: ${selectedPatient.username} (id:${selectedPatient.id})`;
  if (detailCard) detailCard.classList.remove("hidden");

  const pu = $("pUsername");
  const pi = $("pId");
  const pr = $("pRole");
  const selectedLabel = $("selectedPatientLabel");

  if (pu) pu.textContent = `${selectedPatient.username}`;
  if (pi) pi.textContent = selectedPatient.id;
  if (pr) pr.textContent = selectedPatient.role;
  if (selectedLabel) selectedLabel.textContent = `${selectedPatient.username} (id:${selectedPatient.id})`;

  if (menu) menu.classList.remove("hidden");

  if ($("doctorText")) $("doctorText").value = "";

  await loadPatientOverview();
  goHome();
};

/* ================= PAGE ================= */
function hideAllPages() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
}

window.showSection = async function (id) {
  if (!selectedPatient) {
    alert("Önce hasta seçmelisin.");
    return;
  }

  stopAllDoctorAutoRefresh();

  if (id !== "ekg" && id !== "hr" && id !== "temp") {
    stopAllDoctorLive();
  }

  hideAllPages();
  const sec = $(id);
  if (sec) sec.classList.add("active");

  const back = $("backBtn");
  if (back) back.classList.remove("hidden");

  if (id === "overview") {
    await loadPatientOverview();
  }
  if (id === "ekg") {
    await loadDoctorChart("ekg");
    startDoctorAutoRefresh("ekg");
  }
  if (id === "hr") {
    await loadDoctorChart("hr");
    startDoctorAutoRefresh("hr");
  }
  if (id === "temp") {
    await loadDoctorChart("temp");
    startDoctorAutoRefresh("temp");
  }
};

window.goHome = function () {
  hideAllPages();
  const home = $("home");
  if (home) home.classList.add("active");

  const back = $("backBtn");
  if (back) back.classList.add("hidden");

  stopAllDoctorLive();
  stopAllDoctorAutoRefresh();

  if (doctorChart) {
    doctorChart.destroy();
    doctorChart = null;
  }
  doctorActiveChartKey = null;
};

window.logout = function (silent = false) {
  stopAllDoctorLive();
  stopAllDoctorAutoRefresh();
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  if (!silent) alert("Çıkış yapıldı");
  window.location.href = "../index.html";
};

/* ================= OVERVIEW ================= */
async function loadPatientOverview() {
  if (!selectedPatient) return;

  try {
    const res = await fetch(`${API_URL}/measurements/patient/${selectedPatient.id}/latest`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const ekgEl = $("docLastEcg");
    const tempEl = $("docLastTemp");
    const hrEl = $("docLastHr");

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
    console.error("overview error:", e);
  }
}

/* ================= AXIS ================= */
function getDoctorAxisLimits(chartKey) {
  if (chartKey === "temp") return { min: 36.45, max: 36.75, step: 0.05 };
  if (chartKey === "hr") return { min: 60, max: 100, step: 5 };
  if (chartKey === "ekg") return { min: -0.5, max: 1.3, step: 0.2 };
  return {};
}

function doctorCanvasId(chartKey) {
  if (chartKey === "ekg") return "doctorEkgChart";
  if (chartKey === "hr") return "doctorHrChart";
  return "doctorTempChart";
}

function doctorColor(chartKey) {
  if (chartKey === "ekg") return "#38bdf8";
  if (chartKey === "hr") return "#22c55e";
  return "#f59e0b";
}

function doctorLabel(chartKey) {
  if (chartKey === "ekg") return doctorMode.ekg === "live" ? "Canlı EKG" : "EKG";
  if (chartKey === "hr") return doctorMode.hr === "live" ? "Canlı Nabız" : "BPM";
  return doctorMode.temp === "live" ? "Canlı Sıcaklık" : "°C";
}

/* ================= CHART BUILD ================= */
function buildDoctorChart(chartKey) {
  const canvas = $(doctorCanvasId(chartKey));
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  const axis = getDoctorAxisLimits(chartKey);
  doctorActiveChartKey = chartKey;

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: doctorLabel(chartKey),
        data: [],
        borderColor: doctorColor(chartKey),
        backgroundColor: doctorColor(chartKey),
        borderWidth: 4,
        tension: chartKey === "ekg" ? 0.08 : 0.22,
        pointRadius: chartKey === "ekg" ? 0 : 2,
        pointHoverRadius: chartKey === "ekg" ? 0 : 5,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: doctorColor(chartKey),
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
          bodyColor: "#e7eaf3"
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

/* ================= RANGE ================= */
function bindDoctorRangeInputs() {
  ["ekg", "hr", "temp"].forEach(key => {
    const slider = $(doctorChartState[key].sliderId);
    if (!slider) return;

    slider.addEventListener("input", () => {
      if (doctorMode[key] === "live") {
        const liveLen = doctorLiveState[key].data.length;
        const maxStart = Math.max(0, liveLen - doctorChartState[key].windowSize);
        const currentValue = Number(slider.value);

        doctorPausedByUser[key] = currentValue < maxStart;
        renderDoctorLiveWindow(key, currentValue);
        return;
      }

      renderDoctorWindow(key, Number(slider.value));
    });
  });
}

function renderDoctorWindow(chartKey, startIndex = 0) {
  const state = doctorChartState[chartKey];
  const endIndex = Math.min(startIndex + state.windowSize, state.points.length);
  const slice = state.points.slice(startIndex, endIndex);
  state.visibleSlice = slice;

  if (doctorChart && doctorActiveChartKey === chartKey) {
    doctorChart.data.labels = slice.map(p => formatShortDT(p.created_at));
    doctorChart.data.datasets[0].data = slice.map(p => p.value);
    doctorChart.update("none");
  }

  const info = $(state.infoId);
  if (info) {
    info.textContent = slice.length ? `${startIndex + 1}-${endIndex} / ${state.points.length}` : "Veri yok";
  }
}

function renderDoctorLiveWindow(chartKey, startIndex = 0) {
  const live = doctorLiveState[chartKey];
  const endIndex = Math.min(startIndex + doctorChartState[chartKey].windowSize, live.data.length);

  const sliceLabels = live.labels.slice(startIndex, endIndex);
  const sliceData = live.data.slice(startIndex, endIndex);

  if (doctorChart && doctorActiveChartKey === chartKey) {
    doctorChart.data.labels = sliceLabels;
    doctorChart.data.datasets[0].data = sliceData;
    doctorChart.update("none");
  }

  const info = $(doctorChartState[chartKey].infoId);
  if (info) {
    if (doctorPausedByUser[chartKey]) {
      info.textContent = `${startIndex + 1}-${endIndex} / ${live.data.length}`;
    } else {
      if (chartKey === "ekg") info.textContent = "Canlı EKG simülasyonu aktif";
      if (chartKey === "hr") info.textContent = "Canlı nabız simülasyonu aktif";
      if (chartKey === "temp") info.textContent = "Canlı sıcaklık simülasyonu aktif";
    }
  }
}

function updateDoctorSlider(chartKey) {
  const state = doctorChartState[chartKey];
  const slider = $(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.min = 0;
  slider.max = maxStart;
  if (Number(slider.value) > maxStart) slider.value = maxStart;
}

function updateDoctorLiveSlider(chartKey) {
  const slider = $(doctorChartState[chartKey].sliderId);
  if (!slider) return;

  const liveLen = doctorLiveState[chartKey].data.length;
  const maxStart = Math.max(0, liveLen - doctorChartState[chartKey].windowSize);

  slider.min = 0;
  slider.max = maxStart;

  if (!doctorPausedByUser[chartKey]) {
    slider.value = maxStart;
  }
}

window.doctorGoLiveWindow = function (chartKey) {
  if (doctorMode[chartKey] === "live") {
    doctorPausedByUser[chartKey] = false;
    updateDoctorLiveSlider(chartKey);

    const slider = $(doctorChartState[chartKey].sliderId);
    renderDoctorLiveWindow(chartKey, Number(slider.value));
    return;
  }

  const state = doctorChartState[chartKey];
  const slider = $(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.value = maxStart;
  renderDoctorWindow(chartKey, maxStart);
};

/* ================= FILTER ================= */
window.setDoctorFilter = async function (chartKey, days) {
  doctorChartState[chartKey].filterDays = days;
  doctorMode[chartKey] = days === 1 ? "live" : "history";
  await loadDoctorChart(chartKey);
};

async function loadDoctorChart(chartKey) {
  if (!selectedPatient) return;

  if (doctorMode[chartKey] === "live") {
    await startDoctorLiveMode(chartKey);
    return;
  }

  stopDoctorLiveMode(chartKey);

  const kindMap = {
    ekg: "ecg",
    hr: "heart_rate",
    temp: "temperature"
  };

  try {
    const days = doctorChartState[chartKey].filterDays;
    const res = await fetch(
      `${API_URL}/measurements/patient/${selectedPatient.id}/${kindMap[chartKey]}?limit=500&days=${days}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` }
      }
    );

    if (!res.ok) {
      doctorChartState[chartKey].points = [];
    } else {
      doctorChartState[chartKey].points = await res.json();
    }

    if (doctorChart) {
      doctorChart.destroy();
      doctorChart = null;
    }

    doctorChart = buildDoctorChart(chartKey);
    updateDoctorSlider(chartKey);

    const maxStart = Math.max(0, doctorChartState[chartKey].points.length - doctorChartState[chartKey].windowSize);
    const slider = $(doctorChartState[chartKey].sliderId);
    if (slider) {
      slider.disabled = false;
      slider.value = maxStart;
    }

    renderDoctorWindow(chartKey, maxStart);

  } catch (e) {
    console.error("loadDoctorChart err:", e);
  }
}

/* ================= AUTO REFRESH ================= */
function stopDoctorAutoRefresh(chartKey) {
  const state = doctorChartState[chartKey];
  if (state && state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
}

function stopAllDoctorAutoRefresh() {
  ["ekg", "hr", "temp"].forEach(stopDoctorAutoRefresh);
}

function startDoctorAutoRefresh(chartKey) {
  stopDoctorAutoRefresh(chartKey);

  doctorChartState[chartKey].autoRefreshTimer = setInterval(async () => {
    const page = $(chartKey);
    if (!page || !page.classList.contains("active")) return;
    if (!selectedPatient) return;
    if (doctorMode[chartKey] === "live") return;

    await loadDoctorChart(chartKey);
  }, DOCTOR_AUTO_REFRESH_MS);
}

/* ================= BACKEND LIVE VALUES ================= */
async function fetchDoctorLiveVitals() {
  if (!selectedPatient) return;

  try {
    const res = await fetch(`${API_URL}/measurements/patient/${selectedPatient.id}/latest`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) return;
    const data = await res.json();

    const hrIncoming = Number(data.heart_rate);
    if (!isNaN(hrIncoming) && hrIncoming > 0) {
      doctorLiveState.hr.target = clamp(hrIncoming, 65, 95);
    }

    const tempIncoming = Number(data.temperature);
    if (!isNaN(tempIncoming) && tempIncoming > 35 && tempIncoming < 38) {
      doctorLiveState.temp.target = clamp(tempIncoming, 36.50, 36.72);
    }

    const ekgEl = $("docLastEcg");
    const tempEl = $("docLastTemp");
    const hrEl = $("docLastHr");

    if (ekgEl) ekgEl.textContent = Number(data.ecg_value).toFixed(3);
    if (tempEl) tempEl.textContent = `${Number(data.temperature).toFixed(2)} °C`;
    if (hrEl) hrEl.textContent = `${data.heart_rate} BPM`;

  } catch (e) {
    console.error("fetchDoctorLiveVitals error:", e);
  }
}

/* ================= ECG LIVE ================= */
function ecgGaussian(x, mu, sigma, amp) {
  return amp * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
}

function nextSyntheticEcgSample() {
  const hr = clamp(Number(doctorLiveState.hr.target) || 76, 55, 120);
  const beatDuration = 60 / hr;
  const x = doctorBeatTime / beatDuration;

  let y = 0;
  y += ecgGaussian(x, 0.18, 0.025, 0.10);   // P
  y += ecgGaussian(x, 0.36, 0.010, -0.14);  // Q
  y += ecgGaussian(x, 0.40, 0.006, 1.00);   // R
  y += ecgGaussian(x, 0.44, 0.012, -0.26);  // S
  y += ecgGaussian(x, 0.68, 0.055, 0.28);   // T
  y += 0.010 * Math.sin(2 * Math.PI * x);
  y += (Math.random() - 0.5) * 0.012;

  doctorBeatTime += LIVE_ECG_DT;
  if (doctorBeatTime >= beatDuration) doctorBeatTime -= beatDuration;

  return Number(y.toFixed(3));
}

function seedDoctorLiveEcgSeries() {
  const s = doctorLiveState.ekg;
  s.data = [];
  s.labels = [];
  s.counter = 0;
  doctorBeatTime = 0;

  for (let i = 0; i < 700; i++) {
    s.counter += 1;
    appendLivePoint("ekg", `${s.counter}`, nextSyntheticEcgSample());
  }
}

function updateDoctorLiveEcgFrame() {
  if (doctorMode.ekg !== "live") return;

  const s = doctorLiveState.ekg;
  s.counter += 1;
  appendLivePoint("ekg", `${s.counter}`, nextSyntheticEcgSample());

  updateDoctorLiveSlider("ekg");

  const slider = $("doctorEkgRange");
  if (!slider) return;

  if (!doctorPausedByUser.ekg && doctorChart && doctorActiveChartKey === "ekg") {
    renderDoctorLiveWindow("ekg", Number(slider.value));
  }
}

/* ================= HR LIVE ================= */
function seedDoctorLiveHrSeries() {
  const s = doctorLiveState.hr;
  s.data = [];
  s.labels = [];
  s.counter = 0;
  s.value = 76;
  s.target = s.target || 78;

  for (let i = 0; i < 220; i++) {
    s.counter += 1;

    if (i % 25 === 0) {
      s.target = clamp(s.target + rand(-2, 2), 68, 90);
    }

    s.value = smoothTowards(s.value, s.target, 0.12);
    s.value += rand(-0.8, 0.8);
    s.value = clamp(s.value, 65, 95);

    appendLivePoint("hr", nowShortTime(), Number(s.value.toFixed(0)));
  }
}

function updateDoctorLiveHrFrame() {
  if (doctorMode.hr !== "live") return;

  const s = doctorLiveState.hr;
  s.counter += 1;

  if (s.counter % 12 === 0) {
    s.target = clamp(s.target + rand(-2, 2), 68, 90);
  }

  s.value = smoothTowards(s.value, s.target, 0.10);
  s.value += rand(-0.7, 0.7);
  s.value = clamp(s.value, 65, 95);

  appendLivePoint("hr", nowShortTime(), Number(s.value.toFixed(0)));

  updateDoctorLiveSlider("hr");

  const slider = $("doctorHrRange");
  if (!slider) return;

  if (!doctorPausedByUser.hr && doctorChart && doctorActiveChartKey === "hr") {
    renderDoctorLiveWindow("hr", Number(slider.value));
  }
}

/* ================= TEMP LIVE ================= */
function seedDoctorLiveTempSeries() {
  const s = doctorLiveState.temp;
  s.data = [];
  s.labels = [];
  s.counter = 0;
  s.value = 36.60;
  s.target = 36.61;

  for (let i = 0; i < 220; i++) {
    s.counter += 1;

    if (i % 30 === 0) {
      s.target = clamp(s.target + rand(-0.015, 0.015), 36.55, 36.67);
    }

    s.value = smoothTowards(s.value, s.target, 0.08);
    s.value += rand(-0.004, 0.004);
    s.value = clamp(s.value, 36.54, 36.68);

    appendLivePoint("temp", nowShortTime(), Number(s.value.toFixed(2)));
  }
}

function updateDoctorLiveTempFrame() {
  if (doctorMode.temp !== "live") return;

  const s = doctorLiveState.temp;
  s.counter += 1;

  if (s.counter % 10 === 0) {
    s.target = clamp(s.target + rand(-0.01, 0.01), 36.56, 36.66);
  }

  s.value = smoothTowards(s.value, s.target, 0.07);
  s.value += rand(-0.003, 0.003);
  s.value = clamp(s.value, 36.54, 36.68);

  appendLivePoint("temp", nowShortTime(), Number(s.value.toFixed(2)));

  updateDoctorLiveSlider("temp");

  const slider = $("doctorTempRange");
  if (!slider) return;

  if (!doctorPausedByUser.temp && doctorChart && doctorActiveChartKey === "temp") {
    renderDoctorLiveWindow("temp", Number(slider.value));
  }
}

/* ================= LIVE START / STOP ================= */
function stopDoctorLiveMode(chartKey) {
  if (doctorLiveTimers[chartKey]) {
    clearInterval(doctorLiveTimers[chartKey]);
    doctorLiveTimers[chartKey] = null;
  }
  doctorPausedByUser[chartKey] = false;
}

function stopAllDoctorLive() {
  stopDoctorLiveMode("ekg");
  stopDoctorLiveMode("hr");
  stopDoctorLiveMode("temp");

  if (doctorLiveTimers.vitals) {
    clearInterval(doctorLiveTimers.vitals);
    doctorLiveTimers.vitals = null;
  }
}

async function startDoctorLiveMode(chartKey) {
  stopDoctorLiveMode(chartKey);

  if (!doctorLiveTimers.vitals) {
    await fetchDoctorLiveVitals();
    doctorLiveTimers.vitals = setInterval(fetchDoctorLiveVitals, LIVE_VITALS_REFRESH_MS);
  }

  if (doctorChart) {
    doctorChart.destroy();
    doctorChart = null;
  }

  doctorChart = buildDoctorChart(chartKey);
  if (!doctorChart) return;

  doctorPausedByUser[chartKey] = false;

  const slider = $(doctorChartState[chartKey].sliderId);
  if (slider) slider.disabled = false;

  if (chartKey === "ekg") {
    seedDoctorLiveEcgSeries();
    updateDoctorLiveSlider("ekg");
    renderDoctorLiveWindow("ekg", Number($("doctorEkgRange").value));
    doctorLiveTimers.ekg = setInterval(updateDoctorLiveEcgFrame, LIVE_ECG_DT * 1000);
  }

  if (chartKey === "hr") {
    seedDoctorLiveHrSeries();
    updateDoctorLiveSlider("hr");
    renderDoctorLiveWindow("hr", Number($("doctorHrRange").value));
    doctorLiveTimers.hr = setInterval(updateDoctorLiveHrFrame, LIVE_HR_MS);
  }

  if (chartKey === "temp") {
    seedDoctorLiveTempSeries();
    updateDoctorLiveSlider("temp");
    renderDoctorLiveWindow("temp", Number($("doctorTempRange").value));
    doctorLiveTimers.temp = setInterval(updateDoctorLiveTempFrame, LIVE_TEMP_MS);
  }
}

/* ================= COMMENTS ================= */
window.saveComment = async function () {
  if (!selectedPatient) {
    alert("Önce hasta seçmelisin.");
    return;
  }

  const textEl = $("doctorText");
  const text = (textEl?.value || "").trim();
  if (!text) {
    alert("Yorum boş olamaz.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/comments/patient/${selectedPatient.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ comment: text })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("saveComment err:", err);
      alert("Yorum kaydedilemedi");
      return;
    }

    if (textEl) textEl.value = "";

    const historyWrap = $("historyWrap");
    if (historyWrap && !historyWrap.classList.contains("hidden")) {
      await loadHistory();
    }

    alert("Yorum kaydedildi ✅");

  } catch (e) {
    console.error("saveComment catch:", e);
    alert("Sunucuya bağlanılamadı");
  }
};

window.toggleHistory = async function () {
  if (!selectedPatient) {
    alert("Önce hasta seçmelisin.");
    return;
  }

  const wrap = $("historyWrap");
  if (!wrap) return;

  wrap.classList.toggle("hidden");
  if (!wrap.classList.contains("hidden")) {
    await loadHistory();
  }
};

async function loadHistory() {
  const list = $("historyList");
  if (!list) return;

  list.innerHTML = "Yükleniyor...";

  try {
    const res = await fetch(`${API_URL}/comments/patient/${selectedPatient.id}`, {
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
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div style="flex:1;">
            <div style="white-space:pre-wrap;">${escapeHtml(r.comment)}</div>
            <div style="margin-top:8px; color: var(--muted); font-size:12px;">
              ${formatDT(r.created_at)} | Doktor ID: ${r.doctor_id} | Yorum ID: ${r.id}
            </div>
          </div>
          <button class="menu-btn" style="background:#ff3b3b; padding:10px 12px;" onclick="deleteComment(${r.id})">Sil</button>
        </div>
      `;
      list.appendChild(item);
    });

  } catch (e) {
    console.error("history err:", e);
    list.innerHTML = "Geçmiş alınamadı.";
  }
}

window.deleteComment = async function (commentId) {
  if (!confirm("Bu yorumu silmek istiyor musun?")) return;

  try {
    const res = await fetch(`${API_URL}/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) {
      alert("Silinemedi");
      return;
    }

    await loadHistory();
  } catch (e) {
    console.error("delete err:", e);
    alert("Sunucuya bağlanılamadı");
  }
};

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}