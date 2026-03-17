from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import json

import models, schemas
from database import SessionLocal
from auth import get_current_user

router = APIRouter(
    prefix="/ecg",
    tags=["ECG"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ✅ EKG KAYDET
@router.post("/", response_model=schemas.ECGOut)
def create_ecg(
    ecg: schemas.ECGCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    new_ecg = models.ECG(
        user_id=current_user.id,
        ecg_values=json.dumps(ecg.ecg_values)
    )

    db.add(new_ecg)
    db.commit()
    db.refresh(new_ecg)

    return {
        "id": new_ecg.id,
        "timestamp": new_ecg.timestamp,
        "ecg_values": ecg.ecg_values
    }


# ✅ SADECE KENDİ EKG'LERİNİ GÖR
@router.get("/my", response_model=list[schemas.ECGOut])
def get_my_ecg(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    records = db.query(models.ECG).filter(
        models.ECG.user_id == current_user.id
    ).all()

    return [
        {
            "id": r.id,
            "timestamp": r.timestamp,
            "ecg_values": json.loads(r.ecg_values)
        }
        for r in records
    ]
