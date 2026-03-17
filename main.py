from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
import models
from routers import users, measurements, comments

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev için
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(measurements.router)
app.include_router(comments.router)


@app.get("/")
def root():
    return {"mesaj": "EKG Web Sistemi Çalışıyor 🚀"}
