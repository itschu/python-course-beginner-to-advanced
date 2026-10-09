---
title: "Checkpoint: Data Analysis"
summary: Prove you can load, clean, reshape, analyse and chart data with NumPy, pandas and Matplotlib.
minutes: 60
kind: checkpoint
---

**Passing standard:** all three exercises pass and you score at least 8/10 on the quiz.

:::quiz phase3-final Phase 3 quiz
? `X` has shape (1000, 5). What's the shape of `X.mean(axis=0)`?
- [x] (5,)
- [ ] (1000,)
- [ ] (1000, 5)
> One mean per column.

? Which line correctly keeps rows where `odds` is below 2 **or** above 5?
- [ ] `df[df.odds < 2 or df.odds > 5]`
- [x] `df[(df.odds < 2) | (df.odds > 5)]`
- [ ] `df[df.odds < 2 | df.odds > 5]`
> Use `|` and parentheses.

? What does `df.groupby("Team")["Goals"].transform("mean")` return?
- [ ] One row per team
- [x] A Series the same length as `df`, with each row's team average
- [ ] A DataFrame of all teams' goals
> `transform` broadcasts group results back to every row.

? A `pd.to_datetime(..., dayfirst=True, format="mixed")` call parses `"2023-05-07"`. What's the risk?
- [x] It may be read as 5 July instead of 7 May
- [ ] It raises an error
- [ ] None
> Parse known formats explicitly.

? You merged matches (1,140 rows) with a ratings table and got 2,280 rows. Most likely?
- [x] The ratings table has duplicate keys
- [ ] The merge worked correctly
- [ ] pandas doubled the data for performance
> Check uniqueness of keys, or use `validate=`.

? Which feature is safe to use when predicting a match before kickoff?
- [ ] The team's average goals over the whole season
- [x] The team's average goals over its previous 5 matches
- [ ] The number of goals in this match
> Only information available before kickoff is allowed.

? What does `fx["Close"].pct_change()` compute?
- [x] Each day's return relative to the previous day
- [ ] The cumulative return since the start
- [ ] The percentage of days with a rise
> The first value is NaN.

? Which chart compares the average home goals of 20 teams?
- [x] A sorted (horizontal) bar chart
- [ ] A line chart
- [ ] A pie chart
> Bars compare categories; sorting makes them easy to read.

? What does it mean for a forecaster to be well calibrated?
- [x] Events they call 60% happen about 60% of the time
- [ ] They're always right
- [ ] Their forecasts are always close to 50%
> Calibration is essential for betting models: probabilities must mean what they say.

? What is `pd.Series([1, None, 3]).mean()`?
- [x] 2.0
- [ ] NaN
- [ ] 1.33
> pandas skips missing values by default.
:::

:::exercise cp3-clean Clean a sales export
A CSV export of orders has messy columns. Complete `clean_orders(raw)` to return a DataFrame with:

- `order_id` as int
- `customer` stripped and title-cased
- `amount` as float (values look like `"£1,234.50"`; anything unparseable becomes NaN)
- `date` as datetime (all values are day-first like `"03/04/2024"`; unparseable values become NaT)
- rows with a missing `amount` **dropped**, and exact duplicate rows removed
- sorted by `date`, with a fresh 0, 1, 2... index

@@starter
import pandas as pd

def clean_orders(raw):
    return raw

@@solution
import pandas as pd

def clean_orders(raw):
    df = raw.drop_duplicates().copy()
    df["order_id"] = df["order_id"].astype(int)
    df["customer"] = df["customer"].str.strip().str.title()
    df["amount"] = pd.to_numeric(df["amount"].str.replace("£", "", regex=False).str.replace(",", "", regex=False), errors="coerce")
    df["date"] = pd.to_datetime(df["date"], format="%d/%m/%Y", errors="coerce")
    return df.dropna(subset=["amount"]).sort_values("date").reset_index(drop=True)

@@tests
import pandas as pd

RAW = pd.DataFrame({
    "order_id": ["3", "1", "2", "2", "4"],
    "customer": [" ada lovelace", "ALAN TURING ", "grace hopper", "grace hopper", "ken"],
    "amount": ["£1,234.50", "£20", "n/a", "n/a", "£5.25"],
    "date": ["03/04/2024", "01/02/2024", "15/03/2024", "15/03/2024", "bad"],
})

