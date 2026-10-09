---
title: "Capstone, part 2: operating the system"
summary: Keep a deployed model healthy - compare a challenger with the champion using a paired bootstrap, decide when to promote, run health checks on data and predictions, and wire the weekly job, the API and monitoring together.
minutes: 120
kind: project
---

Part 1 showed the system works on a replayed season. Real operation adds the questions that never stop: *Is the model still healthy? Is this new version actually better? When should we retrain, and when should we roll back?* This lesson builds the tools that answer them, and puts the whole system together.

## The weekly cycle

```text
Monday 06:00   pipeline: ingest last week's results, validate, load            (lesson 2)
               retrain: fit the challenger on everything known                   (part 1)
               evaluate: challenger vs champion on recent matches               (this lesson)
               promote the challenger only if it's convincingly better
               batch-predict this week's fixtures with the champion; store them
Any time       API serves stored predictions and on-demand ones; logs every call (Phase 8)
Daily          health checks: data freshness, drift, performance vs the market  (this lesson)
```

Every model version gets an ID; every prediction records the version that made it. Rolling back means switching the "champion" pointer to the previous version, which takes seconds.

## Champion versus challenger

Suppose someone proposes a change: halve the time decay (ξ = 0.002 instead of 0.004), so older matches count more. Is the new version (the **challenger**) better than the deployed one (the **champion**)?

Compare them on the **same matches**, and look at the per-match difference in log loss. Because both models face the same matches, the difference is much less noisy than either score alone: that's a **paired** comparison. A **paired bootstrap** (resample matches, recompute the mean difference) gives a confidence interval. This cell replays 2024-25 for both versions, so it takes a few seconds:

```python
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import PoissonRegressor

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

def outcome_probs(lam_home, lam_away):
    g = np.arange(11)
    grid = stats.poisson.pmf(g[None, :], lam_home[:, None])[:, :, None] * stats.poisson.pmf(g[None, :], lam_away[:, None])[:, None, :]
    grid /= grid.sum(axis=(1, 2), keepdims=True)
    return np.column_stack([(grid * np.triu(np.ones((11, 11)), 1)).sum(axis=(1, 2)), np.trace(grid, axis1=1, axis2=2),
                            (grid * np.tril(np.ones((11, 11)), -1)).sum(axis=(1, 2))])

def replay(decay):
    """Weekly walk-forward over 2024-25; returns each match's log loss."""
    season = matches[matches["Season"] == "2024-25"]
    losses = []
    for _, fixtures in season.groupby(season["Date"].dt.to_period("W-SUN"), sort=True):
        history = matches[matches["Date"] < fixtures["Date"].min()]
        X_home, X_away = design(history)
        w = np.exp(-decay * (fixtures["Date"].min() - history["Date"]).dt.days.to_numpy())
        model = PoissonRegressor(alpha=1e-3, max_iter=1000).fit(
            np.vstack([X_home, X_away]), np.concatenate([history["FTHG"], history["FTAG"]]), sample_weight=np.concatenate([w, w]))
        f_home, f_away = design(fixtures)
        probs = outcome_probs(model.predict(f_home), model.predict(f_away))
        outcome = fixtures["FTR"].map({"A": 0, "D": 1, "H": 2}).to_numpy()
        losses.append(-np.log(probs[np.arange(len(fixtures)), outcome]))
    return np.concatenate(losses)

champion, challenger = replay(0.004), replay(0.002)
diff = challenger - champion                      # negative = challenger better on that match
rng = np.random.default_rng(0)
boot = np.array([diff[rng.integers(0, len(diff), len(diff))].mean() for _ in range(5000)])
low, high = np.percentile(boot, [2.5, 97.5])
print(f"champion log loss {champion.mean():.4f}, challenger {challenger.mean():.4f}")
print(f"mean difference {diff.mean():+.4f}, 95% interval {low:+.4f} to {high:+.4f}")
print(f"share of resamples where the challenger is better: {np.mean(boot < 0):.2f}")
```

