---
title: Sampling, the central limit theorem and simulation
summary: Why averages of noisy data are predictable, how to measure the uncertainty of an estimate, bootstrapping, and Monte Carlo simulation of bankrolls and risk of ruin.
minutes: 55
kind: lesson
---

Every number you compute from data, such as a win rate, a model's accuracy or a strategy's ROI, is an **estimate** from a sample. A different sample would give a different number. This lesson is about how much they vary, which tells you how much to trust them.

## Sampling variation

Imagine the true home win probability is 46%. Each season of 380 matches gives a slightly different observed rate:

```python
import numpy as np

rng = np.random.default_rng(3)
seasons = rng.binomial(380, 0.46, size=10) / 380
print(np.round(seasons, 3))
print(f"range across 10 seasons: {seasons.min():.3f} to {seasons.max():.3f}")
```

Nothing changed about football between those "seasons". That spread is pure sampling noise.

## The standard error

The standard deviation of an estimate across hypothetical repeated samples is its **standard error** (SE). For a proportion $\hat{p}$ from $n$ observations:

$$
SE(\hat{p}) = \sqrt{\frac{p(1-p)}{n}}
$$

For a mean of $n$ values with standard deviation $\sigma$: $SE = \sigma / \sqrt{n}$. Halving the uncertainty takes **four times** as much data.

```python
import math

for n in [50, 380, 1_140, 10_000]:
    se = math.sqrt(0.46 * 0.54 / n)
    print(f"n={n:>6,}: SE = {se:.3f}, so the estimate is typically within about ±{2 * se:.1%}")
```

## The central limit theorem

The **central limit theorem** (CLT) says that the average of many independent random values is approximately normally distributed, *whatever the shape of the original distribution*. Here each bet is win-or-lose (very non-normal), but the average profit over 200 bets is a neat bell curve:

```python
import matplotlib.pyplot as plt
import numpy as np

rng = np.random.default_rng(0)
single_bets = np.where(rng.random(10_000) < 0.4, 1.6, -1.0)        # one bet: +1.6 or -1
averages = np.where(rng.random((10_000, 200)) < 0.4, 1.6, -1.0).mean(axis=1)   # mean of 200 bets

fig, axes = plt.subplots(1, 2, figsize=(10, 3.2))
axes[0].hist(single_bets, bins=30)
axes[0].set_title("Profit of a single bet")
axes[1].hist(averages, bins=40)
axes[1].set_title("Average profit over 200 bets")
fig.tight_layout()
plt.show()
print(f"theory: mean {0.4 * 1.6 - 0.6:.3f}, SE {np.std(single_bets) / np.sqrt(200):.3f}; simulated: mean {averages.mean():.3f}, sd {averages.std():.3f}")
```

That's why the normal distribution shows up everywhere, and why confidence intervals and many statistical tests work.

## Confidence intervals

A 95% **confidence interval** is a range built so that, if you repeated the sampling many times, 95% of such intervals would contain the true value. For large samples: estimate ± 1.96 × SE.

```python
import math
import pandas as pd

df = pd.read_csv("data/matches.csv")
p = (df["FTR"] == "H").mean()
n = len(df)
se = math.sqrt(p * (1 - p) / n)
print(f"home win rate {p:.3f}, 95% CI [{p - 1.96 * se:.3f}, {p + 1.96 * se:.3f}]")
```

## The bootstrap

What's the SE of a *median*, or of a strategy's ROI, or a model's accuracy? Formulas get hard. The **bootstrap** avoids them: resample your data **with replacement** many times, recompute the statistic each time, and look at the spread:

```python
import numpy as np

rng = np.random.default_rng(1)
# profits of 150 one-unit bets placed by a strategy: 41% wins at average odds 2.6
profits = np.where(rng.random(150) < 0.41, 1.6, -1.0)
roi = profits.mean()

boot = np.array([rng.choice(profits, size=len(profits), replace=True).mean() for _ in range(5_000)])
low, high = np.percentile(boot, [2.5, 97.5])
print(f"ROI {roi:+.1%}, 95% bootstrap CI [{low:+.1%}, {high:+.1%}]")
print(f"share of bootstrap samples with ROI <= 0: {(boot <= 0).mean():.1%}")
```

