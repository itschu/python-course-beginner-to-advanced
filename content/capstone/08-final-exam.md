---
title: "Final exam: Python to production ML"
summary: One test across the whole course - Python, pandas, statistics, machine learning, betting models, deep learning and backends - followed by where to go from here.
minutes: 120
kind: checkpoint
---

This is the last test. It covers every phase, from Python basics to serving models. Take it without looking back at the lessons first; afterwards, revisit anything you got wrong.

**Passing standard:** at least four of the five exercises pass, and you score at least 16/20 on the quiz.

:::quiz final-quiz Final quiz
? After `a = [1, 2, 3]`, `b = a` and `b.append(4)`, what is `a`?
- [ ] `[1, 2, 3]`
- [x] `[1, 2, 3, 4]`
- [ ] An error
> `b = a` copies the reference, not the list. Use `a.copy()` or `list(a)` for an independent copy.

? You need to check, millions of times, whether a team name has been seen before. Which structure fits best?
- [x] A set
- [ ] A list
- [ ] A tuple
> Membership tests take constant time on average in a set or dict, but linear time in a list.

? Why give each project its own virtual environment?
- [x] So each project has its own package versions without conflicts
- [ ] It makes Python run faster
- [ ] It's required to use pip
> Isolated, reproducible dependencies per project, pinned in a lock file or requirements file.

? What's the main advantage of a generator over building a full list?
- [x] It produces items one at a time, so memory use stays small
- [ ] It's always faster
- [ ] It can be indexed like a list
> Generators are lazy: ideal for large files and streams.

? What does `df.groupby("team")["goals"].transform("mean")` return?
- [x] A Series with one value per row of `df`: that row's team average
- [ ] One row per team
- [ ] The overall mean
> `transform` keeps the original shape; `agg` reduces to one row per group.

? You left-join fixtures (380 rows) to a ratings table, and get 412 rows. What's the most likely cause?
- [x] Duplicate keys in the ratings table
- [ ] A left join always adds rows
- [ ] Missing values in the fixtures
> Check key uniqueness before merging; `validate="many_to_one"` makes pandas check for you.

? A test gives p = 0.03. What does that mean?
- [x] If the null hypothesis were true, results at least this extreme would occur about 3% of the time
- [ ] There is a 3% chance the null hypothesis is true
- [ ] The effect is large
> A p-value is about the data assuming the null, not the probability of the null.

? To halve the standard error of an average, how much more data do you need?
- [ ] Twice as much
- [x] Four times as much
- [ ] Half as much
> Standard error falls with the square root of the sample size.

? In gradient descent, why do we step in the direction of the negative gradient?
- [x] The gradient points in the direction of steepest increase, so its negative decreases the loss fastest locally
- [ ] It guarantees the global minimum
- [ ] It keeps the weights positive
> And the learning rate controls how far you step.

? What is a validation set for?
- [x] Choosing models and hyperparameters, keeping the test set for one final, unbiased check
- [ ] Training the model on more data
- [ ] Replacing the test set
> Every decision made using a dataset makes its score optimistic.

? A fraud model flags 100 transactions, 80 of them really fraud, out of 200 frauds in total. What are its precision and recall?
- [x] Precision 0.8, recall 0.4
- [ ] Precision 0.4, recall 0.8
- [ ] Both 0.8
> Precision: correct among flagged. Recall: found among all real positives.

? Why does a random forest usually beat a single deep decision tree?
- [x] Averaging many decorrelated trees reduces variance
- [ ] Each tree in the forest is deeper
- [ ] It uses a different loss function
> Bootstrap samples and random feature subsets keep the trees different.

? A bookmaker offers odds of 1.91 on both outcomes of a two-way market. What does that tell you?
- [x] Implied probabilities sum to about 1.047: a margin of roughly 4.7% that must be removed before comparing with your model
- [ ] Both outcomes have exactly a 52% chance
- [ ] The market is fair
> 1/1.91 + 1/1.91 ≈ 1.047. Normalise (or use the power method) to get margin-free probabilities.

? Why is random k-fold cross-validation wrong for match prediction?
- [x] It trains on future matches to predict past ones, so scores are optimistic
- [ ] It uses too little data
- [ ] It's too slow
> Use walk-forward validation that respects time.

? Your estimated edges are systematically too big. What happens with full Kelly staking?
- [x] You overbet exactly where you're most wrong, which can lose money even when flat stakes win
- [ ] Nothing: Kelly corrects for errors
- [ ] You bet too little
> Use fractional Kelly and shrink estimated edges.

? Why do neural networks need non-linear activation functions?
- [x] Without them, any stack of layers collapses to a single linear transformation
- [ ] To make training faster
- [ ] To keep outputs between 0 and 1
> Non-linearity is what lets depth add expressive power.

