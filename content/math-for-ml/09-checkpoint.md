---
title: "Checkpoint: Math & Statistics for ML"
summary: Expected value, distributions, uncertainty, hypothesis tests, linear algebra and gradient descent in one test.
minutes: 60
kind: checkpoint
---

**Passing standard:** all three exercises pass and you score at least 8/10 on the quiz.

:::quiz phase4-final Phase 4 quiz
? A bet at decimal odds 2.5 wins with probability 0.45. What is its expected profit per unit staked?
- [x] +0.125
- [ ] −0.10
- [ ] +0.45
> 0.45 × 1.5 − 0.55 × 1 = 0.125.

? Which distribution would you use for the number of wins in 200 independent bets?
- [x] Binomial
- [ ] Poisson
- [ ] Uniform
> A fixed number of independent yes/no trials.

? Your estimate of a win rate has a standard error of 0.04 from 100 bets. Roughly what will it be from 400 bets?
- [ ] 0.01
- [x] 0.02
- [ ] 0.04
> SE shrinks with √n: four times the data halves it.

? A strategy's p-value against "no edge" is 0.20. What should you conclude?
- [x] The results are quite consistent with luck; there's no good evidence of an edge
- [ ] There's a 20% chance the strategy has an edge
- [ ] The strategy loses money
> Absence of evidence isn't evidence of absence, but you certainly can't claim an edge.

? You tried 50 feature combinations and kept the best backtest. Why might its performance be overstated?
- [x] Picking the best of many tries selects for luck (multiple testing / overfitting)
- [ ] Backtests are always pessimistic
- [ ] 50 is too few combinations
> Test the chosen one on untouched data.

? What does the bootstrap do?
- [x] Estimates uncertainty by recomputing a statistic on many resamples of the data
- [ ] Collects new data
- [ ] Removes outliers
> It works for statistics without simple formulas.

? `X` is (500, 4) and `w` is (4,). What is `(X @ w).shape`?
- [x] (500,)
- [ ] (4,)
- [ ] (500, 4)
> One prediction per row.

? In the Poisson match model, the probability of an away win is the sum of:
- [ ] The diagonal of the score matrix
- [ ] Cells below the diagonal
- [x] Cells above the diagonal
> Rows are home goals and columns away goals; above the diagonal, away goals exceed home goals.

? Gradient descent overshoots and the loss grows each step. What do you change?
- [x] Reduce the learning rate
- [ ] Increase the learning rate
- [ ] Remove standardisation
> Smaller steps stop the overshooting.

? Why does shrinking team strengths towards average often improve predictions?
- [x] It reduces the influence of noise in small samples (regularisation)
- [ ] It makes the model more complex
- [ ] It uses future data
> Extreme estimates from small samples tend to be partly luck.
:::

:::exercise cp4-ev-var Edge, risk and time
Write `bet_profile(p, odds, n)` returning a dictionary for `n` independent one-unit bets, each winning with probability `p` at decimal `odds`:

- `"ev_per_bet"`: expected profit per bet
- `"sd_per_bet"`: standard deviation of profit per bet
- `"ev_total"`, `"sd_total"`: expected total profit and its standard deviation over `n` bets
- `"p_profit"`: probability the total profit is above 0, using the normal approximation

Round everything to 4 decimals.

@@starter
import math
from scipy import stats

def bet_profile(p, odds, n):
    return {}

@@solution
import math
from scipy import stats

def bet_profile(p, odds, n):
    win, lose = odds - 1, -1.0
    ev = p * win + (1 - p) * lose
    sd = math.sqrt(p * (win - ev) ** 2 + (1 - p) * (lose - ev) ** 2)
    ev_total, sd_total = ev * n, sd * math.sqrt(n)
    p_profit = float(stats.norm(ev_total, sd_total).sf(0))
    return {k: round(v, 4) for k, v in {
        "ev_per_bet": ev, "sd_per_bet": sd, "ev_total": ev_total, "sd_total": sd_total, "p_profit": p_profit,
    }.items()}

@@tests
import math

def test_even_money():
    """A 52% even-money bettor over 1,000 bets"""
    got = bet_profile(0.52, 2.0, 1000)
    assert got["ev_per_bet"] == 0.04
    assert math.isclose(got["sd_per_bet"], round(math.sqrt(1 - 0.04 ** 2), 4))
    assert got["ev_total"] == 40.0
    assert 0.89 < got["p_profit"] < 0.91, got["p_profit"]

def test_no_edge():
    """No edge gives a 50% chance of profit"""
    assert bet_profile(0.5, 2.0, 100)["p_profit"] == 0.5
