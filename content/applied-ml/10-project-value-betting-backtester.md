---
title: "Project: a value-betting backtester"
summary: Build a complete, honest betting research pipeline, from margin-free market probabilities and value-bet selection to bankroll simulation, performance reports and a luck test, then run a pre-registered strategy on an untouched season.
minutes: 150
kind: project
---

Time to put Phase 6 together into a tool you can reuse on real data: a **backtester** that takes model probabilities and bookmaker odds, decides which bets to place and how much to stake, and reports whether the result is skill or luck.

You'll build it in four tested pieces:

1. **Market probabilities** with the margin removed.
2. **Bet selection** by expected value, with a cap on the odds.
3. **Bankroll simulation** with any staking rule.
4. **Evaluation**: ROI, drawdown, and a Monte Carlo luck test.

Then you'll run a strategy that's **fixed in advance**, sanity-check it on 2023-24, and test it once on 2024-25.

## Step 1: Margin-free market probabilities

:::exercise proj-market Market probabilities
Write `market_probs(odds, method="power")`. `odds` is an array of shape (n, 3) of decimal odds. Return an (n, 3) array of probabilities that sum to 1 in each row:

- `"proportional"`: divide each row's implied probabilities `1 / odds` by their sum.
- `"power"`: for each row, find `k` with `scipy.optimize.brentq` on the interval `[0.5, 3.0]` such that `sum(implied ** k) == 1`, and return `implied ** k`.

@@starter
import numpy as np
from scipy.optimize import brentq

def market_probs(odds, method="power"):
    return 1 / np.asarray(odds, dtype=float)

@@solution
import numpy as np
from scipy.optimize import brentq

def market_probs(odds, method="power"):
    implied = 1 / np.asarray(odds, dtype=float)
    if method == "proportional":
        return implied / implied.sum(axis=1, keepdims=True)
    rows = []
    for imp in implied:
        k = brentq(lambda k: (imp ** k).sum() - 1, 0.5, 3.0)
        rows.append(imp ** k)
    return np.array(rows)

@@tests
import numpy as np

odds = np.array([[1.30, 5.50, 11.0], [2.40, 3.30, 3.10], [2.05, 3.40, 3.90]])

def test_proportional():
    """Proportional normalisation"""
    p = market_probs(odds, "proportional")
    implied = 1 / odds
    assert p.shape == (3, 3)
    assert np.allclose(p, implied / implied.sum(axis=1, keepdims=True))

def test_power_known_values():
    """Power method matches the worked example and sums to 1"""
    p = market_probs(odds, "power")
    assert np.allclose(p.sum(axis=1), 1)
    assert np.allclose(p[0], [0.7572, 0.1641, 0.0787], atol=1e-4)

def test_power_favours_favourites():
    """The power method gives the favourite more than proportional does"""
    power, prop = market_probs(odds), market_probs(odds, "proportional")
    assert power[0, 0] > prop[0, 0] and power[0, 2] < prop[0, 2]
:::

## Step 2: Choosing the bets

For each match, take the outcome with the highest expected value. Two filters guard against your model's mistakes: a **minimum EV** (a buffer for estimation error) and a **maximum price** (long shots are where models are least reliable and where the bookmaker's margin is biggest).

:::exercise proj-bets Find value bets
Write `find_bets(df, probs, odds, min_ev=0.0, max_odds=None)`. `df` has columns `Date`, `HomeTeam`, `AwayTeam` and `FTR`; `probs` and `odds` are (n, 3) arrays in the order H, D, A.

1. Compute `ev = probs * odds - 1`. If `max_odds` is given, outcomes with odds above it can't be picked.
2. For each match, pick the outcome with the highest EV, and keep the match only if that EV is greater than `min_ev`.
3. Return a DataFrame with one row per bet and columns `Date`, `HomeTeam`, `AwayTeam`, `Pick` (`"H"`, `"D"` or `"A"`), `Odds`, `P` (your probability), `EV` and `Won` (bool), with a fresh 0, 1, 2… index.

