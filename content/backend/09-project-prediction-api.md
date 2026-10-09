---
title: "Project: a match-prediction API"
summary: Build a complete prediction service - validated schemas, a prediction log in a database, API-key protection, single and batch endpoints, and tests - first in the browser, then run the finished companion project on your machine and in Docker.
minutes: 150
kind: project
---

Time to put Phase 8 together, and connect it to everything before it. You'll build the service a betting app or trading bot would call: send two teams, get calibrated probabilities and fair odds back, with every prediction logged so the model can be evaluated later.

The finished version lives in the course repository as the **companion project** in `backend/`, laid out like a real codebase with tests and a Dockerfile. Here you'll build its core in three tested steps, then run the real thing.

## The design

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | public | Status and model version, for the hosting platform's health checks |
| `GET /teams` | public | Teams the model knows |
| `GET /predictions?home=…&away=…` | API key | One prediction, logged |
| `POST /predictions/batch` | API key | Up to N fixtures in one request, logged |
| `GET /predictions/log?limit=…` | API key | Most recent logged predictions |

## Step 1: The request schemas

:::exercise api-schemas Fixture and batch schemas
Write two Pydantic models:

- `Fixture` with `home` and `away`, each a string of 1 to 60 characters, and a model validator that rejects a fixture where both are the same team (`ValueError("a team can't play itself")`).
- `BatchRequest` with `fixtures`, a list of `Fixture` with at least one item.

@@starter
from pydantic import BaseModel, Field, model_validator

class Fixture(BaseModel):
    pass

class BatchRequest(BaseModel):
    pass

@@solution
from pydantic import BaseModel, Field, model_validator

class Fixture(BaseModel):
    home: str = Field(min_length=1, max_length=60)
    away: str = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def different_teams(self):
        if self.home == self.away:
            raise ValueError("a team can't play itself")
        return self

class BatchRequest(BaseModel):
    fixtures: list[Fixture] = Field(min_length=1)

@@tests
from pydantic import ValidationError

def invalid(model, data):
    try:
        model.model_validate(data)
    except ValidationError:
        return True
    return False

def test_fixture():
    """Valid fixtures pass; empty, long and identical names fail"""
    f = Fixture(home="Ashford City", away="Bramley Rovers")
    assert (f.home, f.away) == ("Ashford City", "Bramley Rovers")
    assert invalid(Fixture, {"home": "", "away": "Bramley Rovers"})
    assert invalid(Fixture, {"home": "x" * 61, "away": "Bramley Rovers"})
    assert invalid(Fixture, {"home": "Ashford City", "away": "Ashford City"})

def test_batch():
    """At least one fixture, each validated"""
    b = BatchRequest.model_validate({"fixtures": [{"home": "A", "away": "B"}, {"home": "C", "away": "D"}]})
    assert len(b.fixtures) == 2 and b.fixtures[1].away == "D"
    assert invalid(BatchRequest, {"fixtures": []})
    assert invalid(BatchRequest, {"fixtures": [{"home": "A", "away": "A"}]})
:::

## Step 2: The prediction log

:::exercise api-log Logging predictions
Using SQLAlchemy, define `PredictionLog` (table `"prediction_log"`) with an integer primary key `id` and columns `home` and `away` (strings), `p_home`, `p_draw` and `p_away` (floats), `model_version` and `client` (strings). Then write:

- `log_predictions(session, predictions, version, client)`: `predictions` is a list of dicts with keys `home`, `away`, `p_home`, `p_draw`, `p_away`. Add one row per prediction and commit.
- `recent(session, limit)`: the `limit` most recent rows (highest `id` first), as a list of `PredictionLog` objects.

@@starter
from sqlalchemy import String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

class Base(DeclarativeBase):
    pass

def log_predictions(session, predictions, version, client):
    pass

def recent(session, limit):
    return []

@@solution
from sqlalchemy import String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

