"""API-key authentication.

Clients send their key in the X-API-Key header. Only SHA-256 hashes of valid keys are configured
(keys are long and random, so a fast hash is fine here; passwords need a slow hash like bcrypt).
"""

import hashlib
import hmac
import sys

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.config import Settings, get_settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def require_api_key(
    key: str | None = Security(api_key_header),
    settings: Settings = Depends(get_settings),
) -> str:
    """Returns a short, non-secret client label for logging, or raises 401."""
    if key:
        digest = hash_key(key)
        for valid in settings.api_key_hash_set:
            if hmac.compare_digest(digest, valid):
                return f"key:{digest[:8]}"
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API key",
        headers={"WWW-Authenticate": "API-Key"},
    )


if __name__ == "__main__":
    # python -m app.security my-secret-key  ->  prints the hash to put in API_KEY_HASHES
    if len(sys.argv) != 2:
        sys.exit("usage: python -m app.security <api-key>")
    print(hash_key(sys.argv[1]))
