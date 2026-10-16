"""AI 파트 연결 지점 (아직 미구현).

AI_PROVIDER=openai 로 바꾸면 runner가 이 클래스를 쓴다. 여기서 예외가 나면 규칙 기반으로 자동 대체된다.
구현 가이드와 프롬프트·스키마 초안은 저장소 루트의 ai/ 폴더를 보세요.

권장 구현 (노션 기획안 기준)
- extract_claims: 소형 모델 + JSON schema 구조화 출력 (ai/schemas/claims.schema.json)
- retrieve: 임베딩 → Oracle VECTOR_DISTANCE 로 top-k, 규칙 기반 점수와 합산
- judge: 중상급 모델, temperature 0, 원문 quote 강제 (ai/schemas/judgement.schema.json)
  숫자·날짜·고유명사는 RuleBasedProvider.judge 결과와 교차 확인해 갈리면 PARTIAL
"""
from ..config import settings
from .base import Evidence, ExtractedClaim, Judgement, SourceChunk, VerifierProvider
from .rule_based import RuleBasedProvider


class OpenAIProvider(VerifierProvider):
    name = "openai"

    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY가 비어 있어요")
        self._rule = RuleBasedProvider()
        raise NotImplementedError("AI 파트 구현 전입니다")  # TODO(AI): 구현 후 이 줄 삭제

    def extract_claims(self, draft: str) -> list[ExtractedClaim]:
        return self._rule.extract_claims(draft)  # TODO(AI)

    def retrieve(self, claim: ExtractedClaim, chunks: list[SourceChunk], k: int = 3) -> list[Evidence]:
        return self._rule.retrieve(claim, chunks, k)  # TODO(AI)

    def judge(self, claim: ExtractedClaim, evidences: list[Evidence]) -> Judgement:
        return self._rule.judge(claim, evidences)  # TODO(AI)
