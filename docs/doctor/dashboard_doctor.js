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

/* ===============================
   CANLI GERÇEĞE BENZER EKG SİMÜLASYONU
   =============================== */
let doctorLiveEcgTimer = null;
let doctorLiveVitalsTimer = null;
let doctorLiveHr = 75;
let doctorLiveTemp = 0;
let doctorLiveSeries = [];
let doctorBeatTime = 0;

const LIVE_ECG_POINTS = 220;   // ekranda görünen nokta sayısı
const LIVE_ECG_DT = 0.04;      // 40 ms -> 25 fps
const LIVE_VITALS_REFRESH_MS = 5000;

const doctorChartState = {
  ekg: {
    points: [],
    windowSize: 60,
    sliderId: "doctorEkgRange",
    infoId: "doctorEkgRangeInfo",
    filterDays: 1,
    visibleSlice: []
  },
  hr: {
    points: [],
    windowSize: 60,
    sliderId: "doctorHrRange",
    infoId: "doctorHrRangeInfo",
    filterDays: 1,
    visibleSlice: []
  },
  temp: {
    points: [],
    windowSize: 60,
    sliderId: "doctorTempRange",
    infoId: "doctorTempRangeInfo",
    filterDays: 1,
    visibleSlice: []
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
    stopDoctorLiveEcg();

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

  await loadLatestCommentSafe();
  await loadPatientOverview();
  goHome();
};

function hideAllPages() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
}

window.showSection = async function (id) {
  if (!selectedPatient) {
    alert("Önce hasta seçmelisin.");
    return;
  }

  if (id !== "ekg") {
    stopDoctorLiveEcg();
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
  }
  if (id === "hr") {
    await loadDoctorChart("hr");
  }
  if (id === "temp") {
    await loadDoctorChart("temp");
  }
};

window.goHome = function () {
  hideAllPages();
  const home = $("home");
  if (home) home.classList.add("active");

  const back = $("backBtn");
  if (back) back.classList.add("hidden");

  stopDoctorLiveEcg();

  if (doctorChart) {
    doctorChart.destroy();
    doctorChart = null;
  }
  doctorActiveChartKey = null;
};

window.logout = function (silent = false) {
  stopDoctorLiveEcg();
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

/* ================= CHART ================= */
function getDoctorAxisLimits(chartKey) {
  if (chartKey === "temp") return { min: 35.5, max: 38.5, step: 0.5 };
  if (chartKey === "hr") return { min: 40, max: 140, step: 10 };
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
  if (chartKey === "ekg") return "EKG";
  if (chartKey === "hr") return "BPM";
  return "°C";
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
        borderWidth: 4,
        tension: chartKey === "ekg" ? 0.15 : 0.28,
        pointRadius: 3,
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
              const current = doctorChartState[doctorActiveChartKey]?.visibleSlice?.[i];
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

function buildDoctorLiveEcgChart() {
  const canvas = $("doctorEkgChart");
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  doctorActiveChartKey = "ekg";

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: new Array(LIVE_ECG_POINTS).fill(""),
      datasets: [{
        label: "Canlı EKG",
        data: new Array(LIVE_ECG_POINTS).fill(0),
        borderColor: "#38bdf8",
        backgroundColor: "#38bdf8",
        borderWidth: 3,
        tension: 0.08,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "nearest",
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
            title() {
              return "Gerçeğe benzer canlı EKG simülasyonu";
            }
          }
        }
      },
      scales: {
        x: {
          display: false,
          grid: {
            color: "rgba(255,255,255,.04)"
          }
        },
        y: {
          min: -0.5,
          max: 1.3,
          ticks: {
            stepSize: 0.2,
            color: "#aab1c7"
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          },
          title: {
            display: true,
            text: "mV",
            color: "#aab1c7"
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
      renderDoctorWindow(key, Number(slider.value));
    });
  });
}

function renderDoctorWindow(chartKey, startIndex = 0) {
  const state = doctorChartState[chartKey];
  if (!state) return;

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
    if (!slice.length) info.textContent = "Veri yok";
    else info.textContent = `${startIndex + 1}-${endIndex} / ${state.points.length}`;
  }
}

function updateDoctorSlider(chartKey) {
  const state = doctorChartState[chartKey];
  const slider = $(state.sliderId);
  if (!slider) return;

  const maxStart = Math.max(0, state.points.length - state.windowSize);
  slider.max = maxStart;
  if (Number(slider.value) > maxStart) slider.value = maxStart;
}

