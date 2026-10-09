---
title: Value betting and backtesting
summary: Turn probabilities into bets with expected value, choose stakes with flat and Kelly staking, build a backtest engine, measure ROI and drawdown, and test whether a profit could just be luck.
minutes: 60
kind: lesson
---

A good model isn't a betting strategy yet. You still need rules for **which** bets to place, **how much** to stake, and an honest way to tell whether past profits came from skill or luck. This lesson builds all three.

## Expected value: which bets to place

From Phase 1, a bet's **expected value** per unit staked is:

$$
\text{EV} = p \times o - 1
$$

where $p$ is your probability and $o$ the decimal odds. You only want bets with $\text{EV} > 0$. For each match, compute the EV of all three outcomes and keep the best one if it's positive. We'll use the blend of goal model and market from the last lesson, with the model weight of 0.4 chosen on 2023-24:

```python
import numpy as np
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])
odds = preds[["AvgH", "AvgD", "AvgA"]].to_numpy()
implied = 1 / odds
market = implied / implied.sum(axis=1, keepdims=True)
model = preds[["pH", "pD", "pA"]].to_numpy()
probs = 0.4 * model + 0.6 * market           # the blend from the last lesson

ev = probs * odds - 1                        # expected profit per unit staked
preds["Pick"] = np.array(["H", "D", "A"])[ev.argmax(axis=1)]
preds["EV"] = ev.max(axis=1)

bets = preds[(preds["Season"] == "2024-25") & (preds["EV"] > 0)]
print(f"{len(bets)} value bets out of 380 matches")
print(bets["Pick"].value_counts().to_dict())
print(bets[["Date", "HomeTeam", "AwayTeam", "Pick", "EV", "FTR"]].head().to_string())
```

Blending with the market makes the selection cautious. The market's fair probabilities always have negative EV (the margin), so the model has to disagree with the market strongly before the blend sees value.

## A backtest engine

A **backtest** replays history in date order: at each match, decide using only what you knew then, settle the bet, update the bankroll. Keeping the staking rule as a separate function lets you swap strategies without touching the engine:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])
preds = preds[preds["Season"] == "2024-25"].reset_index(drop=True)
odds = preds[["AvgH", "AvgD", "AvgA"]].to_numpy()
implied = 1 / odds
probs = 0.4 * preds[["pH", "pD", "pA"]].to_numpy() + 0.6 * implied / implied.sum(axis=1, keepdims=True)

def backtest(df, probs, odds, stake_fn, threshold=0.0, bankroll=100.0):
    """Bet on the best-EV outcome of each match, in date order. Returns one row per bet."""
    labels = np.array(["H", "D", "A"])
    rows = []
    for i in range(len(df)):
        ev = probs[i] * odds[i] - 1
        j = int(ev.argmax())
        if ev[j] <= threshold:
            continue
        stake = stake_fn(probs[i, j], odds[i, j], bankroll)
        if stake <= 0:
            continue
        won = df["FTR"].iat[i] == labels[j]
        profit = stake * (odds[i, j] - 1) if won else -stake
        bankroll += profit
        rows.append({"Date": df["Date"].iat[i], "Pick": labels[j], "Odds": odds[i, j],
                     "Stake": stake, "Won": won, "Profit": profit, "Bankroll": bankroll})
    return pd.DataFrame(rows)

def summary(bets, start=100.0):
    curve = np.concatenate([[start], bets["Bankroll"].to_numpy()])
    drawdown = 1 - curve / np.maximum.accumulate(curve)
    return {"bets": len(bets), "hit rate": round(float(bets["Won"].mean()), 3),
            "staked": round(float(bets["Stake"].sum()), 1), "profit": round(float(bets["Profit"].sum()), 1),
            "ROI": round(float(bets["Profit"].sum() / bets["Stake"].sum()), 3),
            "max drawdown": round(float(drawdown.max()), 3)}

flat = backtest(preds, probs, odds, lambda p, o, bank: 1.0)
print(summary(flat))

