"""DB 연결, 스키마 생성, 초기 데이터(seed)."""
import logging
import time
from collections.abc import Iterator

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

from .config import settings
from .models import Base, ReviewSession, User
from .security import hash_password

log = logging.getLogger("verifi.db")

_engine_kwargs: dict = {"pool_pre_ping": True}
if settings.database_url.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs.update(pool_size=5, max_overflow=5, pool_recycle=1800)

engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def wait_for_db() -> None:
    """Oracle 컨테이너는 첫 기동에 수 분이 걸리므로 연결될 때까지 기다린다."""
    deadline = time.time() + settings.db_wait_seconds
    attempt = 0
    while True:
        attempt += 1
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1 FROM DUAL" if settings.is_oracle else "SELECT 1"))
            log.info("DB 연결 성공 (시도 %d회)", attempt)
            return
        except Exception as exc:  # noqa: BLE001
            if time.time() > deadline:
                raise RuntimeError(f"DB에 연결하지 못했습니다: {exc}") from exc
            log.warning("DB 대기 중 (%d회): %s", attempt, str(exc).splitlines()[0][:200])
            time.sleep(5)


def _ensure_oracle_vector_column() -> None:
    """Oracle 23ai AI Vector Search용 임베딩 컬럼. 차원은 모델에 따라 바뀌므로 * 로 둔다."""
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT COUNT(*) FROM user_tab_columns WHERE table_name = 'VF_CHUNKS' AND column_name = 'EMBEDDING'")
        ).scalar()
        if not exists:
            conn.execute(text("ALTER TABLE vf_chunks ADD (embedding VECTOR(*, FLOAT32))"))
            log.info("vf_chunks.embedding VECTOR 컬럼 추가")


def init_db() -> None:
    wait_for_db()
    Base.metadata.create_all(engine)
    if settings.is_oracle:
        try:
            _ensure_oracle_vector_column()
        except Exception as exc:  # noqa: BLE001 - 벡터 컬럼은 AI 파트용이라 실패해도 앱은 뜬다
            log.warning("VECTOR 컬럼 추가 실패 (Oracle 23ai 이상인지 확인): %s", exc)
    seed()


def seed() -> None:
    with SessionLocal() as db:
        email = settings.demo_email.strip().lower()
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            db.add(
                User(
                    email=email,
                    display_name=settings.demo_name,
                    password_hash=hash_password(settings.demo_password),
                )
            )
            log.info("테스트 계정 생성: %s", email)

        has_baseline = db.scalar(select(ReviewSession.id).where(ReviewSession.session_kind == "MANUAL"))
        if has_baseline is None:
            # 사전 실험 전까지 대시보드가 비지 않도록 넣는 예시 값. is_sample=1로 화면에 '예시'로 표시된다.
            for reviewer, sec, found, fp in [("팀원 A", 2460, 4, 1), ("팀원 B", 2710, 5, 0), ("팀원 C", 2290, 4, 2)]:
                db.add(
                    ReviewSession(
                        session_kind="MANUAL",
                        reviewer=reviewer,
                        duration_sec=sec,
                        planted_errors=7,
                        found_errors=found,
                        false_positives=fp,
                        is_sample=1,
                        note="예시 값 - 사전 실험 측정치로 교체하세요",
                    )
                )
        db.commit()
