"""Settings, read from environment variables (or a .env file) with pydantic-settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Match Predictions API"
    database_url: str = "sqlite:///./predictions.db"
    model_file: str = "models/match_model.joblib"
    # Comma-separated SHA-256 hashes of valid API keys. Generate one with:
    #   python -m app.security my-secret-key
    # The default accepts the key "dev-key" so the app works out of the box; set your own in production.
    api_key_hashes: str = Field(default="7e9f8fd111802be56c379d597842e29b2cebd35ff2133d431a49fa556a18704e")
    max_batch_size: int = 100

    @property
    def api_key_hash_set(self) -> set[str]:
        return {h.strip() for h in self.api_key_hashes.split(",") if h.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
