---
title: Probability distributions
summary: Bernoulli, binomial, Poisson and normal distributions with scipy.stats, and how two Poisson distributions predict a football match.
minutes: 55
kind: lesson
---

A **probability distribution** describes all the possible values of a random quantity and how likely each is. A handful of distributions model a surprising amount of the world. We'll use `scipy.stats`, which gives every distribution the same interface:

| Method | Meaning |
| --- | --- |
| `pmf(k)` / `pdf(x)` | probability of exactly k (discrete) / density at x (continuous) |
| `cdf(x)` | probability of a value ≤ x |
| `sf(x)` | probability of a value > x (that's 1 − cdf) |
| `ppf(q)` | the value below which a fraction q of outcomes fall (inverse cdf) |
| `rvs(size)` | random samples |
| `mean()`, `std()` | summary numbers |

## Bernoulli and binomial: wins and losses

A **Bernoulli** variable is a single yes/no trial with probability $p$, like one bet. The **binomial** distribution counts the successes in $n$ independent trials:

$$
P(K = k) = \binom{n}{k} p^k (1-p)^{n-k}
$$

```python
from scipy import stats

n, p = 100, 0.55                     # 100 bets, each with a 55% chance
wins = stats.binom(n, p)
print(f"expected wins: {wins.mean():.0f} ± {wins.std():.1f}")
print(f"P(exactly 55 wins) = {wins.pmf(55):.3f}")
print(f"P(50 or fewer wins) = {wins.cdf(50):.3f}")
print(f"P(more than 60 wins) = {wins.sf(60):.3f}")
print(f"90% of the time, wins fall between {wins.ppf(0.05):.0f} and {wins.ppf(0.95):.0f}")
```

Even with a genuine 55% edge, you'd win 50 or fewer of 100 bets about 18% of the time.

```python
import matplotlib.pyplot as plt
import numpy as np
from scipy import stats

k = np.arange(30, 81)
fig, ax = plt.subplots(figsize=(7, 3.2))
ax.bar(k, stats.binom(100, 0.50).pmf(k), alpha=0.6, label="No edge (p = 0.50)")
ax.bar(k, stats.binom(100, 0.55).pmf(k), alpha=0.6, label="Edge (p = 0.55)")
ax.set_xlabel("Wins out of 100 bets")
ax.set_ylabel("Probability")
ax.set_title("Skill and luck overlap a lot over 100 bets")
ax.legend()
fig.tight_layout()
plt.show()
```

The two distributions overlap heavily. After 100 bets you often can't tell a 55% bettor from a 50% one.

## Poisson: counting goals

The **Poisson** distribution counts events that occur independently at an average rate $\lambda$: goals in a match, customers per hour, website errors per day:

$$
P(K = k) = \frac{\lambda^k e^{-\lambda}}{k!}
$$

Its mean and variance are both $\lambda$. You saw in Phase 3 that goals fit it well:

```python
import pandas as pd
from scipy import stats

df = pd.read_csv("data/matches.csv")
lam = df["FTHG"].mean()
goals = stats.poisson(lam)

for k in range(6):
    print(f"{k} goals: observed {(df['FTHG'] == k).mean():.3f}, Poisson {goals.pmf(k):.3f}")
print(f"mean {df['FTHG'].mean():.2f} vs variance {df['FTHG'].var():.2f} (Poisson says they're equal)")
```

## From goals to match results

Here's a beautiful idea. If home goals are Poisson with rate $\lambda_H$ and away goals Poisson with rate $\lambda_A$ (and they're independent), the probability of each **scoreline** is the product of the two probabilities. Add up the scorelines to get the probability of each result:

