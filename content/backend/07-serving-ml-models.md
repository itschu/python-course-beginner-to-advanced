---
title: Serving machine learning models
summary: Train and save a model offline, load it once at startup with a lifespan handler, expose single and batch prediction endpoints with validated inputs, report the model version, log predictions in the background, and keep inference from blocking the server.
minutes: 60
kind: lesson
---

This is where the two halves of the course meet: a model from the ML phases, served by an API from this phase. The pattern is the same whether the model is a scikit-learn pipeline, a PyTorch network or a gradient-boosted forest:

1. **Train offline** in a script or notebook, evaluate it, and save it with its metadata.
2. **Load it once** when the server starts, not on every request.
3. **Validate inputs** with Pydantic, run the model, and return predictions with the model version.
4. **Log predictions** so you can monitor the model later (Phase 6, lesson 8).

## Step 1: train and save

Our model is Phase 6's Poisson goal model: attack and defence strengths for every team, fitted on all three seasons with recent matches weighted more. The bundle saved with `joblib` holds everything needed to make predictions later.

```python
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor

matches = pd.read_csv("data/matches.csv", parse_dates=["Date"])
teams = sorted(matches["HomeTeam"].unique())
index = {t: i for i, t in enumerate(teams)}

def design(home_ids, away_ids, n_teams):
    """Rows for home goals (home attack vs away defence, plus home advantage) and away goals."""
    n = len(home_ids)
    X_home, X_away = np.zeros((n, 2 * n_teams + 1)), np.zeros((n, 2 * n_teams + 1))
    rows = np.arange(n)
    X_home[rows, home_ids] = 1; X_home[rows, n_teams + away_ids] = 1; X_home[:, -1] = 1
    X_away[rows, away_ids] = 1; X_away[rows, n_teams + home_ids] = 1
    return X_home, X_away

h, a = matches["HomeTeam"].map(index).to_numpy(), matches["AwayTeam"].map(index).to_numpy()
X_home, X_away = design(h, a, len(teams))
weights = np.exp(-0.004 * (matches["Date"].max() - matches["Date"]).dt.days.to_numpy())
model = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(
    np.vstack([X_home, X_away]), np.concatenate([matches["FTHG"], matches["FTAG"]]),
    sample_weight=np.concatenate([weights, weights]))

bundle = {"model": model, "teams": teams, "version": "poisson-2025.1",
          "trained_through": str(matches["Date"].max().date()), "max_goals": 10}
joblib.dump(bundle, "match_model.joblib")
print(f"saved model for {len(teams)} teams, trained through {bundle['trained_through']}")
```

## Step 2: serve it

The app below loads the bundle in a **lifespan** handler: code before `yield` runs once at startup, code after it at shutdown. The model is stored on `app.state`, and endpoints reach it through the request. (The training cell above is repeated in compact form, so this cell runs on its own.)