@@starter
import numpy as np
import pandas as pd

def find_bets(df, probs, odds, min_ev=0.0, max_odds=None):
    return pd.DataFrame(columns=["Date", "HomeTeam", "AwayTeam", "Pick", "Odds", "P", "EV", "Won"])

@@solution
import numpy as np
import pandas as pd

def find_bets(df, probs, odds, min_ev=0.0, max_odds=None):
    labels = np.array(["H", "D", "A"])
    probs, odds = np.asarray(probs, dtype=float), np.asarray(odds, dtype=float)
    ev = probs * odds - 1
    if max_odds is not None:
        ev = np.where(odds <= max_odds, ev, -np.inf)
    pick = ev.argmax(axis=1)
    best = ev[np.arange(len(ev)), pick]
    rows = np.flatnonzero(best > min_ev)
    j = pick[rows]
    return pd.DataFrame({
        "Date": df["Date"].to_numpy()[rows],
        "HomeTeam": df["HomeTeam"].to_numpy()[rows],
        "AwayTeam": df["AwayTeam"].to_numpy()[rows],
        "Pick": labels[j],
        "Odds": odds[rows, j],
        "P": probs[rows, j],
        "EV": best[rows],
        "Won": df["FTR"].to_numpy()[rows] == labels[j],
    })

@@tests
import numpy as np
import pandas as pd

df = pd.DataFrame({
    "Date": pd.to_datetime(["2024-08-17", "2024-08-17", "2024-08-18", "2024-08-18"]),
    "HomeTeam": ["A", "C", "E", "G"], "AwayTeam": ["B", "D", "F", "H"],
    "FTR": ["H", "D", "H", "H"],
})
probs = np.array([[0.50, 0.30, 0.20], [0.40, 0.35, 0.25], [0.30, 0.25, 0.45], [0.10, 0.20, 0.70]])
odds = np.array([[2.20, 3.40, 4.00], [2.40, 3.10, 3.00], [2.50, 3.60, 2.30], [8.00, 4.50, 1.40]])
# EVs: row 0 -> 0.10, 0.02, -0.20 | row 1 -> -0.04, 0.085, -0.25 | row 2 -> -0.25, -0.10, 0.035 | row 3 -> -0.20, -0.10, -0.02

def test_columns_and_picks():
    """Best outcome per match, losers dropped"""
    bets = find_bets(df, probs, odds)
    assert list(bets.columns) == ["Date", "HomeTeam", "AwayTeam", "Pick", "Odds", "P", "EV", "Won"]
    assert bets["Pick"].tolist() == ["H", "D", "A"]
    assert bets["Won"].tolist() == [True, True, False]
    assert np.allclose(bets["EV"], [0.10, 0.085, 0.035])
    assert bets.index.tolist() == [0, 1, 2]

def test_min_ev():
    """Minimum EV filter"""
    assert find_bets(df, probs, odds, min_ev=0.05)["HomeTeam"].tolist() == ["A", "C"]

def test_max_odds():
    """Outcomes priced above max_odds can't be picked"""
    bets = find_bets(df, probs, odds, max_odds=3.2)
    # row 1's draw (3.10) is still allowed; row 0's home win (2.20) too
    assert bets["Pick"].tolist() == ["H", "D", "A"]
    bets = find_bets(df, probs, odds, max_odds=3.0)
    # row 1 loses its draw; its best remaining EV is negative
    assert bets["HomeTeam"].tolist() == ["A", "E"]
:::

## Step 3: Simulating the bankroll

:::exercise proj-simulate Bankroll simulation
Write `simulate(bets, stake_fn, bankroll=100.0)`. Go through `bets` in order. For each bet, compute `stake = stake_fn(P, Odds, current_bankroll)`, settle it (profit `stake * (Odds - 1)` if `Won`, otherwise `-stake`) and update the bankroll. Return a copy of `bets` with three new columns: `Stake`, `Profit` and `Bankroll` (after the bet).

