"""검수 파이프라인 인터페이스.

AI 파트는 VerifierProvider를 상속한 구현체 하나만 만들면 된다.
runner.py가 DB 저장, 진행률, 인용 검증, 위험도 계산을 맡으므로 구현체는 순수 로직만 담는다.

흐름: extract_claims → (주장마다) retrieve → judge
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

CLAIM_TYPES = ("NUMBER", "DATE", "ENTITY", "GENERALIZATION", "QUALITATIVE")
VERDICTS = ("SUPPORTED", "PARTIAL", "UNSUPPORTED", "CONTRADICTED", "UNVERIFIABLE")


@dataclass
class ExtractedClaim:
    content: str
    span_start: int  # 초안 본문 기준 문자 위치 (하이라이트용)
    span_end: int
    claim_type: str = "QUALITATIVE"


@dataclass
class SourceChunk:
    id: int
    document_id: int
    doc_title: str
    content: str


@dataclass
class Evidence:
    chunk_id: int
    doc_title: str
    content: str
    score: float

    def to_dict(self) -> dict:
        return {"chunk_id": self.chunk_id, "doc_title": self.doc_title, "content": self.content, "score": round(self.score, 3)}


@dataclass
class Judgement:
    verdict: str
    confidence: float
    quote: str | None = None  # 원문 그대로의 인용. runner가 실제 원문에 있는지 검증한다
    evidence_chunk_id: int | None = None
    explanation: str = ""
    suggestion: str | None = None  # 교체할 문장 전체
    extra: dict = field(default_factory=dict)


class VerifierProvider(ABC):
    name: str = "base"

    @abstractmethod
    def extract_claims(self, draft: str) -> list[ExtractedClaim]:
        """초안을 검증 가능한 주장 단위로 나눈다."""

    @abstractmethod
    def retrieve(self, claim: ExtractedClaim, chunks: list[SourceChunk], k: int = 3) -> list[Evidence]:
        """주장과 관련된 원문 조각 top-k."""

    @abstractmethod
    def judge(self, claim: ExtractedClaim, evidences: list[Evidence]) -> Judgement:
        """근거를 보고 판정한다. 불확실하면 SUPPORTED가 아니라 PARTIAL/UNSUPPORTED로 올린다."""
