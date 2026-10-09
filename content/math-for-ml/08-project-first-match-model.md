---
title: "Project: a first football model, tested honestly"
summary: Estimate team strengths, turn them into match probabilities with a Poisson model, choose a setting on one season and test on the next, score against the bookmaker with log loss, and check whether any profit is skill or luck.
minutes: 150
kind: project
---

This project puts the whole phase to work. You'll build a classic model:

1. Measure each team's **attack** and **defence** strength from one season.
2. Turn strengths into **expected goals** ($\lambda$) for a match.
3. Use two Poisson distributions to get **home/draw/away probabilities**.
4. **Evaluate** the probabilities on the *next* season with log loss, against two benchmarks: league base rates, and the bookmaker.
5. Check whether betting on the model's "value" picks shows skill or luck.

The honest workflow matters as much as the model: choose settings on one season (**validation**), then test once on another (**test**). You'll meet this again, formally, in Phase 5.

## Step 1: Team strengths

A team's **home attack** strength is its average goals scored at home divided by the league's average home goals. Above 1 means better than average. Similarly:

| Strength | Definition |
| --- | --- |
| `home_attack` | team's home goals scored per game ÷ league home goals per game |
| `home_defence` | team's home goals **conceded** per game ÷ league away goals per game |
| `away_attack` | team's away goals scored per game ÷ league away goals per game |
| `away_defence` | team's away goals **conceded** per game ÷ league home goals per game |

For defence, lower is better (fewer goals conceded than average).

:::exercise fm-strengths Calculate strengths
Write `team_strengths(train)` returning a DataFrame indexed by team with the columns `home_attack`, `home_defence`, `away_attack` and `away_defence`, as defined above. Also return the league averages: the function returns a tuple `(strengths, mu_home, mu_away)` where `mu_home` and `mu_away` are the mean home and away goals per game.

@@starter
import pandas as pd

def team_strengths(train):
    mu_home = 0.0
    mu_away = 0.0
    strengths = pd.DataFrame()
    return strengths, mu_home, mu_away

@@solution
import pandas as pd

def team_strengths(train):
    mu_home = train["FTHG"].mean()
    mu_away = train["FTAG"].mean()
    home = train.groupby("HomeTeam").agg(scored=("FTHG", "mean"), conceded=("FTAG", "mean"))
    away = train.groupby("AwayTeam").agg(scored=("FTAG", "mean"), conceded=("FTHG", "mean"))
    strengths = pd.DataFrame({
        "home_attack": home["scored"] / mu_home,
        "home_defence": home["conceded"] / mu_away,
        "away_attack": away["scored"] / mu_away,
        "away_defence": away["conceded"] / mu_home,
    })
    return strengths, mu_home, mu_away

@@tests
import numpy as np
import pandas as pd

def load():
    df = pd.read_csv("data/matches.csv")
    return df[df["Season"] == "2023-24"]

def test_averages():
    """League averages"""
    train = load()
    _, mu_h, mu_a = team_strengths(train)
    assert np.isclose(mu_h, train["FTHG"].mean()) and np.isclose(mu_a, train["FTAG"].mean())

def test_columns():
    """Four strength columns for 20 teams"""
    s, _, _ = team_strengths(load())
    assert list(s.columns) == ["home_attack", "home_defence", "away_attack", "away_defence"], list(s.columns)
    assert len(s) == 20

def test_values():
    """Strengths for one team"""
    train = load()
    s, mu_h, mu_a = team_strengths(train)
    t = "Ashford City"
    h, a = train[train["HomeTeam"] == t], train[train["AwayTeam"] == t]
    assert np.isclose(s.loc[t, "home_attack"], h["FTHG"].mean() / mu_h)
    assert np.isclose(s.loc[t, "home_defence"], h["FTAG"].mean() / mu_a)
    assert np.isclose(s.loc[t, "away_attack"], a["FTAG"].mean() / mu_a)
    assert np.isclose(s.loc[t, "away_defence"], a["FTHG"].mean() / mu_h)

