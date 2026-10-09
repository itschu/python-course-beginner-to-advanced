---
title: Ratings and time-aware features
summary: Tune Elo properly, add margin of victory, weight recent results with exponential smoothing, add rest days, and measure whether a feature really helps.
minutes: 55
kind: lesson
---

In sports and markets, the most useful features summarise **recent strength** without leaking the future. This lesson upgrades the Elo rating from Phase 5, adds exponentially weighted form and rest days, and shows how to decide, with walk-forward validation, whether a feature earns its place.

## Elo, upgraded

A good football Elo has three knobs:

- `k`: how fast ratings react to results,
- `home_adv`: rating points added to the home side,
- **margin of victory**: a 4–0 should move ratings more than a 1–0. A common multiplier is $\ln(\lvert\text{goal difference}\rvert + 1)$, scaled so a one-goal win counts normally.

```python
import math
import pandas as pd

def elo_ratings(df, k=20, home_adv=60, carry=0.8, use_margin=True):
    """Return pre-match HomeElo and AwayElo for matches sorted by date."""
    ratings, season = {}, None
    home_elo, away_elo = [], []
    for row in df.itertuples():
        if row.Season != season:
            if season is not None:
                ratings = {t: 1500 + carry * (r - 1500) for t, r in ratings.items()}
            season = row.Season
        rh, ra = ratings.get(row.HomeTeam, 1500.0), ratings.get(row.AwayTeam, 1500.0)
        home_elo.append(rh)
        away_elo.append(ra)
        expected = 1 / (1 + 10 ** ((ra - rh - home_adv) / 400))
        actual = 1.0 if row.FTHG > row.FTAG else 0.0 if row.FTHG < row.FTAG else 0.5
        multiplier = math.log(abs(row.FTHG - row.FTAG) + 1) / math.log(2) if use_margin and row.FTHG != row.FTAG else 1.0
        change = k * multiplier * (actual - expected)
        ratings[row.HomeTeam], ratings[row.AwayTeam] = rh + change, ra - change
    return pd.DataFrame({"HomeElo": home_elo, "AwayElo": away_elo}, index=df.index)

df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
elo = elo_ratings(df)
print(elo.tail())
final = {}
for row, (h, a) in zip(df.itertuples(), elo.itertuples(index=False)):
    final[row.HomeTeam], final[row.AwayTeam] = h, a
print(pd.Series(final).sort_values(ascending=False).round(0).head())
```

### Tuning Elo honestly

How do you choose `k` and `home_adv`? Score the probabilities they imply on a **validation season** and pick the best, keeping the test season untouched. A quick way to turn an Elo difference into a home-win probability is a one-feature logistic regression fitted on earlier data:

```python
import itertools
import math
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

def elo_diff(df, k, home_adv):
    ratings, season, diffs = {}, None, []
    for row in df.itertuples():
        if row.Season != season:
            if season is not None:
                ratings = {t: 1500 + 0.8 * (r - 1500) for t, r in ratings.items()}
            season = row.Season
        rh, ra = ratings.get(row.HomeTeam, 1500.0), ratings.get(row.AwayTeam, 1500.0)
        diffs.append(rh - ra)
        exp_h = 1 / (1 + 10 ** ((ra - rh - home_adv) / 400))
        act = 1.0 if row.FTHG > row.FTAG else 0.0 if row.FTHG < row.FTAG else 0.5
        mult = math.log(abs(row.FTHG - row.FTAG) + 1) / math.log(2) if row.FTHG != row.FTAG else 1.0
        ratings[row.HomeTeam] = rh + k * mult * (act - exp_h)
        ratings[row.AwayTeam] = ra - k * mult * (act - exp_h)
    return pd.Series(diffs, index=df.index)

df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
train = df["Season"] == "2022-23"
valid = df["Season"] == "2023-24"
results = []
for k, home_adv in itertools.product([10, 20, 30, 45], [0, 50, 100]):
    d = elo_diff(df, k, home_adv)
    model = LogisticRegression(max_iter=1000).fit(d[train].to_frame(), df.loc[train, "FTR"])
    loss = log_loss(df.loc[valid, "FTR"], model.predict_proba(d[valid].to_frame()), labels=model.classes_)
    results.append((round(loss, 4), k, home_adv))
for loss, k, ha in sorted(results)[:5]:
    print(f"k={k:>2}, home_adv={ha:>3}: validation log loss {loss}")
```

