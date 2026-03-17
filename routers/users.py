from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm

import models, schemas
from database import SessionLocal
from auth import create_access_token, get_current_user, require_role

router = APIRouter(prefix="/users", tags=["Users"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=schemas.UserOut)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Kullanıcı adı zaten var")

    new_user = models.User(
        username=user.username,
        password=user.password,
        role=user.role,
        full_name=getattr(user, "full_name", None),
        age=getattr(user, "age", None),
        height_cm=getattr(user, "height_cm", None),
        weight_kg=getattr(user, "weight_kg", None),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()

    if not user:
        raise HTTPException(status_code=400, detail="Kullanıcı bulunamadı")

    if user.password != form_data.password:
        raise HTTPException(status_code=400, detail="Şifre yanlış")

    access_token = create_access_token({"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": user.id,
        "username": user.username
    }


@router.get("/me")
def read_current_user(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "full_name": getattr(current_user, "full_name", None),
        "age": getattr(current_user, "age", None),
        "height_cm": getattr(current_user, "height_cm", None),
        "weight_kg": getattr(current_user, "weight_kg", None),
    }


@router.get("/patients", response_model=list[schemas.UserOut])
def list_patients(
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    return db.query(models.User).filter(models.User.role == "patient").all()


@router.get("/doctors", response_model=list[schemas.UserOut])
def list_doctors(
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    return db.query(models.User).filter(models.User.role == "doctor").all()


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    doctor: models.User = Depends(require_role("doctor")),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    if user.id == doctor.id:
        raise HTTPException(status_code=400, detail="Kendi hesabını silemezsin")

    db.delete(user)
    db.commit()

    return {"message": f"{user.username} silindi", "deleted_role": user.role}
