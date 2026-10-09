---
title: "Project: analyse three football seasons"
summary: A full exploratory analysis. Measure home advantage, check whether bookmaker odds are well calibrated, chart a title race, and compare goals with a Poisson model.
minutes: 150
kind: project
---

You're an analyst asked to brief a team that wants to build a betting model. Before anyone trains a model, they need to understand the data. Your brief should answer four questions:

1. How big is home advantage, and is it stable from season to season?
2. Are the bookmakers' implied probabilities accurate (**calibrated**)?
3. What did the title race look like?
4. Do goals follow a Poisson distribution? (If they do, there's a classic way to model matches. That's Phase 6.)

Each step is a tested function. At the end you'll assemble the charts and write your findings.

## Step 1: Prepare the data

:::exercise sa-prepare Load and prepare
Write `prepare(path)` that reads the CSV with `Date` parsed as dates and returns a DataFrame with these extra columns:

- `TotalGoals`: home plus away goals
- `HomeImplied`, `DrawImplied`, `AwayImplied`: `1 / AvgH`, `1 / AvgD`, `1 / AvgA`
- `Margin`: the sum of the three implied probabilities, minus 1
- `HomeFair`: `HomeImplied` divided by the sum of the three implied probabilities (the margin-free home probability)

@@starter
import pandas as pd

def prepare(path):
    df = pd.read_csv(path)
    return df

@@solution
import pandas as pd

def prepare(path):
    df = pd.read_csv(path, parse_dates=["Date"])
    df["TotalGoals"] = df["FTHG"] + df["FTAG"]
    df["HomeImplied"] = 1 / df["AvgH"]
    df["DrawImplied"] = 1 / df["AvgD"]
    df["AwayImplied"] = 1 / df["AvgA"]
    total = df["HomeImplied"] + df["DrawImplied"] + df["AwayImplied"]
    df["Margin"] = total - 1
    df["HomeFair"] = df["HomeImplied"] / total
    return df

@@tests
import numpy as np
import pandas as pd

def test_dates():
    """Date is parsed as a datetime"""
    df = prepare("data/matches.csv")
    assert pd.api.types.is_datetime64_any_dtype(df["Date"])

def test_columns():
    """Adds the new columns correctly"""
    df = prepare("data/matches.csv")
    total = 1 / df["AvgH"] + 1 / df["AvgD"] + 1 / df["AvgA"]
    assert np.allclose(df["TotalGoals"], df["FTHG"] + df["FTAG"])
    assert np.allclose(df["Margin"], total - 1)
    assert np.allclose(df["HomeFair"], (1 / df["AvgH"]) / total)
    assert np.allclose(df["DrawImplied"], 1 / df["AvgD"])
:::

## Step 2: Home advantage

:::exercise sa-home Home advantage by season
Write `home_advantage(df)` returning a DataFrame indexed by `Season` with columns:

- `home_win`, `draw`, `away_win`: the share of each result, rounded to 3 decimals
- `home_goals`, `away_goals`: average goals per match, rounded to 2 decimals
- `goal_edge`: `home_goals - away_goals` (use the rounded values)

@@starter
import pandas as pd

def home_advantage(df):
    return pd.DataFrame()

@@solution
import pandas as pd

def home_advantage(df):
    out = df.groupby("Season").agg(
        home_win=("FTR", lambda r: (r == "H").mean()),
        draw=("FTR", lambda r: (r == "D").mean()),
        away_win=("FTR", lambda r: (r == "A").mean()),
        home_goals=("FTHG", "mean"),
        away_goals=("FTAG", "mean"),
    )
    out = out.round({"home_win": 3, "draw": 3, "away_win": 3, "home_goals": 2, "away_goals": 2})
    out["goal_edge"] = (out["home_goals"] - out["away_goals"]).round(2)
    return out

@@tests
import pandas as pd

def test_structure():
    """One row per season with the right columns"""
    out = home_advantage(pd.read_csv("data/matches.csv"))
    assert list(out.columns) == ["home_win", "draw", "away_win", "home_goals", "away_goals", "goal_edge"], list(out.columns)
    assert len(out) == 3

