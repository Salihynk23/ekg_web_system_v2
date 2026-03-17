const API_URL = "http://127.0.0.1:8000";
const TOKEN = localStorage.getItem("token");

if (!TOKEN) {
  alert("Giriş yapmalısın");
  window.location.href = "../index.html";
}

let currentDoctor = null;
let selectedPatient = null;

document.addEventListener("DOMContentLoaded", async () => {
  goHome();
  await loadMeDoctor();
  await loadPatients();
});

function $(id) {
  return document.getElementById(id);
}

function formatDT(dtStr){
  if(!dtStr) return "-";
  const d = new Date(dtStr);
  if(isNaN(d.getTime())) return dtStr;
  return d.toLocaleString("tr-TR");
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

  // geçmişi kapat/temizle
  const hw = $("historyWrap");
  const hl = $("historyList");
  if (hw) hw.classList.add("hidden");
  if (hl) hl.innerHTML = "";

  if (!val) {
    selectedPatient = null;
    if (menu) menu.classList.add("hidden");
    if (detailCard) detailCard.classList.add("hidden");
    if (info) info.textContent = "Henüz hasta seçilmedi.";

    const spl = $("selectedPatientLabel");
    if (spl) spl.textContent = "-";

    const dt = $("doctorText");
    if (dt) dt.value = "";

    const lb = $("latestCommentBox");
    const lt = $("latestCommentTime");
    if (lb) lb.textContent = "-";
    if (lt) lt.textContent = "";

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
  if (pu) pu.textContent = `${selectedPatient.username} (id:${selectedPatient.id})`;
  if (pi) pi.textContent = selectedPatient.id;
  if (pr) pr.textContent = selectedPatient.role;

  if (menu) menu.classList.remove("hidden");

  const spl = $("selectedPatientLabel");
  if (spl) spl.textContent = `${selectedPatient.username} (id:${selectedPatient.id})`;

  const dt = $("doctorText");
  if (dt) dt.value = "";

  await loadLatestCommentSafe();
  goHome();
};

function hideAllPages() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
}

window.showSection = function (id) {
  if (!selectedPatient) {
    alert("Önce hasta seçmelisin.");
    return;
  }
  hideAllPages();
  const sec = $(id);
  if (sec) sec.classList.add("active");
  const back = $("backBtn");
  if (back) back.classList.remove("hidden");
};

window.goHome = function () {
  hideAllPages();
  const home = $("home");
  if (home) home.classList.add("active");
  const back = $("backBtn");
  if (back) back.classList.add("hidden");
};

window.logout = function (silent=false) {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  if (!silent) alert("Çıkış yapıldı");
  window.location.href = "../index.html";
};

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

    // latest + history yenile
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

async function loadLatestCommentSafe(){
  // Bu kartlar yoksa hata vermesin
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

    box.textContent = data.comment.comment ?? "Henüz yorum yok.";
    time.textContent = `Tarih: ${formatDT(data.comment.created_at)} | Doktor ID: ${data.comment.doctor_id}`;

  } catch (e) {
    console.error("latest err:", e);
    box.textContent = "Yorum alınamadı (backend açık mı?)";
    time.textContent = "";
  }
}

window.toggleHistory = async function(){
  if(!selectedPatient){
    alert("Önce hasta seçmelisin.");
    return;
  }
  const wrap = $("historyWrap");
  if (!wrap) return;

  wrap.classList.toggle("hidden");
  if(!wrap.classList.contains("hidden")){
    await loadHistory();
  }
};

async function loadHistory(){
  const list = $("historyList");
  if (!list) return;

  list.innerHTML = "Yükleniyor...";

  try{
    const res = await fetch(`${API_URL}/comments/patient/${selectedPatient.id}`, {
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

  }catch(e){
    console.error("history err:", e);
    list.innerHTML = "Geçmiş alınamadı.";
  }
}

window.deleteComment = async function(commentId){
  if(!confirm("Bu yorumu silmek istiyor musun?")) return;

  try{
    const res = await fetch(`${API_URL}/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if(!res.ok){
      alert("Silinemedi");
      return;
    }

    await loadLatestCommentSafe();
    await loadHistory();
  }catch(e){
    console.error("delete err:", e);
    alert("Sunucuya bağlanılamadı");
  }
};

// basit html escape
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
