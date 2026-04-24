from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ======================
# USERS
# ======================
class UserCreate(BaseModel):
    username: str
    password: str
    role: str  # "doctor" | "patient"

    full_name: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[int] = None
    weight_kg: Optional[int] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str

    full_name: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[int] = None
    weight_kg: Optional[int] = None

    class Config:
        from_attributes = True


class UserMe(UserOut):
    pass


# ======================
# MEASUREMENTS
# ======================
class MeasurementOut(BaseModel):
    id: int
    user_id: int
    kind: str
    value: float
    created_at: datetime

    class Config:
        from_attributes = True


class LatestOut(BaseModel):
    temperature: float
    heart_rate: int
    ecg_value: float


# ======================
# ECG
# ======================
class ECGCreate(BaseModel):
    ecg_values: list[float]


class ECGOut(BaseModel):
    id: int
    user_id: int
    timestamp: datetime
    ecg_values: list[float]

    class Config:
        from_attributes = True


# ======================
# COMMENTS
# ======================
class CommentCreate(BaseModel):
    comment: str


class CommentOut(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    comment: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LatestCommentOut(BaseModel):
    comment: Optional[CommentOut] = None
    # ======================
# MATLAB INGEST
# ======================
class MatlabIngestIn(BaseModel):
    patient_id: int
    ecg_value: float
    heart_rate: float
    temperature: float

    ai_class: str
    ai_comment: Optional[str] = None

    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    diagnosis: Optional[str] = None
    model_name: Optional[str] = None


class MatlabIngestOut(BaseModel):
    ok: bool
    message: str