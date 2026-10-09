---
title: Calibration and blending with the market
summary: Diagnose and fix overconfident probabilities with Platt scaling and isotonic regression, remove the bookmaker's margin properly, and blend your model with the market to beat both.
minutes: 55
kind: lesson
---

For betting, the **probability** is the product. A model that says 60% when the truth is 50% will see value everywhere and bet far too often and too big. Two techniques make probabilities more trustworthy: **calibration** fixes systematic over- or under-confidence, and **blending** combines your model with the market's own forecast.

To save refitting the goal model in your browser, `data/poisson_predictions.csv` contains its walk-forward predictions from the previous lesson for the 2023-24 and 2024-25 seasons. Each row was predicted using only matches played before that month.

```python
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])
print(preds[["Date", "HomeTeam", "AwayTeam", "FTR", "AvgH", "pH", "pD", "pA"]].head().to_string())
print(preds.groupby("Season").size())
```

## Reliability diagrams

Group predictions into bins and compare the average predicted probability with the observed frequency:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv")
implied = 1 / preds[["AvgH", "AvgD", "AvgA"]]
preds["MktH"] = implied["AvgH"] / implied.sum(axis=1)
preds["HomeWin"] = (preds["FTR"] == "H").astype(int)

def reliability(p, y, bins):
    groups = pd.cut(p, bins)
    table = pd.DataFrame({"p": p, "y": y}).groupby(groups, observed=True).agg(forecast=("p", "mean"), observed=("y", "mean"), n=("y", "size"))
    return table[table["n"] >= 15]

bins = np.linspace(0.1, 0.8, 8)
fig, ax = plt.subplots(figsize=(5, 5))
ax.plot([0, 1], [0, 1], "--", color="grey")
for name, col in [("goal model", "pH"), ("market", "MktH")]:
    t = reliability(preds[col], preds["HomeWin"], bins)
    ax.plot(t["forecast"], t["observed"], "o-", label=name)
ax.set_xlabel("forecast P(home win)")
ax.set_ylabel("observed home win rate")
ax.set_title("Reliability diagram")
ax.legend()
fig.tight_layout()
plt.show()
```

Both sit close to the diagonal in the middle, where most matches are. At the edges the goal model looks a little overconfident (its forecasts of about 64% won only about 55% of the time), but those bins hold few matches, so part of that gap is noise. Many ML models are far worse, as the next example shows.

## Fixing an overconfident model

A random forest with tiny leaves memorises its training data, so its probabilities are too extreme. Let's train one, then recalibrate it. The key rule: **calibrate on data the model wasn't trained on**. Here the model trains on the first part of 2023-24, the calibrator learns from the rest of 2023-24, and everything is evaluated on 2024-25:

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

preds = pd.read_csv("data/poisson_predictions.csv", parse_dates=["Date"])
implied = 1 / preds[["AvgH", "AvgD", "AvgA"]]
preds["MktH"] = implied["AvgH"] / implied.sum(axis=1)
preds["HomeWin"] = (preds["FTR"] == "H").astype(int)
features = ["pH", "MktH", "LamH", "LamA"]

season = preds[preds["Season"] == "2023-24"]
train, calib = season.iloc[:250], season.iloc[250:]
test = preds[preds["Season"] == "2024-25"]

forest = RandomForestClassifier(n_estimators=300, min_samples_leaf=1, random_state=0).fit(train[features], train["HomeWin"])
raw_calib = forest.predict_proba(calib[features])[:, 1]
raw_test = forest.predict_proba(test[features])[:, 1]

def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))

platt = LogisticRegression().fit(logit(raw_calib).reshape(-1, 1), calib["HomeWin"])
platt_test = platt.predict_proba(logit(raw_test).reshape(-1, 1))[:, 1]

iso = IsotonicRegression(out_of_bounds="clip", y_min=0.02, y_max=0.98).fit(raw_calib, calib["HomeWin"])
iso_test = iso.predict(raw_test)

for name, p in [("forest, raw", np.clip(raw_test, 1e-3, 1 - 1e-3)), ("forest + Platt", platt_test),
                ("forest + isotonic", iso_test), ("goal model", test["pH"]), ("market", test["MktH"])]:
    print(f"{name:>18}: log loss {log_loss(test['HomeWin'], p):.4f}")
```

- **Platt scaling** fits a logistic regression on the model's log-odds. It can only stretch or shrink probabilities smoothly, so it needs little data. Here it fixes much of the overconfidence.
- **Isotonic regression** fits any increasing step function. It's more flexible, but with only about 130 calibration matches it overfits. Use it when you have thousands of calibration examples.
- Calibration **can't add information**: the recalibrated forest is still worse than the goal model it was partly built from. Fix the model first; calibrate second.

scikit-learn wraps both methods in `CalibratedClassifierCV`, which handles the train/calibrate split for you. With time-ordered data, make sure the calibration data comes after the training data.

## Removing the margin properly