fig, ax = plt.subplots(figsize=(7, 3.5))
ax.plot(flat["Date"], flat["Bankroll"])
ax.axhline(100, color="grey", linestyle="--")
ax.set_title("Flat 1-unit stakes, 2024-25")
ax.set_ylabel("bankroll")
fig.autofmt_xdate()
fig.tight_layout()
plt.show()
```

The numbers that matter:

- **ROI (yield)**: profit divided by total staked. Here about 11% from 241 bets. Professional bettors are delighted with 2 to 5% over thousands of bets.
- **Hit rate**: the share of bets won. On its own it means nothing: backing 1.20 favourites wins often and can still lose money.
- **Maximum drawdown**: the biggest fall from a peak, as a share of that peak. It tells you how painful the strategy is to follow, and how big a bankroll you need.

## How much to stake: Kelly and its fractions

Flat staking bets the same amount every time. The **Kelly criterion** (Phase 1) stakes the fraction of your bankroll that maximises long-run growth:

$$
f^* = \frac{p \times o - 1}{o - 1}
$$

Kelly assumes you know $p$ exactly. When you do, full Kelly grows fastest, but with brutal swings, and betting more than Kelly is ruinous. This simulation bets 500 times with a real 10% edge ($p = 0.55$ at odds 2.0, so $f^* = 0.10$):

```python
import numpy as np

rng = np.random.default_rng(1)
p, o, n_bets, n_runs = 0.55, 2.0, 500, 2000
kelly = (p * o - 1) / (o - 1)

def simulate(fraction, true_p):
    wins = rng.random((n_runs, n_bets)) < true_p
    growth = np.where(wins, 1 + fraction * (o - 1), 1 - fraction)
    curve = 100 * np.cumprod(np.hstack([np.ones((n_runs, 1)), growth]), axis=1)
    drawdown = (1 - curve / np.maximum.accumulate(curve, axis=1)).max(axis=1)
    return curve[:, -1], drawdown

print("        stake  median final  P(end below 100)  median worst drawdown")
for mult in [0.25, 0.5, 1, 2]:
    final, dd = simulate(mult * kelly, p)
    print(f"{mult:>4} Kelly {np.median(final):>13.0f} {np.mean(final < 100):>17.2f} {np.median(dd):>22.2f}")

print("\nIf the true probability is 0.52, not 0.55:")
for mult in [0.25, 0.5, 1]:
    final, _ = simulate(mult * kelly, 0.52)
    print(f"{mult:>4} Kelly: median final {np.median(final):.0f}, P(end below 100) {np.mean(final < 100):.2f}")
```

Read the table carefully:

- Full Kelly has the highest median, but the typical worst drawdown is over 80%. Very few people can keep betting through that.
- Double Kelly makes **less** than quarter Kelly and loses money in about half the runs. Overbetting destroys the edge.
- If you overestimate your probability by just 3 points, full Kelly loses money in most runs, while quarter Kelly still grows.

Your probabilities are always estimates, which is why professionals use **fractional Kelly** (a quarter or a half) and **cap** each stake (say at 5% of the bankroll).

Now the real backtest with Kelly staking. This cell repeats the engine (recording each bet's EV this time) so it runs on its own:

```python
import numpy as np
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])
preds = preds[preds["Season"] == "2024-25"].reset_index(drop=True)
odds = preds[["AvgH", "AvgD", "AvgA"]].to_numpy()
implied = 1 / odds
probs = 0.4 * preds[["pH", "pD", "pA"]].to_numpy() + 0.6 * implied / implied.sum(axis=1, keepdims=True)

def backtest(df, probs, odds, stake_fn, threshold=0.0, bankroll=100.0):
    labels = np.array(["H", "D", "A"])
    rows = []
    for i in range(len(df)):
        ev = probs[i] * odds[i] - 1
        j = int(ev.argmax())
        if ev[j] <= threshold:
            continue
        stake = stake_fn(probs[i, j], odds[i, j], bankroll)
        if stake <= 0:
            continue
        won = df["FTR"].iat[i] == labels[j]
        profit = stake * (odds[i, j] - 1) if won else -stake
        bankroll += profit
        rows.append({"EV": ev[j], "Stake": stake, "Won": won, "Profit": profit, "Bankroll": bankroll})
    return pd.DataFrame(rows)

