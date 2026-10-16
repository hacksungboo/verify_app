"""샘플 데이터에 심은 오류 7개를 규칙 기반 판정기가 모두 잡는지 확인한다.

실행: cd backend && pip install -r requirements-dev.txt && pytest -q
"""
from app import samples
from app.pipeline.base import SourceChunk
from app.pipeline.rule_based import RuleBasedProvider
from app.pipeline.runner import chunk_document, compute_risk
from app.pipeline.textutil import extract_dates, extract_quantities, split_sentences

FLAGGED = {"CONTRADICTED", "UNSUPPORTED", "PARTIAL", "UNVERIFIABLE"}


def _run_sample():
    s = samples.get("hanbit-w39")
    chunks, cid = [], 0
    for src in s["sources"]:
        for _, _, body in chunk_document(src["content"]):
            cid += 1
            chunks.append(SourceChunk(cid, 0, src["title"], body))
    p = RuleBasedProvider()
    results = []
    for c in p.extract_claims(s["draft"]["content"]):
        results.append((c, p.judge(c, p.retrieve(c, chunks))))
    return s, results


def test_all_planted_errors_flagged():
    s, results = _run_sample()
    for gt in s["ground_truth"]:
        hit = [j for c, j in results if gt["match"] in c.content]
        assert hit, f"주장 추출 누락: {gt['match']}"
        assert hit[0].verdict in FLAGGED, f"놓친 오류: {gt['match']} → {hit[0].verdict}"


def test_no_false_positive_on_sample():
    s, results = _run_sample()
    planted = [gt["match"] for gt in s["ground_truth"]]
    for c, j in results:
        if not any(m in c.content for m in planted):
            assert j.verdict == "SUPPORTED", f"오탐: {c.content} → {j.verdict}"


def test_decimal_not_split():
    text = "응답 시간은 3.2시간이다. 다음 문장."
    spans = split_sentences(text)
    assert [text[a:b] for a, b in spans] == ["응답 시간은 3.2시간이다.", "다음 문장."]


def test_quantity_and_date_extraction():
    assert [q.token for q in extract_quantities("5점 만점에 4.1점, 214건, 12%")] == ["4.1점", "214건", "12%"]
    assert [d.value for d in extract_dates("9월 21일~27일")] == ["9월 21", "9월 27"]


def test_risk_orders_contradiction_first():
    assert compute_risk("CONTRADICTED", "NUMBER", 0.9) > compute_risk("PARTIAL", "QUALITATIVE", 0.6)
    assert compute_risk("SUPPORTED", "NUMBER", 0.9) < 15
