# 데이터셋

폴더 하나 = 세트 하나. 백엔드 샘플과 **같은 형식**이라, 만든 세트를 `backend/app/samples/` 에 복사하면 화면의 "샘플 불러오기"에서 바로 쓸 수 있어요.

```
hanbit-w39/                ← 예시: backend/app/samples/hanbit-w39 참고
├── meta.json              id, title, sources 목록, ground_truth
├── draft.md               AI 초안 (오류가 심어진 버전)
└── sources/*.md           원문
```

`meta.json` 의 `ground_truth`:

```json
{ "match": "전주 대비 40% 증가", "error_type": "수치 부풀림", "correct": "12%" }
```

- `match`: 오류가 들어간 초안 문장의 **고유한 일부 문자열** (주장과 매칭할 때 씀)
- 오류 유형: 수치 부풀림, 원문에 없는 사실, 고객사·인물 바꿔치기, 날짜 이동, 과잉 일반화
- 세트마다 5~8개

## 만드는 순서

1. GPT로 가상 회사 VOC 원문 생성 (실데이터 금지)
2. 원문을 요약한 깨끗한 초안 생성
3. 스크립트로 오류 주입 + **무엇을 어떻게 바꿨는지 로그 → ground_truth**
4. `../eval/evaluate.py` 로 판정기 성능 측정