A positive ROI sounds encouraging, but the interval is wide: it easily includes zero, and sizeable losses. The bootstrap is one of the most useful tools in applied statistics, and in ML it's how you put error bars on model performance.

:::warning The bootstrap and time series
Resampling individual observations assumes they're independent. For time series with streaks or regimes, resample **blocks** of consecutive observations instead (a "block bootstrap").
:::

## Monte Carlo simulation

**Monte Carlo** methods answer questions by simulating many random scenarios. "What's my chance of losing half my bankroll?" is hard to work out analytically and easy to simulate:

```python
import matplotlib.pyplot as plt
import numpy as np

def simulate_bankrolls(n_paths, n_bets, p, odds, stake_fraction, start=100.0, seed=0):
    rng = np.random.default_rng(seed)
    bank = np.full(n_paths, start)
    history = [bank.copy()]
    for _ in range(n_bets):
        stake = bank * stake_fraction                   # bet a fixed fraction of the current bankroll
        won = rng.random(n_paths) < p
        bank = bank + np.where(won, stake * (odds - 1), -stake)
        history.append(bank.copy())
    return np.array(history)

paths = simulate_bankrolls(n_paths=2_000, n_bets=500, p=0.53, odds=2.0, stake_fraction=0.05)
final = paths[-1]
print(f"median final bankroll {np.median(final):.0f}, chance of profit {(final > 100).mean():.0%}")
print(f"chance of dipping below 50 at some point: {(paths.min(axis=0) < 50).mean():.0%}")

fig, ax = plt.subplots(figsize=(8, 3.5))
ax.plot(paths[:, :40], linewidth=0.7, alpha=0.6)
ax.axhline(100, color="black", linewidth=1)
ax.set_yscale("log")
ax.set_xlabel("Bet number")
ax.set_ylabel("Bankroll (log scale)")
ax.set_title("40 possible futures with a 3% edge, staking 5% of the bankroll")
fig.tight_layout()
plt.show()
```

Even with a genuine edge, the paths diverge wildly, and many go through deep drawdowns. Simulations like this decide staking plans in betting and position sizes in trading.

## Practice

:::exercise sim-se Standard error and interval
Write `proportion_ci(successes, n, z=1.96)` returning a tuple `(estimate, low, high)`: the observed proportion and the normal-approximation confidence interval, each rounded to 4 decimals.

@@starter
import math

def proportion_ci(successes, n, z=1.96):
    return (0.0, 0.0, 0.0)

@@solution
import math

def proportion_ci(successes, n, z=1.96):
    p = successes / n
    se = math.sqrt(p * (1 - p) / n)
    return (round(p, 4), round(p - z * se, 4), round(p + z * se, 4))

@@tests
def test_values():
    """55 out of 100"""
    assert proportion_ci(55, 100) == (0.55, 0.4525, 0.6475)

def test_more_data_narrower():
    """More data gives a narrower interval"""
    _, lo1, hi1 = proportion_ci(55, 100)
    _, lo2, hi2 = proportion_ci(550, 1000)
    assert (hi2 - lo2) < (hi1 - lo1) / 3
:::

:::exercise sim-bootstrap Bootstrap a median
Write `bootstrap_ci(values, statistic, n_boot, seed, level=0.95)`. Using `rng = np.random.default_rng(seed)`, draw `n_boot` resamples of `values` (with replacement, same size, using `rng.choice`), compute `statistic(resample)` for each, and return the `(low, high)` percentile interval for the given level, rounded to 2 decimals.

@@starter
import numpy as np

def bootstrap_ci(values, statistic, n_boot, seed, level=0.95):
    return (0.0, 0.0)

@@solution
import numpy as np

def bootstrap_ci(values, statistic, n_boot, seed, level=0.95):
    rng = np.random.default_rng(seed)
    values = np.asarray(values)
    stats = [statistic(rng.choice(values, size=len(values), replace=True)) for _ in range(n_boot)]
    alpha = (1 - level) / 2 * 100
    low, high = np.percentile(stats, [alpha, 100 - alpha])
    return (round(float(low), 2), round(float(high), 2))

@@tests
import numpy as np
import pandas as pd

