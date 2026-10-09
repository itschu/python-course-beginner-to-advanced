---
title: Gradient boosting
summary: Build boosting from scratch to see how it works, then use scikit-learn's fast HistGradientBoosting with early stopping, and meet XGBoost and LightGBM.
minutes: 50
kind: lesson
---

On tabular data (the rows-and-columns data of most businesses) **gradient-boosted trees** win more Kaggle competitions and power more production systems than any other model family. Where a random forest averages many *independent* deep trees, boosting builds many *small* trees **in sequence**, each one correcting the mistakes of the ones before.

## Boosting from scratch

For regression, each new tree is fitted to the **residuals** (the remaining errors) of the current ensemble, and added with a small weight called the **learning rate**:

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.tree import DecisionTreeRegressor

rng = np.random.default_rng(0)
x = np.sort(rng.uniform(0, 6, 200)).reshape(-1, 1)
y = np.sin(x[:, 0]) + 0.3 * x[:, 0] + rng.normal(0, 0.2, 200)

learning_rate = 0.3
prediction = np.full_like(y, y.mean())          # start from the mean
trees = []
fig, ax = plt.subplots(figsize=(7, 3.5))
ax.scatter(x, y, s=8, color="grey")
for step in range(1, 51):
    residuals = y - prediction
    tree = DecisionTreeRegressor(max_depth=2).fit(x, residuals)    # a small "weak learner"
    prediction += learning_rate * tree.predict(x)
    trees.append(tree)
    if step in (1, 5, 50):
        ax.plot(x, prediction, label=f"after {step} trees")
        print(f"{step:>2} trees: training RMSE {np.sqrt(np.mean((y - prediction) ** 2)):.3f}")
ax.legend()
ax.set_title("Each tree fixes some of the remaining error")
fig.tight_layout()
plt.show()
```

That's gradient boosting for squared error. ("Gradient" because the residuals are the negative gradient of the squared-error loss, so each tree takes a gradient descent step in "function space". Other losses, like log loss for classification, use their own gradients.) A smaller learning rate needs more trees but usually generalises better.

## HistGradientBoosting in scikit-learn

scikit-learn's `HistGradientBoostingClassifier` and `HistGradientBoostingRegressor` are fast, handle missing values natively, and support **early stopping**: they hold out part of the training data and stop adding trees when the validation score stops improving.

```python
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, cross_val_score

houses = pd.read_csv("data/houses.csv")
X = pd.concat([houses.drop(columns=["price", "neighbourhood"]), pd.get_dummies(houses["neighbourhood"], dtype=int)], axis=1)
y = houses["price"]
cv = KFold(5, shuffle=True, random_state=0)

models = {
    "linear regression": LinearRegression(),
    "random forest": RandomForestRegressor(n_estimators=300, min_samples_leaf=2, random_state=0),
    "gradient boosting": HistGradientBoostingRegressor(learning_rate=0.05, max_iter=500, early_stopping=True, random_state=0),
}
for name, model in models.items():
    mae = -cross_val_score(model, X, y, cv=cv, scoring="neg_mean_absolute_error").mean()
    print(f"{name:>18}: CV MAE £{mae:,.0f}")
```

On this small, nearly linear dataset the linear model holds its own, which is a useful reminder: always compare against simple baselines. Boosting shines with larger datasets, many features, interactions and messy non-linear relationships.

## The key hyperparameters

| Hyperparameter | What it does | Typical values |
| --- | --- | --- |
| `learning_rate` | weight of each tree | 0.02 to 0.2 |
| `max_iter` | maximum number of trees | 100 to 2000 (with early stopping) |
| `max_leaf_nodes` / `max_depth` | size of each tree | 15 to 63 leaves |
| `min_samples_leaf` | minimum examples per leaf | 20 or more for noisy data |
| `l2_regularization` | penalty on leaf values | 0 to 10 |

Lower learning rate with more trees and early stopping is the reliable recipe. Here's early stopping in action on a classification problem:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import log_loss
from sklearn.model_selection import train_test_split

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)

model = HistGradientBoostingClassifier(learning_rate=0.05, max_iter=1000, early_stopping=True,
                                       validation_fraction=0.2, n_iter_no_change=20, random_state=0)
model.fit(X_train, y_train)
print(f"stopped after {model.n_iter_} trees (of a maximum of 1000)")
print(f"test accuracy {model.score(X_test, y_test):.3f}, log loss {log_loss(y_test, model.predict_proba(X_test)):.3f}")
```

## Categorical features

HistGradientBoosting can use categorical columns directly, without one-hot encoding. Give the column pandas' `category` dtype:

```python
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import KFold, cross_val_score

houses = pd.read_csv("data/houses.csv")
X = houses.drop(columns=["price"]).astype({"neighbourhood": "category"})
model = HistGradientBoostingRegressor(categorical_features="from_dtype", learning_rate=0.05, max_iter=400, random_state=0)
mae = -cross_val_score(model, X, houses["price"], cv=KFold(5, shuffle=True, random_state=0), scoring="neg_mean_absolute_error").mean()
print(f"native categorical support: CV MAE £{mae:,.0f}")
```

## XGBoost and LightGBM

Two specialised libraries popularised gradient boosting and are still industry standards. Their scikit-learn wrappers work like any other estimator, so everything you've learned carries over:

```python static
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier

xgb = XGBClassifier(n_estimators=500, learning_rate=0.05, max_depth=4, subsample=0.8, colsample_bytree=0.8)
lgbm = LGBMClassifier(n_estimators=500, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8)
xgb.fit(X_train, y_train)
proba = xgb.predict_proba(X_test)
```

Install them locally with `uv add xgboost lightgbm`. For most projects, scikit-learn's HistGradientBoosting is just as good and one fewer dependency.

## Practice

:::exercise gb-scratch Boosting by hand
Write `boost(X, y, n_trees, learning_rate, max_depth)` implementing gradient boosting for regression:

- start with every prediction equal to the mean of `y`
- for each tree: fit `DecisionTreeRegressor(max_depth=max_depth, random_state=0)` to the residuals, then add `learning_rate` times its predictions
- return a tuple `(initial_value, trees)` where `trees` is the list of fitted trees

Also write `boost_predict(initial_value, trees, learning_rate, X)` that recreates the prediction for new data.

@@starter
import numpy as np
from sklearn.tree import DecisionTreeRegressor

def boost(X, y, n_trees, learning_rate, max_depth):
    return float(np.mean(y)), []

def boost_predict(initial_value, trees, learning_rate, X):
    return np.full(len(X), initial_value)

@@solution
import numpy as np
from sklearn.tree import DecisionTreeRegressor

def boost(X, y, n_trees, learning_rate, max_depth):
    initial = float(np.mean(y))
    prediction = np.full(len(y), initial)
    trees = []
    for _ in range(n_trees):
        tree = DecisionTreeRegressor(max_depth=max_depth, random_state=0).fit(X, y - prediction)
        prediction += learning_rate * tree.predict(X)
        trees.append(tree)
    return initial, trees

def boost_predict(initial_value, trees, learning_rate, X):
    prediction = np.full(len(X), initial_value)
    for tree in trees:
        prediction += learning_rate * tree.predict(X)
    return prediction

@@tests
import numpy as np

def data():
    rng = np.random.default_rng(0)
    X = rng.uniform(0, 6, (300, 1))
    return X, np.sin(X[:, 0]) + 0.3 * X[:, 0] + rng.normal(0, 0.2, 300)

def test_improves():
    """More trees reduce training error"""
    X, y = data()
    init, few = boost(X, y, 3, 0.3, 2)
    _, many = boost(X, y, 60, 0.3, 2)
    err = lambda trees: np.sqrt(np.mean((y - boost_predict(init, trees, 0.3, X)) ** 2))
    assert len(many) == 60 and err(many) < err(few) < np.std(y)

def test_generalises():
    """Predicts well on new data"""
    X, y = data()
    init, trees = boost(X[:200], y[:200], 100, 0.1, 2)
    test_rmse = np.sqrt(np.mean((y[200:] - boost_predict(init, trees, 0.1, X[200:])) ** 2))
    assert test_rmse < 0.3, test_rmse
:::

:::exercise gb-early Early stopping
Write `fit_with_early_stopping(X_train, y_train, learning_rate, seed)` that fits `HistGradientBoostingClassifier(learning_rate=learning_rate, max_iter=2000, early_stopping=True, validation_fraction=0.2, n_iter_no_change=20, random_state=seed)` and returns a tuple `(model, n_trees_used)`.

Then set `slower_uses_more_trees` to `True` if the model with `learning_rate=0.02` uses more trees than the one with `learning_rate=0.3` on the breast cancer training data below, else `False`.

@@starter
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split

def fit_with_early_stopping(X_train, y_train, learning_rate, seed):
    return None, 0

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
slower_uses_more_trees = None

@@solution
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split

def fit_with_early_stopping(X_train, y_train, learning_rate, seed):
    model = HistGradientBoostingClassifier(learning_rate=learning_rate, max_iter=2000, early_stopping=True,
                                           validation_fraction=0.2, n_iter_no_change=20, random_state=seed)
    model.fit(X_train, y_train)
    return model, model.n_iter_

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
slower_uses_more_trees = fit_with_early_stopping(X_train, y_train, 0.02, 0)[1] > fit_with_early_stopping(X_train, y_train, 0.3, 0)[1]

@@tests
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split

def test_returns():
    """Returns a fitted model and its tree count"""
    X, y = load_breast_cancer(return_X_y=True)
    model, n = fit_with_early_stopping(X[:400], y[:400], 0.1, 0)
    assert n == model.n_iter_ and 1 <= n < 2000
    assert model.score(X[400:], y[400:]) > 0.9

def test_answer():
    """A smaller learning rate needs more trees"""
    assert slower_uses_more_trees is True
:::

:::quiz gb-quiz Quick check
? How does boosting differ from a random forest?
- [x] Boosting builds small trees in sequence, each correcting the previous ones; a forest averages independent trees
- [ ] Boosting uses one big tree
- [ ] They're the same algorithm
> Forests reduce variance by averaging; boosting reduces bias step by step.

? In regression boosting with squared error, each new tree is fitted to:
- [x] The residuals of the current ensemble
- [ ] The original target
- [ ] Random noise
> Residuals are the negative gradient of squared error.

? What does early stopping do?
- [x] Stops adding trees when a held-out validation score stops improving
- [ ] Stops training after a fixed time
- [ ] Removes early trees
> It picks the number of trees automatically and prevents overfitting.

? Halving the learning rate usually means you need:
- [x] More trees
- [ ] Fewer trees
- [ ] Deeper trees
> Smaller steps take more of them.
:::