(The logistic regression learns its own home advantage through its intercept, which is why `home_adv` matters less here than `k`.)

## Exponentially weighted form

A plain rolling average treats a match six games ago the same as last week's, then forgets it completely. An **exponentially weighted moving average** (EWMA) gives recent matches more weight and fades older ones smoothly. In pandas, `ewm(halflife=n)` means a match's weight halves every `n` matches:

```python
import pandas as pd

points = pd.Series([3, 3, 0, 1, 3, 0, 0, 0, 3, 3], name="points")
compare = pd.DataFrame({
    "points": points,
    "rolling_5": points.shift(1).rolling(5, min_periods=1).mean(),
    "ewm_halflife_3": points.shift(1).ewm(halflife=3).mean(),
})
print(compare.round(2))
```

Note the `shift(1)` before smoothing: each value only uses previous matches. The same pattern works per team with `groupby("Team")[col].transform(lambda s: s.shift(1).ewm(halflife=5).mean())`.

## Rest days

Fatigue matters. Days since a team's previous match is easy to compute from the long, one-row-per-team format:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
long = pd.concat([
    pd.DataFrame({"MatchId": df.index, "Team": df["HomeTeam"], "Date": df["Date"], "Side": "Home"}),
    pd.DataFrame({"MatchId": df.index, "Team": df["AwayTeam"], "Date": df["Date"], "Side": "Away"}),
]).sort_values(["Team", "Date"])
long["RestDays"] = long.groupby("Team")["Date"].diff().dt.days
rest = long.pivot(index="MatchId", columns="Side", values="RestDays").add_suffix("Rest")
df = df.join(rest)
print(df[["Date", "HomeTeam", "AwayTeam", "HomeRest", "AwayRest"]].dropna().head())
print(df["HomeRest"].describe().round(1))
```

In this league everyone plays weekly, so rest days barely vary: a good reminder that a feature can only help if it varies and relates to the outcome. In real football, midweek cup and European fixtures make rest a meaningful feature.

## Does a feature actually help?

Don't add features because they sound clever. Test each one: compare walk-forward (or validation) log loss **with and without** it. If the improvement is tiny compared with the noise, leave it out: every extra feature is another chance to overfit.

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
long = pd.concat([
    pd.DataFrame({"MatchId": df.index, "Team": df["HomeTeam"], "Date": df["Date"], "GF": df["FTHG"], "GA": df["FTAG"], "Side": "Home"}),
    pd.DataFrame({"MatchId": df.index, "Team": df["AwayTeam"], "Date": df["Date"], "GF": df["FTAG"], "GA": df["FTHG"], "Side": "Away"}),
]).sort_values(["Team", "Date", "MatchId"])
long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
long["GD"] = long["GF"] - long["GA"]
for col in ["Pts", "GD"]:
    long[f"ewm_{col}"] = long.groupby("Team")[col].transform(lambda s: s.shift(1).ewm(halflife=6).mean())
for col in ["ewm_Pts", "ewm_GD"]:
    wide = long.pivot(index="MatchId", columns="Side", values=col)
    df[f"{col}_diff"] = wide["Home"] - wide["Away"]
df["Market"] = (1 / df["AvgH"]) / (1 / df["AvgH"] + 1 / df["AvgD"] + 1 / df["AvgA"])

data = df.dropna(subset=["ewm_Pts_diff", "ewm_GD_diff"])
train, test = data[data["Season"] < "2024-25"], data[data["Season"] == "2024-25"]
for features in [["ewm_Pts_diff"], ["ewm_GD_diff"], ["ewm_Pts_diff", "ewm_GD_diff"]]:
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(train[features], train["FTR"])
    loss = log_loss(test["FTR"], model.predict_proba(test[features]), labels=model.classes_)
    print(f"{' + '.join(features):>28}: test log loss {loss:.4f}")
```

Goal difference usually carries more information than points: a 4–0 and a lucky 1–0 earn the same points but tell you very different things about a team's strength.

## Practice

:::exercise feat-ewm Team EWMA form
Write `ewm_form(long, col, halflife)`. `long` has one row per team per match with columns `Team`, `Date` and the column `col`. Return a Series aligned with `long`'s index: each team's exponentially weighted mean of `col` over its **previous** matches (`shift(1)` then `ewm(halflife=halflife).mean()`), computed in date order within each team.