```python
import numpy as np
from scipy import stats

lam_home, lam_away = 1.7, 1.1
goals = np.arange(11)
p_home = stats.poisson(lam_home).pmf(goals)
p_away = stats.poisson(lam_away).pmf(goals)
scores = np.outer(p_home, p_away)          # scores[i, j] = P(home scores i, away scores j)

print("P(2-1) =", round(scores[2, 1], 4))
print("most likely score:", np.unravel_index(scores.argmax(), scores.shape))
home_win = np.tril(scores, -1).sum()       # below the diagonal: home goals > away goals
draw = np.trace(scores)                    # the diagonal
away_win = np.triu(scores, 1).sum()
print(f"H {home_win:.3f}  D {draw:.3f}  A {away_win:.3f}")
print(f"fair odds: H {1 / home_win:.2f}, D {1 / draw:.2f}, A {1 / away_win:.2f}")
print(f"over 2.5 goals: {1 - sum(scores[i, j] for i in range(3) for j in range(3) if i + j <= 2):.3f}")
```

This **Poisson match model** is the foundation of many football models (Maher, 1982; Dixon and Coles, 1997). If you can estimate each team's expected goals well, you get probabilities for every market at once. In Phase 6 you'll estimate the $\lambda$s from data.

## The normal distribution

The **normal** (Gaussian) distribution is the bell curve, described by its mean $\mu$ and standard deviation $\sigma$. About 68% of values fall within $1\sigma$ of the mean, 95% within $2\sigma$, and 99.7% within $3\sigma$:

```python
from scipy import stats

z = stats.norm(0, 1)                   # the "standard normal"
print(f"within 1 sd: {z.cdf(1) - z.cdf(-1):.3f}")
print(f"within 2 sd: {z.cdf(2) - z.cdf(-2):.3f}")
print(f"95% interval: ±{z.ppf(0.975):.2f} sd")

heights = stats.norm(175, 7)           # adult heights in cm (illustrative)
print(f"P(height > 190cm) = {heights.sf(190):.4f}")
```

Why is it everywhere? The **central limit theorem** (next-but-one lesson): sums and averages of many independent random things are approximately normal, whatever the individual things look like. Your total profit after hundreds of bets is approximately normal even though each bet is just win-or-lose.

:::warning Fat tails
Financial returns are *not* quite normal: extreme days happen far more often than the bell curve predicts. Models that assume normality underestimate crash risk. Always check the tails of your data.
:::

## Practice

:::exercise dist-binom Binomial questions
Using `scipy.stats.binom`, write `bet_record_probabilities(n, p)` returning a dictionary with:

- `"exactly_half"`: P(exactly n/2 wins) (assume n is even)
- `"losing_record"`: P(fewer than n/2 wins)
- `"at_least_60pct"`: P(wins ≥ 60% of n) (assume 0.6·n is a whole number)

Round each to 4 decimals.

@@starter
from scipy import stats

def bet_record_probabilities(n, p):
    return {}

@@solution
from scipy import stats

def bet_record_probabilities(n, p):
    d = stats.binom(n, p)
    half = n // 2
    target = round(0.6 * n)
    return {
        "exactly_half": round(float(d.pmf(half)), 4),
        "losing_record": round(float(d.cdf(half - 1)), 4),
        "at_least_60pct": round(float(d.sf(target - 1)), 4),
    }

@@tests
from scipy import stats

def test_fair():
    """A fair 50% bettor over 100 bets"""
    got = bet_record_probabilities(100, 0.5)
    assert got["exactly_half"] == round(float(stats.binom(100, 0.5).pmf(50)), 4)
    assert got["losing_record"] == round(float(stats.binom(100, 0.5).cdf(49)), 4)
    assert got["at_least_60pct"] == round(float(stats.binom(100, 0.5).sf(59)), 4)

def test_edge():
    """A 55% bettor over 50 bets"""
    got = bet_record_probabilities(50, 0.55)
    assert got["losing_record"] == round(float(stats.binom(50, 0.55).cdf(24)), 4)
    assert got["at_least_60pct"] == round(float(stats.binom(50, 0.55).sf(29)), 4)

@@hint
"Fewer than n/2" means ≤ n/2 − 1, so use `cdf(half - 1)`. "At least k" is `sf(k - 1)`.
:::

:::exercise dist-poisson-match A Poisson match model
Write `match_probabilities(lam_home, lam_away, max_goals=10)` returning a dictionary with the probabilities of `"H"`, `"D"` and `"A"`, and `"over_2_5"` (more than 2.5 total goals), each rounded to 4 decimals. Build the score matrix with `np.outer` as in the lesson.