@@starter
import pandas as pd

def simulate(bets, stake_fn, bankroll=100.0):
    return bets.copy()

@@solution
import pandas as pd

def simulate(bets, stake_fn, bankroll=100.0):
    stakes, profits, banks = [], [], []
    for p, odds, won in zip(bets["P"], bets["Odds"], bets["Won"]):
        stake = stake_fn(p, odds, bankroll)
        profit = stake * (odds - 1) if won else -stake
        bankroll += profit
        stakes.append(stake)
        profits.append(profit)
        banks.append(bankroll)
    return bets.assign(Stake=stakes, Profit=profits, Bankroll=banks)

@@tests
import numpy as np
import pandas as pd

bets = pd.DataFrame({"P": [0.5, 0.4, 0.6], "Odds": [2.2, 3.0, 1.9], "Won": [True, False, True]})

def test_flat():
    """Flat stakes of 10"""
    out = simulate(bets, lambda p, o, b: 10.0)
    assert np.allclose(out["Profit"], [12.0, -10.0, 9.0])
    assert np.allclose(out["Bankroll"], [112.0, 102.0, 111.0])
    assert "Stake" not in bets.columns, "return a copy; don't modify the input"

def test_bankroll_dependent():
    """Stakes that depend on the current bankroll"""
    out = simulate(bets, lambda p, o, b: 0.1 * b, bankroll=200.0)
    # 20 at 2.2 wins 24 -> 224; 22.4 lost -> 201.6; 20.16 at 1.9 wins 18.144 -> 219.744
    assert np.allclose(out["Stake"], [20.0, 22.4, 20.16])
    assert np.isclose(out["Bankroll"].iloc[-1], 219.744)
:::

## Step 4: Evaluating

:::exercise proj-evaluate Report and luck test
Write two functions:

- `summarise(results, start=100.0)` returns a dict with `"bets"` (count), `"profit"` (sum of `Profit`), `"roi"` (profit / total `Stake`), `"max_drawdown"` (largest fall from a running peak of the bankroll curve, starting from `start`, as a fraction) and `"final"` (last bankroll).
- `luck_test(odds, won, market_p, n_sims=10000, seed=0)` returns the share of simulations in which flat 1-unit bets on these odds, with each bet winning with probability `market_p`, achieve an ROI at least as high as the actual flat ROI. Use `rng = np.random.default_rng(seed)` and draw all outcomes at once with `rng.random((n_sims, len(odds))) < market_p`.

@@starter
import numpy as np

def summarise(results, start=100.0):
    return {}

def luck_test(odds, won, market_p, n_sims=10000, seed=0):
    return 1.0

@@solution
import numpy as np

def summarise(results, start=100.0):
    curve = np.concatenate([[start], results["Bankroll"].to_numpy()])
    return {
        "bets": len(results),
        "profit": float(results["Profit"].sum()),
        "roi": float(results["Profit"].sum() / results["Stake"].sum()),
        "max_drawdown": float((1 - curve / np.maximum.accumulate(curve)).max()),
        "final": float(curve[-1]),
    }

def luck_test(odds, won, market_p, n_sims=10000, seed=0):
    odds, won, market_p = np.asarray(odds, dtype=float), np.asarray(won, dtype=bool), np.asarray(market_p, dtype=float)
    actual = np.where(won, odds - 1, -1.0).mean()
    rng = np.random.default_rng(seed)
    simulated = ((rng.random((n_sims, len(odds))) < market_p) * odds - 1).mean(axis=1)
    return float(np.mean(simulated >= actual))

@@tests
import math
import numpy as np
import pandas as pd

