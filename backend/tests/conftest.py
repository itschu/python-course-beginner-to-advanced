import httpx
import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.db import Base, get_session
from app.main import create_app
from app.ml import GoalModel
from app.security import hash_key
from training.train_model import train

TEST_KEY = "test-key-123"


@pytest.fixture(scope="session")
def goal_model() -> GoalModel:
    """Train once per test run, on the bundled data."""
    matches = pd.read_csv("data/matches.csv", parse_dates=["Date"])
    return GoalModel(train(matches))


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def engine():
    """A fresh in-memory database for every test."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
async def client(goal_model, engine):
    app = create_app(model=goal_model, create_tables=False)

    def test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    app.dependency_overrides[get_settings] = lambda: Settings(api_key_hashes=hash_key(TEST_KEY), max_batch_size=5)

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


@pytest.fixture
def auth() -> dict:
    return {"X-API-Key": TEST_KEY}
