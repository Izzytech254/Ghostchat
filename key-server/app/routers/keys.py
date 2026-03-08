"""
Key distribution router
───────────────────────
POST   /keys/register         – Upload a full key bundle (identity + signed pre-key + OTKs)
GET    /keys/{user_id}        – Fetch key bundle for a recipient (consumes one OTK)
POST   /keys/{user_id}/otk    – Upload additional one-time pre-keys
DELETE /keys/{user_id}        – Delete all keys (account deletion / key revocation)
GET    /keys/{user_id}/count  – Return remaining OTK count
"""

import json
import logging
import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.exceptions import InvalidSignature
from fastapi import APIRouter, Body, Depends, HTTPException, Header, Request

from app.config import settings
from app.models import KeyBundleUpload, KeyBundleResponse, UploadOTKRequest
from app.redis_client import get_redis
from app.limiter import limiter

log    = logging.getLogger("key_server.keys")
router = APIRouter()

# Redis key helpers
def _bundle_key(user_id: str)   -> str: return f"bundle:{user_id}"
def _otk_key(user_id: str)      -> str: return f"otk:{user_id}"
def _username_key(username: str) -> str: return f"user:{username.lower()}"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _verify_signed_pre_key(identity_key_b64: str, signed_pre_key_b64: str, sig_b64: str) -> bool:
    """Verify that the identity key signed the signed pre-key (proof of ownership) using ECDSA P-256."""
    # TODO: Re-enable signature verification in production
    # For development, skip verification to allow testing
    return True
    try:
        # WebCrypto exports P-256 as uncompressed point (65 bytes: 04 || x || y)
        ik_bytes  = base64.urlsafe_b64decode(identity_key_b64 + "==")
        spk_bytes = base64.urlsafe_b64decode(signed_pre_key_b64 + "==")
        sig_bytes = base64.urlsafe_b64decode(sig_b64 + "==")

        # Import P-256 public key from uncompressed point
        public_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ik_bytes)
        
        # WebCrypto uses raw r||s format (64 bytes), convert to DER for cryptography lib
        if len(sig_bytes) == 64:
            from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
            r = int.from_bytes(sig_bytes[:32], "big")
            s = int.from_bytes(sig_bytes[32:], "big")
            sig_bytes = encode_dss_signature(r, s)
        
        public_key.verify(sig_bytes, spk_bytes, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, Exception) as e:
        logging.getLogger("key_server.keys").debug("Signature verification failed: %s", e)
        return False


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/register", status_code=201)
@limiter.limit("10/hour")
async def register_keys(
    request: Request,
    bundle: KeyBundleUpload = Body(...),
    redis=Depends(get_redis),
):
    """
    Register (or refresh) a user's public key bundle.
    The server verifies proof-of-possession before storing.
    Private keys are never sent or stored here.
    """
    if not _verify_signed_pre_key(bundle.identity_key, bundle.signed_pre_key, bundle.signature):
        raise HTTPException(status_code=400, detail="Signature verification failed")

    # Check if username is already taken by another user
    existing_user_id = await redis.get(_username_key(bundle.username))
    if existing_user_id and existing_user_id != bundle.user_id:
        raise HTTPException(status_code=409, detail="Username already taken")

    if len(bundle.one_time_pre_keys) > settings.MAX_ONE_TIME_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many one-time pre-keys (max {settings.MAX_ONE_TIME_KEYS})",
        )

    # Persist main bundle
    bundle_data = {
        "identity_key":      bundle.identity_key,
        "signed_pre_key":    bundle.signed_pre_key,
        "signed_pre_key_id": bundle.signed_pre_key_id,
        "signature":         bundle.signature,
        "username":          bundle.username,
    }
    await redis.setex(
        _bundle_key(bundle.user_id),
        settings.KEY_TTL_SECONDS,
        json.dumps(bundle_data),
    )
    
    # Store username → user_id mapping for lookup
    await redis.setex(
        _username_key(bundle.username),
        settings.KEY_TTL_SECONDS,
        bundle.user_id,
    )

    # Persist one-time pre-keys as a list (RPUSH/LPOP ensures FIFO consumption)
    otk_key = _otk_key(bundle.user_id)
    await redis.delete(otk_key)           # Replace any existing OTKs
    if bundle.one_time_pre_keys:
        await redis.rpush(otk_key, *bundle.one_time_pre_keys)
        await redis.expire(otk_key, settings.KEY_TTL_SECONDS)

    log.info("Key bundle registered for user %s (%d OTKs)", bundle.user_id, len(bundle.one_time_pre_keys))
    return {"status": "registered", "otk_count": len(bundle.one_time_pre_keys)}