def test_values():
    """Shares sum to 1 and match the data"""
    df = pd.read_csv("data/matches.csv")
    out = home_advantage(df)
    s = df[df["Season"] == "2022-23"]
    assert out.loc["2022-23", "home_win"] == round((s["FTR"] == "H").mean(), 3)
    assert out.loc["2022-23", "home_goals"] == round(s["FTHG"].mean(), 2)
    assert abs(out[["home_win", "draw", "away_win"]].sum(axis=1) - 1).max() < 0.002
:::

## Step 3: Are the odds calibrated?

A forecaster is **calibrated** if, among all the times they say "60%", the event happens about 60% of the time. To check the bookmakers, group matches by their margin-free home probability (`HomeFair`) into bins, then compare the average forecast in each bin with how often the home team actually won.

:::exercise sa-calibration A calibration table
Write `calibration_table(df, bins)`. Using `pd.cut(df["HomeFair"], bins)` to make the groups, return a DataFrame indexed by bin with columns:

- `matches`: number of matches in the bin
- `forecast`: mean `HomeFair` in the bin, rounded to 3 decimals
- `actual`: share of home wins in the bin, rounded to 3 decimals

Drop bins with no matches. (Pass `observed=True` to `groupby` so empty categories are left out.)

@@starter
import pandas as pd

def calibration_table(df, bins):
    return pd.DataFrame()

@@solution
import pandas as pd

def calibration_table(df, bins):
    groups = pd.cut(df["HomeFair"], bins)
    table = df.assign(HomeWin=df["FTR"] == "H").groupby(groups, observed=True).agg(
        matches=("HomeWin", "size"),
        forecast=("HomeFair", "mean"),
        actual=("HomeWin", "mean"),
    )
    table = table[table["matches"] > 0]
    return table.round({"forecast": 3, "actual": 3})

@@tests
import pandas as pd

def load():
    df = pd.read_csv("data/matches.csv")
    total = 1 / df["AvgH"] + 1 / df["AvgD"] + 1 / df["AvgA"]
    df["HomeFair"] = (1 / df["AvgH"]) / total
    return df

def test_structure():
    """Has matches, forecast and actual columns"""
    out = calibration_table(load(), [0, 0.2, 0.4, 0.6, 0.8, 1])
    assert list(out.columns) == ["matches", "forecast", "actual"], list(out.columns)
    assert out["matches"].sum() == 1140

def test_values():
    """Values match the data"""
    df = load()
    out = calibration_table(df, [0, 0.5, 1])
    low = df[df["HomeFair"] <= 0.5]
    assert out["matches"].iloc[0] == len(low)
    assert out["forecast"].iloc[0] == round(low["HomeFair"].mean(), 3)
    assert out["actual"].iloc[0] == round((low["FTR"] == "H").mean(), 3)

def test_calibrated():
    """Well-populated bins are roughly calibrated"""
    out = calibration_table(load(), [0, 0.3, 0.45, 0.6, 1])
    big = out[out["matches"] >= 100]
    assert (abs(big["forecast"] - big["actual"]) < 0.06).all(), out
:::

Now chart it. A perfectly calibrated forecaster lies on the diagonal:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

df = pd.read_csv("data/matches.csv")
total = 1 / df["AvgH"] + 1 / df["AvgD"] + 1 / df["AvgA"]
df["HomeFair"] = (1 / df["AvgH"]) / total
groups = pd.cut(df["HomeFair"], np.arange(0.05, 0.95, 0.1))
table = df.assign(HomeWin=df["FTR"] == "H").groupby(groups, observed=True).agg(
    matches=("HomeWin", "size"), forecast=("HomeFair", "mean"), actual=("HomeWin", "mean"))

