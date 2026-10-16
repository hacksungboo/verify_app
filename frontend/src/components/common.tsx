import { useEffect, useState } from "react";
import { api, session } from "../lib/api";
import { VERDICT } from "../lib/format";
import type { Route } from "../lib/router";
import type { SystemInfo, Verdict } from "../lib/types";

export function Chip({ verdict, short }: { verdict: Verdict; short?: boolean }) {
  const v = VERDICT[verdict];
  return (
    <span className={`chip ${verdict}`}>
      <span className="ico" aria-hidden>
        {v.icon}
      </span>
      {short ? v.short : v.label}
    </span>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#22408C" />
      <path d="M8 9h11M8 15h16M8 21h9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 21l2.5 2.5L27 18" stroke="#FFD43B" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 어느 OCI 인스턴스가 응답했는지 항상 보여주는 배지. 클릭하면 시스템 화면. */
export function OciBadge() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .system()
        .then((s) => alive && setInfo(s))
        .catch(() => alive && setInfo(null));
    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const inst = info?.instance;
  const label = !info
    ? "서버 확인 중"
    : inst?.on_oci
      ? `${inst.region ?? "region"} · ${inst.display_name ?? inst.container_hostname}`
      : `로컬 실행 · ${info.app.container_hostname}`;
  return (
    <a className={`oci-badge ${inst?.on_oci ? "" : "off"}`} href="#/system" title="이 화면을 처리한 서버 정보 보기">
      <span className="oci-dot" aria-hidden />
      {inst?.on_oci && <span className="oci-word">OCI</span>}
      <span>{label}</span>
    </a>
  );
}

const NAV: { href: string; label: string; match: Route["name"][] }[] = [
  { href: "#/", label: "검수함", match: ["home", "review"] },
  { href: "#/new", label: "새 검수", match: ["new"] },
  { href: "#/dashboard", label: "효과 측정", match: ["dashboard"] },
  { href: "#/system", label: "시스템", match: ["system"] },
];

export function TopBar({ route }: { route: Route }) {
  const user = session.user();
  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <BrandMark />
        Verifi
      </a>
      <nav className="nav" aria-label="주요 메뉴">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} aria-current={n.match.includes(route.name) ? "page" : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="topbar-right">
        <OciBadge />
        {user && <span className="user-name">{user.display_name}</span>}
        <button
          className="btn ghost sm"
          onClick={() => {
            session.clear();
            window.location.hash = "#/login";
          }}
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="error-box" role="alert">
      {message}
    </div>
  );
}