def test_result():
    """Cleans, drops and sorts"""
    out = clean_orders(RAW)
    assert out["order_id"].tolist() == [1, 3, 4], out["order_id"].tolist()
    assert out["customer"].tolist() == ["Alan Turing", "Ada Lovelace", "Ken"]
    assert out["amount"].tolist() == [20.0, 1234.5, 5.25]
    assert out["date"].iloc[0] == pd.Timestamp("2024-02-01") and out["date"].iloc[1] == pd.Timestamp("2024-04-03")
    assert pd.isna(out["date"].iloc[2])
    assert list(out.index) == [0, 1, 2]
:::

:::exercise cp3-team-stats Team statistics
Complete `team_stats(df)` for the matches data. Return a DataFrame indexed by team with:

- `played`, `points` (3 for a win, 1 for a draw), `goals_for`, `goals_against` over **all** seasons, home and away
- `ppg`: points per game, rounded to 2 decimals

Sort by `ppg` descending.

@@starter
import pandas as pd

def team_stats(df):
    return pd.DataFrame()

@@solution
import pandas as pd

def team_stats(df):
    long = pd.concat([
        pd.DataFrame({"Team": df["HomeTeam"], "GF": df["FTHG"], "GA": df["FTAG"]}),
        pd.DataFrame({"Team": df["AwayTeam"], "GF": df["FTAG"], "GA": df["FTHG"]}),
    ])
    long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
    out = long.groupby("Team").agg(played=("Pts", "size"), points=("Pts", "sum"),
                                   goals_for=("GF", "sum"), goals_against=("GA", "sum"))
    out["ppg"] = (out["points"] / out["played"]).round(2)
    return out.sort_values("ppg", ascending=False)

@@tests
import pandas as pd

def test_totals():
    """Totals are consistent"""
    df = pd.read_csv("data/matches.csv")
    out = team_stats(df)
    assert len(out) == 20 and (out["played"] == 114).all()
    assert out["goals_for"].sum() == out["goals_against"].sum() == (df["FTHG"] + df["FTAG"]).sum()

def test_points():
    """Points match a manual count for one team"""
    df = pd.read_csv("data/matches.csv")
    out = team_stats(df)
    t = "Bramley Rovers"
    h, a = df[df["HomeTeam"] == t], df[df["AwayTeam"] == t]
    pts = 3 * ((h["FTR"] == "H").sum() + (a["FTR"] == "A").sum()) + (h["FTR"] == "D").sum() + (a["FTR"] == "D").sum()
    assert out.loc[t, "points"] == pts
    assert out["ppg"].is_monotonic_decreasing
:::

:::exercise cp3-volatility Volatility regimes
Complete `volatility_regimes(fx, window)` for a DataFrame with a date index and a `Close` column. Return a DataFrame with:

- `Return`: daily percentage change
- `Vol`: rolling standard deviation of `Return` over `window` days, **shifted by one day** (so each day only uses past data)
- `Regime`: `"high"` where `Vol` is above its overall median, `"low"` where it's at or below, and missing (NaN) where `Vol` is NaN

@@starter
import pandas as pd

def volatility_regimes(fx, window):
    out = fx.copy()
    return out

@@solution
import numpy as np
import pandas as pd

def volatility_regimes(fx, window):
    out = fx.copy()
    out["Return"] = out["Close"].pct_change()
    out["Vol"] = out["Return"].rolling(window).std().shift(1)
    median = out["Vol"].median()
    out["Regime"] = np.where(out["Vol"] > median, "high", "low")
    out.loc[out["Vol"].isna(), "Regime"] = np.nan
    return out

@@tests
import numpy as np
import pandas as pd

def load():
    return pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")

def test_vol_shifted():
    """Vol is the shifted rolling std"""
    fx = load()
    out = volatility_regimes(fx, 20)
    exp = fx["Close"].pct_change().rolling(20).std().shift(1)
    assert np.allclose(out["Vol"].dropna(), exp.dropna())
    assert out["Vol"].isna().sum() == exp.isna().sum()

def test_regimes():
    """Regimes split at the median"""
    out = volatility_regimes(load(), 20)
    valid = out.dropna(subset=["Vol"])
    assert set(valid["Regime"]) == {"high", "low"}
    assert (valid.loc[valid["Regime"] == "high", "Vol"] > valid["Vol"].median()).all()
    assert out.loc[out["Vol"].isna(), "Regime"].isna().all()
:::

## Phase 3 complete

You can now turn raw data into answers. That alone is a valuable, employable skill. Phase 4 adds the mathematical foundations of machine learning, and Phase 5 puts it all together to train your first models.
