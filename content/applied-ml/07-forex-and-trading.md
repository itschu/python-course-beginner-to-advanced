---
title: Forex and trading strategies
summary: "Backtest trading rules on daily currency prices with realistic costs, measure Sharpe ratio and drawdown, see how parameter searches fool you, run an honest machine-learning test, and find what is predictable: volatility."
minutes: 60
kind: lesson
---

Everything from the betting lessons carries over to trading: walk-forward validation, leakage, costs, and "profit or luck?". The differences are that markets like EUR/USD are among the most efficient in the world, edges are tiny, and costs come out of every trade.

The course's `data/eurusd_daily.csv` is simulated as a **random walk with changing volatility**: by construction, tomorrow's direction can't be predicted. That makes it a perfect test bench. Any strategy that looks profitable on it is showing you how backtests lie.

## Positions, returns and costs

A strategy is a **position** for each day: +1 is long (you gain when the price rises), −1 is short, 0 is flat. A position chosen at today's close earns **tomorrow's** return, which is why the position is shifted by one day. Each change of position costs money: the spread plus any commission. We'll charge 1 basis point (0.01%) per unit traded, about one pip on EUR/USD.

A classic trend-following rule is the **moving-average crossover**: long when the 50-day average is above the 200-day average, short when it's below.

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
close = fx["Close"]

def strategy_returns(close, position, cost=0.0001):
    trades = position.diff().fillna(position.iloc[0]).abs()      # starting from flat
    return (position.shift(1) * close.pct_change()).fillna(0) - cost * trades

fast, slow = close.rolling(50).mean(), close.rolling(200).mean()
position = np.sign(fast - slow).where(slow.notna(), 0)

strategy = strategy_returns(close, position)
buy_hold = strategy_returns(close, pd.Series(1.0, index=close.index))
print(f"position changes per year: {position.diff().abs().gt(0).sum() / 10:.1f}")

fig, ax = plt.subplots(figsize=(7, 3.5))
ax.plot((1 + strategy).cumprod(), label="50/200 crossover")
ax.plot((1 + buy_hold).cumprod(), label="buy and hold")
ax.axhline(1, color="grey", linestyle="--")
ax.set_ylabel("growth of 1")
ax.legend()
fig.tight_layout()
plt.show()
```

## Measuring a strategy

```python
import numpy as np
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
close = fx["Close"]

def strategy_returns(close, position, cost=0.0001):
    trades = position.diff().fillna(position.iloc[0]).abs()
    return (position.shift(1) * close.pct_change()).fillna(0) - cost * trades

def performance(r, periods=252):
    equity = (1 + r).cumprod()
    annual_return = r.mean() * periods
    annual_vol = r.std() * np.sqrt(periods)
    return {
        "annual return": round(float(annual_return), 4),
        "annual volatility": round(float(annual_vol), 4),
        "Sharpe": round(float(annual_return / annual_vol), 2),
        "max drawdown": round(float((1 - equity / equity.cummax()).max()), 3),
    }

for fast, slow in [(10, 30), (20, 50), (50, 200)]:
    f, s = close.rolling(fast).mean(), close.rolling(slow).mean()
    position = np.sign(f - s).where(s.notna(), 0)
    print(f"{fast:>2}/{slow:<3}", performance(strategy_returns(close, position)))
print("buy and hold", performance(strategy_returns(close, pd.Series(1.0, index=close.index))))
```

- The **Sharpe ratio** is annual return divided by annual volatility: return per unit of risk. (Strictly, you subtract the risk-free interest rate first; we skip that here.) Above 1 after costs is very good for a single strategy; most published strategies shrink a lot once traded.
- **Annualising**: daily mean × 252 trading days; daily volatility × $\sqrt{252}$, because variances add over time.
- How precise is a Sharpe ratio? Its standard error is roughly $1/\sqrt{\text{years}}$. With 10 years of data that's about 0.3, so a backtest Sharpe of 0.3 is indistinguishable from zero.

None of the crossovers works here, and buy and hold's small gain is just where this random walk happened to end. On real EUR/USD, simple moving-average rules have also struggled for decades once costs are included.

## The parameter-search trap

Why not search for the best moving averages? Let's try 48 combinations on 2015–2020, then test the winners on 2021–2024:

```python
import numpy as np
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
close = fx["Close"]

def strategy_returns(close, position, cost=0.0001):
    trades = position.diff().fillna(position.iloc[0]).abs()
    return (position.shift(1) * close.pct_change()).fillna(0) - cost * trades

