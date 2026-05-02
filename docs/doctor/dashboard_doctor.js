const API_URL = "https://ekg-web-system-api.onrender.com";
const TOKEN = localStorage.getItem("token");

if (!TOKEN) {
  alert("Giriş yapmalısın");
  window.location.href = "../index.html";
}

const SIMULATED_PATIENT_ID = 3;
const LIVE_AI_MS = 5000;
const SIM_CRISIS_AFTER_MS = 75 * 1000;

let currentDoctor = null;
let selectedPatient = null;
let doctorChart = null;
let doctorActiveChartKey = null;
let lastRealAiId = null;

let doctorAlarmAudioCtx = null;
let doctorAlarmTimer = null;
let doctorAlarmSilenced = false;
let doctorOverlayDismissed = false;
let doctorOverviewTimer = null;

const doctorSimScenario = {
  sessionStartMs: null,
  crisisConfirmed: false
};

let doctorLiveTimers = {
  ekg: null,
  hr: null,
  temp: null,
  ai: null
};

const doctorLiveData = {
  ekg: [],
  hr: [],
  temp: []
};

const doctorMaxLivePoints = {
  ekg: 1200,
  hr: 800,
  temp: 800
};

const doctorLiveGenerator = {
  ekg: {
    phase: 0,
    sampleIntervalMs: 80
  },
  hr: {
    value: 78,
    drift: 0
  },
  temp: {
    value: 36.60,
    drift: 0
  }
};

let doctorSimulatedAi = {
  id: 0,
  ai_class: "0-Normal",
  risk_level: "low",
  risk_score: 0.10,
  diagnosis: "Normal ritim",
  model_name: "simulator_v1",
  ai_comment: "Mevcut kayıt normal ritim özellikleri göstermektedir.",
  created_at: new Date().toISOString()
};

const doctorMode = {
  ekg: "history",
  hr: "history",
  temp: "history"
};

const doctorPausedByUser = {
  ekg: false,
  hr: false,
  temp: false
};

const doctorChartState = {
  ekg: {
    points: [],
    windowSize: 160,
    sliderId: "doctorEkgRange",
    infoId: "doctorEkgRangeInfo",
    filterDays: 1,
    visibleSlice: []
  },
  hr: {
    points: [],
    windowSize: 120,
    sliderId: "doctorHrRange",
    infoId: "doctorHrRangeInfo",
    filterDays: 1,
    visibleSlice: []
  },
  temp: {
    points: [],
    windowSize: 120,
    sliderId: "doctorTempRange",
    infoId: "doctorTempRangeInfo",
    filterDays: 1,
    visibleSlice: []
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  goHome();
  setHomeNoticeNormal();
  bindDoctorRangeInputs();
  await loadMeDoctor();
  await loadPatients();
});

function $(id) {
  return document.getElementById(id);
}

function isSimulatedPatient() {
  return selectedPatient && Number(selectedPatient.id) === SIMULATED_PATIENT_ID;
}

function normalizeDateString(dtStr) {
  if (!dtStr) return dtStr;
  if (/[zZ]$/.test(dtStr) || /[+\-]\d{2}:\d{2}$/.test(dtStr)) return dtStr;
  return `${dtStr}Z`;
}

