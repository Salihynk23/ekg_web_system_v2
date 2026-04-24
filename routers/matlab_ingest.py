from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

import models
import schemas
from database import SessionLocal

router = APIRouter(prefix="/matlab", tags=["MATLAB"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/ingest", response_model=schemas.MatlabIngestOut)
def matlab_ingest(
    payload: schemas.MatlabIngestIn,
    db: Session = Depends(get_db),
):
    patient = db.query(models.User).filter(models.User.id == payload.patient_id).first()
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")

    now = datetime.utcnow()

    # Ölçümleri measurements tablosuna kaydet
    db.add(models.Measurement(
        user_id=payload.patient_id,
        kind="ecg",
        value=float(payload.ecg_value),
        created_at=now
    ))

    db.add(models.Measurement(
        user_id=payload.patient_id,
        kind="heart_rate",
        value=float(payload.heart_rate),
        created_at=now
    ))

    db.add(models.Measurement(
        user_id=payload.patient_id,
        kind="temperature",
        value=float(payload.temperature),
        created_at=now
    ))

    # AI sonucunu analysis_results tablosuna kaydet
    db.add(models.AnalysisResult(
        patient_id=payload.patient_id,
        ai_class=payload.ai_class,
        ai_comment=payload.ai_comment,
        risk_level=payload.risk_level,
        risk_score=payload.risk_score,
        diagnosis=payload.diagnosis,
        model_name=payload.model_name
    ))

    db.commit()

    return {
        "ok": True,
        "message": "MATLAB verisi ve AI sonucu kaydedildi"
    }


@router.get("/analysis/me/latest")
def patient_latest_analysis(
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.AnalysisResult)
        .order_by(models.AnalysisResult.created_at.desc(), models.AnalysisResult.id.desc())
        .first()
    )

    if not row:
        return {"result": None}

    return {"result": row}


@router.get("/analysis/patient/{patient_id}/latest")
def doctor_latest_analysis(
    patient_id: int,
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.AnalysisResult)
        .filter(models.AnalysisResult.patient_id == patient_id)
        .order_by(models.AnalysisResult.created_at.desc(), models.AnalysisResult.id.desc())
        .first()
    )

    if not row:
        return {"result": None}

    return {"result": row}