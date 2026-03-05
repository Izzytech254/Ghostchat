"""
Key server tests – uses HTTPX async test client + in-memory fake Redis.
No real Redis or network connections required.
"""
from __future__ import annotations

import base64
import pytest
import pytest_asyncio
from contextlib import asynccontextmanager
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock

# ── Helpers ────────────────────────────────────────────────────────────────────

def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


import os

def make_bundle(user_id: str = "user_abc123xy") -> dict:
    ik  = b64(os.urandom(32))
    spk = b64(os.urandom(32))
    sig = b64(os.urandom(64))
    return {
        "user_id":            user_id,
        "identity_key":       ik,
        "signed_pre_key":     spk,
        "signed_pre_key_id":  1,
        "one_time_pre_keys":  [b64(os.urandom(32)) for _ in range(3)],
        "signature":          sig,
    }


# ── In-memory fake Redis ───────────────────────────────────────────────────────

class FakeRedis:
    """Synchronous-under-the-hood fake that exposes async methods."""

    def __init__(self):
        self._store: dict[str, object] = {}
        self._expiries: dict[str, int] = {}

    async def setex(self, key, ttl, value):
        self._store[key] = value
        self._expiries[key] = ttl

    async def get(self, key):
        return self._store.get(key)

    async def exists(self, *keys):
        return sum(1 for k in keys if k in self._store)

    async def delete(self, *keys):
        count = 0
        for k in keys:
            if k in self._store:
                del self._store[k]
                count += 1
        return count

    async def rpush(self, key, *values):
        if key not in self._store:
            self._store[key] = []
        self._store[key].extend(values)  # type: ignore[attr-defined]
        return len(self._store[key])     # type: ignore[arg-type]

    async def lpop(self, key):
        lst = self._store.get(key, [])
        if lst:
            val = lst[0]          # type: ignore[index]
            self._store[key] = lst[1:]  # type: ignore[index]
            return val
        return None

    async def llen(self, key):
        return len(self._store.get(key, []))  # type: ignore[arg-type]

    async def expire(self, key, ttl):
        self._expiries[key] = ttl

    async def set(self, key, value):
        self._store[key] = value

    async def aclose(self):
        pass


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest_asyncio.fixture
async def client(fake_redis):
    """HTTPX async test client wired to a fake Redis (no network)."""

    # Patch: bypass signature verification + replace Redis + no-op lifespan
    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    import app.main as main_module
    original_lifespan = main_module.app.router.lifespan_context

    # Build a fresh app instance for each test to avoid state leakage
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from app.routers import keys

    test_app = FastAPI(lifespan=_noop_lifespan)
    test_app.add_middleware(CORSMiddleware, allow_origins=["*"],
                            allow_methods=["*"], allow_headers=["*"])
    test_app.include_router(keys.router, prefix="/keys", tags=["keys"])

    @test_app.get("/health")
    async def health():
        return {"status": "ok"}

    async def _get_fake_redis():
        return fake_redis

    # Override the get_redis dependency
    from app.redis_client import get_redis
    test_app.dependency_overrides[get_redis] = _get_fake_redis

    with patch("app.routers.keys._verify_signed_pre_key", return_value=True):
        async with AsyncClient(
            transport=ASGITransport(app=test_app), base_url="http://test"
        ) as c:
            yield c


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_register_keys(client):
    bundle = make_bundle()
    r = await client.post("/keys/register", json=bundle)
    assert r.status_code == 201
    assert r.json()["otk_count"] == 3


@pytest.mark.asyncio
async def test_get_keys_consumes_otk(client):
    bundle = make_bundle(user_id="fetch_user1234")
    await client.post("/keys/register", json=bundle)

    r = await client.get("/keys/fetch_user1234")
    assert r.status_code == 200
    data = r.json()
    assert data["identity_key"]   == bundle["identity_key"]
    assert data["signed_pre_key"] == bundle["signed_pre_key"]
    assert data["one_time_pre_key"] is not None      # first OTK consumed

    # Second fetch returns a different OTK
    r2 = await client.get("/keys/fetch_user1234")
    assert r2.json()["one_time_pre_key"] != data["one_time_pre_key"]


@pytest.mark.asyncio
async def test_get_keys_not_found(client):
    r = await client.get("/keys/ghost_nobody_xyz")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_upload_otk(client):
    bundle = make_bundle(user_id="otk_user_abcd")
    await client.post("/keys/register", json=bundle)

    extra_keys = [b64(os.urandom(32)) for _ in range(5)]

    r = await client.post("/keys/otk_user_abcd/otk", json={
        "user_id": "otk_user_abcd",
        "one_time_pre_keys": extra_keys,
    })
    assert r.status_code == 201
    assert r.json()["otk_count"] == 8   # 3 original + 5 new


@pytest.mark.asyncio
async def test_delete_keys(client):
    bundle = make_bundle(user_id="del_user_wxyz")
    await client.post("/keys/register", json=bundle)

    r = await client.delete("/keys/del_user_wxyz", headers={"x-delete-token": "valid-token"})
    assert r.status_code == 200

    r2 = await client.get("/keys/del_user_wxyz")
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_delete_missing_token(client):
    r = await client.delete("/keys/someone")
    assert r.status_code in (422, 403)