def test_average_is_one():
    """Strengths average to 1 across teams"""
    s, _, _ = team_strengths(load())
    assert np.allclose(s.mean(), 1, atol=1e-9)
:::

## Step 2: Expected goals, with shrinkage

The expected goals for a match multiply the relevant strengths:

$$
\lambda_{\text{home}} = \text{home\_attack}_H \times \text{away\_defence}_A \times \mu_{\text{home}}
\qquad
\lambda_{\text{away}} = \text{away\_attack}_A \times \text{home\_defence}_H \times \mu_{\text{away}}
$$

One season is a small sample, so strengths are noisy: a team that got lucky looks stronger than it is, and it won't stay that lucky. A simple fix is to **shrink** each strength towards 1 (average): $s' = 1 + k(s - 1)$, with $k$ between 0 (everyone is average) and 1 (trust the data fully). Shrinkage is a form of **regularisation**, one of the most important ideas in ML.

:::exercise fm-lambdas Expected goals
Write `expected_goals(strengths, home, away, mu_home, mu_away, shrink=1.0)` returning the tuple `(lambda_home, lambda_away)`. Shrink every strength with $s' = 1 + \text{shrink} \times (s - 1)$ before multiplying.

@@starter
def expected_goals(strengths, home, away, mu_home, mu_away, shrink=1.0):
    return mu_home, mu_away

@@solution
def expected_goals(strengths, home, away, mu_home, mu_away, shrink=1.0):
    def s(team, col):
        return 1 + shrink * (strengths.loc[team, col] - 1)
    lam_home = s(home, "home_attack") * s(away, "away_defence") * mu_home
    lam_away = s(away, "away_attack") * s(home, "home_defence") * mu_away
    return lam_home, lam_away

@@tests
import math
import pandas as pd

S = pd.DataFrame({
    "home_attack": [1.5, 0.8], "home_defence": [0.7, 1.2],
    "away_attack": [1.3, 0.9], "away_defence": [0.8, 1.4],
}, index=["A", "B"])

def test_full_trust():
    """shrink=1 uses the raw strengths"""
    lh, la = expected_goals(S, "A", "B", 1.5, 1.2)
    assert math.isclose(lh, 1.5 * 1.4 * 1.5) and math.isclose(la, 0.9 * 0.7 * 1.2)

def test_full_shrink():
    """shrink=0 gives league averages"""
    assert expected_goals(S, "A", "B", 1.5, 1.2, shrink=0) == (1.5, 1.2)

def test_half():
    """shrink=0.5 halves each deviation from 1"""
    lh, _ = expected_goals(S, "A", "B", 1.5, 1.2, shrink=0.5)
    assert math.isclose(lh, 1.25 * 1.2 * 1.5)
:::

## Step 3: Predict a season

