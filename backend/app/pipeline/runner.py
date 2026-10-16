"""검수 실행기: 청킹 → 주장 추출 → (주장마다) 근거 검색 → 판정 → 인용 검증 → 위험도 → DB 저장.

진행 상황은 vf_reviews.processed_claims / stage에 기록하고, SSE 엔드포인트가 이를 읽어 흘려보낸다.
"""
import json
import logging
import time

from sqlalchemy import select

from ..config import settings
from ..db import SessionLocal
from ..models import Chunk, Claim, Document, Review, utcnow
from .base import ExtractedClaim, Judgement, SourceChunk, VerifierProvider
from .rule_based import RuleBasedProvider
from .textutil import normalize

log = logging.getLogger("verifi.pipeline")

SEVERITY = {"CONTRADICTED": 1.0, "UNSUPPORTED": 0.8, "UNVERIFIABLE": 0.65, "PARTIAL": 0.5, "SUPPORTED": 0.05}
TYPE_WEIGHT = {"NUMBER": 1.0, "DATE": 0.95, "ENTITY": 0.9, "GENERALIZATION": 0.75, "QUALITATIVE": 0.6}
MAX_CHUNK_CHARS = 1200  # Oracle VARCHAR2(4000 BYTE) 안에서 한글 기준 안전한 길이


def get_provider() -> VerifierProvider:
    if settings.ai_provider == "openai":
        try:
            from .openai_provider import OpenAIProvider

            return OpenAIProvider()
        except Exception as exc:  # noqa: BLE001
            log.warning("OpenAI 판정기를 쓸 수 없어 규칙 기반으로 대체합니다: %s", exc)
    return RuleBasedProvider()


def compute_risk(verdict: str, claim_type: str, confidence: float) -> float:
    """위험도 0~100. 사람이 위험한 문장부터 보게 하는 정렬 기준."""
    sev = SEVERITY.get(verdict, 0.5)
    weight = TYPE_WEIGHT.get(claim_type, 0.6)
    # 문제 판정은 확신할수록 위험, 근거 확인은 확신이 낮을수록 위험
    conf_factor = 0.6 + 0.4 * confidence if verdict != "SUPPORTED" else 1.0 + (1 - confidence)
    return round(min(100.0, 100 * sev * weight * conf_factor), 1)


def chunk_document(content: str) -> list[tuple[int, int, str]]:
    """원문을 줄(항목) 단위로 자른다. 제목(#)과 빈 줄은 건너뛴다. (start, end, text)"""
    out = []
    pos = 0
    for line in content.splitlines(keepends=True):
        start = pos
        pos += len(line)
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        body = stripped.lstrip("-*• ").strip()
        offset = start + line.find(body)
        out.append((offset, offset + len(body), body[:MAX_CHUNK_CHARS]))
    return out


def verify_quote(j: Judgement, sources_norm: list[str]) -> Judgement:
    """판정기가 낸 인용문이 실제 원문에 있는지 코드로 확인한다. 없으면 '검증 불가'로 강등."""
    if j.quote and not any(normalize(j.quote) in s for s in sources_norm):
        if j.verdict == "SUPPORTED":
            j.verdict = "UNVERIFIABLE"
            j.explanation = "판정 근거로 제시된 인용문이 원문에 없어 검증할 수 없어요. " + j.explanation
        j.extra["quote_verified"] = False
    else:
        j.extra["quote_verified"] = bool(j.quote)
    return j


def _set_stage(db, review: Review, stage: str, **fields) -> None:
    review.stage = stage
    for k, v in fields.items():
        setattr(review, k, v)
    db.commit()


def run_review(review_id: int) -> None:
    provider = get_provider()
    with SessionLocal() as db:
        review = db.get(Review, review_id)
        if review is None:
            return
        try:
            _set_stage(db, review, "원문 정리 중", status="RUNNING", provider=provider.name)
            docs = db.scalars(select(Document).where(Document.review_id == review_id)).all()
            sources = [d for d in docs if d.doc_kind == "SOURCE"]
            draft = next(d for d in docs if d.doc_kind == "DRAFT")

            chunks: list[SourceChunk] = []
            for doc in sources:
                for seq, (a, b, body) in enumerate(chunk_document(doc.content)):
                    row = Chunk(document_id=doc.id, seq=seq, content=body, char_start=a, char_end=b)
                    db.add(row)
                    db.flush()
                    chunks.append(SourceChunk(row.id, doc.id, doc.title, body))
            db.commit()
            sources_norm = [normalize(d.content) for d in sources]

            _set_stage(db, review, "주장 추출 중")
            extracted: list[ExtractedClaim] = provider.extract_claims(draft.content)
            _set_stage(db, review, "근거 대조 중", total_claims=len(extracted))

            for seq, ec in enumerate(extracted):
                evidences = provider.retrieve(ec, chunks)
                j = verify_quote(provider.judge(ec, evidences), sources_norm)
                db.add(
                    Claim(
                        review_id=review_id,
                        seq=seq,
                        content=ec.content[:600],
                        span_start=ec.span_start,
                        span_end=ec.span_end,
                        claim_type=ec.claim_type,
                        verdict=j.verdict,
                        confidence=round(j.confidence, 3),
                        risk=compute_risk(j.verdict, ec.claim_type, j.confidence),
                        evidence_chunk_id=j.evidence_chunk_id,
                        quote=(j.quote or "")[:600] or None,
                        explanation=(j.explanation or "")[:300],
                        suggestion=(j.suggestion or "")[:600] or None,
                        evidence_json=json.dumps([e.to_dict() for e in evidences], ensure_ascii=False),
                    )
                )
                review.processed_claims = seq + 1
                db.commit()
                if settings.step_delay:
                    time.sleep(settings.step_delay)

            _set_stage(db, review, "완료", status="DONE", finished_at=utcnow())
        except Exception as exc:  # noqa: BLE001
            log.exception("검수 실패 review=%s", review_id)
            db.rollback()
            review = db.get(Review, review_id)
            _set_stage(db, review, "실패", status="FAILED", error_message=str(exc)[:300])
