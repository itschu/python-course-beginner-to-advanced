---
title: Experiment tracking, saving models and monitoring
summary: Make results reproducible with seeds, versions and data fingerprints, log every experiment, save models with their metadata and a model card, and monitor a live model for drift and silent failures.
minutes: 55
kind: lesson
---

Three months from now you'll want to know which settings produced your best result, on which version of the data, with which library versions. And once a model is live, you'll need to know when it quietly breaks. This lesson covers the habits that make ML work trustworthy over time: the "ops" in MLOps.

## Reproducibility

A result is reproducible when someone (including future you) can get the same numbers again. That needs four things recorded:

1. **Code version**: the git commit.
2. **Data version**: a fingerprint (hash) of the exact data file. If one row changes, the hash changes.
3. **Library versions**: scikit-learn, pandas and NumPy change defaults between releases.
4. **Randomness**: fixed seeds (`random_state=0`, `np.random.default_rng(0)`).

```python
import hashlib
import platform
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn

def fingerprint(path):
    """Short SHA-256 hash of a file's bytes: changes if any byte changes."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:12]

print("data:", {f: fingerprint(f"data/{f}") for f in ["matches.csv", "poisson_predictions.csv"]})
print("versions:", {"python": platform.python_version(), "numpy": np.__version__,
                    "pandas": pd.__version__, "scikit-learn": sklearn.__version__})
```

## An experiment log

Every time you try something, append a record to a log. A **JSON Lines** file (one JSON object per line) is enough to start, and pandas can turn it into a table. Here we compare linear and logarithmic pooling of the goal model and market at three weights, on the validation season:

```python
import hashlib
import json
import platform
import time
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import log_loss

DATA = "data/poisson_predictions.csv"
LOG = Path("experiments.jsonl")
LOG.unlink(missing_ok=True)                    # start a fresh log for this demo

def log_run(params, metrics):
    run = len(LOG.read_text().splitlines()) + 1 if LOG.exists() else 1
    record = {
        "run": run,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "params": params,
        "metrics": metrics,
        "data": {"file": DATA, "sha256": hashlib.sha256(Path(DATA).read_bytes()).hexdigest()[:12]},
        "versions": {"python": platform.python_version(), "pandas": pd.__version__, "scikit-learn": sklearn.__version__},
    }
    with LOG.open("a") as f:
        f.write(json.dumps(record) + "\n")

preds = pd.read_csv(DATA)
valid = preds[preds["Season"] == "2023-24"]
model = valid[["pA", "pD", "pH"]].to_numpy()
implied = 1 / valid[["AvgA", "AvgD", "AvgH"]].to_numpy()
market = implied / implied.sum(axis=1, keepdims=True)

def pool(model, market, w, method):
    if method == "linear":
        return w * model + (1 - w) * market
    p = np.exp(w * np.log(model) + (1 - w) * np.log(market))
    return p / p.sum(axis=1, keepdims=True)

for method in ["linear", "log"]:
    for w in [0.2, 0.4, 0.6]:
        loss = log_loss(valid["FTR"], pool(model, market, w, method), labels=["A", "D", "H"])
        log_run({"method": method, "model_weight": w}, {"valid_log_loss": round(float(loss), 5)})

runs = pd.json_normalize([json.loads(line) for line in LOG.read_text().splitlines()])
cols = ["run", "params.method", "params.model_weight", "metrics.valid_log_loss", "data.sha256"]
print(runs[cols].sort_values("metrics.valid_log_loss").to_string(index=False))
print("\nThe first record in full:")
print(json.dumps(json.loads(LOG.read_text().splitlines()[0]), indent=2))
```

The two pooling methods are practically tied, so you'd keep the simpler linear pool. Log the runs that didn't work too: they stop you (and others) repeating them, and the number of runs tells you how much the best result is inflated by selection.

## Saving a model with its metadata