class Base(DeclarativeBase):
    pass

class PredictionLog(Base):
    __tablename__ = "prediction_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    home: Mapped[str] = mapped_column(String(60))
    away: Mapped[str] = mapped_column(String(60))
    p_home: Mapped[float]
    p_draw: Mapped[float]
    p_away: Mapped[float]
    model_version: Mapped[str] = mapped_column(String(40))
    client: Mapped[str] = mapped_column(String(60))

def log_predictions(session, predictions, version, client):
    session.add_all([PredictionLog(model_version=version, client=client, **p) for p in predictions])
    session.commit()

def recent(session, limit):
    return list(session.scalars(select(PredictionLog).order_by(PredictionLog.id.desc()).limit(limit)))

@@tests
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

def fresh_session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return Session(engine)

def preds(*pairs):
    return [{"home": h, "away": a, "p_home": 0.5, "p_draw": 0.25, "p_away": 0.25} for h, a in pairs]

def test_log_and_read_back():
    """Rows are stored with version and client, newest first"""
    session = fresh_session()
    log_predictions(session, preds(("A", "B"), ("C", "D")), "poisson-1", "bot")
    log_predictions(session, preds(("E", "F")), "poisson-2", "app")
    rows = recent(session, 10)
    assert [r.home for r in rows] == ["E", "C", "A"]
    assert rows[0].model_version == "poisson-2" and rows[2].client == "bot" and rows[1].p_draw == 0.25

def test_limit():
    """Only the most recent rows"""
    session = fresh_session()
    log_predictions(session, preds(*[(f"H{i}", f"A{i}") for i in range(5)]), "v", "c")
    assert [r.home for r in recent(session, 2)] == ["H4", "H3"]
:::

## Step 3: The API

Now wire it together. The starter contains finished versions of steps 1 and 2 and a `require_key` helper; the tests use a small stand-in model so they're fast and predictable.

:::exercise api-app The prediction service
Write `create_app(model, engine, key_hashes, max_batch=100)` returning a FastAPI app. `model` has `.version`, `.teams` (a list) and `.predict(fixtures)`, which takes a list of `(home, away)` tuples and returns a list of dicts with `home`, `away`, `p_home`, `p_draw` and `p_away`. Endpoints (all `async def`):

- `GET /health` → `{"status": "ok", "model_version": model.version}`
- `GET /teams` → `model.teams`
- `GET /predictions?home=…&away=…` → one prediction dict plus `"model_version"`
- `POST /predictions/batch` with a `BatchRequest` body → a list of those dicts; **422** if there are more than `max_batch` fixtures
- `GET /predictions/log?limit=…` (default 20) → recent rows as dicts with `home`, `away`, `p_home`, `p_draw`, `p_away` and `model_version`

The three `/predictions` endpoints require a valid `X-API-Key` (use `Depends` with the provided `require_key(key_hashes)`), respond **404** if a team isn't in `model.teams`, **422** if home equals away, and log every prediction with `log_predictions(session, predictions, model.version, client)` using a `Session(engine)`.

@@starter
import hashlib

from fastapi import Depends, FastAPI, HTTPException, Query, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

# ---- Step 1 (done) ----
class Fixture(BaseModel):
    home: str = Field(min_length=1, max_length=60)
    away: str = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def different_teams(self):
        if self.home == self.away:
            raise ValueError("a team can't play itself")
        return self

class BatchRequest(BaseModel):
    fixtures: list[Fixture] = Field(min_length=1)

# ---- Step 2 (done) ----
class Base(DeclarativeBase):
    pass

class PredictionLog(Base):
    __tablename__ = "prediction_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    home: Mapped[str] = mapped_column(String(60))
    away: Mapped[str] = mapped_column(String(60))
    p_home: Mapped[float]
    p_draw: Mapped[float]
    p_away: Mapped[float]
    model_version: Mapped[str] = mapped_column(String(40))
    client: Mapped[str] = mapped_column(String(60))