```python
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
import joblib
import numpy as np
import pandas as pd
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from scipy import stats
from sklearn.linear_model import PoissonRegressor

# --- offline training (normally a separate script) ---
matches = pd.read_csv("data/matches.csv", parse_dates=["Date"])
teams = sorted(matches["HomeTeam"].unique())
idx = {t: i for i, t in enumerate(teams)}

def design(home_ids, away_ids, n_teams):
    n = len(home_ids)
    X_home, X_away = np.zeros((n, 2 * n_teams + 1)), np.zeros((n, 2 * n_teams + 1))
    rows = np.arange(n)
    X_home[rows, home_ids] = 1; X_home[rows, n_teams + away_ids] = 1; X_home[:, -1] = 1
    X_away[rows, away_ids] = 1; X_away[rows, n_teams + home_ids] = 1
    return X_home, X_away

X_home, X_away = design(matches["HomeTeam"].map(idx).to_numpy(), matches["AwayTeam"].map(idx).to_numpy(), len(teams))
w = np.exp(-0.004 * (matches["Date"].max() - matches["Date"]).dt.days.to_numpy())
fitted = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(np.vstack([X_home, X_away]),
                                                          np.concatenate([matches["FTHG"], matches["FTAG"]]),
                                                          sample_weight=np.concatenate([w, w]))
joblib.dump({"model": fitted, "teams": teams, "version": "poisson-2025.1"}, "match_model.joblib")

# --- the service ---
PREDICTION_LOG = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    bundle = joblib.load("match_model.joblib")       # once, at startup
    app.state.bundle = bundle
    app.state.team_index = {t: i for i, t in enumerate(bundle["teams"])}
    print(f"loaded model {bundle['version']}")
    yield
    print("shutting down")

app = FastAPI(title="Match predictions", lifespan=lifespan)

class Fixture(BaseModel):
    home: str
    away: str

class Prediction(BaseModel):
    home: str
    away: str
    expected_goals: dict[str, float]
    probabilities: dict[str, float]
    fair_odds: dict[str, float]
    model_version: str

def predict_fixture(app, fixture: Fixture) -> Prediction:
    team_index = app.state.team_index
    for team in (fixture.home, fixture.away):
        if team not in team_index:
            raise HTTPException(status_code=404, detail=f"Unknown team: {team}")
    if fixture.home == fixture.away:
        raise HTTPException(status_code=422, detail="A team can't play itself")
    n = len(team_index)
    X_h, X_a = design(np.array([team_index[fixture.home]]), np.array([team_index[fixture.away]]), n)
    model = app.state.bundle["model"]
    lam_h, lam_a = model.predict(X_h)[0], model.predict(X_a)[0]
    goals = np.arange(11)
    grid = np.outer(stats.poisson(lam_h).pmf(goals), stats.poisson(lam_a).pmf(goals))
    grid /= grid.sum()
    probs = {"H": float(np.tril(grid, -1).sum()), "D": float(np.trace(grid)), "A": float(np.triu(grid, 1).sum())}
    return Prediction(home=fixture.home, away=fixture.away,
                      expected_goals={"home": round(lam_h, 3), "away": round(lam_a, 3)},
                      probabilities={k: round(p, 4) for k, p in probs.items()},
                      fair_odds={k: round(1 / p, 2) for k, p in probs.items()},
                      model_version=app.state.bundle["version"])

async def log_prediction(prediction: Prediction):
    PREDICTION_LOG.append({"at": datetime.now(timezone.utc).isoformat(), **prediction.model_dump()})

@app.get("/health")
async def health(request: Request):
    return {"status": "ok", "model_version": request.app.state.bundle["version"]}

@app.get("/teams")
async def list_teams(request: Request):
    return request.app.state.bundle["teams"]

@app.get("/predict", response_model=Prediction)
async def predict(home: str, away: str, request: Request, background: BackgroundTasks):
    prediction = predict_fixture(request.app, Fixture(home=home, away=away))
    background.add_task(log_prediction, prediction)          # runs after the response is sent
    return prediction

class BatchIn(BaseModel):
    fixtures: list[Fixture] = Field(min_length=1, max_length=100)

@app.post("/predict/batch", response_model=list[Prediction])
async def predict_batch(body: BatchIn, request: Request):
    return [predict_fixture(request.app, f) for f in body.fixtures]

# httpx doesn't run lifespan events, so enter the lifespan ourselves (a real server does this for you)
async with app.router.lifespan_context(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        print((await client.get("/health")).json())
        print((await client.get("/predict", params={"home": "Fairhaven FC", "away": "Lakeside Rangers"})).json())
        print((await client.get("/predict", params={"home": "Fairhaven FC", "away": "Real Madrid"})).json())
        batch = await client.post("/predict/batch", json={"fixtures": [
            {"home": "Ashford City", "away": "Bramley Rovers"}, {"home": "Oakvale Rovers", "away": "Kingsport United"}]})
        for p in batch.json():
            print(p["home"], "v", p["away"], p["probabilities"])
print("logged predictions:", len(PREDICTION_LOG))
```

Things to notice:

- **One load, many requests.** Loading a model can take seconds; doing it per request would make every prediction slow.
- **The version travels with every prediction.** When you deploy a retrained model, you can tell which version produced which prediction, which is essential for monitoring and debugging.
- **Domain errors are HTTP errors**: an unknown team is a 404 with a clear message, not a crash.
- **The batch endpoint caps its size** (`max_length=100`), so one request can't tie up the server.
- **Logging happens in the background**: `BackgroundTasks` runs after the response is sent, so the client doesn't wait for it. In production you'd write to a database table rather than a list, then compare predictions with results later.

## Keeping the server responsive

FastAPI runs `async def` endpoints on a single **event loop**. While one runs CPU-heavy code (a big model, a large batch), nothing else on that worker can proceed. Options, from simplest:

- Keep inference fast: small models, vectorised batch predictions.
- On a real server, declare CPU-bound endpoints with plain **`def`**: FastAPI runs those in a thread pool, so the event loop stays free. (The browser runner has no threads, which is why this course writes `async def` throughout.)
- Run several worker processes (`uvicorn main:app --workers 4`, or several containers), so one slow request doesn't block everyone.
- For long jobs (retraining, large backtests), don't make the client wait: accept the job, return **202 Accepted** with a job id, process it with a task queue (Celery, RQ, Arq), and let the client poll for the result.

## Other model types

The serving pattern doesn't change; only the loading and predicting lines do:

```python static
# scikit-learn pipeline (preprocessing included)
pipeline = joblib.load("model.joblib")
probs = pipeline.predict_proba(pd.DataFrame([features.model_dump()]))[0]

# PyTorch (Phase 7): rebuild the architecture, load the weights, switch to eval mode
model = FashionNet()
model.load_state_dict(torch.load("fashion_net.pt", map_location="cpu"))
model.eval()
with torch.no_grad():
    probs = torch.softmax(model(batch), dim=1)
```

For very high traffic or large neural networks, dedicated model servers (NVIDIA Triton, TorchServe, BentoML) or exporting to ONNX can help, but a FastAPI service like this one handles a lot more traffic than most projects ever see.

## Practice