def reference(values, statistic, n_boot, seed, level=0.95):
    rng = np.random.default_rng(seed)
    values = np.asarray(values)
    s = [statistic(rng.choice(values, size=len(values), replace=True)) for _ in range(n_boot)]
    a = (1 - level) / 2 * 100
    lo, hi = np.percentile(s, [a, 100 - a])
    return (round(float(lo), 2), round(float(hi), 2))

def test_matches_reference():
    """Matches the expected bootstrap"""
    prices = pd.read_csv("data/houses.csv")["price"].to_numpy() / 1000
    assert bootstrap_ci(prices, np.median, 500, 42) == reference(prices, np.median, 500, 42)

def test_contains_estimate():
    """The interval contains the sample statistic"""
    data = np.random.default_rng(0).normal(10, 2, 300)
    lo, hi = bootstrap_ci(data, np.mean, 1000, 1)
    assert lo < data.mean() < hi

def test_level():
    """A 99% interval is wider than a 90% one"""
    data = np.random.default_rng(0).normal(10, 2, 300)
    lo90, hi90 = bootstrap_ci(data, np.mean, 1000, 1, level=0.90)
    lo99, hi99 = bootstrap_ci(data, np.mean, 1000, 1, level=0.99)
    assert hi99 - lo99 > hi90 - lo90
:::

:::exercise sim-ruin Risk of ruin
Write `risk_of_ruin(p, odds, stake, bankroll, n_bets, n_paths, seed)`. Simulate `n_paths` bettors who each bet a **fixed** `stake` per bet for up to `n_bets` bets (each wins with probability `p` at decimal `odds`). A bettor is **ruined** if their bankroll ever falls below `stake` (they can't place the next bet). Return the fraction of paths that are ruined, rounded to 3 decimals.

Generate all the outcomes at once with `rng = np.random.default_rng(seed)` and `rng.random((n_paths, n_bets)) < p`, then use a cumulative sum to get each path's bankroll after every bet.

@@starter
import numpy as np

def risk_of_ruin(p, odds, stake, bankroll, n_bets, n_paths, seed):
    rng = np.random.default_rng(seed)
    return 0.0

@@solution
import numpy as np

def risk_of_ruin(p, odds, stake, bankroll, n_bets, n_paths, seed):
    rng = np.random.default_rng(seed)
    wins = rng.random((n_paths, n_bets)) < p
    profits = np.where(wins, stake * (odds - 1), -stake)
    balances = bankroll + np.cumsum(profits, axis=1)
    ruined = (balances < stake).any(axis=1)
    return round(float(ruined.mean()), 3)

@@tests
import numpy as np

def reference(p, odds, stake, bankroll, n_bets, n_paths, seed):
    rng = np.random.default_rng(seed)
    w = rng.random((n_paths, n_bets)) < p
    b = bankroll + np.cumsum(np.where(w, stake * (odds - 1), -stake), axis=1)
    return round(float((b < stake).any(axis=1).mean()), 3)

def test_matches_reference():
    """Matches the expected simulation"""
    assert risk_of_ruin(0.5, 1.95, 10, 100, 500, 2000, 0) == reference(0.5, 1.95, 10, 100, 500, 2000, 0)

def test_edge_reduces_ruin():
    """A positive edge and a big bankroll reduce ruin"""
    bad = risk_of_ruin(0.48, 2.0, 10, 100, 500, 2000, 1)
    good = risk_of_ruin(0.55, 2.0, 10, 300, 500, 2000, 1)
    assert good < bad
:::

:::quiz sampling-quiz Quick check
? To halve the standard error of an estimate, you need:
- [ ] Twice as much data
- [x] Four times as much data
- [ ] Half as much data
> SE shrinks with √n.

? What does the central limit theorem say?
- [x] Averages of many independent values are approximately normal, whatever the original distribution
- [ ] All data is normally distributed
- [ ] Large samples have no uncertainty
> It's why the normal distribution appears so often.

? How does the bootstrap estimate uncertainty?
- [x] By resampling the data with replacement and recomputing the statistic many times
- [ ] By collecting more data
- [ ] By assuming a normal distribution
> It works for almost any statistic.

? A strategy shows +6% ROI over 150 bets, with a 95% CI of [−12%, +24%]. What can you conclude?
- [x] The data is consistent with no edge at all; more evidence is needed
- [ ] The strategy definitely has an edge
- [ ] The strategy definitely loses money
> An interval that includes zero means you can't rule out luck.
:::
