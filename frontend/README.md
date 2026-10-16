# frontend

React 19 + Vite + TypeScript. 외부 UI 라이브러리 없이 순수 CSS(`src/styles.css`).

```
src/
├── App.tsx              해시 라우터 (#/login, #/, #/new, #/reviews/:id, #/dashboard, #/system)
├── lib/api.ts           API 클라이언트 (토큰, 401 처리)
├── lib/types.ts         API 타입 (docs/api-spec.md 와 동일)
├── components/common.tsx 상단바, OCI 배지, 판정 칩
└── pages/
    ├── Login.tsx        테스트 계정 미리 입력
    ├── Home.tsx         검수함
    ├── NewReview.tsx    샘플 불러오기, 파일 추가
    ├── Review.tsx       분석 중(SSE) + 검수 워크스페이스(교정지·미니맵·증거 패널·단축키) + 완료 모달
    ├── Dashboard.tsx    효과 측정 Before/After
    └── System.tsx       OCI 인스턴스·DB·요청 경로
```

디자인 컨셉 **교정지**: 회청색 책상 위 흰 종이, 초안은 명조(Noto Serif KR), 판정색은 빨강(원문과 다름)·주황(근거 없음)·노랑(부분)·초록(확인)으로만 쓰고 밑줄 모양도 달리해 색만으로 구분하지 않아요. 수정은 남색 취소선/삽입(교정 부호)으로 표시.

실행: `npm install && npm run dev` (백엔드 8000 필요) · 빌드: `npm run build` · 이미지: `docker build -t verify-frontend .`
