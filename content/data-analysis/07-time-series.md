---
title: Time series with pandas
summary: Date indexes, resampling, returns, rolling windows, lags, and how to build form features that never peek at the future.
minutes: 60
kind: lesson
---

Prices, match results, sales, sensor readings: much of the world's data is ordered in time. Time series need special care, both for the tools you use and for one rule you must never break: **a feature for time t may only use information available before time t.**

## A date index

Setting the dates as the index unlocks time-based selection and resampling:

```python
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
print(fx.head())
print(fx.index.min(), "to", fx.index.max(), f"({len(fx)} trading days)")
print(fx.loc["2024-03"].head(3))                 # all of March 2024
print(fx.loc["2023-12-20":"2024-01-05", "Close"])   # a date range (inclusive)
```

## Resampling: changing the frequency

`resample` groups by time period, like `groupby` for dates:

```python
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
monthly = fx["Close"].resample("ME").last()            # month-end closing price
print(monthly.tail(3))

weekly = fx.resample("W").agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"})
print(weekly.tail(3))                                  # daily bars to weekly bars

sales = pd.read_csv("data/sales.csv", parse_dates=["Date"])
sales["Revenue"] = sales["Units"] * sales["UnitPrice"]
print(sales.set_index("Date")["Revenue"].resample("QE").sum().round(0))    # quarterly revenue
```

Common frequency codes: `D` day, `W` week, `ME` month end, `QE` quarter end, `YE` year end, `h` hour.

## Returns

In finance you model **returns** (percentage changes), not prices. Prices wander; returns are much better behaved:

```python
import numpy as np
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
fx["Return"] = fx["Close"].pct_change()               # (today / yesterday) - 1
fx["LogReturn"] = np.log(fx["Close"]).diff()           # log returns add up over time
print(fx[["Close", "Return", "LogReturn"]].head())
print(f"Average daily return {fx['Return'].mean():.5%}, daily volatility {fx['Return'].std():.3%}")
print(f"Annualised volatility: {fx['Return'].std() * np.sqrt(252):.1%}")
```

The first row of each is `NaN`: there's no previous day to compare with.

## shift: looking back

`shift(1)` moves values down one row, so each row sees the **previous** value. It's the key to building features safely:

```python
import pandas as pd

s = pd.DataFrame({"Close": [1.10, 1.12, 1.11, 1.15, 1.14]})
s["Yesterday"] = s["Close"].shift(1)
s["Tomorrow"] = s["Close"].shift(-1)      # the future: a TARGET, never a feature
s["Change"] = s["Close"].diff()
print(s)
```

## Rolling windows

`rolling(n)` calculates statistics over a moving window of the last `n` rows:

```python
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
fx["Return"] = fx["Close"].pct_change()
fx["SMA50"] = fx["Close"].rolling(50).mean()                 # 50-day moving average
fx["Vol20"] = fx["Return"].rolling(20).std()                 # 20-day volatility
fx["High20"] = fx["High"].rolling(20).max()
fx["Expanding"] = fx["Return"].expanding().mean()            # average of everything so far
print(fx[["Close", "SMA50", "Vol20", "High20"]].dropna().head())
```

Note that a rolling window **includes the current row**. Whether that's leakage depends on *when* you'd use the feature: a 50-day average including today's close is fine for a decision made after today's close, but not for a prediction made this morning. The safe default for ML features is to `shift(1)` first.

## The golden rule: no peeking

Suppose you want to predict whether tomorrow's return is positive. Here's a feature that looks brilliant and is completely useless:

```python
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
fx["Return"] = fx["Close"].pct_change()
fx["Target"] = (fx["Return"].shift(-1) > 0).astype(int)      # did the NEXT day go up?

leaky = fx["Return"].rolling(3, center=True).mean()           # centred window: uses tomorrow!
honest = fx["Return"].shift(1).rolling(3).mean()              # only uses the past

for name, feature in [("leaky", leaky), ("honest", honest)]:
    prediction = (feature > 0).astype(int)
    accuracy = (prediction == fx["Target"]).mean()
    print(f"{name}: accuracy {accuracy:.1%}")
```

The leaky feature "predicts" far better than chance because it contains tomorrow's return. The honest one is around 50%, which is what you'd expect for a random-walk price. In real projects leakage is rarely this obvious, and it's the most common reason a model that looks great in testing loses money in reality. Phase 6 is largely about avoiding it.

