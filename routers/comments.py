from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import SessionLocal
from auth import get_current_user, require_role

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
# DOCTOR -> CREATE COMMENT
# ======================
@router.post("/patient/{patient_id}", response_model=schemas.CommentOut)
def create_comment_for_patient(
    patient_id: int,
    payload: schemas.CommentCreate,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    patient = db.query(models.User).filter(models.User.id == patient_id).first()
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")

    text = payload.comment.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Yorum boş olamaz")

    comment_row = models.DoctorComment(
        patient_id=patient_id,
        doctor_id=doctor.id,
        comment=text
    )

    db.add(comment_row)
    db.commit()
    db.refresh(comment_row)

    return comment_row


# ======================
# DOCTOR -> LATEST COMMENT FOR PATIENT
# ======================
@router.get("/patient/{patient_id}/latest", response_model=schemas.LatestCommentOut)
def doctor_get_latest_for_patient(
    patient_id: int,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    patient = db.query(models.User).filter(models.User.id == patient_id).first()
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")

    comment_row = (
        db.query(models.DoctorComment)
        .filter(models.DoctorComment.patient_id == patient_id)
        .order_by(models.DoctorComment.created_at.desc(), models.DoctorComment.id.desc())
        .first()
    )

    return {"comment": comment_row}


# ======================
# DOCTOR -> HISTORY FOR PATIENT
# ======================
@router.get("/patient/{patient_id}", response_model=List[schemas.CommentOut])
def doctor_get_history_for_patient(
    patient_id: int,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    patient = db.query(models.User).filter(models.User.id == patient_id).first()
    if not patient or patient.role != "patient":
        raise HTTPException(status_code=404, detail="Hasta bulunamadı")

    rows = (
        db.query(models.DoctorComment)
        .filter(models.DoctorComment.patient_id == patient_id)
        .order_by(models.DoctorComment.created_at.desc(), models.DoctorComment.id.desc())
        .all()
    )

    return rows


# ======================
# DOCTOR -> DELETE COMMENT
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

    # Sadece kendi yorumunu silebilsin istersen bunu aç:
    # if row.doctor_id != doctor.id:
    #     raise HTTPException(status_code=403, detail="Sadece kendi yorumunu silebilirsin")

    db.delete(row)
    db.commit()

    return {"message": "Yorum silindi"}


# ======================
# PATIENT -> LATEST COMMENT FOR ME
# ======================
@router.get("/me/latest", response_model=schemas.LatestCommentOut)
def patient_get_latest_for_me(
    me: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if me.role != "patient":
        raise HTTPException(status_code=403, detail="Bu endpoint sadece hasta içindir")

    comment_row = (
        db.query(models.DoctorComment)
        .filter(models.DoctorComment.patient_id == me.id)
        .order_by(models.DoctorComment.created_at.desc(), models.DoctorComment.id.desc())
        .first()
    )

    return {"comment": comment_row}


# ======================
# PATIENT -> HISTORY FOR ME
# ======================
@router.get("/me", response_model=List[schemas.CommentOut])
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