fig, ax = plt.subplots(figsize=(5, 5))
ax.plot([0, 1], [0, 1], linestyle="--", color="grey", label="Perfect calibration")
ax.scatter(table["forecast"], table["actual"], s=table["matches"], alpha=0.7, label="Bookmaker (size = matches)")
ax.set_xlabel("Forecast home win probability")
ax.set_ylabel("Actual home win rate")
ax.set_title("Are the odds calibrated?")
ax.legend(loc="upper left")
fig.tight_layout()
plt.show()
print(table.round(3))
```

The points sit close to the diagonal where most matches are, so the market's probabilities are good. Look closer, though: home teams won slightly more often than the fair odds implied (about 45.7% against a forecast of 43.5% overall), mostly among home sides priced between 35% and 45%. Bins at the edges hold only a handful of matches, so their wobbles mean little.

Is that gap a real, exploitable edge or just luck? With about 1,100 matches, a 2-point difference is only around one and a half standard errors from zero. Phase 4 teaches you to test exactly this kind of question, and Phase 6 how to exploit an edge honestly, after the margin. Either way, the bar is high: to beat the market, a model must be better calibrated and sharper than this.

## Step 4: The title race

:::exercise sa-race Cumulative points
Write `cumulative_points(df, season)` returning a DataFrame with **one column per team** and one row per date in that season. Each value is the team's cumulative points **after** that date's matches (carry the total forward on dates the team didn't play). The index should be the sorted dates.

@@starter
import pandas as pd

def cumulative_points(df, season):
    s = df[df["Season"] == season]
    return pd.DataFrame()

@@solution
import pandas as pd

def cumulative_points(df, season):
    s = df[df["Season"] == season]
    home = pd.DataFrame({"Date": s["Date"], "Team": s["HomeTeam"], "GF": s["FTHG"], "GA": s["FTAG"]})
    away = pd.DataFrame({"Date": s["Date"], "Team": s["AwayTeam"], "GF": s["FTAG"], "GA": s["FTHG"]})
    long = pd.concat([home, away])
    long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
    daily = long.pivot_table(index="Date", columns="Team", values="Pts", aggfunc="sum").sort_index()
    return daily.fillna(0).cumsum()

@@tests
import pandas as pd

def load():
    return pd.read_csv("data/matches.csv", parse_dates=["Date"])

def test_shape():
    """One column per team, dates sorted"""
    out = cumulative_points(load(), "2024-25")
    assert out.shape[1] == 20, f"{out.shape[1]} columns"
    assert out.index.is_monotonic_increasing

def test_final_points():
    """Final row equals each team's season points"""
    df = load()
    out = cumulative_points(df, "2024-25")
    s = df[df["Season"] == "2024-25"]
    team = "Ashford City"
    h = s[s["HomeTeam"] == team]
    a = s[s["AwayTeam"] == team]
    pts = 3 * ((h["FTHG"] > h["FTAG"]).sum() + (a["FTAG"] > a["FTHG"]).sum()) + (h["FTHG"] == h["FTAG"]).sum() + (a["FTAG"] == a["FTHG"]).sum()
    assert out[team].iloc[-1] == pts

def test_never_decreases():
    """Cumulative points never go down"""
    out = cumulative_points(load(), "2023-24")
    assert (out.diff().dropna() >= 0).all().all()

@@hint
Build team rows (home and away views), give each row its points, then `pivot_table(index="Date", columns="Team", values="Pts", aggfunc="sum")`. Fill missing dates with 0 before `cumsum()`.
:::

```python
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
s = df[df["Season"] == "2024-25"]
long = pd.concat([
    pd.DataFrame({"Date": s["Date"], "Team": s["HomeTeam"], "GF": s["FTHG"], "GA": s["FTAG"]}),
    pd.DataFrame({"Date": s["Date"], "Team": s["AwayTeam"], "GF": s["FTAG"], "GA": s["FTHG"]}),
])
long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
cum = long.pivot_table(index="Date", columns="Team", values="Pts", aggfunc="sum").fillna(0).cumsum()
top = cum.iloc[-1].nlargest(4).index

fig, ax = plt.subplots(figsize=(8, 4))
for team in top:
    ax.plot(cum.index, cum[team], label=team, linewidth=2)