:::exercise serve-predict A prediction endpoint
A fitted logistic regression is provided as `MODEL`; it predicts the probability of a home win from two features: `elo_diff` (home Elo minus away Elo) and `form_diff` (home form minus away form). Create `app` with `POST /predict` that accepts a JSON body with `elo_diff` (a float between -800 and 800) and `form_diff` (a float between -3 and 3), and returns `{"p_home_win": <probability rounded to 4 places>, "model_version": MODEL_VERSION}`.

@@starter
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.linear_model import LogisticRegression

rng = np.random.default_rng(0)
X = np.column_stack([rng.normal(0, 200, 500), rng.normal(0, 1, 500)])
y = (rng.random(500) < 1 / (1 + np.exp(-(0.004 * X[:, 0] + 0.3 * X[:, 1] + 0.3)))).astype(int)
MODEL = LogisticRegression().fit(X, y)
MODEL_VERSION = "logreg-1.0"

app = FastAPI()

@@solution
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.linear_model import LogisticRegression

rng = np.random.default_rng(0)
X = np.column_stack([rng.normal(0, 200, 500), rng.normal(0, 1, 500)])
y = (rng.random(500) < 1 / (1 + np.exp(-(0.004 * X[:, 0] + 0.3 * X[:, 1] + 0.3)))).astype(int)
MODEL = LogisticRegression().fit(X, y)
MODEL_VERSION = "logreg-1.0"

app = FastAPI()

class Features(BaseModel):
    elo_diff: float = Field(ge=-800, le=800)
    form_diff: float = Field(ge=-3, le=3)

@app.post("/predict")
async def predict(features: Features):
    p = MODEL.predict_proba([[features.elo_diff, features.form_diff]])[0, 1]
    return {"p_home_win": round(float(p), 4), "model_version": MODEL_VERSION}

@@tests
import httpx

async def post(body):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/predict", json=body)

async def test_prediction():
    """Matches the model's own probability"""
    r = await post({"elo_diff": 120, "form_diff": 0.5})
    assert r.status_code == 200
    expected = round(float(MODEL.predict_proba([[120, 0.5]])[0, 1]), 4)
    assert r.json() == {"p_home_win": expected, "model_version": "logreg-1.0"}

async def test_validation():
    """Out-of-range or missing features are rejected"""
    assert (await post({"elo_diff": 5000, "form_diff": 0})).status_code == 422
    assert (await post({"elo_diff": 0, "form_diff": 9})).status_code == 422
    assert (await post({"elo_diff": 0})).status_code == 422
:::

:::exercise serve-lifespan Load the model at startup
The starter saves a model bundle to `"bundle.joblib"`. Write a `lifespan` function (decorated with `@asynccontextmanager`) that loads the bundle with `joblib.load` and stores it as `app.state.bundle` before yielding. Create `app = FastAPI(lifespan=lifespan)` with `GET /health` returning `{"status": "ok", "model_version": <the bundle's "version">}`. Each time you load the bundle, add 1 to `LOADS["count"]`, so the tests can check it's loaded only once.

@@starter
from contextlib import asynccontextmanager

import joblib
from fastapi import FastAPI, Request

joblib.dump({"version": "poisson-2025.1", "weights": [0.1, 0.2]}, "bundle.joblib")
LOADS = {"count": 0}

@@solution
from contextlib import asynccontextmanager

import joblib
from fastapi import FastAPI, Request

joblib.dump({"version": "poisson-2025.1", "weights": [0.1, 0.2]}, "bundle.joblib")
LOADS = {"count": 0}

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.bundle = joblib.load("bundle.joblib")
    LOADS["count"] += 1
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health(request: Request):
    return {"status": "ok", "model_version": request.app.state.bundle["version"]}

@@tests
import httpx

async def test_loaded_once():
    """Loaded at startup, once, however many requests arrive"""
    before = LOADS["count"]
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            for _ in range(3):
                r = await client.get("/health")
                assert r.status_code == 200
                assert r.json() == {"status": "ok", "model_version": "poisson-2025.1"}
    assert LOADS["count"] == before + 1
:::

:::quiz serve-quiz Quick check
? Why load the model in a lifespan handler instead of inside the endpoint?
- [x] Loading is slow, so do it once at startup rather than on every request
- [ ] Endpoints can't open files
- [ ] It makes the model more accurate
> Every request then reuses the model already in memory.

? Why include the model version in every prediction response?
- [x] So you can trace any prediction back to the model that made it after retraining
- [ ] Clients need it to compute the probabilities
- [ ] HTTP requires it
> Essential for monitoring, debugging and comparing model versions.

? A client sends 50,000 fixtures in one batch request. What's the best protection?
- [x] Cap the batch size in the input model (e.g. `max_length=100`)
- [ ] Process them all and hope
- [ ] Restart the server when it slows down
> Validation limits keep one request from monopolising the server.

? A retraining job takes 20 minutes. How should the API handle a request to start it?
- [x] Return 202 Accepted with a job id, run the job in a task queue, and let clients poll for the result
- [ ] Keep the HTTP request open for 20 minutes
- [ ] Run it inside the endpoint with `async def`
> Long work belongs outside the request–response cycle.
:::