## Team form: rolling features per group

For football, a team's recent form is a classic feature. The data has one row per *match*, but form belongs to a *team*, so first make one row per team per match (as in the last lesson), then compute rolling statistics **within each team**, shifted so a match never sees its own result:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
df["MatchId"] = df.index

home = pd.DataFrame({"MatchId": df["MatchId"], "Date": df["Date"], "Team": df["HomeTeam"],
                     "GF": df["FTHG"], "GA": df["FTAG"]})
away = pd.DataFrame({"MatchId": df["MatchId"], "Date": df["Date"], "Team": df["AwayTeam"],
                     "GF": df["FTAG"], "GA": df["FTHG"]})
long = pd.concat([home, away]).sort_values(["Team", "Date"]).reset_index(drop=True)
long["Points"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1

# average points over the previous 5 matches, NOT including this one
long["Form5"] = long.groupby("Team")["Points"].transform(lambda s: s.shift(1).rolling(5, min_periods=3).mean())
print(long[long["Team"] == "Ashford City"].head(8))
```

`min_periods=3` means "give a value once at least 3 previous matches exist", otherwise `NaN`. Now attach each side's form to the match rows:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
df["MatchId"] = df.index
home = pd.DataFrame({"MatchId": df["MatchId"], "Date": df["Date"], "Team": df["HomeTeam"], "GF": df["FTHG"], "GA": df["FTAG"], "Side": "Home"})
away = pd.DataFrame({"MatchId": df["MatchId"], "Date": df["Date"], "Team": df["AwayTeam"], "GF": df["FTAG"], "GA": df["FTHG"], "Side": "Away"})
long = pd.concat([home, away]).sort_values(["Team", "Date"])
long["Points"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
long["Form5"] = long.groupby("Team")["Points"].transform(lambda s: s.shift(1).rolling(5, min_periods=3).mean())

form = long.pivot(index="MatchId", columns="Side", values="Form5").add_suffix("Form5")
matches = df.join(form)
matches["FormDiff"] = matches["HomeForm5"] - matches["AwayForm5"]
print(matches[["Date", "HomeTeam", "AwayTeam", "HomeForm5", "AwayForm5", "FTR"]].dropna().head())

print(matches.groupby(pd.cut(matches["FormDiff"], [-3, -1, 0, 1, 3]), observed=True)["FTR"]
      .value_counts(normalize=True).unstack().round(2))
```

The last table shows how results depend on the form difference: teams in better form win more often. You've just engineered your first predictive feature.

## Practice

:::exercise ts-weekly Weekly revenue
Complete `weekly_revenue(sales)`. `sales` has `Date` (real dates), `Units` and `UnitPrice`. Return a Series of total revenue (`Units * UnitPrice`) per week using `resample("W")`, rounded to 2 decimals.

@@starter
import pandas as pd

def weekly_revenue(sales):
    return pd.Series(dtype=float)

@@solution
import pandas as pd

def weekly_revenue(sales):
    revenue = (sales["Units"] * sales["UnitPrice"]).groupby(sales["Date"]).sum()
    return revenue.resample("W").sum().round(2)

@@tests
import pandas as pd

def test_weekly():
    """Weekly totals match"""
    sales = pd.read_csv("data/sales.csv", parse_dates=["Date"])
    got = weekly_revenue(sales)
    exp = sales.assign(R=sales["Units"] * sales["UnitPrice"]).set_index("Date")["R"].resample("W").sum().round(2)
    assert len(got) == len(exp), f"expected {len(exp)} weeks, got {len(got)}"
    assert (got.values == exp.values).all()
    assert isinstance(got.index, pd.DatetimeIndex)
:::

:::exercise ts-features Price features
Complete `add_features(fx)` for a DataFrame with a date index and a `Close` column. Return a copy with:

- `Return`: daily percentage change of `Close`
- `Vol20`: rolling 20-day standard deviation of `Return`
- `SMA50`: rolling 50-day mean of `Close`
- `AboveSMA`: `True` when **yesterday's** close was above **yesterday's** `SMA50` (shift both by 1), else `False`
- `Target`: `1` if the **next** day's return is positive, else `0`

@@starter
import pandas as pd

def add_features(fx):
    fx = fx.copy()
    return fx

@@solution
import pandas as pd

def add_features(fx):
    fx = fx.copy()
    fx["Return"] = fx["Close"].pct_change()
    fx["Vol20"] = fx["Return"].rolling(20).std()
    fx["SMA50"] = fx["Close"].rolling(50).mean()
    fx["AboveSMA"] = fx["Close"].shift(1) > fx["SMA50"].shift(1)
    fx["Target"] = (fx["Return"].shift(-1) > 0).astype(int)
    return fx

@@tests
import pandas as pd
import numpy as np

def load():
    return pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")

def test_return_vol_sma():
    """Return, Vol20 and SMA50"""
    fx = load()
    out = add_features(fx)
    r = fx["Close"].pct_change()
    assert np.allclose(out["Return"].dropna(), r.dropna())
    assert np.allclose(out["Vol20"].dropna(), r.rolling(20).std().dropna())
    assert np.allclose(out["SMA50"].dropna(), fx["Close"].rolling(50).mean().dropna())

def test_above_sma_uses_yesterday():
    """AboveSMA only uses yesterday's values"""
    fx = load()
    out = add_features(fx)
    exp = fx["Close"].shift(1) > fx["Close"].rolling(50).mean().shift(1)
    assert (out["AboveSMA"] == exp).all()

def test_target():
    """Target is whether the next day's return is positive"""
    fx = load()
    out = add_features(fx)
    exp = (fx["Close"].pct_change().shift(-1) > 0).astype(int)
    assert (out["Target"] == exp).all()
:::

:::exercise ts-form Pre-match form
Complete `previous_points(long, n)`. `long` has one row per team per match, with columns `Team`, `Date` and `Points`. Return a Series (aligned with `long`'s index) giving, for each row, the team's **average points over its previous `n` matches**, not counting the current one. Use `NaN` until the team has played at least one previous match (`min_periods=1`).

Rows may not be sorted, so sort by team and date inside the function, but return values aligned to the original index.

@@starter
import pandas as pd

def previous_points(long, n):
    return long["Points"].rolling(n).mean()

@@solution
import pandas as pd

def previous_points(long, n):
    ordered = long.sort_values(["Team", "Date"])
    result = ordered.groupby("Team")["Points"].transform(lambda s: s.shift(1).rolling(n, min_periods=1).mean())
    return result.reindex(long.index)

@@tests
import pandas as pd
import numpy as np

long = pd.DataFrame({
    "Team":   ["A", "B", "A", "B", "A", "A", "B"],
    "Date":   pd.to_datetime(["2024-01-06", "2024-01-06", "2024-01-13", "2024-01-13", "2024-01-27", "2024-01-20", "2024-01-20"]),
    "Points": [3, 0, 1, 3, 0, 3, 1],
}, index=[10, 11, 12, 13, 14, 15, 16])

def test_values():
    """Averages previous matches only"""
    got = previous_points(long, 2)
    # A's matches by date: 3 (06), 1 (13), 3 (20), 0 (27)
    assert np.isnan(got[10])
    assert got[12] == 3.0
    assert got[15] == 2.0          # mean of 3 and 1
    assert got[14] == 2.0          # mean of 1 and 3 (window of 2)
    # B's: 0 (06), 3 (13), 1 (20)
    assert np.isnan(got[11]) and got[13] == 0.0 and got[16] == 1.5

def test_alignment():
    """Returned values align with the original index"""
    got = previous_points(long, 3)
    assert list(got.index) == list(long.index)

@@hint
Sort a copy by `["Team", "Date"]`, then `groupby("Team")["Points"].transform(lambda s: s.shift(1).rolling(n, min_periods=1).mean())`. Finally `.reindex(long.index)` puts the results back in the original order.
:::

:::quiz ts-quiz Quick check
? What does `s.shift(1)` give at each row?
- [x] The previous row's value
- [ ] The next row's value
- [ ] The value plus 1
> Shifting by 1 is how you safely use the past.

? Why is `rolling(3, center=True)` dangerous for a prediction feature?
- [x] A centred window includes future values
- [ ] It's too slow
- [ ] It ignores the current row
> Any feature that includes information from after the prediction time is leakage.

? Which resample code gives month-end values?
- [ ] "M"
- [x] "ME"
- [ ] "MS"
> "ME" is month end and "MS" month start. (Older pandas used "M".)

? Why compute rolling form within each team with `groupby("Team")`?
- [x] Otherwise the window would mix rows from different teams
- [ ] groupby makes rolling faster
> Each team's form must only use that team's previous matches.
:::
