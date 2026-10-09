---
title: Overfitting, cross-validation and regularisation
summary: The bias-variance trade-off, validation and learning curves, k-fold cross-validation, Ridge and Lasso, and the train/validation/test protocol that keeps you honest.
minutes: 55
kind: lesson
---

The central tension in machine learning: a model must be flexible enough to capture real patterns, but not so flexible that it memorises noise. This lesson gives you the tools to find the balance, and to measure performance without fooling yourself.

## Underfitting and overfitting

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import root_mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures

rng = np.random.default_rng(1)
x_train = np.sort(rng.uniform(0, 1, 20))
y_train = np.sin(2 * np.pi * x_train) + rng.normal(0, 0.25, 20)
x_test = np.sort(rng.uniform(0, 1, 200))
y_test = np.sin(2 * np.pi * x_test) + rng.normal(0, 0.25, 200)
grid = np.linspace(0, 1, 300)

fig, axes = plt.subplots(1, 3, figsize=(12, 3.2), sharey=True)
for ax, degree in zip(axes, [1, 4, 15]):
    model = make_pipeline(PolynomialFeatures(degree), LinearRegression()).fit(x_train.reshape(-1, 1), y_train)
    train_err = root_mean_squared_error(y_train, model.predict(x_train.reshape(-1, 1)))
    test_err = root_mean_squared_error(y_test, model.predict(x_test.reshape(-1, 1)))
    ax.scatter(x_train, y_train, s=15, color="black")
    ax.plot(grid, model.predict(grid.reshape(-1, 1)), color="#2563eb")
    ax.set_ylim(-2, 2)
    ax.set_title(f"degree {degree}: train {train_err:.2f}, test {test_err:.2f}")
fig.tight_layout()
plt.show()
```

- **Degree 1 underfits**: too simple to capture the curve. Errors are high on both training and test data. That's **high bias**.
- **Degree 15 overfits**: it threads through every training point, including the noise, and wiggles wildly between them. Training error is tiny, test error is large. That's **high variance**.
- **Degree 4** generalises: similar error on both.

The gap between training and test error is your overfitting alarm.

## Validation curves

Plot training and validation error against model complexity to find the sweet spot:

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import validation_curve
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures

rng = np.random.default_rng(1)
x = rng.uniform(0, 1, 60).reshape(-1, 1)
y = np.sin(2 * np.pi * x[:, 0]) + rng.normal(0, 0.25, 60)

degrees = np.arange(1, 13)
train_scores, val_scores = validation_curve(
    make_pipeline(PolynomialFeatures(), LinearRegression()), x, y,
    param_name="polynomialfeatures__degree", param_range=degrees,
    cv=5, scoring="neg_root_mean_squared_error",
)
fig, ax = plt.subplots(figsize=(6, 3.5))
ax.plot(degrees, -train_scores.mean(axis=1), "o-", label="training error")
ax.plot(degrees, -val_scores.mean(axis=1), "o-", label="validation error")
ax.set_xlabel("polynomial degree (complexity)")
ax.set_ylabel("RMSE")
ax.set_ylim(0, 1)
ax.legend()
ax.set_title("Training error keeps falling; validation error doesn't")
fig.tight_layout()
plt.show()
```

scikit-learn scores are "higher is better", so error metrics are negated (`neg_root_mean_squared_error`).

## Cross-validation

A single train/test split is noisy: a lucky or unlucky split can swing your estimate. **k-fold cross-validation** splits the data into k folds, trains on k−1 of them and validates on the remaining one, k times, so every row is used for validation exactly once:

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, cross_val_score

