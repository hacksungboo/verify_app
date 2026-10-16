import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .config import settings
from .db import init_db
from .routers import auth, metrics, reviews, system

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_in_threadpool(init_db)
    yield


app = FastAPI(
    title="Verifi API",
    description="AI가 쓴 보고서 초안을 원문과 대조해 틀린 수치와 없는 사실을 찾아주는 검수 API",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
for r in (auth.router, reviews.router, metrics.router, system.router):
    app.include_router(r)
