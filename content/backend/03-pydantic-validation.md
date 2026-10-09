---
title: Data validation with Pydantic
summary: Define the shape of your data once with Pydantic models - types, constraints, custom validators, nested models and serialisation - and use separate input and output models so APIs accept only valid data and never leak internal fields.
minutes: 50
kind: lesson
---

Every value arriving from outside your program (an API request, a CSV upload, a config file) is untrusted. **Pydantic** checks it against a model you define with type hints, converts it to proper Python types, and produces clear errors when it doesn't fit. FastAPI uses Pydantic for every request and response.

## Models and type conversion

```python
from datetime import date

from pydantic import BaseModel, ValidationError

class Match(BaseModel):
    home: str
    away: str
    kickoff: date
    home_goals: int | None = None          # optional, defaults to None
    away_goals: int | None = None

m = Match(home="Fairhaven FC", away="Lakeside Rangers", kickoff="2024-08-17", home_goals="2", away_goals=1)
print(m)
print(type(m.kickoff).__name__, m.kickoff.year, "| home_goals:", repr(m.home_goals))

try:
    Match(home="Fairhaven FC", kickoff="17th of August", home_goals="two")
except ValidationError as e:
    for err in e.errors():
        print(err["loc"], "-", err["msg"])
```

- Pydantic **converts** sensible inputs: the string `"2024-08-17"` became a `date`, and `"2"` became the integer 2. This "lax" mode suits JSON, where dates are always strings. (Add `model_config = ConfigDict(strict=True)` to forbid conversions.)
- Invalid data raises a `ValidationError` listing **all** the problems at once, with the location of each.

## Constraints with Field

```python
from pydantic import BaseModel, Field, ValidationError

class BetIn(BaseModel):
    match_id: int = Field(gt=0)
    pick: str = Field(pattern=r"^[HDA]$", description="H, D or A")
    odds: float = Field(gt=1.0, le=1000)
    stake: float = Field(gt=0, le=10_000)
    note: str = Field("", max_length=200)

print(BetIn(match_id=17, pick="H", odds=2.4, stake=10))
try:
    BetIn(match_id=0, pick="home", odds=0.9, stake=-5)
except ValidationError as e:
    for err in e.errors():
        print(err["loc"][0], "-", err["msg"])
```

Constraints appear in FastAPI's generated documentation too, so clients know the rules before they send anything.

## Custom validators

For rules that types and constraints can't express, write a validator:

- `@field_validator("field")` checks or transforms one field.
- `@model_validator(mode="after")` checks the model as a whole, once all fields are valid.

```python
from pydantic import BaseModel, ValidationError, field_validator, model_validator

class Forecast(BaseModel):
    home_team: str
    away_team: str
    p_home: float
    p_draw: float
    p_away: float

    @field_validator("home_team", "away_team")
    @classmethod
    def tidy_name(cls, value: str) -> str:
        value = " ".join(value.split())                 # collapse extra spaces
        if not value:
            raise ValueError("team name can't be empty")
        return value

    @model_validator(mode="after")
    def check_probabilities(self):
        probs = (self.p_home, self.p_draw, self.p_away)
        if any(not 0 <= p <= 1 for p in probs):
            raise ValueError("probabilities must be between 0 and 1")
        if abs(sum(probs) - 1) > 1e-6:
            raise ValueError(f"probabilities must sum to 1, got {sum(probs):.4f}")
        if self.home_team == self.away_team:
            raise ValueError("a team can't play itself")
        return self

print(Forecast(home_team="  Fairhaven   FC ", away_team="Lakeside Rangers", p_home=0.5, p_draw=0.25, p_away=0.25))
for bad in [dict(p_home=0.5, p_draw=0.3, p_away=0.3), dict(away_team="Fairhaven FC", p_home=0.5, p_draw=0.25, p_away=0.25)]:
    try:
        Forecast(**{"home_team": "Fairhaven FC", "away_team": "Lakeside Rangers", **bad})
    except ValidationError as e:
        print("rejected:", e.errors()[0]["msg"])
```

Validation belongs at the edge of your system. Once data has passed through a model, the rest of your code can trust it.

## Nested models, lists and enums

