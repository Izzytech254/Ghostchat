"""Whispro Key Distribution Server"""
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.limiter import limiter
from app.routers import keys
from app.redis_client import get_redis

logging.basicConfig(
    stream=sys.stdout,
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
log = logging.getLogger("key_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = await get_redis()
    log.info("Connected to Redis at %s:%s", settings.REDIS_HOST, settings.REDIS_PORT)
    yield
    await redis.aclose()
    log.info("Redis connection closed")


app = FastAPI(
    title="Whispro Key Distribution Server",
    version="1.0.0",
    description="Zero-knowledge public-key distribution. Private keys never leave the client.",
    lifespan=lifespan,
    openapi_url=None,   # disable /openapi.json exposure
    docs_url=None,
    redoc_url=None,
)

# ── Rate limiting (slowapi) ────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ───────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Delete-Token"],
    expose_headers=[],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next) -> Response:
    """Attach security headers to every response."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    # Don't leak server identity
    try:
        del response.headers["server"]
    except KeyError:
        pass
    return response


@app.middleware("http")
async def limit_body_size(request: Request, call_next) -> Response:
    """Reject request bodies larger than 64 KB (prevents DoS)."""
    cl = request.headers.get("content-length")
    if cl and int(cl) > 65_536:
        return Response(
            content='{"detail":"Request body too large (max 64 KB)"}',
            status_code=413,
            media_type="application/json",
        )
    return await call_next(request)


app.include_router(keys.router, prefix="/keys", tags=["keys"])


@app.get("/health", tags=["meta"])
async def health():
    """Liveness probe."""
    return {"status": "ok"}
