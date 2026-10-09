---
title: Testing APIs
summary: Write tests that call your API like a real client, check status codes, bodies, validation and permissions, swap the database and the logged-in user with dependency overrides, and structure a pytest suite that runs in CI.
minutes: 50
kind: lesson
---

An API is a promise to its clients: send this, get that. Tests are how you keep the promise while you change the code. FastAPI makes API tests unusually pleasant: you call the app in memory, with no server, exactly as a client would.

You met pytest in Phase 2. This lesson applies it to web services.

## Testing an endpoint

Here's a small bets API and a set of tests for it. In the browser we call the test functions ourselves; in a project, pytest finds and runs them (shown at the end).

```python
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

class BetIn(BaseModel):
    match: str = Field(min_length=3)
    pick: str = Field(pattern="^[HDA]$")
    stake: float = Field(gt=0, le=1000)

def create_app():
    app = FastAPI()
    bets = {}

    @app.post("/bets", status_code=201)
    async def create_bet(bet: BetIn):
        bet_id = len(bets) + 1
        bets[bet_id] = {"id": bet_id, **bet.model_dump()}
        return bets[bet_id]

    @app.get("/bets/{bet_id}")
    async def get_bet(bet_id: int):
        if bet_id not in bets:
            raise HTTPException(status_code=404, detail="Bet not found")
        return bets[bet_id]

    return app

def client_for(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

async def test_create_and_fetch():
    async with client_for(create_app()) as client:
        created = await client.post("/bets", json={"match": "Ashford v Bramley", "pick": "H", "stake": 10})
        assert created.status_code == 201
        bet = created.json()
        assert bet == {"id": 1, "match": "Ashford v Bramley", "pick": "H", "stake": 10.0}
        fetched = await client.get(f"/bets/{bet['id']}")
        assert fetched.status_code == 200 and fetched.json() == bet

async def test_validation_errors():
    async with client_for(create_app()) as client:
        for payload, field in [({"match": "Ashford v Bramley", "pick": "X", "stake": 10}, "pick"),
                               ({"match": "Ashford v Bramley", "pick": "H", "stake": 0}, "stake"),
                               ({"match": "A", "pick": "H", "stake": 10}, "match")]:
            r = await client.post("/bets", json=payload)
            assert r.status_code == 422, payload
            assert r.json()["detail"][0]["loc"] == ["body", field]

async def test_unknown_bet():
    async with client_for(create_app()) as client:
        r = await client.get("/bets/999")
        assert r.status_code == 404 and r.json() == {"detail": "Bet not found"}

for test in [test_create_and_fetch, test_validation_errors, test_unknown_bet]:
    await test()
    print("passed:", test.__name__)
```

Good habits on display:

- **A fresh app per test** (`create_app()`), so tests can't affect each other through shared state.
- Check the **status code and the body**: a 200 with the wrong data is still a bug.
- Test the **unhappy paths** (invalid input, missing resources). That's where most bugs live.
- One behaviour per test, with a name that says what it checks.

## Swapping dependencies

Real endpoints depend on a database, the current user, the clock, external services. FastAPI lets tests replace any dependency with `app.dependency_overrides`:

```python
import httpx
from fastapi import Depends, FastAPI, HTTPException

async def get_current_user():
    raise HTTPException(status_code=401, detail="Not authenticated")    # the real one checks a token

async def get_odds_feed():
    raise RuntimeError("the real feed calls an external service")

app = FastAPI()

@app.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@app.get("/value-bets")
async def value_bets(feed: dict = Depends(get_odds_feed), user: dict = Depends(get_current_user)):
    model = {"H": 0.50, "D": 0.27, "A": 0.23}
    return [{"pick": k, "edge": round(model[k] * feed[k] - 1, 3)} for k in "HDA" if model[k] * feed[k] > 1]

async def fake_user():
    return {"id": 7, "role": "user"}

async def fake_feed():
    return {"H": 2.20, "D": 3.40, "A": 4.00}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    print("no overrides:", (await client.get("/me")).status_code)

    app.dependency_overrides[get_current_user] = fake_user
    app.dependency_overrides[get_odds_feed] = fake_feed
    print("as a fake user:", (await client.get("/me")).json())
    print("value bets with a fake feed:", (await client.get("/value-bets")).json())

    app.dependency_overrides.clear()                     # always clean up after a test
    print("after clearing:", (await client.get("/me")).status_code)
```

