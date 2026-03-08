import os

BASE_KS = "/home/boss/Documents/Projects/Whispro/key-server/app"
BASE_BE = "/home/boss/Documents/Projects/Whispro/backend/src"

# ── key-server/app/main.py ─────────────────────────────────────────────────
main_py = """\
\"\"\"Whispro Key Distribution Server\"\"\"
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
    \"\"\"Attach security headers to every response.\"\"\"
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    # Don't leak server identity
    response.headers.pop("server", None)
    return response


@app.middleware("http")
async def limit_body_size(request: Request, call_next) -> Response:
    \"\"\"Reject request bodies larger than 64 KB (prevents DoS).\"\"\"
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
    \"\"\"Liveness probe.\"\"\"
    return {"status": "ok"}
"""

# ── key-server/app/routers/keys.py – add rate limit decorators ─────────────
# Read existing, inject limiter imports + decorators
keys_path = os.path.join(BASE_KS, "routers", "keys.py")
with open(keys_path) as f:
    keys_src = f.read()

# Only patch if not already patched
if "from app.limiter import limiter" not in keys_src:
    # Insert limiter import after last existing import
    keys_src = keys_src.replace(
        "from app.redis_client import get_redis",
        "from app.redis_client import get_redis\nfrom app.limiter import limiter",
    )
    # Add rate limit to register route
    keys_src = keys_src.replace(
        "@router.post(\"/register\", status_code=201)",
        "@router.post(\"/register\", status_code=201)\n@limiter.limit(\"10/hour\")",
    )
    # Add rate limit to get_keys route
    keys_src = keys_src.replace(
        "@router.get(\"/{user_id}\", response_model=KeyBundleResponse)",
        "@router.get(\"/{user_id}\", response_model=KeyBundleResponse)\n@limiter.limit(\"200/hour\")",
    )
    # Add rate limit to lookup route
    keys_src = keys_src.replace(
        "@router.get(\"/lookup/{username}\")",
        "@router.get(\"/lookup/{username}\")\n@limiter.limit(\"100/hour\")",
    )
    # Routes need `request: Request` added as first param for slowapi
    keys_src = keys_src.replace(
        "async def register_keys(\n    bundle: KeyBundleUpload,\n    redis=Depends(get_redis),",
        "async def register_keys(\n    request: Request,\n    bundle: KeyBundleUpload,\n    redis=Depends(get_redis),",
    )
    keys_src = keys_src.replace(
        "async def get_keys(\n    user_id: str,\n    redis=Depends(get_redis),",
        "async def get_keys(\n    request: Request,\n    user_id: str,\n    redis=Depends(get_redis),",
    )
    keys_src = keys_src.replace(
        "async def lookup_user(\n    username: str,\n    redis=Depends(get_redis),",
        "async def lookup_user(\n    request: Request,\n    username: str,\n    redis=Depends(get_redis),",
    )
    # Add Request import
    keys_src = keys_src.replace(
        "from fastapi import APIRouter, Depends, HTTPException, Header",
        "from fastapi import APIRouter, Depends, HTTPException, Header, Request",
    )
    with open(keys_path, "w") as f:
        f.write(keys_src)
    print("keys.py patched with rate limits")
else:
    print("keys.py already patched")

# ── backend/src/middleware/rateLimiter.js ──────────────────────────────────
rate_limiter_js = """\
"use strict";
/**
 * In-memory rate limiter for WebSocket messages.
 *
 * Limits:
 *   REGISTER  – 5 per hour  per IP
 *   MESSAGE   – 60 per minute per userId
 *   default   – 200 per minute per userId
 *
 * Uses a simple sliding-window counter backed by a Map.
 * For multi-server deployments swap this for a Redis-backed limiter.
 */

class RateLimiter {
  /**
   * @param {number} maxRequests  - maximum allowed in window
   * @param {number} windowMs     - window size in milliseconds
   */
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    /** @type {Map<string, {count: number, resetAt: number}>} */
    this.store = new Map();

    // Prune stale entries every 5 minutes to avoid memory leak
    setInterval(() => this._prune(), 5 * 60 * 1000).unref();
  }

  /**
   * Check whether `key` is within limit.
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
  check(key) {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + this.windowMs };
      this.store.set(key, entry);
      return { allowed: true, remaining: this.maxRequests - 1, resetAt: entry.resetAt };
    }

    entry.count += 1;
    const allowed = entry.count <= this.maxRequests;
    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  }

  _prune() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
  }
}

// Singleton limiters
const registrationLimiter = new RateLimiter(5,  60 * 60 * 1000); // 5 / hour  per IP
const messageLimiter      = new RateLimiter(60, 60 * 1000);       // 60 / min  per user
const defaultLimiter      = new RateLimiter(200, 60 * 1000);      // 200 / min per user

/**
 * Check rate limits for an incoming WebSocket packet.
 * Returns an error object { code, retryAfter } or null if allowed.
 *
 * @param {object} packet  - validated WebSocket packet
 * @param {string} remoteIp
 * @returns {{ code: string, retryAfter: number } | null}
 */
function checkRateLimit(packet, remoteIp) {
  let result;

  switch (packet.type) {
    case "REGISTER": {
      const key = `reg:${remoteIp}`;
      result = registrationLimiter.check(key);
      break;
    }
    case "MESSAGE": {
      const key = `msg:${packet.userId || remoteIp}`;
      result = messageLimiter.check(key);
      break;
    }
    default: {
      const key = `def:${packet.userId || remoteIp}`;
      result = defaultLimiter.check(key);
      break;
    }
  }

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return { code: "RATE_LIMITED", retryAfter };
  }
  return null;
}

module.exports = { checkRateLimit };
"""

os.makedirs(os.path.join(BASE_BE, "middleware"), exist_ok=True)
rl_path = os.path.join(BASE_BE, "middleware", "rateLimiter.js")
with open(rl_path, "w") as f:
    f.write(rate_limiter_js)
print("rateLimiter.js written")

# ── Write main.py ──────────────────────────────────────────────────────────
with open(os.path.join(BASE_KS, "main.py"), "w") as f:
    f.write(main_py)
print("main.py written")

# ── requirements.txt – add slowapi ─────────────────────────────────────────
req_path = "/home/boss/Documents/Projects/Whispro/key-server/requirements.txt"
with open(req_path) as f:
    req = f.read()
if "slowapi" not in req:
    req += "\nslowapi==0.1.9\n"
    with open(req_path, "w") as f:
        f.write(req)
    print("requirements.txt updated")
else:
    print("requirements.txt already has slowapi")

print("All files written.")
