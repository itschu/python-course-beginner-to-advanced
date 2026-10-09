---
title: "Checkpoint: Python for the Backend"
summary: HTTP, FastAPI, validation, databases, security, testing and serving models, in one test.
minutes: 75
kind: checkpoint
---

**Passing standard:** all three exercises pass and you score at least 9/12 on the quiz.

:::quiz phase8-final Phase 8 quiz
? A client creates a new bet successfully. Which status code fits best?
- [ ] 200 OK
- [x] 201 Created
- [ ] 204 No Content
> 201 for a newly created resource; 204 for success with no body (such as a delete).

? Which request should never change data on the server?
- [x] GET
- [ ] POST
- [ ] PATCH
> GETs must be safe to repeat, cache and prefetch.

? An endpoint is declared `async def get_match(match_id: int)`. What does a request to `/matches/seven` get?
- [x] A 422 response, without the function running
- [ ] A 404 response
- [ ] The function runs with `match_id="seven"`
> Path and query parameters are validated against their type hints.

? Why define separate input and output Pydantic models for users?
- [x] So fields like password hashes can never appear in responses
- [ ] Pydantic requires two models per resource
- [ ] It makes requests faster
> The response model controls exactly what leaves the server.

? Which line is safe from SQL injection?
- [ ] `conn.execute(f"SELECT * FROM bets WHERE user = '{name}'")`
- [x] `conn.execute("SELECT * FROM bets WHERE user = ?", (name,))`
- [ ] `conn.execute("SELECT * FROM bets WHERE user = '" + name + "'")`
> Parameters are sent as values, never as SQL.

? What's the right way to store user passwords?
- [x] A slow, salted hash such as bcrypt or Argon2
- [ ] Encrypted with a key kept in the code
- [ ] SHA-256 of the password
> Slow and salted makes stolen hashes very expensive to crack.

? A logged-in user who isn't an admin calls an admin endpoint. The response should be:
- [ ] 401 Unauthorized
- [x] 403 Forbidden
- [ ] 500 Internal Server Error
> 401 means "who are you?"; 403 means "I know who you are, and no".

? Why is it useful to provide the database session through a dependency (`Depends(get_session)`)?
- [x] Each request gets its own session, closed afterwards, and tests can override it with a test database
- [ ] It makes queries run in parallel
- [ ] FastAPI can't open databases any other way
> Dependencies give clean resource management and easy testing.

? Where should an ML model be loaded in a FastAPI service?
- [x] Once, in the lifespan handler at startup
- [ ] Inside each prediction endpoint
- [ ] In the client
> Loading per request would make every prediction slow.

? What does CORS protect against?
- [x] Malicious web pages making a user's browser read your API's responses
- [ ] All unauthorised access to your API
- [ ] SQL injection
> It's enforced by browsers only; protected endpoints still need authentication.

? Why should every prediction response include the model version?
- [x] So predictions can be traced back to the exact model when monitoring or after retraining
- [ ] Clients need it to compute probabilities
- [ ] It's required by OpenAPI
> Essential for comparing versions and debugging.

? Your API runs in a container on a hosting platform with a SQLite file for storage. What's the main risk?
- [x] Data is lost whenever the container is replaced, such as on each deploy
- [ ] SQLite can't handle more than ten rows
- [ ] Containers can't use SQLite
> Use a managed database (or at least a persistent volume) in production.
:::

:::exercise cp8-crud A small CRUD API
Create `app` with an in-memory store for **watchlist** items (teams a user wants to follow), using a Pydantic model `WatchIn` with `team` (string, 1–60 characters) and `note` (string, default `""`, at most 200 characters):

- `POST /watchlist` → store the item with an `id` (1, 2, 3, …) and return it with status **201**; respond **409** if that team is already on the list.
- `GET /watchlist` → all items, in the order they were added.
- `DELETE /watchlist/{item_id}` → **204** on success, **404** if there's no such item.

@@starter
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI()

@@solution
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

app = FastAPI()
ITEMS: dict[int, dict] = {}
NEXT_ID = {"value": 1}

class WatchIn(BaseModel):
    team: str = Field(min_length=1, max_length=60)
    note: str = Field("", max_length=200)

@app.post("/watchlist", status_code=status.HTTP_201_CREATED)
async def add(item: WatchIn):
    if any(existing["team"] == item.team for existing in ITEMS.values()):
        raise HTTPException(status_code=409, detail="Team already on the watchlist")
    item_id = NEXT_ID["value"]
    NEXT_ID["value"] += 1
    ITEMS[item_id] = {"id": item_id, **item.model_dump()}
    return ITEMS[item_id]

@app.get("/watchlist")
async def list_items():
    return list(ITEMS.values())

