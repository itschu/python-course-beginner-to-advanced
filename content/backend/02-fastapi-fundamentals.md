---
title: FastAPI fundamentals
summary: Path and query parameters with type checking, request bodies, status codes, raising HTTP errors, organising routes with APIRouter, and the interactive documentation FastAPI generates for free.
minutes: 50
kind: lesson
---

FastAPI's big idea: describe your inputs with ordinary Python type hints, and it parses, validates, converts and documents them for you. This lesson builds a small read-only API over the course's match data, one feature at a time.

Every cell creates an app and then calls it with an `httpx.AsyncClient`. The helper pattern is always the same:

```python static
async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    response = await client.get("/some/path", params={"key": "value"})
```

## Path parameters

Parts of the path in braces become function arguments. The type hint is enforced: `/teams/abc` can't reach a function expecting an `int`.

```python
import httpx
import pandas as pd
from fastapi import FastAPI

matches = pd.read_csv("data/matches.csv")
TEAMS = sorted(matches["HomeTeam"].unique())

app = FastAPI()

@app.get("/teams")
async def list_teams():
    return [{"id": i, "name": name} for i, name in enumerate(TEAMS)]

@app.get("/teams/{team_id}")
async def get_team(team_id: int):
    return {"id": team_id, "name": TEAMS[team_id]}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    print((await client.get("/teams")).json()[:3])
    print((await client.get("/teams/5")).json())
    bad = await client.get("/teams/abc")
    print(bad.status_code, bad.json()["detail"][0]["msg"])
```

FastAPI rejected `"abc"` with a **422** and a clear message, before your function ever ran. But try `/teams/99`: it raises an `IndexError` inside the function, which becomes a 500 error. Handling that properly is next.

## Raising HTTP errors

Raise `HTTPException` to return an error status with a message:

```python
import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException

matches = pd.read_csv("data/matches.csv")
TEAMS = sorted(matches["HomeTeam"].unique())
app = FastAPI()

@app.get("/teams/{team_id}")
async def get_team(team_id: int):
    if not 0 <= team_id < len(TEAMS):
        raise HTTPException(status_code=404, detail=f"No team with id {team_id}")
    return {"id": team_id, "name": TEAMS[team_id]}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    for path in ["/teams/5", "/teams/99"]:
        r = await client.get(path)
        print(path, r.status_code, r.json())
```

## Query parameters

Function parameters that aren't in the path become **query parameters**. Give them a default to make them optional. `Query(...)` adds constraints, which are validated and documented:

```python
from typing import Literal

import httpx
import pandas as pd
from fastapi import FastAPI, Query

matches = pd.read_csv("data/matches.csv")
app = FastAPI()

@app.get("/matches")
async def list_matches(
    season: str | None = None,
    team: str | None = None,
    result: Literal["H", "D", "A"] | None = None,
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    rows = matches
    if season:
        rows = rows[rows["Season"] == season]
    if team:
        rows = rows[(rows["HomeTeam"] == team) | (rows["AwayTeam"] == team)]
    if result:
        rows = rows[rows["FTR"] == result]
    page = rows.iloc[offset:offset + limit]
    return {"total": len(rows), "matches": page[["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]].to_dict(orient="records")}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    r = await client.get("/matches", params={"season": "2024-25", "team": "Fairhaven FC", "result": "A", "limit": 3})
    print(r.json())
    print((await client.get("/matches", params={"limit": 500})).status_code)     # le=100 -> 422
    print((await client.get("/matches", params={"result": "X"})).status_code)     # not H/D/A -> 422
```

- `limit` and `offset` implement **pagination**: never return an unbounded list from an API.
- `Literal["H", "D", "A"]` restricts a parameter to a fixed set of values.
- Returning the `total` alongside the page lets a client know how many pages there are.

## Request bodies

For `POST`, `PUT` and `PATCH`, data usually arrives as a JSON **body**. Describe its shape with a **Pydantic model** (next lesson covers Pydantic in depth), and FastAPI parses and validates it:

```python
import httpx
from fastapi import FastAPI
from pydantic import BaseModel

class OddsIn(BaseModel):
    home: float
    draw: float
    away: float

app = FastAPI()

@app.post("/odds/fair")
async def fair_probabilities(odds: OddsIn):
    implied = [1 / odds.home, 1 / odds.draw, 1 / odds.away]
    total = sum(implied)
    return {"margin": round(total - 1, 4), "fair": {k: round(p / total, 4) for k, p in zip("HDA", implied)}}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    r = await client.post("/odds/fair", json={"home": 2.10, "draw": 3.40, "away": 3.60})
    print(r.status_code, r.json())
    r = await client.post("/odds/fair", json={"home": 2.10, "draw": "lots"})
    print(r.status_code, [(e["loc"], e["msg"]) for e in r.json()["detail"]])
```

