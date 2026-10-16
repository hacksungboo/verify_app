import json
import re
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import samples
from ..db import SessionLocal, get_db
from ..deps import current_user
from ..models import Claim, Document, Review, ReviewSession, User, utcnow
from ..pipeline.runner import run_review

router = APIRouter(prefix="/api", tags=["reviews"])

DECISIONS = {"PENDING", "ACCEPTED", "EDITED", "IGNORED"}
FLAGGED = {"CONTRADICTED", "UNSUPPORTED", "PARTIAL", "UNVERIFIABLE"}


# ---------- 샘플 ----------
@router.get("/samples")
def list_samples(_: User = Depends(current_user)):
    return [
        {"id": s["id"], "title": s["title"], "description": s["description"], "source_count": len(s["sources"])}
        for s in samples.load_all().values()
    ]


@router.get("/samples/{sample_id}")
def get_sample(sample_id: str, _: User = Depends(current_user)):
    s = samples.get(sample_id)
    if s is None:
        raise HTTPException(404, "샘플을 찾을 수 없어요")
    return {k: s[k] for k in ("id", "title", "description", "draft", "sources")}


# ---------- 검수 ----------
class DocIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=200_000)


class ReviewIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    sample_id: str | None = None
    draft: DocIn
    sources: list[DocIn] = Field(min_length=1, max_length=50)


def review_summary(r: Review) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "sample_id": r.sample_id,
        "status": r.status,
        "stage": r.stage,
        "total_claims": r.total_claims,
        "processed_claims": r.processed_claims,
        "provider": r.provider,
        "error_message": r.error_message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    }


def claim_out(c: Claim) -> dict:
    return {
        "id": c.id,
        "seq": c.seq,
        "content": c.content,
        "span_start": c.span_start,
        "span_end": c.span_end,
        "claim_type": c.claim_type,
        "verdict": c.verdict,
        "confidence": c.confidence,
        "risk": c.risk,
        "evidence_chunk_id": c.evidence_chunk_id,
        "quote": c.quote,
        "explanation": c.explanation,
        "suggestion": c.suggestion,
        "evidence": json.loads(c.evidence_json or "[]"),
        "decision": c.decision,
        "edited_text": c.edited_text,
    }


def _own_review(db: Session, review_id: int, user: User) -> Review:
    r = db.get(Review, review_id)
    if r is None or r.owner_id != user.id:
        raise HTTPException(404, "검수 건을 찾을 수 없어요")
    return r


@router.post("/reviews", status_code=201)
def create_review(body: ReviewIn, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = Review(title=body.title, sample_id=body.sample_id, owner_id=user.id)
    r.documents.append(Document(doc_kind="DRAFT", title=body.draft.title, content=body.draft.content))
    for s in body.sources:
        r.documents.append(Document(doc_kind="SOURCE", title=s.title, content=s.content))
    db.add(r)
    db.commit()
    bg.add_task(run_review, r.id)
    return review_summary(r)


@router.get("/reviews")
def list_reviews(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Review).where(Review.owner_id == user.id).order_by(Review.id.desc())).all()[:50]
    counts = dict(
        db.execute(
            select(Claim.review_id, func.count(Claim.id))
            .where(Claim.verdict.in_(FLAGGED))
            .group_by(Claim.review_id)
        ).all()
    )
    return [review_summary(r) | {"flagged_claims": counts.get(r.id, 0)} for r in rows]