The challenger looks a little better (1.0487 against 1.0507), but the interval runs from −0.0105 to +0.0065: it includes zero comfortably, and only about two resamples in three favour the challenger. A difference this small is well within what luck produces over one season. The right call is **don't promote**: keep collecting evidence, perhaps by running the challenger in **shadow mode** (making and logging predictions that nobody acts on) and comparing again later.

This is the discipline that keeps production models from drifting through a series of changes that were each "slightly better" by luck.

## Health checks

A model can't tell you it's broken. Automated checks run daily and raise alerts:

```python
import numpy as np
import pandas as pd

log = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])     # the deployed model's predictions
log = log[log["Season"] == "2024-25"].reset_index(drop=True)
odds = log[["AvgA", "AvgD", "AvgH"]].to_numpy()
market = (1 / odds) / (1 / odds).sum(axis=1, keepdims=True)
outcome = log["FTR"].map({"A": 0, "D": 1, "H": 2}).to_numpy()
rows = np.arange(len(log))
model_loss = -np.log(log[["pA", "pD", "pH"]].to_numpy()[rows, outcome])
market_loss = -np.log(market[rows, outcome])

def psi(expected, actual, n_bins=10):
    edges = np.quantile(expected, np.linspace(0, 1, n_bins + 1)[1:-1])
    e = np.clip(np.bincount(np.searchsorted(edges, expected, side="right"), minlength=n_bins) / len(expected), 1e-6, None)
    a = np.clip(np.bincount(np.searchsorted(edges, actual, side="right"), minlength=n_bins) / len(actual), 1e-6, None)
    return float(np.sum((a - e) * np.log(a / e)))

def health(as_of, latest_result, gap_50, psi_value):
    alerts = []
    if (as_of - latest_result).days > 9:
        alerts.append("STALE DATA: no new results for over 9 days")
    if gap_50 > 0.08:
        alerts.append(f"PERFORMANCE: 50-match log loss {gap_50:+.3f} worse than the market")
    if psi_value > 0.25:
        alerts.append(f"DRIFT: PSI {psi_value:.2f} on predicted home-win probability")
    return alerts

reference = log.loc[:99, "pH"].to_numpy()                 # the first 100 predictions as the reference
for check_date in pd.to_datetime(["2024-10-07", "2025-01-06", "2025-03-31", "2025-05-26"]):
    seen = log[log["Date"] < check_date]
    gap = (model_loss[seen.index] - market_loss[seen.index])[-50:].mean()
    recent = seen["pH"].to_numpy()[-100:]
    alerts = health(check_date, seen["Date"].max(), gap, psi(reference, recent))
    print(f"{check_date.date()}: last result {seen['Date'].max().date()}, gap {gap:+.3f}, "
          f"PSI {psi(reference, recent):.2f} -> {alerts or 'OK'}")
```

Two checks fire, for different reasons.

- **May: stale data.** The season ended on 4 May. In the real system, the freshness check would be paused during the summer break.
- **March: drift.** This is where an alert needs a person to look at it. The performance check is fine: over the last 50 matches the model has done *better* than the market. So the model isn't failing. What moved is the reference: the first 100 predictions had an average home-win probability of about 0.49, and recent ones about 0.45.

Try it: in the cell above, change the `reference` line to use the whole previous season, and run it again:

```python static
reference = pd.read_csv("data/poisson_predictions.csv").query("Season == '2023-24'")["pH"].to_numpy()
```

With that reference, the March PSI drops to about 0.09, but the October check now fires (0.55), because early-season predictions look different from a full season's. No reference is perfect, so choose one deliberately.

Two lessons from this:

- A drift alert is a reason to investigate, not proof of a problem. Check performance before acting.
- Design checks so they're **quiet when things are fine**. An alert that fires every week gets ignored.

## When to retrain

| Strategy | When | Trade-off |
| --- | --- | --- |
| **Scheduled** | Every week, after the pipeline | Simple and predictable; the default here |
| **Triggered** | When drift or performance alerts fire | Reacts to problems; needs good alerts |
| **Continuous** | Online learning, every new example | Rarely worth the complexity for weekly data |