:::

:::exercise cp4-test Test a model's accuracy
A model predicted the winner of 230 out of 400 matches correctly. Always picking the home team would be right 46% of the time.

Write `beats_baseline(correct, total, baseline_rate, alpha=0.01)` returning a tuple `(p_value, significant)`: the one-sided exact binomial p-value that the model's accuracy is **greater** than `baseline_rate` (rounded to 5 decimals), and whether it's below `alpha`.

Then write `accuracy_ci(correct, total, n_boot, seed)`: a 95% bootstrap confidence interval for the accuracy. Build the array of outcomes (`correct` ones and `total - correct` zeros), resample it `n_boot` times with `rng = np.random.default_rng(seed)` and `rng.choice(..., replace=True)`, and return the 2.5th and 97.5th percentiles of the means, rounded to 3 decimals.

@@starter
import numpy as np
from scipy import stats

def beats_baseline(correct, total, baseline_rate, alpha=0.01):
    return (1.0, False)

def accuracy_ci(correct, total, n_boot, seed):
    return (0.0, 0.0)

@@solution
import numpy as np
from scipy import stats

def beats_baseline(correct, total, baseline_rate, alpha=0.01):
    p = stats.binomtest(correct, total, baseline_rate, alternative="greater").pvalue
    return (round(p, 5), bool(p < alpha))

def accuracy_ci(correct, total, n_boot, seed):
    rng = np.random.default_rng(seed)
    outcomes = np.array([1] * correct + [0] * (total - correct))
    means = [rng.choice(outcomes, size=total, replace=True).mean() for _ in range(n_boot)]
    low, high = np.percentile(means, [2.5, 97.5])
    return (round(float(low), 3), round(float(high), 3))

@@tests
import numpy as np
from scipy import stats

def test_p_value():
    """230/400 against a 46% baseline"""
    p, sig = beats_baseline(230, 400, 0.46)
    assert p == round(stats.binomtest(230, 400, 0.46, alternative="greater").pvalue, 5)
    assert sig is True

def test_not_significant():
    """A small improvement isn't significant"""
    assert beats_baseline(190, 400, 0.46)[1] is False

def test_ci():
    """Bootstrap interval contains the accuracy"""
    lo, hi = accuracy_ci(230, 400, 2000, 0)
    assert lo < 0.575 < hi and 0.05 < hi - lo < 0.15
:::

:::exercise cp4-gd Fit by gradient descent
Fit a line $y = a + bx$ by gradient descent on mean squared error. Write `fit_line(x, y, lr, epochs)` returning `(a, b)`:

- start from `a = 0`, `b = 0`
- each epoch, compute predictions `a + b * x`, the errors `pred - y`, and the gradients $\partial L/\partial a = 2\,\text{mean}(\text{err})$ and $\partial L/\partial b = 2\,\text{mean}(\text{err} \cdot x)$
- update both with the learning rate

@@starter
import numpy as np

def fit_line(x, y, lr, epochs):
    a, b = 0.0, 0.0
    return a, b

@@solution
import numpy as np

def fit_line(x, y, lr, epochs):
    x, y = np.asarray(x, float), np.asarray(y, float)
    a, b = 0.0, 0.0
    for _ in range(epochs):
        err = a + b * x - y
        a -= lr * 2 * err.mean()
        b -= lr * 2 * (err * x).mean()
    return a, b

@@tests
import numpy as np

def test_recovers_line():
    """Recovers y = 1.5 + 0.8x from noisy data"""
    rng = np.random.default_rng(0)
    x = rng.uniform(-2, 2, 300)
    y = 1.5 + 0.8 * x + rng.normal(0, 0.1, 300)
    a, b = fit_line(x, y, 0.1, 500)
    assert abs(a - 1.5) < 0.05 and abs(b - 0.8) < 0.05, (a, b)

def test_matches_least_squares():
    """Converges to the least-squares solution"""
    x = np.array([0.0, 1.0, 2.0, 3.0, 4.0])
    y = np.array([1.0, 2.9, 5.2, 7.1, 8.8])
    a, b = fit_line(x, y, 0.05, 5000)
    ref_b, ref_a = np.polyfit(x, y, 1)
    assert np.isclose(a, ref_a, atol=1e-3) and np.isclose(b, ref_b, atol=1e-3)
:::

## Phase 4 complete

You now have the mathematical toolkit that underpins machine learning: probability and expected value for decisions, distributions for modelling, sampling theory for honesty about uncertainty, linear algebra for data, and gradient descent for learning. Phase 5 builds on all of it with scikit-learn.