def log_predictions(session, predictions, version, client):
    session.add_all([PredictionLog(model_version=version, client=client, **p) for p in predictions])
    session.commit()

def recent(session, limit):
    return list(session.scalars(select(PredictionLog).order_by(PredictionLog.id.desc()).limit(limit)))

# ---- Auth helper (done) ----
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def require_key(key_hashes):
    async def check(key: str | None = Security(api_key_header)) -> str:
        digest = hashlib.sha256(key.encode()).hexdigest() if key else None
        if digest not in key_hashes:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")
        return "key:" + digest[:8]
    return check

# ---- Step 3: your code ----
def create_app(model, engine, key_hashes, max_batch=100):
    app = FastAPI()
    return app

@@solution
import hashlib

from fastapi import Depends, FastAPI, HTTPException, Query, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

# ---- Step 1 (done) ----
class Fixture(BaseModel):
    home: str = Field(min_length=1, max_length=60)
    away: str = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def different_teams(self):
        if self.home == self.away:
            raise ValueError("a team can't play itself")
        return self

class BatchRequest(BaseModel):
    fixtures: list[Fixture] = Field(min_length=1)

# ---- Step 2 (done) ----
class Base(DeclarativeBase):
    pass

class PredictionLog(Base):
    __tablename__ = "prediction_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    home: Mapped[str] = mapped_column(String(60))
    away: Mapped[str] = mapped_column(String(60))
    p_home: Mapped[float]
    p_draw: Mapped[float]
    p_away: Mapped[float]
    model_version: Mapped[str] = mapped_column(String(40))
    client: Mapped[str] = mapped_column(String(60))

def log_predictions(session, predictions, version, client):
    session.add_all([PredictionLog(model_version=version, client=client, **p) for p in predictions])
    session.commit()

def recent(session, limit):
    return list(session.scalars(select(PredictionLog).order_by(PredictionLog.id.desc()).limit(limit)))

# ---- Auth helper (done) ----
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def require_key(key_hashes):
    async def check(key: str | None = Security(api_key_header)) -> str:
        digest = hashlib.sha256(key.encode()).hexdigest() if key else None
        if digest not in key_hashes:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")
        return "key:" + digest[:8]
    return check

# ---- Step 3 ----
def create_app(model, engine, key_hashes, max_batch=100):
    app = FastAPI()
    auth = require_key(key_hashes)

    async def get_session():
        with Session(engine) as session:
            yield session

    def predict_and_log(fixtures, session, client):
        unknown = sorted({t for f in fixtures for t in (f.home, f.away) if t not in model.teams})
        if unknown:
            raise HTTPException(status_code=404, detail=f"Unknown team(s): {', '.join(unknown)}")
        predictions = model.predict([(f.home, f.away) for f in fixtures])
        log_predictions(session, predictions, model.version, client)
        return [{**p, "model_version": model.version} for p in predictions]

    @app.get("/health")
    async def health():
        return {"status": "ok", "model_version": model.version}

    @app.get("/teams")
    async def teams():
        return model.teams

    @app.get("/predictions")
    async def predict(home: str, away: str, session: Session = Depends(get_session), client: str = Depends(auth)):
        if home == away:
            raise HTTPException(status_code=422, detail="A team can't play itself")
        return predict_and_log([Fixture(home=home, away=away)], session, client)[0]

    @app.post("/predictions/batch")
    async def predict_batch(body: BatchRequest, session: Session = Depends(get_session), client: str = Depends(auth)):
        if len(body.fixtures) > max_batch:
            raise HTTPException(status_code=422, detail=f"At most {max_batch} fixtures per request")
        return predict_and_log(body.fixtures, session, client)

    @app.get("/predictions/log")
    async def prediction_log(limit: int = Query(20, ge=1, le=200), session: Session = Depends(get_session),
                             client: str = Depends(auth)):
        return [{"home": r.home, "away": r.away, "p_home": r.p_home, "p_draw": r.p_draw, "p_away": r.p_away,
                 "model_version": r.model_version} for r in recent(session, limit)]

    return app

