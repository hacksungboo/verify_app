# 깃헙 협업 규칙

1박 2일이라 규칙은 최소한으로. **main은 항상 배포 가능한 상태**만 지키면 돼요 (main push = 이미지 빌드).

## 커밋 메시지

```
<타입>(<범위>): <무엇을 했는지, 한국어 50자 이내>

(선택) 왜 바꿨는지, 참고할 점
```

| 타입 | 언제 |
|---|---|
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `design` | 화면·스타일만 변경 |
| `refactor` | 동작은 같고 구조만 변경 |
| `docs` | 문서 |
| `test` | 테스트 |
| `chore` | 설정, 의존성, 빌드 |
| `infra` | 배포, compose, CI, 클라우드 |
| `data` | 샘플·평가 데이터셋 |

범위: `fe` · `be` · `ai` · `infra` · `docs`

예시

```
feat(be): 주장별 판정 결과 SSE 스트리밍
fix(fe): J/K 이동 시 마지막 문장에서 멈추는 문제
feat(ai): 판정 프롬프트에 원문 인용 강제
data(ai): 한빛물산 VOC 초안 10건과 정답 JSON 추가
infra: cloudflared 서비스를 compose에 추가
```

## 브랜치

```
main                ← 배포 브랜치 (push 시 GHCR 이미지 빌드)
 └ feat/fe-workspace
 └ feat/be-sse
 └ feat/ai-judge
 └ fix/...
```

- 이름: `<타입>/<범위>-<짧은설명>`
- 작업 단위는 **2~3시간 이내**로 잘게. 오래 들고 있으면 충돌 나요
- 혼자 끝낼 수 있는 작은 수정은 main 직접 push 허용 (docs, 오타)

## PR

- 제목은 커밋 규칙과 동일
- 본문: 무엇을 / 어떻게 확인했는지 / 스크린샷(FE)
- 리뷰어 1명 OK면 머지. 급하면 Self-merge 후 슬랙/카톡 공유
- **Squash merge** 사용 (main 이력을 한 줄씩 깔끔하게)

## 기능 동결 (토 09:00 이후)

- `fix` 만 머지. 새 기능 금지
- 시연 서버는 `IMAGE_TAG` 를 커밋 태그로 고정 (`scripts/deploy.sh <커밋7자리>`)

## 하지 말 것

- `.env`, `*.key`, OpenAI 키, 터널 토큰 커밋 → 바로 키 폐기·재발급
- main에 force push
- 원문 VOC 실데이터 커밋 (샘플·가상 데이터만)
