const API_URL = "https://ekg-web-system-api.onrender.com";
const TOKEN = localStorage.getItem("token");

if (!TOKEN) {
  alert("Giriş yapmalısın");
  window.location.href = "../index.html";
}

let me = null;
let timer = null;
let chart = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadMeAndCheckRole();
  goHome();
});

function formatDT(dtStr){
  if(!dtStr) return "-";
  const d = new Date(dtStr);
  if(isNaN(d.getTime())) return dtStr;
  return d.toLocaleString("tr-TR");
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
  if (id === "hr") startLiveLatest("heart_rate", "BPM", "hrChart", 1000);
  if (id === "temp") startLiveLatest("temperature", "°C", "tempChart", 1000);
  if (id === "doctor") loadDoctorComment();
};

/* ================= LIVE CHART ================= */
function stopLive() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function buildChart(canvasId, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderWidth: 3,
        tension: 0.25,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      animation: false,
      scales: { x: { display: false } }
    }
  });
}

function pushPoint(v) {
  if (!chart) return;
  chart.data.labels.push("");
  chart.data.datasets[0].data.push(v);

  if (chart.data.labels.length > 120) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

async function startLiveLatest(field, label, canvasId, intervalMs) {
  chart = buildChart(canvasId, label);
  if (!chart) return;

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
      pushPoint(latest[field]);

    } catch (e) {
      console.log("live latest err", e);
    }
  }, intervalMs);
}

async function startLiveECG() {
  chart = buildChart("ekgChart", "EKG");
  if (!chart) return;

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
        const v = series[0].value ?? series[0].ecg ?? null;
        if (v !== null) pushPoint(v);
      }
    } catch (e) {
      console.log("live ecg err", e);
    }
  }, 250);
}

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

window.toggleMyHistory = async function(){
  const wrap = document.getElementById("myHistoryWrap");
  wrap.classList.toggle("hidden");
  if(!wrap.classList.contains("hidden")){
    await loadMyHistory();
  }
};

async function loadMyHistory(){
  const list = document.getElementById("myHistoryList");
  list.innerHTML = "Yükleniyor...";

  try{
    const res = await fetch(`${API_URL}/comments/me`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if(!res.ok){
      list.innerHTML = "Geçmiş alınamadı.";
      return;
    }

    const rows = await res.json();
    if(!rows.length){
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

  }catch(e){
    console.error(e);
    list.innerHTML = "Geçmiş alınamadı.";
  }
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ================= LOGOUT ================= */
window.logout = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "../index.html";
};
