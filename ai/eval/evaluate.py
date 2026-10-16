"""판정기 평가: 심어둔 오류(ground truth)를 얼마나 잡고, 정상 문장을 얼마나 잘못 잡는지.

사용 (저장소 루트에서):
    python ai/eval/evaluate.py                         # 규칙 기반, backend 샘플 전체
    python ai/eval/evaluate.py --provider openai       # AI 구현체 (OPENAI_API_KEY 필요)
    python ai/eval/evaluate.py --datasets ai/datasets  # 다른 폴더
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.pipeline.base import SourceChunk  # noqa: E402
from app.pipeline.runner import chunk_document  # noqa: E402

FLAGGED = {"CONTRADICTED", "UNSUPPORTED", "PARTIAL", "UNVERIFIABLE"}


def load_sets(folder: Path):
    for meta_path in sorted(folder.glob("*/meta.json")):
        base = meta_path.parent
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        sources = [(s["title"], (base / s["file"]).read_text(encoding="utf-8")) for s in meta["sources"]]
        yield meta, sources, (base / "draft.md").read_text(encoding="utf-8")


def get_provider(name: str):
    if name == "openai":
        from app.pipeline.openai_provider import OpenAIProvider

        return OpenAIProvider()
    from app.pipeline.rule_based import RuleBasedProvider

    return RuleBasedProvider()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="rule")
    ap.add_argument("--datasets", default=str(ROOT / "backend" / "app" / "samples"))
    args = ap.parse_args()
    provider = get_provider(args.provider)

    tp = fp = fn = tn = 0
    for meta, sources, draft in load_sets(Path(args.datasets)):
        chunks, cid = [], 0
        for title, content in sources:
            for _, _, body in chunk_document(content):
                cid += 1
                chunks.append(SourceChunk(cid, 0, title, body))
        planted = [g["match"] for g in meta["ground_truth"]]
        hit = set()
        print(f"\n## {meta['id']}")
        for c in provider.extract_claims(draft):
            j = provider.judge(c, provider.retrieve(c, chunks))
            is_err = next((m for m in planted if m in c.content), None)
            flagged = j.verdict in FLAGGED
            if is_err:
                hit.add(is_err)
                tp += flagged
                fn += not flagged
            else:
                fp += flagged
                tn += not flagged
            mark = "✓" if flagged == bool(is_err) else "✗"
            print(f"  {mark} [{j.verdict:12}] {'오류' if is_err else '정상'} | {c.content[:50]}")
        for m in planted:
            if m not in hit:
                fn += 1
                print(f"  ✗ [추출 누락    ] 오류 | {m}")

    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    print(f"\nprecision {precision:.2f} · recall {recall:.2f} · TP {tp} FP {fp} FN {fn} TN {tn}")


if __name__ == "__main__":
    main()