The invalid request gets a 422 listing **every** problem: `draw` isn't a number and `away` is missing. Your function only ever sees valid data.

## Status codes for success

By default, successful responses are `200 OK`. Creating something should return **201 Created**; deleting usually returns **204 No Content**:

```python
import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

class Note(BaseModel):
    text: str

app = FastAPI()
notes: dict[int, str] = {}

@app.post("/notes", status_code=status.HTTP_201_CREATED)
async def create_note(note: Note):
    note_id = len(notes) + 1
    notes[note_id] = note.text
    return {"id": note_id, "text": note.text}

@app.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(note_id: int):
    if note_id not in notes:
        raise HTTPException(status_code=404, detail="Note not found")
    del notes[note_id]

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    created = await client.post("/notes", json={"text": "Back Fairhaven at 3.40+"})
    print(created.status_code, created.json())
    print((await client.delete("/notes/1")).status_code)
    print((await client.delete("/notes/1")).status_code)
```

## Organising routes with APIRouter

A real API has dozens of endpoints. Group related ones in an `APIRouter` (typically one module per resource) and include them in the app with a prefix:

```python
import httpx
from fastapi import APIRouter, FastAPI

teams = APIRouter(prefix="/teams", tags=["teams"])
odds = APIRouter(prefix="/odds", tags=["odds"])

@teams.get("")
async def list_teams():
    return ["Ashford City", "Bramley Rovers"]

@odds.get("/implied")
async def implied(odds: float):
    return {"implied_probability": round(1 / odds, 4)}

app = FastAPI(title="Match API", version="1.0")
app.include_router(teams)
app.include_router(odds)

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    print((await client.get("/teams")).json())
    print((await client.get("/odds/implied", params={"odds": 4})).json())
```

In a project, `teams` would live in `routers/teams.py` and `main.py` would just create the app and include the routers. The companion project in `backend/` is laid out this way.

## Free documentation

From your type hints, FastAPI generates an **OpenAPI** description of the whole API. On a running server it serves interactive documentation at `/docs` (where you can try every endpoint) and `/redoc`. The raw description is at `/openapi.json`:

```python
import httpx
from fastapi import FastAPI, Query

app = FastAPI(title="Match API", version="1.0")

@app.get("/matches", summary="List matches", tags=["matches"])
async def list_matches(season: str | None = None, limit: int = Query(10, ge=1, le=100)):
    """Matches, optionally filtered by season, newest first."""
    return []

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    spec = (await client.get("/openapi.json")).json()
operation = spec["paths"]["/matches"]["get"]
print(spec["info"])
print(operation["summary"], "-", operation["description"])
for p in operation["parameters"]:
    print(" ", p["name"], p["in"], p["schema"])
```

Client code generators and API tools read this description, so good type hints and docstrings pay off well beyond your own code.

## Practice

:::exercise fa-teams Team lookup with errors
Create `app` with `GET /teams/{name}`, using the provided `TEAMS` dict. Return `{"name": name, "stadium": ...}` for a known team, and a **404** with detail `"Unknown team"` otherwise.

@@starter
from fastapi import FastAPI, HTTPException

TEAMS = {"Fairhaven FC": "Harbour Road", "Lakeside Rangers": "The Boathouse", "Ashford City": "Mill Lane"}
app = FastAPI()

@@solution
from fastapi import FastAPI, HTTPException

TEAMS = {"Fairhaven FC": "Harbour Road", "Lakeside Rangers": "The Boathouse", "Ashford City": "Mill Lane"}
app = FastAPI()

@app.get("/teams/{name}")
async def get_team(name: str):
    if name not in TEAMS:
        raise HTTPException(status_code=404, detail="Unknown team")
    return {"name": name, "stadium": TEAMS[name]}

@@tests
import httpx

async def test_known_team():
    """Returns the stadium"""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/teams/Fairhaven FC")
        assert r.status_code == 200 and r.json() == {"name": "Fairhaven FC", "stadium": "Harbour Road"}

async def test_unknown_team():
    """404 with the right detail"""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/teams/Real Madrid")
        assert r.status_code == 404 and r.json() == {"detail": "Unknown team"}
:::

