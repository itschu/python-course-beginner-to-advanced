---
title: Hyperparameter tuning and saving models
summary: Search for good settings with GridSearchCV and RandomizedSearchCV, avoid overfitting the search itself, then save and reload trained models with joblib.
minutes: 45
kind: lesson
---

**Hyperparameters** are the settings you choose before training (tree depth, regularisation strength, learning rate), as opposed to the **parameters** a model learns. Choosing them well can matter a lot, and choosing them by peeking at the test set is one of the most common mistakes in ML.

## GridSearchCV

`GridSearchCV` tries every combination in a grid, scoring each with cross-validation on the training data, then refits the best one on all of the training data:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

pipe = make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000))
grid = {
    "logisticregression__C": [0.01, 0.1, 1, 10],
    "logisticregression__l1_ratio": [0, 1],
    "logisticregression__solver": ["saga"],
}
search = GridSearchCV(pipe, grid, cv=5, scoring="neg_log_loss")
search.fit(X_train, y_train)

print("best settings:", search.best_params_)
print(f"best CV log loss: {-search.best_score_:.3f}")
print(f"test log loss of the refitted best model: {-search.score(X_test, y_test):.3f}")
```

Parameters inside a pipeline are addressed as `stepname__parameter`. After fitting, `search` behaves like the best model (`search.predict(...)`, `search.best_estimator_`).

The full results are in `cv_results_`, which is worth inspecting: if several settings score about the same, prefer the simplest.

```python
import pandas as pd
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import GridSearchCV
from sklearn.tree import DecisionTreeClassifier

X, y = load_breast_cancer(return_X_y=True)
search = GridSearchCV(DecisionTreeClassifier(random_state=0),
                      {"max_depth": [2, 3, 4, 6, None], "min_samples_leaf": [1, 5, 20]}, cv=5).fit(X, y)
results = pd.DataFrame(search.cv_results_)[["param_max_depth", "param_min_samples_leaf", "mean_test_score", "std_test_score"]]
print(results.sort_values("mean_test_score", ascending=False).head(6).round(3).to_string(index=False))
```

## RandomizedSearchCV

Grids explode combinatorially: 5 values each of 4 hyperparameters is 625 combinations times 5 folds. **Random search** samples a fixed number of combinations from distributions instead, and usually finds settings as good as a grid in a fraction of the time:

```python
from scipy.stats import loguniform, randint
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import RandomizedSearchCV

X, y = load_breast_cancer(return_X_y=True)
distributions = {
    "learning_rate": loguniform(0.01, 0.3),
    "max_leaf_nodes": randint(8, 64),
    "min_samples_leaf": randint(5, 50),
    "l2_regularization": loguniform(1e-3, 10),
}
search = RandomizedSearchCV(HistGradientBoostingClassifier(max_iter=100, random_state=0), distributions,
                            n_iter=10, cv=3, scoring="neg_log_loss", random_state=0)
search.fit(X, y)
print({k: round(v, 3) if isinstance(v, float) else v for k, v in search.best_params_.items()})
print(f"best CV log loss: {-search.best_score_:.3f}")
```

Use log-uniform distributions for parameters that vary over orders of magnitude, like learning rates and regularisation strengths.

## Don't overfit the search

Tuning is itself a form of learning, so it can overfit too: try enough settings and one will look good on your validation folds by luck. Practical rules:

- Keep a **test set** that the search never sees, and evaluate the final model on it once.
- Prefer **simpler** settings when scores are within noise of each other (look at `std_test_score`).
- Don't tune endlessly. The gains from tuning are usually much smaller than the gains from better features or more data.
- For a fully honest estimate of a tuned model's performance, use **nested cross-validation**: an inner CV loop for tuning inside an outer CV loop for evaluation.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
inner = GridSearchCV(make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)),
                     {"logisticregression__C": [0.01, 0.1, 1, 10]}, cv=4)
outer_scores = cross_val_score(inner, X, y, cv=5)      # tuning happens inside each outer fold
print(f"nested CV accuracy: {outer_scores.mean():.3f} ± {outer_scores.std():.3f}")
```

## Saving and loading models

Training can take minutes or hours; predictions should be instant. Save the fitted model (the whole pipeline, preprocessing included) with **joblib**:

