import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip, ErrorBox } from "../components/common";
import { api, session } from "../lib/api";
import { CLAIM_TYPE, VERDICT, clock, duration, isFlagged, pct } from "../lib/format";
import { go } from "../lib/router";
import type { Claim, CompleteResult, Decision, ReviewDetail } from "../lib/types";

/* ------------------------------------------------------------------ */
/* 데이터: 상세 조회 + SSE 실시간 수신 (끊기면 폴링으로 대체)              */
/* ------------------------------------------------------------------ */
function useReview(id: number) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => api.review(id).then(setReview).catch((e) => setError(e.message)), [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const running = review != null && (review.status === "QUEUED" || review.status === "RUNNING");

  useEffect(() => {
    if (!running) return;
    let pollTimer: number | undefined;
    let failures = 0;
    const es = new EventSource(api.streamUrl(id));

    es.addEventListener("claim", (ev) => {
      const c = JSON.parse((ev as MessageEvent).data) as Claim;
      setReview((r) => (r && !r.claims.some((x) => x.id === c.id) ? { ...r, claims: [...r.claims, c] } : r));
    });
    es.addEventListener("progress", (ev) => {
      const p = JSON.parse((ev as MessageEvent).data);
      setReview((r) => (r ? { ...r, ...p, claims: r.claims } : r));
    });
    es.addEventListener("done", () => {
      es.close();
      reload();
    });
    es.onerror = () => {
      failures += 1;
      if (failures >= 3) {
        es.close();
        pollTimer = window.setInterval(reload, 1500);
      }
    };
    return () => {
      es.close();
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [id, running, reload]);

  return { review, setReview, error, setError, reload };
}

/* ------------------------------------------------------------------ */
export default function ReviewPage({ id }: { id: number }) {
  const { review, setReview, error, setError } = useReview(id);
  const [started, setStarted] = useState(false);

  // 분석이 끝난 직후 잠깐 보여주고 워크스페이스로 넘어간다
  useEffect(() => {
    if (review?.status === "DONE" && !started) {
      const t = window.setTimeout(() => setStarted(true), review.claims.length && review.finished_at ? 1200 : 0);
      return () => window.clearTimeout(t);
    }
  }, [review?.status, started, review?.claims.length, review?.finished_at]);

  if (!review) {
    return (
      <main className="page">
        <ErrorBox message={error} />
        {!error && <p className="muted">불러오는 중…</p>}
      </main>
    );
  }
  if (review.status === "FAILED") {
    return (
      <main className="page section-gap">
        <h1>{review.title}</h1>
        <ErrorBox message={`검수 중 오류가 났어요: ${review.error_message ?? "알 수 없는 오류"}. 원문과 초안을 확인한 뒤 다시 시작해 주세요.`} />
        <div>
          <button className="btn" onClick={() => go("/new")}>
            새 검수로 돌아가기
          </button>
        </div>
      </main>
    );
  }
  if (review.status !== "DONE" || !started) return <AnalyzeView review={review} onStart={() => setStarted(true)} />;
  return <Workspace review={review} setReview={setReview} setError={setError} error={error} />;
}

/* ------------------------------------------------------------------ */
/* 분석 중 화면                                                         */
/* ------------------------------------------------------------------ */
function AnalyzeView({ review, onStart }: { review: ReviewDetail; onStart: () => void }) {
  const total = review.total_claims;
  const done = review.processed_claims;
  const ratio = total ? done / total : 0;
  const flagged = review.claims.filter((c) => isFlagged(c.verdict)).length;
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [review.claims.length]);

  return (
    <main className="analyze">
      <div>
        <p className="muted small">{review.title}</p>
        <h1 style={{ marginTop: 4 }}>{review.status === "DONE" ? "대조를 마쳤어요" : "초안의 문장을 원문과 대조하고 있어요"}</h1>
      </div>
      <div className="sheet sheet-pad section-gap">
        <div className="stage-row">
          <span style={{ fontWeight: 700 }}>{review.stage}</span>
          <span className="big">
            {done}
            <span className="muted" style={{ fontSize: 18 }}>
              {" "}
              / {total || "–"} 주장
            </span>
          </span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${review.status === "DONE" ? 100 : Math.max(4, ratio * 100)}%` }} />
        </div>
        <p className="small muted">
          지금까지 확인이 필요한 문장 <b style={{ color: "var(--v-contra)" }}>{flagged}개</b> · 판정기 {review.provider === "rule" ? "규칙 기반" : review.provider}
        </p>
      </div>
      <div className="sheet feed" ref={feedRef} aria-live="polite">
        {review.claims.length === 0 && <div className="empty small">원문을 나누고 주장을 추출하는 중…</div>}
        {review.claims.map((c) => (
          <div className="feed-row" key={c.id}>
            <Chip verdict={c.verdict} short />
            <p>{c.content}</p>
          </div>
        ))}
      </div>
      {review.status === "DONE" && (
        <div>
          <button className="btn primary lg" onClick={onStart}>
            검수 시작
          </button>
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* 검수 워크스페이스                                                     */
/* ------------------------------------------------------------------ */
function Workspace({
  review,
  setReview,
  error,
  setError,
}: {
  review: ReviewDetail;
  setReview: React.Dispatch<React.SetStateAction<ReviewDetail | null>>;
  error: string | null;
  setError: (m: string | null) => void;
}) {
  const claims = review.claims;
  // 위험도 순서 = 사람이 보는 순서
  const queue = useMemo(() => claims.filter((c) => isFlagged(c.verdict)).sort((a, b) => b.risk - a.risk), [claims]);
  const rank = useMemo(() => new Map(queue.map((c, i) => [c.id, i + 1])), [queue]);
  const [selectedId, setSelectedId] = useState<number | null>(queue[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [showOk, setShowOk] = useState(false);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const elapsed = Math.floor(((result ? result.stats.duration_sec * 1000 + startedAt : now) - startedAt) / 1000);

  useEffect(() => {
    if (result || review.completed_at) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [result, review.completed_at]);

  const selected = claims.find((c) => c.id === selectedId) ?? null;
  const decidedCount = queue.filter((c) => c.decision !== "PENDING").length;

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    setEditing(false);
    if (id != null) document.getElementById(`mk-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const move = useCallback(
    (dir: 1 | -1) => {
      if (!queue.length) return;
      const i = queue.findIndex((c) => c.id === selectedId);
      const next = i < 0 ? 0 : (i + dir + queue.length) % queue.length;
      select(queue[next].id);
    },
    [queue, selectedId, select],
  );

  const nextPending = useCallback(
    (fromId: number) => {
      const i = queue.findIndex((c) => c.id === fromId);
      const after = [...queue.slice(i + 1), ...queue.slice(0, i)].find((c) => c.decision === "PENDING" && c.id !== fromId);
      if (after) window.setTimeout(() => select(after.id), 180);
    },
    [queue, select],
  );

  const decide = useCallback(
    async (claim: Claim, decision: Decision, edited?: string) => {
      const optimistic = { ...claim, decision, edited_text: decision === "EDITED" ? (edited ?? null) : null };
      setReview((r) => (r ? { ...r, claims: r.claims.map((c) => (c.id === claim.id ? optimistic : c)) } : r));
      setEditing(false);
      if (decision !== "PENDING") nextPending(claim.id);
      try {
        const saved = await api.decide(claim.id, decision, edited);
        setReview((r) => (r ? { ...r, claims: r.claims.map((c) => (c.id === saved.id ? saved : c)) } : r));
      } catch (e) {
        setError((e as Error).message);
        setReview((r) => (r ? { ...r, claims: r.claims.map((c) => (c.id === claim.id ? claim : c)) } : r));
      }
    },
    [setReview, setError, nextPending],
  );

  async function complete() {
    try {
      const res = await api.complete(review.id, Math.max(1, elapsed), session.user()?.display_name ?? "데모 사용자");
      setResult(res);
      setReview((r) => (r ? { ...r, completed_at: new Date().toISOString() } : r));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // 단축키: J/K 이동, A 수정안 적용, E 직접 수정, I 무시, U 되돌리기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j") move(1);
      else if (k === "k") move(-1);
      else if (selected && isFlagged(selected.verdict)) {
        if (k === "a") decide(selected, "ACCEPTED");
        else if (k === "i") decide(selected, "IGNORED");
        else if (k === "u") decide(selected, "PENDING");
        else if (k === "e") {
          e.preventDefault();
          setEditing(true);
        } else return;
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, decide, selected]);

  const draft = review.draft?.content ?? "";
  const counts = queue.reduce<Record<string, number>>((m, c) => ((m[c.verdict] = (m[c.verdict] ?? 0) + 1), m), {});

  return (
    <>
      <div className="ws-bar">
        <span className="title">{review.title}</span>
        <span className="counter">
          {(["CONTRADICTED", "UNSUPPORTED", "PARTIAL", "UNVERIFIABLE"] as const)
            .filter((v) => counts[v])
            .map((v) => (
              <span key={v} className={`chip ${v}`}>
                {VERDICT[v].short} {counts[v]}
              </span>
            ))}
        </span>
        <span className="small muted">
          확인 {decidedCount} / {queue.length}
        </span>
        <label className="small muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={showOk} onChange={(e) => setShowOk(e.target.checked)} />
          근거 확인된 문장도 표시
        </label>
        <span className="spacer" />
        <span className="timer" title="이 화면을 연 뒤 지난 검수 시간">
          {!result && !review.completed_at && <span className="live" aria-hidden />}
          {clock(elapsed)}
        </span>
        <button className="btn primary" onClick={complete} disabled={!!result}>
          검수 완료
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 20px 0" }}>
          <ErrorBox message={error} />
        </div>
      )}

      <div className="ws">
        <RiskMinimap claims={claims} length={draft.length} selectedId={selectedId} onSelect={select} />
        <div className="proof-scroll">
          <article className={`proof ${showOk ? "show-ok" : ""}`}>
            <div className="proof-meta">
              <span>{review.draft?.title}</span>
              <span>원문 {review.sources.length}건과 대조</span>
            </div>
            <ProofText text={draft} claims={claims} rank={rank} selectedId={selectedId} onSelect={select} />
          </article>
        </div>
        <EvidencePanel
          claim={selected}
          rank={selected ? rank.get(selected.id) : undefined}
          total={queue.length}
          sources={review.sources}
          editing={editing}
          setEditing={setEditing}
          onDecide={decide}
          onMove={move}
        />
      </div>

      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
    </>
  );
}

/* ---------- 교정지 본문 ---------- */
function ProofText({
  text,
  claims,
  rank,
  selectedId,
  onSelect,
}: {
  text: string;
  claims: Claim[];
  rank: Map<number, number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const sorted = [...claims].sort((a, b) => a.span_start - b.span_start);
  const parts: React.ReactNode[] = [];
  let pos = 0;

  // 첫 줄이 주장에 속하지 않으면 문서 제목으로 표시
  const firstBreak = text.indexOf("\n");
  if (firstBreak > 0 && !sorted.some((c) => c.span_start < firstBreak)) {
    parts.push(
      <span className="proof-title" key="title">
        {text.slice(0, firstBreak)}
      </span>,
    );
    pos = firstBreak + 1;
  }

  for (const c of sorted) {
    if (c.span_start < pos) continue;
    if (c.span_start > pos) parts.push(<Fragment key={`t${pos}`}>{text.slice(pos, c.span_start)}</Fragment>);
    const original = text.slice(c.span_start, c.span_end);
    const n = rank.get(c.id);
    const replacement =
      c.decision === "EDITED" ? c.edited_text : c.decision === "ACCEPTED" ? (c.suggestion ?? (c.verdict === "UNSUPPORTED" ? "" : null)) : null;

    parts.push(
      <span
        key={c.id}
        id={`mk-${c.id}`}
        className={`mk ${c.decision === "IGNORED" ? "IGNORED" : c.verdict} ${replacement != null ? "fixed" : ""} ${c.id === selectedId ? "active" : ""}`}
        onClick={() => onSelect(c.id)}
        role="button"
        tabIndex={isFlagged(c.verdict) ? 0 : -1}
        onKeyDown={(e) => e.key === "Enter" && onSelect(c.id)}
        aria-label={`${VERDICT[c.verdict].label}: ${c.content}`}
      >
        {replacement != null ? <InlineDiff from={original} to={replacement} /> : original}
        {n != null && <span className={`mk-num ${c.decision === "ACCEPTED" || c.decision === "EDITED" ? "done" : ""}`}>{n}</span>}
      </span>,
    );
    pos = c.span_end;
  }
  if (pos < text.length) parts.push(<Fragment key="tail">{text.slice(pos)}</Fragment>);
  return <div className="proof-body">{parts}</div>;
}

/** 공통 앞뒤를 남기고 바뀐 부분만 취소선/삽입으로 보여준다 (교정 부호). */
function InlineDiff({ from, to }: { from: string; to: string }) {
  if (!to) return <del>{from}</del>;
  let a = 0;
  while (a < from.length && a < to.length && from[a] === to[a]) a++;
  let b = 0;
  while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++;
  // 글자 단위가 아니라 어절 단위로 끊어 '40% → 12%'처럼 읽히게 한다
  while (a > 0 && from[a - 1] !== " ") a--;
  while (b > 0 && from[from.length - b] !== " " && to[to.length - b] !== " ") b--;
  return (
    <>
      {from.slice(0, a)}
      {from.slice(a, from.length - b) && <del>{from.slice(a, from.length - b)}</del>}
      {to.slice(a, to.length - b) && <ins>{to.slice(a, to.length - b)}</ins>}
      {from.slice(from.length - b)}
    </>
  );
}

/* ---------- 위험 미니맵 ---------- */
function RiskMinimap({
  claims,
  length,
  selectedId,
  onSelect,
}: {
  claims: Claim[];
  length: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="minimap" aria-label="문서 전체의 위험 분포">
      {claims.map((c) => (
        <button
          key={c.id}
          className={`${c.verdict} ${c.decision !== "PENDING" ? "done" : ""} ${c.id === selectedId ? "active" : ""}`}
          style={{ top: `calc(${(c.span_start / Math.max(1, length)) * 100}% * 0.96 + 4px)` }}
          title={`${VERDICT[c.verdict].label} · ${c.content.slice(0, 30)}…`}
          onClick={() => onSelect(c.id)}
          aria-label={`${VERDICT[c.verdict].label} 문장으로 이동`}
        />
      ))}
    </div>
  );
}

/* ---------- 증거 패널 ---------- */
function EvidencePanel({
  claim,
  rank,
  total,
  sources,
  editing,
  setEditing,
  onDecide,
  onMove,
}: {
  claim: Claim | null;
  rank?: number;
  total: number;
  sources: ReviewDetail["sources"];
  editing: boolean;
  setEditing: (v: boolean) => void;
  onDecide: (c: Claim, d: Decision, edited?: string) => void;
  onMove: (dir: 1 | -1) => void;
}) {
  const [draftEdit, setDraftEdit] = useState("");
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (claim) setDraftEdit(claim.edited_text ?? claim.suggestion ?? claim.content);
  }, [claim?.id, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // 원문 카드 안에서만 인용 위치로 스크롤 (패널 전체가 밀리지 않게)
  useEffect(() => {
    const m = markRef.current;
    const box = m?.closest(".src-body") as HTMLElement | null;
    if (m && box) box.scrollTop = Math.max(0, m.offsetTop - box.clientHeight / 3);
    document.querySelector(".panel-body")?.scrollTo({ top: 0 });
  }, [claim?.id]);

  if (!claim) {
    return (
      <aside className="panel">
        <div className="empty">
          <h3>확인할 문장을 고르세요</h3>
          <p className="small">본문에서 표시된 문장을 누르거나 <kbd>J</kbd> 를 눌러 위험한 문장부터 차례로 보세요.</p>
          {total === 0 && <p className="small">이 초안에서는 원문과 다른 문장을 찾지 못했어요.</p>}
        </div>
      </aside>
    );
  }

  const ev = claim.evidence.find((e) => e.chunk_id === claim.evidence_chunk_id) ?? claim.evidence[0];
  const doc = ev ? sources.find((s) => s.title === ev.doc_title) : undefined;
  const quote = claim.quote ?? ev?.content ?? "";
  const qi = doc && quote ? doc.content.indexOf(quote) : -1;
  const flagged = isFlagged(claim.verdict);

  return (
    <aside className="panel" aria-label="증거 패널">
      <div className="panel-head">
        <div className="row">
          <Chip verdict={claim.verdict} />
          <span className="chip neutral">{CLAIM_TYPE[claim.claim_type]}</span>
          {rank != null && (
            <span className="small muted">
              {rank} / {total}
            </span>
          )}
          <span className="risk">
            위험도 <b>{Math.round(claim.risk)}</b> · 확신 {pct(claim.confidence)}
          </span>
        </div>
        {claim.explanation && <p className="why">{claim.explanation}</p>}
      </div>

      <div className="panel-body">
        <div>
          <span className="label">초안 문장</span>
          <p className="claim-text">{claim.content}</p>
        </div>

        {ev && (
          <div>
            <span className="label">원문 근거</span>
            <div className="source-card">
              <div className="src-head">
                <span>{ev.doc_title}</span>
                <span>유사도 {ev.score.toFixed(2)}</span>
              </div>
              <div className="src-body">
                {doc && qi >= 0 ? (
                  <>
                    <span className="dim">{doc.content.slice(0, qi)}</span>
                    <mark ref={markRef}>{quote}</mark>
                    <span className="dim">{doc.content.slice(qi + quote.length)}</span>
                  </>
                ) : (
                  <mark ref={markRef}>{quote}</mark>
                )}
              </div>
            </div>
          </div>
        )}

        {flagged && !editing && claim.suggestion && (
          <div>
            <span className="label">수정안</span>
            <div className="suggest">
              <InlineDiff from={claim.content} to={claim.suggestion} />
            </div>
          </div>
        )}
        {flagged && !editing && !claim.suggestion && claim.verdict === "UNSUPPORTED" && (
          <div>
            <span className="label">수정안</span>
            <div className="suggest">
              원문에서 근거를 찾지 못했어요. 수정안을 적용하면 이 문장을 <b>삭제</b>합니다.
            </div>
          </div>
        )}

        {editing && (
          <div className="field">
            <label htmlFor="edit">직접 수정</label>
            <textarea
              id="edit"
              className="textarea"
              autoFocus
              style={{ minHeight: 100, fontFamily: "var(--font-proof)" }}
              value={draftEdit}
              onChange={(e) => setDraftEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onDecide(claim, "EDITED", draftEdit);
                if (e.key === "Escape") setEditing(false);
              }}
            />
          </div>
        )}

        {claim.evidence.length > 1 && (
          <details>
            <summary className="small muted" style={{ cursor: "pointer" }}>
              다른 후보 근거 {claim.evidence.length - 1}건
            </summary>
            <div className="cands" style={{ marginTop: 8 }}>
              {claim.evidence
                .filter((e) => e !== ev)
                .map((e) => (
                  <div className="cand" key={e.chunk_id}>
                    <span className="score">{e.score.toFixed(2)}</span>
                    <span>
                      <b>{e.doc_title}</b> — {e.content}
                    </span>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>

      {flagged && (
        <div className="panel-foot">
          {claim.decision !== "PENDING" && !editing ? (
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <span className="decided">
                {claim.decision === "ACCEPTED" && "✓ 수정안을 적용했어요"}
                {claim.decision === "EDITED" && "✎ 직접 고친 문장으로 바꿨어요"}
                {claim.decision === "IGNORED" && "— 문제없다고 표시했어요"}
              </span>
              <button className="btn sm" onClick={() => onDecide(claim, "PENDING")}>
                되돌리기 <kbd>U</kbd>
              </button>
            </div>
          ) : editing ? (
            <div className="actions">
              <button className="btn primary" onClick={() => onDecide(claim, "EDITED", draftEdit)} disabled={!draftEdit.trim()}>
                수정 저장
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="btn primary" onClick={() => onDecide(claim, "ACCEPTED")}>
                수정안 적용 <kbd>A</kbd>
              </button>
              <button className="btn" onClick={() => setEditing(true)}>
                직접 수정 <kbd>E</kbd>
              </button>
              <button className="btn" onClick={() => onDecide(claim, "IGNORED")}>
                문제없음 <kbd>I</kbd>
              </button>
            </div>
          )}
          <div className="keys">
            <span>
              <kbd>J</kbd> 다음 · <kbd>K</kbd> 이전
            </span>
            <button className="btn ghost sm" onClick={() => onMove(1)} style={{ marginLeft: "auto" }}>
              다음 문장
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ---------- 검수 완료 결과 ---------- */
function ResultModal({ result, onClose }: { result: CompleteResult; onClose: () => void }) {
  const s = result.stats;
  const [copied, setCopied] = useState(false);
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="result-title" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="result-title">검수를 마쳤어요</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            이 기록은 효과 측정 화면의 ‘Verifi 사용’ 값에 반영돼요.
          </p>
        </div>
        <div className="modal-body">
          <div className="result-stats">
            <div className="stat">
              <div className="v">{duration(s.duration_sec)}</div>
              <div className="k">검수 시간</div>
            </div>
            <div className="stat">
              <div className="v">
                {s.planted_errors ? `${s.found_errors} / ${s.planted_errors}` : s.found_errors}
              </div>
              <div className="k">{s.planted_errors ? "심어둔 오류 중 바로잡음" : "바로잡은 문장"}</div>
            </div>
            <div className="stat">
              <div className="v">{s.planted_errors ? `${s.ai_detected} / ${s.planted_errors}` : s.flagged_claims}</div>
              <div className="k">{s.planted_errors ? "Verifi가 짚은 오류" : "Verifi가 짚은 문장"}</div>
            </div>
            <div className="stat">
              <div className="v">{s.false_positives}</div>
              <div className="k">오탐 (오류 아닌데 고침)</div>
            </div>
          </div>
          <div>
            <span className="label">최종본 (수정 반영)</span>
            <div className="final">{result.final_text}</div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(result.final_text).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? "복사했어요" : "최종본 복사"}
            </button>
            <button className="btn" onClick={onClose}>
              닫기
            </button>
            <button className="btn primary" onClick={() => go("/dashboard")}>
              효과 측정 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