In Phase 5 you saved models with `joblib`. In practice, save a **bundle**: the model plus everything needed to use it correctly and know where it came from. Here the model is a *stacking* model: a logistic regression that learns how to combine the goal model's and the market's log-probabilities.

```python
import platform
import time

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

preds = pd.read_csv("data/poisson_predictions.csv")
FEATURES = ["log_pH", "log_pD", "log_pA", "log_mH", "log_mD", "log_mA"]

def make_features(df):
    implied = 1 / df[["AvgH", "AvgD", "AvgA"]].to_numpy()
    market = implied / implied.sum(axis=1, keepdims=True)
    return pd.DataFrame(np.log(np.hstack([df[["pH", "pD", "pA"]].to_numpy(), market])), columns=FEATURES, index=df.index)

train, test = preds[preds["Season"] == "2023-24"], preds[preds["Season"] == "2024-25"]
stacker = LogisticRegression(C=0.1, max_iter=1000).fit(make_features(train), train["FTR"])
test_loss = log_loss(test["FTR"], stacker.predict_proba(make_features(test)))

bundle = {
    "model": stacker,
    "features": FEATURES,
    "classes": stacker.classes_.tolist(),
    "trained_on": "2023-24 season, 380 matches",
    "metrics": {"test_log_loss_2024_25": round(float(test_loss), 4)},
    "versions": {"python": platform.python_version(), "scikit-learn": sklearn.__version__},
    "created": time.strftime("%Y-%m-%d"),
}
joblib.dump(bundle, "stacker.joblib")

# Later, perhaps in an API server:
loaded = joblib.load("stacker.joblib")
if loaded["versions"]["scikit-learn"] != sklearn.__version__:
    print("warning: model was saved with a different scikit-learn version")
new_match = pd.DataFrame({"pH": [0.52], "pD": [0.25], "pA": [0.23], "AvgH": [2.05], "AvgD": [3.4], "AvgA": [3.9]})
probs = loaded["model"].predict_proba(make_features(new_match)[loaded["features"]])[0]
print({c: round(float(p), 3) for c, p in zip(loaded["classes"], probs)})
print("metadata:", {k: v for k, v in loaded.items() if k != "model"})
```

With 21 parameters fitted on 380 matches, the stacker scores about 1.045 on 2024-25, worse than the one-parameter linear blend from earlier (1.0354). With small data, simple combinations usually win. That's exactly the kind of thing an experiment log should record.

:::warning Only load model files you trust
`joblib` and `pickle` files can run arbitrary code when loaded. Never load one downloaded from a stranger. Models can also break or behave differently under other library versions, which is why the bundle records them. For sharing models, look at `skops` (safe scikit-learn serialisation) or ONNX.
:::

## Model cards

A **model card** is a short document that ships with a model: what it does, what data it was trained on, how well it performs, and where it shouldn't be used. You can generate one from the bundle's metadata:

```python
card = """# Match outcome stacker

**Purpose:** home/draw/away probabilities for league matches, combining a goal model with market odds.
**Training data:** {trained_on}. Features: {features}.
**Performance:** log loss {loss} on the 2024-25 season (market alone: 1.0394).
**Limitations:** trained on one synthetic league; not validated on other leagues, cups or
early-season matches with promoted teams. Needs bookmaker odds as an input. Retrain each season.
**Created:** {created} with scikit-learn {sklearn_version}.
"""
meta = {"trained_on": "2023-24 season, 380 matches", "features": "goal-model and market log-probabilities",
        "loss": 1.0451, "created": "2025-06-01", "sklearn_version": "1.8"}
print(card.format(**meta))
```

## Monitoring a live model

Models fail silently. Nothing crashes: the predictions just get worse. Three things to watch:

1. **Inputs (data drift)**: are the features still distributed like the training data?
2. **Predictions**: are the outputs still sensible? These can be checked before any results are known.
3. **Outcomes (performance)**: is the log loss holding up? This is the real test, but it arrives late and is noisy.

### Data drift with the population stability index