```python
from enum import Enum

from pydantic import BaseModel, Field

class Outcome(str, Enum):
    HOME = "H"
    DRAW = "D"
    AWAY = "A"

class Leg(BaseModel):
    match_id: int
    pick: Outcome
    odds: float = Field(gt=1)

class Accumulator(BaseModel):
    stake: float = Field(gt=0)
    legs: list[Leg] = Field(min_length=2, max_length=10)

    @property
    def combined_odds(self) -> float:
        result = 1.0
        for leg in self.legs:
            result *= leg.odds
        return result

acca = Accumulator.model_validate({"stake": 5, "legs": [
    {"match_id": 1, "pick": "H", "odds": 1.8},
    {"match_id": 2, "pick": "A", "odds": 2.5},
]})
print(acca.legs[1].pick, acca.legs[1].pick is Outcome.AWAY)
print(f"combined odds {acca.combined_odds:.2f}, potential return {acca.stake * acca.combined_odds:.2f}")
```

`model_validate` builds a model from a dict (such as parsed JSON); nested dicts become nested models automatically.

## Serialising: models back to data

```python
from datetime import datetime

from pydantic import BaseModel

class Prediction(BaseModel):
    match_id: int
    probs: dict[str, float]
    model_version: str
    created_at: datetime

p = Prediction(match_id=17, probs={"H": 0.48, "D": 0.27, "A": 0.25}, model_version="poisson-1.2",
               created_at=datetime(2025, 1, 4, 14, 30))
print(p.model_dump())                                        # Python dict (datetime stays a datetime)
print(p.model_dump_json())                                   # JSON string (datetime becomes ISO text)
print(p.model_dump(include={"match_id", "probs"}))           # just some fields
print(Prediction.model_validate_json(p.model_dump_json()) == p)   # round trip
```

## Input and output models in FastAPI

A common, important pattern: use **different models** for what clients send and what you send back. The output model controls exactly which fields leave your server, so internal data (password hashes, costs, internal notes) can't leak by accident.

```python
import httpx
from fastapi import FastAPI, status
from pydantic import BaseModel, Field

class UserCreate(BaseModel):          # what clients send
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)

class UserOut(BaseModel):             # what clients get back
    id: int
    email: str

users: list[dict] = []
app = FastAPI()

@app.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(user: UserCreate):
    record = {"id": len(users) + 1, "email": user.email, "password_hash": "$2b$12$...", "is_admin": False}
    users.append(record)
    return record                     # extra fields are filtered out by response_model

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    r = await client.post("/users", json={"email": "ada@example.com", "password": "correct horse battery"})
    print(r.status_code, r.json())
    r = await client.post("/users", json={"email": "not-an-email", "password": "short"})
    print(r.status_code, [e["loc"][-1] for e in r.json()["detail"]])
```

