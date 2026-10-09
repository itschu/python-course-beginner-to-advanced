---
title: "Goal models: Poisson regression and Dixon–Coles"
summary: Fit every team's attack and defence at once with time-weighted Poisson regression, correct for low-scoring draws with Dixon–Coles, and price any market from the score matrix.
minutes: 65
kind: lesson
---

In Phase 4 you estimated team strengths with simple averages from one season, and they were too noisy to help. Now you'll do it properly: fit **all teams' attack and defence ratings jointly** with a Poisson regression on several seasons, weighting recent matches more heavily. This is essentially the model in Maher (1982) and Dixon & Coles (1997), still a core of professional football modelling.

## The model

For a match between home team $i$ and away team $j$:

$$
\log \lambda_{\text{home}} = \mu + h + a_i - d_j
\qquad
\log \lambda_{\text{away}} = \mu + a_j - d_i
$$

where $a$ is attack strength, $d$ is defence strength, $h$ is home advantage and $\mu$ is a baseline. Goals are Poisson with those means. Taking logs turns multiplication into addition, so this is a **Poisson regression** (a generalised linear model) on indicator columns:

- one column per team for **attack** (1 for the team that's scoring),
- one column per team for **defence** (1 for the team that's conceding; its weight will be $-d$),
- one **home** column (1 for the home side's goals).

Each match contributes two rows: the home team's goals and the away team's goals.

```python
import numpy as np
import pandas as pd

def team_design(df, teams):
    """Two design matrices: rows predicting home goals and rows predicting away goals."""
    index = {t: i for i, t in enumerate(teams)}
    n, T = len(df), len(teams)
    home = df["HomeTeam"].map(index).to_numpy()
    away = df["AwayTeam"].map(index).to_numpy()
    rows = np.arange(n)
    X_home = np.zeros((n, 2 * T + 1))
    X_away = np.zeros((n, 2 * T + 1))
    X_home[rows, home] = 1          # home attack
    X_home[rows, T + away] = 1      # away defence
    X_home[:, 2 * T] = 1            # home advantage
    X_away[rows, away] = 1          # away attack
    X_away[rows, T + home] = 1      # home defence
    return X_home, X_away

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
teams = sorted(df["HomeTeam"].unique())
X_home, X_away = team_design(df.head(2), teams)
print(df.head(2)[["HomeTeam", "AwayTeam"]])
print("non-zero columns, row 0 (home goals):", np.flatnonzero(X_home[0]))
print("non-zero columns, row 0 (away goals):", np.flatnonzero(X_away[0]))
```

## Fitting with time decay

scikit-learn's `PoissonRegressor` fits it. Two details matter:

- **Time decay:** give each match a weight $e^{-\xi \cdot \text{age in days}}$, so last month counts more than two seasons ago. $\xi$ is a hyperparameter; a half-life of a few months to a year is typical.
- **A little regularisation** (`alpha`) keeps ratings for teams with few matches from going wild.

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor

def team_design(df, teams):
    index = {t: i for i, t in enumerate(teams)}
    n, T = len(df), len(teams)
    h, a, r = df["HomeTeam"].map(index).to_numpy(), df["AwayTeam"].map(index).to_numpy(), np.arange(n)
    Xh, Xa = np.zeros((n, 2 * T + 1)), np.zeros((n, 2 * T + 1))
    Xh[r, h], Xh[r, T + a], Xh[:, 2 * T] = 1, 1, 1
    Xa[r, a], Xa[r, T + h] = 1, 1
    return Xh, Xa

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
teams = sorted(df["HomeTeam"].unique())
train = df[df["Date"] < "2024-08-01"]
ref_date = pd.Timestamp("2024-08-01")

Xh, Xa = team_design(train, teams)
X = np.vstack([Xh, Xa])
y = np.concatenate([train["FTHG"], train["FTAG"]])
weights = np.exp(-0.004 * (ref_date - train["Date"]).dt.days.to_numpy())
model = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(X, y, sample_weight=np.concatenate([weights, weights]))

T = len(teams)
ratings = pd.DataFrame({"attack": model.coef_[:T], "defence": -model.coef_[T:2 * T]}, index=teams)
print(f"home advantage: x{np.exp(model.coef_[-1]):.2f} goals")
print(ratings.sort_values("attack", ascending=False).round(2).head())
```

A half-life of about $\ln 2 / 0.004 \approx 173$ days means a match from a year ago counts about a quarter as much as yesterday's.

## Probabilities for every market

The fitted model gives $\lambda_{\text{home}}$ and $\lambda_{\text{away}}$ for any fixture. As in Phase 4, the score matrix then prices every market: result, over/under, both teams to score, correct score:

```python
import numpy as np
from scipy import stats

def score_matrix(lam_home, lam_away, max_goals=10):
    g = np.arange(max_goals + 1)
    m = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    return m / m.sum()                    # renormalise after truncating at max_goals

m = score_matrix(1.65, 1.10)
g = np.arange(m.shape[0])
total = g[:, None] + g[None, :]
print(f"H {np.tril(m, -1).sum():.3f}  D {np.trace(m):.3f}  A {np.triu(m, 1).sum():.3f}")
print(f"over 2.5 goals {m[total > 2.5].sum():.3f}, both teams score {m[1:, 1:].sum():.3f}")
print(f"most likely score {np.unravel_index(m.argmax(), m.shape)} with probability {m.max():.3f}")
```

## Dixon–Coles: fixing low scores

Real football has slightly more 0–0 and 1–1 draws (and fewer 1–0 and 0–1 results) than two independent Poissons predict. Dixon and Coles adjusted the four low-scoring cells with a factor $\tau$ controlled by one parameter $\rho$:

| Score | $\tau$ |
| --- | --- |
| 0–0 | $1 - \lambda_H \lambda_A \rho$ |
| 0–1 | $1 + \lambda_H \rho$ |
| 1–0 | $1 + \lambda_A \rho$ |
| 1–1 | $1 - \rho$ |
| anything else | 1 |

A negative $\rho$ (around −0.1 in real leagues) boosts 0–0 and 1–1:

```python
import numpy as np
from scipy import stats

def dixon_coles_matrix(lam_home, lam_away, rho, max_goals=10):
    g = np.arange(max_goals + 1)
    m = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    m[0, 0] *= 1 - lam_home * lam_away * rho
    m[0, 1] *= 1 + lam_home * rho
    m[1, 0] *= 1 + lam_away * rho
    m[1, 1] *= 1 - rho
    return m / m.sum()

for rho in [0.0, -0.1]:
    m = dixon_coles_matrix(1.4, 1.1, rho)
    print(f"rho={rho:+.1f}: P(0-0)={m[0, 0]:.3f}, P(1-1)={m[1, 1]:.3f}, P(draw)={np.trace(m):.3f}")
```

$\rho$ is estimated by maximum likelihood: pick the value that makes the observed scorelines most probable. Our synthetic league was simulated *without* this effect, so you'll find $\rho \approx 0$ here. On real data you'd expect it to be clearly negative, and the correction improves draw probabilities.

## Walk-forward evaluation

Put it together: refit monthly on everything before the month, predict the month's matches, and compare with the bookmaker:

```python
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import log_loss

def team_design(df, teams):
    index = {t: i for i, t in enumerate(teams)}
    n, T = len(df), len(teams)
    h, a, r = df["HomeTeam"].map(index).to_numpy(), df["AwayTeam"].map(index).to_numpy(), np.arange(n)
    Xh, Xa = np.zeros((n, 2 * T + 1)), np.zeros((n, 2 * T + 1))
    Xh[r, h], Xh[r, T + a], Xh[:, 2 * T] = 1, 1, 1
    Xa[r, a], Xa[r, T + h] = 1, 1
    return Xh, Xa

def outcome_probs(lam_h, lam_a, max_goals=10):
    g = np.arange(max_goals + 1)
    out = []
    for lh, la in zip(lam_h, lam_a):
        m = np.outer(stats.poisson(lh).pmf(g), stats.poisson(la).pmf(g))
        m /= m.sum()
        out.append((np.triu(m, 1).sum(), np.trace(m), np.tril(m, -1).sum()))   # A, D, H
    return np.array(out)

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
teams = sorted(df["HomeTeam"].unique())
test = df[df["Season"] == "2024-25"]

def walk_forward(xi):
    probs = []
    for _, chunk in test.groupby(test["Date"].dt.to_period("M")):
        start = chunk["Date"].min()
        train = df[df["Date"] < start]
        Xh, Xa = team_design(train, teams)
        w = np.exp(-xi * (start - train["Date"]).dt.days.to_numpy())
        model = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(
            np.vstack([Xh, Xa]), np.concatenate([train["FTHG"], train["FTAG"]]), sample_weight=np.concatenate([w, w]))
        ch, ca = team_design(chunk, teams)
        probs.append(outcome_probs(model.predict(ch), model.predict(ca)))
    return np.vstack(probs)

labels = ["A", "D", "H"]
for xi in [0.0, 0.004]:
    print(f"Poisson model, xi={xi}: log loss {log_loss(test['FTR'], walk_forward(xi), labels=labels):.4f}")
implied = 1 / test[["AvgA", "AvgD", "AvgH"]].to_numpy()
print(f"bookmaker:              log loss {log_loss(test['FTR'], implied / implied.sum(axis=1, keepdims=True), labels=labels):.4f}")
```

Time decay helps, and the pooled, regularised Poisson model is the best model in this course so far, but the bookmaker is still ahead. Next lesson: calibrating the model and **blending** it with the market, which combines the strengths of both.

## Practice

:::exercise goal-design Build the design matrices
Write `team_design(df, teams)` returning `(X_home, X_away)` as described in the lesson: shape `(len(df), 2 * len(teams) + 1)`, with attack columns first (in the order of `teams`), then defence columns, then the home column.

@@starter
import numpy as np

def team_design(df, teams):
    n = len(df)
    width = 2 * len(teams) + 1
    return np.zeros((n, width)), np.zeros((n, width))

@@solution
import numpy as np

def team_design(df, teams):
    index = {t: i for i, t in enumerate(teams)}
    n, T = len(df), len(teams)
    home = df["HomeTeam"].map(index).to_numpy()
    away = df["AwayTeam"].map(index).to_numpy()
    rows = np.arange(n)
    X_home = np.zeros((n, 2 * T + 1))
    X_away = np.zeros((n, 2 * T + 1))
    X_home[rows, home] = 1
    X_home[rows, T + away] = 1
    X_home[:, 2 * T] = 1
    X_away[rows, away] = 1
    X_away[rows, T + home] = 1
    return X_home, X_away

@@tests
import numpy as np
import pandas as pd

def test_small():
    """Places the ones in the right columns"""
    df = pd.DataFrame({"HomeTeam": ["B", "A"], "AwayTeam": ["C", "B"]})
    Xh, Xa = team_design(df, ["A", "B", "C"])
    assert Xh.shape == (2, 7) and Xa.shape == (2, 7)
    assert Xh[0].tolist() == [0, 1, 0, 0, 0, 1, 1]
    assert Xa[0].tolist() == [0, 0, 1, 0, 1, 0, 0]
    assert Xh[1].tolist() == [1, 0, 0, 0, 1, 0, 1]

def test_row_sums():
    """Home rows have three ones, away rows two"""
    df = pd.read_csv("data/matches.csv")
    teams = sorted(df["HomeTeam"].unique())
    Xh, Xa = team_design(df, teams)
    assert (Xh.sum(axis=1) == 3).all() and (Xa.sum(axis=1) == 2).all()
:::

:::exercise goal-dc Dixon–Coles score matrix
Write `dixon_coles_matrix(lam_home, lam_away, rho, max_goals=10)` returning the adjusted, renormalised score matrix (rows: home goals, columns: away goals), and `markets(m)` returning a dictionary with `"H"`, `"D"`, `"A"`, `"over_2_5"` and `"btts"` (both teams score), each rounded to 4 decimals.

@@starter
import numpy as np
from scipy import stats

def dixon_coles_matrix(lam_home, lam_away, rho, max_goals=10):
    g = np.arange(max_goals + 1)
    return np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))

def markets(m):
    return {}

@@solution
import numpy as np
from scipy import stats

def dixon_coles_matrix(lam_home, lam_away, rho, max_goals=10):
    g = np.arange(max_goals + 1)
    m = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    m[0, 0] *= 1 - lam_home * lam_away * rho
    m[0, 1] *= 1 + lam_home * rho
    m[1, 0] *= 1 + lam_away * rho
    m[1, 1] *= 1 - rho
    return m / m.sum()

def markets(m):
    g = np.arange(m.shape[0])
    total = g[:, None] + g[None, :]
    return {
        "H": round(float(np.tril(m, -1).sum()), 4),
        "D": round(float(np.trace(m)), 4),
        "A": round(float(np.triu(m, 1).sum()), 4),
        "over_2_5": round(float(m[total > 2.5].sum()), 4),
        "btts": round(float(m[1:, 1:].sum()), 4),
    }

@@tests
import numpy as np
from scipy import stats

def test_sums_to_one():
    """The matrix is a probability distribution"""
    m = dixon_coles_matrix(1.5, 1.2, -0.1)
    assert np.isclose(m.sum(), 1) and (m >= 0).all()

def test_rho_zero_is_poisson():
    """rho = 0 gives independent Poissons (renormalised)"""
    g = np.arange(11)
    ref = np.outer(stats.poisson(1.5).pmf(g), stats.poisson(1.2).pmf(g))
    assert np.allclose(dixon_coles_matrix(1.5, 1.2, 0.0), ref / ref.sum())

def test_negative_rho_adds_draws():
    """Negative rho raises the draw probability"""
    assert markets(dixon_coles_matrix(1.3, 1.1, -0.12))["D"] > markets(dixon_coles_matrix(1.3, 1.1, 0.0))["D"]

def test_markets_consistent():
    """H + D + A = 1"""
    out = markets(dixon_coles_matrix(1.8, 0.9, -0.05))
    assert abs(out["H"] + out["D"] + out["A"] - 1) < 1e-3 and 0 < out["btts"] < 1
:::

:::exercise goal-rho Estimate rho
Write `estimate_rho(lam_home, lam_away, home_goals, away_goals, grid)`. For each `rho` in `grid`, compute the total log-likelihood of the observed scorelines: the sum over matches of `log(m[home_goals, away_goals])` using `dixon_coles_matrix` (provided). Return the `rho` with the highest log-likelihood.

@@starter
import numpy as np
from scipy import stats

def dixon_coles_matrix(lam_home, lam_away, rho, max_goals=10):
    g = np.arange(max_goals + 1)
    m = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    m[0, 0] *= 1 - lam_home * lam_away * rho
    m[0, 1] *= 1 + lam_home * rho
    m[1, 0] *= 1 + lam_away * rho
    m[1, 1] *= 1 - rho
    return m / m.sum()

def estimate_rho(lam_home, lam_away, home_goals, away_goals, grid):
    return 0.0

@@solution
import numpy as np
from scipy import stats

def dixon_coles_matrix(lam_home, lam_away, rho, max_goals=10):
    g = np.arange(max_goals + 1)
    m = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    m[0, 0] *= 1 - lam_home * lam_away * rho
    m[0, 1] *= 1 + lam_home * rho
    m[1, 0] *= 1 + lam_away * rho
    m[1, 1] *= 1 - rho
    return m / m.sum()

def estimate_rho(lam_home, lam_away, home_goals, away_goals, grid):
    best_rho, best_ll = None, -np.inf
    for rho in grid:
        ll = 0.0
        for lh, la, hg, ag in zip(lam_home, lam_away, home_goals, away_goals):
            ll += np.log(dixon_coles_matrix(lh, la, rho)[min(hg, 10), min(ag, 10)])
        if ll > best_ll:
            best_rho, best_ll = rho, ll
    return best_rho

@@tests
import numpy as np

GRID = [-0.2, -0.15, -0.1, -0.05, 0.0, 0.05, 0.1]

def test_independent_data():
    """Independent Poisson scores give rho near 0"""
    rng = np.random.default_rng(0)
    n = 800
    lh, la = np.full(n, 1.4), np.full(n, 1.1)
    hg, ag = rng.poisson(lh), rng.poisson(la)
    assert abs(estimate_rho(lh, la, hg, ag, GRID)) <= 0.05

def test_extra_low_draws():
    """Extra 0-0 and 1-1 results push rho negative"""
    rng = np.random.default_rng(1)
    n = 800
    lh, la = np.full(n, 1.4), np.full(n, 1.1)
    hg, ag = rng.poisson(lh), rng.poisson(la)
    swap = rng.random(n) < 0.12
    hg[swap] = ag[swap] = rng.integers(0, 2, swap.sum())
    assert estimate_rho(lh, la, hg, ag, GRID) < 0
:::

:::quiz goal-quiz Quick check
? Why is the goal model a Poisson *regression*?
- [x] Log expected goals is a linear combination of attack, defence and home indicators
- [ ] Because goals are normally distributed
- [ ] Because it uses decision trees
> Taking logs turns the multiplicative model into a linear one.

? What does the time-decay parameter ξ do?
- [x] Gives recent matches more weight than old ones
- [ ] Removes old teams
- [ ] Changes the number of goals
> Weight = e^(−ξ × age in days).

? A negative Dixon–Coles ρ:
- [x] Increases the probability of 0–0 and 1–1
- [ ] Increases 1–0 and 0–1
- [ ] Has no effect on draws
> It corrects the independent Poisson model's shortage of low-scoring draws.

? Once you have a score matrix, which markets can you price?
- [x] Match result, over/under, both teams to score and correct score
- [ ] Only the match result
> That's the beauty of modelling goals rather than results.
:::
