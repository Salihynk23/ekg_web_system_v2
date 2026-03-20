from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, SessionLocal
import models
from routers import users, measurements, comments, ecg
from auth import hash_password

models.Base.metadata.create_all(bind=engine)


def seed_demo_users():
    db = SessionLocal()
    try:
        hasta = db.query(models.User).filter(models.User.username == "hasta1").first()
        if not hasta:
            hasta = models.User(
                username="hasta1",
                password=hash_password("1234"),
                role="patient",
                full_name="Demo Hasta",
                age=25,
                height_cm=175,
                weight_kg=70,
            )
            db.add(hasta)

        doktor = db.query(models.User).filter(models.User.username == "doktor1").first()
        if not doktor:
            doktor = models.User(
                username="doktor1",
                password=hash_password("1234"),
                role="doctor",
                full_name="Demo Doktor",
                age=40,
                height_cm=180,
                weight_kg=80,
            )
            db.add(doktor)

        db.commit()
    finally:
        db.close()


seed_demo_users()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(measurements.router)
app.include_router(comments.router)
app.include_router(ecg.router)


@app.get("/")
def root():
    return {"mesaj": "EKG Web Sistemi Çalışıyor 🚀"}