@@starter
import numpy as np
from scipy import stats

def match_probabilities(lam_home, lam_away, max_goals=10):
    return {}

@@solution
import numpy as np
from scipy import stats

def match_probabilities(lam_home, lam_away, max_goals=10):
    g = np.arange(max_goals + 1)
    scores = np.outer(stats.poisson(lam_home).pmf(g), stats.poisson(lam_away).pmf(g))
    total = g[:, None] + g[None, :]
    return {
        "H": round(float(np.tril(scores, -1).sum()), 4),
        "D": round(float(np.trace(scores)), 4),
        "A": round(float(np.triu(scores, 1).sum()), 4),
        "over_2_5": round(float(scores[total > 2.5].sum()), 4),
    }

@@tests
import math

def test_even_teams():
    """Equal teams are equally likely to win"""
    got = match_probabilities(1.3, 1.3)
    assert got["H"] == got["A"]
    assert math.isclose(got["H"] + got["D"] + got["A"], 1, abs_tol=1e-3)

def test_values():
    """Known values for 1.7 v 1.1"""
    got = match_probabilities(1.7, 1.1)
    assert abs(got["H"] - 0.514) < 1e-3, got
    assert abs(got["D"] - 0.2402) < 1e-3, got
    assert abs(got["over_2_5"] - 0.5305) < 1e-3, got

@@hint
`np.tril(scores, -1)` keeps the cells below the diagonal (home wins). For over 2.5, build a matrix of total goals with broadcasting: `g[:, None] + g[None, :]`.
:::

:::exercise dist-normal Normal approximation
Your total profit over many bets is approximately normal. Write `prob_profitable(n, p, odds)`: for `n` one-unit bets each with win probability `p` at decimal `odds`, compute the mean and standard deviation of the **total** profit (per-bet mean times n; per-bet standard deviation times √n), then return P(total profit > 0) from the normal distribution, rounded to 3 decimals.

@@starter
import math
from scipy import stats

def prob_profitable(n, p, odds):
    return 0.0

@@solution
import math
from scipy import stats

def prob_profitable(n, p, odds):
    win, lose = odds - 1, -1.0
    mean = p * win + (1 - p) * lose
    std = math.sqrt(p * (win - mean) ** 2 + (1 - p) * (lose - mean) ** 2)
    return round(float(stats.norm(mean * n, std * math.sqrt(n)).sf(0)), 3)

@@tests
def test_no_edge():
    """No edge: a coin flip"""
    assert prob_profitable(100, 0.5, 2.0) == 0.5

def test_edge_grows_with_n():
    """With an edge, more bets means a better chance of profit"""
    a = prob_profitable(100, 0.53, 2.0)
    b = prob_profitable(2000, 0.53, 2.0)
    assert 0.6 < a < 0.8 and b > 0.99, (a, b)

def test_value():
    """500 bets at 1.95 on a coin flip: about 28% end in profit (matches the Phase 3 simulation)"""
    assert prob_profitable(500, 0.5, 1.95) == 0.283
:::

:::quiz dist-quiz Quick check
? Which distribution counts goals in a match?
- [ ] Binomial
- [x] Poisson
- [ ] Normal
> Events at a constant average rate: Poisson.

? For a Poisson distribution with λ = 1.5, what are the mean and variance?
- [x] Both 1.5
- [ ] Mean 1.5, variance 2.25
- [ ] Mean 1.5, variance 0.75
> Equal mean and variance is a Poisson signature.

? `stats.binom(100, 0.5).sf(60)` gives:
- [ ] P(exactly 60 successes)
- [x] P(more than 60 successes)
- [ ] P(60 or fewer successes)
> `sf` is the survival function: 1 − cdf.

? In the Poisson match model, how do you get P(draw) from the score matrix?
- [x] Sum the diagonal
- [ ] Sum below the diagonal
- [ ] Take the largest cell
> Draws are scorelines where home goals equal away goals.
:::