The stored record has a password hash and an admin flag, but the response contains only `id` and `email`. (Lesson 6 covers hashing passwords properly. For real email validation, Pydantic's `EmailStr` needs the extra `email-validator` package.)

## Practice

:::exercise pyd-odds An odds quote model
Write a Pydantic model `OddsQuote` with fields `home`, `draw` and `away` (floats, each greater than 1.0), and `bookmaker` (a string of 1 to 50 characters). Add a property `margin` returning `1/home + 1/draw + 1/away - 1`, and a model validator that rejects quotes whose margin is negative (an arbitrage: "prices imply less than 100%") or above 0.25 (`"margin too high"`), raising `ValueError`.

@@starter
from pydantic import BaseModel, Field, model_validator

class OddsQuote(BaseModel):
    pass

@@solution
from pydantic import BaseModel, Field, model_validator

class OddsQuote(BaseModel):
    home: float = Field(gt=1.0)
    draw: float = Field(gt=1.0)
    away: float = Field(gt=1.0)
    bookmaker: str = Field(min_length=1, max_length=50)

    @property
    def margin(self) -> float:
        return 1 / self.home + 1 / self.draw + 1 / self.away - 1

    @model_validator(mode="after")
    def check_margin(self):
        if self.margin < 0:
            raise ValueError("prices imply less than 100%")
        if self.margin > 0.25:
            raise ValueError("margin too high")
        return self

@@tests
import math
from pydantic import ValidationError

def rejects(**kwargs):
    try:
        OddsQuote(**kwargs)
    except ValidationError:
        return True
    return False

def test_valid_quote():
    """Margin is computed"""
    q = OddsQuote(home=2.1, draw=3.4, away=3.6, bookmaker="Avg")
    assert math.isclose(q.margin, 1 / 2.1 + 1 / 3.4 + 1 / 3.6 - 1)

def test_field_rules():
    """Odds must exceed 1; bookmaker 1-50 characters"""
    assert rejects(home=1.0, draw=3.4, away=3.6, bookmaker="Avg")
    assert rejects(home=2.1, draw=3.4, away=3.6, bookmaker="")
    assert rejects(home=2.1, draw=3.4, away=3.6, bookmaker="x" * 51)

def test_margin_rules():
    """Negative and excessive margins are rejected"""
    assert rejects(home=3.0, draw=3.5, away=3.5, bookmaker="Arb")       # margin < 0
    assert rejects(home=1.5, draw=2.5, away=3.0, bookmaker="Greedy")    # margin > 0.25
:::

:::exercise pyd-response Hide internal fields
The starter has an endpoint returning internal records. Add a model `BetOut` with fields `id` (int), `match` (str), `pick` (str) and `stake` (float), and make `GET /bets/{bet_id}` use it as its `response_model`, so the `profit_margin` and `trader_notes` fields never reach the client. Keep the 404 for unknown ids.

@@starter
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

BETS = {
    1: {"id": 1, "match": "Ashford v Bramley", "pick": "H", "stake": 10.0, "profit_margin": 0.07, "trader_notes": "sharp customer"},
    2: {"id": 2, "match": "Dunmore v Castleton", "pick": "D", "stake": 5.0, "profit_margin": 0.05, "trader_notes": ""},
}
app = FastAPI()

@app.get("/bets/{bet_id}")
async def get_bet(bet_id: int):
    if bet_id not in BETS:
        raise HTTPException(status_code=404, detail="Bet not found")
    return BETS[bet_id]

@@solution
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

BETS = {
    1: {"id": 1, "match": "Ashford v Bramley", "pick": "H", "stake": 10.0, "profit_margin": 0.07, "trader_notes": "sharp customer"},
    2: {"id": 2, "match": "Dunmore v Castleton", "pick": "D", "stake": 5.0, "profit_margin": 0.05, "trader_notes": ""},
}
app = FastAPI()

class BetOut(BaseModel):
    id: int
    match: str
    pick: str
    stake: float

@app.get("/bets/{bet_id}", response_model=BetOut)
async def get_bet(bet_id: int):
    if bet_id not in BETS:
        raise HTTPException(status_code=404, detail="Bet not found")
    return BETS[bet_id]

@@tests
import httpx

async def test_filtered():
    """Only the public fields are returned"""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/bets/1")
    assert r.status_code == 200
    assert r.json() == {"id": 1, "match": "Ashford v Bramley", "pick": "H", "stake": 10.0}

async def test_not_found():
    """Unknown ids still give 404"""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/bets/99")).status_code == 404
:::

:::quiz pyd-quiz Quick check
? A client sends `{"stake": "10"}` to a model with `stake: float`. In Pydantic's default mode, what happens?
- [x] It's converted to the float 10.0
- [ ] A validation error, always
- [ ] It stays the string "10"
> Lax mode converts sensible inputs. Strict mode would reject it.

? Where should a rule like "the three probabilities must sum to 1" go?
- [x] A model validator (`@model_validator(mode="after")`)
- [ ] A field constraint on one probability
- [ ] Inside every endpoint that uses the model
> It involves several fields, so validate the model as a whole.

? Why use a separate output model (`response_model`) instead of returning your internal records?
- [x] So only the fields you choose leave the server, even if records gain new internal fields
- [ ] Output models make responses faster
- [ ] FastAPI can't return dicts
> It prevents accidental leaks such as password hashes.

? What does `Model.model_validate(data)` do?
- [x] Builds and validates a model from a dict, including nested dicts
- [ ] Checks whether the class definition is valid
- [ ] Converts a model to JSON
> Its counterpart for JSON strings is `model_validate_json`.
:::
