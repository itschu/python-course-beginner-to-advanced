---
title: Filtering, conditions and text columns
summary: Ask precise questions of your data with boolean filters, query, isin and the .str and .dt accessors.
minutes: 45
kind: lesson
---

Most analysis is asking questions: *How do teams do as heavy favourites? Which matches had more than 30 shots?* Filtering is how you ask them.

## Boolean filtering

Exactly like NumPy masks: build a True/False Series, then index with it:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")

heavy_favourites = df[df["AvgH"] < 1.5]
print(len(heavy_favourites), "matches with home odds under 1.5")
print(f"They won {(heavy_favourites['FTR'] == 'H').mean():.1%} of the time")
print(f"Implied by the odds: {(1 / heavy_favourites['AvgH']).mean():.1%}")
```

Combine conditions with `&` (and), `|` (or) and `~` (not), each in parentheses:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")

big_games = df[(df["FTHG"] + df["FTAG"] >= 5) & (df["Season"] == "2024-25")]
print(big_games[["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]])

not_draws = df[~(df["FTR"] == "D")]
print(len(not_draws), "matches weren't draws")
```

## Useful helpers

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")

rivals = ["Ashford City", "Bramley Rovers"]
print(len(df[df["HomeTeam"].isin(rivals)]), "home games for the two rivals")

mid_priced = df[df["AvgH"].between(2.0, 3.0)]          # inclusive at both ends
print(len(mid_priced), "home prices between 2.0 and 3.0")

# query() lets you write conditions as a string, which can be more readable
print(df.query("FTHG >= 4 and AvgH > 3").shape)
team = "Ashford City"
print(df.query("HomeTeam == @team")["FTHG"].mean())   # @ refers to a Python variable
```

## Setting values with loc

To change values for the rows that match a condition, use `loc[rows, column]` in a **single** step:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
df["Fav"] = "Away"
df.loc[df["AvgH"] < df["AvgA"], "Fav"] = "Home"
print(df["Fav"].value_counts())
```

