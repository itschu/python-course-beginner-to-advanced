---
title: Probability and expected value
summary: The rules of probability, conditional probability, Bayes' theorem, and expected value and variance, the two numbers that decide whether any bet, trade or decision is worth making.
minutes: 55
kind: lesson
---

Machine learning models output probabilities. Betting and trading are decisions made under uncertainty. Both rest on a handful of ideas from probability. We'll learn them by computing and simulating, not by proving theorems.

## Probability basics

A **probability** is a number from 0 (impossible) to 1 (certain). Three rules cover most of what you need:

- **Complement:** $P(\text{not } A) = 1 - P(A)$
- **Addition** (for outcomes that can't happen together): $P(A \text{ or } B) = P(A) + P(B)$
- **Multiplication** (for independent events): $P(A \text{ and } B) = P(A) \times P(B)$

```python
p_home, p_draw = 0.46, 0.25

p_away = 1 - p_home - p_draw                 # complement: the three outcomes cover everything
p_not_lose_home = p_home + p_draw            # addition: home win OR draw ("double chance")
p_two_home_wins = p_home * p_home            # multiplication: two independent matches
p_at_least_one_draw_in_5 = 1 - (1 - p_draw) ** 5

print(f"away {p_away:.2f}, home doesn't lose {p_not_lose_home:.2f}")
print(f"two home wins {p_two_home_wins:.3f}, at least one draw in five matches {p_at_least_one_draw_in_5:.3f}")
```

The multiplication rule is why accumulator bets ("parlays") are so attractive to bookmakers: five selections at 60% each have only a $0.6^5 \approx 8\%$ chance of all winning, and the bookmaker's margin is multiplied five times too.

## Probability as long-run frequency

A probability says how often something happens over many repetitions. Simulation makes this concrete. This is the **law of large numbers**: the observed frequency settles towards the true probability as the number of trials grows.

```python
import numpy as np

rng = np.random.default_rng(0)
p = 0.46
for n in [10, 100, 1_000, 10_000, 1_000_000]:
    wins = rng.random(n) < p
    print(f"{n:>9,} matches: home win rate {wins.mean():.4f}")
```

With 10 matches, the observed rate can be wildly off. That's the first warning about judging a strategy (or a tipster) on a small sample.

## Conditional probability

$P(A \mid B)$, read "the probability of A given B", is the probability of A once you know B happened:

$$
P(A \mid B) = \frac{P(A \text{ and } B)}{P(B)}
$$

With data, it's just filtering then counting:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
p_home = (df["FTR"] == "H").mean()
leading_shots = df[df["HS"] > df["AS"]]
p_home_given_more_shots = (leading_shots["FTR"] == "H").mean()

print(f"P(home win) = {p_home:.3f}")
print(f"P(home win | home had more shots) = {p_home_given_more_shots:.3f}")
```

Knowing B changes the probability of A, which is exactly what a predictive feature does. A machine learning classifier is, in the end, a machine for estimating $P(\text{outcome} \mid \text{features})$.

## Bayes' theorem

Bayes' theorem flips a conditional probability around:

$$
P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)}
$$

A classic example. A tipster claims to be skilled. Suppose only 5% of tipsters truly have an edge. A skilled tipster shows a profit over a season 80% of the time, but an unskilled one still does 30% of the time by luck. A tipster shows a profit. How likely are they to be skilled?

```python
p_skilled = 0.05
p_profit_given_skilled = 0.80
p_profit_given_unskilled = 0.30

p_profit = p_profit_given_skilled * p_skilled + p_profit_given_unskilled * (1 - p_skilled)
p_skilled_given_profit = p_profit_given_skilled * p_skilled / p_profit

print(f"P(profit) = {p_profit:.3f}")
print(f"P(skilled | profitable season) = {p_skilled_given_profit:.1%}")
```

Only about 12%. Most profitable tipsters are lucky, because unskilled ones vastly outnumber skilled ones. This **base rate** effect fools people constantly: in medical tests, in fraud detection, and in judging investment managers.

## Expected value

The **expected value** (EV) of a random quantity is its probability-weighted average: what you'd get on average if you repeated the situation forever.

$$
E[X] = \sum_i x_i \, P(x_i)
$$

For a bet of stake $s$ at decimal odds $o$ with win probability $p$:

$$
E[\text{profit}] = p \cdot s\,(o - 1) + (1 - p)(-s)
$$

```python
def ev(p, odds, stake=1.0):
    return p * stake * (odds - 1) - (1 - p) * stake

print(f"{ev(0.50, 2.10):+.3f} per unit: positive EV")
print(f"{ev(0.50, 1.90):+.3f} per unit: negative EV")
print(f"{ev(1 / 2.10, 2.10):+.3f} per unit: your probability equals the implied one, so EV is exactly 0")
```

A bet has positive EV exactly when $p > 1/o$: your probability beats the implied probability. Every serious betting or trading strategy comes down to this.

## Variance: how bumpy is the ride?

EV tells you the average; **variance** tells you how far results spread around it. Its square root, the **standard deviation**, is in the same units as the outcome:

$$
\text{Var}(X) = E\big[(X - E[X])^2\big]
$$

```python
import math

def ev(p, odds, stake=1.0):
    return p * stake * (odds - 1) - (1 - p) * stake

def bet_std(p, odds, stake=1.0):
    win, lose = stake * (odds - 1), -stake
    mean = p * win + (1 - p) * lose
    variance = p * (win - mean) ** 2 + (1 - p) * (lose - mean) ** 2
    return math.sqrt(variance)

for p, odds in [(0.52, 2.0), (0.11, 10.0)]:
    print(f"p={p}, odds={odds}: EV {ev(p, odds):+.3f}, std {bet_std(p, odds):.2f} per unit")
```

Both bets have a similar edge (+4% and +10%), but the long shot's results swing about three times as much. Over $n$ independent bets, the EV grows like $n$ but the standard deviation only like $\sqrt{n}$, which is why a real edge eventually shows through the noise, and why it can take thousands of bets to be sure it's there.

## Practice

:::exercise prob-accumulator Accumulator maths
Write `accumulator(probabilities, odds)` for a multi-bet where **every** selection must win. Return a tuple `(win_probability, combined_odds, ev_per_unit)`:

- the win probability is the product of the probabilities (assume independence),
- the combined odds are the product of the odds,
- the EV per unit staked is `p * (combined_odds - 1) - (1 - p)`.

Round all three to 4 decimals.

@@starter
def accumulator(probabilities, odds):
    return (0.0, 0.0, 0.0)

@@solution
import math

def accumulator(probabilities, odds):
    p = math.prod(probabilities)
    combined = math.prod(odds)
    ev = p * (combined - 1) - (1 - p)
    return (round(p, 4), round(combined, 4), round(ev, 4))

@@tests
def test_two_legs():
    """Two independent selections"""
    assert accumulator([0.5, 0.5], [2.1, 2.1]) == (0.25, 4.41, 0.1025)

def test_three_legs():
    """Margins compound: a slightly negative leg becomes clearly negative"""
    p, o, ev = accumulator([0.6, 0.6, 0.6], [1.6, 1.6, 1.6])
    assert (p, o) == (0.216, 4.096)
    assert ev == round(0.216 * 3.096 - 0.784, 4)

def test_single():
    """One leg is just a single bet"""
    assert accumulator([0.4], [2.5]) == (0.4, 2.5, 0.0)
:::

:::exercise prob-conditional Conditional probability from data
Using `data/matches.csv`, write `p_home_win_given(df, condition)` where `condition` is a boolean Series aligned with `df`. Return $P(\text{home win} \mid \text{condition})$ rounded to 3 decimals.

Then write `shot_lift(df)`: the conditional home win probability given that the home side had **at least 5 more shots on target** than the away side (`HST - AST >= 5`), divided by the overall home win probability, rounded to 2 decimals. (A "lift" above 1 means the condition makes a home win more likely.)

@@starter
import pandas as pd

def p_home_win_given(df, condition):
    return 0.0

def shot_lift(df):
    return 0.0

@@solution
import pandas as pd

def p_home_win_given(df, condition):
    return round((df.loc[condition, "FTR"] == "H").mean(), 3)

def shot_lift(df):
    conditional = (df.loc[df["HST"] - df["AST"] >= 5, "FTR"] == "H").mean()
    overall = (df["FTR"] == "H").mean()
    return round(conditional / overall, 2)

@@tests
import pandas as pd

def test_conditional():
    """Conditional probability by filtering"""
    df = pd.read_csv("data/matches.csv")
    cond = df["AvgH"] < 2.0
    assert p_home_win_given(df, cond) == round((df[cond]["FTR"] == "H").mean(), 3)

def test_lift():
    """Lift for a big shots-on-target advantage"""
    df = pd.read_csv("data/matches.csv")
    exp = round((df[df["HST"] - df["AST"] >= 5]["FTR"] == "H").mean() / (df["FTR"] == "H").mean(), 2)
    assert shot_lift(df) == exp
    assert shot_lift(df) > 1
:::

:::exercise prob-bayes Bayes for spam filters
An email filter flags emails containing the word "winner". 2% of emails are spam. 40% of spam emails contain "winner", and 0.5% of genuine emails do.

Write `bayes(prior, p_evidence_given_true, p_evidence_given_false)` returning the posterior probability $P(\text{true} \mid \text{evidence})$, and set `p_spam_given_winner` to the answer for this example, rounded to 3 decimals.

@@starter
def bayes(prior, p_evidence_given_true, p_evidence_given_false):
    return 0.0

p_spam_given_winner = 0.0

@@solution
def bayes(prior, p_evidence_given_true, p_evidence_given_false):
    evidence = p_evidence_given_true * prior + p_evidence_given_false * (1 - prior)
    return p_evidence_given_true * prior / evidence

p_spam_given_winner = round(bayes(0.02, 0.40, 0.005), 3)

@@tests
import math

def test_bayes_function():
    """The tipster example gives about 12.3%"""
    assert math.isclose(bayes(0.05, 0.8, 0.3), 0.04 / 0.325)

def test_spam():
    """P(spam | 'winner') is 0.62"""
    assert p_spam_given_winner == 0.62, p_spam_given_winner

def test_no_information():
    """Evidence that's equally likely either way doesn't change the prior"""
    assert math.isclose(bayes(0.3, 0.5, 0.5), 0.3)
:::

:::quiz prob-quiz Quick check
? A bet at decimal odds 3.0 has positive expected value when your probability is:
- [ ] Above 0.25
- [x] Above 0.333
- [ ] Above 0.5
> Positive EV requires p > 1/odds = 0.333.

? Two bets have the same EV. Bet A is at odds 1.5, bet B at odds 12. Which has the larger variance?
- [ ] A
- [x] B
> Long odds mean rare, large wins: much bigger swings.

? Over n independent bets, how does the standard deviation of total profit grow?
- [ ] Like n
- [x] Like √n
- [ ] It stays constant
> EV grows like n, so the signal eventually beats the noise.

? Why might most profitable tipsters still be unskilled?
- [x] Unskilled tipsters are far more common, and many get lucky
- [ ] Skilled tipsters always lose money
- [ ] Profits are impossible without skill
> That's the base rate effect, which Bayes' theorem makes precise.
:::