@@tests
import hashlib

import httpx
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

class StandIn:
    version = "stand-in-1"
    teams = ["Ashford City", "Bramley Rovers", "Castleton United"]

    def predict(self, fixtures):
        return [{"home": h, "away": a, "p_home": 0.5, "p_draw": 0.3, "p_away": 0.2} for h, a in fixtures]

KEY = "pp_test_key"

def build(max_batch=3):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    app = create_app(StandIn(), engine, {hashlib.sha256(KEY.encode()).hexdigest()}, max_batch=max_batch)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

AUTH = {"X-API-Key": KEY}

async def test_public_endpoints():
    """Health and teams need no key"""
    async with build() as c:
        assert (await c.get("/health")).json() == {"status": "ok", "model_version": "stand-in-1"}
        assert (await c.get("/teams")).json() == StandIn.teams

async def test_auth_required():
    """Prediction endpoints reject missing and wrong keys"""
    async with build() as c:
        assert (await c.get("/predictions", params={"home": "Ashford City", "away": "Bramley Rovers"})).status_code == 401
        assert (await c.get("/predictions/log", headers={"X-API-Key": "nope"})).status_code == 401

async def test_single_prediction_is_logged():
    """One prediction, with the version, then visible in the log"""
    async with build() as c:
        r = await c.get("/predictions", params={"home": "Ashford City", "away": "Bramley Rovers"}, headers=AUTH)
        assert r.status_code == 200
        assert r.json() == {"home": "Ashford City", "away": "Bramley Rovers", "p_home": 0.5, "p_draw": 0.3,
                            "p_away": 0.2, "model_version": "stand-in-1"}
        log = (await c.get("/predictions/log", headers=AUTH)).json()
        assert len(log) == 1 and log[0]["home"] == "Ashford City" and log[0]["model_version"] == "stand-in-1"

async def test_errors():
    """Unknown teams 404; same team 422"""
    async with build() as c:
        assert (await c.get("/predictions", params={"home": "Ashford City", "away": "Real Madrid"}, headers=AUTH)).status_code == 404
        assert (await c.get("/predictions", params={"home": "Ashford City", "away": "Ashford City"}, headers=AUTH)).status_code == 422

async def test_batch():
    """Batches are predicted, logged newest first, and capped"""
    async with build(max_batch=3) as c:
        fixtures = [{"home": "Ashford City", "away": "Bramley Rovers"}, {"home": "Castleton United", "away": "Ashford City"}]
        r = await c.post("/predictions/batch", json={"fixtures": fixtures}, headers=AUTH)
        assert r.status_code == 200 and [p["home"] for p in r.json()] == ["Ashford City", "Castleton United"]
        log = (await c.get("/predictions/log", params={"limit": 1}, headers=AUTH)).json()
        assert [row["home"] for row in log] == ["Castleton United"]
        too_many = await c.post("/predictions/batch", json={"fixtures": fixtures * 2}, headers=AUTH)
        assert too_many.status_code == 422
        unknown = await c.post("/predictions/batch", json={"fixtures": [{"home": "Ashford City", "away": "Nowhere FC"}]}, headers=AUTH)
        assert unknown.status_code == 404
:::

## Step 4: Plug in the real model

Your `create_app` works with any object that has `version`, `teams` and `predict`. Here it is with the real Poisson goal model, trained on the course data. Paste your `create_app` (and the code above it) into this cell, or use the reference version included:

