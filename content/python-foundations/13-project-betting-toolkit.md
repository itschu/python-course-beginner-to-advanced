---
title: "Project: a betting maths toolkit"
summary: Build a set of tested functions that convert odds, measure the bookmaker's margin, find fair odds, calculate expected value and stakes, and analyse a real-format dataset.
minutes: 120
kind: project
---

Time to build something real. You'll write a small library of functions, the same maths that betting models, bookmakers and trading desks use every day. Later phases import these ideas directly: your value-betting model in Phase 6 needs every one of them.

Each step is an exercise with tests. Take your time, and use the hints.

:::warning A note before we start
This project is about understanding the maths, and the maths is not kind to bettors: bookmakers build a margin into every price, so most people lose over time. Treat it as an engineering and statistics project, not a plan for your money. If betting is ever causing you stress, [BeGambleAware](https://www.begambleaware.org/) offers free, confidential support.
:::

## The ideas

**Decimal odds** (e.g. `2.50`) are the total return per unit staked, including the stake. Other countries use other formats:

- **Fractional** (UK): `"3/2"` means a profit of 3 for every 2 staked. Decimal = 1 + 3/2 = 2.5.
- **American (moneyline)**: `+150` means a profit of 150 on a 100 stake (decimal 2.5). `-200` means you must stake 200 to make 100 profit (decimal 1.5).

**Implied probability** is `1 / decimal_odds`. Add up the implied probabilities of every outcome in a market and you get more than 1 (more than 100%). The excess is the bookmaker's **margin** (also called the overround or vig):

```python
prices = [2.10, 3.40, 3.60]          # home, draw, away
implied = [1 / p for p in prices]
print([round(p, 3) for p in implied])
print(f"Total: {sum(implied):.3f}, margin: {sum(implied) - 1:.1%}")
```

Dividing each implied probability by the total removes the margin and gives the market's **fair probabilities**: its best guess at the true chances, which sum to exactly 1.

**Expected value (EV)** is what a bet makes on average, if you could place it many times. With probability $p$ of winning at odds $o$ and stake $s$:

$$
\text{EV} = p \times s \times (o - 1) - (1 - p) \times s
$$

A bet only makes sense if its EV is positive. That requires your probability to be higher than the bookmaker's implied one, which is hard.

**Kelly staking** says what fraction of your bankroll to bet, given your edge:

$$
f = \frac{p \times (o - 1) - (1 - p)}{o - 1}
$$

If $f \le 0$ there's no edge, so you bet nothing. Full Kelly is very aggressive, so professionals use a fraction of it (half Kelly, quarter Kelly).

## Step 1: Odds conversion

:::exercise odds-convert Convert odds formats
Write two functions:

- `fractional_to_decimal(text)`: `"5/2"` returns `3.5`, `"1/4"` returns `1.25`, and `"evens"` (any capitalisation) returns `2.0`.
- `american_to_decimal(value)`: a positive number $v$ returns $1 + v/100$; a negative number returns $1 + 100/|v|$.

Round both results to 4 decimal places.

@@starter
def fractional_to_decimal(text):
    pass

def american_to_decimal(value):
    pass

@@solution
def fractional_to_decimal(text):
    if text.strip().lower() == "evens":
        return 2.0
    numerator, denominator = text.split("/")
    return round(1 + int(numerator) / int(denominator), 4)

def american_to_decimal(value):
    if value > 0:
        return round(1 + value / 100, 4)
    return round(1 + 100 / abs(value), 4)

@@tests
def test_fractional():
    """Fractional odds convert to decimal"""
    assert fractional_to_decimal("5/2") == 3.5
    assert fractional_to_decimal("1/4") == 1.25
    assert fractional_to_decimal("11/10") == 2.1

def test_evens():
    """'evens' is 2.0, whatever the case"""
    assert fractional_to_decimal("evens") == 2.0
    assert fractional_to_decimal("Evens") == 2.0

def test_american_positive():
    """+150 is 2.5"""
    assert american_to_decimal(150) == 2.5

def test_american_negative():
    """-200 is 1.5 and -110 is 1.9091"""
    assert american_to_decimal(-200) == 1.5
    assert american_to_decimal(-110) == 1.9091

@@hint
`"5/2".split("/")` gives `["5", "2"]`. Convert both to numbers before dividing.

@@hint
`abs(value)` removes the minus sign.
:::

## Step 2: Implied probability with validation

:::exercise implied-prob Implied probability
Write `implied_probability(odds)` returning `1 / odds`. If `odds` is 1.0 or less, raise a `ValueError` with a helpful message (odds of 1.0 would mean a certain outcome with no profit, so it's not a real price).

@@starter
def implied_probability(odds):
    return 1 / odds

@@solution
def implied_probability(odds):
    if odds <= 1:
        raise ValueError(f"Decimal odds must be greater than 1, got {odds}")
    return 1 / odds

@@tests
import math

def test_values():
    """Converts odds to probability"""
    assert math.isclose(implied_probability(2.0), 0.5)
    assert math.isclose(implied_probability(4.0), 0.25)

def test_invalid():
    """Odds of 1.0 or less raise ValueError"""
    for bad in [1.0, 0.5, -2]:
        try:
            implied_probability(bad)
        except ValueError:
            continue
        except Exception as e:
            raise AssertionError(f"odds={bad} raised {type(e).__name__}, expected ValueError")
        raise AssertionError(f"odds={bad} should raise ValueError")
:::

## Step 3: The bookmaker's margin

:::exercise margin-calc Margin and fair odds
Write three functions. Each takes a list of decimal prices for every outcome of a market (e.g. `[2.10, 3.40, 3.60]`):

- `margin(prices)`: total implied probability minus 1, e.g. `0.0481` for the example above. Round to 4 decimals.
- `fair_probabilities(prices)`: implied probabilities divided by their total, so they sum to 1. Round each to 4 decimals.
- `fair_odds(prices)`: `1 / fair_probability` for each outcome (use the **unrounded** fair probabilities), rounded to 2 decimals.

@@starter
def margin(prices):
    pass

def fair_probabilities(prices):
    pass

def fair_odds(prices):
    pass

@@solution
def margin(prices):
    return round(sum(1 / p for p in prices) - 1, 4)

def _fair(prices):
    implied = [1 / p for p in prices]
    total = sum(implied)
    return [x / total for x in implied]

def fair_probabilities(prices):
    return [round(p, 4) for p in _fair(prices)]

def fair_odds(prices):
    return [round(1 / p, 2) for p in _fair(prices)]

@@tests
import math

PRICES = [2.10, 3.40, 3.60]

def test_margin():
    """Margin of [2.10, 3.40, 3.60] is 0.0481"""
    assert margin(PRICES) == 0.0481, f"got {margin(PRICES)}"

def test_no_margin():
    """A fair coin at 2.0 / 2.0 has no margin"""
    assert margin([2.0, 2.0]) == 0

def test_fair_probabilities():
    """Fair probabilities remove the margin"""
    probs = fair_probabilities(PRICES)
    assert probs == [0.4543, 0.2806, 0.265], f"got {probs}"

def test_sum_to_one():
    """Fair probabilities sum to 1"""
    assert math.isclose(sum(fair_probabilities([1.5, 4.2, 6.5])), 1, abs_tol=1e-3)

def test_fair_odds():
    """Fair odds are longer than the bookmaker's"""
    assert fair_odds(PRICES) == [2.2, 3.56, 3.77], f"got {fair_odds(PRICES)}"

@@hint
Build the list of implied probabilities with a comprehension, then use `sum()`.

@@hint
You can write a helper function that both `fair_probabilities` and `fair_odds` use, so the rounding only happens at the end.
:::

## Step 4: Expected value and staking

:::exercise ev-kelly Expected value and Kelly
Write:

- `expected_value(probability, odds, stake=1.0)` using the EV formula above, rounded to 4 decimals.
- `kelly_fraction(probability, odds, fraction=1.0)`: the Kelly fraction multiplied by `fraction` (for half Kelly, `fraction=0.5`). Return `0.0` when there's no edge. Round to 4 decimals.

@@starter
def expected_value(probability, odds, stake=1.0):
    pass

def kelly_fraction(probability, odds, fraction=1.0):
    pass

@@solution
def expected_value(probability, odds, stake=1.0):
    return round(probability * stake * (odds - 1) - (1 - probability) * stake, 4)

def kelly_fraction(probability, odds, fraction=1.0):
    b = odds - 1
    full = (probability * b - (1 - probability)) / b
    return round(max(0.0, full) * fraction, 4)

@@tests
def test_ev_positive():
    """55% at evens has positive EV"""
    assert expected_value(0.55, 2.0) == 0.1
    assert expected_value(0.55, 2.0, stake=10) == 1.0

def test_ev_negative():
    """A fair price minus the margin is negative EV"""
    assert expected_value(0.5, 1.9, stake=100) == -5.0

def test_kelly():
    """Kelly fraction for a 50% chance at 3.0 is 0.25"""
    assert kelly_fraction(0.5, 3.0) == 0.25
    assert kelly_fraction(0.5, 3.0, fraction=0.5) == 0.125

def test_kelly_no_edge():
    """No edge means a stake of 0"""
    assert kelly_fraction(0.3, 3.0) == 0.0
    assert kelly_fraction(0.4, 2.0) == 0.0
:::

## Step 5: Settle a list of bets

:::exercise settle Settle bets and measure ROI
Each bet is a dictionary like `{"stake": 10, "odds": 2.5, "won": True}`. Write `settle_bets(bets)` returning a dictionary:

- `"bets"`: number of bets
- `"staked"`: total staked
- `"profit"`: total profit (winning bets make `stake * (odds - 1)`, losing bets lose their stake), rounded to 2 decimals
- `"roi"`: profit divided by total staked, rounded to 4 decimals (`0.0` if nothing was staked)

ROI (return on investment) is how betting and trading strategies are compared: profit per unit risked.

@@starter
def settle_bets(bets):
    return {"bets": 0, "staked": 0, "profit": 0, "roi": 0.0}

@@solution
def settle_bets(bets):
    staked = sum(b["stake"] for b in bets)
    profit = sum(b["stake"] * (b["odds"] - 1) if b["won"] else -b["stake"] for b in bets)
    roi = round(profit / staked, 4) if staked else 0.0
    return {"bets": len(bets), "staked": staked, "profit": round(profit, 2), "roi": roi}

@@tests
def test_example():
    """Settles a mix of wins and losses"""
    bets = [
        {"stake": 10, "odds": 2.5, "won": True},
        {"stake": 10, "odds": 3.0, "won": False},
        {"stake": 20, "odds": 1.8, "won": True},
    ]
    assert settle_bets(bets) == {"bets": 3, "staked": 40, "profit": 21.0, "roi": 0.525}, f"got {settle_bets(bets)}"

def test_all_lost():
    """All losing bets have an ROI of -1"""
    bets = [{"stake": 5, "odds": 2.0, "won": False}] * 4
    assert settle_bets(bets) == {"bets": 4, "staked": 20, "profit": -20, "roi": -1.0}

def test_empty():
    """No bets doesn't divide by zero"""
    assert settle_bets([]) == {"bets": 0, "staked": 0, "profit": 0, "roi": 0.0}
:::

## Step 6: Analyse a season of real-format data

`data/matches.csv` has the average bookmaker odds for each match in the `AvgH`, `AvgD` and `AvgA` columns, and the result in `FTR` (`H`, `D` or `A`).

:::exercise market-analysis How good are the bookmakers?
Write `analyse_market(path)` that reads the CSV and returns a dictionary:

- `"matches"`: number of matches
- `"avg_margin"`: the average bookmaker margin across all matches, rounded to 4 decimals
- `"favourite_win_rate"`: how often the **favourite** (the outcome with the lowest odds) actually happened, rounded to 4 decimals
- `"favourite_roi"`: the ROI of betting 1 unit on the favourite in every match, rounded to 4 decimals

@@starter
import csv

def analyse_market(path):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    return {}

@@solution
import csv

def analyse_market(path):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    margins = []
    fav_wins = 0
    profit = 0.0
    for row in rows:
        prices = {"H": float(row["AvgH"]), "D": float(row["AvgD"]), "A": float(row["AvgA"])}
        margins.append(sum(1 / p for p in prices.values()) - 1)
        favourite = min(prices, key=prices.get)
        if row["FTR"] == favourite:
            fav_wins += 1
            profit += prices[favourite] - 1
        else:
            profit -= 1
    n = len(rows)
    return {
        "matches": n,
        "avg_margin": round(sum(margins) / n, 4),
        "favourite_win_rate": round(fav_wins / n, 4),
        "favourite_roi": round(profit / n, 4),
    }

@@tests
import csv

def reference(path):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    margins, wins, profit = [], 0, 0.0
    for r in rows:
        p = {"H": float(r["AvgH"]), "D": float(r["AvgD"]), "A": float(r["AvgA"])}
        margins.append(sum(1 / v for v in p.values()) - 1)
        fav = min(p, key=p.get)
        if r["FTR"] == fav:
            wins += 1
            profit += p[fav] - 1
        else:
            profit -= 1
    n = len(rows)
    return {"matches": n, "avg_margin": round(sum(margins) / n, 4),
            "favourite_win_rate": round(wins / n, 4), "favourite_roi": round(profit / n, 4)}

def test_matches():
    """Counts all 1,140 matches"""
    assert analyse_market("data/matches.csv").get("matches") == 1140

def test_margin():
    """Average margin is correct"""
    got = analyse_market("data/matches.csv").get("avg_margin")
    assert got == reference("data/matches.csv")["avg_margin"], f"got {got}"

def test_favourite():
    """Favourite win rate and ROI are correct"""
    got = analyse_market("data/matches.csv")
    exp = reference("data/matches.csv")
    assert got.get("favourite_win_rate") == exp["favourite_win_rate"], f"win rate: got {got.get('favourite_win_rate')}, expected {exp['favourite_win_rate']}"
    assert got.get("favourite_roi") == exp["favourite_roi"], f"ROI: got {got.get('favourite_roi')}, expected {exp['favourite_roi']}"

@@hint
For each row, build a dict like `{"H": 2.1, "D": 3.4, "A": 3.6}` with `float()`. The favourite is `min(prices, key=prices.get)`: the key with the smallest value.

@@hint
Profit for a winning 1-unit bet is `odds - 1`; a losing one is `-1`. ROI is total profit divided by the number of bets.
:::

## What did you find?

Run your finished `analyse_market` to see the numbers:

```python
import csv

with open("data/matches.csv") as f:
    rows = list(csv.DictReader(f))

margins = [sum(1 / float(r[c]) for c in ("AvgH", "AvgD", "AvgA")) - 1 for r in rows]
print(f"Average margin: {sum(margins) / len(margins):.2%}")

profit = 0
for r in rows:
    prices = {"H": float(r["AvgH"]), "D": float(r["AvgD"]), "A": float(r["AvgA"])}
    fav = min(prices, key=prices.get)
    profit += prices[fav] - 1 if r["FTR"] == fav else -1
print(f"Backing every favourite: ROI {profit / len(rows):.2%}")
```

The favourites win often, but the prices already account for that, and the margin makes the long-run return negative. That's the core lesson behind the rest of this course: **to profit, your probabilities must be better than the market's, by more than the margin**. Phases 4 to 6 teach you to estimate probabilities and test them honestly.

:::tip Make it yours
Put these functions in a file called `betting.py` in your own GitHub repository once you've set up Python locally (Phase 2). You'll add tests with pytest and reuse it in later projects.
:::