The **population stability index (PSI)** compares the distribution of a variable now with a reference period. Split the reference into 10 equal-count bins, compute the share of each period in each bin, and sum:

$$
\text{PSI} = \sum_{\text{bins}} (a_i - e_i) \ln\frac{a_i}{e_i}
$$

where $e_i$ and $a_i$ are the reference and current shares. A common rule of thumb: below 0.1 is stable, 0.1 to 0.25 is worth a look, above 0.25 is a major shift.

```python
import numpy as np
import pandas as pd

def psi(expected, actual, n_bins=10):
    expected, actual = np.asarray(expected, dtype=float), np.asarray(actual, dtype=float)
    edges = np.quantile(expected, np.linspace(0, 1, n_bins + 1)[1:-1])     # inner bin edges
    e = np.bincount(np.searchsorted(edges, expected, side="right"), minlength=n_bins) / len(expected)
    a = np.bincount(np.searchsorted(edges, actual, side="right"), minlength=n_bins) / len(actual)
    e, a = np.clip(e, 1e-6, None), np.clip(a, 1e-6, None)                  # avoid log(0)
    return float(np.sum((a - e) * np.log(a / e)))

preds = pd.read_csv("data/poisson_predictions.csv")
implied = 1 / preds[["AvgH", "AvgD", "AvgA"]]
preds["MarketHome"] = implied["AvgH"] / implied.sum(axis=1)
old, new = preds[preds["Season"] == "2023-24"], preds[preds["Season"] == "2024-25"]
for col in ["MarketHome", "LamH", "LamA"]:
    print(f"{col:>10}: PSI 2023-24 -> 2024-25 = {psi(old[col], new[col]):.3f}")

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
vol = np.log(fx["Close"]).diff().rolling(20).std() * np.sqrt(252)
print(f"FX 20-day volatility: PSI 2021 -> 2022 = {psi(vol['2021'], vol['2022']):.2f}")
```

The football features are stable between seasons (all below 0.1). The FX volatility feature shifted massively from a calm year to a wild one, so a model trained on 2021 would be operating outside its experience in 2022.

### Predictions and outcomes

To see why you need both, let's simulate a bug: from match 250 of 2024-25, a pipeline change swaps the home and away columns of the model's output. That's a classic join mistake that raises no error.

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv")
season = preds[preds["Season"] == "2024-25"].reset_index(drop=True)
implied = 1 / season[["AvgH", "AvgD", "AvgA"]].to_numpy()
market = implied / implied.sum(axis=1, keepdims=True)
healthy = season[["pH", "pD", "pA"]].to_numpy()
broken = healthy.copy()
broken[250:] = broken[250:, ::-1]                           # the bug: H and A swapped