:::exercise fm-predict Predict every match
Write `predict(train, test, shrink)`. Using strengths from `train`, return a DataFrame with one row per match in `test` (keep `test`'s index) and columns `pH`, `pD`, `pA`: the Poisson model's probabilities (use goals 0 to 10, as in the distributions lesson). Skip matches involving a team that isn't in `train`.

A helper `outcome_probs(lam_home, lam_away)` is provided.

@@starter
import numpy as np
import pandas as pd
from scipy import stats

def outcome_probs(lam_home, lam_away):
    g = np.arange(11)
    m = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    return np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()

def team_strengths(train):
    mu_home, mu_away = train["FTHG"].mean(), train["FTAG"].mean()
    home = train.groupby("HomeTeam").agg(scored=("FTHG", "mean"), conceded=("FTAG", "mean"))
    away = train.groupby("AwayTeam").agg(scored=("FTAG", "mean"), conceded=("FTHG", "mean"))
    strengths = pd.DataFrame({
        "home_attack": home["scored"] / mu_home, "home_defence": home["conceded"] / mu_away,
        "away_attack": away["scored"] / mu_away, "away_defence": away["conceded"] / mu_home,
    })
    return strengths, mu_home, mu_away

def predict(train, test, shrink):
    return pd.DataFrame(columns=["pH", "pD", "pA"])

@@solution
import numpy as np
import pandas as pd
from scipy import stats

def outcome_probs(lam_home, lam_away):
    g = np.arange(11)
    m = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    return np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()

def team_strengths(train):
    mu_home, mu_away = train["FTHG"].mean(), train["FTAG"].mean()
    home = train.groupby("HomeTeam").agg(scored=("FTHG", "mean"), conceded=("FTAG", "mean"))
    away = train.groupby("AwayTeam").agg(scored=("FTAG", "mean"), conceded=("FTHG", "mean"))
    strengths = pd.DataFrame({
        "home_attack": home["scored"] / mu_home, "home_defence": home["conceded"] / mu_away,
        "away_attack": away["scored"] / mu_away, "away_defence": away["conceded"] / mu_home,
    })
    return strengths, mu_home, mu_away

def predict(train, test, shrink):
    strengths, mu_h, mu_a = team_strengths(train)
    s = 1 + shrink * (strengths - 1)
    rows = {}
    for idx, match in test.iterrows():
        h, a = match["HomeTeam"], match["AwayTeam"]
        if h not in s.index or a not in s.index:
            continue
        lam_h = s.loc[h, "home_attack"] * s.loc[a, "away_defence"] * mu_h
        lam_a = s.loc[a, "away_attack"] * s.loc[h, "home_defence"] * mu_a
        rows[idx] = outcome_probs(lam_h, lam_a)
    return pd.DataFrame.from_dict(rows, orient="index", columns=["pH", "pD", "pA"])

@@tests
import numpy as np
import pandas as pd

def data():
    df = pd.read_csv("data/matches.csv")
    return df[df["Season"] == "2023-24"], df[df["Season"] == "2024-25"]

def test_shape():
    """One row per test match, probabilities summing to ~1"""
    train, test = data()
    p = predict(train, test, 0.5)
    assert list(p.columns) == ["pH", "pD", "pA"] and len(p) == 380
    assert np.allclose(p.sum(axis=1), 1, atol=1e-3)
    assert list(p.index) == list(test.index)

def test_one_match():
    """Matches a manual calculation"""
    train, test = data()
    p = predict(train, test, 1.0)
    idx = test.index[0]
    h, a = test.loc[idx, "HomeTeam"], test.loc[idx, "AwayTeam"]
    s, mh, ma = team_strengths(train)
    exp = outcome_probs(s.loc[h, "home_attack"] * s.loc[a, "away_defence"] * mh, s.loc[a, "away_attack"] * s.loc[h, "home_defence"] * ma)
    assert np.allclose(p.loc[idx].to_numpy(), exp)

def test_unknown_team_skipped():
    """Matches with unknown teams are skipped"""
    train, test = data()
    extra = test.head(2).copy()
    extra.loc[extra.index[0], "HomeTeam"] = "Promoted FC"
    assert len(predict(train, extra, 0.5)) == 1
:::

## Step 4: Score the probabilities

**Log loss** for multi-class outcomes is the average of $-\ln p$, where $p$ is the probability the forecast gave to what actually happened. Lower is better. A forecaster who always said "one third each" scores $\ln 3 \approx 1.099$.

:::exercise fm-score Log loss and benchmarks
Write:

- `outcome_log_loss(probs, results)`: `probs` is a DataFrame with columns `pH`, `pD`, `pA`; `results` is a Series of `"H"`, `"D"`, `"A"` with the same index. Return the mean of $-\ln p_{\text{actual}}$ as a float.
- `market_probs(test)`: the bookmaker's margin-free probabilities as a DataFrame with columns `pH`, `pD`, `pA` (each implied probability divided by their row total).
- `base_rate_probs(train, test)`: every row gets the training season's share of H, D and A results.

@@starter
import numpy as np
import pandas as pd

def outcome_log_loss(probs, results):
    return 0.0

def market_probs(test):
    return pd.DataFrame()

def base_rate_probs(train, test):
    return pd.DataFrame()

@@solution
import numpy as np
import pandas as pd

def outcome_log_loss(probs, results):
    cols = results.map({"H": "pH", "D": "pD", "A": "pA"})
    chosen = [probs.loc[i, c] for i, c in cols.items()]
    return float(-np.mean(np.log(chosen)))

def market_probs(test):
    implied = 1 / test[["AvgH", "AvgD", "AvgA"]]
    fair = implied.div(implied.sum(axis=1), axis=0)
    fair.columns = ["pH", "pD", "pA"]
    return fair

def base_rate_probs(train, test):
    rates = [(train["FTR"] == r).mean() for r in ["H", "D", "A"]]
    return pd.DataFrame([rates] * len(test), index=test.index, columns=["pH", "pD", "pA"])

@@tests
import math
import numpy as np
import pandas as pd

def data():
    df = pd.read_csv("data/matches.csv")
    return df[df["Season"] == "2023-24"], df[df["Season"] == "2024-25"]

def test_uniform():
    """A one-third forecaster scores ln 3"""
    _, test = data()
    uniform = pd.DataFrame(1 / 3, index=test.index, columns=["pH", "pD", "pA"])
    assert math.isclose(outcome_log_loss(uniform, test["FTR"]), math.log(3))

def test_market():
    """Market probabilities sum to 1 and score well"""
    _, test = data()
    m = market_probs(test)
    assert list(m.columns) == ["pH", "pD", "pA"] and np.allclose(m.sum(axis=1), 1)
    assert outcome_log_loss(m, test["FTR"]) < 1.06

def test_base_rates():
    """Base rates come from the training season"""
    train, test = data()
    b = base_rate_probs(train, test)
    assert len(b) == len(test) and np.isclose(b["pH"].iloc[0], (train["FTR"] == "H").mean())
:::

Now compare, choosing the shrinkage on a **validation** season and testing it once:

```python
import numpy as np
import pandas as pd
from scipy import stats

df = pd.read_csv("data/matches.csv")

def outcome_probs(lh, la):
    g = np.arange(11)
    m = np.outer(stats.poisson(lh).pmf(g), stats.poisson(la).pmf(g))
    return np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()

def predict(train, test, shrink):
    mh, ma = train["FTHG"].mean(), train["FTAG"].mean()
    home = train.groupby("HomeTeam").agg(s=("FTHG", "mean"), c=("FTAG", "mean"))
    away = train.groupby("AwayTeam").agg(s=("FTAG", "mean"), c=("FTHG", "mean"))
    st = pd.DataFrame({"ha": home["s"] / mh, "hd": home["c"] / ma, "aa": away["s"] / ma, "ad": away["c"] / mh})
    st = 1 + shrink * (st - 1)
    rows = {i: outcome_probs(st.loc[r.HomeTeam, "ha"] * st.loc[r.AwayTeam, "ad"] * mh,
                             st.loc[r.AwayTeam, "aa"] * st.loc[r.HomeTeam, "hd"] * ma)
            for i, r in test.iterrows()}
    return pd.DataFrame.from_dict(rows, orient="index", columns=["pH", "pD", "pA"])

def log_loss(p, results):
    return -np.mean(np.log([p.loc[i, {"H": "pH", "D": "pD", "A": "pA"}[r]] for i, r in results.items()]))

s1, s2, s3 = (df[df["Season"] == s] for s in ["2022-23", "2023-24", "2024-25"])

print("Validation (train 2022-23, score 2023-24):")
scores = {k: log_loss(predict(s1, s2, k), s2["FTR"]) for k in [1.0, 0.75, 0.5, 0.25, 0.0]}
for k, v in scores.items():
    print(f"  shrink {k:.2f}: log loss {v:.4f}")
best = min(scores, key=scores.get)
print(f"chosen shrink: {best}")

implied = 1 / s3[["AvgH", "AvgD", "AvgA"]]
market = implied.div(implied.sum(axis=1), axis=0).set_axis(["pH", "pD", "pA"], axis=1)
base = pd.DataFrame([[(s2["FTR"] == r).mean() for r in "HDA"]] * len(s3), index=s3.index, columns=["pH", "pD", "pA"])
print("\nTest (train 2023-24, score 2024-25), run once:")
print(f"  model (shrink {best}): {log_loss(predict(s2, s3, best), s3['FTR']):.4f}")
print(f"  base rates:          {log_loss(base, s3['FTR']):.4f}")
print(f"  bookmaker:           {log_loss(market, s3['FTR']):.4f}")
```

Expect a humbling result. On validation, unshrunk strengths are much worse than base rates, and the more you shrink the better it gets: validation picks a shrinkage of **0**, which means ignoring team strengths entirely and predicting every match from league-average goal rates (plus home advantage). Each team has only 19 home and 19 away matches in a season, so its venue-specific averages are mostly noise.

On the test season, a little team information (shrinkage around 0.25 to 0.5) would actually have scored slightly better. You can check, but you're **not allowed to use that**: choosing settings by looking at the test set is how backtests end up lying. Either way, the bookmaker is clearly ahead, because the market uses far more information than one season of goals. That's the starting point for Phase 6, where you'll pool more seasons, use Elo ratings and time-weighting, and add the Dixon–Coles correction.

## Step 5: Skill or luck?

Suppose you bet one unit whenever the model's expected value is above 5% (model probability × odds − 1 > 0.05). Did it make money, and could that be luck?

:::exercise fm-skill Test the betting record
Write `value_bets(model, test, threshold)`: for each match, find the outcome with the highest model EV ($p \times \text{odds} - 1$, using `AvgH/AvgD/AvgA`). If that EV exceeds `threshold`, it's a bet. Return a DataFrame (index = match index) with columns `outcome` (`"H"`, `"D"` or `"A"`), `odds`, `fair_p` (the market's margin-free probability for that outcome) and `won` (bool).

