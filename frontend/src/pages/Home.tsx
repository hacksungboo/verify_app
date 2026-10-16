import { useEffect, useState } from "react";
import { ErrorBox } from "../components/common";
import { api } from "../lib/api";
import { dateTime } from "../lib/format";
import { go } from "../lib/router";
import type { ReviewSummary } from "../lib/types";

const STATUS: Record<ReviewSummary["status"], string> = {
  QUEUED: "대기",
  RUNNING: "분석 중",
  DONE: "검수 대기",
  FAILED: "실패",
};

export default function Home() {
  const [rows, setRows] = useState<ReviewSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.reviews().then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>검수함</h1>
          <p>AI가 쓴 보고서 초안을 원문과 대조한 결과예요. 표시된 문장만 확인하면 됩니다.</p>
        </div>
        <button className="btn primary lg" onClick={() => go("/new")}>
          새 검수 시작
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="sheet">
        {rows && rows.length === 0 ? (
          <div className="empty">
            <h3>아직 검수한 보고서가 없어요</h3>
            <p className="small">샘플 보고서로 바로 시작해 보세요. 오류 7개가 심어진 한빛물산 VOC 보고서가 준비되어 있어요.</p>
            <button className="btn primary" style={{ marginTop: 8 }} onClick={() => go("/new")}>
              샘플로 검수 시작
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>보고서</th>
                <th>상태</th>
                <th className="num">확인 필요</th>
                <th className="num">전체 주장</th>
                <th>요청 시각</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="clickable" onClick={() => go(`/reviews/${r.id}`)}>
                  <td>
                    <a href={`#/reviews/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600, textDecoration: "none" }}>
                      {r.title}
                    </a>
                  </td>
                  <td>
                    <span className="chip neutral">{r.completed_at ? "검수 완료" : STATUS[r.status]}</span>
                  </td>
                  <td className="num" style={{ fontWeight: 700, color: r.flagged_claims ? "var(--v-contra)" : undefined }}>
                    {r.flagged_claims ?? 0}
                  </td>
                  <td className="num">{r.total_claims}</td>
                  <td className="muted">{dateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