To compare with the market you need its margin-free probabilities. So far you've used the **proportional** method: divide each implied probability by their sum. But bookmakers usually load more margin onto long shots (the favourite–longshot bias you saw in Phase 3). The **power method** handles that by finding an exponent $k$ such that $\sum_i (1/o_i)^k = 1$:

```python
import numpy as np
import pandas as pd
from scipy.optimize import brentq
from sklearn.metrics import log_loss

def proportional(odds):
    implied = 1 / np.asarray(odds, dtype=float)
    return implied / implied.sum()

def power_method(odds):
    implied = 1 / np.asarray(odds, dtype=float)
    k = brentq(lambda k: (implied ** k).sum() - 1, 0.5, 3.0)
    return implied ** k

example = [1.30, 5.50, 11.0]
print("proportional:", proportional(example).round(4))
print("power:       ", power_method(example).round(4))

matches = pd.read_csv("data/matches.csv")
odds = matches[["AvgA", "AvgD", "AvgH"]].to_numpy()
for name, f in [("proportional", proportional), ("power", power_method)]:
    probs = np.array([f(o) for o in odds])
    print(f"{name:>12}: log loss {log_loss(matches['FTR'], probs, labels=['A', 'D', 'H']):.4f}")
```

The power method shifts probability from the long shot to the favourite. On this synthetic data the two methods score almost identically; on real data, the power method (or the more elaborate Shin method) is often a little better, especially for heavy favourites.

## Blending: model plus market

Your model and the market make different mistakes. Averaging forecasts with different errors usually beats both, the same idea as a random forest averaging trees. Two simple ways to blend:

- **Linear pool:** $p = w \cdot p_{\text{model}} + (1 - w) \cdot p_{\text{market}}$
- **Logarithmic pool:** average the log-probabilities with weights, then renormalise.

Choose the weight $w$ on a validation season, then test it once:

```python
import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

preds = pd.read_csv("data/poisson_predictions.csv")
labels = ["A", "D", "H"]

def market_probs(df):
    implied = 1 / df[["AvgA", "AvgD", "AvgH"]].to_numpy()
    return implied / implied.sum(axis=1, keepdims=True)

def blend(model, market, w):
    return w * model + (1 - w) * market

valid = preds[preds["Season"] == "2023-24"]
test = preds[preds["Season"] == "2024-25"]
model_v, market_v = valid[["pA", "pD", "pH"]].to_numpy(), market_probs(valid)
model_t, market_t = test[["pA", "pD", "pH"]].to_numpy(), market_probs(test)

weights = np.round(np.arange(0, 1.01, 0.1), 1)
val_losses = [log_loss(valid["FTR"], blend(model_v, market_v, w), labels=labels) for w in weights]
best_w = weights[int(np.argmin(val_losses))]
print("validation log loss by model weight:", dict(zip(weights.tolist(), np.round(val_losses, 4).tolist())))
print(f"chosen weight: {best_w}")
print(f"test: market {log_loss(test['FTR'], market_t, labels=labels):.4f}, "
      f"model {log_loss(test['FTR'], model_t, labels=labels):.4f}, "
      f"blend {log_loss(test['FTR'], blend(model_t, market_t, best_w), labels=labels):.4f}")
```

The blend beats both the market and the model on the test season. That's the realistic way a modest model adds value: not by replacing the market, but by nudging its probabilities where the model knows something extra.

:::warning Our synthetic bookmaker is beatable on purpose
In this course's data, the bookmaker's prices include deliberate random noise, so a good model can improve on them. Real markets, especially the closing prices of big leagues, are much sharper, and the gains from blending are smaller and harder to prove. Bookmakers also restrict customers who win consistently.
:::

## Practice

:::exercise cal-reliability A reliability table
Write `reliability_table(p, y, n_bins)` that groups predictions into `n_bins` equal-width bins from 0 to 1 (`np.linspace(0, 1, n_bins + 1)` with `pd.cut`, `include_lowest=True`) and returns a DataFrame with one row per non-empty bin and columns `forecast` (mean prediction), `observed` (mean outcome) and `n` (count). Use `observed=True` when grouping.

@@starter
import numpy as np
import pandas as pd

def reliability_table(p, y, n_bins):
    return pd.DataFrame(columns=["forecast", "observed", "n"])

@@solution
import numpy as np
import pandas as pd

def reliability_table(p, y, n_bins):
    p, y = pd.Series(np.asarray(p, dtype=float)), pd.Series(np.asarray(y, dtype=float))
    bins = pd.cut(p, np.linspace(0, 1, n_bins + 1), include_lowest=True)
    table = pd.DataFrame({"p": p, "y": y}).groupby(bins, observed=True).agg(
        forecast=("p", "mean"), observed=("y", "mean"), n=("y", "size"))
    return table[table["n"] > 0]

@@tests
import numpy as np