:::exercise fa-paginate Filtering and pagination
Create `app` with `GET /matches` over the provided `MATCHES` list. Query parameters: optional `team` (keep matches where it's the home or away team), `limit` (default 5, between 1 and 50) and `offset` (default 0, at least 0). Return `{"total": <matches after filtering>, "items": <the requested page>}`.

@@starter
from fastapi import FastAPI, Query

MATCHES = [{"home": h, "away": a, "goals": g} for h, a, g in [
    ("Ashford", "Bramley", 3), ("Castleton", "Ashford", 1), ("Bramley", "Dunmore", 2),
    ("Ashford", "Dunmore", 0), ("Dunmore", "Castleton", 4), ("Bramley", "Ashford", 2),
    ("Castleton", "Bramley", 1), ("Dunmore", "Ashford", 3),
]]
app = FastAPI()

@@solution
from fastapi import FastAPI, Query

MATCHES = [{"home": h, "away": a, "goals": g} for h, a, g in [
    ("Ashford", "Bramley", 3), ("Castleton", "Ashford", 1), ("Bramley", "Dunmore", 2),
    ("Ashford", "Dunmore", 0), ("Dunmore", "Castleton", 4), ("Bramley", "Ashford", 2),
    ("Castleton", "Bramley", 1), ("Dunmore", "Ashford", 3),
]]
app = FastAPI()

@app.get("/matches")
async def list_matches(team: str | None = None, limit: int = Query(5, ge=1, le=50), offset: int = Query(0, ge=0)):
    rows = [m for m in MATCHES if team is None or team in (m["home"], m["away"])]
    return {"total": len(rows), "items": rows[offset:offset + limit]}

@@tests
import httpx

async def get(params):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get("/matches", params=params)

async def test_default_page():
    """First five, total of all"""
    r = await get({})
    assert r.status_code == 200 and r.json()["total"] == 8 and len(r.json()["items"]) == 5

async def test_filter_and_offset():
    """Ashford played in 5 matches; a second page of 3 has the last 2"""
    body = (await get({"team": "Ashford", "limit": 3, "offset": 3})).json()
    assert body["total"] == 5
    assert body["items"] == [{"home": "Bramley", "away": "Ashford", "goals": 2}, {"home": "Dunmore", "away": "Ashford", "goals": 3}]

async def test_limits_validated():
    """Out-of-range values are rejected"""
    assert (await get({"limit": 0})).status_code == 422
    assert (await get({"limit": 51})).status_code == 422
    assert (await get({"offset": -1})).status_code == 422
:::

:::exercise fa-create Create with 201
Create `app` with `POST /bets` that accepts a JSON body with `match` (str), `pick` (str) and `stake` (float), stores it in the `BETS` list with an `id` (1 for the first bet, 2 for the second…), and returns the stored bet (including its `id`) with status **201**.

@@starter
from fastapi import FastAPI
from pydantic import BaseModel

BETS = []
app = FastAPI()

@@solution
from fastapi import FastAPI, status
from pydantic import BaseModel

BETS = []
app = FastAPI()

class BetIn(BaseModel):
    match: str
    pick: str
    stake: float

@app.post("/bets", status_code=status.HTTP_201_CREATED)
async def create_bet(bet: BetIn):
    stored = {"id": len(BETS) + 1, **bet.model_dump()}
    BETS.append(stored)
    return stored

@@tests
import httpx

async def test_create_two():
    """Ids increase and the response is 201"""
    BETS.clear()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.post("/bets", json={"match": "Ashford v Bramley", "pick": "H", "stake": 10})
        r2 = await client.post("/bets", json={"match": "Dunmore v Castleton", "pick": "D", "stake": 5.5})
    assert r1.status_code == 201 and r1.json() == {"id": 1, "match": "Ashford v Bramley", "pick": "H", "stake": 10.0}
    assert r2.json()["id"] == 2 and len(BETS) == 2

async def test_invalid_body():
    """Missing or wrongly typed fields give 422"""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/bets", json={"match": "x", "pick": "H"})).status_code == 422
        assert (await client.post("/bets", json={"match": "x", "pick": "H", "stake": "ten"})).status_code == 422
:::

:::quiz fa-quiz Quick check
? A request to `/teams/abc` hits an endpoint declared as `async def get_team(team_id: int)`. What happens?
- [x] FastAPI returns 422 without calling the function
- [ ] The function receives the string "abc"
- [ ] The server crashes with a 500 error
> Type hints are validated before your code runs.

? How do you return a 404 from an endpoint?
- [x] `raise HTTPException(status_code=404, detail="...")`
- [ ] `return 404`
- [ ] `print("404")`
> HTTPException turns into a proper error response.

? Why should list endpoints be paginated?
- [x] So a single request can't return an unbounded amount of data
- [ ] Because JSON can't hold long lists
- [ ] FastAPI requires it
> limit/offset (or cursor-based) pagination keeps responses fast and predictable.

? Where does FastAPI's interactive documentation come from?
- [x] It's generated from your routes, type hints, models and docstrings
- [ ] You write it by hand in a separate file
- [ ] It's downloaded from the FastAPI website
> Served at /docs and /redoc, described at /openapi.json.
:::