def kelly_staker(fraction, cap=0.05):
    def stake(p, o, bankroll):
        f = (p * o - 1) / (o - 1)
        return max(0.0, min(fraction * f, cap)) * bankroll
    return stake

for name, staker in [("flat 1 unit", lambda p, o, b: 1.0), ("full Kelly", kelly_staker(1.0, cap=1.0)),
                     ("half Kelly", kelly_staker(0.5, cap=1.0)), ("quarter Kelly", kelly_staker(0.25))]:
    bets = backtest(preds, probs, odds, staker)
    curve = np.concatenate([[100], bets["Bankroll"]])
    dd = (1 - curve / np.maximum.accumulate(curve)).max()
    print(f"{name:>14}: final bankroll {curve[-1]:6.1f}, ROI {bets['Profit'].sum() / bets['Stake'].sum():+.3f}, max drawdown {dd:.2f}")

flat = backtest(preds, probs, odds, lambda p, o, b: 1.0)
flat["edge"] = pd.cut(flat["EV"], [0, 0.03, 0.06, 0.1, 1])
print(flat.groupby("edge", observed=True)["Profit"].agg(bets="size", ROI="mean").round(3))
```

The same bets that made 11% with flat stakes **lost money** with full Kelly. The table shows why: in 2024-25 the 57 bets with the biggest estimated edge (over 10%) lost about 21% of their stakes, while the smaller-edge bets made money. In 2023-24 that same group was profitable, so much of this is luck. But it isn't only luck: the bets where your model disagrees most with the market are disproportionately the ones where **your model** is wrong. Estimated edges are systematically too big, a version of the winner's curse. Kelly puts its largest stakes exactly there.

## Profit or luck?

241 bets sounds like a lot. It isn't. At average odds near 2.8, one bet's profit has a standard deviation of about 1.4 units, so the standard error of the ROI is about $1.4 / \sqrt{241} \approx 9\%$. An 11% ROI is barely more than one standard error from zero.

Two ways to quantify the doubt:

```python
import numpy as np
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])
preds = preds[preds["Season"] == "2024-25"].reset_index(drop=True)
odds = preds[["AvgH", "AvgD", "AvgA"]].to_numpy()
implied = 1 / odds
market = implied / implied.sum(axis=1, keepdims=True)
probs = 0.4 * preds[["pH", "pD", "pA"]].to_numpy() + 0.6 * market

ev = probs * odds - 1
rows = np.where(ev.max(axis=1) > 0)[0]
picks = ev.argmax(axis=1)[rows]
bet_odds = odds[rows, picks]
won = preds["FTR"].to_numpy()[rows] == np.array(["H", "D", "A"])[picks]
profit = np.where(won, bet_odds - 1, -1.0)
print(f"{len(profit)} flat bets, ROI {profit.mean():.3f}")

rng = np.random.default_rng(0)

# 1. Bootstrap: resample the bets to get a confidence interval for the ROI
boot = np.array([rng.choice(profit, len(profit)).mean() for _ in range(10_000)])
low, high = np.percentile(boot, [2.5, 97.5])
print(f"bootstrap 95% interval for ROI: {low:.3f} to {high:.3f}")