This is why it pays to get resources through dependencies rather than creating them inside endpoints: anything provided by a dependency can be replaced in a test.

## A test database

For database code, give each test a fresh, empty database by overriding the session dependency:

```python
import httpx
from fastapi import Depends, FastAPI
from sqlalchemy import String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

class Base(DeclarativeBase):
    pass

class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)

production_engine = None          # in the real app: create_engine(os.environ["DATABASE_URL"])

async def get_session():
    with Session(production_engine) as session:
        yield session

app = FastAPI()

@app.post("/teams", status_code=201)
async def add_team(name: str, session: Session = Depends(get_session)):
    session.add(Team(name=name))
    session.commit()
    return {"teams": session.scalars(select(Team.name).order_by(Team.name)).all()}

def use_test_database(app):
    """Point the app at a brand-new in-memory database."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)

    async def test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    return engine

for run in [1, 2]:
    use_test_database(app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/teams", params={"name": "Lakeside Rangers"})
        r = await client.post("/teams", params={"name": "Fairhaven FC"})
        print(f"test run {run}:", r.status_code, r.json())     # same result each time: no leftovers
    app.dependency_overrides.clear()
```

Each run starts empty, so tests are independent and can run in any order. For PostgreSQL-specific features, run the same tests against a disposable PostgreSQL database (in Docker, or a service container in CI).

## A pytest suite in a real project

On your machine (and in the companion project in `backend/`), tests live in a `tests/` folder and **fixtures** in `conftest.py` provide the client:

```python static
# tests/conftest.py
import httpx
import pytest

from app.main import create_app
from app.db import get_session
from tests.helpers import make_test_session_factory

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.fixture
async def client():
    app = create_app()
    app.dependency_overrides[get_session] = make_test_session_factory()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


# tests/test_bets.py
import pytest

@pytest.mark.anyio
async def test_create_bet(client):
    r = await client.post("/bets", json={"match": "Ashford v Bramley", "pick": "H", "stake": 10})
    assert r.status_code == 201

@pytest.mark.parametrize("stake", [0, -5, 1001])
@pytest.mark.anyio
async def test_rejects_bad_stakes(client, stake):
    r = await client.post("/bets", json={"match": "Ashford v Bramley", "pick": "H", "stake": stake})
    assert r.status_code == 422
```

```bash
pip install pytest anyio pytest-cov
pytest -q                          # run everything
pytest --cov=app --cov-report=term-missing    # which lines aren't tested?
```

On a real server, FastAPI's synchronous `TestClient` (`from fastapi.testclient import TestClient`) is also popular: `client.get("/bets/1")` with no `await`. It uses a background thread, which is why the browser runner uses `httpx.AsyncClient` instead.

Finally, run the tests automatically on every push with **continuous integration** (CI). A minimal GitHub Actions workflow:

```yaml
# .github/workflows/tests.yml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - run: pip install -r requirements.txt
      - run: pytest -q
```

## Practice

:::exercise test-catch Write a test that catches bugs
Write `async def check_bets_api(client)` that uses the given `httpx` client to check a bets API like the one in this lesson. It should `assert` that:

1. `POST /bets` with `{"match": "Ashford v Bramley", "pick": "H", "stake": 10}` returns **201** and a body with an `"id"`.
2. `GET /bets/<that id>` returns **200** and the same body.
3. `POST /bets` with a stake of `-5` returns **422**.
4. `GET /bets/999` returns **404**.

The checks run your function against a correct API (it must pass) and three buggy versions (it must fail on each).

@@starter
async def check_bets_api(client):
    r = await client.post("/bets", json={"match": "Ashford v Bramley", "pick": "H", "stake": 10})

@@solution
async def check_bets_api(client):
    created = await client.post("/bets", json={"match": "Ashford v Bramley", "pick": "H", "stake": 10})
    assert created.status_code == 201
    bet = created.json()
    assert "id" in bet
    fetched = await client.get(f"/bets/{bet['id']}")
    assert fetched.status_code == 200 and fetched.json() == bet
    bad = await client.post("/bets", json={"match": "Ashford v Bramley", "pick": "H", "stake": -5})
    assert bad.status_code == 422
    missing = await client.get("/bets/999")
    assert missing.status_code == 404

