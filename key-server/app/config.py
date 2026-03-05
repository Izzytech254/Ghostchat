from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_HOST:       str = "localhost"
    REDIS_PORT:       int = 6379
    REDIS_PASSWORD:   str = ""
    REDIS_DB:         int = 0

    KEY_TTL_SECONDS:   int = 2_592_000   # 30 days
    MAX_ONE_TIME_KEYS: int = 100

    LOG_LEVEL: str = "info"

    # Space-separated list of allowed CORS origins.
    # Use "*" to allow all (dev only).
    ALLOWED_ORIGINS: List[str] = ["*"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _parse_origins(cls, v: object) -> List[str]:
        if isinstance(v, str):
            import json
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(o) for o in parsed]
            except json.JSONDecodeError:
                pass
            # Fallback: space- or comma-separated
            sep = "," if "," in v else " "
            return [o.strip() for o in v.split(sep) if o.strip()]
        return v  # type: ignore[return-value]


settings = Settings()