def sharpe(r):
    return r.mean() / r.std() * np.sqrt(252)

in_sample = close.index < "2021-01-01"
rows = []
for fast in [5, 10, 15, 20, 30, 40, 50]:
    for slow in [20, 30, 50, 75, 100, 150, 200, 250]:
        if fast >= slow:
            continue
        f, s = close.rolling(fast).mean(), close.rolling(slow).mean()
        r = strategy_returns(close, np.sign(f - s).where(s.notna(), 0))
        rows.append({"fast": fast, "slow": slow, "Sharpe 2015-20": sharpe(r[in_sample]), "Sharpe 2021-24": sharpe(r[~in_sample])})

results = pd.DataFrame(rows).sort_values("Sharpe 2015-20", ascending=False)
print(results.head(5).round(2).to_string(index=False))
print(f"\n{len(results)} combinations tried")
print(f"correlation between in-sample and out-of-sample Sharpe: {results['Sharpe 2015-20'].corr(results['Sharpe 2021-24']):.2f}")
```

The best in-sample rules all lose money out of sample, and the in-sample ranking says almost nothing about the out-of-sample one. Try enough rules on random data and the best will always look good: that's **data snooping**, the trading version of choosing your model on the test set. Defences:

- Decide the rule and its parameters on one period, then test **once** on a later period you haven't looked at.
- Count how many things you tried. The best of 48 random strategies has an inflated Sharpe; methods such as the **deflated Sharpe ratio** correct for the number of trials.
- Prefer rules with an economic reason to work, and check that neighbouring parameters give similar results. A spike at one exact setting is a red flag.

## An honest machine-learning test

Can a model predict tomorrow's direction from recent returns, momentum, volatility and the day's range? Walk forward one year at a time, training only on earlier years:

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
r = np.log(fx["Close"]).diff()
features = pd.DataFrame({
    "ret_1d": r, "ret_2d": r.shift(1), "ret_5d": r.rolling(5).sum(), "ret_20d": r.rolling(20).sum(),
    "vol_20d": r.rolling(20).std(), "range": (fx["High"] - fx["Low"]) / fx["Close"],
    "ma_gap": fx["Close"] / fx["Close"].rolling(50).mean() - 1,
})
data = features.assign(up=(r.shift(-1) > 0).astype(int), next_ret=fx["Close"].pct_change().shift(-1)).dropna()
cols = list(features.columns)

models = {
    "logistic": lambda: LogisticRegression(max_iter=1000),
    "boosting": lambda: HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200, random_state=0),
}
for name, make in models.items():
    parts = []
    for year in range(2018, 2025):
        train, test = data[data.index.year < year], data[data.index.year == year]
        model = make().fit(train[cols], train["up"])
        parts.append(test.assign(p_up=model.predict_proba(test[cols])[:, 1]))
    out = pd.concat(parts)
    position = np.where(out["p_up"] > 0.5, 1, -1)
    trades = np.abs(np.diff(position, prepend=0))
    strat = position * out["next_ret"] - 0.0001 * trades
    print(f"{name:>9}: accuracy {((out['p_up'] > 0.5) == out['up']).mean():.3f}, "
          f"Sharpe after costs {strat.mean() / strat.std() * np.sqrt(252):+.2f}, position changes per year {(trades > 0).sum() / 7:.0f}")
print(f"share of up days 2018-24: {data.loc[data.index.year >= 2018, 'up'].mean():.3f}")
```

Both models score 50%, a coin flip. The boosting model also changes position about 100 times a year, so costs push it further below zero. That's the correct answer for a random walk, and the pipeline is honest enough to give it. On real data you'd treat a result like this as "no edge found", not as a reason to try 50 more feature sets until one works.

:::tip Is real EUR/USD a random walk?
Not exactly, but close at the daily level. Small effects exist (around central bank announcements, in carry from interest-rate differences, in intraday order flow), and the firms that exploit them have better data, faster execution and lower costs than an individual. Treat forex as a place to practise rigorous methods, not as an easy source of profit.
:::

## What *is* predictable: volatility

Direction is unpredictable here, but the **size** of moves isn't. Volatility clusters: calm periods follow calm periods, wild ones follow wild ones. Compare autocorrelations:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
r = np.log(fx["Close"]).diff()

