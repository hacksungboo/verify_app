"""DB 모델. Oracle 23ai와 SQLite 양쪽에서 동작하도록 공통 타입만 쓴다.

- Oracle 예약어(MODE, LEVEL, SIZE, COMMENT, DATE, NUMBER 등)는 컬럼명으로 쓰지 않는다.
- JSON은 CLOB(Text)에 문자열로 저장한다.
- 임베딩 VECTOR 컬럼은 Oracle일 때만 db.py에서 별도로 추가한다.
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Identity, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "vf_users"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Review(Base):
    """검수 작업 1건 = 원문 묶음 + AI 초안 1개."""

    __tablename__ = "vf_reviews"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    sample_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("vf_users.id"))
    # QUEUED → RUNNING → DONE | FAILED
    status: Mapped[str] = mapped_column(String(20), default="QUEUED")
    stage: Mapped[str] = mapped_column(String(100), default="대기 중")
    total_claims: Mapped[int] = mapped_column(Integer, default=0)
    processed_claims: Mapped[int] = mapped_column(Integer, default=0)
    provider: Mapped[str] = mapped_column(String(50), default="rule")
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # 사람이 검수 완료한 시각

    documents: Mapped[list["Document"]] = relationship(back_populates="review", cascade="all, delete-orphan")
    claims: Mapped[list["Claim"]] = relationship(back_populates="review", cascade="all, delete-orphan")


class Document(Base):
    """원문(SOURCE) 또는 AI 초안(DRAFT)."""

    __tablename__ = "vf_documents"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("vf_reviews.id"))
    doc_kind: Mapped[str] = mapped_column(String(10))  # SOURCE | DRAFT
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    review: Mapped[Review] = relationship(back_populates="documents")
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    """원문 조각. Oracle에서는 embedding VECTOR 컬럼이 추가된다(AI 파트가 채움)."""

    __tablename__ = "vf_chunks"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("vf_documents.id"))
    seq: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(String(4000))
    char_start: Mapped[int] = mapped_column(Integer)
    char_end: Mapped[int] = mapped_column(Integer)

    document: Mapped[Document] = relationship(back_populates="chunks")


class Claim(Base):
    """초안에서 뽑은 검증 단위 주장 1개와 판정 결과."""

    __tablename__ = "vf_claims"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("vf_reviews.id"))
    seq: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(String(2000))
    span_start: Mapped[int] = mapped_column(Integer)
    span_end: Mapped[int] = mapped_column(Integer)
    claim_type: Mapped[str] = mapped_column(String(20))  # NUMBER | DATE | ENTITY | GENERALIZATION | QUALITATIVE
    # SUPPORTED | PARTIAL | UNSUPPORTED | CONTRADICTED | UNVERIFIABLE
    verdict: Mapped[str] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    risk: Mapped[float] = mapped_column(Float, default=0.0)
    evidence_chunk_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quote: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    explanation: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    suggestion: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    evidence_json: Mapped[str] = mapped_column(Text, default="[]")
    # PENDING | ACCEPTED | EDITED | IGNORED
    decision: Mapped[str] = mapped_column(String(20), default="PENDING")
    edited_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    review: Mapped[Review] = relationship(back_populates="claims")


class ReviewSession(Base):
    """사람이 검수한 기록. MANUAL(도구 없이) vs ASSISTED(Verifi 사용) 비교용."""

    __tablename__ = "vf_review_sessions"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    review_id: Mapped[int | None] = mapped_column(ForeignKey("vf_reviews.id"), nullable=True)
    session_kind: Mapped[str] = mapped_column(String(20))  # MANUAL | ASSISTED
    reviewer: Mapped[str] = mapped_column(String(100))
    duration_sec: Mapped[int] = mapped_column(Integer)
    planted_errors: Mapped[int] = mapped_column(Integer, default=0)
    found_errors: Mapped[int] = mapped_column(Integer, default=0)
    false_positives: Mapped[int] = mapped_column(Integer, default=0)
    is_sample: Mapped[int] = mapped_column(Integer, default=0)  # 1이면 시연용 예시 데이터
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
