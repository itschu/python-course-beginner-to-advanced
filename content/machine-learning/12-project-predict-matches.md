---
title: "Project: predict match outcomes"
summary: Engineer leak-free features (Elo ratings and rolling form), split by time, train logistic regression and gradient boosting for home/draw/away, and benchmark the probabilities against base rates and the bookmaker.
minutes: 180
kind: project
---

This is the project the whole course has been building towards: a machine learning model that outputs **probabilities for home win, draw and away win**, trained only on information available before kickoff, and judged honestly against the market.

You'll:

1. Compute **Elo ratings** for every team before every match.
2. Compute **rolling form** features with no peeking.
3. Assemble a dataset and **split by time**: train on two seasons, test on the third.
4. Train and compare models with **log loss**, against base rates and the bookmaker.
5. Interpret what you find.

## Step 1: Elo ratings

You met Elo in Phase 2. Now apply it across three seasons in date order, recording each team's rating **before** the match (so the feature never includes that match's result). Two refinements make it better for football:

- **Home advantage:** add `home_adv` rating points to the home team when computing the expected score.
- **Season carry-over:** at the start of each new season, pull every rating part of the way back towards 1500 (`1500 + carry * (rating - 1500)`), because squads change over the summer.

:::exercise pm-elo Pre-match Elo ratings
Write `add_elo(df, k=20, home_adv=60, carry=0.8)`. `df` is sorted by date. Return a copy with columns `HomeElo` and `AwayElo` (ratings **before** the match) and `EloDiff` (`HomeElo - AwayElo`).

For each match: expected home score $E = 1 / (1 + 10^{(R_A - (R_H + \text{home\_adv}))/400})$; actual score $S$ is 1, 0.5 or 0; then $R_H \mathrel{+}= k(S - E)$ and $R_A \mathrel{-}= k(S - E)$. Teams start at 1500. Apply the carry-over whenever `Season` changes (not before the first season).

@@starter
import pandas as pd

def add_elo(df, k=20, home_adv=60, carry=0.8):
    out = df.copy()
    return out

@@solution
import pandas as pd

def add_elo(df, k=20, home_adv=60, carry=0.8):
    ratings = {}
    season = None
    home_elo, away_elo = [], []
    for row in df.itertuples():
        if row.Season != season:
            if season is not None:
                ratings = {team: 1500 + carry * (r - 1500) for team, r in ratings.items()}
            season = row.Season
        rh = ratings.get(row.HomeTeam, 1500.0)
        ra = ratings.get(row.AwayTeam, 1500.0)
        home_elo.append(rh)
        away_elo.append(ra)
        expected = 1 / (1 + 10 ** ((ra - (rh + home_adv)) / 400))
        actual = 1.0 if row.FTHG > row.FTAG else 0.0 if row.FTHG < row.FTAG else 0.5
        ratings[row.HomeTeam] = rh + k * (actual - expected)
        ratings[row.AwayTeam] = ra - k * (actual - expected)
    out = df.copy()
    out["HomeElo"] = home_elo
    out["AwayElo"] = away_elo
    out["EloDiff"] = out["HomeElo"] - out["AwayElo"]
    return out

@@tests
import numpy as np
import pandas as pd

def load():
    return pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)

def test_first_matches():
    """Everyone starts at 1500"""
    out = add_elo(load())
    assert (out.loc[:9, ["HomeElo", "AwayElo"]] == 1500).all().all()

def test_pre_match():
    """Ratings are recorded before each match"""
    tiny = pd.DataFrame({"Season": ["S1", "S1"], "HomeTeam": ["A", "A"], "AwayTeam": ["B", "B"], "FTHG": [2, 0], "FTAG": [0, 0]})
    out = add_elo(tiny, k=20, home_adv=0)
    assert out.loc[0, "HomeElo"] == 1500 and np.isclose(out.loc[1, "HomeElo"], 1510)
    assert np.isclose(out.loc[1, "EloDiff"], 20)

def test_carry_over():
    """Ratings regress towards 1500 between seasons"""
    tiny = pd.DataFrame({"Season": ["S1", "S2"], "HomeTeam": ["A", "A"], "AwayTeam": ["B", "B"], "FTHG": [2, 0], "FTAG": [0, 0]})
    out = add_elo(tiny, k=20, home_adv=0, carry=0.5)
    assert np.isclose(out.loc[1, "HomeElo"], 1505)