print("autocorrelation of returns:         ", [round(float(r.autocorr(k)), 3) for k in (1, 2, 5)])
print("autocorrelation of absolute returns:", [round(float(r.abs().autocorr(k)), 3) for k in (1, 2, 5)])

past = r.rolling(20).std() * np.sqrt(252)
future = past.shift(-20)                     # volatility over the NEXT 20 days
both = pd.concat({"past": past, "future": future}, axis=1).dropna()
print(f"correlation of past and next 20-day volatility: {both['past'].corr(both['future']):.2f}")
print(f"correlation of past and next 20-day returns:    {r.rolling(20).sum().corr(r.rolling(20).sum().shift(-20)):.2f}")

fig, ax = plt.subplots(figsize=(7, 3))
ax.plot(past, lw=0.8)
ax.set_title("20-day volatility (annualised)")
fig.tight_layout()
plt.show()
```

Predictable volatility is genuinely useful:

- **Volatility targeting**: scale positions so the strategy's risk stays roughly constant, smaller when markets are wild and larger when they're calm. It doesn't create returns from nothing, but it makes drawdowns more predictable.
- **Risk limits and position sizing** for any strategy, including bet sizing.
- **Option pricing**, where volatility is the main input. Models such as GARCH (the `arch` package) forecast it formally.

```python
import numpy as np
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
ret = fx["Close"].pct_change().fillna(0)

predicted_vol = ret.rolling(20).std() * np.sqrt(252)        # known at today's close
weight = (0.10 / predicted_vol).clip(upper=3).fillna(0)      # aim for 10% a year, at most 3x
targeted = weight.shift(1).fillna(0) * ret                    # weight set today, earns tomorrow