? Training loss keeps falling but validation loss started rising ten epochs ago. What should you do?
- [x] Use early stopping (restore the best epoch) and consider more regularisation
- [ ] Train for longer
- [ ] Increase the learning rate
> The model is overfitting; the best weights were ten epochs back.

? A POST request to your FastAPI endpoint has `"stake": "ten"` where the Pydantic model declares `stake: float`. What happens?
- [x] FastAPI returns a 422 response, and your function never runs
- [ ] The function runs with `stake="ten"`
- [ ] The server crashes
> Validation at the edge keeps bad data out of your code.

? How should user passwords be stored?
- [x] As salted, deliberately slow hashes such as bcrypt
- [ ] As plain text in a protected table
- [ ] As SHA-256 hashes
> Fast hashes can be brute-forced; bcrypt and similar algorithms are slow by design and salted.

? A challenger beats the champion by 0.002 log loss, with a paired-bootstrap 95% interval of −0.010 to +0.006. What do you do?
- [x] Keep the champion and keep collecting evidence
- [ ] Promote the challenger
- [ ] Retrain both on the test set
> Promote only when the evidence is convincing; small differences are often luck.
:::

:::exercise final-table A league table
Write `league_table(results)`, where `results` is a list of tuples `(home, away, home_goals, away_goals)`. A win is worth 3 points, a draw 1. Return a list of tuples `(team, played, points, goal_difference, goals_for)`, one per team, sorted by points, then goal difference, then goals scored (all highest first), then team name alphabetically.

@@starter
def league_table(results):
    teams = sorted({r[0] for r in results} | {r[1] for r in results})
    return [(team, 0, 0, 0, 0) for team in teams]

@@solution
def league_table(results):
    stats = {}
    for home, away, hg, ag in results:
        for team, scored, conceded in [(home, hg, ag), (away, ag, hg)]:
            s = stats.setdefault(team, {"played": 0, "points": 0, "gf": 0, "ga": 0})
            s["played"] += 1
            s["gf"] += scored
            s["ga"] += conceded
            s["points"] += 3 if scored > conceded else 1 if scored == conceded else 0
    rows = [(team, s["played"], s["points"], s["gf"] - s["ga"], s["gf"]) for team, s in stats.items()]
    return sorted(rows, key=lambda r: (-r[2], -r[3], -r[4], r[0]))

@@tests
RESULTS = [
    ("Ashford City", "Bramley Rovers", 2, 0),
    ("Calder Town", "Dunmore United", 1, 1),
    ("Bramley Rovers", "Calder Town", 3, 1),
    ("Dunmore United", "Ashford City", 0, 0),
    ("Ashford City", "Calder Town", 1, 2),
    ("Bramley Rovers", "Dunmore United", 1, 1),
]

def test_table():
    """Points, then goal difference, then goals scored, then name"""
    assert league_table(RESULTS) == [
        ("Ashford City", 3, 4, 1, 3),
        ("Bramley Rovers", 3, 4, 0, 4),
        ("Calder Town", 3, 4, -1, 4),
        ("Dunmore United", 3, 3, 0, 2),
    ]

def test_name_breaks_full_ties():
    """Identical records are ordered alphabetically"""
    assert league_table([("Zeta", "Alpha", 1, 1)]) == [("Alpha", 1, 1, 0, 1), ("Zeta", 1, 1, 0, 1)]
:::

:::exercise final-form Form features without leakage
Write `add_form(matches)`. `matches` has columns `Date`, `HomeTeam`, `AwayTeam`, `FTHG` and `FTAG`, sorted by date. Return a copy with two new columns: `home_form` and `away_form`, each the team's average goals scored in its **previous** three matches (home or away), using as many as exist if fewer than three, and `NaN` for a team's first match. A match's own result must never be used for its own features. Keep the original row order and index.

@@starter
import pandas as pd

def add_form(matches):
    out = matches.copy()
    out["home_form"] = out.groupby("HomeTeam")["FTHG"].transform(lambda s: s.rolling(3, min_periods=1).mean())
    out["away_form"] = out.groupby("AwayTeam")["FTAG"].transform(lambda s: s.rolling(3, min_periods=1).mean())
    return out

@@solution
import pandas as pd

def add_form(matches):
    home = pd.DataFrame({"row": matches.index, "team": matches["HomeTeam"], "goals": matches["FTHG"], "side": "home"})
    away = pd.DataFrame({"row": matches.index, "team": matches["AwayTeam"], "goals": matches["FTAG"], "side": "away"})
    long = pd.concat([home, away], ignore_index=True)
    long["order"] = long["row"].map({r: i for i, r in enumerate(matches.index)})
    long = long.sort_values(["order", "side"], kind="stable")
    long["form"] = long.groupby("team")["goals"].transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    out = matches.copy()
    out["home_form"] = long[long["side"] == "home"].set_index("row")["form"]
    out["away_form"] = long[long["side"] == "away"].set_index("row")["form"]
    return out

