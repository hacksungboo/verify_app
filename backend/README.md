# backend

FastAPI + SQLAlchemy 2 + python-oracledb(thin). Oracle 23ai(서버) / SQLite(로컬) 겸용.

```
app/
├── main.py            앱, 라우터 등록, 기동 시 DB 준비
├── config.py          환경변수 (docs/local-dev.md 표 참고)
├── db.py              엔진, 테이블 생성, Oracle VECTOR 컬럼, 테스트 계정·예시 지표 seed
├── models.py          vf_users, vf_reviews, vf_documents, vf_chunks, vf_claims, vf_review_sessions
├── security.py        PBKDF2 비밀번호, JWT
├── oci_meta.py        OCI 인스턴스 메타데이터(IMDS v2) 조회
├── routers/           auth, reviews(+SSE), metrics, system
├── pipeline/          ★ 검수 파이프라인 — base(인터페이스) · rule_based · openai_provider(AI 자리) · runner
└── samples/hanbit-w39 시연 샘플 (오류 7개 + 정답)
```

실행: `pip install -r requirements.txt && uvicorn app.main:app --reload` → http://localhost:8000/api/docs
테스트: `pip install -r requirements-dev.txt && pytest -q`
