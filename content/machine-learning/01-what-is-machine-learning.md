---
title: What machine learning is, and the scikit-learn workflow
summary: Supervised and unsupervised learning, the end-to-end workflow, train/test splits, the fit/predict API, and why every project starts with a dumb baseline.
minutes: 50
kind: lesson
---

**Machine learning** is getting computers to learn patterns from examples instead of following rules you wrote by hand. You've already done it: the linear and logistic regressions in Phase 4 learned their weights from data. This phase gives you the professional toolkit, **scikit-learn**, and the discipline to use it honestly.

## The main kinds of ML

| Kind | Learns from | Examples |
| --- | --- | --- |
| **Supervised: regression** | examples with a numeric answer | house price, goals scored, tomorrow's demand |
| **Supervised: classification** | examples with a category answer | home/draw/away, spam or not, which digit |
| **Unsupervised** | examples with no answers | group similar customers, compress features, find anomalies |
| **Reinforcement learning** | rewards from trial and error | game-playing agents, robot control |

Most of the value in industry comes from supervised learning, and that's most of this phase. The inputs are called **features** (usually a matrix `X`, one row per example) and the answer is the **target** or **label** (a vector `y`).

## The workflow

1. **Frame the problem.** What exactly are you predicting, at what moment, and what decision will the prediction drive?
2. **Get and clean the data** (Phase 3).
3. **Split** the data so you can test honestly.
4. **Build a baseline**: the simplest sensible prediction.
5. **Engineer features** and **train models**.
6. **Evaluate** with the right metric, on data the model never saw.
7. **Iterate**, then **deploy** and **monitor** (Phases 8 and 9).

Steps 1, 3, 4 and 6 are where most real projects go wrong, so we'll keep coming back to them.

## The scikit-learn API

Every scikit-learn model ("estimator") has the same interface, which is what makes it so productive:

```python
import pandas as pd
from sklearn.linear_model import LinearRegression

houses = pd.read_csv("data/houses.csv")
X = houses[["size_sqm", "bedrooms", "age_years", "distance_km"]]
y = houses["price"]

model = LinearRegression()      # 1. create, choosing settings (hyperparameters)
model.fit(X, y)                 # 2. learn from data
predictions = model.predict(X)  # 3. predict
print(predictions[:3].round(0))
print(model.score(X, y))        # 4. a default metric (R² for regressors)
print(dict(zip(X.columns, model.coef_.round(0))), round(model.intercept_))
```

Learned attributes end with an underscore (`coef_`, `intercept_`), by convention. Swap `LinearRegression` for almost any other regressor and the code is unchanged.

## Never evaluate on your training data

The `score` above is computed on the same houses the model learned from. That's like marking an exam using the answer sheet the student memorised. To estimate how a model does on **new** data, hold some data back:

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split

houses = pd.read_csv("data/houses.csv")
X = houses[["size_sqm", "bedrooms", "age_years", "distance_km"]]
y = houses["price"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)
print(len(X_train), "training rows,", len(X_test), "test rows")

model = LinearRegression().fit(X_train, y_train)
print(f"R² on training data: {model.score(X_train, y_train):.3f}")
print(f"R² on test data:     {model.score(X_test, y_test):.3f}")
```

For a simple model like this, the two are close. For flexible models they can be wildly different, and the test score is the one that matters. `random_state` makes the random split reproducible.

:::warning Random splits and time
`train_test_split` shuffles rows randomly. That's fine for houses, but **wrong for time-ordered data** like matches or prices: shuffling lets the model train on the future and test on the past. For time series, train on earlier data and test on later data. Phase 6 covers this in depth, and the project at the end of this phase does it properly.
:::

## Baselines

A **baseline** is the simplest reasonable prediction. If your model can't beat it, it hasn't learned anything useful, however clever it is.

```python
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

houses = pd.read_csv("data/houses.csv")
X = houses[["size_sqm", "bedrooms", "age_years", "distance_km"]]
y = houses["price"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)

for name, model in [("always predict the median", DummyRegressor(strategy="median")),
                    ("linear regression", LinearRegression())]:
    model.fit(X_train, y_train)
    mae = mean_absolute_error(y_test, model.predict(X_test))
    print(f"{name:>26}: typical error £{mae:,.0f}")