@@tests
import numpy as np
import pandas as pd

M = pd.DataFrame({
    "Date": pd.to_datetime(["2024-08-01", "2024-08-01", "2024-08-08", "2024-08-08", "2024-08-15", "2024-08-22"]),
    "HomeTeam": ["A", "C", "B", "D", "A", "A"],
    "AwayTeam": ["B", "D", "A", "C", "C", "B"],
    "FTHG": [2, 0, 1, 3, 4, 0],
    "FTAG": [1, 0, 3, 2, 1, 2],
}, index=[10, 11, 12, 13, 14, 15])

def test_values():
    """Previous matches only, any venue, up to three"""
    out = add_form(M)
    assert np.allclose(out["home_form"].to_numpy(), [np.nan, np.nan, 1.0, 0.0, 2.5, 3.0], equal_nan=True)
    assert np.allclose(out["away_form"].to_numpy(), [np.nan, np.nan, 2.0, 0.0, 1.0, 1.0], equal_nan=True)

def test_shape_and_copy():
    """Same index and order; input untouched"""
    before = M.copy()
    out = add_form(M)
    assert out.index.tolist() == [10, 11, 12, 13, 14, 15]
    assert M.equals(before)
:::

:::exercise final-pipeline A leak-proof pipeline
Write `make_model(numeric, categorical)` returning an unfitted scikit-learn `Pipeline` that standardises the `numeric` columns, one-hot encodes the `categorical` columns with `OneHotEncoder(handle_unknown="ignore")` (so categories unseen in training don't cause errors), and ends with `LogisticRegression(max_iter=1000)`. It must work directly on a pandas DataFrame.

@@starter
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

def make_model(numeric, categorical):
    return Pipeline([("model", LogisticRegression(max_iter=1000))])

@@solution
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

def make_model(numeric, categorical):
    prep = ColumnTransformer([
        ("num", StandardScaler(), numeric),
        ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
    ])
    return Pipeline([("prep", prep), ("model", LogisticRegression(max_iter=1000))])

@@tests
import numpy as np
import pandas as pd
from sklearn.base import is_classifier
from sklearn.pipeline import Pipeline

rng = np.random.default_rng(0)
n = 400
df = pd.DataFrame({
    "elo_diff": rng.normal(0, 150, n),
    "rest_days": rng.integers(2, 10, n).astype(float),
    "venue": rng.choice(["home", "away"], n),
})
logit = df["elo_diff"] / 100 + np.where(df["venue"] == "home", 0.6, -0.6)
y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)

def test_fits_and_predicts():
    """Works on a DataFrame and learns the signal"""
    model = make_model(["elo_diff", "rest_days"], ["venue"])
    assert isinstance(model, Pipeline) and is_classifier(model)
    model.fit(df.iloc[:300], y[:300])
    assert (model.predict(df.iloc[300:]) == y[300:]).mean() > 0.65

def test_unseen_category():
    """A venue never seen in training doesn't crash"""
    model = make_model(["elo_diff", "rest_days"], ["venue"]).fit(df, y)
    new = pd.DataFrame({"elo_diff": [50.0], "rest_days": [4.0], "venue": ["neutral"]})
    p = model.predict_proba(new)
    assert p.shape == (1, 2) and np.isclose(p.sum(), 1)

def test_scaling_is_learned_from_training_data():
    """The scaler is part of the pipeline, so it's refitted on each training set"""
    model = make_model(["elo_diff", "rest_days"], ["venue"]).fit(df.iloc[:200], y[:200])
    scaler = model.named_steps["prep"].named_transformers_["num"]
    assert np.allclose(scaler.mean_, df.iloc[:200][["elo_diff", "rest_days"]].mean())
:::

:::exercise final-softmax Softmax cross-entropy and its gradient
Write `softmax_cross_entropy(logits, y)`. `logits` has shape `(n, k)` and `y` holds `n` class indices. Return a tuple `(loss, grad)`: the **mean** cross-entropy loss of the softmax probabilities, as a float, and its gradient with respect to `logits`, with shape `(n, k)`. Make it numerically stable: subtract each row's maximum before exponentiating. (The gradient of the mean loss is `(softmax - one_hot) / n`.)

@@starter
import numpy as np

def softmax_cross_entropy(logits, y):
    p = np.exp(logits) / np.exp(logits).sum(axis=1, keepdims=True)
    loss = -np.log(p[np.arange(len(y)), y]).mean()
    return float(loss), p

@@solution
import numpy as np