def test_predictive():
    """Higher EloDiff goes with more home wins"""
    out = add_elo(load())
    late = out[out["Season"] != "2022-23"]
    top = late[late["EloDiff"] > late["EloDiff"].quantile(0.75)]
    bottom = late[late["EloDiff"] < late["EloDiff"].quantile(0.25)]
    assert (top["FTR"] == "H").mean() > (bottom["FTR"] == "H").mean() + 0.15
:::

## Step 2: Rolling form

:::exercise pm-form Leak-free form features
Write `add_form(df, window=6)`. `df` is sorted by date with a fresh 0..n-1 index. Return a copy with six new columns: `HomeForm`, `AwayForm` (average points per match), `HomeGF`, `AwayGF` (average goals scored) and `HomeGA`, `AwayGA` (average goals conceded), each over that team's previous `window` matches **at any venue**, not including the current match. Use `min_periods=3` (NaN before a team has 3 previous matches).

Follow the Phase 3 recipe: one row per team per match, `groupby("Team")` then `shift(1).rolling(...)`, then pivot back to one row per match.

@@starter
import pandas as pd

def add_form(df, window=6):
    out = df.copy()
    return out

@@solution
import pandas as pd

def add_form(df, window=6):
    out = df.copy()
    out["MatchId"] = out.index
    home = pd.DataFrame({"MatchId": out["MatchId"], "Date": out["Date"], "Team": out["HomeTeam"],
                         "GF": out["FTHG"], "GA": out["FTAG"], "Side": "Home"})
    away = pd.DataFrame({"MatchId": out["MatchId"], "Date": out["Date"], "Team": out["AwayTeam"],
                         "GF": out["FTAG"], "GA": out["FTHG"], "Side": "Away"})
    long = pd.concat([home, away]).sort_values(["Team", "Date", "MatchId"])
    long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
    grouped = long.groupby("Team")
    for name, col in [("Form", "Pts"), ("GF", "GF"), ("GA", "GA")]:
        long[f"roll_{name}"] = grouped[col].transform(lambda s: s.shift(1).rolling(window, min_periods=3).mean())
    for name in ["Form", "GF", "GA"]:
        wide = long.pivot(index="MatchId", columns="Side", values=f"roll_{name}")
        out[f"Home{name}"] = wide["Home"]
        out[f"Away{name}"] = wide["Away"]
    return out.drop(columns="MatchId")

@@tests
import numpy as np
import pandas as pd

def load():
    return pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)

def team_history(df, team):
    rows = []
    for _, r in df.iterrows():
        if r["HomeTeam"] == team:
            rows.append((r.name, r["FTHG"], r["FTAG"]))
        elif r["AwayTeam"] == team:
            rows.append((r.name, r["FTAG"], r["FTHG"]))
    return rows

def test_columns():
    """Adds the six columns"""
    out = add_form(load())
    for c in ["HomeForm", "AwayForm", "HomeGF", "AwayGF", "HomeGA", "AwayGA"]:
        assert c in out.columns, f"missing {c}"

def test_values_for_one_team():
    """Matches a manual calculation using previous matches only"""
    df = load()
    out = add_form(df, window=6)
    hist = team_history(df, "Ashford City")
    idx, gf, ga = hist[10]
    prev = hist[4:10]
    pts = [3 if f > a else 1 if f == a else 0 for _, f, a in prev]
    side = "Home" if df.loc[idx, "HomeTeam"] == "Ashford City" else "Away"
    assert np.isclose(out.loc[idx, f"{side}Form"], np.mean(pts))
    assert np.isclose(out.loc[idx, f"{side}GF"], np.mean([f for _, f, _ in prev]))

def test_min_periods():
    """NaN until three previous matches"""
    out = add_form(load())
    assert out.loc[0, ["HomeForm", "AwayForm"]].isna().all()
:::

## Step 3: Assemble and split by time

:::exercise pm-split Build the dataset
Write `build_dataset(path)` that loads the CSV (dates parsed), sorts by `Date` then `HomeTeam`, resets the index, and applies `add_elo` and `add_form` (both are provided in the starter), then drops rows with any missing feature among `FEATURES`.

Then write `time_split(data, test_season)` returning `(train, test)`: `test` is the given season; `train` is every **earlier** season (compare the `Season` strings, which sort chronologically).

@@starter
import pandas as pd

FEATURES = ["EloDiff", "HomeForm", "AwayForm", "HomeGF", "AwayGF", "HomeGA", "AwayGA"]