def test_summarise():
    """ROI, drawdown and final bankroll"""
    results = pd.DataFrame({"Stake": [10, 10, 10, 10], "Profit": [12.0, -10.0, -10.0, 15.0],
                            "Bankroll": [112.0, 102.0, 92.0, 107.0]})
    s = summarise(results)
    assert s["bets"] == 4 and math.isclose(s["profit"], 7.0) and math.isclose(s["roi"], 0.175)
    assert math.isclose(s["max_drawdown"], 20 / 112) and math.isclose(s["final"], 107.0)

def test_drawdown_from_start():
    """A loss on the first bet counts from the starting bankroll"""
    results = pd.DataFrame({"Stake": [50.0], "Profit": [-50.0], "Bankroll": [50.0]})
    assert math.isclose(summarise(results)["max_drawdown"], 0.5)

def test_luck_test():
    """Matches a reference simulation"""
    rng = np.random.default_rng(3)
    odds = rng.uniform(1.6, 4.0, 300)
    market_p = 0.97 / odds
    won = rng.random(300) < market_p * 1.08
    actual = np.where(won, odds - 1, -1.0).mean()
    sims = ((np.random.default_rng(0).random((10000, 300)) < market_p) * odds - 1).mean(axis=1)
    assert math.isclose(luck_test(odds, won, market_p), np.mean(sims >= actual))

def test_obvious_cases():
    """Winning every bet is very unlikely to be luck; losing every bet is not suspicious at all"""
    odds = np.full(50, 2.0)
    p = np.full(50, 0.48)
    assert luck_test(odds, np.ones(50, bool), p) < 0.001
    assert luck_test(odds, np.zeros(50, bool), p) == 1.0
:::

## Step 5: A pre-registered test

The most important rule of backtesting: **decide the strategy before you see the test results**. Here it is, written down in advance:

- Probabilities: 0.4 × goal model + 0.6 × market, with the market's margin removed by the power method. (The weight was chosen in lesson 5 by **log loss** on 2023-24, not by profit.)
- Bet when EV is above 2% and the odds are at most 5.0.
- Staking: compare flat 1-unit stakes with quarter Kelly capped at 5% of the bankroll.
- 2023-24 is a sanity check, since it was used to choose the weight. **2024-25 is the test**, run once.

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.optimize import brentq

LABELS = np.array(["H", "D", "A"])

def market_probs(odds, method="power"):
    implied = 1 / np.asarray(odds, dtype=float)
    if method == "proportional":
        return implied / implied.sum(axis=1, keepdims=True)
    return np.array([imp ** brentq(lambda k: (imp ** k).sum() - 1, 0.5, 3.0) for imp in implied])

def find_bets(df, probs, odds, min_ev=0.0, max_odds=None):
    ev = probs * odds - 1
    if max_odds is not None:
        ev = np.where(odds <= max_odds, ev, -np.inf)
    pick = ev.argmax(axis=1)
    best = ev[np.arange(len(ev)), pick]
    rows = np.flatnonzero(best > min_ev)
    j = pick[rows]
    return pd.DataFrame({"Date": df["Date"].to_numpy()[rows], "Pick": LABELS[j], "Odds": odds[rows, j],
                         "P": probs[rows, j], "EV": best[rows], "Won": df["FTR"].to_numpy()[rows] == LABELS[j],
                         "row": rows, "col": j})

def simulate(bets, stake_fn, bankroll=100.0):
    stakes, profits, banks = [], [], []
    for p, odds, won in zip(bets["P"], bets["Odds"], bets["Won"]):
        stake = stake_fn(p, odds, bankroll)
        profit = stake * (odds - 1) if won else -stake
        bankroll += profit
        stakes.append(stake); profits.append(profit); banks.append(bankroll)
    return bets.assign(Stake=stakes, Profit=profits, Bankroll=banks)

def summarise(results, start=100.0):
    curve = np.concatenate([[start], results["Bankroll"].to_numpy()])
    return {"bets": len(results), "ROI": round(float(results["Profit"].sum() / results["Stake"].sum()), 3),
            "final bankroll": round(float(curve[-1]), 1),
            "max drawdown": round(float((1 - curve / np.maximum.accumulate(curve)).max()), 3)}

