---
title: Validating models on time-ordered data
summary: Why shuffled cross-validation lies on time series, TimeSeriesSplit with gaps, and walk-forward evaluation that mimics how a model is really used.
minutes: 50
kind: lesson
---

Everything in Phase 5 assumed rows were independent, so shuffling them was harmless. For time-ordered data (prices, matches, sales, sensor readings) shuffling is a disaster: the model trains on the future and is tested on the past. This is the single most common reason that trading and betting backtests look brilliant and then lose money live.

## A demonstration

Let's predict whether a currency will rise over the **next 20 days**, using momentum and volatility features. Each label overlaps with its neighbours' labels: today's "next 20 days" shares 19 days with tomorrow's.

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import KFold, TimeSeriesSplit, cross_val_score

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
r = np.log(fx["Close"]).diff()
data = pd.DataFrame({
    "mom5": r.rolling(5).sum(),
    "mom20": r.rolling(20).sum(),
    "mom60": r.rolling(60).sum(),
    "vol20": r.rolling(20).std(),
})
data["target"] = (r.rolling(20).sum().shift(-20) > 0).astype(int)     # up over the next 20 days?
data = data.dropna().iloc[:-20]
X, y = data.drop(columns="target"), data["target"]

model = RandomForestClassifier(n_estimators=200, min_samples_leaf=20, random_state=0)
shuffled = cross_val_score(model, X, y, cv=KFold(5, shuffle=True, random_state=0)).mean()
ordered = cross_val_score(model, X, y, cv=TimeSeriesSplit(5, gap=20)).mean()
print(f"always guess the majority: {max(y.mean(), 1 - y.mean()):.1%}")
print(f"shuffled 5-fold CV:        {shuffled:.1%}")
print(f"time-ordered CV:           {ordered:.1%}")
```

Shuffled cross-validation reports an impressive accuracy. Time-ordered validation shows the model is useless, worse even than always guessing the majority. The prices here are simulated as a random walk, so there's genuinely nothing to predict: the "skill" in the shuffled score is pure leakage. Neighbouring days have nearly identical features *and* nearly identical labels, so a shuffled test row almost always has a near-twin in the training set.

## TimeSeriesSplit

`TimeSeriesSplit` always trains on earlier rows and tests on the rows that follow, expanding the training window each time:

```python
import numpy as np
from sklearn.model_selection import TimeSeriesSplit

X = np.arange(20)
for fold, (train_idx, test_idx) in enumerate(TimeSeriesSplit(n_splits=4, gap=2).split(X)):
    print(f"fold {fold}: train {train_idx.min()}-{train_idx.max()}, test {test_idx.min()}-{test_idx.max()}")
```

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.model_selection import TimeSeriesSplit

n = 100
fig, ax = plt.subplots(figsize=(8, 2.6))
for fold, (tr, te) in enumerate(TimeSeriesSplit(n_splits=5, gap=5).split(np.arange(n))):
    ax.scatter(tr, [fold] * len(tr), marker="s", s=12, color="#2563eb")
    ax.scatter(te, [fold] * len(te), marker="s", s=12, color="#f59e0b")
ax.set_yticks(range(5), [f"fold {i}" for i in range(5)])
ax.set_xlabel("time →  (blue: train, orange: test, gap between them)")
ax.set_title("TimeSeriesSplit")
fig.tight_layout()
plt.show()
```

The **gap** (sometimes called an embargo) drops rows between training and test. Use it when labels look into the future (like our 20-day label) or when features are computed over windows: a gap at least as long as the label horizon stops overlap leaking information.

## Walk-forward evaluation

The most realistic evaluation simulates exactly how you'd use the model: at each point in time, train on everything available, predict the next period, then move forward and repeat. That's **walk-forward** (or rolling-origin) evaluation:

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
df["ImpliedHome"] = (1 / df["AvgH"]) / (1 / df["AvgH"] + 1 / df["AvgD"] + 1 / df["AvgA"])
df["HomeWin"] = (df["FTR"] == "H").astype(int)

predictions = []
test = df[df["Season"] == "2024-25"]
for month, chunk in test.groupby(test["Date"].dt.to_period("M")):
    history = df[df["Date"] < chunk["Date"].min()]              # only what was known before this month
    model = LogisticRegression().fit(history[["ImpliedHome"]], history["HomeWin"])
    predictions.append(pd.Series(model.predict_proba(chunk[["ImpliedHome"]])[:, 1], index=chunk.index))
    print(f"{month}: trained on {len(history):>4} matches, predicted {len(chunk):>2}")