houses = pd.read_csv("data/houses.csv")
X = houses[["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]]
y = houses["price"]

cv = KFold(n_splits=5, shuffle=True, random_state=0)
scores = cross_val_score(LinearRegression(), X, y, cv=cv, scoring="neg_mean_absolute_error")
print("MAE per fold:", (-scores).round(0))
print(f"mean £{-scores.mean():,.0f} ± £{scores.std():,.0f}")
```

The spread across folds tells you how much to trust the mean. Use `StratifiedKFold` for classification so each fold keeps the class balance (scikit-learn does this by default when you pass `cv=5` to a classifier), and `TimeSeriesSplit` for time-ordered data (Phase 6).

## Regularisation: Ridge and Lasso

Instead of limiting features, you can limit the **size of the weights**. Regularised linear models add a penalty to the loss:

- **Ridge** (L2): penalty $\alpha \sum w_j^2$. Shrinks all weights smoothly.
- **Lasso** (L1): penalty $\alpha \sum |w_j|$. Can shrink weights exactly to zero, selecting features.

`alpha` sets the strength (for regressors; logistic regression uses `C = 1/strength`). Always standardise features first so the penalty treats them fairly:

```python
import numpy as np
from sklearn.linear_model import Lasso, LinearRegression, Ridge
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

rng = np.random.default_rng(1)
x = rng.uniform(0, 1, 60).reshape(-1, 1)
y = np.sin(2 * np.pi * x[:, 0]) + rng.normal(0, 0.25, 60)

for name, reg in [("no penalty", LinearRegression()), ("ridge", Ridge(alpha=0.01)), ("lasso", Lasso(alpha=0.001, max_iter=100_000))]:
    model = make_pipeline(PolynomialFeatures(12), StandardScaler(), reg)
    rmse = -cross_val_score(model, x, y, cv=5, scoring="neg_root_mean_squared_error").mean()
    print(f"degree-12 polynomial, {name:>10}: CV RMSE {rmse:.3f}")
```

Both penalties beat the unpenalised fit. The gain is modest here because 60 points pin a degree-12 curve down fairly well; with less data the unpenalised version gets dramatically worse (try changing 60 to 20). Regularisation is how flexible models are kept in check everywhere in ML, from Ridge regression to weight decay in neural networks.

## Learning curves: would more data help?

A **learning curve** shows performance as the training set grows. If validation error is still falling, more data will help; if both curves have flattened at a high error, you need a better model or features instead:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import learning_curve

houses = pd.read_csv("data/houses.csv")
X = houses[["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]]
sizes, train_scores, val_scores = learning_curve(
    LinearRegression(), X, houses["price"], train_sizes=np.linspace(0.05, 1, 10),
    cv=5, scoring="neg_mean_absolute_error", shuffle=True, random_state=0,
)
fig, ax = plt.subplots(figsize=(6, 3.5))
ax.plot(sizes, -train_scores.mean(axis=1) / 1000, "o-", label="training")
ax.plot(sizes, -val_scores.mean(axis=1) / 1000, "o-", label="validation")
ax.set_xlabel("training examples")
ax.set_ylabel("MAE (£k)")
ax.legend()
ax.set_title("Learning curve")
fig.tight_layout()
plt.show()
```

## The protocol: train, validate, test

Every time you look at a score and change something (features, model, hyperparameters), information about that data leaks into your choices. So:

1. **Test set:** split off at the very start and locked away. Used **once**, at the end, to report final performance.
2. **Training data:** everything else. Use **cross-validation** on it (or a separate validation split) to compare models and tune settings.
3. After choosing, retrain on all the training data and evaluate once on the test set.

If you go back and tweak after seeing the test score, it's no longer a test set: it's become a validation set, and your reported performance is optimistic. This is the same multiple-testing problem from Phase 4, in ML clothing.

## Practice

:::exercise cv-compare Compare models with cross-validation
Write `cv_mae(model, X, y, folds, seed)` returning the mean cross-validated MAE (a positive number, rounded to 1 decimal) using `KFold(n_splits=folds, shuffle=True, random_state=seed)` and `scoring="neg_mean_absolute_error"`.

@@starter
from sklearn.model_selection import KFold, cross_val_score

def cv_mae(model, X, y, folds, seed):
    return 0.0

@@solution
from sklearn.model_selection import KFold, cross_val_score

def cv_mae(model, X, y, folds, seed):
    cv = KFold(n_splits=folds, shuffle=True, random_state=seed)
    scores = cross_val_score(model, X, y, cv=cv, scoring="neg_mean_absolute_error")
    return round(float(-scores.mean()), 1)

@@tests
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, cross_val_score

def test_reference():
    """Matches cross_val_score"""
    h = pd.read_csv("data/houses.csv")
    X, y = h[["size_sqm", "age_years"]], h["price"]
    ref = round(float(-cross_val_score(LinearRegression(), X, y, cv=KFold(4, shuffle=True, random_state=2), scoring="neg_mean_absolute_error").mean()), 1)
    assert cv_mae(LinearRegression(), X, y, 4, 2) == ref

def test_beats_dummy():
    """A linear model beats predicting the mean"""
    h = pd.read_csv("data/houses.csv")
    X, y = h[["size_sqm", "age_years", "distance_km"]], h["price"]
    assert cv_mae(LinearRegression(), X, y, 5, 0) < cv_mae(DummyRegressor(), X, y, 5, 0)
:::

:::exercise cv-alpha Choose a regularisation strength
Write `best_alpha(X, y, alphas, seed)`. For each alpha, evaluate a pipeline of `PolynomialFeatures(10)`, `StandardScaler()` and `Ridge(alpha=alpha)` with 5-fold `KFold(shuffle=True, random_state=seed)` cross-validation on RMSE (`scoring="neg_root_mean_squared_error"`). Return the alpha with the lowest mean RMSE.

@@starter
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

def best_alpha(X, y, alphas, seed):
    return alphas[0]

@@solution
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

def best_alpha(X, y, alphas, seed):
    cv = KFold(n_splits=5, shuffle=True, random_state=seed)
    results = {}
    for alpha in alphas:
        model = make_pipeline(PolynomialFeatures(10), StandardScaler(), Ridge(alpha=alpha))
        results[alpha] = -cross_val_score(model, X, y, cv=cv, scoring="neg_root_mean_squared_error").mean()
    return min(results, key=results.get)

@@tests
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

def data():
    rng = np.random.default_rng(1)
    x = rng.uniform(0, 1, 60).reshape(-1, 1)
    return x, np.sin(2 * np.pi * x[:, 0]) + rng.normal(0, 0.25, 60)

def test_reference():
    """Picks the alpha with the lowest CV error"""
    X, y = data()
    alphas = [1e-6, 1e-3, 0.01, 0.1, 1, 10]
    cv = KFold(5, shuffle=True, random_state=0)
    scores = {a: -cross_val_score(make_pipeline(PolynomialFeatures(10), StandardScaler(), Ridge(alpha=a)), X, y, cv=cv, scoring="neg_root_mean_squared_error").mean() for a in alphas}
    assert best_alpha(X, y, alphas, 0) == min(scores, key=scores.get)

def test_not_extreme():
    """Neither no penalty nor a huge penalty wins"""
    X, y = data()
    assert best_alpha(X, y, [1e-9, 0.001, 0.01, 0.1, 1000], 0) not in (1e-9, 1000)
:::

:::quiz cv-quiz Quick check
? Training error is very low, validation error is high. The model is:
- [x] Overfitting (high variance)
- [ ] Underfitting (high bias)
- [ ] Well fitted
> The gap is the warning sign.

? Why use k-fold cross-validation instead of one split?
- [x] It uses all data for validation once and gives a more reliable estimate, with a measure of its spread
- [ ] It's faster
- [ ] It removes the need for a test set
> You still need an untouched test set for the final number.

? What does increasing `alpha` in Ridge do?
- [x] Shrinks weights more strongly, making the model simpler
- [ ] Makes the model more flexible
- [ ] Adds more features
> Stronger penalty, smaller weights.

? You tuned your model by repeatedly checking the test set. What's the problem?
- [x] The test score is now optimistic: you've effectively fitted to the test set
- [ ] Nothing
- [ ] The model trains more slowly
> Keep the test set for one final evaluation.
:::