```python
import joblib
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X, y)

joblib.dump(model, "cancer_model.joblib")
loaded = joblib.load("cancer_model.joblib")
print("same predictions:", (loaded.predict(X[:10]) == model.predict(X[:10])).all())
```

Things to know:

- Save the **pipeline**, not just the final estimator, so new data gets exactly the same preprocessing.
- Load models only from sources you trust: joblib/pickle files can run arbitrary code when loaded.
- Record the library versions alongside the model. A model saved with one scikit-learn version may not load in another. Phase 6 covers versioning and experiment tracking, and Phase 8 serves a saved model behind an API.

## Practice

:::exercise tune-grid Tune a random forest
Write `tune_forest(X, y, seed)` that runs `GridSearchCV` on `RandomForestClassifier(n_estimators=50, random_state=seed)` over `max_depth` in `[3, 6, None]` and `min_samples_leaf` in `[1, 10]`, with `cv=4` and `scoring="neg_log_loss"`. Return a tuple `(best_params, best_log_loss)` where the log loss is positive and rounded to 4 decimals.

@@starter
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV

def tune_forest(X, y, seed):
    return ({}, 0.0)

@@solution
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV

def tune_forest(X, y, seed):
    search = GridSearchCV(
        RandomForestClassifier(n_estimators=50, random_state=seed),
        {"max_depth": [3, 6, None], "min_samples_leaf": [1, 10]},
        cv=4, scoring="neg_log_loss",
    )
    search.fit(X, y)
    return (search.best_params_, round(-search.best_score_, 4))

@@tests
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV

def test_reference():
    """Matches a reference search"""
    X, y = load_breast_cancer(return_X_y=True)
    ref = GridSearchCV(RandomForestClassifier(n_estimators=50, random_state=1), {"max_depth": [3, 6, None], "min_samples_leaf": [1, 10]}, cv=4, scoring="neg_log_loss").fit(X, y)
    params, ll = tune_forest(X, y, 1)
    assert params == ref.best_params_ and ll == round(-ref.best_score_, 4)
    assert 0 < ll < 0.3
:::

:::exercise tune-save Save, load and predict
Write `save_and_reload(model, path)` that saves a fitted model with `joblib.dump`, loads it back, and returns the loaded model. Then write `predict_from_file(path, X)` that loads the model at `path` and returns `predict_proba(X)[:, 1]`.

@@starter
import joblib

def save_and_reload(model, path):
    return model

def predict_from_file(path, X):
    return None

@@solution
import joblib

def save_and_reload(model, path):
    joblib.dump(model, path)
    return joblib.load(path)

def predict_from_file(path, X):
    return joblib.load(path).predict_proba(X)[:, 1]

@@tests
import os
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def test_round_trip():
    """The reloaded model predicts identically"""
    X, y = load_breast_cancer(return_X_y=True)
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X, y)
    loaded = save_and_reload(model, "m.joblib")
    assert loaded is not model and os.path.exists("m.joblib")
    assert np.allclose(loaded.predict_proba(X), model.predict_proba(X))
    assert np.allclose(predict_from_file("m.joblib", X[:5]), model.predict_proba(X[:5])[:, 1])
:::

:::quiz tune-quiz Quick check
? What's the difference between a parameter and a hyperparameter?
- [x] Parameters are learned from data (weights); hyperparameters are set before training (depth, C)
- [ ] There's no difference
- [ ] Hyperparameters are learned by the model
> GridSearchCV searches over hyperparameters.

? How do you refer to `C` of a step called `logisticregression` in a pipeline grid?
- [x] `logisticregression__C`
- [ ] `C`
- [ ] `logisticregression.C`
> Two underscores separate the step name from the parameter.

? Why is random search often preferred over grid search?
- [x] It explores many hyperparameters efficiently with a fixed budget
- [ ] It always finds the exact best setting
- [ ] It doesn't use cross-validation
> Most hyperparameters matter little; random search spends its budget more wisely.

? What should you save to deploy a model?
- [x] The whole fitted pipeline, including preprocessing
- [ ] Only the final estimator
- [ ] Only the training data
> New data must go through exactly the same preprocessing.
:::
