# API 명세서

- Base URL: `https://verifi.ccmall.shop` (로컬: `http://localhost:8000`)
- Swagger: **`/api/docs`** — 실제 동작하는 명세는 여기가 최신이에요
- 인증: `Authorization: Bearer <access_token>`. SSE만 예외로 `?token=` 쿼리
- 응답은 모두 JSON, 오류는 `{ "detail": "사람이 읽을 메시지" }`
- 시각은 UTC ISO-8601 (타임존 표기 없음)

## 요약

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/login` | – | 로그인 → 토큰 |
| GET | `/api/auth/me` | ✓ | 내 정보 |
| GET | `/api/samples` | ✓ | 시연용 샘플 목록 |
| GET | `/api/samples/{id}` | ✓ | 샘플 원문·초안 |
| POST | `/api/reviews` | ✓ | 검수 시작 (백그라운드 실행) |
| GET | `/api/reviews` | ✓ | 내 검수 목록 |
| GET | `/api/reviews/{id}` | ✓ | 검수 상세 (초안, 원문, 주장 전체) |
| GET | `/api/reviews/{id}/stream` | ✓ (query) | **SSE** 진행률·주장 실시간 |
| PATCH | `/api/claims/{id}` | ✓ | 주장에 대한 사람의 결정 |
| POST | `/api/reviews/{id}/complete` | ✓ | 검수 완료 → 통계·최종본 |
| GET | `/api/metrics` | ✓ | Before/After 지표 |
| POST | `/api/metrics/sessions` | ✓ | ‘도구 없이’ 측정치 입력 |
| DELETE | `/api/metrics/samples` | ✓ | 예시 측정치 삭제 |
| GET | `/api/health` | – | 헬스체크 (DB 포함) |
| GET | `/api/system` | – | **OCI 인스턴스·DB 정보** (시연용) |

## 공통 값

| 이름 | 값 |
|---|---|
| `verdict` | `SUPPORTED` 근거 확인 · `PARTIAL` 부분 일치 · `UNSUPPORTED` 근거 없음 · `CONTRADICTED` 원문과 다름 · `UNVERIFIABLE` 인용 검증 실패 |
| `claim_type` | `NUMBER` · `DATE` · `ENTITY` · `GENERALIZATION` · `QUALITATIVE` |
| `decision` | `PENDING` · `ACCEPTED`(수정안 적용) · `EDITED`(직접 수정) · `IGNORED`(문제없음) |
| `status` (review) | `QUEUED` → `RUNNING` → `DONE` / `FAILED` |
| `risk` | 0~100. 높을수록 먼저 봐야 함 |

---

## POST /api/auth/login

```json
// 요청
{ "email": "demo@hanbit.co.kr", "password": "verifi2026" }
// 200
{ "access_token": "eyJ...", "token_type": "bearer",
  "user": { "id": 1, "email": "demo@hanbit.co.kr", "display_name": "김서연 CS팀장" } }
```
401: `이메일 또는 비밀번호가 맞지 않아요`

## POST /api/reviews

```json
// 요청
{
  "title": "한빛물산 주간 VOC 보고서 · 9월 4주차",
  "sample_id": "hanbit-w39",            // 샘플이면 넣기(정답 비교용), 아니면 null
  "draft":   { "title": "AI 초안", "content": "..." },
  "sources": [ { "title": "9월 4주차 VOC 집계표", "content": "..." } ]   // 1~50개
}
// 201  (ReviewSummary)
{ "id": 7, "title": "...", "sample_id": "hanbit-w39", "status": "QUEUED", "stage": "대기 중",
  "total_claims": 0, "processed_claims": 0, "provider": "rule", "error_message": null,
  "created_at": "2026-10-16T05:24:14", "finished_at": null, "completed_at": null }
