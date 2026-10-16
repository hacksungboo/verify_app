"""시연용 샘플 데이터셋 로더. 폴더 하나 = 샘플 하나 (meta.json + sources/ + draft.md)."""
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).parent


@lru_cache
def load_all() -> dict[str, dict]:
    out = {}
    for meta_path in sorted(ROOT.glob("*/meta.json")):
        base = meta_path.parent
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["draft"] = {"title": meta["draft_title"], "content": (base / "draft.md").read_text(encoding="utf-8").strip()}
        meta["sources"] = [
            {"title": s["title"], "content": (base / s["file"]).read_text(encoding="utf-8").strip()} for s in meta["sources"]
        ]
        out[meta["id"]] = meta
    return out


def get(sample_id: str) -> dict | None:
    return load_all().get(sample_id)
