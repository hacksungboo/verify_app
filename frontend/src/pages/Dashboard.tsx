import { useEffect, useState } from "react";
import { ErrorBox } from "../components/common";
import { api } from "../lib/api";
import { VERDICT, dateTime, duration, pct } from "../lib/format";
import type { Metrics, SessionRow, Verdict } from "../lib/types";

function Compare({
  title,
  before,
  after,
  fmt,
  better,
  max,
  beforeRaw,
  afterRaw,
}: {
  title: string;
  before: string;
  after: string;
  fmt: string;
  better: string | null;
  max: number;
  beforeRaw: number | null;
  afterRaw: number | null;
}) {
  const w = (v: number | null) => (v == null || !max ? 0 : Math.max(1, (v / max) * 100));
  return (
    <section className="sheet cmp">
      <h3>{title}</h3>
      <div className="cmp-vals">
        <span className="cmp-before" title="도구 없이">
          {before}
        </span>
        <span className="cmp-after">{after}</span>
        {better && <span className="cmp-delta">{better}</span>}
      </div>
      <div className="bars" role="img" aria-label={`${title}: 도구 없이 ${before}, Verifi 사용 ${after}`}>
        <div className="bar-row" title={`도구 없이 ${before}`}>
          <span>도구 없이</span>
          <div className="bar-track">
            <div className="bar before" style={{ width: `${w(beforeRaw)}%` }} />
          </div>
          <span className="num">{before}</span>
        </div>
        <div className="bar-row" title={`Verifi 사용 ${after}`}>
          <span>Verifi 사용</span>
          <div className="bar-track">
            <div className="bar after" style={{ width: `${w(afterRaw)}%` }} />
          </div>
          <span className="num">{after}</span>
        </div>
      </div>
      <p className="small muted">{fmt}</p>
    </section>
  );
}

