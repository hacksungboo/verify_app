# 로컬 개발

DB 설치 없이 SQLite로 바로 돌아가요. 서버의 Oracle과 같은 코드입니다.

## 백엔드

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                    # 필요하면 수정
set -a && source .env && set +a                         # 환경변수 로드 (또는 직접 export)
uvicorn app.main:app --reload --port 8000
```

- Swagger: http://localhost:8000/api/docs
- 테스트: `pytest -q`
- DB 초기화: `rm verifi.db` 후 재시작 (테이블·테스트 계정 자동 생성)

로컬에서 Oracle로 붙여 보고 싶으면:

```bash
docker run -d --name oracle -p 1521:1521 -e ORACLE_PASSWORD=Pass1234 \
  -e APP_USER=verifi -e APP_USER_PASSWORD=Pass1234 gvenzl/oracle-free:23-slim
export DATABASE_URL="oracle+oracledb://verifi:Pass1234@localhost:1521/?service_name=FREEPDB1"
```

## 프론트엔드

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (/api 는 8000으로 프록시)
npm run typecheck    # 타입 검사
npm run build        # dist/ 생성
```

로그인: `demo@hanbit.co.kr / verifi2026` (화면에 미리 입력되어 있음)

## 이미지로 빌드해 보기

```bash
docker build -t verify-backend backend
docker build -t verify-frontend frontend
```

서버 배포는 `verify_infra/docs/deploy-guide.md`.

## 환경변수 (백엔드)

| 이름 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./verifi.db` | Oracle: `oracle+oracledb://user:pw@host:1521/?service_name=FREEPDB1` |
| `JWT_SECRET` | `change-me-in-env` | 서버에서는 꼭 바꾸기 |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | `demo@hanbit.co.kr` / `verifi2026` | 기동 시 자동 생성되는 테스트 계정 |
| `AI_PROVIDER` | `rule` | `openai` 로 바꾸면 AI 구현체 사용 (실패 시 rule로 폴백) |
| `OPENAI_API_KEY` | – | |
| `PIPELINE_STEP_DELAY` | `0.35` | 주장 1개당 대기(초). 시연에서 진행률이 보이게 |
| `OCI_METADATA_URL` | `http://169.254.169.254/opc/v2` | 로컬에서는 비워 두면 조회 생략 |
| `DB_SERVER_LABEL` | – | 시스템 화면에 보일 DB 서버 이름 |
| `PUBLIC_HOSTNAME` | `verifi.ccmall.shop` | |
| `CORS_ORIGINS` | `http://localhost:5173` | |
