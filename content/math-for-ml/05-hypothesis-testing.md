---
title: "Hypothesis testing: skill or luck?"
summary: Null hypotheses, p-values by simulation and with scipy, the trap of testing many strategies, and how many bets you need to prove an edge.
minutes: 55
kind: lesson
---

A tipster won 58 of their last 100 even-money tips. Are they skilled, or lucky? A model beat the bookmaker by 2% over a season. Real, or noise? **Hypothesis testing** gives a disciplined way to answer.

## The logic

1. State a **null hypothesis** $H_0$: the boring explanation. "The tipster has no skill: each tip wins with probability 0.5."
2. Pick a **test statistic**: the number of wins.
3. Ask: **if $H_0$ were true, how likely is a result at least this extreme?** That probability is the **p-value**.
4. If it's very small (conventionally below 0.05), the data is hard to explain by luck alone, so you **reject** $H_0$.

## A p-value by simulation

Simulation makes the idea concrete. Pretend the tipster is a coin, flip it 100 times, many thousands of times over, and see how often a coin does at least as well:

```python
import numpy as np

rng = np.random.default_rng(0)
observed_wins = 58
simulated = rng.binomial(n=100, p=0.5, size=100_000)       # 100,000 luck-only tipsters
p_value = (simulated >= observed_wins).mean()
print(f"P(a no-skill tipster wins >= {observed_wins}/100) = {p_value:.3f}")
```

About 7%. A coin does this well fairly often, so 58/100 isn't convincing evidence of skill.

The exact answer comes from the binomial distribution, and scipy has the test built in:

```python
from scipy import stats

result = stats.binomtest(58, n=100, p=0.5, alternative="greater")
print(f"exact one-sided p-value: {result.pvalue:.4f}")
print(f"580/1000 instead: {stats.binomtest(580, 1000, 0.5, alternative='greater').pvalue:.2e}")
```

The same 58% win rate over 1,000 tips has a p-value of about 0.0000002: roughly a 1 in 4 million chance for a lucky coin. **Sample size is everything.**

:::warning What a p-value is not
A p-value is **not** the probability that the tipster is unskilled. It's the probability of data this extreme *if* they were unskilled. To get "probability of skill", you need Bayes' theorem and a prior, as in the first lesson of this phase.
:::

## Testing a betting strategy

For bets at varying odds, test the **profit** rather than the win count. Under the null hypothesis that the odds are fair (your edge is zero), simulate many seasons of the same bets with each bet winning at its *implied* probability:

```python
import numpy as np

rng = np.random.default_rng(5)
# a season of 300 bets at a range of odds, and their actual results
odds = rng.uniform(1.6, 4.0, 300)
won = rng.random(300) < (1 / odds) * 1.04          # this strategy has a small real edge
actual_profit = np.where(won, odds - 1, -1).sum()

null_profits = np.where(rng.random((20_000, 300)) < 1 / odds, odds - 1, -1).sum(axis=1)
p_value = (null_profits >= actual_profit).mean()
print(f"actual profit {actual_profit:+.1f} units over 300 bets, p-value {p_value:.3f}")
```

Note this tests against **fair** odds. Real odds include the bookmaker's margin, so a no-skill bettor's expected profit is negative, and the true null distribution sits lower still.

## Errors and power

| | $H_0$ true (no skill) | $H_0$ false (real skill) |
| --- | --- | --- |
| Reject $H_0$ | **Type I error** (false positive), rate α | Correct |
| Don't reject | Correct | **Type II error** (false negative) |

The **power** of a test is the probability it detects a real effect. Small edges need large samples to detect. How many bets do you need to detect a 2% edge at even money (a 51% win rate) with 80% power?

```python
import numpy as np
from scipy import stats

def power(n, p_true, p_null=0.5, alpha=0.05, sims=4_000, seed=0):
    rng = np.random.default_rng(seed)
    critical = stats.binom(n, p_null).ppf(1 - alpha) + 1       # wins needed to reject H0
    wins = rng.binomial(n, p_true, size=sims)
    return (wins >= critical).mean()

for n in [100, 1_000, 5_000, 15_000]:
    print(f"{n:>6,} bets: power {power(n, 0.51):.0%}")
```

Roughly 15,000 bets. This is the most sobering number in this course: **a small but real edge takes thousands of bets to prove**, and anyone who judges a strategy on a few dozen results is mostly looking at noise.