Retraining refits the **same** model design on new data; it can be automatic. Changing the **design** (new features, new hyperparameters, a new model type) creates a challenger that must earn promotion, as above.

## Putting it together

The pieces you've built across the course map straight onto the running system:

| Piece | Built in | In production |
| --- | --- | --- |
| Data pipeline with validation and upserts | Capstone lesson 2 | Scheduled job (GitHub Actions or an orchestrator) |
| Goal model, weekly walk-forward | Phase 6, capstone part 1 | Retrain step of the job; versioned with `joblib` and metadata |
| Blend and value-bet rules | Phase 6 | Batch prediction step; stored in the database |
| Prediction API with logging | Phase 8, `backend/` | FastAPI service in Docker, on a hosting platform |
| Champion/challenger and health checks | This lesson | Evaluation step and a daily monitoring job with alerts |

## Practice

:::exercise ops-bootstrap A paired bootstrap
Write `paired_bootstrap(loss_new, loss_old, n_resamples=2000, seed=0)`. Compute the per-item differences `d = loss_new - loss_old`. Using `rng = np.random.default_rng(seed)`, for each resample draw `len(d)` indices with `rng.integers(0, len(d), len(d))` and record the mean of `d` at those indices. Return a dict with `"mean_diff"` (the mean of `d`), `"low"` and `"high"` (the 2.5th and 97.5th percentiles of the resampled means) and `"p_better"` (the share of resampled means below zero, meaning the new model is better).

@@starter
import numpy as np

def paired_bootstrap(loss_new, loss_old, n_resamples=2000, seed=0):
    return {}

@@solution
import numpy as np

def paired_bootstrap(loss_new, loss_old, n_resamples=2000, seed=0):
    d = np.asarray(loss_new, dtype=float) - np.asarray(loss_old, dtype=float)
    rng = np.random.default_rng(seed)
    means = np.array([d[rng.integers(0, len(d), len(d))].mean() for _ in range(n_resamples)])
    low, high = np.percentile(means, [2.5, 97.5])
    return {"mean_diff": float(d.mean()), "low": float(low), "high": float(high), "p_better": float(np.mean(means < 0))}

@@tests
import numpy as np

def test_reference():
    """Matches a reference implementation"""
    rng = np.random.default_rng(5)
    old = rng.gamma(2, 0.5, 300)
    new = old + rng.normal(-0.02, 0.1, 300)
    out = paired_bootstrap(new, old)
    d = new - old
    r = np.random.default_rng(0)
    means = np.array([d[r.integers(0, 300, 300)].mean() for _ in range(2000)])
    assert np.isclose(out["mean_diff"], d.mean())
    assert np.isclose(out["low"], np.percentile(means, 2.5)) and np.isclose(out["high"], np.percentile(means, 97.5))
    assert np.isclose(out["p_better"], np.mean(means < 0))

def test_clear_winner():
    """A consistently better model has an interval entirely below zero"""
    rng = np.random.default_rng(1)
    old = rng.gamma(2, 0.5, 500)
    out = paired_bootstrap(old - 0.05 + rng.normal(0, 0.02, 500), old)
    assert out["high"] < 0 and out["p_better"] == 1.0
:::

:::exercise ops-promote A promotion rule
Write `should_promote(result, n_matches, min_matches=200, margin=0.0)`, where `result` is a dict from `paired_bootstrap`. Return the tuple `(decision, reason)`: `(False, "not enough data")` if `n_matches < min_matches`; `(True, "better")` if `result["high"] < -margin` (the whole interval shows the new model better by more than the margin); otherwise `(False, "not convincingly better")`.

@@starter
def should_promote(result, n_matches, min_matches=200, margin=0.0):
    return (result["mean_diff"] < 0, "")