# 2. Monte Carlo under the null: if the market's fair probabilities were true,
#    how often would these exact bets do this well by luck alone?
p_market = market[rows, picks]
simulated = (rng.random((10_000, len(rows))) < p_market) * bet_odds - 1
null_roi = simulated.mean(axis=1)
print(f"null ROI: mean {null_roi.mean():.3f}; share of simulations at least as good: {np.mean(null_roi >= profit.mean()):.3f}")
```

The two tests answer different questions:

- The **bootstrap** interval runs from about −6% to +29%. It includes zero, so you can't rule out that the true ROI is zero or negative.
- The **Monte Carlo test** asks whether a bettor with no edge over the market (expected ROI about −5%, the margin) could get this lucky. Only about 3.5% of simulations do as well, so the market being exactly right is fairly unlikely. That's evidence of *some* edge, not proof of an 11% one.

The fix for both is the same: more bets. To pin an ROI down to ±2%, you need roughly $(2 \times 1.4 / 0.02)^2 \approx 20{,}000$ bets.

:::note Because this data is synthetic, we know the answer
The course's bookmaker prices come from the true team strengths plus random noise, so a real edge exists here. On real data you never get to check, which is why the statistics above, out-of-sample testing and closing line value are so important.
:::

## Closing line value

Odds move as money and news arrive. The final price before kick-off, the **closing line**, is the sharpest forecast available, because it includes everything the market learned. **Closing line value (CLV)** compares the odds you took with the closing odds:

$$
\text{CLV} = \frac{o_{\text{taken}}}{o_{\text{closing, fair}}} - 1
$$

If you consistently get better odds than the margin-free closing price, you're very likely beating the market, even over a few hundred bets, because CLV is far less noisy than profit. Professional bettors track CLV more closely than profit. Our dataset has one price per match, but Football-Data.co.uk files include both opening and closing odds, so you can measure it in your own projects.

## Real-world frictions

A backtest is the best case. Live betting adds:

- **Price availability**: average odds aren't always available. Use the price you could actually have taken, at the time you would have bet.
- **Limits and restrictions**: bookmakers limit or close accounts that win. Betting exchanges such as Betfair don't, but charge commission on winnings, which comes straight off your ROI.
- **Timing**: predictions made the night before use older prices and less team news than the closing line.
- **Multiple testing**: if you try 50 thresholds, models and staking plans, the best backtest is inflated by selection. Decide the rules on one season and test them once on another.

## Practice

:::exercise vb-pick Pick value bets
Write `pick_bets(probs, odds, threshold=0.0)`. Both arguments are arrays of shape (n, 3). For each row, compute `probs * odds - 1` and return the index (0, 1 or 2) of the outcome with the highest EV if that EV is greater than `threshold`, otherwise `-1`. Return a NumPy integer array of length n.

@@starter
import numpy as np

def pick_bets(probs, odds, threshold=0.0):
    return np.full(len(probs), -1)

@@solution
import numpy as np

def pick_bets(probs, odds, threshold=0.0):
    ev = np.asarray(probs, dtype=float) * np.asarray(odds, dtype=float) - 1
    best = ev.argmax(axis=1)
    return np.where(ev.max(axis=1) > threshold, best, -1)

@@tests
import numpy as np

def test_basic():
    """Best positive-EV outcome, or -1"""
    probs = np.array([[0.5, 0.3, 0.2], [0.6, 0.25, 0.15], [0.2, 0.3, 0.5]])
    odds = np.array([[2.2, 3.4, 4.0], [1.5, 4.0, 6.0], [4.0, 3.0, 2.0]])
    # EVs: row 0 -> 0.10, 0.02, -0.20; row 1 -> -0.10, 0.0, -0.10; row 2 -> -0.20, -0.10, 0.0
    assert pick_bets(probs, odds).tolist() == [0, -1, -1]

def test_threshold():
    """Threshold filters out small edges"""
    probs = np.array([[0.5, 0.3, 0.2], [0.2, 0.3, 0.5]])
    odds = np.array([[2.1, 3.4, 4.0], [4.0, 3.0, 2.3]])
    # Best EVs: row 0 -> 0.05 (outcome 0); row 1 -> 0.15 (outcome 2)
    assert pick_bets(probs, odds, 0.0).tolist() == [0, 2]
    assert pick_bets(probs, odds, 0.1).tolist() == [-1, 2]
:::

:::exercise vb-kelly Fractional Kelly with a cap
Write `kelly_stake(p, odds, bankroll, fraction=0.25, cap=0.05)` that returns the stake in money: `fraction` times the full Kelly fraction `(p * odds - 1) / (odds - 1)`, limited to at most `cap` of the bankroll, times `bankroll`. If there's no edge, return `0.0`.

@@starter
def kelly_stake(p, odds, bankroll, fraction=0.25, cap=0.05):
    return 0.0

@@solution
def kelly_stake(p, odds, bankroll, fraction=0.25, cap=0.05):
    full = (p * odds - 1) / (odds - 1)
    if full <= 0:
        return 0.0
    return min(fraction * full, cap) * bankroll

@@tests
import math

def test_quarter_kelly():
    """Quarter Kelly below the cap"""
    # full Kelly = (0.55 * 2 - 1) / 1 = 0.10, quarter = 0.025
    assert math.isclose(kelly_stake(0.55, 2.0, 1000), 25.0)

def test_cap():
    """Large edges are capped"""
    # full Kelly = (0.6 * 2.5 - 1) / 1.5 = 0.333, quarter = 0.083, capped at 0.05
    assert math.isclose(kelly_stake(0.6, 2.5, 1000), 50.0)
    assert math.isclose(kelly_stake(0.6, 2.5, 1000, fraction=1.0, cap=1.0), 1000 / 3)

def test_no_edge():
    """No edge, no bet"""
    assert kelly_stake(0.5, 2.0, 1000) == 0.0
    assert kelly_stake(0.3, 2.5, 1000) == 0.0
:::

:::exercise vb-drawdown Maximum drawdown
Write `max_drawdown(bankroll)` that takes a sequence of bankroll values over time and returns the largest fall from a running peak, as a fraction of that peak (so `0.25` means a 25% fall). Return `0.0` if the bankroll never falls.

@@starter
import numpy as np

def max_drawdown(bankroll):
    return 0.0

@@solution
import numpy as np

def max_drawdown(bankroll):
    curve = np.asarray(bankroll, dtype=float)
    peaks = np.maximum.accumulate(curve)
    return float((1 - curve / peaks).max())

@@tests
import math

def test_example():
    """Peak 120, trough 90: a 25% drawdown"""
    assert math.isclose(max_drawdown([100, 110, 120, 90, 115, 130, 117]), 0.25)

def test_later_drawdown_is_larger():
    """Measures from the running peak, not the start"""
    assert math.isclose(max_drawdown([100, 95, 200, 100, 150]), 0.5)

def test_no_drawdown():
    """Only goes up"""
    assert max_drawdown([100, 101, 105, 105, 110]) == 0.0
:::

:::quiz vb-quiz Quick check
? A strategy won 58% of its bets. What can you conclude?
- [ ] It's profitable
- [ ] It has an edge over the market
- [x] Nothing yet: profitability depends on the odds of the bets
> Backing short favourites wins often and can still lose money.

? Why do professionals bet a fraction of Kelly?
- [x] Their probabilities are estimates, and overbetting is far more damaging than underbetting
- [ ] Full Kelly has lower long-run growth when probabilities are exactly right
- [ ] Bookmakers don't accept Kelly stakes
> With exact probabilities, full Kelly grows fastest. With estimated ones, it overbets.

? A backtest made 9% ROI over 150 bets at average odds of 3.0. Is that strong evidence of an edge?
- [ ] Yes, 9% is a large ROI
- [x] No, the standard error of the ROI is over 10%, so this is well within luck
- [ ] Yes, because 150 bets is a large sample
> One bet at odds of 3.0 has a standard deviation of about 1.4 units, so the standard error is about 1.4 / √150 ≈ 11%.

? Why is closing line value a useful signal?
- [x] It is much less noisy than profit, so it reveals skill over fewer bets
- [ ] It guarantees profit
- [ ] Bookmakers publish it
> The closing price is the market's sharpest estimate; beating it consistently suggests real skill.
:::
