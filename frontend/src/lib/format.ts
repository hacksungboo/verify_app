import type { ClaimType, Verdict } from "./types";

export const VERDICT: Record<Verdict, { label: string; short: string; icon: string }> = {
  CONTRADICTED: { label: "원문과 다름", short: "모순", icon: "✕" },
  UNSUPPORTED: { label: "근거 없음", short: "근거 없음", icon: "?" },
  PARTIAL: { label: "부분 일치", short: "부분", icon: "≈" },
  UNVERIFIABLE: { label: "검증 불가", short: "검증 불가", icon: "!" },
  SUPPORTED: { label: "근거 확인", short: "확인", icon: "✓" },
};

export const CLAIM_TYPE: Record<ClaimType, string> = {
  NUMBER: "수치",
  DATE: "날짜",
  ENTITY: "고유명사",
  GENERALIZATION: "일반화",
  QUALITATIVE: "서술",
};

export const isFlagged = (v: Verdict) => v !== "SUPPORTED";

export function duration(sec: number | null | undefined): string {
  if (sec == null) return "–";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`;
  return m > 0 ? `${m}분 ${String(s).padStart(2, "0")}초` : `${s}초`;
}

export function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function pct(v: number | null | undefined): string {
  return v == null ? "–" : `${Math.round(v * 100)}%`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  // 서버는 UTC(타임존 표기 없음)로 저장한다
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function shortOcid(id: string | undefined): string {
  if (!id) return "–";
  const tail = id.split(".").pop() ?? id;
  return `…${tail.slice(-10)}`;
}
