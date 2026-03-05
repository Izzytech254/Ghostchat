"""
GhostChat Key Distribution Server
──────────────────────────────────
Public-key-only store built on FastAPI + Redis.

Design rules (Zero-Knowledge):
- Private keys NEVER touch this server.
- Only Ed25519/X25519 PUBLIC keys are stored.
- The server verifies proof-of-possession (signature over the signed pre-key).
- One-time pre-keys are consumed on fetch (each key used at most once).
- All keys expire after KEY_TTL_SECONDS (default 30 days).
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import keys
from app.redis_client import get_redis

logging.basicConfig(
    stream=sys.stdout,
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s – %(message)s",
)
log = logging.getLogger("key_server")


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """Startup / shutdown hooks."""
    redis = await get_redis()
    log.info("Connected to Redis at %s:%s", settings.REDIS_HOST, settings.REDIS_PORT)
    yield
    await redis.aclose()
    log.info("Redis connection closed")


app = FastAPI(
    title="GhostChat Key Distribution Server",
    version="1.0.0",
    description=(
        "Zero-knowledge public-key distribution. "
        "Only public keys are stored – private keys never leave the client."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(keys.router, prefix="/keys", tags=["keys"])


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
