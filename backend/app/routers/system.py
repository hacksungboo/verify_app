"""시연용: 이 화면이 어떤 OCI 인스턴스와 DB에서 돌고 있는지 보여준다."""
import platform
import socket
import time

from fastapi import APIRouter
from sqlalchemy import text

from ..config import settings
from ..db import engine
from ..oci_meta import instance_info

router = APIRouter(prefix="/api", tags=["system"])
STARTED_AT = time.time()


def _db_info() -> dict:
    info: dict = {"dialect": engine.dialect.name, "server_label": settings.db_server_label or None}
    t0 = time.perf_counter()
    try:
        with engine.connect() as conn:
            if settings.is_oracle:
                row = conn.execute(
                    text(
                        "SELECT SYS_CONTEXT('USERENV','SERVER_HOST'), SYS_CONTEXT('USERENV','DB_NAME'),"
                        " SYS_CONTEXT('USERENV','CON_NAME'), SYS_CONTEXT('USERENV','SESSION_USER') FROM DUAL"
                    )
                ).one()
                info.update(server_host=row[0], db_name=row[1], container=row[2], user=row[3])
                try:
                    info["version"] = conn.execute(text("SELECT banner_full FROM v$version")).scalar()
                except Exception:  # noqa: BLE001 - 권한이 없을 수 있음
                    info["version"] = conn.execute(
                        text("SELECT version_full FROM product_component_version WHERE ROWNUM = 1")
                    ).scalar()
                info["vector_column"] = bool(
                    conn.execute(
                        text("SELECT COUNT(*) FROM user_tab_columns WHERE table_name='VF_CHUNKS' AND column_name='EMBEDDING'")
                    ).scalar()
                )
            else:
                info["version"] = "SQLite " + conn.execute(text("select sqlite_version()")).scalar()
                info["server_host"] = "local file"
        info["ok"] = True
    except Exception as exc:  # noqa: BLE001
        info.update(ok=False, error=str(exc).splitlines()[0][:200])
    info["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return info


@router.get("/health")
def health():
    db = _db_info()
    return {"status": "ok" if db["ok"] else "degraded", "db": db["ok"]}


@router.get("/system")
def system():
    return {
        "app": {
            "name": settings.app_name,
            "version": settings.app_version,
            "commit": settings.git_commit,
            "provider": settings.ai_provider,
            "public_hostname": settings.public_hostname,
            "python": platform.python_version(),
            "arch": platform.machine(),
            "container_hostname": socket.gethostname(),
            "uptime_sec": round(time.time() - STARTED_AT),
        },
        "instance": instance_info(),
        "db": _db_info(),
    }
