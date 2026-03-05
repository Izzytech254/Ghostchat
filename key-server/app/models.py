"""
Pydantic models for key bundles.

All keys are base64url-encoded strings of the raw public key bytes.
Signatures are Ed25519 signatures over the signed pre-key public key.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator
import base64


def _is_valid_b64(v: str) -> bool:
    try:
        base64.urlsafe_b64decode(v + "==")
        return True
    except Exception:
        return False


class KeyBundleUpload(BaseModel):
    """Payload sent by a client to register / refresh their public keys."""
    user_id:            str = Field(..., min_length=8, max_length=128)
    username:           str = Field(..., min_length=2, max_length=32, description="Display name for user lookup")
    identity_key:       str = Field(..., description="Ed25519 public key (base64url)")
    signed_pre_key:     str = Field(..., description="X25519 public key (base64url)")
    signed_pre_key_id:  int = Field(..., ge=1)
    one_time_pre_keys:  list[str] = Field(default_factory=list, max_length=100)
    signature:          str = Field(
        ..., description="Ed25519 signature over signed_pre_key (base64url)"
    )

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip().lower()
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username must be alphanumeric (may include _ or -)")
        return v

    @field_validator("identity_key", "signed_pre_key", "signature")
    @classmethod
    def must_be_valid_base64(cls, v: str) -> str:
        if not _is_valid_b64(v):
            raise ValueError("Must be valid base64url encoded data")
        return v

    @field_validator("one_time_pre_keys")
    @classmethod
    def validate_otk_list(cls, keys: list[str]) -> list[str]:
        for k in keys:
            if not _is_valid_b64(k):
                raise ValueError(f"Invalid base64url in one_time_pre_keys: {k!r}")
        return keys


class KeyBundleResponse(BaseModel):
    """Keys returned to another user who wants to encrypt a message."""
    identity_key:       str
    signed_pre_key:     str
    signed_pre_key_id:  int
    signature:          str
    one_time_pre_key:   str | None = None


class UploadOTKRequest(BaseModel):
    """Upload additional one-time pre-keys without re-uploading identity/signed keys."""
    user_id:           str = Field(..., min_length=8, max_length=128)
    one_time_pre_keys: list[str] = Field(..., min_length=1, max_length=100)
