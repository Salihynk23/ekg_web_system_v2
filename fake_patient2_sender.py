import random
import time
import requests

API_URL = "https://ekg-web-system-api.onrender.com/matlab/ingest"
PATIENT_ID = 3

classes = [
    ("0-Normal", "low", 0.10, "Normal ritim"),
    ("2-V (VEB/PVC)", "high", 0.85, "Ventrikuler anomali / PVC suphe"),
    ("4-Q (Signal quality low)", "medium", 0.30, "Sinyal kalitesi dusuk"),
]

def random_payload():
    ai_class, risk_level, risk_score, diagnosis = random.choices(
        classes,
        weights=[70, 20, 10],
        k=1
    )[0]

    bpm = random.randint(65, 110)
    ecg_value = round(random.uniform(0.8, 1.8), 3)

    comment_map = {
        "0-Normal": "Mevcut kayit normal ritim ozellikleri gostermektedir.",
        "2-V (VEB/PVC)": "Ventrikuler kaynakli erken atim ile uyumlu bir patern saptandi.",
        "4-Q (Signal quality low)": "Sinyal kalitesi dusuk oldugu icin guvenilir siniflandirma yapilamadi."
    }

    return {
        "patient_id": PATIENT_ID,
        "ecg_value": ecg_value,
        "heart_rate": bpm,
        "temperature": 0,
        "ai_class": ai_class,
        "ai_comment": comment_map[ai_class],
        "risk_level": risk_level,
        "risk_score": risk_score,
        "diagnosis": diagnosis,
        "model_name": "simulator_v1"
    }

while True:
    payload = random_payload()
    try:
        r = requests.post(API_URL, json=payload, timeout=20)
        print("STATUS:", r.status_code, "RESPONSE:", r.text)
    except Exception as e:
        print("HATA:", e)

    time.sleep(5)