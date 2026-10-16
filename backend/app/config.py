"""환경변수 기반 설정. 모든 값은 .env 또는 compose의 environment로 주입한다."""
import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    app_name: str = "Verifi"
    app_version: str = field(default_factory=lambda: _env("APP_VERSION", "0.1.0"))
    git_commit: str = field(default_factory=lambda: _env("GIT_COMMIT", "local"))

    # 예) oracle+oracledb://verifi:비밀번호@db-host:1521/?service_name=FREEPDB1
    #     sqlite:///./verifi.db  (로컬 개발용)
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", "sqlite:///./verifi.db"))
    db_wait_seconds: int = field(default_factory=lambda: int(_env("DB_WAIT_SECONDS", "180")))
    # 시스템 화면에 표시할 DB 서버 이름 (예: "team-4-2 · 131.186.x.x")
    db_server_label: str = field(default_factory=lambda: _env("DB_SERVER_LABEL", ""))

    jwt_secret: str = field(default_factory=lambda: _env("JWT_SECRET", "change-me-in-env"))
    jwt_ttl_hours: int = field(default_factory=lambda: int(_env("JWT_TTL_HOURS", "12")))

    demo_email: str = field(default_factory=lambda: _env("DEMO_EMAIL", "demo@hanbit.co.kr"))
    demo_password: str = field(default_factory=lambda: _env("DEMO_PASSWORD", "verifi2026"))
    demo_name: str = field(default_factory=lambda: _env("DEMO_NAME", "김서연 CS팀장"))

    # rule: 규칙 기반 임시 판정기 / openai: AI 파트 구현체 (ai/ 참고)
    ai_provider: str = field(default_factory=lambda: _env("AI_PROVIDER", "rule"))
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY", ""))
    # 시연에서 진행률이 눈에 보이도록 주장 하나당 대기 시간(초)
    step_delay: float = field(default_factory=lambda: float(_env("PIPELINE_STEP_DELAY", "0.35")))

    # OCI 인스턴스 메타데이터 (IMDS v2). 테스트 시 빈 값이면 조회 생략
    oci_metadata_url: str = field(default_factory=lambda: _env("OCI_METADATA_URL", "http://169.254.169.254/opc/v2"))
    public_hostname: str = field(default_factory=lambda: _env("PUBLIC_HOSTNAME", "verifi.ccmall.shop"))

    cors_origins: str = field(default_factory=lambda: _env("CORS_ORIGINS", "http://localhost:5173"))

    @property
    def is_oracle(self) -> bool:
        return self.database_url.startswith("oracle")


settings = Settings()