## The multiple testing trap

Test 20 useless strategies at the 5% level and, on average, one will look "significant" by pure chance. Test 1,000 feature combinations or model settings and you're guaranteed to find impressive-looking winners:

```python
import numpy as np
from scipy import stats

rng = np.random.default_rng(11)
n_strategies, n_bets = 200, 250
results = rng.random((n_strategies, n_bets)) < 0.5         # 200 strategies with NO edge
wins = results.sum(axis=1)
p_values = np.array([stats.binomtest(int(w), n_bets, 0.5, alternative="greater").pvalue for w in wins])

print(f"'significant' at 5%: {(p_values < 0.05).sum()} of {n_strategies} useless strategies")
print(f"best strategy: {wins.max()}/{n_bets} wins ({wins.max() / n_bets:.1%}), p = {p_values.min():.4f}")
print(f"after a Bonferroni correction (p < {0.05 / n_strategies:.5f}): {(p_values < 0.05 / n_strategies).sum()}")
```

This is how **p-hacking** and **backtest overfitting** happen. Defences:

- Decide what you'll test **before** looking at the data.
- **Correct** for the number of tests (Bonferroni divides α by the number of tests; it's conservative but simple).
- Keep untouched **out-of-sample** data and test the final candidate on it only once. In ML, that's the test set (Phase 5).

## Comparing two groups

Is the average home goal rate different between two seasons? A **t-test** compares two means:

```python
import pandas as pd
from scipy import stats

df = pd.read_csv("data/matches.csv")
a = df.loc[df["Season"] == "2022-23", "FTHG"]
b = df.loc[df["Season"] == "2024-25", "FTHG"]
result = stats.ttest_ind(a, b, equal_var=False)
print(f"means {a.mean():.2f} vs {b.mean():.2f}, p = {result.pvalue:.3f}")
```

## Practice

:::exercise ht-binom Test a tipster
Write `tipster_p_value(wins, tips, p_null=0.5)` returning the one-sided exact binomial p-value (`alternative="greater"`) from `scipy.stats.binomtest`, rounded to 4 decimals.

Then set `convincing` to a list of the records below (as `(wins, tips)` tuples) whose p-value is **below 0.01**:

`(58, 100)`, `(70, 120)`, `(540, 1000)`, `(12, 15)`, `(530, 1000)`

@@starter
from scipy import stats

def tipster_p_value(wins, tips, p_null=0.5):
    return 1.0

records = [(58, 100), (70, 120), (540, 1000), (12, 15), (530, 1000)]
convincing = []

@@solution
from scipy import stats

def tipster_p_value(wins, tips, p_null=0.5):
    return round(stats.binomtest(wins, tips, p_null, alternative="greater").pvalue, 4)

records = [(58, 100), (70, 120), (540, 1000), (12, 15), (530, 1000)]
convincing = [r for r in records if tipster_p_value(*r) < 0.01]

@@tests
from scipy import stats

def test_p_value():
    """Matches scipy's exact test"""
    assert tipster_p_value(58, 100) == round(stats.binomtest(58, 100, 0.5, alternative="greater").pvalue, 4)

def test_convincing():
    """Selects the records with p < 0.01"""
    exp = [r for r in [(58, 100), (70, 120), (540, 1000), (12, 15), (530, 1000)]
           if stats.binomtest(r[0], r[1], 0.5, alternative="greater").pvalue < 0.01]
    assert convincing == exp, f"got {convincing}, expected {exp}"
:::

:::exercise ht-permutation A permutation test
A **permutation test** checks whether two groups really differ by shuffling the group labels. If the labels don't matter, shuffled data should often show a difference as big as the real one.

Write `permutation_p_value(a, b, n_perm, seed)`:

1. `observed` = `mean(a) - mean(b)`
2. combine the values; for each of `n_perm` permutations (using `rng = np.random.default_rng(seed)` and `rng.permutation(combined)`), split into the first `len(a)` values and the rest, and compute the difference in means
3. return the share of permutations where the absolute difference is **at least** the absolute observed difference, rounded to 3 decimals

@@starter
import numpy as np

def permutation_p_value(a, b, n_perm, seed):
    rng = np.random.default_rng(seed)
    return 1.0

@@solution
import numpy as np

def permutation_p_value(a, b, n_perm, seed):
    rng = np.random.default_rng(seed)
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    observed = abs(a.mean() - b.mean())
    combined = np.concatenate([a, b])
    count = 0
    for _ in range(n_perm):
        shuffled = rng.permutation(combined)
        diff = abs(shuffled[: len(a)].mean() - shuffled[len(a):].mean())
        count += diff >= observed
    return round(count / n_perm, 3)

@@tests
import numpy as np

def reference(a, b, n_perm, seed):
    rng = np.random.default_rng(seed)
    a, b = np.asarray(a, float), np.asarray(b, float)
    obs = abs(a.mean() - b.mean())
    c = np.concatenate([a, b])
    k = sum(abs(s[:len(a)].mean() - s[len(a):].mean()) >= obs for s in (rng.permutation(c) for _ in range(n_perm)))
    return round(k / n_perm, 3)

def test_reference():
    """Matches the expected procedure"""
    a = [2, 3, 1, 4, 2, 3, 5, 2]
    b = [1, 0, 2, 1, 1, 2, 0, 1]
    assert permutation_p_value(a, b, 2000, 0) == reference(a, b, 2000, 0)

def test_no_difference():
    """Identical distributions give a large p-value"""
    rng = np.random.default_rng(1)
    a, b = rng.normal(0, 1, 50), rng.normal(0, 1, 50)
    assert permutation_p_value(a, b, 1000, 2) > 0.05

def test_clear_difference():
    """Very different groups give a tiny p-value"""
    assert permutation_p_value([10, 11, 12, 13, 14] * 4, [1, 2, 3, 4, 5] * 4, 1000, 3) < 0.01
:::

:::exercise ht-sample-size How many bets?
Using the normal approximation, the number of bets needed to detect a win rate of `p_true` against `p_null` (one-sided, significance `alpha`, power `power`) is approximately:

$$
n = \left( \frac{z_{1-\alpha}\sqrt{p_0(1-p_0)} + z_{\text{power}}\sqrt{p_1(1-p_1)}}{p_1 - p_0} \right)^2
$$

where $z_q$ is `stats.norm.ppf(q)`. Write `bets_needed(p_true, p_null=0.5, alpha=0.05, power=0.8)` returning $n$ rounded **up** to a whole number (`math.ceil`).

@@starter
import math
from scipy import stats

def bets_needed(p_true, p_null=0.5, alpha=0.05, power=0.8):
    return 0

@@solution
import math
from scipy import stats

def bets_needed(p_true, p_null=0.5, alpha=0.05, power=0.8):
    z_a = stats.norm.ppf(1 - alpha)
    z_b = stats.norm.ppf(power)
    num = z_a * math.sqrt(p_null * (1 - p_null)) + z_b * math.sqrt(p_true * (1 - p_true))
    return math.ceil((num / (p_true - p_null)) ** 2)

@@tests
def test_two_percent():
    """A 51% bettor needs about 15,000 bets"""
    assert 15_400 <= bets_needed(0.51) <= 15_500, bets_needed(0.51)

def test_bigger_edge():
    """A 55% bettor needs far fewer"""
    assert 600 <= bets_needed(0.55) <= 625, bets_needed(0.55)

def test_more_power_needs_more():
    """Higher power needs more bets"""
    assert bets_needed(0.53, power=0.95) > bets_needed(0.53, power=0.8)
:::

:::quiz ht-quiz Quick check
? A p-value of 0.03 means:
- [ ] There's a 3% chance the null hypothesis is true
- [x] If the null hypothesis were true, results this extreme would happen about 3% of the time
- [ ] The effect is large
> It's about the data under H0, not the probability of H0.

? You test 100 strategies with no edge at the 5% level. About how many look significant?
- [ ] 0
- [x] 5
- [ ] 50
> That's the multiple testing trap.

? Why does the same 58% win rate become convincing over 1,000 tips but not 100?
- [x] Luck averages out with more data, so big deviations become very unlikely without skill
- [ ] Tipsters get better over time
- [ ] The p-value formula changes
> Standard errors shrink like √n.

? What's the best protection against backtest overfitting?
- [x] Test the final strategy once on data you never used while developing it
- [ ] Try more strategies
- [ ] Use a bigger significance level
> Out-of-sample testing is the gold standard.
:::