@router.get("/reviews/{review_id}")
def get_review(review_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _own_review(db, review_id, user)
    draft = next((d for d in r.documents if d.doc_kind == "DRAFT"), None)
    return review_summary(r) | {
        "draft": {"id": draft.id, "title": draft.title, "content": draft.content} if draft else None,
        "sources": [{"id": d.id, "title": d.title, "content": d.content} for d in r.documents if d.doc_kind == "SOURCE"],
        "claims": [claim_out(c) for c in sorted(r.claims, key=lambda c: c.seq)],
    }


@router.get("/reviews/{review_id}/stream")
def stream_review(review_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """SSE: progress(진행률), claim(판정 1건), done(종료) 이벤트."""
    _own_review(db, review_id, user)

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    def gen():
        sent: set[int] = set()
        last_ping = time.time()
        deadline = time.time() + 600
        yield "retry: 2000\n\n"
        while time.time() < deadline:
            with SessionLocal() as s:
                r = s.get(Review, review_id)
                new = s.scalars(select(Claim).where(Claim.review_id == review_id).order_by(Claim.seq)).all()
                for c in new:
                    if c.id not in sent:
                        sent.add(c.id)
                        yield sse("claim", claim_out(c))
                yield sse("progress", review_summary(r))
                if r.status in ("DONE", "FAILED"):
                    yield sse("done", review_summary(r))
                    return
            if time.time() - last_ping > 15:  # Cloudflare 유휴 타임아웃 방지
                yield ": ping\n\n"
                last_ping = time.time()
            time.sleep(0.5)

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)


class DecisionIn(BaseModel):
    decision: str
    edited_text: str | None = Field(default=None, max_length=600)


@router.patch("/claims/{claim_id}")
def decide_claim(claim_id: int, body: DecisionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.decision not in DECISIONS:
        raise HTTPException(422, f"decision은 {sorted(DECISIONS)} 중 하나여야 해요")
    c = db.get(Claim, claim_id)
    if c is None:
        raise HTTPException(404, "주장을 찾을 수 없어요")
    _own_review(db, c.review_id, user)
    if body.decision == "EDITED" and not (body.edited_text or "").strip():
        raise HTTPException(422, "수정한 문장을 입력해 주세요")
    c.decision = body.decision
    c.edited_text = body.edited_text if body.decision == "EDITED" else None
    c.decided_at = utcnow() if body.decision != "PENDING" else None
    db.commit()
    return claim_out(c)


def final_text(draft: str, claims: list[Claim]) -> str:
    """수락한 수정안과 직접 고친 문장을 반영한 최종본."""
    out = draft
    for c in sorted(claims, key=lambda c: c.span_start, reverse=True):
        repl = None
        if c.decision == "EDITED" and c.edited_text:
            repl = c.edited_text
        elif c.decision == "ACCEPTED" and c.suggestion:
            repl = c.suggestion
        elif c.decision == "ACCEPTED" and c.verdict == "UNSUPPORTED":
            repl = ""  # 근거 없는 문장은 수락 시 삭제
        if repl is not None:
            out = out[: c.span_start] + repl + out[c.span_end :]
    return "\n".join(re.sub(r" {2,}", " ", line).strip() for line in out.splitlines())


class CompleteIn(BaseModel):
    duration_sec: int = Field(ge=1, le=36_000)
    reviewer: str = Field(default="데모 사용자", max_length=100)


@router.post("/reviews/{review_id}/complete")
def complete_review(review_id: int, body: CompleteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _own_review(db, review_id, user)
    claims = list(r.claims)
    acted = {c.id for c in claims if c.decision in ("ACCEPTED", "EDITED")}
    flagged = {c.id for c in claims if c.verdict in FLAGGED}

    planted_ids: set[int] = set()
    planted_total = 0
    sample = samples.get(r.sample_id) if r.sample_id else None
    if sample:
        planted_total = len(sample["ground_truth"])
        for gt in sample["ground_truth"]:
            hit = next((c for c in claims if gt["match"] in c.content), None)
            if hit:
                planted_ids.add(hit.id)

    stats = {
        "duration_sec": body.duration_sec,
        "total_claims": len(claims),
        "flagged_claims": len(flagged),
        "decided_claims": sum(1 for c in claims if c.decision != "PENDING"),
        "planted_errors": planted_total,
        "ai_detected": len(planted_ids & flagged),
        "found_errors": len(planted_ids & acted) if sample else len(acted),
        "false_positives": len(acted - planted_ids) if sample else 0,
        "missed_errors": planted_total - len(planted_ids & flagged) if sample else None,
    }
    db.add(
        ReviewSession(
            review_id=r.id,
            session_kind="ASSISTED",
            reviewer=body.reviewer,
            duration_sec=body.duration_sec,
            planted_errors=planted_total,
            found_errors=stats["found_errors"],
            false_positives=stats["false_positives"],
        )
    )
    r.completed_at = utcnow()
    db.commit()
    draft = next(d for d in r.documents if d.doc_kind == "DRAFT")
    return {"stats": stats, "final_text": final_text(draft.content, claims)}