yearly = pd.DataFrame({
    "buy and hold": ret.groupby(ret.index.year).std() * np.sqrt(252),
    "vol-targeted": targeted.groupby(targeted.index.year).std() * np.sqrt(252),
}).iloc[1:]
print("realised volatility by year:")
print(yearly.round(3))
print(f"spread of yearly volatility: buy and hold {yearly['buy and hold'].std():.3f}, vol-targeted {yearly['vol-targeted'].std():.3f}")
```

## Doing this for real

- **Data**: free daily FX rates from FRED (the `pandas-datareader` package) or `yfinance` (ticker `EURUSD=X`); tick and minute data from Dukascopy; broker APIs such as OANDA's for live prices.
- **Tools**: `vectorbt` for fast vectorised backtests, `backtrader` for event-driven ones. Writing your own first, as here, teaches you what they do.
- **Paper trade** any strategy on a demo account for months before risking money, and compare live results with the backtest.
- **Leverage cuts both ways.** At 30:1, a 3.3% move against you wipes out your whole deposit. Most retail forex and CFD accounts lose money; in the UK and EU, brokers must publish the percentage, and it's usually well over half.

## Practice

:::exercise fx-returns Strategy returns with costs
Write `strategy_returns(close, position, cost)`. `close` and `position` are pandas Series with the same index. The position chosen on day $t$ earns the close-to-close return of day $t+1$. Each day, subtract `cost` times the absolute change in position, treating the position before the first day as 0. Return a Series with no missing values.

@@starter
import pandas as pd

def strategy_returns(close, position, cost):
    return close.pct_change() * 0

@@solution
import pandas as pd

def strategy_returns(close, position, cost):
    trades = position.diff().fillna(position.iloc[0]).abs()
    return (position.shift(1) * close.pct_change()).fillna(0) - cost * trades

@@tests
import math
import pandas as pd

close = pd.Series([100.0, 101.0, 99.99, 101.99])

def test_no_costs():
    """Long, then short, then flat"""
    r = strategy_returns(close, pd.Series([1, -1, 0, 0]), 0.0)
    # day 1 return +1% (held long), day 2 return -1% (held short -> +1%), day 3 flat
    assert not r.isna().any()
    assert all(math.isclose(a, b, abs_tol=1e-12) for a, b in zip(r, [0.0, 0.01, 0.01, 0.0]))

def test_costs():
    """Costs charged on each change of position"""
    r = strategy_returns(close, pd.Series([1, -1, 0, 0]), 0.001)
    # trades: 1 (enter), 2 (flip), 1 (exit), 0
    assert all(math.isclose(a, b, abs_tol=1e-12) for a, b in zip(r, [-0.001, 0.008, 0.009, 0.0]))
:::

:::exercise fx-sharpe Annualised Sharpe ratio
Write `sharpe_ratio(returns, periods_per_year=252)`: the mean of the returns divided by their standard deviation (pandas' default, `ddof=1`), times the square root of `periods_per_year`. Return `0.0` if the standard deviation is zero.

@@starter
import numpy as np

def sharpe_ratio(returns, periods_per_year=252):
    return 0.0

@@solution
import numpy as np
import pandas as pd

def sharpe_ratio(returns, periods_per_year=252):
    r = pd.Series(returns, dtype=float)
    sd = r.std()
    if sd == 0:
        return 0.0
    return float(r.mean() / sd * np.sqrt(periods_per_year))

@@tests
import math
import numpy as np
import pandas as pd

def test_known_value():
    """Mean 0.001, sample sd 0.01 -> 0.1 * sqrt(252)"""
    r = pd.Series([0.011, -0.009] * 50)
    expected = r.mean() / r.std() * math.sqrt(252)
    assert math.isclose(sharpe_ratio(r), expected)

def test_monthly():
    """periods_per_year changes the scaling"""
    r = [0.02, -0.01, 0.03, 0.0]
    assert math.isclose(sharpe_ratio(r, 12), np.mean(r) / np.std(r, ddof=1) * math.sqrt(12))

def test_constant():
    """No variation, no Sharpe"""
    assert sharpe_ratio([0.0, 0.0, 0.0]) == 0.0
:::

:::exercise fx-voltarget Volatility-targeting weights
Write `vol_target_weights(returns, target=0.10, window=20, max_weight=3.0)`. Estimate annual volatility as the rolling `window`-day standard deviation of `returns` times $\sqrt{252}$, and return `target` divided by it, capped at `max_weight`, with missing values filled with 0. Each weight should only use returns up to and including that day.

@@starter
import numpy as np
import pandas as pd

def vol_target_weights(returns, target=0.10, window=20, max_weight=3.0):
    return pd.Series(1.0, index=returns.index)

@@solution
import numpy as np
import pandas as pd

def vol_target_weights(returns, target=0.10, window=20, max_weight=3.0):
    vol = returns.rolling(window).std() * np.sqrt(252)
    return (target / vol).clip(upper=max_weight).fillna(0)

@@tests
import numpy as np
import pandas as pd

rng = np.random.default_rng(0)
calm = rng.normal(0, 0.003, 300)
wild = rng.normal(0, 0.012, 300)
returns = pd.Series(np.concatenate([calm, wild]))

def test_scales_inversely():
    """Bigger weights in calm periods, smaller in wild ones"""
    w = vol_target_weights(returns)
    assert w.iloc[:19].eq(0).all() and not w.isna().any()
    assert w.iloc[100:300].mean() > 2 * w.iloc[400:600].mean()

def test_cap_and_target():
    """Capped weights, and roughly the target volatility"""
    w = vol_target_weights(returns, target=0.10, max_weight=3.0)
    assert w.max() <= 3.0
    realised = (w.shift(1) * returns).iloc[400:].std() * np.sqrt(252)
    assert 0.08 < realised < 0.12

def test_no_lookahead():
    """Changing future returns doesn't change today's weight"""
    changed = returns.copy()
    changed.iloc[300:] = 0.05
    assert np.allclose(vol_target_weights(returns).iloc[:300], vol_target_weights(changed).iloc[:300])
:::

:::quiz fx-quiz Quick check
? Why is the position shifted by one day before multiplying by returns?
- [x] A position chosen at today's close can only earn tomorrow's return
- [ ] To account for weekends
- [ ] It makes the backtest run faster
> Without the shift, the strategy uses today's return to decide today's position: lookahead.

? You test 200 parameter combinations and the best has a backtest Sharpe of 1.1. What should you do next?
- [ ] Trade it, a Sharpe above 1 is excellent
- [x] Test that one rule once on later data you haven't used, and account for the 200 trials
- [ ] Try 200 more combinations to find something even better
> The best of many trials is inflated by selection. Only fresh data tells you if it's real.

? On this random-walk data, a model reaches 50% direction accuracy. Is that a failure of the pipeline?
- [ ] Yes, a good pipeline should find patterns
- [x] No, it's the correct answer: there's nothing to predict
- [ ] Yes, the model needs more features
> An honest pipeline reports "no edge" when there is none.

? Which of these is predictable in this data?
- [ ] Tomorrow's direction
- [x] The size of upcoming moves (volatility)
- [ ] Next month's return
> Volatility clusters, so recent volatility forecasts near-future volatility.
:::
