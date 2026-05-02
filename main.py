from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, SessionLocal
import models
from routers import users, measurements, comments, ecg, matlab_ingest
from auth import hash_password

models.Base.metadata.create_all(bind=engine)


def seed_demo_users():
    db = SessionLocal()
    try:
        hasta1 = db.query(models.User).filter(models.User.username == "hasta1").first()
        if not hasta1:
            hasta1 = models.User(
                username="hasta1",
                password=hash_password("1234"),
                role="patient",
                full_name="Demo Hasta 1",
                age=25,
                height_cm=175,
                weight_kg=70,
            )
            db.add(hasta1)

        hasta2 = db.query(models.User).filter(models.User.username == "hasta2").first()
        if not hasta2:
            hasta2 = models.User(
                username="hasta2",
                password=hash_password("1234"),
                role="patient",
                full_name="Demo Hasta 2",
                age=32,
                height_cm=168,
                weight_kg=74,
            )
            db.add(hasta2)

        doktor1 = db.query(models.User).filter(models.User.username == "doktor1").first()
        if not doktor1:
            doktor1 = models.User(
                username="doktor1",
                password=hash_password("1234"),
                role="doctor",
                full_name="Demo Doktor",
                age=40,
                height_cm=180,
                weight_kg=80,
            )
            db.add(doktor1)

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
app.include_router(matlab_ingest.router)


@app.get("/")
def root():
    return {"mesaj": "EKG Web Sistemi Çalışıyor 🚀"}