```

For classification, good baselines are "always predict the most common class" and, for betting, "use the bookmaker's probabilities". Beating the first is easy; beating the second is the whole game.

## Classification in one minute

Classifiers work the same way. scikit-learn ships with some small datasets that need no download, like this one on breast tumours (malignant or benign) described by 30 measurements:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

baseline = DummyClassifier(strategy="most_frequent").fit(X_train, y_train)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X_train, y_train)

print(f"baseline accuracy: {baseline.score(X_test, y_test):.3f}")
print(f"model accuracy:    {model.score(X_test, y_test):.3f}")
print("probabilities for 3 test cases:", model.predict_proba(X_test[:3]).round(3))
```

`stratify=y` keeps the class proportions the same in both splits. `make_pipeline(StandardScaler(), ...)` standardises the features before the model (more on pipelines later in this phase). `predict_proba` gives probabilities, which, as you know from Phase 4, are what you need for decisions.

## Practice

:::exercise ml-split Split, fit and score
Write `fit_and_score(df, features, target, seed)`:

1. split `df[features]` and `df[target]` into 80% train and 20% test with `train_test_split(..., test_size=0.2, random_state=seed)`
2. fit a `LinearRegression` on the training data
3. return a tuple `(train_r2, test_r2)`, each rounded to 3 decimals

@@starter
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split

def fit_and_score(df, features, target, seed):
    return (0.0, 0.0)

@@solution
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split

def fit_and_score(df, features, target, seed):
    X_train, X_test, y_train, y_test = train_test_split(df[features], df[target], test_size=0.2, random_state=seed)
    model = LinearRegression().fit(X_train, y_train)
    return (round(model.score(X_train, y_train), 3), round(model.score(X_test, y_test), 3))

@@tests
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split

def test_matches_reference():
    """Scores match a reference implementation"""
    df = pd.read_csv("data/houses.csv")
    f = ["size_sqm", "age_years", "distance_km"]
    Xtr, Xte, ytr, yte = train_test_split(df[f], df["price"], test_size=0.2, random_state=7)
    m = LinearRegression().fit(Xtr, ytr)
    assert fit_and_score(df, f, "price", 7) == (round(m.score(Xtr, ytr), 3), round(m.score(Xte, yte), 3))

def test_reasonable():
    """The model explains a good share of price variation"""
    df = pd.read_csv("data/houses.csv")
    train, test = fit_and_score(df, ["size_sqm", "bedrooms", "age_years", "distance_km"], "price", 1)
    assert 0.5 < test < 0.95
:::

:::exercise ml-baseline Beat the baseline
Write `compare_to_baseline(X_train, X_test, y_train, y_test)` for a classification problem. Fit a `DummyClassifier(strategy="most_frequent")` and a pipeline of `StandardScaler()` then `LogisticRegression(max_iter=1000)`. Return a dictionary `{"baseline": ..., "model": ...}` of test accuracies, rounded to 3 decimals.

@@starter
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def compare_to_baseline(X_train, X_test, y_train, y_test):
    return {"baseline": 0.0, "model": 0.0}

@@solution
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def compare_to_baseline(X_train, X_test, y_train, y_test):
    baseline = DummyClassifier(strategy="most_frequent").fit(X_train, y_train)
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X_train, y_train)
    return {"baseline": round(baseline.score(X_test, y_test), 3), "model": round(model.score(X_test, y_test), 3)}

@@tests
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split

def test_wine():
    """The model beats the baseline on the wine dataset"""
    X, y = load_wine(return_X_y=True)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
    got = compare_to_baseline(Xtr, Xte, ytr, yte)
    assert 0.3 < got["baseline"] < 0.45, got
    assert got["model"] > 0.9, got
:::

:::quiz ml-intro-quiz Quick check
? Predicting tomorrow's number of website visitors is:
- [x] Regression
- [ ] Classification
- [ ] Unsupervised learning
> The target is a number.

? Why do we evaluate on a held-out test set?
- [x] To estimate performance on new, unseen data
- [ ] Because training data is too large
- [ ] To make training faster
> Scoring on training data rewards memorisation.

? What does a learned attribute like `model.coef_` have in common with others?
- [x] It ends with an underscore and only exists after `fit`
- [ ] It's a hyperparameter you set before training
- [ ] It's the same for all models
> Hyperparameters are set in the constructor; learned values end with `_`.

? Your fancy model has 54% accuracy predicting home/draw/away. What should you check first?
- [x] How it compares with simple baselines (like always predicting a home win) and with the bookmaker
- [ ] Whether a bigger model gets 56%
- [ ] Nothing: 54% is good
> Accuracy means nothing without a baseline.
:::