ax.set_title("2024-25 title race")
ax.set_ylabel("Cumulative points")
ax.legend()
ax.grid(alpha=0.3)
fig.tight_layout()
plt.show()
```

## Step 5: Do goals follow a Poisson distribution?

The **Poisson distribution** describes counts of events that happen independently at a constant average rate. The probability of exactly $k$ goals when the average is $\lambda$ is:

$$
P(k) = \frac{\lambda^k e^{-\lambda}}{k!}
$$

You'll study it properly in Phase 4. For now, compare it with the data:

:::exercise sa-poisson Observed vs Poisson
Write `goal_distribution(goals)`. `goals` is a Series of goal counts. Return a DataFrame indexed by `k = 0, 1, ..., 6` with columns:

- `observed`: the share of matches with exactly `k` goals
- `poisson`: the Poisson probability $P(k)$ using $\lambda$ = the mean of `goals`

Round both to 3 decimals. Use `math.factorial` and `math.exp` (or `scipy.stats.poisson.pmf`).

@@starter
import math
import pandas as pd

def goal_distribution(goals):
    return pd.DataFrame()

@@solution
import math
import pandas as pd

def goal_distribution(goals):
    lam = goals.mean()
    ks = range(7)
    observed = [(goals == k).mean() for k in ks]
    poisson = [lam ** k * math.exp(-lam) / math.factorial(k) for k in ks]
    return pd.DataFrame({"observed": observed, "poisson": poisson}, index=list(ks)).round(3)

@@tests
import math
import pandas as pd

def test_structure():
    """Index 0-6 with two columns"""
    out = goal_distribution(pd.read_csv("data/matches.csv")["FTHG"])
    assert list(out.index) == list(range(7)) and list(out.columns) == ["observed", "poisson"]

def test_values():
    """Observed shares and Poisson probabilities"""
    g = pd.read_csv("data/matches.csv")["FTHG"]
    out = goal_distribution(g)
    lam = g.mean()
    assert out.loc[0, "observed"] == round((g == 0).mean(), 3)
    assert out.loc[2, "poisson"] == round(lam ** 2 * math.exp(-lam) / 2, 3)

def test_close_fit():
    """Home goals are close to Poisson"""
    out = goal_distribution(pd.read_csv("data/matches.csv")["FTHG"])
    assert (abs(out["observed"] - out["poisson"]) < 0.03).all(), out
:::

```python
import math
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

df = pd.read_csv("data/matches.csv")
fig, axes = plt.subplots(1, 2, figsize=(10, 3.5), sharey=True)
for ax, col, label in [(axes[0], "FTHG", "Home goals"), (axes[1], "FTAG", "Away goals")]:
    lam = df[col].mean()
    ks = np.arange(8)
    observed = [(df[col] == k).mean() for k in ks]
    expected = [lam ** k * math.exp(-lam) / math.factorial(k) for k in ks]
    ax.bar(ks - 0.2, observed, width=0.4, label="Observed")
    ax.bar(ks + 0.2, expected, width=0.4, label=f"Poisson (λ = {lam:.2f})")
    ax.set_title(label)
    ax.set_xlabel("Goals")
    ax.legend()
axes[0].set_ylabel("Share of matches")
fig.tight_layout()
plt.show()
```

## Step 6: Write your brief

Write a short summary (in a notebook, a Markdown file in your repo, or just a document) that answers the four questions with numbers and charts. A good analyst's brief:

- leads with the answer ("Home advantage is worth about 0.4 goals per match and was stable across seasons"),
- backs it up with one chart per claim,
- notes caveats (three seasons is a small sample; this is synthetic data),
- ends with recommendations ("Model home and away goals separately; the market is well calibrated, so a model needs extra information to beat it").

:::tip Use the real data
Download a few seasons of a league you follow from [Football-Data.co.uk](https://www.football-data.co.uk/data.php) and run the same analysis on your computer. The column names match (use the `AvgH`/`AvgD`/`AvgA` or `B365H`/... columns), but dates are day-first: `pd.read_csv(path, parse_dates=["Date"], dayfirst=True)`. Real data will be messier and more interesting.
:::