def add_elo(df, k=20, home_adv=60, carry=0.8):
    ratings, season, he, ae = {}, None, [], []
    for row in df.itertuples():
        if row.Season != season:
            if season is not None:
                ratings = {t: 1500 + carry * (r - 1500) for t, r in ratings.items()}
            season = row.Season
        rh, ra = ratings.get(row.HomeTeam, 1500.0), ratings.get(row.AwayTeam, 1500.0)
        he.append(rh)
        ae.append(ra)
        e = 1 / (1 + 10 ** ((ra - (rh + home_adv)) / 400))
        s = 1.0 if row.FTHG > row.FTAG else 0.0 if row.FTHG < row.FTAG else 0.5
        ratings[row.HomeTeam], ratings[row.AwayTeam] = rh + k * (s - e), ra - k * (s - e)
    out = df.copy()
    out["HomeElo"], out["AwayElo"] = he, ae
    out["EloDiff"] = out["HomeElo"] - out["AwayElo"]
    return out

def add_form(df, window=6):
    out = df.copy()
    out["MatchId"] = out.index
    home = pd.DataFrame({"MatchId": out.index, "Date": out["Date"], "Team": out["HomeTeam"], "GF": out["FTHG"], "GA": out["FTAG"], "Side": "Home"})
    away = pd.DataFrame({"MatchId": out.index, "Date": out["Date"], "Team": out["AwayTeam"], "GF": out["FTAG"], "GA": out["FTHG"], "Side": "Away"})
    long = pd.concat([home, away]).sort_values(["Team", "Date", "MatchId"])
    long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
    g = long.groupby("Team")
    for name, col in [("Form", "Pts"), ("GF", "GF"), ("GA", "GA")]:
        long[name] = g[col].transform(lambda s: s.shift(1).rolling(window, min_periods=3).mean())
        wide = long.pivot(index="MatchId", columns="Side", values=name)
        out[f"Home{name}"], out[f"Away{name}"] = wide["Home"], wide["Away"]
    return out.drop(columns="MatchId")

def build_dataset(path):
    return pd.DataFrame()

def time_split(data, test_season):
    return data, data

@@solution
import pandas as pd

FEATURES = ["EloDiff", "HomeForm", "AwayForm", "HomeGF", "AwayGF", "HomeGA", "AwayGA"]

def add_elo(df, k=20, home_adv=60, carry=0.8):
    ratings, season, he, ae = {}, None, [], []
    for row in df.itertuples():
        if row.Season != season:
            if season is not None:
                ratings = {t: 1500 + carry * (r - 1500) for t, r in ratings.items()}
            season = row.Season
        rh, ra = ratings.get(row.HomeTeam, 1500.0), ratings.get(row.AwayTeam, 1500.0)
        he.append(rh)
        ae.append(ra)
        e = 1 / (1 + 10 ** ((ra - (rh + home_adv)) / 400))
        s = 1.0 if row.FTHG > row.FTAG else 0.0 if row.FTHG < row.FTAG else 0.5
        ratings[row.HomeTeam], ratings[row.AwayTeam] = rh + k * (s - e), ra - k * (s - e)
    out = df.copy()
    out["HomeElo"], out["AwayElo"] = he, ae
    out["EloDiff"] = out["HomeElo"] - out["AwayElo"]
    return out

def add_form(df, window=6):
    out = df.copy()
    out["MatchId"] = out.index
    home = pd.DataFrame({"MatchId": out.index, "Date": out["Date"], "Team": out["HomeTeam"], "GF": out["FTHG"], "GA": out["FTAG"], "Side": "Home"})
    away = pd.DataFrame({"MatchId": out.index, "Date": out["Date"], "Team": out["AwayTeam"], "GF": out["FTAG"], "GA": out["FTHG"], "Side": "Away"})
    long = pd.concat([home, away]).sort_values(["Team", "Date", "MatchId"])
    long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
    g = long.groupby("Team")
    for name, col in [("Form", "Pts"), ("GF", "GF"), ("GA", "GA")]:
        long[name] = g[col].transform(lambda s: s.shift(1).rolling(window, min_periods=3).mean())
        wide = long.pivot(index="MatchId", columns="Side", values=name)
        out[f"Home{name}"], out[f"Away{name}"] = wide["Home"], wide["Away"]
    return out.drop(columns="MatchId")

