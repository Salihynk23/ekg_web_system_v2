from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
import math

import models, schemas
from database import SessionLocal
from auth import get_current_user, require_role

router = APIRouter(prefix="/measurements", tags=["Measurements"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ======================
# SAHTE EKG ÜRETİCİ
# ======================
_ecg_phase = 0.0

def ecg_sample():
    global _ecg_phase
    _ecg_phase += 0.18
    base = math.sin(_ecg_phase) * 0.03
    spike = (random.random() * 0.7 + 0.5) if random.random() < 0.06 else 0.0
    noise = (random.random() - 0.5) * 0.01
    return 1.0 + base + spike + noise


# ======================
# ORTAK DAYS DOĞRULAMA
# ======================
def validate_days(days: int | None):
    if days is None:
        return None
    if days not in [1, 7, 30]:
        raise HTTPException(
            status_code=400,
            detail="days sadece 1, 7 veya 30 olabilir"
        )
    return datetime.utcnow() - timedelta(days=days)


# ======================
# HASTA / KULLANICI İÇİN SAHTE VERİ ÜRET
# ======================
@router.post("/fake")
def generate_fake(
    seconds: int = 1,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    for _ in range(seconds):
        hr = random.randint(60, 95)
        temp = round(random.uniform(36.1, 37.6), 2)
        ecg = round(ecg_sample(), 3)

        db.add(models.Measurement(
            user_id=user.id,
            kind="heart_rate",
            value=float(hr),
            created_at=datetime.utcnow()
        ))

        db.add(models.Measurement(
            user_id=user.id,
            kind="temperature",
            value=float(temp),
            created_at=datetime.utcnow()
        ))

        db.add(models.Measurement(
            user_id=user.id,
            kind="ecg",
            value=float(ecg),
            created_at=datetime.utcnow()
        ))

    db.commit()
    return {"ok": True, "seconds": seconds}


# ======================
# KULLANICININ EN SON ÖLÇÜMÜ
# ======================
@router.get("/latest", response_model=schemas.LatestOut)
def latest(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    def last(kind: str):
        m = (
            db.query(models.Measurement)
            .filter(
                models.Measurement.user_id == user.id,
                models.Measurement.kind == kind
            )
            .order_by(models.Measurement.created_at.desc())
            .first()
        )
        return m.value if m else None

    t = last("temperature")
    hr = last("heart_rate")
    ecg = last("ecg")

    if t is None or hr is None or ecg is None:
        raise HTTPException(status_code=404, detail="Ölçüm bulunamadı")

    return {
        "temperature": float(t),
        "heart_rate": int(hr),
        "ecg_value": float(ecg)
    }


# ======================
# DOKTORUN SEÇTİĞİ HASTANIN EN SON ÖLÇÜMÜ
# ======================
@router.get("/patient/{patient_id}/latest", response_model=schemas.LatestOut)
def latest_for_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    doctor: models.User = Depends(require_role("doctor"))
):
    patient = db.query(models.User).filter(models.User.id == patient_id).first()
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")

    def last(kind: str):
        m = (
            db.query(models.Measurement)
            .filter(
                models.Measurement.user_id == patient_id,
                models.Measurement.kind == kind
            )
            .order_by(models.Measurement.created_at.desc())
            .first()
        )
        return m.value if m else None

    t = last("temperature")
    hr = last("heart_rate")
    ecg = last("ecg")

    if t is None or hr is None or ecg is None:
        raise HTTPException(
            status_code=404,
            detail="Seçilen hasta için ölçüm bulunamadı"
        )

    return {
        "temperature": float(t),
        "heart_rate": int(hr),
        "ecg_value": float(ecg)
    }


# ======================
# KULLANICININ KENDİ SERİSİ
# ÖRNEK:
# /measurements/ecg?limit=500&days=1
# /measurements/heart_rate?limit=500&days=7
# ======================
@router.get("/{kind}", response_model=list[schemas.MeasurementOut])
def series(
    kind: str,
    limit: int = Query(120, ge=1, le=5000),
    days: int | None = Query(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    if kind not in ["ecg", "temperature", "heart-rate", "heart_rate"]:
        raise HTTPException(status_code=400, detail="kind geçersiz")

    kind_db = "heart_rate" if kind in ["heart-rate", "heart_rate"] else kind
    since = validate_days(days)

    q = (
        db.query(models.Measurement)
        .filter(
            models.Measurement.user_id == user.id,
            models.Measurement.kind == kind_db
        )
    )

    if since is not None:
        q = q.filter(models.Measurement.created_at >= since)

    rows = (
        q.order_by(models.Measurement.created_at.desc())
        .limit(limit)
        .all()
    )

    return list(reversed(rows))


# ======================
# DOKTORUN HASTA SERİSİ
# ÖRNEK:
# /measurements/patient/1/ecg?limit=500&days=1
# /measurements/patient/1/heart_rate?limit=500&days=7
# ======================
@router.get("/patient/{patient_id}/{kind}", response_model=list[schemas.MeasurementOut])
def doctor_patient_series(
    patient_id: int,
    kind: str,
    limit: int = Query(120, ge=1, le=5000),
    days: int | None = Query(None),
    db: Session = Depends(get_db),
    doctor: models.User = Depends(require_role("doctor"))
):
    if kind not in ["ecg", "temperature", "heart-rate", "heart_rate"]:
        raise HTTPException(status_code=400, detail="kind geçersiz")

    patient = db.query(models.User).filter(models.User.id == patient_id).first()
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")

    kind_db = "heart_rate" if kind in ["heart-rate", "heart_rate"] else kind
    since = validate_days(days)

    q = (
        db.query(models.Measurement)
        .filter(
            models.Measurement.user_id == patient_id,
            models.Measurement.kind == kind_db
        )
    )

    if since is not None:
        q = q.filter(models.Measurement.created_at >= since)

    rows = (
        q.order_by(models.Measurement.created_at.desc())
        .limit(limit)
        .all()
    )

    return list(reversed(rows))