```

## GET /api/reviews/{id}

`ReviewSummary` + 아래 필드

```json
{
  "draft":   { "id": 12, "title": "AI 초안", "content": "..." },
  "sources": [ { "id": 13, "title": "9월 4주차 VOC 집계표", "content": "..." } ],
  "claims":  [ Claim, ... ]           // seq 순
}
```

### Claim

```json
{
  "id": 41, "seq": 2,
  "content": "환불 문의는 전주 대비 40% 증가해 즉각적인 대응이 필요하다.",
  "span_start": 120, "span_end": 152,        // 초안 content 기준 문자 위치 → 하이라이트
  "claim_type": "NUMBER",
  "verdict": "CONTRADICTED",
  "confidence": 0.92,
  "risk": 96.8,
  "evidence_chunk_id": 3,
  "quote": "환불 문의는 전주 대비 12% 증가했다.",   // 원문에 실제로 있는 문장 (코드로 검증됨)
  "explanation": "초안 수치는 40%, 원문 근거는 12%입니다.",
  "suggestion": "환불 문의는 전주 대비 12% 증가해 즉각적인 대응이 필요하다.",   // null 가능
  "evidence": [ { "chunk_id": 3, "doc_title": "9월 4주차 VOC 집계표", "content": "...", "score": 0.4 } ],
  "decision": "PENDING",
  "edited_text": null
}
```

## GET /api/reviews/{id}/stream?token=...

`text/event-stream`. 0.5초 간격으로 DB를 읽어 보냄. 15초마다 `: ping`.

```
event: claim
data: {Claim}

event: progress
data: {ReviewSummary}

event: done
data: {ReviewSummary}
```

프론트는 3번 연속 오류가 나면 `GET /api/reviews/{id}` 1.5초 폴링으로 자동 전환해요.

## PATCH /api/claims/{id}

```json
{ "decision": "ACCEPTED" }
{ "decision": "EDITED", "edited_text": "고친 문장" }   // EDITED면 edited_text 필수
{ "decision": "PENDING" }                             // 되돌리기
```
200: 바뀐 `Claim`

## POST /api/reviews/{id}/complete

```json
// 요청
{ "duration_sec": 412, "reviewer": "김서연 CS팀장" }
// 200
{
  "stats": {
    "duration_sec": 412, "total_claims": 13, "flagged_claims": 7, "decided_claims": 7,
    "planted_errors": 7,     // 샘플일 때만. 아니면 0
    "ai_detected": 7,        // 심어둔 오류 중 Verifi가 표시한 수
    "found_errors": 7,       // 그중 사람이 수락/수정한 수
    "false_positives": 0,
    "missed_errors": 0
  },
  "final_text": "수락·수정이 반영된 최종본"
}
```
→ `ASSISTED` 세션으로 저장돼 대시보드에 반영.

## GET /api/metrics

```json
{
  "manual":   { "count": 3, "avg_duration_sec": 2487, "detection_rate": 0.619, "avg_false_positives": 1.0, "has_sample": true },
  "assisted": { "count": 1, "avg_duration_sec": 412,  "detection_rate": 1.0,   "avg_false_positives": 0.0, "has_sample": false },
  "verdicts": { "SUPPORTED": 6, "CONTRADICTED": 5, "PARTIAL": 1, "UNSUPPORTED": 1 },
  "sessions": [ { "id": 4, "session_kind": "ASSISTED", "reviewer": "...", "duration_sec": 412, ... } ]
}
```

## POST /api/metrics/sessions

```json
{ "reviewer": "팀원 A", "duration_sec": 2460, "planted_errors": 7, "found_errors": 4, "false_positives": 1 }
```

## GET /api/system

```json
{
  "app": { "name": "Verifi", "version": "0.1.12", "commit": "3f2a9c1...", "provider": "rule",
           "public_hostname": "verifi.ccmall.shop", "python": "3.12.7", "arch": "aarch64",
           "container_hostname": "a1b2c3", "uptime_sec": 3600 },
  "instance": {
    "on_oci": true, "display_name": "team-4-1", "region": "ap-seoul-1", "region_key": "icn",
    "availability_domain": "kWVD:AP-SEOUL-1-AD-1", "fault_domain": "FAULT-DOMAIN-2",
    "shape": "VM.Standard.A1.Flex", "ocpus": 2, "memory_gb": 12,
    "instance_id": "ocid1.instance.oc1.ap-seoul-1....", "private_ip": "10.0.0.120", ...
  },
  "db": { "ok": true, "dialect": "oracle", "version": "Oracle Database 23ai Free Release 23.0.0.0.0 ...",
          "server_host": "team-4-2", "db_name": "FREE", "container": "FREEPDB1", "user": "VERIFI",
          "vector_column": true, "server_label": "team-4-2 · Oracle 23ai Free", "latency_ms": 2.1 }
}
```
OCI 밖에서는 `instance.on_oci=false` 와 `reason`.