```python
import hashlib

import httpx
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field, model_validator
from scipy import stats
from sklearn.linear_model import PoissonRegressor
from sqlalchemy import String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

# ---- the real model ----
class GoalModel:
    def __init__(self, matches):
        self.teams = sorted(matches["HomeTeam"].unique())
        self.index = {t: i for i, t in enumerate(self.teams)}
        self.version = f"poisson-{matches['Date'].max():%Y%m%d}"
        X_home, X_away = self.design(matches["HomeTeam"], matches["AwayTeam"])
        w = np.exp(-0.004 * (matches["Date"].max() - matches["Date"]).dt.days.to_numpy())
        self.model = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(
            np.vstack([X_home, X_away]), np.concatenate([matches["FTHG"], matches["FTAG"]]), sample_weight=np.concatenate([w, w]))

    def design(self, homes, aways):
        n, T = len(homes), len(self.teams)
        h, a, rows = np.array([self.index[t] for t in homes]), np.array([self.index[t] for t in aways]), np.arange(len(homes))
        X_home, X_away = np.zeros((n, 2 * T + 1)), np.zeros((n, 2 * T + 1))
        X_home[rows, h] = 1; X_home[rows, T + a] = 1; X_home[:, -1] = 1
        X_away[rows, a] = 1; X_away[rows, T + h] = 1
        return X_home, X_away

    def predict(self, fixtures):
        X_home, X_away = self.design([h for h, _ in fixtures], [a for _, a in fixtures])
        out = []
        for (home, away), lh, la in zip(fixtures, self.model.predict(X_home), self.model.predict(X_away)):
            grid = np.outer(stats.poisson(lh).pmf(np.arange(11)), stats.poisson(la).pmf(np.arange(11)))
            grid /= grid.sum()
            out.append({"home": home, "away": away, "p_home": round(float(np.tril(grid, -1).sum()), 4),
                        "p_draw": round(float(np.trace(grid)), 4), "p_away": round(float(np.triu(grid, 1).sum()), 4)})
        return out

# ---- steps 1-3 (reference versions) ----
class Fixture(BaseModel):
    home: str = Field(min_length=1, max_length=60)
    away: str = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def different_teams(self):
        if self.home == self.away:
            raise ValueError("a team can't play itself")
        return self

class BatchRequest(BaseModel):
    fixtures: list[Fixture] = Field(min_length=1)

class Base(DeclarativeBase):
    pass

class PredictionLog(Base):
    __tablename__ = "prediction_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    home: Mapped[str] = mapped_column(String(60))
    away: Mapped[str] = mapped_column(String(60))
    p_home: Mapped[float]
    p_draw: Mapped[float]
    p_away: Mapped[float]
    model_version: Mapped[str] = mapped_column(String(40))
    client: Mapped[str] = mapped_column(String(60))

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def create_app(model, engine, key_hashes, max_batch=100):
    app = FastAPI(title="Match predictions")

    async def get_session():
        with Session(engine) as session:
            yield session

    async def auth(key: str | None = Security(api_key_header)) -> str:
        digest = hashlib.sha256(key.encode()).hexdigest() if key else None
        if digest not in key_hashes:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")
        return "key:" + digest[:8]

    def predict_and_log(fixtures, session, client):
        unknown = sorted({t for f in fixtures for t in (f.home, f.away) if t not in model.teams})
        if unknown:
            raise HTTPException(status_code=404, detail=f"Unknown team(s): {', '.join(unknown)}")
        predictions = model.predict([(f.home, f.away) for f in fixtures])
        session.add_all([PredictionLog(model_version=model.version, client=client, **p) for p in predictions])
        session.commit()
        return [{**p, "model_version": model.version} for p in predictions]

    @app.get("/health")
    async def health():
        return {"status": "ok", "model_version": model.version}

    @app.get("/predictions")
    async def predict(home: str, away: str, session: Session = Depends(get_session), client: str = Depends(auth)):
        if home == away:
            raise HTTPException(status_code=422, detail="A team can't play itself")
        return predict_and_log([Fixture(home=home, away=away)], session, client)[0]

    @app.post("/predictions/batch")
    async def predict_batch(body: BatchRequest, session: Session = Depends(get_session), client: str = Depends(auth)):
        if len(body.fixtures) > max_batch:
            raise HTTPException(status_code=422, detail=f"At most {max_batch} fixtures per request")
        return predict_and_log(body.fixtures, session, client)

    @app.get("/predictions/log")
    async def prediction_log(limit: int = Query(20, ge=1, le=200), session: Session = Depends(get_session),
                             client: str = Depends(auth)):
        rows = session.scalars(select(PredictionLog).order_by(PredictionLog.id.desc()).limit(limit))
        return [{"home": r.home, "away": r.away, "p_home": r.p_home, "model_version": r.model_version} for r in rows]

    return app

# ---- run it ----
model = GoalModel(pd.read_csv("data/matches.csv", parse_dates=["Date"]))
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
app = create_app(model, engine, {hashlib.sha256(b"my-secret-key").hexdigest()})
headers = {"X-API-Key": "my-secret-key"}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    print((await client.get("/health")).json())
    r = await client.get("/predictions", params={"home": "Fairhaven FC", "away": "Lakeside Rangers"}, headers=headers)
    print(r.json())
    fixtures = [{"home": "Ashford City", "away": "Bramley Rovers"}, {"home": "Riverside United", "away": "Thornbury Athletic"}]
    for p in (await client.post("/predictions/batch", json={"fixtures": fixtures}, headers=headers)).json():
        print(f"{p['home']:>17} v {p['away']:<19} H {p['p_home']:.3f}  D {p['p_draw']:.3f}  A {p['p_away']:.3f}  fair home odds {1 / p['p_home']:.2f}")
    print("log:", (await client.get("/predictions/log", headers=headers)).json())
```