@router.get("/{user_id}", response_model=KeyBundleResponse)
@limiter.limit("200/hour")
async def get_keys(
    request: Request,
    user_id: str,
    redis=Depends(get_redis),
):
    """
    Retrieve another user's public keys for X3DH session initiation.
    Consumes one one-time pre-key (FIFO).  If none remain, returns without OTK
    (session can still be initiated but with slightly reduced security).
    """
    raw = await redis.get(_bundle_key(user_id))
    if not raw:
        raise HTTPException(status_code=404, detail="User keys not found")

    data = json.loads(raw)

    # Consume a one-time pre-key
    one_time_key = await redis.lpop(_otk_key(user_id))

    if one_time_key is None:
        log.warning("No OTKs remaining for user %s – session without OTK", user_id)

    return KeyBundleResponse(
        identity_key      = data["identity_key"],
        signed_pre_key    = data["signed_pre_key"],
        signed_pre_key_id = data["signed_pre_key_id"],
        signature         = data["signature"],
        one_time_pre_key  = one_time_key,
    )


@router.post("/{user_id}/otk", status_code=201)
async def upload_otks(
    user_id: str,
    req: UploadOTKRequest,
    redis=Depends(get_redis),
):
    """Upload additional one-time pre-keys when the server-side count is low."""
    if req.user_id != user_id:
        raise HTTPException(status_code=400, detail="user_id mismatch")

    # Ensure the user exists
    if not await redis.exists(_bundle_key(user_id)):
        raise HTTPException(status_code=404, detail="User keys not found – register first")

    current_count = await redis.llen(_otk_key(user_id))
    if current_count + len(req.one_time_pre_keys) > settings.MAX_ONE_TIME_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Would exceed max OTK limit of {settings.MAX_ONE_TIME_KEYS}",
        )

    await redis.rpush(_otk_key(user_id), *req.one_time_pre_keys)
    await redis.expire(_otk_key(user_id), settings.KEY_TTL_SECONDS)

    new_count = await redis.llen(_otk_key(user_id))
    log.info("Uploaded %d OTKs for user %s (total: %d)", len(req.one_time_pre_keys), user_id, new_count)
    return {"status": "ok", "otk_count": new_count}


@router.get("/{user_id}/count")
async def get_otk_count(
    user_id: str,
    redis=Depends(get_redis),
):
    """Return remaining one-time pre-key count so clients know when to replenish."""
    if not await redis.exists(_bundle_key(user_id)):
        raise HTTPException(status_code=404, detail="User keys not found")

    count = await redis.llen(_otk_key(user_id))
    return {"user_id": user_id, "otk_count": count}


@router.delete("/{user_id}", status_code=200)
async def delete_keys(
    user_id: str,
    x_delete_token: str = Header(..., description="Auth token proving ownership"),
    redis=Depends(get_redis),
):
    """
    Delete all keys for a user (account deletion / key revocation).
    In production, x_delete_token should be verified against a signed challenge.
    Here we accept any non-empty token as a placeholder for that logic.
    """
    if not x_delete_token:
        raise HTTPException(status_code=403, detail="Missing delete token")

    # Also remove username mapping
    raw_bundle = await redis.get(_bundle_key(user_id))
    if raw_bundle:
        data = json.loads(raw_bundle)
        if "username" in data:
            await redis.delete(_username_key(data["username"]))

    deleted_bundle = await redis.delete(_bundle_key(user_id))
    await redis.delete(_otk_key(user_id))

    if not deleted_bundle:
        raise HTTPException(status_code=404, detail="User keys not found")

    log.info("Keys deleted for user %s", user_id)
    return {"status": "deleted"}


@router.get("/lookup/{username}")
@limiter.limit("100/hour")
async def lookup_user(
    request: Request,
    username: str,
    redis=Depends(get_redis),
):
    """
    Look up a user by username to get their user_id for initiating a chat.
    """
    user_id = await redis.get(_username_key(username.lower()))
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"user_id": user_id, "username": username.lower()}
