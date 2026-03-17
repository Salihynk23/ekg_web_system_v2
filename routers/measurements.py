from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import random, math

import models, schemas
from database import SessionLocal
from auth import get_current_user

router = APIRouter(prefix="/measurements", tags=["Measurements"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# basit ekg örneği
_ecg_phase = 0.0
def ecg_sample():
    global _ecg_phase
    _ecg_phase += 0.18
    base = math.sin(_ecg_phase) * 0.03
    spike = (random.random() * 0.7 + 0.5) if random.random() < 0.06 else 0.0
    noise = (random.random() - 0.5) * 0.01
    return 1.0 + base + spike + noise

@router.post("/fake")
def generate_fake(seconds: int = 1,
                  db: Session = Depends(get_db),
                  user: models.User = Depends(get_current_user)):
    # her çağrıda 1 saniyelik örnek üretiyoruz (basit)
    for _ in range(seconds):
        hr = random.randint(60, 95)
        temp = round(random.uniform(36.1, 37.6), 2)
        ecg = round(ecg_sample(), 3)

        db.add(models.Measurement(user_id=user.id, kind="heart_rate", value=float(hr), created_at=datetime.utcnow()))
        db.add(models.Measurement(user_id=user.id, kind="temperature", value=float(temp), created_at=datetime.utcnow()))
        db.add(models.Measurement(user_id=user.id, kind="ecg", value=float(ecg), created_at=datetime.utcnow()))
    db.commit()
    return {"ok": True, "seconds": seconds}

@router.get("/latest", response_model=schemas.LatestOut)
def latest(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    def last(kind: str):
        m = (db.query(models.Measurement)
             .filter(models.Measurement.user_id == user.id, models.Measurement.kind == kind)
             .order_by(models.Measurement.created_at.desc())
             .first())
        return m.value if m else None

    t = last("temperature")
    hr = last("heart_rate")
    ecg = last("ecg")

    if t is None or hr is None or ecg is None:
        # veri yoksa boş dönmeyelim, fake üret
        raise HTTPException(status_code=404, detail="Ölçüm bulunamadı. /measurements/fake çağır.")

    return {"temperature": float(t), "heart_rate": int(hr), "ecg_value": float(ecg)}

@router.get("/{kind}", response_model=list[schemas.MeasurementOut])
def series(kind: str, limit: int = 120,
           db: Session = Depends(get_db),
           user: models.User = Depends(get_current_user)):
    if kind not in ["ecg", "temperature", "heart-rate", "heart_rate"]:
        raise HTTPException(status_code=400, detail="kind geçersiz")

    kind_db = "heart_rate" if kind in ["heart-rate", "heart_rate"] else kind

    rows = (db.query(models.Measurement)
            .filter(models.Measurement.user_id == user.id, models.Measurement.kind == kind_db)
            .order_by(models.Measurement.created_at.desc())
            .limit(limit)
            .all())
    return list(reversed(rows))
