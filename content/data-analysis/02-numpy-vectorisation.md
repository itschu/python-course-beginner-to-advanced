---
title: Vectorised computing with NumPy
summary: Replace loops with whole-array operations, broadcasting and aggregations, and simulate thousands of bets in a single line.
minutes: 55
kind: lesson
---

The real power of NumPy is **vectorisation**: writing operations on whole arrays instead of looping over elements. The code is shorter, reads like maths, and runs 10 to 100 times faster.

## Element-wise operations

Arithmetic on arrays happens element by element:

```python
import numpy as np

odds = np.array([2.1, 3.4, 3.6])
stakes = np.array([10, 5, 5])

print(1 / odds)                       # implied probabilities
print(stakes * (odds - 1))            # profit if each bet wins
print(np.round(1 / odds, 3))
print(np.sqrt(np.array([4, 9, 16])))
print(np.log(odds))                   # NumPy versions of math functions work on whole arrays
```

## How much faster?

```python
import numpy as np
import time

values = np.random.default_rng(0).random(1_000_000)

start = time.perf_counter()
total = 0.0
for v in values:
    total += v * v
loop_ms = (time.perf_counter() - start) * 1000

start = time.perf_counter()
total_vec = np.sum(values * values)
vec_ms = (time.perf_counter() - start) * 1000

print(f"loop: {loop_ms:.0f} ms, vectorised: {vec_ms:.1f} ms, same answer: {np.isclose(total, total_vec)}")
```

## Aggregations and axes

```python
import numpy as np

# rows: 4 teams; columns: goals in each of 3 seasons
goals = np.array([
    [60, 71, 65],
    [48, 52, 55],
    [80, 77, 84],
    [41, 39, 50],
])
print(goals.sum())            # everything
print(goals.sum(axis=0))      # down the rows: total per season (one value per column)
print(goals.mean(axis=1))     # across the columns: average per team (one value per row)
print(goals.max(axis=1), goals.argmax(axis=1))   # best season, and which one
print(goals.std(), np.median(goals))
```

`axis=0` collapses the rows (you get one result per column); `axis=1` collapses the columns (one result per row). It takes a while to get used to. When in doubt, check the shape of the result.

## Broadcasting

NumPy can combine arrays of different shapes by "stretching" the smaller one, following simple rules. The most common case: a single value with an array, or one row with every row of a table.

```python
import numpy as np

goals = np.array([[60, 71, 65], [48, 52, 55], [80, 77, 84]])
season_avg = goals.mean(axis=0)          # shape (3,)
print(goals - season_avg)                # each row minus the season averages

team_avg = goals.mean(axis=1, keepdims=True)   # shape (3, 1): a column
print(goals - team_avg)                  # each column minus each team's average
```

**Standardising** features (subtracting the mean and dividing by the standard deviation of each column) is a classic broadcasting job, and a standard ML preprocessing step:

```python
import numpy as np

X = np.array([[1200, 3.1], [1500, 2.2], [1350, 2.9], [1650, 1.8]])   # very different scales
X_std = (X - X.mean(axis=0)) / X.std(axis=0)
print(X_std.round(2))
print(X_std.mean(axis=0).round(6), X_std.std(axis=0))
```

## Conditional values: np.where

`np.where(condition, if_true, if_false)` is the vectorised `if`/`else`:

```python
import numpy as np

home = np.array([2, 0, 3, 1])
away = np.array([1, 0, 3, 2])

result = np.where(home > away, "H", np.where(home < away, "A", "D"))
print(result)

won = np.array([True, False, True, False])
odds = np.array([2.5, 3.0, 1.8, 2.2])
profit = np.where(won, odds - 1, -1.0)     # profit per 1-unit bet
print(profit, profit.sum())
```

`np.select` handles several conditions at once, like a vectorised `if/elif/else`.

## Random numbers and simulation

NumPy's random generator is the workhorse of simulation. Always create a generator with a **seed** so results are reproducible:

```python
import numpy as np

rng = np.random.default_rng(42)
print(rng.random(3))                     # uniform between 0 and 1
print(rng.integers(1, 7, size=5))        # dice rolls
print(rng.normal(0, 1, size=3))          # normal distribution
print(rng.poisson(1.4, size=10))         # goals in 10 matches, average 1.4
print(rng.choice(["H", "D", "A"], size=5, p=[0.46, 0.25, 0.29]))
```

Now the payoff: simulate **10,000 gamblers** each placing 500 bets at odds of 1.95 on a 50% chance (a slightly unfavourable bet), all at once, with no loops:

```python
import numpy as np

rng = np.random.default_rng(1)
n_gamblers, n_bets, odds, p = 10_000, 500, 1.95, 0.5

wins = rng.random((n_gamblers, n_bets)) < p          # 5 million random bets
profit_per_bet = np.where(wins, odds - 1, -1.0)
final = profit_per_bet.sum(axis=1)                   # total profit per gambler (1-unit stakes)

print(f"Expected profit per gambler: {n_bets * (p * (odds - 1) - (1 - p)):.1f} units")
print(f"Average actual profit: {final.mean():.1f} units")
print(f"Share of gamblers in profit after 500 bets: {(final > 0).mean():.1%}")
print(f"Best: {final.max():.0f}, worst: {final.min():.0f}")
```

Even with a negative expected value, more than a quarter of the gamblers are ahead after 500 bets. That's luck, and some of them will be convinced it's skill. Phase 4 teaches you how to tell the difference.

## Practice

:::exercise vec-profit Vectorised settling
Complete `settle(stakes, odds, won)` **without loops**. The arguments are NumPy arrays of the same length (`won` is boolean). Return a tuple `(profits, total, roi)`:

- `profits`: an array of each bet's profit (`stake * (odds - 1)` if won, `-stake` if lost)
- `total`: total profit as a float
- `roi`: total profit divided by total staked, as a float

@@starter
import numpy as np

def settle(stakes, odds, won):
    profits = np.zeros(len(stakes))
    for i in range(len(stakes)):
        pass
    return profits, 0.0, 0.0

@@solution
import numpy as np

def settle(stakes, odds, won):
    profits = np.where(won, stakes * (odds - 1), -stakes)
    total = float(profits.sum())
    return profits, total, total / float(stakes.sum())

@@tests
import numpy as np

def test_values():
    """Settles each bet"""
    profits, total, roi = settle(np.array([10.0, 10, 20]), np.array([2.5, 3.0, 1.8]), np.array([True, False, True]))
    assert np.allclose(profits, [15, -10, 16])
    assert np.isclose(total, 21) and np.isclose(roi, 21 / 40)

def test_no_loops():
    """Doesn't use a loop"""
    assert "for " not in source and "while " not in source, "use np.where instead of a loop"
:::

:::exercise vec-standardise Standardise features
Complete `standardise(X)`: given a 2D array, return a new array where each **column** has mean 0 and standard deviation 1. Use broadcasting, no loops.

If a column has a standard deviation of 0 (all values equal), leave that column as all zeros instead of dividing by zero.

@@starter
import numpy as np

def standardise(X):
    return X

@@solution
import numpy as np

def standardise(X):
    X = np.asarray(X, dtype=float)
    centred = X - X.mean(axis=0)
    std = X.std(axis=0)
    safe = np.where(std == 0, 1.0, std)
    return centred / safe

@@tests
import numpy as np

def test_mean_std():
    """Columns end up with mean 0 and std 1"""
    X = np.array([[1200, 3.1], [1500, 2.2], [1350, 2.9], [1650, 1.8]])
    Z = standardise(X)
    assert Z.shape == X.shape
    assert np.allclose(Z.mean(axis=0), 0) and np.allclose(Z.std(axis=0), 1)

def test_constant_column():
    """A constant column becomes zeros"""
    Z = standardise(np.array([[1.0, 5.0], [2.0, 5.0], [3.0, 5.0]]))
    assert np.allclose(Z[:, 1], 0) and not np.isnan(Z).any()

def test_does_not_modify_input():
    """The input isn't changed"""
    X = np.array([[1.0, 2.0], [3.0, 4.0]])
    standardise(X)
    assert np.array_equal(X, [[1.0, 2.0], [3.0, 4.0]])

@@hint
`X.mean(axis=0)` and `X.std(axis=0)` give one value per column; subtracting and dividing broadcasts them across rows. Replace zero standard deviations with 1 before dividing.
:::

:::exercise vec-simulate Simulate a season
A team scores a Poisson-distributed number of goals with average `lam_for` each match and concedes with average `lam_against`. Complete `simulate_points(lam_for, lam_against, matches, seasons, seed)`:

- generate goals for and against as arrays of shape `(seasons, matches)` with `rng.poisson`, using `rng = np.random.default_rng(seed)` and generating **goals for first, then goals against**
- award 3 points for a win, 1 for a draw, 0 for a loss
- return an array of total points for each simulated season (shape `(seasons,)`)

@@starter
import numpy as np

def simulate_points(lam_for, lam_against, matches, seasons, seed):
    rng = np.random.default_rng(seed)
    return np.zeros(seasons)

@@solution
import numpy as np

def simulate_points(lam_for, lam_against, matches, seasons, seed):
    rng = np.random.default_rng(seed)
    scored = rng.poisson(lam_for, size=(seasons, matches))
    conceded = rng.poisson(lam_against, size=(seasons, matches))
    points = np.where(scored > conceded, 3, np.where(scored == conceded, 1, 0))
    return points.sum(axis=1)

@@tests
import numpy as np

def reference(lam_for, lam_against, matches, seasons, seed):
    rng = np.random.default_rng(seed)
    s = rng.poisson(lam_for, size=(seasons, matches))
    c = rng.poisson(lam_against, size=(seasons, matches))
    return np.select([s > c, s == c], [3, 1], 0).sum(axis=1)

def test_shape():
    """One total per season"""
    assert simulate_points(1.5, 1.2, 38, 100, 0).shape == (100,)

def test_matches_reference():
    """Matches the expected simulation"""
    assert np.array_equal(simulate_points(1.8, 1.0, 38, 50, 7), reference(1.8, 1.0, 38, 50, 7))

def test_strong_team():
    """A strong team averages more points than a weak one"""
    assert simulate_points(2.2, 0.8, 38, 500, 1).mean() > simulate_points(0.8, 2.2, 38, 500, 1).mean()
:::

:::quiz vectorise-quiz Quick check
? For a 2D array of shape (4, 3), what's the shape of `X.sum(axis=0)`?
- [x] (3,)
- [ ] (4,)
- [ ] (4, 3)
> `axis=0` collapses the rows, leaving one value per column.

? What does broadcasting let you do?
- [x] Combine arrays of compatible but different shapes, like subtracting a row of means from every row
- [ ] Send arrays over the network
- [ ] Convert arrays to lists
> The smaller array is virtually stretched to match.

? Why create a random generator with a seed?
- [x] So simulations give the same results every run
- [ ] To make the numbers more random
> Reproducibility again.

? What does `np.where(x > 0, x, 0)` return for `x = np.array([-1, 2, -3, 4])`?
- [x] `[0, 2, 0, 4]`
- [ ] `[1, 3]`
- [ ] `[2, 4]`
> It keeps positive values and replaces the rest with 0.
:::
