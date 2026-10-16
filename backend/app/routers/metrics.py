from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Claim, ReviewSession, User

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


def _summary(rows: list[ReviewSession]) -> dict:
    if not rows:
        return {"count": 0, "avg_duration_sec": None, "detection_rate": None, "avg_false_positives": None, "has_sample": False}
    planted = sum(r.planted_errors for r in rows)
    found = sum(r.found_errors for r in rows)
    return {
        "count": len(rows),
        "avg_duration_sec": round(sum(r.duration_sec for r in rows) / len(rows)),
        "detection_rate": round(found / planted, 3) if planted else None,
        "avg_false_positives": round(sum(r.false_positives for r in rows) / len(rows), 2),
        "has_sample": any(r.is_sample for r in rows),
    }


def _session_out(r: ReviewSession) -> dict:
    return {
        "id": r.id,
        "review_id": r.review_id,
        "session_kind": r.session_kind,
        "reviewer": r.reviewer,
        "duration_sec": r.duration_sec,
        "planted_errors": r.planted_errors,
        "found_errors": r.found_errors,
        "false_positives": r.false_positives,
        "is_sample": bool(r.is_sample),
        "note": r.note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def get_metrics(_: User = Depends(current_user), db: Session = Depends(get_db)):
    sessions = db.scalars(select(ReviewSession).order_by(ReviewSession.id.desc())).all()
    verdicts = dict(db.execute(select(Claim.verdict, func.count(Claim.id)).group_by(Claim.verdict)).all())
    return {
        "manual": _summary([s for s in sessions if s.session_kind == "MANUAL"]),
        "assisted": _summary([s for s in sessions if s.session_kind == "ASSISTED"]),
        "verdicts": verdicts,
        "sessions": [_session_out(s) for s in sessions[:30]],
    }


class ManualSessionIn(BaseModel):
    reviewer: str = Field(min_length=1, max_length=100)
    duration_sec: int = Field(ge=1, le=36_000)
    planted_errors: int = Field(ge=0, le=100)
    found_errors: int = Field(ge=0, le=100)
    false_positives: int = Field(default=0, ge=0, le=100)
    note: str | None = Field(default=None, max_length=500)


@router.post("/sessions", status_code=201)
def add_manual_session(body: ManualSessionIn, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """사전 실험에서 '도구 없이' 검수한 기록을 넣는다."""
    s = ReviewSession(session_kind="MANUAL", **body.model_dump())
    db.add(s)
    db.commit()
    return _session_out(s)


@router.delete("/samples")
def clear_sample_sessions(_: User = Depends(current_user), db: Session = Depends(get_db)):
    """실측치를 넣은 뒤 예시 값을 지운다."""
    res = db.execute(delete(ReviewSession).where(ReviewSession.is_sample == 1))
    db.commit()
    return {"deleted": res.rowcount}