result = season["FTR"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
rows = np.arange(len(season))

def monitors(model):
    disagreement = pd.Series(np.abs(model - market).sum(axis=1) / 2).rolling(10).mean()
    gap = pd.Series(np.log(market[rows, result]) - np.log(model[rows, result])).rolling(50).mean()
    return disagreement, gap                                  # gap = model log loss minus market's

def first_alert(series, threshold):
    hits = np.flatnonzero(series.to_numpy() > threshold)
    return int(hits[0]) if len(hits) else None

fig, axes = plt.subplots(2, 1, figsize=(7, 5), sharex=True)
for name, model in [("healthy", healthy), ("broken", broken)]:
    disagreement, gap = monitors(model)
    print(f"{name:>8}: prediction alert at match {first_alert(disagreement, 0.15)}, "
          f"outcome alert at match {first_alert(gap, 0.08)}")
    axes[0].plot(disagreement, label=name)
    axes[1].plot(gap, label=name)
axes[0].axhline(0.15, color="red", ls="--")
axes[0].set_title("Prediction monitor: disagreement with market (10 matches)")
axes[1].axhline(0.08, color="red", ls="--")
axes[1].set_title("Outcome monitor: log loss minus market's (50 matches)")
for ax in axes:
    ax.axvline(250, color="grey", ls=":")
    ax.legend()
fig.tight_layout()
plt.show()
```

The healthy model never trips either alarm. For the broken one:

- The **prediction monitor** fires within a few matches, before any of those games have been played: the model suddenly disagrees with the market far more than it ever did.
- The **outcome monitor** needs more than 50 matches (over five rounds) to be sure, because football results are so noisy. A shorter window or lower threshold would catch it sooner, but would also raise false alarms on the healthy model. Try it.

Comparing against a benchmark on the same matches (here, the market) also helps: a run of upsets raises everyone's log loss, but not the gap.

## Tools you'll meet

- **MLflow**: the most common open-source experiment tracker and model registry. It does what our JSON log does, with a web UI:

```python static
import mlflow
import mlflow.sklearn

mlflow.set_experiment("match-model")
with mlflow.start_run():
    mlflow.log_params({"method": "linear", "model_weight": 0.4})
    mlflow.log_metric("valid_log_loss", 1.0643)
    mlflow.sklearn.log_model(stacker, name="model")      # the stacking model from earlier
# In a terminal: mlflow ui   then open http://127.0.0.1:5000
```

- **Weights & Biases**: a hosted tracker, popular for deep learning.
- **DVC**: version control for data files and pipelines, alongside git.
- **Evidently**: drift and model-quality reports, including PSI and many other tests.

## Practice

:::exercise track-log An experiment log
Write two functions that use a JSON Lines file at `path`:

- `log_run(path, params, metrics)` appends one line: a JSON object with keys `"run"` (1 for the first record in the file, 2 for the second, and so on), `"params"` and `"metrics"`.
- `best_run(path, metric)` reads every record and returns the one (as a dictionary) with the **lowest** value of `metrics[metric]`.

@@starter
import json
from pathlib import Path

def log_run(path, params, metrics):
    pass

def best_run(path, metric):
    return None

@@solution
import json
from pathlib import Path

def log_run(path, params, metrics):
    path = Path(path)
    run = len(path.read_text().splitlines()) + 1 if path.exists() else 1
    with path.open("a") as f:
        f.write(json.dumps({"run": run, "params": params, "metrics": metrics}) + "\n")

def best_run(path, metric):
    records = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    return min(records, key=lambda r: r["metrics"][metric])

@@tests
import json
from pathlib import Path

def fresh(name):
    p = Path(name)
    p.unlink(missing_ok=True)
    return p

def test_appends_lines():
    """One JSON object per line, numbered runs"""
    p = fresh("test_log_a.jsonl")
    log_run(p, {"C": 1.0}, {"loss": 0.5})
    log_run(p, {"C": 0.1}, {"loss": 0.4})
    lines = p.read_text().splitlines()
    assert len(lines) == 2
    first, second = json.loads(lines[0]), json.loads(lines[1])
    assert first == {"run": 1, "params": {"C": 1.0}, "metrics": {"loss": 0.5}}
    assert second["run"] == 2

def test_best_run():
    """Lowest metric wins"""
    p = fresh("test_log_b.jsonl")
    for c, loss, acc in [(1.0, 0.52, 0.70), (0.1, 0.47, 0.68), (10.0, 0.55, 0.72)]:
        log_run(p, {"C": c}, {"loss": loss, "error": 1 - acc})
    assert best_run(p, "loss")["params"] == {"C": 0.1}
    assert best_run(p, "error")["run"] == 3
:::

:::exercise track-psi Population stability index
Write `psi(expected, actual, n_bins=10)`. Use the quantiles of `expected` to create `n_bins` equal-count bins (inner edges `np.quantile(expected, np.linspace(0, 1, n_bins + 1)[1:-1])`, assigning values with `np.searchsorted(edges, x, side="right")`). Compute each sample's share in each bin, clip shares to at least `1e-6`, and return $\sum (a - e)\ln(a / e)$ as a float.

@@starter
import numpy as np

def psi(expected, actual, n_bins=10):
    return 0.0

@@solution
import numpy as np

def psi(expected, actual, n_bins=10):
    expected, actual = np.asarray(expected, dtype=float), np.asarray(actual, dtype=float)
    edges = np.quantile(expected, np.linspace(0, 1, n_bins + 1)[1:-1])
    e = np.bincount(np.searchsorted(edges, expected, side="right"), minlength=n_bins) / len(expected)
    a = np.bincount(np.searchsorted(edges, actual, side="right"), minlength=n_bins) / len(actual)
    e, a = np.clip(e, 1e-6, None), np.clip(a, 1e-6, None)
    return float(np.sum((a - e) * np.log(a / e)))

@@tests
import math
import numpy as np

def test_same_distribution():
    """Two samples from the same distribution: stable"""
    rng = np.random.default_rng(0)
    assert psi(rng.normal(0, 1, 20000), rng.normal(0, 1, 20000)) < 0.01

def test_shifted():
    """A shift of one standard deviation is a major change"""
    rng = np.random.default_rng(1)
    assert psi(rng.normal(0, 1, 20000), rng.normal(1, 1, 20000)) > 0.25

def test_known_value():
    """Hand-checkable two-bin example"""
    expected = [1, 2, 3, 4]            # median 2.5 splits it 50/50
    actual = [1, 1, 1, 4]              # 75% below, 25% above
    value = (0.75 - 0.5) * math.log(0.75 / 0.5) + (0.25 - 0.5) * math.log(0.25 / 0.5)
    assert math.isclose(psi(expected, actual, n_bins=2), value)
:::

:::exercise track-alert A rolling alert
Write `first_alert(values, window, threshold)` that returns the position (0-based) of the first point where the mean of the last `window` values (including that point) is greater than `threshold`. Only positions with a full window count. Return `None` if the alert never fires.

@@starter
def first_alert(values, window, threshold):
    return None

@@solution
import numpy as np
import pandas as pd

def first_alert(values, window, threshold):
    rolling = pd.Series(values, dtype=float).rolling(window).mean()
    hits = np.flatnonzero(rolling.to_numpy() > threshold)
    return int(hits[0]) if len(hits) else None

@@tests
def test_fires():
    """Mean of the last 3 first exceeds 2 at position 4"""
    assert first_alert([1, 1, 1, 3, 3, 3, 1], 3, 2) == 4

def test_needs_full_window():
    """A big first value doesn't count before the window is full"""
    assert first_alert([10, 0, 0, 0], 2, 4) == 1
    assert first_alert([10, 0, 0, 0], 3, 4) is None

def test_never():
    """Returns None when the threshold is never crossed"""
    assert first_alert([0.1, 0.2, 0.1, 0.2], 2, 0.5) is None
:::

:::quiz track-quiz Quick check
? Your best result from last month can't be reproduced. Which record would most likely have prevented this?
- [x] The git commit, data fingerprint, library versions and random seeds of each run
- [ ] A screenshot of the final score
- [ ] A larger test set
> Reproducing a result needs the exact code, data, environment and randomness.

? Why is it risky to load a `.joblib` model file someone emailed you?
- [x] Loading it can run arbitrary code
- [ ] It might be too large
- [ ] joblib files expire
> Pickle-based formats execute code on load. Only load files you trust.

? A deployed model's 50-match log loss jumps, but so does the market's. What's the most likely explanation?
- [x] A run of upsets that made everyone's forecasts look worse
- [ ] The model is broken
- [ ] Data drift in the features
> Comparing against a benchmark on the same matches separates bad luck from a broken model.

? Why monitor predictions as well as outcomes?
- [x] Prediction problems can be spotted immediately, before results arrive
- [ ] Outcomes are not useful for monitoring
- [ ] Predictions are more accurate than outcomes
> Outcome-based metrics are the real test but are slow and noisy.
:::