p = pd.concat(predictions)
print(f"walk-forward log loss: {log_loss(test['HomeWin'], p):.4f}")
```

Retraining monthly is a choice: retrain more often and the model adapts faster but costs more compute; less often and it goes stale. Pick the schedule you'd actually run in production, and evaluate with that same schedule.

### Expanding or rolling windows?

- **Expanding window:** train on all history. More data, but old data may no longer be relevant.
- **Rolling window:** train on only the last N periods. Adapts to change, but uses less data.
- **Time-weighted:** use all history but give recent rows more weight (`sample_weight`). Often the best of both, and you'll use it for the goal model later in this phase.

## Rules for honest time-series evaluation

1. **Never shuffle** time-ordered data across your train/test boundary.
2. **Features may only use information available at prediction time.** Check every feature's timestamp.
3. **Use a gap** when labels or features span windows.
4. **Evaluate the way you'll deploy:** same retraining schedule, same data delays.
5. **Hold out the most recent period** as a final test, untouched until the end.
6. **Expect worse results live** than in even the most careful backtest. Markets adapt, and you made many choices along the way.

## Practice

:::exercise tsv-compare Shuffled versus ordered
Write `cv_comparison(X, y, model, n_splits, gap)` returning a dictionary with the mean accuracy from `"shuffled"` (`KFold(n_splits, shuffle=True, random_state=0)`) and `"ordered"` (`TimeSeriesSplit(n_splits, gap=gap)`) cross-validation, each rounded to 3 decimals.

@@starter
from sklearn.model_selection import KFold, TimeSeriesSplit, cross_val_score

def cv_comparison(X, y, model, n_splits, gap):
    return {"shuffled": 0.0, "ordered": 0.0}

@@solution
from sklearn.model_selection import KFold, TimeSeriesSplit, cross_val_score

def cv_comparison(X, y, model, n_splits, gap):
    shuffled = cross_val_score(model, X, y, cv=KFold(n_splits, shuffle=True, random_state=0)).mean()
    ordered = cross_val_score(model, X, y, cv=TimeSeriesSplit(n_splits, gap=gap)).mean()
    return {"shuffled": round(float(shuffled), 3), "ordered": round(float(ordered), 3)}

@@tests
import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier

def test_overlapping_labels():
    """Shuffling inflates accuracy when labels overlap in time"""
    fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
    r = np.log(fx["Close"]).diff()
    d = pd.DataFrame({"mom5": r.rolling(5).sum(), "mom20": r.rolling(20).sum(),
                      "mom60": r.rolling(60).sum(), "vol20": r.rolling(20).std()})
    d["y"] = (r.rolling(20).sum().shift(-20) > 0).astype(int)
    d = d.dropna().iloc[:-20]
    out = cv_comparison(d.drop(columns="y"), d["y"], DecisionTreeClassifier(max_depth=8, random_state=0), 5, 20)
    assert out["shuffled"] > out["ordered"] + 0.08, out
:::

:::exercise tsv-walk A walk-forward loop
Write `walk_forward(df, feature, target, test_mask, freq="M")`. For each period (use `df.loc[test_mask, "Date"].dt.to_period(freq)` to group the test rows), fit `LogisticRegression()` on all rows **dated before** that period's first date, then predict the probability of class 1 for the period's rows. Return a Series of probabilities indexed like the test rows.

@@starter
import pandas as pd
from sklearn.linear_model import LogisticRegression

def walk_forward(df, feature, target, test_mask, freq="M"):
    return pd.Series(dtype=float)

@@solution
import pandas as pd
from sklearn.linear_model import LogisticRegression

def walk_forward(df, feature, target, test_mask, freq="M"):
    test = df[test_mask]
    parts = []
    for _, chunk in test.groupby(test["Date"].dt.to_period(freq)):
        history = df[df["Date"] < chunk["Date"].min()]
        model = LogisticRegression().fit(history[[feature]], history[target])
        parts.append(pd.Series(model.predict_proba(chunk[[feature]])[:, 1], index=chunk.index))
    return pd.concat(parts)

@@tests
import numpy as np
import pandas as pd

def data():
    df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
    df["Imp"] = 1 / df["AvgH"]
    df["Win"] = (df["FTR"] == "H").astype(int)
    return df

def test_shape_and_index():
    """One prediction per test row"""
    df = data()
    mask = df["Season"] == "2024-25"
    p = walk_forward(df, "Imp", "Win", mask)
    assert len(p) == mask.sum() and set(p.index) == set(df.index[mask])
    assert p.between(0, 1).all()

def test_no_future_data():
    """Each period's model uses only earlier matches"""
    df = data()
    mask = df["Season"] == "2024-25"
    p1 = walk_forward(df, "Imp", "Win", mask)
    tampered = df.copy()
    tampered.loc[tampered.index[-50:], "Win"] = 1 - tampered.loc[tampered.index[-50:], "Win"]
    p2 = walk_forward(tampered, "Imp", "Win", mask)
    first = df.loc[mask, "Date"].dt.to_period("M").min()
    early = df.loc[mask & (df["Date"].dt.to_period("M") == first)].index
    assert np.allclose(p1[early], p2[early]), "changing future results must not change earlier predictions"
:::

:::quiz tsv-quiz Quick check
? Why does shuffled k-fold CV overestimate performance on time series?
- [x] Test rows have near-identical neighbours (in time) in the training set, so future information leaks in
- [ ] It uses too little data
- [ ] It can't handle dates
> Especially with overlapping labels or windowed features.

? What does the `gap` in TimeSeriesSplit do?
- [x] Leaves out rows between training and test to stop overlapping windows leaking
- [ ] Skips every other row
- [ ] Adds missing dates
> Set it at least as long as your label horizon.

? In walk-forward evaluation, when predicting March, the model is trained on:
- [x] Data available before March
- [ ] All data including March
- [ ] Only data from March
> That's exactly how it would be used live.

? A rolling training window (last N months only) is most useful when:
- [x] The underlying patterns change over time
- [ ] You have very little data
- [ ] The data never changes
> Old data may describe a world that no longer exists.
:::