def luck_test(odds, won, market_p, n_sims=10000, seed=0):
    actual = np.where(won, odds - 1, -1.0).mean()
    rng = np.random.default_rng(seed)
    return float(np.mean(((rng.random((n_sims, len(odds))) < market_p) * odds - 1).mean(axis=1) >= actual))

strategies = {
    "flat": lambda p, o, b: 1.0,
    "quarter Kelly": lambda p, o, b: max(0.0, min(0.25 * (p * o - 1) / (o - 1), 0.05)) * b,
}

preds = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])
fig, axes = plt.subplots(1, 2, figsize=(9, 3.5), sharey=True)
for ax, season in zip(axes, ["2023-24", "2024-25"]):
    df = preds[preds["Season"] == season].reset_index(drop=True)
    odds = df[["AvgH", "AvgD", "AvgA"]].to_numpy()
    market = market_probs(odds, "power")
    probs = 0.4 * df[["pH", "pD", "pA"]].to_numpy() + 0.6 * market
    bets = find_bets(df, probs, odds, min_ev=0.02, max_odds=5.0)
    p_value = luck_test(bets["Odds"].to_numpy(), bets["Won"].to_numpy(), market[bets["row"], bets["col"]])
    label = "sanity check" if season == "2023-24" else "TEST"
    print(f"{season} ({label}): luck test p = {p_value:.3f}")
    for name, stake_fn in strategies.items():
        results = simulate(bets, stake_fn)
        print(f"   {name:>13}: {summarise(results)}")
        ax.plot(results["Date"], results["Bankroll"], label=name)
    ax.axhline(100, color="grey", ls="--")
    ax.set_title(f"{season} ({label})")
    ax.tick_params(axis="x", rotation=45)
axes[0].set_ylabel("bankroll")
axes[0].legend()
fig.tight_layout()
plt.show()
```

### Interpreting the result

Write your own conclusions before reading these:

- The strategy was **profitable in both seasons** with both staking plans: flat stakes returned about 6% on 2023-24 and 8% on the untouched 2024-25.
- **Neither season is convincing on its own.** Each luck-test p-value is around 0.1: a bettor with no edge over the market would do this well about one time in ten.
- **Consistency adds up.** Two seasons that both beat the null are stronger evidence than either alone (though 2023-24 helped choose the blend weight, so it isn't fully independent). The professional answer is "promising, needs more data", ideally on more leagues and seasons.
- **Quarter Kelly** made a lower ROI than flat stakes (it bets more where the estimated edge is biggest, which isn't where the profit was). It ended with a similar bankroll but suffered roughly twice the drawdown.
- Remember the data is synthetic and the bookmaker deliberately noisy. On a sharp real market, expect much less.

## Step 6: Taking it to real data

The pipeline is built so you can swap in real data:

1. Download several seasons for a league from [Football-Data.co.uk](https://www.football-data.co.uk/data.php). The files include average odds and Pinnacle's prices, including **closing** odds (columns such as `PSCH`, `PSCD`, `PSCA`).
2. Rebuild the goal model from lesson 4 and produce walk-forward predictions, as `scripts/generate_model_predictions.py` in this course's repository does.
3. Bet at the prices available when you'd really bet (opening or average odds), and measure **closing line value** against Pinnacle's closing prices: it'll tell you far sooner than profit whether you have an edge.
4. Pre-register each strategy in your experiment log before running it on the test seasons.

:::tip Portfolio piece
Package this as a small repository: a `backtest` module with tests (pytest, from Phase 2), a notebook or report showing one pre-registered test, and a README that explains the method and states the limitations honestly. A careful "here's what I found and why it might be luck" impresses far more than a too-good-to-be-true equity curve.
:::