def softmax_cross_entropy(logits, y):
    logits = np.asarray(logits, dtype=float)
    y = np.asarray(y)
    n = len(y)
    shifted = logits - logits.max(axis=1, keepdims=True)
    log_p = shifted - np.log(np.exp(shifted).sum(axis=1, keepdims=True))
    loss = -log_p[np.arange(n), y].mean()
    grad = np.exp(log_p)
    grad[np.arange(n), y] -= 1
    return float(loss), grad / n

@@tests
import math
import numpy as np
from sklearn.metrics import log_loss

rng = np.random.default_rng(0)
Z = rng.normal(0, 2, (8, 3))
Y = rng.integers(0, 3, 8)

def test_loss():
    """Matches log loss on the softmax probabilities"""
    p = np.exp(Z) / np.exp(Z).sum(axis=1, keepdims=True)
    loss, _ = softmax_cross_entropy(Z, Y)
    assert math.isclose(loss, log_loss(Y, p, labels=[0, 1, 2]), rel_tol=1e-9)

def test_gradient_check():
    """Agrees with a numerical gradient"""
    _, grad = softmax_cross_entropy(Z, Y)
    assert grad.shape == Z.shape
    eps = 1e-6
    for i, j in [(0, 0), (3, 2), (7, 1)]:
        up, down = Z.copy(), Z.copy()
        up[i, j] += eps
        down[i, j] -= eps
        numeric = (softmax_cross_entropy(up, Y)[0] - softmax_cross_entropy(down, Y)[0]) / (2 * eps)
        assert math.isclose(grad[i, j], numeric, rel_tol=1e-4, abs_tol=1e-8)

def test_stability():
    """Huge logits don't overflow"""
    with np.errstate(over="raise", invalid="raise"):
        loss, grad = softmax_cross_entropy(np.array([[1000.0, 0.0, -1000.0]]), np.array([0]))
    assert math.isclose(loss, 0.0, abs_tol=1e-9) and np.all(np.isfinite(grad))
:::

:::exercise final-api A fair-odds API
Create a FastAPI `app` with `POST /fair-odds`. It accepts JSON `{"home": ..., "draw": ..., "away": ...}`: decimal odds, each a float greater than 1 (anything else gets a **422**). Return the margin-free probabilities (normalise the implied probabilities `1/odds` so they sum to 1) and the bookmaker's margin (the implied probabilities' sum minus 1), each rounded to 4 decimal places: `{"home": ..., "draw": ..., "away": ..., "margin": ...}`. Use an `async def` endpoint.

@@starter
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

@@solution
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()

class Odds(BaseModel):
    home: float = Field(gt=1)
    draw: float = Field(gt=1)
    away: float = Field(gt=1)

@app.post("/fair-odds")
async def fair_odds(odds: Odds):
    implied = {k: 1 / v for k, v in odds.model_dump().items()}
    total = sum(implied.values())
    return {**{k: round(v / total, 4) for k, v in implied.items()}, "margin": round(total - 1, 4)}

@@tests
import httpx

async def post(body):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        return await c.post("/fair-odds", json=body)

async def test_fair_probabilities():
    """Margin removed, probabilities sum to 1"""
    r = await post({"home": 2.10, "draw": 3.40, "away": 3.60})
    assert r.status_code == 200
    implied = [1 / 2.10, 1 / 3.40, 1 / 3.60]
    total = sum(implied)
    assert r.json() == {"home": round(implied[0] / total, 4), "draw": round(implied[1] / total, 4),
                        "away": round(implied[2] / total, 4), "margin": round(total - 1, 4)}

async def test_validation():
    """Odds must be numbers above 1"""
    assert (await post({"home": 1.0, "draw": 3.4, "away": 3.6})).status_code == 422
    assert (await post({"home": "evens", "draw": 3.4, "away": 3.6})).status_code == 422
    assert (await post({"home": 2.1, "draw": 3.4})).status_code == 422
:::

## You made it

If you've worked through the whole course, you've gone from `print("Hello")` to:

- writing clean, tested, packaged **Python**;
- cleaning, exploring and visualising data with **pandas**;
- the **maths and statistics** behind the models, and how to judge evidence;
- **classical ML** with scikit-learn: pipelines, cross-validation, boosting, tuning;
- **applied ML** on betting and FX data: goal models, calibration, blending, value bets, honest backtests;
- **deep learning** from scratch and in PyTorch: CNNs, sequences, transformers, transfer learning;
- **backends** with FastAPI: validation, databases, authentication, tests, serving models and Docker;
- and a **capstone** system with a pipeline, weekly retraining, champion/challenger evaluation and monitoring.

Most importantly, you've learned to be **skeptical of your own results**: to ask what was known at prediction time, what the baseline is, and whether a difference is bigger than luck. That habit separates professionals from people who just fit models.

**Where next:** follow the 90-day plan from the last lesson. Build something of your own, enter a competition, read a paper a month, and write about what you learn. Good luck.
