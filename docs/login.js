const API_URL = "http://127.0.0.1:8000";
let selectedRole = null;

window.selectRole = function(role, el){
  selectedRole = role;

  document.getElementById("loginForm").classList.remove("hidden");
  document.getElementById("registerForm").classList.add("hidden");

  document.getElementById("formTitle").innerText =
    role === "doctor" ? "👨‍⚕️ Doktor Girişi" : "🧍 Hasta Girişi";

  document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
};

window.showRegister = function(){
  // register sadece patient için
  if (selectedRole !== "patient") {
    alert("Üye olma sadece Hasta içindir. Önce Hasta seç.");
    return;
  }
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("registerForm").classList.remove("hidden");
};

window.backToLogin = function(){
  document.getElementById("registerForm").classList.add("hidden");
  document.getElementById("loginForm").classList.remove("hidden");
};

window.register = async function(){
  const full_name = document.getElementById("r_fullname").value.trim();
  const age = Number(document.getElementById("r_age").value);
  const height_cm = Number(document.getElementById("r_height").value);
  const weight_kg = Number(document.getElementById("r_weight").value);
  const username = document.getElementById("r_username").value.trim();
  const password = document.getElementById("r_password").value.trim();

  if(!full_name || !age || !height_cm || !weight_kg || !username || !password){
    alert("Tüm alanları doldur");
    return;
  }

  const res = await fetch(`${API_URL}/users/`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      username,
      password,
      role: "patient",
      full_name,
      age,
      height_cm,
      weight_kg
    })
  });

  if(!res.ok){
    const t = await res.text();
    alert("Kayıt başarısız: " + t);
    return;
  }

  alert("Kayıt başarılı! Şimdi giriş yapabilirsin.");
  backToLogin();
};

window.login = async function(){
  if(!selectedRole){
    alert("Önce Doktor veya Hasta seçmelisin.");
    return;
  }

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  if(!username || !password){
    alert("Kullanıcı adı ve şifre gir.");
    return;
  }

  const res = await fetch(`${API_URL}/users/login`, {
    method: "POST",
    headers: {"Content-Type":"application/x-www-form-urlencoded"},
    body: new URLSearchParams({username, password})
  });

  if(!res.ok){
    const t = await res.text();
    alert("Giriş başarısız: " + t);
    return;
  }

  const data = await res.json();
  localStorage.setItem("token", data.access_token);

  // ✅ rolü backend’den doğrula (hasta doktoru seçip girmesin)
  const meRes = await fetch(`${API_URL}/users/me`, {
    headers: {Authorization: `Bearer ${data.access_token}`}
  });

  if(!meRes.ok){
    alert("Oturum doğrulanamadı");
    localStorage.removeItem("token");
    return;
  }

  const me = await meRes.json();
  if(me.role !== selectedRole){
    alert(`Yanlış giriş türü! Bu kullanıcı '${me.role}' rolünde.`);
    localStorage.removeItem("token");
    return;
  }

  // yönlendir
  if(selectedRole === "doctor"){
    window.location.href = "doctor/dashboard_doctor.html";
  } else {
    window.location.href = "patient/dashboard_patient.html";
  }
};
