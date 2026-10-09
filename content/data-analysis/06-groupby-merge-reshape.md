---
title: Grouping, joining and reshaping
summary: Split-apply-combine with groupby, join tables with merge, stack them with concat, and reshape with pivot_table and melt. Then build a league table from raw results.
minutes: 60
kind: lesson
---

These four operations (grouping, joining, stacking and reshaping) turn raw records into answers. Master them and you can answer almost any question a table can answer.

## groupby: split, apply, combine

`groupby` splits rows into groups, applies a calculation to each group, and combines the results:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
print(df.groupby("Season")["FTHG"].mean().round(2))                 # one value per season
print(df.groupby("HomeTeam")["FTHG"].sum().sort_values(ascending=False).head(5))
print(df.groupby("Season")["FTR"].value_counts(normalize=True).round(3))
```

Several statistics at once with `agg`, using **named aggregation** to label the results:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
home = df.groupby("HomeTeam").agg(
    matches=("FTHG", "size"),
    goals_for=("FTHG", "sum"),
    goals_against=("FTAG", "sum"),
    avg_shots=("HS", "mean"),
    win_rate=("FTR", lambda r: (r == "H").mean()),
)
print(home.sort_values("win_rate", ascending=False).round(2).head())
```

Group by several columns to get one row per combination:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
by = df.groupby(["Season", "HomeTeam"])["FTHG"].mean()
print(by.head(6))
print(by.loc["2024-25"].nlargest(3))
```

### transform: a group value on every row

`agg` returns one row per group. `transform` returns a value for **every original row**, which is how you create features like "this team's average":

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
df["TeamAvgHomeGoals"] = df.groupby("HomeTeam")["FTHG"].transform("mean")
df["AboveTeamAvg"] = df["FTHG"] > df["TeamAvgHomeGoals"]
print(df[["HomeTeam", "FTHG", "TeamAvgHomeGoals", "AboveTeamAvg"]].head())
```

:::warning Leakage alert
`TeamAvgHomeGoals` above uses *every* match, including future ones. Fine for describing a season, but as a feature for predicting a match it **leaks the future**: the model would know results it couldn't have known before kickoff. The next lesson shows how to build features that only use the past.
:::

## concat: stacking tables

`pd.concat` stacks DataFrames on top of each other (or side by side with `axis=1`). A classic use is turning match rows into **team rows**, so each match appears once from the home team's view and once from the away team's:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
home = pd.DataFrame({
    "Season": df["Season"], "Team": df["HomeTeam"], "Opponent": df["AwayTeam"],
    "GF": df["FTHG"], "GA": df["FTAG"], "Venue": "H",
})
away = pd.DataFrame({
    "Season": df["Season"], "Team": df["AwayTeam"], "Opponent": df["HomeTeam"],
    "GF": df["FTAG"], "GA": df["FTHG"], "Venue": "A",
})
long = pd.concat([home, away], ignore_index=True)
print(long.shape)
print(long.head())
```

This "long" format makes team-level questions easy, as you'll see in the league table below.

## merge: joining tables

`merge` combines tables that share a key column, like a SQL join:

```python
import pandas as pd

stadiums = pd.DataFrame({
    "Team": ["Ashford City", "Bramley Rovers", "Castleton United"],
    "Capacity": [32000, 18500, 41000],
})
form = pd.DataFrame({
    "Team": ["Ashford City", "Castleton United", "Dunmore Athletic"],
    "Points": [78, 71, 59],
})

print(form.merge(stadiums, on="Team", how="inner"))   # only teams in both
print(form.merge(stadiums, on="Team", how="left"))    # all teams in form; NaN where no match
print(form.merge(stadiums, on="Team", how="outer"))   # everything from both
```

| `how` | Keeps |
| --- | --- |
| `inner` | rows with a match in both tables |
| `left` | every row of the left table |
| `right` | every row of the right table |
| `outer` | every row of both |

After a merge, always check the number of rows. If a key appears several times in both tables, a merge multiplies rows, and that's a common source of silent bugs. `validate="one_to_one"` or `"many_to_one"` makes pandas check for you.

## pivot_table: summaries as a grid

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
grid = pd.pivot_table(df, index="HomeTeam", columns="Season", values="FTHG", aggfunc="mean").round(2)
print(grid.head())

results = pd.crosstab(df["Season"], df["FTR"], normalize="index").round(3)   # crosstab: counts (or shares)
print(results)
```

## melt: wide to long

`melt` is the reverse of a pivot. It turns columns into rows, which is often needed before plotting or modelling:

```python
import pandas as pd

wide = pd.DataFrame({"Match": ["A v B", "C v D"], "AvgH": [2.1, 1.6], "AvgD": [3.4, 3.9], "AvgA": [3.6, 5.5]})
long = wide.melt(id_vars="Match", var_name="Outcome", value_name="Odds")
print(long)
```

## Building a league table

Now combine it all: stack team rows, compute points, then group:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
season = df[df["Season"] == "2024-25"]

rows = pd.concat([
    pd.DataFrame({"Team": season["HomeTeam"], "GF": season["FTHG"], "GA": season["FTAG"]}),
    pd.DataFrame({"Team": season["AwayTeam"], "GF": season["FTAG"], "GA": season["FTHG"]}),
], ignore_index=True)

rows["W"] = (rows["GF"] > rows["GA"]).astype(int)
rows["D"] = (rows["GF"] == rows["GA"]).astype(int)
rows["L"] = (rows["GF"] < rows["GA"]).astype(int)

table = rows.groupby("Team").agg(P=("GF", "size"), W=("W", "sum"), D=("D", "sum"), L=("L", "sum"),
                                 GF=("GF", "sum"), GA=("GA", "sum"))
table["GD"] = table["GF"] - table["GA"]
table["Pts"] = 3 * table["W"] + table["D"]
table = table.sort_values(["Pts", "GD", "GF"], ascending=False)
table.insert(0, "Pos", range(1, len(table) + 1))
print(table.to_string())
```

## Practice

:::exercise grp-season Season summary
Complete `season_summary(df)`. Return a DataFrame indexed by `Season` with these columns:

- `matches`: number of matches
- `goals_per_match`: average of home + away goals, rounded to 2 decimals
- `home_win_rate`: fraction of home wins, rounded to 3 decimals
- `avg_margin`: average bookmaker margin (`1/AvgH + 1/AvgD + 1/AvgA - 1`), rounded to 4 decimals

@@starter
import pandas as pd

def season_summary(df):
    df = df.copy()
    return df

@@solution
import pandas as pd

def season_summary(df):
    df = df.assign(
        goals=df["FTHG"] + df["FTAG"],
        home_win=(df["FTR"] == "H"),
        margin=1 / df["AvgH"] + 1 / df["AvgD"] + 1 / df["AvgA"] - 1,
    )
    out = df.groupby("Season").agg(
        matches=("goals", "size"),
        goals_per_match=("goals", "mean"),
        home_win_rate=("home_win", "mean"),
        avg_margin=("margin", "mean"),
    )
    return out.round({"goals_per_match": 2, "home_win_rate": 3, "avg_margin": 4})

@@tests
import pandas as pd

def test_shape():
    """One row per season, four columns"""
    out = season_summary(pd.read_csv("data/matches.csv"))
    assert list(out.index) == ["2022-23", "2023-24", "2024-25"], list(out.index)
    assert list(out.columns) == ["matches", "goals_per_match", "home_win_rate", "avg_margin"], list(out.columns)

def test_values():
    """Values are correct"""
    df = pd.read_csv("data/matches.csv")
    out = season_summary(df)
    s = df[df["Season"] == "2023-24"]
    assert out.loc["2023-24", "matches"] == 380
    assert out.loc["2023-24", "goals_per_match"] == round((s["FTHG"] + s["FTAG"]).mean(), 2)
    assert out.loc["2023-24", "home_win_rate"] == round((s["FTR"] == "H").mean(), 3)
    assert out.loc["2023-24", "avg_margin"] == round((1 / s["AvgH"] + 1 / s["AvgD"] + 1 / s["AvgA"] - 1).mean(), 4)
:::

:::exercise grp-table League table function
Complete `league_table(df, season)`. Return a DataFrame indexed by team with columns `P, W, D, L, GF, GA, GD, Pts`, sorted by points, then goal difference, then goals scored (all descending).

@@starter
import pandas as pd

def league_table(df, season):
    s = df[df["Season"] == season]
    return pd.DataFrame()

@@solution
import pandas as pd

def league_table(df, season):
    s = df[df["Season"] == season]
    rows = pd.concat([
        pd.DataFrame({"Team": s["HomeTeam"], "GF": s["FTHG"], "GA": s["FTAG"]}),
        pd.DataFrame({"Team": s["AwayTeam"], "GF": s["FTAG"], "GA": s["FTHG"]}),
    ], ignore_index=True)
    rows["W"] = (rows["GF"] > rows["GA"]).astype(int)
    rows["D"] = (rows["GF"] == rows["GA"]).astype(int)
    rows["L"] = (rows["GF"] < rows["GA"]).astype(int)
    t = rows.groupby("Team").agg(P=("GF", "size"), W=("W", "sum"), D=("D", "sum"), L=("L", "sum"),
                                 GF=("GF", "sum"), GA=("GA", "sum"))
    t["GD"] = t["GF"] - t["GA"]
    t["Pts"] = 3 * t["W"] + t["D"]
    return t.sort_values(["Pts", "GD", "GF"], ascending=False)

@@tests
import pandas as pd

def test_structure():
    """20 teams, 38 games each, the right columns"""
    t = league_table(pd.read_csv("data/matches.csv"), "2024-25")
    assert list(t.columns) == ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"], list(t.columns)
    assert len(t) == 20 and (t["P"] == 38).all()

def test_consistency():
    """Totals add up"""
    t = league_table(pd.read_csv("data/matches.csv"), "2022-23")
    assert (t["W"] + t["D"] + t["L"] == t["P"]).all()
    assert t["GF"].sum() == t["GA"].sum()
    assert t["W"].sum() == t["L"].sum()

def test_sorted():
    """Sorted by points"""
    t = league_table(pd.read_csv("data/matches.csv"), "2023-24")
    assert t["Pts"].is_monotonic_decreasing

def test_points():
    """Points are 3 per win and 1 per draw"""
    t = league_table(pd.read_csv("data/matches.csv"), "2023-24")
    assert (t["Pts"] == 3 * t["W"] + t["D"]).all()

@@hint
Follow the league table example in the lesson: stack a home view and an away view with `pd.concat`, then group by team.
:::

:::exercise grp-merge Merge in ratings
You have match rows and a separate table of pre-season ratings, one row per team per season (`Season`, `Team`, `Rating`). Complete `add_ratings(matches, ratings)` to add `HomeRating` and `AwayRating` columns by merging twice. Every match must be kept, in the original order, and the row count must not change.

@@starter
import pandas as pd

def add_ratings(matches, ratings):
    return matches

@@solution
import pandas as pd

def add_ratings(matches, ratings):
    home = ratings.rename(columns={"Team": "HomeTeam", "Rating": "HomeRating"})
    away = ratings.rename(columns={"Team": "AwayTeam", "Rating": "AwayRating"})
    out = matches.merge(home, on=["Season", "HomeTeam"], how="left", validate="many_to_one")
    out = out.merge(away, on=["Season", "AwayTeam"], how="left", validate="many_to_one")
    return out

@@tests
import pandas as pd

matches = pd.DataFrame({
    "Season": ["S1", "S1", "S2"],
    "HomeTeam": ["A", "B", "A"],
    "AwayTeam": ["B", "C", "C"],
})
ratings = pd.DataFrame({
    "Season": ["S1", "S1", "S1", "S2", "S2"],
    "Team": ["A", "B", "C", "A", "C"],
    "Rating": [1600, 1500, 1450, 1580, 1490],
})

def test_columns_and_rows():
    """Adds both ratings without changing the rows"""
    out = add_ratings(matches, ratings)
    assert len(out) == 3
    assert out["HomeRating"].tolist() == [1600, 1500, 1580]
    assert out["AwayRating"].tolist() == [1500, 1450, 1490]
    assert out["HomeTeam"].tolist() == ["A", "B", "A"]

def test_missing_rating():
    """A team without a rating gets NaN rather than being dropped"""
    m = pd.DataFrame({"Season": ["S2"], "HomeTeam": ["B"], "AwayTeam": ["A"]})
    out = add_ratings(m, ratings)
    assert len(out) == 1 and out["HomeRating"].isna().all()

@@hint
Rename the ratings table's columns to match each side (`Team` → `HomeTeam`, `Rating` → `HomeRating`), then `merge(..., on=["Season", "HomeTeam"], how="left")`. Do the same for the away side.
:::

:::quiz groupby-quiz Quick check
? What's the difference between `agg` and `transform` on a groupby?
- [x] `agg` returns one row per group; `transform` returns a value for every original row
- [ ] They're identical
- [ ] `transform` only works on strings
> Use transform to attach group statistics to each row.

? A `left` merge keeps:
- [x] Every row of the left table
- [ ] Only rows with a match in both
- [ ] Every row of both tables
> Unmatched rows get NaN in the right table's columns.

? After a merge, your table has more rows than before. What's the likely cause?
- [x] The key appears more than once in both tables
- [ ] pandas added a header row
- [ ] The merge used the wrong `how`
> Use `validate="many_to_one"` to catch it.

? What does `melt` do?
- [x] Turns columns into rows (wide to long)
- [ ] Removes duplicate rows
- [ ] Merges two tables
> `pivot_table` goes the other way.
:::
