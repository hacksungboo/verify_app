import { useState } from "react";
import { ErrorBox } from "../components/common";
import { api } from "../lib/api";
import { go } from "../lib/router";
import type { SourceDoc } from "../lib/types";

const SAMPLE_ID = "hanbit-w39";

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했어요`));
    r.readAsText(file, "utf-8");
  });
}

export default function NewReview() {
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<SourceDoc>({ title: "AI 초안", content: "" });
  const [sources, setSources] = useState<SourceDoc[]>([{ title: "원문 1", content: "" }]);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadSample() {
    setError(null);
    try {
      const s = await api.sample(SAMPLE_ID);
      setTitle(s.title);
      setDraft(s.draft);
      setSources(s.sources);
      setSampleId(s.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const docs = await Promise.all(
        Array.from(files).map(async (f) => ({ title: f.name.replace(/\.(txt|md)$/i, ""), content: await readFile(f) })),
      );
      setSources((prev) => [...prev.filter((s) => s.content.trim()), ...docs]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit() {
    const filled = sources.filter((s) => s.content.trim());
    if (!draft.content.trim()) return setError("검수할 AI 초안을 붙여넣어 주세요.");
    if (!filled.length) return setError("대조할 원문을 하나 이상 넣어 주세요.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.createReview({
        title: title.trim() || draft.title || "제목 없는 보고서",
        sample_id: sampleId,
        draft,
        sources: filled.map((s, i) => ({ title: s.title.trim() || `원문 ${i + 1}`, content: s.content })),
      });
      go(`/reviews/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const update = (i: number, patch: Partial<SourceDoc>) =>
    setSources((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <main className="page section-gap">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>새 검수</h1>
          <p>AI가 쓴 초안과, 초안을 쓸 때 참고한 원문을 넣어 주세요.</p>
        </div>
        <button className="btn primary lg" onClick={submit} disabled={busy}>
          {busy ? "요청 중…" : "검수 시작"}
        </button>
      </div>

      <div className="sample-strip">
        <div className="text">
          <h3>시연용 샘플 불러오기</h3>
          <p className="small muted">한빛물산 9월 4주차 VOC 원문 3건과 AI 보고서 초안. 초안에는 오류 7개가 심어져 있어요.</p>
        </div>
        <button className="btn" onClick={loadSample}>
          {sampleId ? "다시 불러오기" : "샘플 불러오기"}
        </button>
      </div>

      <ErrorBox message={error} />

      <div className="field">
        <label htmlFor="title">보고서 이름</label>
        <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 주간 VOC 보고서 · 9월 4주차" />
      </div>

      <div className="new-grid">
        <section className="sheet sheet-pad section-gap">
          <div>
            <h2>AI 초안</h2>
            <p className="small muted">검수할 보고서 본문이에요.</p>
          </div>
          <textarea
            className="textarea"
            style={{ minHeight: 420, fontFamily: "var(--font-proof)" }}
            value={draft.content}
            onChange={(e) => {
              setDraft({ ...draft, content: e.target.value });
              setSampleId(null);
            }}
            placeholder="AI가 작성한 보고서 초안을 붙여넣으세요."
          />
        </section>

        <section className="sheet sheet-pad section-gap">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
            <div>
              <h2>원문 {sources.filter((s) => s.content.trim()).length}건</h2>
              <p className="small muted">VOC 로그, 집계표, 메모 등. .txt / .md 파일도 됩니다.</p>
            </div>
            <label className="btn sm">
              파일 추가
              <input type="file" accept=".txt,.md,text/plain" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </label>
          </div>
          <div className="src-list">
            {sources.map((s, i) => (
              <div className="src-item" key={i}>
                <div className="row">
                  <input className="input" value={s.title} onChange={(e) => update(i, { title: e.target.value })} aria-label={`원문 ${i + 1} 제목`} />
                  <button
                    className="btn ghost sm"
                    onClick={() => setSources((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
                    disabled={sources.length === 1}
                  >
                    삭제
                  </button>
                </div>
                <textarea
                  className="textarea"
                  value={s.content}
                  onChange={(e) => update(i, { content: e.target.value })}
                  placeholder="원문 내용을 붙여넣으세요."
                />
              </div>
            ))}
          </div>
          <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => setSources((prev) => [...prev, { title: `원문 ${prev.length + 1}`, content: "" }])}>
            원문 칸 추가
          </button>
        </section>
      </div>
    </main>
  );
}