@@tests
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

def build(bug=None):
    class BetIn(BaseModel):
        match: str
        pick: str
        stake: float = Field(gt=0) if bug != "no_validation" else 0.0

    app = FastAPI()
    bets = {}

    @app.post("/bets", status_code=200 if bug == "wrong_status" else 201)
    async def create(bet: BetIn):
        bet_id = len(bets) + 1
        bets[bet_id] = {"id": bet_id, **bet.model_dump()}
        return bets[bet_id]

    @app.get("/bets/{bet_id}")
    async def get(bet_id: int):
        if bet_id not in bets:
            if bug == "crash_on_missing":
                raise HTTPException(status_code=500, detail="oops")
            raise HTTPException(status_code=404, detail="Bet not found")
        return bets[bet_id]

    return app

async def run_against(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await check_bets_api(client)

async def test_passes_on_correct_api():
    """Your test passes against a correct API"""
    await run_against(build())

async def test_catches_bugs():
    """Your test fails against each buggy API"""
    for bug in ["wrong_status", "no_validation", "crash_on_missing"]:
        try:
            await run_against(build(bug))
        except AssertionError:
            continue
        raise AssertionError(f"your test didn't catch the '{bug}' bug")
:::

:::exercise test-override Override the current user
The starter app protects `DELETE /bets/{bet_id}` with `require_admin`, which (like a real one) rejects every request without a valid token. Write `use_fake_admin(app)`, which makes the app treat every request as coming from the admin `{"sub": "1", "role": "admin"}` by setting `app.dependency_overrides`, and `stop_faking(app)`, which removes all overrides.

@@starter
from fastapi import Depends, FastAPI, HTTPException

async def require_admin():
    raise HTTPException(status_code=401, detail="Not authenticated")

app = FastAPI()
BETS = {1: {"id": 1}, 2: {"id": 2}}

@app.delete("/bets/{bet_id}", status_code=204)
async def delete_bet(bet_id: int, admin: dict = Depends(require_admin)):
    BETS.pop(bet_id, None)

def use_fake_admin(app):
    pass

def stop_faking(app):
    pass

@@solution
from fastapi import Depends, FastAPI, HTTPException

async def require_admin():
    raise HTTPException(status_code=401, detail="Not authenticated")

app = FastAPI()
BETS = {1: {"id": 1}, 2: {"id": 2}}

@app.delete("/bets/{bet_id}", status_code=204)
async def delete_bet(bet_id: int, admin: dict = Depends(require_admin)):
    BETS.pop(bet_id, None)

def use_fake_admin(app):
    async def fake_admin():
        return {"sub": "1", "role": "admin"}
    app.dependency_overrides[require_admin] = fake_admin

def stop_faking(app):
    app.dependency_overrides.clear()

@@tests
import httpx

async def delete(bet_id):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.delete(f"/bets/{bet_id}")

async def test_override_and_reset():
    """Deletes work while faking, and are rejected again afterwards"""
    stop_faking(app)
    assert (await delete(1)).status_code == 401
    use_fake_admin(app)
    assert (await delete(1)).status_code == 204 and 1 not in BETS
    stop_faking(app)
    assert (await delete(2)).status_code == 401 and 2 in BETS
:::

:::quiz test-quiz Quick check
? Why create a fresh app (and database) for each test?
- [x] So tests can't affect each other and can run in any order
- [ ] It makes tests run faster
- [ ] FastAPI apps can only handle one request
> Shared state between tests causes failures that depend on test order.

? What is `app.dependency_overrides` for?
- [x] Replacing dependencies (database, current user, external services) with test versions
- [ ] Making endpoints faster
- [ ] Changing URL paths
> Anything provided through `Depends` can be swapped in tests.

? Your test only checks `response.status_code == 200`. What's the risk?
- [x] The endpoint could return the wrong data and the test would still pass
- [ ] None, status codes are enough
- [ ] The test will be too slow
> Check the body too.

? Which is the best reason to run tests in CI on every push?
- [x] Problems are caught automatically before code is merged or deployed
- [ ] It replaces code review
- [ ] It makes the code run faster in production
> A failing check blocks a broken change from reaching users.
:::
