import { useState } from "react";
import { ErrorBox, BrandMark } from "../components/common";
import { api, session } from "../lib/api";
import { go } from "../lib/router";

export default function Login() {
  const [email, setEmail] = useState("demo@hanbit.co.kr");
  const [password, setPassword] = useState("verifi2026");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      session.save(res.access_token, res.user);
      go("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <BrandMark />
          Verifi
        </div>
        <div>
          <h1>AI가 30초 만에 쓴 보고서, 검수는 아직 40분 걸리고 있나요?</h1>
          <p className="lead">
            Verifi는 AI 초안의 문장을 하나씩 원문과 대조해, 틀린 수치와 원문에 없는 사실을 위험한 순서대로 짚어 드려요.
          </p>
        </div>
        <figure className="proof-snippet" aria-label="검수 예시">
          환불 문의는 전주 대비 <del>40%</del> <ins>12%</ins> 증가했다.
          <figcaption className="note">원문 「9월 4주차 VOC 집계표」 — 환불 문의는 전주 대비 12% 증가했다.</figcaption>
        </figure>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div>
            <h2>로그인</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              한빛물산 CS팀 검수 데스크
            </p>
          </div>
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input id="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="pw">비밀번호</label>
            <input
              id="pw"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <ErrorBox message={error} />
          <button className="btn primary lg" disabled={busy} type="submit">
            {busy ? "확인 중…" : "로그인"}
          </button>
          <p className="demo-hint">시연용 테스트 계정이 미리 입력되어 있어요. 그대로 로그인하면 됩니다.</p>
        </form>
      </section>
    </div>
  );
}