function formatDT(dtStr) {
  if (!dtStr) return "-";
  const d = new Date(normalizeDateString(dtStr));
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

function formatShortDT(dtStr) {
  if (!dtStr) return "";
  const d = new Date(normalizeDateString(dtStr));
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleTimeString("tr-TR", {
    timeZone: "Europe/Istanbul",
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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================= HOME NOTICE ================= */
function updateHomeNotice({
  title = "Panel Hazır",
  text = "Henüz aktif bir alarm bulunmuyor. Hasta seçimi yaptıktan sonra sistem durumu burada özetlenecek.",
  badge = "NORMAL",
  badgeBg = "rgba(80,255,160,.12)",
  badgeColor = "#89ffb8",
  badgeBorder = "rgba(80,255,160,.22)"
} = {}) {
  const titleEl = $("homeNoticeTitle");
  const textEl = $("homeNoticeText");
  const badgeEl = $("homeNoticeBadge");
  const timeEl = $("homeNoticeTime");

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;

  if (badgeEl) {
    badgeEl.textContent = badge;
    badgeEl.style.background = badgeBg;
    badgeEl.style.color = badgeColor;
    badgeEl.style.borderColor = badgeBorder;
  }

  if (timeEl) {
    timeEl.textContent = `Son güncelleme: ${new Date().toLocaleTimeString("tr-TR")}`;
  }
}

function setHomeNoticeNormal() {
  updateHomeNotice({
    title: "Panel Hazır",
    text: "Henüz aktif bir alarm bulunmuyor. Hasta seçimi yaptıktan sonra sistem durumu burada özetlenecek.",
    badge: "NORMAL",
    badgeBg: "rgba(80,255,160,.12)",
    badgeColor: "#89ffb8",
    badgeBorder: "rgba(80,255,160,.22)"
  });
}

function setHomeNoticePatientSelected() {
  if (!selectedPatient) {
    setHomeNoticeNormal();
    return;
  }

  updateHomeNotice({
    title: `${selectedPatient.username} aktif`,
    text: isSimulatedPatient()
      ? "Bu hasta için canlı simülasyon modu açık. Olası kritik durumlar ve AI teşhisi sistem tarafından dinamik olarak üretilecektir."
      : "Bu hasta için gerçek backend verileri gösteriliyor. Güncel ölçümler ve AI analizi ilgili sayfalarda izlenebilir.",
    badge: isSimulatedPatient() ? "SİMÜLASYON" : "GERÇEK VERİ",
    badgeBg: isSimulatedPatient() ? "rgba(80,170,255,.14)" : "rgba(80,255,160,.12)",
    badgeColor: isSimulatedPatient() ? "#8fc7ff" : "#89ffb8",
    badgeBorder: isSimulatedPatient() ? "rgba(80,170,255,.25)" : "rgba(80,255,160,.22)"
  });
}

function setHomeNoticeCritical() {
  updateHomeNotice({
    title: "Kritik Alarm Aktif",
    text: "Süregelen kritik kardiyak durum algılandı. Acil müdahale protokolü tetiklendi. Hasta durumu derhal değerlendirilmelidir.",
    badge: "KRİTİK",
    badgeBg: "rgba(255,80,80,.14)",
    badgeColor: "#ff9d9d",
    badgeBorder: "rgba(255,80,80,.30)"
  });
}

/* ================= EMERGENCY ================= */
function resetDoctorSimScenario() {
  doctorSimScenario.sessionStartMs = Date.now();
  doctorSimScenario.crisisConfirmed = false;
  doctorAlarmSilenced = false;
  doctorOverlayDismissed = false;
  hideEmergencyOverlay(true);
  silenceEmergencyAlarm();
}

function getDoctorSimElapsedMs() {
  if (!doctorSimScenario.sessionStartMs) return 0;
  return Date.now() - doctorSimScenario.sessionStartMs;
}

function isSimAbnormalVitalsNow() {
  if (!isSimulatedPatient()) return false;
  return getDoctorSimElapsedMs() >= SIM_CRISIS_AFTER_MS;
}

function updateDoctorSimScenario() {
  if (!isSimulatedPatient()) return;
  doctorSimScenario.crisisConfirmed = isSimAbnormalVitalsNow();
}

function isDoctorCriticalPhase() {
  updateDoctorSimScenario();
  return isSimulatedPatient() && doctorSimScenario.crisisConfirmed;
}

function showEmergencyOverlay() {
  if (doctorOverlayDismissed) return;

  const overlay = $("emergencyOverlay");
  const details = $("emergencyOverlayDetails");
  if (!overlay) return;

  overlay.style.display = "flex";

  if (details) {
    details.innerHTML = `
      <strong>Hasta:</strong> ${escapeHtml(selectedPatient?.username || "-")}<br>
      <strong>Durum:</strong> Süregelen kritik kardiyak olay senaryosu<br>
      <strong>Eylem:</strong> Acil müdahale protokolü başlatılmalı
    `;
  }

  setHomeNoticeCritical();
}

window.hideEmergencyOverlay = function (force = false) {
  const overlay = $("emergencyOverlay");
  if (overlay) overlay.style.display = "none";

  if (!force) {
    doctorOverlayDismissed = true;
  }

  if (isDoctorCriticalPhase()) {
    setHomeNoticeCritical();
  } else if (selectedPatient) {
    setHomeNoticePatientSelected();
  } else {
    setHomeNoticeNormal();
  }
};

async function beepEmergency() {
  try {
    if (!doctorAlarmAudioCtx) {
      doctorAlarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (doctorAlarmAudioCtx.state === "suspended") {
      await doctorAlarmAudioCtx.resume();
    }

    const ctx = doctorAlarmAudioCtx;
    const start = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(620, start);
    osc1.frequency.linearRampToValueAtTime(880, start + 0.45);
    osc1.frequency.linearRampToValueAtTime(620, start + 0.9);

    osc2.frequency.setValueAtTime(480, start);
    osc2.frequency.linearRampToValueAtTime(700, start + 0.45);
    osc2.frequency.linearRampToValueAtTime(480, start + 0.9);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
    gain.gain.setValueAtTime(0.18, start + 0.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.95);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + 1.0);
    osc2.stop(start + 1.0);
  } catch (e) {
    console.error("alarm beep error", e);
  }
}

async function startEmergencyAlarm() {
  if (doctorAlarmSilenced) return;
  if (doctorAlarmTimer) return;

  await beepEmergency();

  doctorAlarmTimer = setInterval(() => {
    if (doctorAlarmSilenced) return;
    beepEmergency();
  }, 1000);
}

window.silenceEmergencyAlarm = function () {
  doctorAlarmSilenced = true;

  if (doctorAlarmTimer) {
    clearInterval(doctorAlarmTimer);
    doctorAlarmTimer = null;
  }
};

/* ================= OVERVIEW LIVE ================= */
function stopDoctorOverviewAuto() {
  if (doctorOverviewTimer) {
    clearInterval(doctorOverviewTimer);
    doctorOverviewTimer = null;
  }
}

function startDoctorOverviewAuto() {
  stopDoctorOverviewAuto();

  if (!selectedPatient) return;

  doctorOverviewTimer = setInterval(async () => {
    const overviewPage = $("overview");
    if (!overviewPage || !overviewPage.classList.contains("active")) return;
    await loadPatientOverview();
  }, 1500);
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

  stopAllDoctorLiveModes(true);
  stopDoctorAiAuto();
  stopDoctorOverviewAuto();

  const val = select.value;

  if (!val) {
    selectedPatient = null;

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

    clearDoctorAiBox();
    setHomeNoticeNormal();
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

  if (isSimulatedPatient()) {
    doctorMode.ekg = "live";
    doctorMode.hr = "live";
    doctorMode.temp = "live";
    initSimulatedAi();
    resetDoctorSimScenario();
  } else {
    doctorMode.ekg = "history";
    doctorMode.hr = "history";
    doctorMode.temp = "history";
    hideEmergencyOverlay(true);
    silenceEmergencyAlarm();
  }

  await loadLatestCommentSafe();
  await loadPatientOverview();
  await loadDoctorAi();
  setHomeNoticePatientSelected();
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

  hideAllPages();
  const sec = $(id);
  if (sec) sec.classList.add("active");

  const back = $("backBtn");
  if (back) back.classList.remove("hidden");

  stopDoctorOverviewAuto();

  if (id === "overview") {
    await loadPatientOverview();
    startDoctorOverviewAuto();
  }
  if (id === "ekg") await loadDoctorChart("ekg");
  if (id === "hr") await loadDoctorChart("hr");
  if (id === "temp") await loadDoctorChart("temp");

  if (id === "ai") {
    await loadDoctorAi();
    startDoctorAiAuto();
  } else {
    stopDoctorAiAuto();
  }
};

window.goHome = function () {
  hideAllPages();
  const home = $("home");
  if (home) home.classList.add("active");

  const back = $("backBtn");
  if (back) back.classList.add("hidden");

  if (doctorChart) {
    doctorChart.destroy();
    doctorChart = null;
  }
  doctorActiveChartKey = null;
  stopDoctorAiAuto();
  stopDoctorOverviewAuto();
};

window.logout = function (silent = false) {
  stopAllDoctorLiveModes(true);
  stopDoctorAiAuto();
  stopDoctorOverviewAuto();
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  if (!silent) alert("Çıkış yapıldı");
  window.location.href = "../index.html";
};

/* ================= OVERVIEW ================= */
async function loadPatientOverview() {
  if (!selectedPatient) return;

  if (isSimulatedPatient()) {
    updateDoctorSimScenario();

    const ekgEl = $("docLastEcg");
    const tempEl = $("docLastTemp");
    const hrEl = $("docLastHr");

    const ekgValue = generateDoctorLiveEkg();
    const hrValue = generateDoctorLiveHr();
    const tempValue = generateDoctorLiveTemp();

    if (ekgEl) ekgEl.textContent = Number(ekgValue).toFixed(3);
    if (tempEl) tempEl.textContent = `${Number(tempValue).toFixed(2)} °C`;
    if (hrEl) hrEl.textContent = `${hrValue} BPM`;

    if (isDoctorCriticalPhase()) {
      showEmergencyOverlay();
      startEmergencyAlarm();
    }

    return;
  }

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

/* ================= CHART HELPERS ================= */
function getDoctorAxisLimits(chartKey) {
  if (chartKey === "temp") {
    if (isSimulatedPatient() && doctorMode[chartKey] === "live") {
      return { min: 36.45, max: 37.35, step: 0.1 };
    }
    return { min: 35.5, max: 38.5, step: 0.5 };
  }

  if (chartKey === "hr") {
    if (isSimulatedPatient() && doctorMode[chartKey] === "live") {
      return { min: 60, max: 170, step: 10 };
    }
    return { min: 40, max: 140, step: 10 };
  }

  if (chartKey === "ekg") {
    if (isSimulatedPatient() && doctorMode[chartKey] === "live") {
      return { min: -0.5, max: 1.4, step: 0.2 };
    }
    return { min: 0.0, max: 2.2, step: 0.2 };
  }

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
  if (chartKey === "ekg") return (isSimulatedPatient() && doctorMode.ekg === "live") ? "Canlı EKG" : "EKG";
  if (chartKey === "hr") return (isSimulatedPatient() && doctorMode.hr === "live") ? "Canlı Nabız" : "BPM";
  return (isSimulatedPatient() && doctorMode.temp === "live") ? "Canlı Sıcaklık" : "°C";
}

function currentDoctorSlice(chartKey) {
  return doctorChartState[chartKey]?.visibleSlice || [];
}

function buildDoctorChart(chartKey) {
  const canvasId = doctorCanvasId(chartKey);
  const canvas = $(canvasId);
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
        borderWidth: chartKey === "ekg" ? 3.5 : 3,
        tension: chartKey === "ekg" ? 0.18 : 0.25,
        pointRadius: chartKey === "ekg" ? 0 : 3,
        pointHoverRadius: 6,
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
          bodyColor: "#e7eaf3",
          callbacks: {
            title(items) {
              const i = items[0]?.dataIndex ?? 0;
              const current = currentDoctorSlice(doctorActiveChartKey)?.[i];
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

function bindDoctorRangeInputs() {
  ["ekg", "hr", "temp"].forEach(key => {
    const slider = $(doctorChartState[key].sliderId);
    if (!slider) return;

    slider.addEventListener("input", () => {
      if (doctorMode[key] === "live" && isSimulatedPatient()) {
        const maxStart = Math.max(0, doctorLiveData[key].length - doctorChartState[key].windowSize);
        const currentVal = Number(slider.value);
        doctorPausedByUser[key] = currentVal < maxStart;
        renderDoctorLiveWindow(key, currentVal);
      } else {
        renderDoctorWindow(key, Number(slider.value));
      }
    });
  });
}

/* ================= HISTORY MODE ================= */
function renderDoctorWindow(chartKey, startIndex = 0) {
  const state = doctorChartState[chartKey];
  const endIndex = Math.min(startIndex + state.windowSize, state.points.length);
  const slice = state.points.slice(startIndex, endIndex);
  state.visibleSlice = slice;

  if (doctorChart && doctorActiveChartKey === chartKey) {
    doctorChart.data.labels = slice.map(p => formatShortDT(p.created_at));
    doctorChart.data.datasets[0].data = slice.map(p => p.value);
    doctorChart.data.datasets[0].label = doctorLabel(chartKey);
    doctorChart.update("none");
  }

  const info = $(state.infoId);
  if (info) info.textContent = slice.length ? `${startIndex + 1}-${endIndex} / ${state.points.length}` : "Veri yok";
}

function updateDoctorSlider(chartKey) {
  const state = doctorChartState[chartKey];
  const slider = $(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.max = maxStart;
  if (Number(slider.value) > maxStart) slider.value = maxStart;
  slider.disabled = false;
}

/* ================= LIVE MODE ================= */
function ensureDoctorLiveSeed(chartKey) {
  if (doctorLiveData[chartKey].length) return;

  const now = Date.now();

  if (chartKey === "ekg") {
    for (let i = 0; i < 220; i++) {
      appendDoctorLivePoint(
        "ekg",
        generateDoctorLiveEkg(),
        new Date(now - (220 - i) * doctorLiveGenerator.ekg.sampleIntervalMs).toISOString(),
        false
      );
    }
  }

  if (chartKey === "hr") {
    for (let i = 0; i < 140; i++) {
      appendDoctorLivePoint(
        "hr",
        generateDoctorLiveHr(),
        new Date(now - (140 - i) * 1000).toISOString(),
        false
      );
    }
  }

  if (chartKey === "temp") {
    for (let i = 0; i < 140; i++) {
      appendDoctorLivePoint(
        "temp",
        generateDoctorLiveTemp(),
        new Date(now - (140 - i) * 1000).toISOString(),
        false
      );
    }
  }
}

function appendDoctorLivePoint(chartKey, value, createdAt = new Date().toISOString(), render = true) {
  const arr = doctorLiveData[chartKey];
  arr.push({ value, created_at: createdAt });

  if (arr.length > doctorMaxLivePoints[chartKey]) arr.shift();

  if (render && doctorActiveChartKey === chartKey && doctorMode[chartKey] === "live") {
    updateDoctorLiveSlider(chartKey);
  }
}

function renderDoctorLiveWindow(chartKey, startIndex = 0) {
  const state = doctorChartState[chartKey];
  const data = doctorLiveData[chartKey];
  const endIndex = Math.min(startIndex + state.windowSize, data.length);
  const slice = data.slice(startIndex, endIndex);
  state.visibleSlice = slice;

  if (doctorChart && doctorActiveChartKey === chartKey) {
    doctorChart.data.labels = slice.map(p => formatShortDT(p.created_at));
    doctorChart.data.datasets[0].data = slice.map(p => p.value);
    doctorChart.data.datasets[0].label = doctorLabel(chartKey);
    doctorChart.update("none");
  }

  const info = $(state.infoId);
  if (info) {
    if (!slice.length) {
      info.textContent = "Veri yok";
    } else {
      const maxStart = Math.max(0, data.length - state.windowSize);
      const liveText = doctorPausedByUser[chartKey]
        ? "Geçmiş görüntüleniyor"
        : `Canlı ${chartKey === "ekg" ? "EKG" : chartKey === "hr" ? "nabız" : "sıcaklık"} simülasyonu aktif`;

      info.textContent = `${startIndex + 1}-${endIndex} / ${data.length} | ${liveText}`;

      const slider = $(state.sliderId);
      if (slider && !doctorPausedByUser[chartKey] && Number(slider.value) !== maxStart) {
        slider.value = maxStart;
      }
    }
  }
}

function updateDoctorLiveSlider(chartKey) {
  const state = doctorChartState[chartKey];
  const slider = $(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, doctorLiveData[chartKey].length - state.windowSize);
  slider.max = maxStart;
  slider.disabled = false;

  if (!doctorPausedByUser[chartKey]) {
    slider.value = maxStart;
    renderDoctorLiveWindow(chartKey, maxStart);
  }
}

function startDoctorLiveMode(chartKey) {
  if (!isSimulatedPatient()) return;

  ensureDoctorLiveSeed(chartKey);

  if (!doctorLiveTimers[chartKey]) {
    const intervalMs = chartKey === "ekg" ? doctorLiveGenerator.ekg.sampleIntervalMs : 1000;

    doctorLiveTimers[chartKey] = setInterval(() => {
      if (chartKey === "ekg") appendDoctorLivePoint("ekg", generateDoctorLiveEkg());
      if (chartKey === "hr") appendDoctorLivePoint("hr", generateDoctorLiveHr());
      if (chartKey === "temp") appendDoctorLivePoint("temp", generateDoctorLiveTemp());

      if (isDoctorCriticalPhase()) {
        showEmergencyOverlay();
        startEmergencyAlarm();
      }
    }, intervalMs);
  }

  if (doctorChart) {
    doctorChart.destroy();
    doctorChart = null;
  }

  doctorChart = buildDoctorChart(chartKey);
  doctorPausedByUser[chartKey] = false;
  updateDoctorLiveSlider(chartKey);
}

function stopDoctorLiveMode(chartKey, clearData = false) {
  if (doctorLiveTimers[chartKey]) {
    clearInterval(doctorLiveTimers[chartKey]);
    doctorLiveTimers[chartKey] = null;
  }

  doctorPausedByUser[chartKey] = false;
  if (clearData) doctorLiveData[chartKey] = [];
}

function stopAllDoctorLiveModes(clearData = false) {
  ["ekg", "hr", "temp"].forEach(key => stopDoctorLiveMode(key, clearData));
}

window.doctorGoLiveWindow = function (chartKey) {
  if (doctorMode[chartKey] === "live" && isSimulatedPatient()) {
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

window.setDoctorFilter = async function (chartKey, days) {
  doctorChartState[chartKey].filterDays = days;
  doctorMode[chartKey] = (isSimulatedPatient() && days === 1) ? "live" : "history";
  await loadDoctorChart(chartKey);
};

async function loadDoctorChart(chartKey) {
  if (!selectedPatient) return;

  if (doctorMode[chartKey] === "live" && isSimulatedPatient()) {
    startDoctorLiveMode(chartKey);
    return;
  }

  stopDoctorLiveMode(chartKey, false);

  const kindMap = { ekg: "ecg", hr: "heart_rate", temp: "temperature" };

  try {
    const days = doctorChartState[chartKey].filterDays;
    const res = await fetch(
      `${API_URL}/measurements/patient/${selectedPatient.id}/${kindMap[chartKey]}?limit=500&days=${days}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    doctorChartState[chartKey].points = res.ok ? await res.json() : [];

    if (doctorChart) {
      doctorChart.destroy();
      doctorChart = null;
    }

    doctorChart = buildDoctorChart(chartKey);
    updateDoctorSlider(chartKey);

    const maxStart = Math.max(0, doctorChartState[chartKey].points.length - doctorChartState[chartKey].windowSize);
    const slider = $(doctorChartState[chartKey].sliderId);
    if (slider) slider.value = maxStart;

    renderDoctorWindow(chartKey, maxStart);

  } catch (e) {
    console.error("loadDoctorChart err:", e);
  }
}

/* ================= LIVE DATA GENERATORS ================= */
function generateDoctorLiveHr() {
  updateDoctorSimScenario();

  const s = doctorLiveGenerator.hr;

  if (isSimAbnormalVitalsNow()) {
    const target = 138 + 14 * Math.sin(Date.now() / 2200) + rand(-6, 6);
    s.value += (target - s.value) * 0.24 + rand(-4, 4);
    s.value = clamp(s.value, 118, 168);
    return Math.round(s.value);
  }

  s.drift += rand(-0.6, 0.6);
  s.drift = clamp(s.drift, -4, 4);

  const target = 78 + 3 * Math.sin(Date.now() / 18000) + s.drift;
  s.value += (target - s.value) * 0.18 + rand(-1.0, 1.0);
  s.value = clamp(s.value, 68, 92);

  return Math.round(s.value);
}

function generateDoctorLiveTemp() {
  updateDoctorSimScenario();

  const s = doctorLiveGenerator.temp;

  if (isSimAbnormalVitalsNow()) {
    const target = 37.15 + 0.06 * Math.sin(Date.now() / 9000);
    s.value += (target - s.value) * 0.10 + rand(-0.01, 0.01);
    s.value = clamp(s.value, 36.95, 37.35);
    return Number(s.value.toFixed(2));
  }

  const slowWave = 36.60 + 0.02 * Math.sin(Date.now() / 60000);
  s.value += (slowWave - s.value) * 0.15 + rand(-0.006, 0.006);
  s.value = clamp(s.value, 36.55, 36.65);
  return Number(s.value.toFixed(2));
}

function generateDoctorLiveEkg() {
  updateDoctorSimScenario();

  const s = doctorLiveGenerator.ekg;
  const hr = doctorLiveGenerator.hr.value || 78;

  const beatHz = hr / 60;
  const dt = s.sampleIntervalMs / 1000;
  s.phase += beatHz * dt;

  while (s.phase >= 1) s.phase -= 1;

  const t = s.phase;
  let value = 0;

  if (isSimAbnormalVitalsNow()) {
    value += 0.04 * Math.exp(-Math.pow((t - 0.15) / 0.05, 2));
    value += -0.10 * Math.exp(-Math.pow((t - 0.34) / 0.020, 2));
    value += 0.65 * Math.exp(-Math.pow((t - 0.39) / 0.018, 2));
    value += -0.16 * Math.exp(-Math.pow((t - 0.46) / 0.022, 2));
    value += 0.36 * Math.exp(-Math.pow((t - 0.64) / 0.11, 2));
    value += 0.10;
    value += 0.03 * Math.sin(Date.now() / 180);
    value += rand(-0.03, 0.03);
  } else {
    value += 0.10 * Math.exp(-Math.pow((t - 0.18) / 0.035, 2));
    value += -0.14 * Math.exp(-Math.pow((t - 0.36) / 0.012, 2));
    value += 1.08 * Math.exp(-Math.pow((t - 0.40) / 0.008, 2));
    value += -0.28 * Math.exp(-Math.pow((t - 0.43) / 0.014, 2));
    value += 0.28 * Math.exp(-Math.pow((t - 0.68) / 0.06, 2));
    value += 0.015 * Math.sin(Date.now() / 500);
    value += rand(-0.015, 0.015);
  }

  return Number(value.toFixed(3));
}

/* ================= AI ================= */
function clearDoctorAiBox() {
  ["docAiClass", "docAiRisk", "docAiScore", "docAiDiagnosis", "docAiModel", "docAiComment", "docAiTime"]
    .forEach(id => {
      const el = $(id);
      if (el) el.textContent = "-";
    });
}

function initSimulatedAi() {
  doctorSimulatedAi = {
    id: 1,
    ai_class: "0-Normal",
    risk_level: "low",
    risk_score: 0.10,
    diagnosis: "Normal ritim",
    model_name: "simulator_v1",
    ai_comment: "Mevcut kayıt normal ritim özellikleri göstermektedir.",
    created_at: new Date().toISOString()
  };
}

function generateSimulatedAiRecord() {
  updateDoctorSimScenario();

  if (isDoctorCriticalPhase()) {
    doctorSimulatedAi = {
      id: doctorSimulatedAi.id + 1,
      ai_class: "CRITICAL-MI",
      risk_level: "critical",
      risk_score: 0.99,
      diagnosis: "Akut miyokard enfarktüsü / kritik kardiyak olay şüphesi",
      model_name: "simulator_v1",
      ai_comment: "Süregelen kritik anomali nedeniyle acil müdahale önerilir. Yüksek riskli kardiyak olay senaryosu algılandı.",
      created_at: new Date().toISOString()
    };
    showEmergencyOverlay();
    startEmergencyAlarm();
    return;
  }

  if (isSimAbnormalVitalsNow()) {
    doctorSimulatedAi = {
      id: doctorSimulatedAi.id + 1,
      ai_class: "HIGH-RISK-CARDIAC",
      risk_level: "high",
      risk_score: 0.90,
      diagnosis: "Süregelen yüksek riskli kardiyak durum",
      model_name: "simulator_v1",
      ai_comment: "Anormal vitaller ve EKG örüntüsü izleniyor. Kritik olay riski çok yüksektir.",
      created_at: new Date().toISOString()
    };
    return;
  }

  const scenarios = [
    {
      ai_class: "0-Normal",
      risk_level: "low",
      risk_score: 0.10,
      diagnosis: "Normal ritim",
      ai_comment: "Mevcut kayıt normal ritim özellikleri göstermektedir."
    },
    {
      ai_class: "2-V (VEB/PVC)",
      risk_level: "high",
      risk_score: 0.84,
      diagnosis: "Ventriküler anomali / PVC şüphesi",
      ai_comment: "Ventriküler kaynaklı erken atım ile uyumlu bir patern saptandı."
    },
    {
      ai_class: "4-Q (Signal quality low)",
      risk_level: "medium",
      risk_score: 0.32,
      diagnosis: "Sinyal kalitesi düşük",
      ai_comment: "Sinyal kalitesi düşük olduğu için güvenilir sınıflandırma yapılamadı."
    },
    {
      ai_class: "1-S",
      risk_level: "medium",
      risk_score: 0.58,
      diagnosis: "Supraventriküler anomali şüphesi",
      ai_comment: "Supraventriküler kökenli ritim bozukluğu ile uyumlu bulgular gözlendi."
    }
  ];

  const pick = scenarios[Math.floor(Math.random() * scenarios.length)];
  doctorSimulatedAi = {
    id: doctorSimulatedAi.id + 1,
    ...pick,
    model_name: "simulator_v1",
    created_at: new Date().toISOString()
  };
}

function renderDoctorAi(result) {
  if (!result) {
    clearDoctorAiBox();
    return;
  }

  const set = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value ?? "-";
  };

  set("docAiClass", result.ai_class);
  set("docAiRisk", result.risk_level);
  set("docAiScore", result.risk_score);
  set("docAiDiagnosis", result.diagnosis);
  set("docAiModel", result.model_name);
  set("docAiComment", result.ai_comment);
  set("docAiTime", formatDT(result.created_at));

  const aiPanel = $("doctorAiCard");
  if (aiPanel) {
    const level = String(result.risk_level).toLowerCase();
    if (level === "critical") {
      aiPanel.style.border = "2px solid rgba(255,80,80,.75)";
      aiPanel.style.boxShadow = "0 0 0 1px rgba(255,80,80,.25), 0 20px 50px rgba(255,0,0,.15)";
    } else if (level === "high") {
      aiPanel.style.border = "2px solid rgba(255,180,80,.55)";
      aiPanel.style.boxShadow = "0 0 0 1px rgba(255,180,80,.18), 0 20px 50px rgba(255,180,0,.10)";
    } else {
      aiPanel.style.border = "";
      aiPanel.style.boxShadow = "";
    }
  }
}

async function loadDoctorAi() {
  if (!selectedPatient) return;

  if (isSimulatedPatient()) {
    renderDoctorAi(doctorSimulatedAi);
    return;
  }

  try {
    const res = await fetch(`${API_URL}/matlab/analysis/patient/${selectedPatient.id}/latest`);
    if (!res.ok) {
      clearDoctorAiBox();
      return;
    }

    const data = await res.json();
    if (!data.result) {
      clearDoctorAiBox();
      return;
    }

    const currentId = data.result.id ?? data.result.created_at;
    if (currentId !== lastRealAiId) {
      lastRealAiId = currentId;
      renderDoctorAi(data.result);
    }
  } catch (e) {
    console.error("AI load error:", e);
    clearDoctorAiBox();
  }
}

function startDoctorAiAuto() {
  stopDoctorAiAuto();
  if (!selectedPatient) return;

  if (isSimulatedPatient()) {
    doctorLiveTimers.ai = setInterval(() => {
      const aiPage = $("ai");
      if (!aiPage || !aiPage.classList.contains("active")) return;

      generateSimulatedAiRecord();
      renderDoctorAi(doctorSimulatedAi);
    }, LIVE_AI_MS);
    return;
  }

  doctorLiveTimers.ai = setInterval(async () => {
    const aiPage = $("ai");
    if (!aiPage || !aiPage.classList.contains("active")) return;
    await loadDoctorAi();
  }, 5000);
}

function stopDoctorAiAuto() {
  if (doctorLiveTimers.ai) {
    clearInterval(doctorLiveTimers.ai);
    doctorLiveTimers.ai = null;
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
    await loadLatestCommentSafe();

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

async function loadLatestCommentSafe() {
  const box = $("latestCommentBox");
  const time = $("latestCommentTime");
  if (!box || !time || !selectedPatient) return;

  box.textContent = "Yükleniyor...";
  time.textContent = "";

  try {
    const res = await fetch(`${API_URL}/comments/patient/${selectedPatient.id}/latest`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) {
      box.textContent = "Henüz yorum yok.";
      time.textContent = "";
      return;
    }

    const data = await res.json();
    if (!data.comment) {
      box.textContent = "Henüz yorum yok.";
      time.textContent = "";
      return;
    }

    box.textContent = data.comment.comment ?? "Henüz yorum yok.";
    time.textContent = `Tarih: ${formatDT(data.comment.created_at)} | Doktor ID: ${data.comment.doctor_id}`;
  } catch (e) {
    console.error("latest err:", e);
    box.textContent = "Yorum alınamadı";
    time.textContent = "";
  }
}

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
  if (!list || !selectedPatient) return;

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

    await loadLatestCommentSafe();
    await loadHistory();
  } catch (e) {
    console.error("delete err:", e);
    alert("Sunucuya bağlanılamadı");
  }
};