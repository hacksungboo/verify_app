# Verifi 백엔드 (FastAPI). x86_64 / arm64 모두 빌드 가능 (oracledb thin 모드라 Oracle Client 불필요)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

ARG APP_VERSION=0.1.0
ARG GIT_COMMIT=local
ENV APP_VERSION=${APP_VERSION} GIT_COMMIT=${GIT_COMMIT}

RUN useradd --create-home --uid 10001 verifi
USER verifi

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=10 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=2).status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
