# DB 다이어그램 (Oracle Database 23ai)

테이블은 모두 `vf_` 접두사. 앱이 기동할 때 없으면 자동으로 만들어요 (`backend/app/models.py`). 실제 DDL은 [schema_oracle.sql](./schema_oracle.sql).

```mermaid
erDiagram
  VF_USERS ||--o{ VF_REVIEWS : "소유"
  VF_REVIEWS ||--|{ VF_DOCUMENTS : "원문 N + 초안 1"
  VF_DOCUMENTS ||--o{ VF_CHUNKS : "원문 조각"
  VF_REVIEWS ||--o{ VF_CLAIMS : "주장·판정"
  VF_CHUNKS |o--o{ VF_CLAIMS : "근거 (evidence_chunk_id)"
  VF_REVIEWS |o--o{ VF_REVIEW_SESSIONS : "검수 기록"

  VF_USERS {
    int id PK
    varchar2 email UK
    varchar2 display_name
    varchar2 password_hash
    date created_at
  }
  VF_REVIEWS {
    int id PK
    varchar2 title
    varchar2 sample_id "샘플이면 정답 비교"
    int owner_id FK
    varchar2 status "QUEUED RUNNING DONE FAILED"
    varchar2 stage "진행 단계 문구"
    int total_claims
    int processed_claims "SSE 진행률"
    varchar2 provider "rule | openai"
    date finished_at "분석 완료"
    date completed_at "사람 검수 완료"
  }
  VF_DOCUMENTS {
    int id PK
    int review_id FK
    varchar2 doc_kind "SOURCE | DRAFT"
    varchar2 title
    clob content
  }
  VF_CHUNKS {
    int id PK
    int document_id FK
    int seq
    varchar2 content
    int char_start
    int char_end
    vector embedding "VECTOR(*, FLOAT32) · AI 파트가 채움"
  }
  VF_CLAIMS {
    int id PK
    int review_id FK
    int seq
    varchar2 content
    int span_start "초안 내 위치"
    int span_end
    varchar2 claim_type "NUMBER DATE ENTITY ..."
    varchar2 verdict "SUPPORTED ... CONTRADICTED"
    float confidence
    float risk "0~100"
    int evidence_chunk_id
    varchar2 quote "원문 인용 (코드 검증)"
    varchar2 explanation
    varchar2 suggestion "수정안"
    clob evidence_json "후보 근거 top-k"
    varchar2 decision "PENDING ACCEPTED EDITED IGNORED"
    varchar2 edited_text
  }
  VF_REVIEW_SESSIONS {
    int id PK
    int review_id FK "MANUAL이면 null"
    varchar2 session_kind "MANUAL | ASSISTED"
    varchar2 reviewer
    int duration_sec
    int planted_errors
    int found_errors
    int false_positives
    int is_sample "예시 값 표시"
  }
```

## 메모

- **Oracle 예약어를 피했어요**: `MODE`, `LEVEL`, `SIZE`, `COMMENT`, `TYPE` 대신 `session_kind`, `claim_type`, `doc_kind`
- 문자열 컬럼은 `VARCHAR2(n CHAR)`지만 Oracle 기본 최대 4000바이트라, 한글은 약 1300자. 앱에서 조각 1200자, 주장·인용 600자로 자름
- JSON은 `CLOB`에 문자열로 저장 (SQLite 겸용). Oracle 전용으로 가면 `JSON` 타입으로 바꿔도 됨

## AI 파트용: 벡터 검색 예시

```sql
-- 임베딩 저장
UPDATE vf_chunks SET embedding = TO_VECTOR(:vec_json) WHERE id = :id;

-- 주장과 가장 가까운 원문 조각 5개 (같은 검수 건 안에서)
SELECT c.id, c.content, VECTOR_DISTANCE(c.embedding, TO_VECTOR(:claim_vec), COSINE) AS dist
  FROM vf_chunks c JOIN vf_documents d ON d.id = c.document_id
 WHERE d.review_id = :review_id
 ORDER BY dist
 FETCH FIRST 5 ROWS ONLY;
```

python-oracledb에서는 `array.array("f", embedding)` 을 바인드하면 `TO_VECTOR` 없이도 들어가요.