@app.delete("/watchlist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(item_id: int):
    if item_id not in ITEMS:
        raise HTTPException(status_code=404, detail="Not found")
    del ITEMS[item_id]

@@tests
import httpx

def client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

async def test_full_flow():
    """Create, list, conflict, delete"""
    async with client() as c:
        r1 = await c.post("/watchlist", json={"team": "Fairhaven FC", "note": "strong at home"})
        r2 = await c.post("/watchlist", json={"team": "Lakeside Rangers"})
        assert r1.status_code == 201 and r1.json() == {"id": 1, "team": "Fairhaven FC", "note": "strong at home"}
        assert r2.json() == {"id": 2, "team": "Lakeside Rangers", "note": ""}
        assert (await c.post("/watchlist", json={"team": "Fairhaven FC"})).status_code == 409
        assert [i["team"] for i in (await c.get("/watchlist")).json()] == ["Fairhaven FC", "Lakeside Rangers"]
        assert (await c.delete("/watchlist/1")).status_code == 204
        assert (await c.delete("/watchlist/1")).status_code == 404
        assert [i["id"] for i in (await c.get("/watchlist")).json()] == [2]

async def test_validation():
    """Empty team names and long notes are rejected"""
    async with client() as c:
        assert (await c.post("/watchlist", json={"team": ""})).status_code == 422
        assert (await c.post("/watchlist", json={"team": "Ashford City", "note": "x" * 201})).status_code == 422
:::

:::exercise cp8-auth Roles with dependencies
The starter has a `current_user` dependency that reads a fake token from the `Authorization: Bearer <token>` header using the `TOKENS` dict, raising **401** for missing or unknown tokens. Write a dependency `require_role(role)` that returns an `async def` dependency which uses `current_user` and raises **403** unless the user's `"role"` equals `role`. Then add `GET /reports` (any logged-in user, returns `{"user": <name>}`) and `POST /models/retrain` (admins only, returns `{"started_by": <name>}`).

@@starter
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

TOKENS = {"t-ada": {"name": "ada", "role": "admin"}, "t-bob": {"name": "bob", "role": "analyst"}}
bearer = HTTPBearer(auto_error=False)
app = FastAPI()

async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if credentials is None or credentials.credentials not in TOKENS:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return TOKENS[credentials.credentials]

@@solution
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

TOKENS = {"t-ada": {"name": "ada", "role": "admin"}, "t-bob": {"name": "bob", "role": "analyst"}}
bearer = HTTPBearer(auto_error=False)
app = FastAPI()

async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if credentials is None or credentials.credentials not in TOKENS:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return TOKENS[credentials.credentials]

def require_role(role):
    async def check(user: dict = Depends(current_user)) -> dict:
        if user["role"] != role:
            raise HTTPException(status_code=403, detail=f"Requires role {role}")
        return user
    return check

@app.get("/reports")
async def reports(user: dict = Depends(current_user)):
    return {"user": user["name"]}

@app.post("/models/retrain")
async def retrain(user: dict = Depends(require_role("admin"))):
    return {"started_by": user["name"]}

@@tests
import httpx

async def call(method, path, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        return await c.request(method, path, headers=headers)

async def test_reports():
    """Any logged-in user"""
    assert (await call("GET", "/reports")).status_code == 401
    assert (await call("GET", "/reports", "t-bob")).json() == {"user": "bob"}

async def test_retrain():
    """Admins only: 401 anonymous, 403 analyst, 200 admin"""
    assert (await call("POST", "/models/retrain")).status_code == 401
    assert (await call("POST", "/models/retrain", "t-bob")).status_code == 403
    r = await call("POST", "/models/retrain", "t-ada")
    assert r.status_code == 200 and r.json() == {"started_by": "ada"}
:::

:::exercise cp8-serve A model endpoint with a test database
A tiny "model" is provided: `MODEL.predict(elo_diff)` returns a home-win probability. Write `create_app(engine)` returning an app with `POST /predict`, which accepts `{"elo_diff": <float between -800 and 800>}`, stores a row in the provided `Prediction` table (`elo_diff`, `p_home`), and returns `{"id": <row id>, "p_home": <probability rounded to 4 places>}`. Use an `async def` dependency that yields a `Session(engine)`.

@@starter
import math

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

class Base(DeclarativeBase):
    pass

class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    elo_diff: Mapped[float]
    p_home: Mapped[float]

class TinyModel:
    def predict(self, elo_diff):
        return 1 / (1 + math.exp(-(0.2 + elo_diff / 400)))

MODEL = TinyModel()

def create_app(engine):
    return FastAPI()

@@solution
import math

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

class Base(DeclarativeBase):
    pass

class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    elo_diff: Mapped[float]
    p_home: Mapped[float]

class TinyModel:
    def predict(self, elo_diff):
        return 1 / (1 + math.exp(-(0.2 + elo_diff / 400)))

MODEL = TinyModel()

class PredictIn(BaseModel):
    elo_diff: float = Field(ge=-800, le=800)

def create_app(engine):
    app = FastAPI()

    async def get_session():
        with Session(engine) as session:
            yield session

    @app.post("/predict")
    async def predict(body: PredictIn, session: Session = Depends(get_session)):
        p = round(MODEL.predict(body.elo_diff), 4)
        row = Prediction(elo_diff=body.elo_diff, p_home=p)
        session.add(row)
        session.commit()
        session.refresh(row)
        return {"id": row.id, "p_home": p}

    return app

@@tests
import math

import httpx
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

def new_engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine

async def test_predicts_and_stores():
    """Responses and stored rows agree"""
    engine = new_engine()
    app = create_app(engine)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        r1 = await c.post("/predict", json={"elo_diff": 100})
        r2 = await c.post("/predict", json={"elo_diff": -250})
    assert r1.status_code == 200 and r1.json() == {"id": 1, "p_home": round(1 / (1 + math.exp(-0.45)), 4)}
    assert r2.json()["id"] == 2
    with Session(engine) as s:
        assert s.scalar(select(func.count()).select_from(Prediction)) == 2
        assert s.get(Prediction, 2).elo_diff == -250

async def test_validation_and_isolation():
    """Out-of-range input is rejected; each engine is a separate database"""
    app = create_app(new_engine())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        assert (await c.post("/predict", json={"elo_diff": 900})).status_code == 422
        assert (await c.post("/predict", json={"elo_diff": 0})).json()["id"] == 1
:::

## Phase 8 complete

You can now build, secure, test and ship web services in Python, and serve your own models behind them. Combined with the earlier phases, you have the whole pipeline: data, models, honest evaluation, and an API that puts predictions in other people's hands. Phase 9 brings it all together in a capstone project, and looks at how to turn these skills into a career.
