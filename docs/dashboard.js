/************** GLOBAL **************/
const API_URL = "http://127.0.0.1:8000";
const TOKEN = localStorage.getItem("token");

if (!TOKEN) {
  alert("Token yok. Giriş yap.");
  window.location.href = "index.html";
}

/************** LIVE TIMER **************/
let liveTimer = null;

/************** EKG GENERATOR **************/
let ecgPhase = 0;

function generateEcgSample() {
  ecgPhase += 0.18;

  // temel ritim
  let base = Math.sin(ecgPhase) * 0.03;

  // QRS spike
  let spike = 0;
  if (Math.random() < 0.06) {
    spike = Math.random() * 0.7 + 0.5;
  }

  // gürültü
  let noise = (Math.random() - 0.5) * 0.01;

  return 1 + base + spike + noise;
}

/************** CHART SETUP **************/
const ecgCtx = document.getElementById("ecgChart").getContext("2d");
const tempCtx = document.getElementById("tempChart").getContext("2d");
const hrCtx = document.getElementById("hrChart").getContext("2d");

const commonOptions = {
  responsive: true,
  animation: false,
  scales: {
    x: { display: false },
    y: { beginAtZero: false }
  }
};

const ecgChart = new Chart(ecgCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "EKG",
      data: [],
      borderColor: "#3b82f6",
      tension: 0.25,
      pointRadius: 0
    }]
  },
  options: commonOptions
});

const tempChart = new Chart(tempCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "°C",
      data: [],
      borderColor: "#f59e0b",
      tension: 0.3,
      pointRadius: 0
    }]
  },
  options: commonOptions
});

const hrChart = new Chart(hrCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "BPM",
      data: [],
      borderColor: "#ef4444",
      tension: 0.3,
      pointRadius: 0
    }]
  },
  options: commonOptions
});

/************** HELPERS **************/
function addPoint(chart, value) {
  chart.data.labels.push("");
  chart.data.datasets[0].data.push(value);

  if (chart.data.labels.length > 120) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

function clearCharts() {
  [ecgChart, tempChart, hrChart].forEach(c => {
    c.data.labels = [];
    c.data.datasets[0].data = [];
    c.update();
  });
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "index.html";
}

/************** API **************/
async function getLatest() {
  const res = await fetch(`${API_URL}/measurements/latest`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });

  if (res.status === 401) {
    alert("Yetki yok. Tekrar giriş yap.");
    logout();
    return;
  }

  const data = await res.json();

  // kartlar
  document.getElementById("lastEcg").textContent =
    generateEcgSample().toFixed(3);
  document.getElementById("lastTemp").textContent =
    data.temperature.toFixed(2) + " °C";
  document.getElementById("lastHr").textContent =
    data.heart_rate + " BPM";

  // grafik
  addPoint(ecgChart, generateEcgSample());
  addPoint(tempChart, data.temperature);
  addPoint(hrChart, data.heart_rate);
}

/************** LIVE **************/
function startLive() {
  if (liveTimer) return;

  liveTimer = setInterval(async () => {
    // backend sadece nabız & sıcaklık üretsin
    await fetch(`${API_URL}/measurements/fake?seconds=1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    await getLatest();
  }, 1000);
}

function stopLive() {
  clearInterval(liveTimer);
  liveTimer = null;
}
function showSection(id){
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");

  document.getElementById("backBtn").hidden = false;
}

function goHome(){
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  document.getElementById("home").classList.remove("hidden");

  document.getElementById("backBtn").hidden = true;
}