def build_dataset(path):
    df = pd.read_csv(path, parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
    data = add_form(add_elo(df))
    return data.dropna(subset=FEATURES)

def time_split(data, test_season):
    train = data[data["Season"] < test_season]
    test = data[data["Season"] == test_season]
    return train, test

@@tests
def test_dataset():
    """Builds a dataset without missing features"""
    data = build_dataset("data/matches.csv")
    assert data[FEATURES].isna().sum().sum() == 0
    assert 1000 < len(data) < 1140, len(data)
    assert data["Date"].is_monotonic_increasing

def test_split():
    """Test is one season; train is strictly earlier"""
    data = build_dataset("data/matches.csv")
    train, test = time_split(data, "2024-25")
    assert set(test["Season"]) == {"2024-25"}
    assert set(train["Season"]) == {"2022-23", "2023-24"}
    assert train["Date"].max() < test["Date"].min()
    train2, _ = time_split(data, "2023-24")
    assert set(train2["Season"]) == {"2022-23"}
:::

## Step 4: Train and compare

:::exercise pm-evaluate Compare models by log loss
Write `evaluate(train, test, feature_sets)`. `feature_sets` is a dictionary like `{"elo": ["EloDiff"], "all": FEATURES}`. Return a dictionary of **test log losses** (rounded to 4 decimals) with these keys:

- `"base_rates"`: every test match gets the training share of A, D and H
- one key per feature set: a pipeline of `StandardScaler()` and `LogisticRegression(max_iter=1000)` trained on that feature set
- `"market"`: the bookmaker's margin-free probabilities

Use `sklearn.metrics.log_loss(y_true, probs, labels=["A", "D", "H"])`, and make sure your probability columns are in the order A, D, H (that's the order of `model.classes_`).

@@starter
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

LABELS = ["A", "D", "H"]

def evaluate(train, test, feature_sets):
    return {}

@@solution
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

LABELS = ["A", "D", "H"]

def evaluate(train, test, feature_sets):
    y_train, y_test = train["FTR"], test["FTR"]
    results = {}
    base = np.tile([(y_train == label).mean() for label in LABELS], (len(test), 1))
    results["base_rates"] = round(log_loss(y_test, base, labels=LABELS), 4)
    for name, features in feature_sets.items():
        model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
        model.fit(train[features], y_train)
        results[name] = round(log_loss(y_test, model.predict_proba(test[features]), labels=LABELS), 4)
    implied = 1 / test[["AvgA", "AvgD", "AvgH"]].to_numpy()
    market = implied / implied.sum(axis=1, keepdims=True)
    results["market"] = round(log_loss(y_test, market, labels=LABELS), 4)
    return results

@@tests
import numpy as np
import pandas as pd

def tiny():
    rng = np.random.default_rng(0)
    n = 400
    x = rng.normal(size=n)
    p_home = 1 / (1 + np.exp(-(0.2 + 1.2 * x)))
    ftr = np.where(rng.random(n) < p_home, "H", np.where(rng.random(n) < 0.5, "D", "A"))
    odds_h = 1 / np.clip(p_home * 1.05, 0.05, 0.95)
    df = pd.DataFrame({"x": x, "noise": rng.normal(size=n), "FTR": ftr,
                       "AvgH": odds_h, "AvgD": 3.5, "AvgA": 4.0})
    return df.iloc[:300], df.iloc[300:]

def test_keys():
    """Returns base rates, each feature set and the market"""
    train, test = tiny()
    out = evaluate(train, test, {"x": ["x"], "noise": ["noise"]})
    assert set(out) == {"base_rates", "x", "noise", "market"}, set(out)

def test_signal_beats_noise():
    """A real feature beats a noise feature and base rates"""
    train, test = tiny()
    out = evaluate(train, test, {"x": ["x"], "noise": ["noise"]})
    assert out["x"] < out["base_rates"] and out["x"] < out["noise"], out

def test_base_rate_value():
    """Base rates are computed from the training data"""
    from sklearn.metrics import log_loss
    train, test = tiny()
    base = np.tile([(train["FTR"] == l).mean() for l in ["A", "D", "H"]], (len(test), 1))
    assert evaluate(train, test, {})["base_rates"] == round(log_loss(test["FTR"], base, labels=["A", "D", "H"]), 4)
:::

## Step 5: Run it and interpret

Put it all together, and add gradient boosting for comparison:

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

LABELS = ["A", "D", "H"]
FEATURES = ["EloDiff", "HomeForm", "AwayForm", "HomeGF", "AwayGF", "HomeGA", "AwayGA"]

df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)

# Elo (pre-match)
ratings, season, he, ae = {}, None, [], []
for row in df.itertuples():
    if row.Season != season:
        if season is not None:
            ratings = {t: 1500 + 0.8 * (r - 1500) for t, r in ratings.items()}
        season = row.Season
    rh, ra = ratings.get(row.HomeTeam, 1500.0), ratings.get(row.AwayTeam, 1500.0)
    he.append(rh)
    ae.append(ra)
    e = 1 / (1 + 10 ** ((ra - (rh + 60)) / 400))
    s = 1.0 if row.FTHG > row.FTAG else 0.0 if row.FTHG < row.FTAG else 0.5
    ratings[row.HomeTeam], ratings[row.AwayTeam] = rh + 20 * (s - e), ra - 20 * (s - e)
df["EloDiff"] = np.array(he) - np.array(ae)

# Form (previous 6 matches, any venue)
home = pd.DataFrame({"MatchId": df.index, "Date": df["Date"], "Team": df["HomeTeam"], "GF": df["FTHG"], "GA": df["FTAG"], "Side": "Home"})
away = pd.DataFrame({"MatchId": df.index, "Date": df["Date"], "Team": df["AwayTeam"], "GF": df["FTAG"], "GA": df["FTHG"], "Side": "Away"})
long = pd.concat([home, away]).sort_values(["Team", "Date", "MatchId"])
long["Pts"] = (long["GF"] > long["GA"]) * 3 + (long["GF"] == long["GA"]) * 1
for name, col in [("Form", "Pts"), ("GF", "GF"), ("GA", "GA")]:
    long[name] = long.groupby("Team")[col].transform(lambda s: s.shift(1).rolling(6, min_periods=3).mean())
    wide = long.pivot(index="MatchId", columns="Side", values=name)
    df[f"Home{name}"], df[f"Away{name}"] = wide["Home"], wide["Away"]

data = df.dropna(subset=FEATURES)
train, test = data[data["Season"] < "2024-25"], data[data["Season"] == "2024-25"]

def score(probs):
    return log_loss(test["FTR"], probs, labels=LABELS)

results = {"base rates": score(np.tile([(train["FTR"] == l).mean() for l in LABELS], (len(test), 1)))}
for name, feats in [("logistic: Elo only", ["EloDiff"]), ("logistic: all features", FEATURES)]:
    m = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(train[feats], train["FTR"])
    results[name] = score(m.predict_proba(test[feats]))
hgb = HistGradientBoostingClassifier(learning_rate=0.03, max_iter=300, max_depth=3, min_samples_leaf=40, random_state=0)
results["gradient boosting: all features"] = score(hgb.fit(train[FEATURES], train["FTR"]).predict_proba(test[FEATURES]))
implied = 1 / test[["AvgA", "AvgD", "AvgH"]].to_numpy()
results["bookmaker"] = score(implied / implied.sum(axis=1, keepdims=True))

print(f"train {len(train)} matches, test {len(test)} matches\n")
for name, value in sorted(results.items(), key=lambda kv: kv[1]):
    print(f"{name:>32}: {value:.4f}")
```

Typical findings, and what they teach:

1. **The Elo-only logistic regression beats base rates.** Elo is a compact, well-designed summary of team strength, and that one feature carries most of the signal.
2. **Adding all the form features makes it slightly *worse*.** With only around 700 training matches, extra noisy features let the model fit noise. More features are not automatically better.
3. **Gradient boosting does worst of the models.** Flexible models need lots of data. On small, noisy problems, simple linear models usually win.
4. **The bookmaker is best.** The market aggregates far more information than your features do.

This is what real sports modelling looks like. Beating base rates is achievable; beating the market is very hard. If your model ever *does* beat it in a backtest, suspect leakage first.

## Step 6: Where to go from here

Ideas to try (and Phase 6 covers several):

- **Tune** Elo's `k`, `home_adv` and `carry` on a validation season (not the test season!).
- **Regularise more** (smaller `C`) when using many features.
- Use the **market probabilities as a feature** and see whether your features add anything on top of the market. (Spoiler: it's harder than you'd think to even match the market this way with so little data.)
- **Calibrate** the probabilities and evaluate a **betting strategy** with a proper walk-forward backtest (Phase 6).
- Use **more data**: download several real seasons from Football-Data.co.uk. More data helps every model, and especially the flexible ones.

:::tip Portfolio piece
Write this project up in a GitHub repository with a clear README: the question, the data, the features (and how you avoided leakage), the results table, and honest conclusions. A well-documented project that reports "my model doesn't beat the market, and here's how I know" impresses experienced data scientists far more than a suspiciously profitable backtest.
:::
