---
title: pandas DataFrames
summary: Load a CSV into a DataFrame, inspect it, select rows and columns, and create new columns.
minutes: 55
kind: lesson
---

**pandas** is the Python library for tables. A **DataFrame** is a table with labelled columns and rows, built on NumPy arrays. It's how almost every data science project starts: load the data, look at it, clean it, explore it.

By convention it's imported as `pd`. Remember the 15 lines of `csv` code from Phase 1? Here's the pandas version:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
print(df.shape)
print((df["FTR"] == "H").mean())
print((df["FTHG"] + df["FTAG"]).mean())
```

## First look at a dataset

Always start by inspecting your data:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
print(df.head())          # first 5 rows (df.tail() for the last)
print(df.shape)           # (rows, columns)
print(df.columns.tolist())
print(df.dtypes)
```

`parse_dates=["Date"]` converts the Date column from text into real dates, which you need for time-based work.

`info()` summarises columns, types and missing values; `describe()` gives statistics for numeric columns:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
df.info()
print(df.describe().round(2))
```

The columns follow the Football-Data.co.uk conventions:

| Column | Meaning |
| --- | --- |
| `FTHG`, `FTAG` | Full-time home and away goals |
| `FTR` | Full-time result: H, D or A |
| `HS`, `AS` | Home and away shots |
| `HST`, `AST` | Home and away shots on target |
| `AvgH`, `AvgD`, `AvgA` | Average bookmaker decimal odds for home, draw and away |

## Series: one column

Selecting one column gives a **Series**: a 1D array with an index (the row labels):

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
goals = df["FTHG"]
print(type(goals))
print(goals.head())
print(goals.mean(), goals.max(), goals.median())
print(df["FTR"].value_counts())
print(df["FTR"].value_counts(normalize=True).round(3))
print(df["HomeTeam"].nunique(), "teams")
```

`value_counts()` is one of the most useful methods in pandas: it counts how often each value occurs.

## Selecting columns and rows

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")

print(df[["HomeTeam", "AwayTeam", "FTHG", "FTAG"]].head(3))   # several columns: a list inside []

print(df.iloc[0])            # row by position
print(df.iloc[0:3, 2:5])     # rows 0-2, columns 2-4, by position (like NumPy)
print(df.loc[5, "HomeTeam"]) # by label: row label 5, column "HomeTeam"
print(df.loc[0:2, ["HomeTeam", "FTR"]])   # note: loc slices INCLUDE the end label
```

- `iloc` is **i**nteger **loc**ation: positions, like NumPy and lists.
- `loc` is **label**-based: row index labels and column names.

The row labels here are 0, 1, 2... so they look the same as positions, but after filtering or sorting they won't be. When in doubt, use `loc` with column names.

## Creating columns

New columns are calculated from existing ones, vectorised like NumPy:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
df["TotalGoals"] = df["FTHG"] + df["FTAG"]
df["HomeImplied"] = 1 / df["AvgH"]
df["Margin"] = 1 / df["AvgH"] + 1 / df["AvgD"] + 1 / df["AvgA"] - 1
df["Over2.5"] = df["TotalGoals"] > 2.5
print(df[["HomeTeam", "AwayTeam", "TotalGoals", "Over2.5", "Margin"]].head())
print(f"Over 2.5 goals in {df['Over2.5'].mean():.1%} of matches; average margin {df['Margin'].mean():.2%}")
```