## Step 5: Run the companion project

The `backend/` folder of the course repository is the same service, organised for real use:

```text
backend/
  app/main.py              create_app(): lifespan loads the model, middleware, routers
  app/config.py            settings from environment variables (pydantic-settings)
  app/db.py                SQLAlchemy engine, PredictionLog, get_session dependency
  app/ml.py                GoalModel, with feature code shared by training and serving
  app/schemas.py           Pydantic request/response models
  app/security.py          API-key dependency
  app/routers/             /health and /teams; /predictions endpoints
  training/train_model.py  trains and saves the model bundle
  tests/                   pytest suite (fresh database per test, dependency overrides)
  Dockerfile               trains the model into a slim, non-root image with a health check
```

On your machine:

```bash
git clone https://github.com/itschu/python-course-beginner-to-advanced.git
cd python-course-beginner-to-advanced/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m training.train_model
pytest -q
uvicorn app.main:app --reload            # then open http://localhost:8000/docs
```

Click **Authorize** in the docs page, enter the development key `dev-key`, and try the endpoints. Then build and run the container:

```bash
docker build -t match-api .
docker run -p 8000:8000 match-api
```

Two differences from the browser version are worth noticing in the code:

- The prediction endpoints are plain `def`, so on a real server FastAPI runs them in a thread pool while the event loop handles other requests.
- The model is loaded in the lifespan handler and trained by a separate script (or during the Docker build), never per request.

## Extensions

1. **Results and live evaluation.** Add `POST /results` to record final scores, and `GET /metrics` that computes the log loss of logged predictions against results, per model version.
2. **Value bets.** Add an endpoint that takes bookmaker odds for a fixture and returns any outcome with positive expected value, using Phase 6's blending and staking rules.
3. **PostgreSQL.** Run it with Docker Compose and a PostgreSQL service, and manage the schema with Alembic migrations.
4. **Deploy it** to Render, Railway or Fly.io with a managed database, a real API key, and the health check pointing at `/health`.

:::tip Portfolio piece
A deployed, tested, documented API serving a model you trained and evaluated yourself is one of the strongest portfolio projects there is: it shows ML, software engineering and operations in one place. Link the live `/docs` page and the repository from your CV.
:::