@@solution
def should_promote(result, n_matches, min_matches=200, margin=0.0):
    if n_matches < min_matches:
        return (False, "not enough data")
    if result["high"] < -margin:
        return (True, "better")
    return (False, "not convincingly better")

@@tests
def test_rules():
    """Data first, then the interval"""
    clear = {"mean_diff": -0.03, "low": -0.05, "high": -0.01, "p_better": 1.0}
    unclear = {"mean_diff": -0.002, "low": -0.010, "high": 0.007, "p_better": 0.67}
    assert should_promote(clear, 150) == (False, "not enough data")
    assert should_promote(clear, 380) == (True, "better")
    assert should_promote(unclear, 380) == (False, "not convincingly better")
    assert should_promote(clear, 380, margin=0.02) == (False, "not convincingly better")
:::

:::exercise ops-health Health checks
Write `health_checks(status, max_days_stale=9, max_gap=0.08, max_psi=0.25)`. `status` is a dict with `"today"` and `"latest_result"` (`datetime.date` objects), `"gap_50"` (the 50-match log-loss gap versus the market) and `"psi"` (a dict of feature name to PSI). Return a list of alert strings, in this order: `"stale data"` if more than `max_days_stale` days separate the two dates; `"performance"` if `gap_50 > max_gap`; then `"drift: <name>"` for each feature with PSI above `max_psi`, sorted by name. Return an empty list when everything is healthy.

@@starter
def health_checks(status, max_days_stale=9, max_gap=0.08, max_psi=0.25):
    return []

@@solution
def health_checks(status, max_days_stale=9, max_gap=0.08, max_psi=0.25):
    alerts = []
    if (status["today"] - status["latest_result"]).days > max_days_stale:
        alerts.append("stale data")
    if status["gap_50"] > max_gap:
        alerts.append("performance")
    for name in sorted(status["psi"]):
        if status["psi"][name] > max_psi:
            alerts.append(f"drift: {name}")
    return alerts

@@tests
from datetime import date

def test_healthy():
    """Quiet when everything is fine"""
    s = {"today": date(2025, 1, 10), "latest_result": date(2025, 1, 5), "gap_50": 0.01, "psi": {"pH": 0.05, "LamH": 0.12}}
    assert health_checks(s) == []

def test_all_alerts():
    """Each problem is reported, in order"""
    s = {"today": date(2025, 2, 1), "latest_result": date(2025, 1, 5), "gap_50": 0.12,
         "psi": {"pH": 0.4, "LamA": 0.31, "LamH": 0.05}}
    assert health_checks(s) == ["stale data", "performance", "drift: LamA", "drift: pH"]

def test_thresholds_are_exclusive():
    """Exactly at the threshold is still healthy"""
    s = {"today": date(2025, 1, 14), "latest_result": date(2025, 1, 5), "gap_50": 0.08, "psi": {"pH": 0.25}}
    assert health_checks(s) == []
:::

:::quiz ops-quiz Quick check
? Why compare a challenger and a champion on the same matches, with a paired bootstrap?
- [x] Per-match differences cancel out shared luck, so the comparison is far less noisy
- [ ] Because unpaired comparisons are not allowed
- [ ] It makes both models more accurate
> Both models face the same upsets, so their difference isolates the change.

? A challenger's log loss is 0.002 lower, with a 95% interval for the difference of −0.0105 to +0.0065. What should you do?
- [x] Keep the champion and gather more evidence, for example in shadow mode
- [ ] Promote it: lower is better
- [ ] Delete the challenger
> The interval includes zero; "slightly better" is often luck.

? Your daily checks send five alerts every week, and most are false alarms. What's the risk?
- [x] People learn to ignore alerts, and miss the real one
- [ ] None, more alerts are safer
- [ ] The model gets slower
> Tune checks to be quiet when things are fine.

? What's the difference between retraining and changing the model design?
- [x] Retraining refits the same design on new data and can be automatic; design changes need a challenger evaluation
- [ ] There is no difference
- [ ] Retraining always needs a person to approve it
> New data, same recipe: routine. New recipe: evaluate before promoting.
:::