Then write `luck_p_value(bets, n_sims, seed)`: the actual profit is the sum of `odds - 1` for won bets minus 1 for lost bets. Simulate `n_sims` seasons in which each bet wins with probability `fair_p` (use `rng = np.random.default_rng(seed)` and `rng.random((n_sims, len(bets))) < fair_p`). Return the share of simulated profits **greater than or equal to** the actual profit, rounded to 3 decimals.

@@starter
import numpy as np
import pandas as pd

def value_bets(model, test, threshold):
    return pd.DataFrame(columns=["outcome", "odds", "fair_p", "won"])

def luck_p_value(bets, n_sims, seed):
    return 1.0

@@solution
import numpy as np
import pandas as pd

def value_bets(model, test, threshold):
    odds = test.loc[model.index, ["AvgH", "AvgD", "AvgA"]].to_numpy()
    probs = model[["pH", "pD", "pA"]].to_numpy()
    implied = 1 / odds
    fair = implied / implied.sum(axis=1, keepdims=True)
    ev = probs * odds - 1
    pick = ev.argmax(axis=1)
    rows = np.arange(len(pick))
    mask = ev[rows, pick] > threshold
    labels = np.array(["H", "D", "A"])
    out = pd.DataFrame({
        "outcome": labels[pick],
        "odds": odds[rows, pick],
        "fair_p": fair[rows, pick],
    }, index=model.index)
    out["won"] = out["outcome"].to_numpy() == test.loc[model.index, "FTR"].to_numpy()
    return out[mask]

