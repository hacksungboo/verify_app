"""규칙 기반 임시 판정기.

AI 파트 구현 전까지 E2E를 돌리기 위한 것이지만, 노션 기획안의 '숫자·날짜·고유명사는
LLM이 아닌 규칙으로 한 번 더 대조' 단계로도 그대로 재사용할 수 있다.
"""
from .base import Evidence, ExtractedClaim, Judgement, SourceChunk, VerifierProvider
from .textutil import (
    LIMITING_WORDS,
    UNIVERSAL_WORDS,
    coverage,
    extract_dates,
    extract_entities,
    extract_quantities,
    split_sentences,
)

MIN_CLAIM_CHARS = 12


def classify(text: str) -> str:
    if any(w in text for w in UNIVERSAL_WORDS):
        return "GENERALIZATION"
    if extract_quantities(text):
        return "NUMBER"
    if extract_dates(text):
        return "DATE"
    if extract_entities(text):
        return "ENTITY"
    return "QUALITATIVE"


def _first_universal(text: str) -> str | None:
    return next((w for w in UNIVERSAL_WORDS if w in text), None)


class RuleBasedProvider(VerifierProvider):
    name = "rule"

    # ---------- 1. 주장 추출 ----------
    def extract_claims(self, draft: str) -> list[ExtractedClaim]:
        claims = []
        for a, b in split_sentences(draft):
            sent = draft[a:b]
            # 제목·소제목처럼 문장으로 끝나지 않는 줄은 건너뛴다
            if len(sent) < MIN_CLAIM_CHARS or not sent.rstrip().endswith((".", "다", "요")):
                continue
            claims.append(ExtractedClaim(sent, a, b, classify(sent)))
        return claims

    # ---------- 2. 근거 검색 ----------
    def retrieve(self, claim: ExtractedClaim, chunks: list[SourceChunk], k: int = 3) -> list[Evidence]:
        claim_tokens = {q.token for q in extract_quantities(claim.content)} | {
            d.value for d in extract_dates(claim.content)
        }
        claim_entities = set(extract_entities(claim.content))
        scored = []
        for ch in chunks:
            score = coverage(claim.content, ch.content)
            chunk_tokens = {q.token for q in extract_quantities(ch.content)} | {d.value for d in extract_dates(ch.content)}
            score += 0.15 * len(claim_tokens & chunk_tokens)
            score += 0.1 * len(claim_entities & set(extract_entities(ch.content)))
            scored.append(Evidence(ch.id, ch.doc_title, ch.content, score))
        scored.sort(key=lambda e: e.score, reverse=True)
        return scored[:k]

    # ---------- 3. 판정 ----------
    def judge(self, claim: ExtractedClaim, evidences: list[Evidence]) -> Judgement:
        if not evidences:
            return Judgement("UNSUPPORTED", 0.7, explanation="비교할 원문이 없어요.")
        best = evidences[0]
        text = claim.content
        sim = coverage(text, best.content)
        pool = " ".join(e.content for e in evidences)

        def result(verdict: str, conf: float, why: str, suggestion: str | None = None, ev: Evidence = best) -> Judgement:
            return Judgement(verdict, conf, quote=ev.content, evidence_chunk_id=ev.chunk_id, explanation=why, suggestion=suggestion)

        # (a) 고유명사: 근거 문장의 고객사가 다르면 바꿔치기
        claim_ents = extract_entities(text)
        best_ents = extract_entities(best.content)
        for ent in claim_ents:
            if ent not in best.content and best_ents and sim >= 0.35:
                other = best_ents[0]
                return result(
                    "CONTRADICTED", 0.88,
                    f"원문에서 이 내용은 '{ent}' 건이 아니라 '{other}' 건이에요.",
                    text.replace(ent, other),
                )

        # (b) 날짜
        pool_dates = {d.value for e in evidences for d in extract_dates(e.content)}
        best_dates = extract_dates(best.content)
        for d in extract_dates(text):
            if d.value not in pool_dates:
                if best_dates and sim >= 0.3:
                    right = best_dates[0].value
                    span = text[d.start : d.end]
                    fixed = text[: d.start] + f"{right}일" + text[d.end :] if "~" not in span else None
                    return result(
                        "CONTRADICTED", 0.9,
                        f"초안 날짜는 {d.value}일, 원문 근거는 {right}일입니다.",
                        fixed,
                    )
                return result("UNSUPPORTED", 0.75, f"원문에서 {d.value}일 관련 내용을 찾지 못했어요.", None)

        # (c) 수치
        pool_qty = {q.token for e in evidences for q in extract_quantities(e.content)}
        for q in extract_quantities(text):
            if q.token in pool_qty:
                continue
            same_unit = [b for b in extract_quantities(best.content) if b.unit == q.unit and b.token not in text]
            if same_unit and sim >= 0.15:
                right = min(same_unit, key=lambda b: abs(float(b.value) - float(q.value)))
                return result(
                    "CONTRADICTED", 0.92,
                    f"초안 수치는 {q.token}, 원문 근거는 {right.token}입니다.",
                    text[: q.start] + right.token + text[q.end :],
                )
            return result(
                "UNSUPPORTED", 0.8,
                f"'{q.token}' 수치가 원문 어디에도 없어요.",
                None,
            )

        # (d) 과잉 일반화: 원문은 '일부'라고 했는데 초안은 '모든'
        uni = _first_universal(text)
        if uni:
            limiter = next((w for w in LIMITING_WORDS if w in best.content), None)
            if limiter:
                fixed = text.replace(f"{uni} 고객이", f"{limiter} 고객이").replace(uni, limiter)
                return result(
                    "PARTIAL", 0.78,
                    f"원문은 '{limiter}'라고만 했는데 초안은 '{uni}' 표현으로 범위를 넓혔어요.",
                    fixed,
                )

        # (e) 유사도로 정성 판정
        if sim >= 0.5:
            return result("SUPPORTED", min(0.95, 0.55 + 0.4 * sim), "원문과 내용이 일치해요.")
        if sim >= 0.3:
            return result("PARTIAL", 0.6, "비슷한 원문은 있지만 표현이 달라 확인이 필요해요.")
        return result("UNSUPPORTED", 0.75, "이 내용을 뒷받침하는 원문을 찾지 못했어요.", None)
