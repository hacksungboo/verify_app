"""한국어 문장 분리, 유사도, 수치·날짜·고유명사 추출 (규칙 기반)."""
import re
from dataclasses import dataclass

_WS = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^0-9A-Za-z가-힣%]")

DATE_RE = re.compile(r"(\d{1,2})월\s*(\d{1,2})일(?:\s*[~∼\-]\s*(?:(\d{1,2})월\s*)?(\d{1,2})일)?")
# '5점 만점'처럼 기준값은 제외
QTY_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(%|건|점|시간|명|배|개|원|분|주차|일)(?!\s*만점)")
ENTITY_RE = re.compile(r"[가-힣A-Za-z]{1,10}(?:마트|푸드|리테일|물산|전자|상사|건설|제약|은행|카드|물류|유통)")
UNIVERSAL_WORDS = ("모든", "모두가", "전부", "항상", "누구나", "전원", "100%")
LIMITING_WORDS = ("일부", "몇몇", "일부의", "소수", "대부분", "상당수")


def normalize(s: str) -> str:
    return _WS.sub(" ", s).strip()


def compact(s: str) -> str:
    return _NON_WORD.sub("", s)


def bigrams(s: str) -> set[str]:
    c = compact(s)
    return {c[i : i + 2] for i in range(len(c) - 1)}


def coverage(claim: str, evidence: str) -> float:
    """주장 bigram 중 근거에 있는 비율 (0~1)."""
    cb = bigrams(claim)
    if not cb:
        return 0.0
    return len(cb & bigrams(evidence)) / len(cb)


@dataclass(frozen=True)
class Qty:
    value: str
    unit: str
    start: int
    end: int

    @property
    def token(self) -> str:
        return f"{self.value}{self.unit}"


def extract_dates(s: str) -> list[Qty]:
    out: list[Qty] = []
    for m in DATE_RE.finditer(s):
        month = m.group(1)
        out.append(Qty(f"{int(month)}월 {int(m.group(2))}", "일", m.start(), m.end()))
        if m.group(4):
            month2 = m.group(3) or month
            out.append(Qty(f"{int(month2)}월 {int(m.group(4))}", "일", m.start(), m.end()))
    return out


def extract_quantities(s: str) -> list[Qty]:
    """날짜 구간을 제외한 수량 (예: 214건, 12%, 3.2시간)."""
    date_spans = [(m.start(), m.end()) for m in DATE_RE.finditer(s)]
    out = []
    for m in QTY_RE.finditer(s):
        if any(a <= m.start() < b for a, b in date_spans):
            continue
        out.append(Qty(m.group(1), m.group(2), m.start(), m.end()))
    return out


def extract_entities(s: str) -> list[str]:
    return list(dict.fromkeys(m.group(0) for m in ENTITY_RE.finditer(s)))


def split_sentences(text: str) -> list[tuple[int, int]]:
    """문장 경계 (start, end). 마침표 뒤가 공백/끝일 때만 끊어서 3.2시간 같은 소수를 보호한다."""
    spans: list[tuple[int, int]] = []
    start = 0
    n = len(text)
    i = 0
    while i < n:
        ch = text[i]
        end = None
        if ch in ".!?" and (i + 1 == n or text[i + 1].isspace()):
            end = i + 1
        elif ch == "\n":
            end = i
        if end is not None:
            spans.append((start, end))
            start = i + 1
        i += 1
    if start < n:
        spans.append((start, n))
    cleaned = []
    for a, b in spans:
        seg = text[a:b]
        lead = len(seg) - len(seg.lstrip())
        trail = len(seg) - len(seg.rstrip())
        a2, b2 = a + lead, b - trail
        if b2 > a2:
            cleaned.append((a2, b2))
    return cleaned
