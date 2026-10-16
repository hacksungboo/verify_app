import { useEffect, useState } from "react";
import { ErrorBox } from "../components/common";
import { api } from "../lib/api";
import { duration } from "../lib/format";
import type { SystemInfo } from "../lib/types";

function Copy({ value }: { value?: string }) {
  const [ok, setOk] = useState(false);
  if (!value) return <>–</>;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span className="mono">{value}</span>
      <button
        className="btn ghost sm"
        onClick={() => navigator.clipboard?.writeText(value).then(() => setOk(true), () => setOk(false))}
        aria-label="복사"
      >
        {ok ? "복사됨" : "복사"}
      </button>
    </span>
  );
}

export default function System() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .system()
        .then((s) => {
          setInfo(s);
          setAt(new Date());
          setError(null);
        })
        .catch((e) => setError(e.message));
    load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, []);

  if (!info) return <main className="page">{error ? <ErrorBox message={error} /> : <p className="muted">불러오는 중…</p>}</main>;
  const i = info.instance;
  const d = info.db;

  return (
    <main className="page section-gap">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>시스템</h1>
          <p>지금 이 화면을 처리한 서버와 데이터베이스예요. 10초마다 다시 확인합니다.</p>
        </div>
        <span className="small muted">마지막 확인 {at?.toLocaleTimeString("ko-KR")}</span>
      </div>
      <ErrorBox message={error} />

      <section className={`sheet hero-instance ${i.on_oci ? "" : "off"}`}>
        {i.on_oci ? (
          <>
            <span className="small" style={{ color: "var(--oci)", fontWeight: 800 }}>
              Oracle Cloud Infrastructure에서 실행 중
            </span>
            <span className="name">{i.display_name}</span>
            <span className="where">
              {i.region} · {i.availability_domain} · {i.fault_domain}
            </span>
          </>
        ) : (
          <>
            <span className="small muted" style={{ fontWeight: 700 }}>
              OCI 밖에서 실행 중
            </span>
            <span className="name">{info.app.container_hostname}</span>
            <span className="where">{i.reason ?? "메타데이터 조회가 꺼져 있어요 (OCI_METADATA_URL)"}</span>
          </>
        )}
      </section>

      <section className="sheet sheet-pad section-gap">
        <h2>요청 경로</h2>
        <div className="path">
          <div className="hop">
            <b>브라우저</b>
            <span>HTTPS</span>
          </div>
          <div className="hop-arrow">→</div>
          <div className="hop">
            <b>Cloudflare</b>
            <span>{info.app.public_hostname}</span>
          </div>
          <div className="hop-arrow">→</div>
          <div className="hop oci">
            <b>cloudflared 터널</b>
            <span>{i.on_oci ? i.display_name : "로컬"} · 인바운드 포트 없음</span>
          </div>
          <div className="hop-arrow">→</div>
          <div className="hop oci">
            <b>nginx → FastAPI</b>
            <span>
              {info.app.arch} · v{info.app.version}
            </span>
          </div>
          <div className="hop-arrow">→</div>
          <div className="hop oci">
            <b>{d.dialect === "oracle" ? "Oracle Database 23ai" : d.dialect}</b>
            <span>{d.server_label ?? d.server_host ?? "–"}</span>
          </div>
        </div>
      </section>

      <div className="sys-grid">
        <section className="sheet sheet-pad">
          <h2 style={{ marginBottom: 8 }}>앱 서버 인스턴스</h2>
          <dl className="kv">
            <dt>Shape</dt>
            <dd>
              {i.shape ?? "–"}
              {i.ocpus != null && ` · ${i.ocpus} OCPU · ${i.memory_gb}GB`}
            </dd>
            <dt>리전</dt>
            <dd>{i.region ?? "–"}</dd>
            <dt>가용성 도메인</dt>
            <dd>{i.availability_domain ?? "–"}</dd>
            <dt>사설 IP</dt>
            <dd>{i.private_ip ?? "–"}</dd>
            <dt>인스턴스 OCID</dt>
            <dd>
              <Copy value={i.instance_id} />
            </dd>
            <dt>컨테이너</dt>
            <dd>{info.app.container_hostname}</dd>
            <dt>가동 시간</dt>
            <dd>{duration(info.app.uptime_sec)}</dd>
          </dl>
        </section>

        <section className="sheet sheet-pad">
          <h2 style={{ marginBottom: 8 }}>
            <span className={`status-dot ${d.ok ? "ok" : "bad"}`} aria-hidden />
            데이터베이스
          </h2>
          <dl className="kv">
            <dt>상태</dt>
            <dd>{d.ok ? `연결됨 · 응답 ${d.latency_ms}ms` : `연결 실패 · ${d.error}`}</dd>
            <dt>버전</dt>
            <dd>{d.version ?? "–"}</dd>
            <dt>DB 서버</dt>
            <dd>{d.server_label ?? d.server_host ?? "–"}</dd>
            <dt>PDB / 사용자</dt>
            <dd>{d.container ? `${d.container} / ${d.user}` : "–"}</dd>
            <dt>벡터 검색</dt>
            <dd>{d.dialect === "oracle" ? (d.vector_column ? "VECTOR 컬럼 준비됨" : "미설정") : "Oracle에서만 사용"}</dd>
          </dl>
        </section>
      </div>

      <section className="sheet sheet-pad">
        <h2 style={{ marginBottom: 8 }}>배포 정보</h2>
        <dl className="kv">
          <dt>버전 / 커밋</dt>
          <dd>
            v{info.app.version} · <span className="mono">{info.app.commit.slice(0, 7)}</span>
          </dd>
          <dt>판정기</dt>
          <dd>{info.app.provider === "rule" ? "규칙 기반 (AI 연결 전)" : info.app.provider}</dd>
          <dt>런타임</dt>
          <dd>
            Python {info.app.python} · {info.app.arch}
          </dd>
        </dl>
      </section>
    </main>
  );
}
