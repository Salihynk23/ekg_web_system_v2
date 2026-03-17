from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

import models
from database import SessionLocal
from auth import get_current_user, require_role
from pydantic import BaseModel


router = APIRouter(prefix="/comments", tags=["Comments"])


# ======================
# DB
# ======================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ======================
# SCHEMAS (lokal)
# ======================
class CommentCreate(BaseModel):
    comment: str


class CommentOut(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    comment: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LatestCommentResponse(BaseModel):
    comment: Optional[CommentOut] = None


# ======================
# DOCTOR -> CREATE COMMENT (yeni kayıt, overwrite yok)
# ======================
@router.post("/patient/{patient_id}", response_model=CommentOut)
def create_comment_for_patient(
    patient_id: int,
    payload: CommentCreate,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    # hasta var mı?
    patient = db.query(models.User).filter(models.User.id == patient_id).first()
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")

    text = payload.comment.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Yorum boş olamaz")

    c = models.DoctorComment(
        patient_id=patient_id,
        doctor_id=doctor.id,
        comment=text
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ======================
# DOCTOR -> LATEST COMMENT FOR PATIENT
# ======================
@router.get("/patient/{patient_id}/latest", response_model=LatestCommentResponse)
def doctor_get_latest_for_patient(
    patient_id: int,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    c = (
        db.query(models.DoctorComment)
        .filter(models.DoctorComment.patient_id == patient_id)
        .order_by(models.DoctorComment.created_at.desc(), models.DoctorComment.id.desc())
        .first()
    )
    return {"comment": c}


# ======================
# DOCTOR -> HISTORY (all comments for patient)
# ======================
@router.get("/patient/{patient_id}", response_model=List[CommentOut])
def doctor_get_history_for_patient(
    patient_id: int,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.DoctorComment)
        .filter(models.DoctorComment.patient_id == patient_id)
        .order_by(models.DoctorComment.created_at.desc(), models.DoctorComment.id.desc())
        .all()
    )
    return rows


# ======================
# DOCTOR -> DELETE COMMENT (sadece doktor silebilir; ister kendi yorumunu şart koş)
# ======================
@router.delete("/{comment_id}")
def doctor_delete_comment(
    comment_id: int,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    row = db.query(models.DoctorComment).filter(models.DoctorComment.id == comment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı")

    # İstersen sadece kendi yazdığını silebilsin:
    # if row.doctor_id != doctor.id:
    #     raise HTTPException(status_code=403, detail="Sadece kendi yorumunu silebilirsin")

    db.delete(row)
    db.commit()
    return {"message": "Yorum silindi"}


# ======================
# PATIENT -> LATEST (kendi yorumunu görür)
# ======================
@router.get("/me/latest", response_model=LatestCommentResponse)
def patient_get_latest_for_me(
    me: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if me.role != "patient":
        raise HTTPException(status_code=403, detail="Bu endpoint sadece hasta içindir")

    c = (
        db.query(models.DoctorComment)
        .filter(models.DoctorComment.patient_id == me.id)
        .order_by(models.DoctorComment.created_at.desc(), models.DoctorComment.id.desc())
        .first()
    )
    return {"comment": c}


# ======================
# PATIENT -> HISTORY (kendi tüm yorumları)
# ======================
@router.get("/me", response_model=List[CommentOut])
def patient_get_history_for_me(
    me: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if me.role != "patient":
        raise HTTPException(status_code=403, detail="Bu endpoint sadece hasta içindir")

    rows = (
        db.query(models.DoctorComment)
        .filter(models.DoctorComment.patient_id == me.id)
        .order_by(models.DoctorComment.created_at.desc(), models.DoctorComment.id.desc())
        .all()
    )
    return rows