def luck_p_value(bets, n_sims, seed):
    rng = np.random.default_rng(seed)
    odds = bets["odds"].to_numpy()
    actual = np.where(bets["won"], odds - 1, -1).sum()
    sims = rng.random((n_sims, len(bets))) < bets["fair_p"].to_numpy()
    profits = np.where(sims, odds - 1, -1).sum(axis=1)
    return round(float((profits >= actual).mean()), 3)

@@tests
import numpy as np
import pandas as pd

TEST = pd.DataFrame({
    "AvgH": [2.0, 1.5, 3.0], "AvgD": [3.4, 4.0, 3.2], "AvgA": [3.8, 6.5, 2.4],
    "FTR": ["H", "A", "D"],
}, index=[7, 8, 9])
MODEL = pd.DataFrame({"pH": [0.60, 0.62, 0.30], "pD": [0.25, 0.23, 0.35], "pA": [0.15, 0.15, 0.35]}, index=[7, 8, 9])

def test_value_bets():
    """Picks the highest-EV outcome above the threshold"""
    b = value_bets(MODEL, TEST, 0.05)
    assert list(b.index) == [7, 9], list(b.index)
    assert b["outcome"].tolist() == ["H", "D"]
    assert b["won"].tolist() == [True, True]
    assert np.isclose(b.loc[7, "fair_p"], (1 / 2.0) / (1 / 2.0 + 1 / 3.4 + 1 / 3.8))