def test_simple():
    """Two bins with known contents"""
    t = reliability_table([0.1, 0.2, 0.8, 0.9], [0, 1, 1, 1], 2)
    assert list(t.columns) == ["forecast", "observed", "n"]
    assert t["n"].tolist() == [2, 2]
    assert np.allclose(t["forecast"], [0.15, 0.85]) and np.allclose(t["observed"], [0.5, 1.0])

def test_calibrated_data():
    """Calibrated simulated forecasts lie near the diagonal"""
    rng = np.random.default_rng(0)
    p = rng.uniform(0.05, 0.95, 20000)
    y = rng.random(20000) < p
    t = reliability_table(p, y, 10)
    assert (abs(t["forecast"] - t["observed"]) < 0.03).all()
:::

:::exercise cal-platt Platt scaling
Write `platt_scale(p_calib, y_calib, p_new)`: fit `LogisticRegression()` on the log-odds of `p_calib` (clip probabilities to `[1e-4, 1 - 1e-4]` first) against `y_calib`, and return the recalibrated probabilities for `p_new` as a NumPy array.

@@starter
import numpy as np
from sklearn.linear_model import LogisticRegression

def platt_scale(p_calib, y_calib, p_new):
    return np.asarray(p_new)

@@solution
import numpy as np
from sklearn.linear_model import LogisticRegression

def platt_scale(p_calib, y_calib, p_new):
    def logit(p):
        p = np.clip(np.asarray(p, dtype=float), 1e-4, 1 - 1e-4)
        return np.log(p / (1 - p)).reshape(-1, 1)
    model = LogisticRegression().fit(logit(p_calib), y_calib)
    return model.predict_proba(logit(p_new))[:, 1]

@@tests
import numpy as np
from sklearn.metrics import log_loss

def test_fixes_overconfidence():
    """Shrinks overconfident probabilities and improves log loss"""
    rng = np.random.default_rng(0)
    true_p = rng.uniform(0.2, 0.8, 6000)
    y = (rng.random(6000) < true_p).astype(int)
    logit = np.log(true_p / (1 - true_p))
    overconfident = 1 / (1 + np.exp(-3 * logit))        # three times too extreme
    fixed = platt_scale(overconfident[:3000], y[:3000], overconfident[3000:])
    assert log_loss(y[3000:], fixed) < log_loss(y[3000:], overconfident[3000:]) - 0.02
    assert np.std(fixed) < np.std(overconfident[3000:])
:::

:::exercise cal-blend Choose a blend weight
Write `choose_weight(model_val, market_val, y_val, weights)` returning the weight from `weights` that minimises the log loss (`labels=["A", "D", "H"]`) of the linear blend `w * model + (1 - w) * market` on the validation data. `model_val` and `market_val` are arrays of shape (n, 3) with columns A, D, H.

@@starter
import numpy as np
from sklearn.metrics import log_loss

def choose_weight(model_val, market_val, y_val, weights):
    return weights[0]

@@solution
import numpy as np
from sklearn.metrics import log_loss

def choose_weight(model_val, market_val, y_val, weights):
    losses = [log_loss(y_val, w * model_val + (1 - w) * market_val, labels=["A", "D", "H"]) for w in weights]
    return weights[int(np.argmin(losses))]

@@tests
import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

def test_real_predictions():
    """Picks the validation-optimal weight"""
    preds = pd.read_csv("data/poisson_predictions.csv")
    v = preds[preds["Season"] == "2023-24"]
    model = v[["pA", "pD", "pH"]].to_numpy()
    imp = 1 / v[["AvgA", "AvgD", "AvgH"]].to_numpy()
    market = imp / imp.sum(axis=1, keepdims=True)
    weights = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
    losses = [log_loss(v["FTR"], w * model + (1 - w) * market, labels=["A", "D", "H"]) for w in weights]
    assert choose_weight(model, market, v["FTR"], weights) == weights[int(np.argmin(losses))]
    assert 0 < choose_weight(model, market, v["FTR"], weights) < 1
:::

:::quiz cal-quiz Quick check
? Why must a calibrator be fitted on data the model wasn't trained on?
- [x] On training data the model looks more confident and accurate than it really is
- [ ] Calibrators can't use training data for technical reasons
- [ ] It makes calibration faster
> Out-of-sample predictions show the model's true reliability.

? When is isotonic calibration a better choice than Platt scaling?
- [x] When you have plenty of calibration data and the miscalibration isn't a simple stretch
- [ ] Always
- [ ] When you have very little data
> Isotonic is flexible but overfits small samples.

? Why can blending a model with the market beat both?
- [x] They make different errors, so averaging cancels some of each
- [ ] Averaging always gives the right answer
- [ ] The market is always wrong
> The same reason ensembles work.

? The power method for removing the margin:
- [x] Takes more margin off long shots than favourites, unlike proportional normalisation
- [ ] Ignores the margin
- [ ] Only works for two outcomes
> It accounts for the favourite–longshot bias.
:::