`assign` does the same but returns a new DataFrame, which is handy for chaining:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
summary = (
    df.assign(TotalGoals=df["FTHG"] + df["FTAG"])
      .sort_values("TotalGoals", ascending=False)
      [["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "TotalGoals"]]
      .head(5)
)
print(summary)
```

## Sorting

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
print(df.sort_values("AvgH").head(3)[["HomeTeam", "AwayTeam", "AvgH", "FTR"]])           # strongest home favourites
print(df.sort_values(["FTHG", "FTAG"], ascending=[False, True]).head(3)[["HomeTeam", "FTHG", "FTAG"]])
print(df.nlargest(3, "HS")[["HomeTeam", "AwayTeam", "HS"]])                            # most home shots
```

## Saving

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
df.head(20).to_csv("first_20.csv", index=False)     # index=False: don't write the row labels
print(pd.read_csv("first_20.csv").shape)
```

## A note on pandas 3

This course uses pandas 3. If you read older tutorials, two changes matter:

- Text columns have a dedicated **string dtype** (shown as `str`), where older versions showed `object`.
- **Copy-on-write** is always on: selecting part of a DataFrame behaves like a copy. Modifying it never silently changes the original, and "chained assignment" like `df[df.x > 1]["y"] = 0` doesn't work. Use `df.loc[df.x > 1, "y"] = 0` instead (next lesson).

## Practice

:::exercise pd-explore Explore the matches
Using `data/matches.csv`, complete `explore()` to return a dictionary with:

- `"rows"`: number of matches
- `"teams"`: number of distinct home teams
- `"draw_rate"`: fraction of matches that were draws, rounded to 3 decimals
- `"avg_home_shots"`: mean of `HS`, rounded to 2 decimals
- `"max_goals"`: the most goals scored in a single match (home + away)

@@starter
import pandas as pd

def explore():
    df = pd.read_csv("data/matches.csv")
    return {}

@@solution
import pandas as pd

def explore():
    df = pd.read_csv("data/matches.csv")
    return {
        "rows": len(df),
        "teams": df["HomeTeam"].nunique(),
        "draw_rate": round((df["FTR"] == "D").mean(), 3),
        "avg_home_shots": round(df["HS"].mean(), 2),
        "max_goals": int((df["FTHG"] + df["FTAG"]).max()),
    }

@@tests
import pandas as pd

def ref():
    df = pd.read_csv("data/matches.csv")
    return {"rows": len(df), "teams": df["HomeTeam"].nunique(), "draw_rate": round((df["FTR"] == "D").mean(), 3),
            "avg_home_shots": round(df["HS"].mean(), 2), "max_goals": int((df["FTHG"] + df["FTAG"]).max())}

def test_counts():
    """Counts rows and teams"""
    got = explore()
    assert got.get("rows") == 1140 and got.get("teams") == 20, got

def test_stats():
    """Draw rate, shots and max goals"""
    got, exp = explore(), ref()
    for key in ["draw_rate", "avg_home_shots", "max_goals"]:
        assert got.get(key) == exp[key], f"{key}: got {got.get(key)}, expected {exp[key]}"

@@hint
`(df["FTR"] == "D")` is a column of True/False values, and `.mean()` of it is the fraction that are True.
:::

:::exercise pd-columns Add features
Complete `add_features(df)` so it returns the DataFrame with three new columns:

- `"GoalDiff"`: home goals minus away goals
- `"HomeShotShare"`: home shots divided by total shots (`HS + AS`), rounded to 3 decimals
- `"FavOdds"`: the lowest of `AvgH`, `AvgD` and `AvgA` in each row (hint: select the three columns and use `.min(axis=1)`)

@@starter
import pandas as pd

def add_features(df):
    df = df.copy()
    return df

@@solution
import pandas as pd

def add_features(df):
    df = df.copy()
    df["GoalDiff"] = df["FTHG"] - df["FTAG"]
    df["HomeShotShare"] = (df["HS"] / (df["HS"] + df["AS"])).round(3)
    df["FavOdds"] = df[["AvgH", "AvgD", "AvgA"]].min(axis=1)
    return df

@@tests
import pandas as pd
import numpy as np

def test_columns():
    """Adds the three columns"""
    out = add_features(pd.read_csv("data/matches.csv"))
    for col in ["GoalDiff", "HomeShotShare", "FavOdds"]:
        assert col in out.columns, f"missing {col}"

def test_values():
    """Calculates them correctly"""
    df = pd.read_csv("data/matches.csv")
    out = add_features(df)
    assert (out["GoalDiff"] == df["FTHG"] - df["FTAG"]).all()
    assert np.allclose(out["HomeShotShare"], (df["HS"] / (df["HS"] + df["AS"])).round(3))
    assert np.allclose(out["FavOdds"], np.minimum(np.minimum(df["AvgH"], df["AvgD"]), df["AvgA"]))
:::

:::exercise pd-select Select and sort
Complete `biggest_upsets(df, n)`. An upset is a home win where the home odds (`AvgH`) were high. Return a DataFrame of the `n` home wins (`FTR == "H"`) with the **highest** `AvgH`, highest first, containing only the columns `Date`, `HomeTeam`, `AwayTeam` and `AvgH`, with the index reset to 0, 1, 2, ...

@@starter
import pandas as pd

def biggest_upsets(df, n):
    return df.head(n)

@@solution
import pandas as pd

def biggest_upsets(df, n):
    wins = df[df["FTR"] == "H"]
    top = wins.sort_values("AvgH", ascending=False).head(n)
    return top[["Date", "HomeTeam", "AwayTeam", "AvgH"]].reset_index(drop=True)

@@tests
import pandas as pd

def test_result():
    """Returns the top home-win upsets"""
    df = pd.read_csv("data/matches.csv")
    got = biggest_upsets(df, 5)
    exp = df[df["FTR"] == "H"].nlargest(5, "AvgH")[["Date", "HomeTeam", "AwayTeam", "AvgH"]].reset_index(drop=True)
    assert list(got.columns) == ["Date", "HomeTeam", "AwayTeam", "AvgH"], list(got.columns)
    assert list(got.index) == [0, 1, 2, 3, 4], "reset the index with reset_index(drop=True)"
    assert got["AvgH"].tolist() == exp["AvgH"].tolist()

@@hint
Filter with `df[df["FTR"] == "H"]` (more on this next lesson), then `sort_values(..., ascending=False)`, `head(n)`, select columns, and `reset_index(drop=True)`.
:::

:::quiz pandas-basics-quiz Quick check
? What does `df["FTR"]` return?
- [x] A Series
- [ ] A DataFrame
- [ ] A list
> One column is a Series; `df[["FTR"]]` (a list of names) would be a one-column DataFrame.

? What's the difference between `loc` and `iloc`?
- [x] `loc` uses labels; `iloc` uses integer positions
- [ ] `loc` is faster
- [ ] `iloc` only works on columns
> `loc` slices include the end label; `iloc` slices don't include the end position.

? What does `df["FTR"].value_counts(normalize=True)` give?
- [x] The fraction of rows with each result
- [ ] The number of distinct results
- [ ] The results sorted alphabetically
> Without `normalize=True` you get counts.

? Why pass `index=False` to `to_csv`?
- [x] To avoid writing the row labels as an extra column
- [ ] To make the file smaller by removing the header
> Otherwise, reading the file back gives you an unwanted "Unnamed: 0" column.
:::
