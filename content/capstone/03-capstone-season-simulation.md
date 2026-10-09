---
title: "Capstone, part 1: run a season as if it were live"
summary: Simulate operating the system week by week through a whole season - ingest, retrain, predict, pick bets - with no access to the future, then produce the evaluation report a real deployment would have generated.
minutes: 150
kind: project
---

This is the capstone: the whole system, operated the way it would be in real life. Instead of a single backtest, you'll **replay the 2024-25 season one week at a time**. Each week the system:

1. receives last week's results (the pipeline from lesson 2),
2. **retrains** the goal model on everything known so far,
3. **predicts** this week's fixtures, blends them with the market, and picks value bets,
4. **logs** everything, exactly as the API in Phase 8 logs predictions.

At the end, you'll produce the report the system would have generated, and judge it honestly. Running a season "as if live" is the most convincing evidence a model can have short of real money, because it rules out any accidental use of the future.

## Step 1: Weekly batches

:::exercise cap-weeks Split a season into weeks
Write `weekly_batches(season)`. `season` is a DataFrame of matches with a datetime `Date` column. Return a list of DataFrames, one per calendar week (Monday to Sunday; `season["Date"].dt.to_period("W-SUN")` gives each match's week), in date order, each keeping the original columns and index.

@@starter
import pandas as pd

def weekly_batches(season):
    return [season]

@@solution
import pandas as pd

def weekly_batches(season):
    week = season["Date"].dt.to_period("W-SUN")
    return [batch for _, batch in season.groupby(week, sort=True)]

@@tests
import pandas as pd

def load():
    m = pd.read_csv("data/matches.csv", parse_dates=["Date"])
    return m[m["Season"] == "2024-25"]

def test_count_and_coverage():
    """38 weeks, together exactly the season"""
    season = load()
    weeks = weekly_batches(season)
    assert len(weeks) == 38
    assert sum(len(w) for w in weeks) == len(season)
    assert pd.concat(weeks).index.sort_values().equals(season.index.sort_values())

def test_each_batch_is_one_week_in_order():
    """Within a Monday-Sunday week, and in date order"""
    weeks = weekly_batches(load())
    for w in weeks:
        assert w["Date"].dt.to_period("W-SUN").nunique() == 1
    starts = [w["Date"].min() for w in weeks]
    assert starts == sorted(starts)
:::

## Step 2: Fast outcome probabilities

The system will compute probabilities for hundreds of matches each time it runs, so it's worth vectorising the Poisson score grid you've used since Phase 6.

:::exercise cap-probs Vectorised outcome probabilities
Write `outcome_probs(lam_home, lam_away, max_goals=10)` that takes arrays of expected goals and returns an array of shape `(n, 3)` with the probabilities of an **away win, draw and home win** for each match, with no Python loop over matches. Build each match's `(max_goals + 1) × (max_goals + 1)` grid of independent Poisson probabilities (`scipy.stats.poisson.pmf` broadcasts over arrays), normalise each grid to sum to 1, then add up the right cells.

@@starter
import numpy as np
from scipy import stats

def outcome_probs(lam_home, lam_away, max_goals=10):
    return np.zeros((len(lam_home), 3))

@@solution
import numpy as np
from scipy import stats

def outcome_probs(lam_home, lam_away, max_goals=10):
    g = np.arange(max_goals + 1)
    ph = stats.poisson.pmf(g[None, :], np.asarray(lam_home, dtype=float)[:, None])
    pa = stats.poisson.pmf(g[None, :], np.asarray(lam_away, dtype=float)[:, None])
    grid = ph[:, :, None] * pa[:, None, :]                    # grid[m, i, j] = P(home i, away j)
    grid /= grid.sum(axis=(1, 2), keepdims=True)
    home = np.tril(np.ones((max_goals + 1, max_goals + 1)), -1)
    away = np.triu(np.ones((max_goals + 1, max_goals + 1)), 1)
    return np.column_stack([(grid * away).sum(axis=(1, 2)), np.trace(grid, axis1=1, axis2=2), (grid * home).sum(axis=(1, 2))])

@@tests
import numpy as np
from scipy import stats

def reference(lh, la):
    g = np.arange(11)
    m = np.outer(stats.poisson(lh).pmf(g), stats.poisson(la).pmf(g))
    m /= m.sum()
    return [np.triu(m, 1).sum(), np.trace(m), np.tril(m, -1).sum()]

def test_matches_loop_version():
    """Same as the per-match calculation"""
    lh, la = np.array([1.4, 2.4, 0.8]), np.array([1.05, 1.16, 1.9])
    out = outcome_probs(lh, la)
    assert out.shape == (3, 3)
    assert np.allclose(out, [reference(a, b) for a, b in zip(lh, la)])
    assert np.allclose(out.sum(axis=1), 1)

def test_symmetry():
    """Equal teams: home and away win equally likely"""
    out = outcome_probs([1.3], [1.3])
    assert np.isclose(out[0, 0], out[0, 2])

def test_no_loop():
    """Handles thousands of matches quickly (vectorised)"""
    import time
    rng = np.random.default_rng(0)
    t0 = time.perf_counter()
    out = outcome_probs(rng.uniform(0.5, 3, 5000), rng.uniform(0.5, 3, 5000))
    assert out.shape == (5000, 3) and time.perf_counter() - t0 < 2.0
:::

## Step 3: The weekly loop, with no peeking

The heart of the simulation: for each week, hand the model **only** the matches played before that week, and record its predictions. The tests use a spy model that checks it never sees the future.

:::exercise cap-simulate Simulate the season
Write `simulate(matches, season_name, predict)`. For each week of the season `season_name` (use your `weekly_batches` logic), call `predict(history, fixtures)`, where `history` is every row of `matches` dated **strictly before the week's first match** and `fixtures` is that week's matches. `predict` returns an array of shape `(len(fixtures), 3)` with columns A, D, H. Return a DataFrame of all the season's matches (original columns and index) plus columns `pA`, `pD` and `pH`, in date order.

@@starter
import numpy as np
import pandas as pd

def simulate(matches, season_name, predict):
    season = matches[matches["Season"] == season_name]
    probs = predict(matches, season)
    return season.assign(pA=probs[:, 0], pD=probs[:, 1], pH=probs[:, 2])

@@solution
import numpy as np
import pandas as pd

def simulate(matches, season_name, predict):
    season = matches[matches["Season"] == season_name]
    parts = []
    for _, fixtures in season.groupby(season["Date"].dt.to_period("W-SUN"), sort=True):
        history = matches[matches["Date"] < fixtures["Date"].min()]
        probs = np.asarray(predict(history, fixtures))
        parts.append(fixtures.assign(pA=probs[:, 0], pD=probs[:, 1], pH=probs[:, 2]))
    return pd.concat(parts).sort_values("Date", kind="stable")

@@tests
import numpy as np
import pandas as pd

def load():
    return pd.read_csv("data/matches.csv", parse_dates=["Date"])

def test_never_sees_the_future():
    """Each call gets only matches before that week; one call per week"""
    matches = load()
    calls = []
    def spy(history, fixtures):
        assert history["Date"].max() < fixtures["Date"].min(), "the model saw a match from this week or later"
        calls.append((len(history), len(fixtures)))
        return np.tile([0.3, 0.25, 0.45], (len(fixtures), 1))
    log = simulate(matches, "2024-25", spy)
    assert len(calls) == 38
    assert calls[0][0] == (matches["Season"] < "2024-25").sum()
    assert [c[0] for c in calls] == sorted(c[0] for c in calls)
    assert len(log) == 380 and {"pA", "pD", "pH"} <= set(log.columns)

def test_predictions_line_up():
    """Each row gets its own prediction"""
    matches = load()
    def by_goals(history, fixtures):
        home = (fixtures["HomeTeam"] == "Fairhaven FC").to_numpy().astype(float)
        return np.column_stack([1 - home, np.zeros(len(fixtures)), home])
    log = simulate(matches, "2024-25", by_goals)
    assert (log.loc[log["HomeTeam"] == "Fairhaven FC", "pH"] == 1).all()
    assert (log.loc[log["HomeTeam"] != "Fairhaven FC", "pA"] == 1).all()
    assert log["Date"].is_monotonic_increasing
:::

## Step 4: Run it and write the report

Now the real thing: the time-weighted Poisson model, retrained every week, blended with the market (weight 0.4, chosen on 2023-24 back in Phase 6), with the value-bet rules fixed in advance: EV above 2%, odds at most 5.0, flat stakes. The cell takes a few seconds in the browser, because it fits 38 models.

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import log_loss

LABELS = ["A", "D", "H"]
matches = pd.read_csv("data/matches.csv", parse_dates=["Date"])
TEAMS = sorted(matches["HomeTeam"].unique())
INDEX = {t: i for i, t in enumerate(TEAMS)}

def design(df):
    n, T = len(df), len(TEAMS)
    h, a, r = df["HomeTeam"].map(INDEX).to_numpy(), df["AwayTeam"].map(INDEX).to_numpy(), np.arange(len(df))
    X_home, X_away = np.zeros((n, 2 * T + 1)), np.zeros((n, 2 * T + 1))
    X_home[r, h] = 1; X_home[r, T + a] = 1; X_home[:, -1] = 1
    X_away[r, a] = 1; X_away[r, T + h] = 1
    return X_home, X_away

def outcome_probs(lam_home, lam_away, max_goals=10):
    g = np.arange(max_goals + 1)
    grid = stats.poisson.pmf(g[None, :], lam_home[:, None])[:, :, None] * stats.poisson.pmf(g[None, :], lam_away[:, None])[:, None, :]
    grid /= grid.sum(axis=(1, 2), keepdims=True)
    away, home = np.triu(np.ones((11, 11)), 1), np.tril(np.ones((11, 11)), -1)
    return np.column_stack([(grid * away).sum(axis=(1, 2)), np.trace(grid, axis1=1, axis2=2), (grid * home).sum(axis=(1, 2))])

def poisson_predict(history, fixtures, decay=0.004):
    X_home, X_away = design(history)
    w = np.exp(-decay * (fixtures["Date"].min() - history["Date"]).dt.days.to_numpy())
    model = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(
        np.vstack([X_home, X_away]), np.concatenate([history["FTHG"], history["FTAG"]]), sample_weight=np.concatenate([w, w]))
    f_home, f_away = design(fixtures)
    return outcome_probs(model.predict(f_home), model.predict(f_away))

def simulate(matches, season_name, predict):
    season = matches[matches["Season"] == season_name]
    parts = []
    for _, fixtures in season.groupby(season["Date"].dt.to_period("W-SUN"), sort=True):
        probs = predict(matches[matches["Date"] < fixtures["Date"].min()], fixtures)
        parts.append(fixtures.assign(pA=probs[:, 0], pD=probs[:, 1], pH=probs[:, 2]))
    return pd.concat(parts)

log = simulate(matches, "2024-25", poisson_predict)

# --- 1. Forecast quality ---
odds = log[["AvgA", "AvgD", "AvgH"]].to_numpy()
market = (1 / odds) / (1 / odds).sum(axis=1, keepdims=True)
model = log[["pA", "pD", "pH"]].to_numpy()
blend = 0.4 * model + 0.6 * market
print("Log loss on 2024-25 (lower is better)")
for name, p in [("goal model, weekly", model), ("market", market), ("blend 0.4/0.6", blend)]:
    print(f"  {name:>19}: {log_loss(log['FTR'], p, labels=LABELS):.4f}")

# --- 2. Value bets, rules fixed in advance ---
ev = np.where(odds <= 5.0, blend * odds - 1, -np.inf)
pick = ev.argmax(axis=1)
best = ev[np.arange(len(log)), pick]
bet = best > 0.02
taken_odds = odds[bet, pick[bet]]
won = log["FTR"].to_numpy()[bet] == np.array(LABELS)[pick[bet]]
profit = np.where(won, taken_odds - 1, -1.0)
bankroll = 100 + np.cumsum(profit)
peak = np.maximum.accumulate(np.concatenate([[100], bankroll]))[1:]
rng = np.random.default_rng(0)
null_roi = ((rng.random((10_000, bet.sum())) < market[bet, pick[bet]]) * taken_odds - 1).mean(axis=1)
print(f"\nValue bets: {bet.sum()} bets, ROI {profit.mean():+.3f}, profit {profit.sum():+.1f} units, "
      f"max drawdown {(1 - bankroll / peak).max():.1%}")
print(f"Luck test: {np.mean(null_roi >= profit.mean()):.2f} of no-edge bettors would do this well")

# --- 3. Charts for the write-up ---
fig, axes = plt.subplots(1, 2, figsize=(11, 4))
bins = np.linspace(0.1, 0.8, 8)
for name, p in [("blend", blend[:, 2]), ("market", market[:, 2])]:
    groups = pd.cut(p, bins)
    table = pd.DataFrame({"p": p, "y": (log["FTR"] == "H").to_numpy()}).groupby(groups, observed=True).agg(
        forecast=("p", "mean"), observed=("y", "mean"), n=("y", "size"))
    table = table[table["n"] >= 15]
    axes[0].plot(table["forecast"], table["observed"], "o-", label=name)
axes[0].plot([0, 1], [0, 1], "--", color="grey")
axes[0].set_title("Calibration: P(home win)")
axes[0].set_xlabel("forecast"); axes[0].set_ylabel("observed")
axes[0].legend()
axes[1].plot(log["Date"].to_numpy()[bet], bankroll)
axes[1].axhline(100, color="grey", ls="--")
axes[1].set_title("Flat-stake bankroll, 2024-25")
axes[1].tick_params(axis="x", rotation=45)
fig.tight_layout()
plt.show()
```

### Reading the report

When we ran it:

- The **weekly goal model** scored 1.0507, worse than the market's 1.0394, while the **blend** (1.0380) was slightly better than the market.
- The value-bet rules produced 179 bets with an ROI of about **+4%**, and a luck test saying roughly one in six no-edge bettors would do as well.

So: a small, plausible edge that this season alone can't confirm. Two lessons are worth writing down in any report like this:

1. **Small design choices move backtest results.** Phase 6's version of this strategy, with monthly refits, made about 8% on the same season. Neither number is "the truth": both are noisy estimates, which is why you fix the rules in advance, report confidence intervals, and judge over many seasons.
2. **The blend beat the market on log loss even though the model alone didn't.** Combining a model with a strong benchmark is often where the real value lies (Phase 6, lesson 5).

## Your write-up

Before moving on, write a one-page report as if for a colleague, using the template from lesson 5. Include: the question, the data and its limitations, the method in a few sentences, the three log losses, the betting results **with** the luck test, the two charts, and what you'd try next. Keep it honest: "promising, unproven" is a perfectly good conclusion.

Ideas for going further:

1. Choose the blend weight and the EV threshold by simulating 2023-24 the same way, then test once on 2024-25.
2. Add the Dixon–Coles correction (Phase 6, lesson 4) and compare log loss over both seasons.
3. Record which week each prediction was made in and monitor rolling log loss against the market, as you'll do in part 2.