@@starter
import pandas as pd

def ewm_form(long, col, halflife):
    return long[col].ewm(halflife=halflife).mean()

@@solution
import pandas as pd

def ewm_form(long, col, halflife):
    ordered = long.sort_values(["Team", "Date"])
    result = ordered.groupby("Team")[col].transform(lambda s: s.shift(1).ewm(halflife=halflife).mean())
    return result.reindex(long.index)

@@tests
import numpy as np
import pandas as pd

LONG = pd.DataFrame({
    "Team": ["A", "B", "A", "B", "A"],
    "Date": pd.to_datetime(["2024-01-06", "2024-01-06", "2024-01-20", "2024-01-13", "2024-01-13"]),
    "Pts": [3, 0, 1, 3, 0],
}, index=[0, 1, 2, 3, 4])

def test_values():
    """Uses previous matches only, per team, in date order"""
    got = ewm_form(LONG, "Pts", 1)
    assert np.isnan(got[0]) and np.isnan(got[1])
    assert got[4] == 3.0                      # A's second match (13th) sees only the 3 points from the 6th
    exp = pd.Series([3, 0]).ewm(halflife=1).mean().iloc[-1]
    assert np.isclose(got[2], exp)            # A's third match sees 3 then 0
    assert got[3] == 0.0

def test_alignment():
    """Aligned with the input index"""
    assert list(ewm_form(LONG, "Pts", 2).index) == [0, 1, 2, 3, 4]
:::

:::exercise feat-elo-margin Elo with margin of victory
Write `elo_update(home_rating, away_rating, home_goals, away_goals, k=20, home_adv=60)` returning the new `(home_rating, away_rating)` after one match, using the margin-of-victory multiplier $\ln(|\text{GD}| + 1)/\ln 2$ for wins (1 for draws).

@@starter
import math

def elo_update(home_rating, away_rating, home_goals, away_goals, k=20, home_adv=60):
    return home_rating, away_rating

@@solution
import math

def elo_update(home_rating, away_rating, home_goals, away_goals, k=20, home_adv=60):
    expected = 1 / (1 + 10 ** ((away_rating - home_rating - home_adv) / 400))
    actual = 1.0 if home_goals > away_goals else 0.0 if home_goals < away_goals else 0.5
    gd = abs(home_goals - away_goals)
    multiplier = math.log(gd + 1) / math.log(2) if gd else 1.0
    change = k * multiplier * (actual - expected)
    return home_rating + change, away_rating - change

@@tests
import math

def test_one_goal_win():
    """A 1-0 win between equals with no home advantage moves ratings by k/2"""
    h, a = elo_update(1500, 1500, 1, 0, k=20, home_adv=0)
    assert math.isclose(h, 1510) and math.isclose(a, 1490)

def test_big_win_moves_more():
    """A 4-0 moves ratings more than a 1-0"""
    h1, _ = elo_update(1500, 1500, 1, 0)
    h4, _ = elo_update(1500, 1500, 4, 0)
    assert h4 - 1500 > h1 - 1500 > 0

def test_home_draw_costs_home_team():
    """With home advantage, a draw lowers the home team's rating"""
    h, a = elo_update(1500, 1500, 1, 1)
    assert h < 1500 < a and math.isclose(h + a, 3000)
:::

:::quiz feat-quiz Quick check
? Why add a margin-of-victory multiplier to Elo?
- [x] Big wins carry more information about strength than narrow ones
- [ ] To make ratings bigger
- [ ] Because draws are impossible
> A 4–0 is stronger evidence than a 1–0.

? What does `ewm(halflife=5)` do?
- [x] Averages with weights that halve every 5 observations into the past
- [ ] Averages the last 5 values equally
- [ ] Removes the 5 oldest values
> Recent observations count most, old ones fade smoothly.

? You add a clever feature and test log loss improves from 1.0463 to 1.0461. What should you do?
- [x] Probably leave it out: the gain is within noise and adds overfitting risk
- [ ] Always keep it
- [ ] Add ten more like it
> Features must earn their place.

? How should you choose Elo's `k`?
- [x] By validation log loss on a season before the test season
- [ ] By the test season's log loss
- [ ] Always use 20
> Never tune on the test set.
:::