:::warning Don't chain indexing when assigning
`df[df["AvgH"] < 2]["Fav"] = "Home"` looks reasonable but does nothing: the first `[...]` creates a new object (a copy, under pandas 3's copy-on-write rules) and the assignment changes that copy. pandas will warn you. Always use `df.loc[condition, "column"] = value`.
:::

## Text columns: the .str accessor

String methods for a whole column live under `.str`:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
teams = pd.Series(df["HomeTeam"].unique())

print(teams[teams.str.contains("City")].tolist())
print(teams[teams.str.startswith("B")].tolist())
print(teams.str.upper().head(3).tolist())
print(teams.str.split(" ").str[0].head(3).tolist())   # first word of each name
print(teams.str.len().max(), "characters in the longest name")
```

## Dates: the .dt accessor

Once a column holds real dates, `.dt` gives you their parts:

```python
import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
df["Weekday"] = df["Date"].dt.day_name()
df["Month"] = df["Date"].dt.month

print(df["Weekday"].value_counts())
december = df[df["Date"].dt.month == 12]
print(len(december), "December matches")
print(df[(df["Date"] >= "2024-01-01") & (df["Date"] < "2024-02-01")].shape)   # compare with date strings
```

## Practice

:::exercise filt-favourites How reliable are favourites?
Complete `favourite_report(df, max_odds)`. For home teams priced **below** `max_odds`, return a dictionary:

- `"matches"`: how many such matches
- `"win_rate"`: how often they won, rounded to 3 decimals
- `"implied"`: the average implied probability `1 / AvgH` for those matches, rounded to 3 decimals

@@starter
import pandas as pd

def favourite_report(df, max_odds):
    return {}

@@solution
import pandas as pd

def favourite_report(df, max_odds):
    favs = df[df["AvgH"] < max_odds]
    return {
        "matches": len(favs),
        "win_rate": round((favs["FTR"] == "H").mean(), 3),
        "implied": round((1 / favs["AvgH"]).mean(), 3),
    }

@@tests
import pandas as pd

def test_report():
    """Reports on home favourites"""
    df = pd.read_csv("data/matches.csv")
    favs = df[df["AvgH"] < 1.6]
    exp = {"matches": len(favs), "win_rate": round((favs["FTR"] == "H").mean(), 3), "implied": round((1 / favs["AvgH"]).mean(), 3)}
    assert favourite_report(df, 1.6) == exp, f"got {favourite_report(df, 1.6)}, expected {exp}"

def test_other_threshold():
    """Works for another threshold"""
    df = pd.read_csv("data/matches.csv")
    assert favourite_report(df, 2.0)["matches"] == int((df["AvgH"] < 2.0).sum())
:::

:::exercise filt-team A team's matches
Complete `team_matches(df, team)`. Return all matches the team played, **home or away**, sorted by date (oldest first), with an extra column `"Venue"` that is `"H"` when the team was at home and `"A"` when away. Keep the original index labels.

@@starter
import pandas as pd

def team_matches(df, team):
    return df

@@solution
import pandas as pd

def team_matches(df, team):
    played = df[(df["HomeTeam"] == team) | (df["AwayTeam"] == team)].copy()
    played["Venue"] = "A"
    played.loc[played["HomeTeam"] == team, "Venue"] = "H"
    return played.sort_values("Date")

@@tests
import pandas as pd

def test_count():
    """Each team plays 38 matches a season"""
    df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
    got = team_matches(df, "Ashford City")
    assert len(got) == 114, f"got {len(got)} matches, expected 114 (38 × 3 seasons)"

def test_venue():
    """Venue is H at home and A away"""
    df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
    got = team_matches(df, "Ashford City")
    assert (got.loc[got["Venue"] == "H", "HomeTeam"] == "Ashford City").all()
    assert (got.loc[got["Venue"] == "A", "AwayTeam"] == "Ashford City").all()
    assert set(got["Venue"]) == {"H", "A"}

def test_sorted():
    """Sorted by date"""
    df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
    got = team_matches(df, "Fairhaven FC")
    assert got["Date"].is_monotonic_increasing

@@hint
Filter with `|` for home or away, then `.copy()` before adding a column. Set every row to "A", then use `loc` to set the home rows to "H".
:::

:::exercise filt-weekend Weekend goals
Complete `goals_by_weekday(df)`. `df` has a `Date` column of real dates. Return a Series of the **average total goals** per match for each weekday name (e.g. `"Saturday"`), rounded to 2 decimals, sorted from highest to lowest.

You'll need `groupby`, which the next lessons cover in depth: `df.groupby("Weekday")["Total"].mean()` gives one average per weekday.

@@starter
import pandas as pd

def goals_by_weekday(df):
    df = df.copy()
    return pd.Series(dtype=float)

@@solution
import pandas as pd

def goals_by_weekday(df):
    df = df.copy()
    df["Weekday"] = df["Date"].dt.day_name()
    df["Total"] = df["FTHG"] + df["FTAG"]
    return df.groupby("Weekday")["Total"].mean().round(2).sort_values(ascending=False)

@@tests
import pandas as pd

def test_weekdays():
    """Averages goals for each weekday"""
    df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
    got = goals_by_weekday(df)
    exp = (df.assign(W=df["Date"].dt.day_name(), T=df["FTHG"] + df["FTAG"]).groupby("W")["T"].mean().round(2).sort_values(ascending=False))
    assert set(got.index) == {"Saturday", "Sunday"}, f"weekdays found: {list(got.index)}"
    assert got.tolist() == exp.tolist()
    assert got.is_monotonic_decreasing
:::

:::quiz filtering-quiz Quick check
? Which correctly selects home wins in the 2024-25 season?
- [ ] `df[df["FTR"] == "H" and df["Season"] == "2024-25"]`
- [x] `df[(df["FTR"] == "H") & (df["Season"] == "2024-25")]`
- [ ] `df["FTR" == "H"]`
> Use `&` with parentheses around each condition.

? What's the right way to set a column for some rows?
- [ ] `df[df["x"] > 0]["y"] = 1`
- [x] `df.loc[df["x"] > 0, "y"] = 1`
> Chained indexing modifies a temporary copy.

? What does `df["Team"].str.contains("City")` return?
- [x] A boolean Series
- [ ] The rows containing "City"
- [ ] The number of matches
> Use it inside `df[...]` to filter rows.

? Is `between(2.0, 3.0)` inclusive of 2.0 and 3.0?
- [x] Yes, by default both ends are included
- [ ] No
> You can change it with `inclusive="left"`, `"right"` or `"neither"`.
:::
