"""Database engine, ORM models and the per-request session dependency."""

from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, String, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from app.config import get_settings


class Base(DeclarativeBase):
    pass


class PredictionLog(Base):
    """Every prediction served, so the model can be evaluated against results later."""

    __tablename__ = "prediction_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    home: Mapped[str] = mapped_column(String(60), index=True)
    away: Mapped[str] = mapped_column(String(60), index=True)
    p_home: Mapped[float] = mapped_column(Float)
    p_draw: Mapped[float] = mapped_column(Float)
    p_away: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(40))
    client: Mapped[str] = mapped_column(String(60))
    extra: Mapped[dict] = mapped_column(JSON, default=dict)


def make_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args)


_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = make_engine(get_settings().database_url)
    return _engine


def init_db(engine: Engine) -> None:
    # Fine for a small project. Larger ones manage schema changes with Alembic migrations.
    try:
        Base.metadata.create_all(engine)
    except OperationalError:
        # Another worker process created the tables at the same moment; now they exist.
        Base.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """One session per request, always closed afterwards."""
    with Session(get_engine()) as session:
        yield session