window.doctorGoLiveWindow = function (chartKey) {
  if (chartKey === "ekg") {
    const info = $("doctorEkgRangeInfo");
    if (info) info.textContent = "Canlı simülasyon aktif";
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

  if (chartKey === "ekg") {
    await startDoctorLiveEcg();
    return;
  }

  await loadDoctorChart(chartKey);
};

async function loadDoctorChart(chartKey) {
  if (!selectedPatient) return;

  if (chartKey === "ekg") {
    await startDoctorLiveEcg();
    return;
  }

  stopDoctorLiveEcg();

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
    if (slider) slider.value = maxStart;

    renderDoctorWindow(chartKey, maxStart);

  } catch (e) {
    console.error("loadDoctorChart err:", e);
  }
}

/* ===============================
   GERÇEĞE BENZER CANLI EKG ÜRETİMİ
   =============================== */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function ecgGaussian(x, mu, sigma, amp) {
  return amp * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
}

function nextSyntheticEcgSample() {
  const hr = clamp(Number(doctorLiveHr) || 75, 45, 160);
  const beatDuration = 60 / hr; // sn
  const x = doctorBeatTime / beatDuration; // 0..1 arası

  let y = 0;

  // P-QRS-T dalga modeli
  y += ecgGaussian(x, 0.18, 0.025, 0.12);   // P
  y += ecgGaussian(x, 0.36, 0.010, -0.16);  // Q
  y += ecgGaussian(x, 0.40, 0.006, 1.05);   // R
  y += ecgGaussian(x, 0.44, 0.012, -0.28);  // S
  y += ecgGaussian(x, 0.68, 0.060, 0.30);   // T

  // hafif baseline wander + noise
  y += 0.015 * Math.sin(2 * Math.PI * x * 1.0);
  y += (Math.random() - 0.5) * 0.02;

  doctorBeatTime += LIVE_ECG_DT;
  if (doctorBeatTime >= beatDuration) {
    doctorBeatTime -= beatDuration;
  }

  return Number(y.toFixed(3));
}

function seedDoctorLiveEcgSeries() {
  doctorLiveSeries = [];
  doctorBeatTime = 0;

  for (let i = 0; i < LIVE_ECG_POINTS; i++) {
    doctorLiveSeries.push(nextSyntheticEcgSample());
  }
}

function updateDoctorLiveEcgFrame() {
  if (!doctorChart || doctorActiveChartKey !== "ekg") return;

  const sample = nextSyntheticEcgSample();

  doctorLiveSeries.push(sample);
  if (doctorLiveSeries.length > LIVE_ECG_POINTS) {
    doctorLiveSeries.shift();
  }

  doctorChart.data.labels = new Array(doctorLiveSeries.length).fill("");
  doctorChart.data.datasets[0].data = doctorLiveSeries;
  doctorChart.update("none");
}

async function fetchDoctorLiveVitals() {
  if (!selectedPatient) return;

  try {
    const res = await fetch(`${API_URL}/measurements/patient/${selectedPatient.id}/latest`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) return;

    const data = await res.json();

    doctorLiveHr = Number(data.heart_rate) || doctorLiveHr;
    doctorLiveTemp = Number(data.temperature) || 0;

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

function stopDoctorLiveEcg() {
  if (doctorLiveEcgTimer) {
    clearInterval(doctorLiveEcgTimer);
    doctorLiveEcgTimer = null;
  }

  if (doctorLiveVitalsTimer) {
    clearInterval(doctorLiveVitalsTimer);
    doctorLiveVitalsTimer = null;
  }

  const slider = $("doctorEkgRange");
  if (slider) slider.disabled = false;
}

async function startDoctorLiveEcg() {
  stopDoctorLiveEcg();

  const slider = $("doctorEkgRange");
  const info = $("doctorEkgRangeInfo");

  if (slider) {
    slider.disabled = true;
    slider.min = 0;
    slider.max = 0;
    slider.value = 0;
  }
  if (info) {
    info.textContent = "Canlı simülasyon aktif";
  }

  if (doctorChart) {
    doctorChart.destroy();
    doctorChart = null;
  }

  doctorChart = buildDoctorLiveEcgChart();
  if (!doctorChart) return;

  await fetchDoctorLiveVitals();
  seedDoctorLiveEcgSeries();

  doctorChart.data.labels = new Array(doctorLiveSeries.length).fill("");
  doctorChart.data.datasets[0].data = doctorLiveSeries;
  doctorChart.update("none");

  doctorLiveEcgTimer = setInterval(updateDoctorLiveEcgFrame, LIVE_ECG_DT * 1000);
  doctorLiveVitalsTimer = setInterval(fetchDoctorLiveVitals, LIVE_VITALS_REFRESH_MS);
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
  if (!box || !time) return;

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

    box.textContent = data.comment.comment.comment ?? "Henüz yorum yok.";
    time.textContent = `Tarih: ${formatDT(data.comment.comment.created_at)} | Doktor ID: ${data.comment.comment.doctor_id}`;

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

    await loadLatestCommentSafe();
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