def test_p_value_range():
    """A lucky record has a small p-value; a losing one a large p-value"""
    lucky = pd.DataFrame({"odds": [3.0] * 30, "fair_p": [1 / 3] * 30, "won": [True] * 20 + [False] * 10})
    unlucky = pd.DataFrame({"odds": [3.0] * 30, "fair_p": [1 / 3] * 30, "won": [True] * 5 + [False] * 25})
    assert luck_p_value(lucky, 5000, 0) < 0.01
    assert luck_p_value(unlucky, 5000, 0) > 0.9
:::

```python
import numpy as np
import pandas as pd
from scipy import stats

df = pd.read_csv("data/matches.csv")
train, test = df[df["Season"] == "2023-24"], df[df["Season"] == "2024-25"]

def outcome_probs(lh, la):
    g = np.arange(11)
    m = np.outer(stats.poisson(lh).pmf(g), stats.poisson(la).pmf(g))
    return np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()

mh, ma = train["FTHG"].mean(), train["FTAG"].mean()
home = train.groupby("HomeTeam").agg(s=("FTHG", "mean"), c=("FTAG", "mean"))
away = train.groupby("AwayTeam").agg(s=("FTAG", "mean"), c=("FTHG", "mean"))
st = 1 + 0.5 * (pd.DataFrame({"ha": home["s"] / mh, "hd": home["c"] / ma, "aa": away["s"] / ma, "ad": away["c"] / mh}) - 1)
model = np.array([outcome_probs(st.loc[r.HomeTeam, "ha"] * st.loc[r.AwayTeam, "ad"] * mh,
                                st.loc[r.AwayTeam, "aa"] * st.loc[r.HomeTeam, "hd"] * ma) for r in test.itertuples()])

odds = test[["AvgH", "AvgD", "AvgA"]].to_numpy()
fair = (1 / odds) / (1 / odds).sum(axis=1, keepdims=True)
ev = model * odds - 1
pick = ev.argmax(axis=1)
bet = ev.max(axis=1) > 0.05
rows = np.arange(len(test))[bet]
won = np.array(["H", "D", "A"])[pick[bet]] == test["FTR"].to_numpy()[bet]
profit = np.where(won, odds[rows, pick[bet]] - 1, -1)

rng = np.random.default_rng(0)
sims = np.where(rng.random((20_000, len(rows))) < fair[rows, pick[bet]], odds[rows, pick[bet]] - 1, -1).sum(axis=1)
print(f"{bet.sum()} bets, profit {profit.sum():+.1f} units, ROI {profit.mean():+.1%}")
print(f"p-value against fair odds: {(sims >= profit.sum()).mean():.3f}")
```

## Step 6: Write it up

In a short report, answer:

1. Which shrinkage did validation choose, why does shrinkage help, and why might a shrinkage of 0 win with only one season of data?
2. How did the model compare with base rates and the bookmaker on the test season?
3. What did the value-betting record look like, and what does its p-value say?
4. What would you try next? (Hints: more seasons of data, weighting recent matches more, Elo ratings, a correction for low-scoring draws.)

:::tip The real lesson
A simple, sensible model built with real maths still loses to the market. That isn't failure: it's the most valuable finding in the project. It tells you exactly how high the bar is, and it means that if you ever *do* beat the market in a backtest, your first assumption should be that you've made a mistake (leakage, overfitting, multiple testing) until you've proven otherwise.
:::