export default function Dashboard() {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ reviewer: "", minutes: "", planted: "7", found: "", fp: "0" });
  const load = () => api.metrics().then(setM).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(form.minutes);
    if (!form.reviewer.trim() || !(minutes > 0) || form.found === "") return setError("검수자, 소요 시간, 발견한 오류 수를 입력해 주세요.");
    setError(null);
    try {
      await api.addManualSession({
        reviewer: form.reviewer.trim(),
        duration_sec: Math.round(minutes * 60),
        planted_errors: Number(form.planted) || 0,
        found_errors: Number(form.found) || 0,
        false_positives: Number(form.fp) || 0,
      });
      setForm({ reviewer: "", minutes: "", planted: form.planted, found: "", fp: "0" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!m) return <main className="page">{error ? <ErrorBox message={error} /> : <p className="muted">불러오는 중…</p>}</main>;

  const b = m.manual;
  const a = m.assisted;
  const timeBetter =
    b.avg_duration_sec && a.avg_duration_sec ? `${Math.round((1 - a.avg_duration_sec / b.avg_duration_sec) * 100)}% 단축` : null;
  const rateBetter =
    b.detection_rate != null && a.detection_rate != null ? `${Math.round((a.detection_rate - b.detection_rate) * 100)}%p 향상` : null;
  const totalVerdicts = Object.values(m.verdicts).reduce((s, v) => s + (v ?? 0), 0);

  return (
    <main className="page section-gap">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>효과 측정</h1>
          <p>같은 보고서를 도구 없이 검수했을 때와 Verifi로 검수했을 때를 비교해요.</p>
        </div>
        <div className="legend" aria-label="범례">
          <span>
            <i style={{ background: "var(--series-before)" }} />
            도구 없이 ({b.count}회)
          </span>
          <span>
            <i style={{ background: "var(--series-after)" }} />
            Verifi 사용 ({a.count}회)
          </span>
        </div>
      </div>

      {b.has_sample && (
        <p className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="tag-sample">예시 값</span>
          ‘도구 없이’ 값에 예시 데이터가 섞여 있어요. 사전 실험 측정치를 아래에 입력한 뒤 예시를 지우세요.
          <button className="btn sm" onClick={() => api.clearSampleSessions().then(load)}>
            예시 지우기
          </button>
        </p>
      )}
      <ErrorBox message={error} />

      <div className="compare">
        <Compare
          title="평균 검수 시간"
          before={duration(b.avg_duration_sec)}
          after={a.count ? duration(a.avg_duration_sec) : "–"}
          better={timeBetter}
          max={Math.max(b.avg_duration_sec ?? 0, a.avg_duration_sec ?? 0)}
          beforeRaw={b.avg_duration_sec}
          afterRaw={a.avg_duration_sec}
          fmt="보고서 1건을 끝까지 검수하는 데 걸린 시간"
        />
        <Compare
          title="오류 발견율"
          before={pct(b.detection_rate)}
          after={a.count ? pct(a.detection_rate) : "–"}
          better={rateBetter}
          max={1}
          beforeRaw={b.detection_rate}
          afterRaw={a.detection_rate}
          fmt="심어둔 오류 중 검수자가 찾아 바로잡은 비율"
        />
        <Compare
          title="평균 오탐"
          before={b.avg_false_positives == null ? "–" : `${b.avg_false_positives}건`}
          after={a.count && a.avg_false_positives != null ? `${a.avg_false_positives}건` : "–"}
          better={null}
          max={Math.max(b.avg_false_positives ?? 0, a.avg_false_positives ?? 0, 1)}
          beforeRaw={b.avg_false_positives}
          afterRaw={a.avg_false_positives}
          fmt="오류가 아닌 문장을 잘못 고친 횟수"
        />
      </div>

      <div className="dash-grid">
        <section className="sheet">
          <div className="sheet-pad" style={{ paddingBottom: 8 }}>
            <h2>검수 기록</h2>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>방식</th>
                <th>검수자</th>
                <th className="num">시간</th>
                <th className="num">발견</th>
                <th>일시</th>
              </tr>
            </thead>
            <tbody>
              {m.sessions.map((s: SessionRow) => (
                <tr key={s.id}>
                  <td>
                    <span className="legend">
                      <span>
                        <i style={{ background: s.session_kind === "MANUAL" ? "var(--series-before)" : "var(--series-after)" }} />
                        {s.session_kind === "MANUAL" ? "도구 없이" : "Verifi"}
                      </span>
                    </span>
                  </td>
                  <td>
                    {s.reviewer} {s.is_sample && <span className="tag-sample">예시</span>}
                  </td>
                  <td className="num">{duration(s.duration_sec)}</td>
                  <td className="num">{s.planted_errors ? `${s.found_errors}/${s.planted_errors}` : s.found_errors}</td>
                  <td className="muted small">{dateTime(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="section-gap">
          <form className="sheet sheet-pad section-gap" onSubmit={addManual}>
            <div>
              <h2>‘도구 없이’ 측정치 입력</h2>
              <p className="small muted">사전 실험에서 원문과 초안을 눈으로 대조한 기록을 넣어 주세요.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label htmlFor="rv">검수자</label>
                <input id="rv" className="input" value={form.reviewer} onChange={(e) => setForm({ ...form, reviewer: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="mn">소요 시간(분)</label>
                <input id="mn" className="input" inputMode="decimal" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pl">심어둔 오류</label>
                <input id="pl" className="input" inputMode="numeric" value={form.planted} onChange={(e) => setForm({ ...form, planted: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="fd">발견한 오류</label>
                <input id="fd" className="input" inputMode="numeric" value={form.found} onChange={(e) => setForm({ ...form, found: e.target.value })} />
              </div>
            </div>
            <div>
              <button className="btn primary" type="submit">
                기록 추가
              </button>
            </div>
          </form>

          <section className="sheet sheet-pad section-gap">
            <h2>판정 분포</h2>
            <p className="small muted">지금까지 검수한 모든 주장 {totalVerdicts}개</p>
            <table className="table">
              <tbody>
                {(Object.keys(VERDICT) as Verdict[]).map((v) => (
                  <tr key={v}>
                    <td>
                      <span className={`chip ${v}`}>{VERDICT[v].label}</span>
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {m.verdicts[v] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </main>
  );
}
