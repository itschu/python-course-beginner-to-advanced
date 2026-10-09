---
title: "Checkpoint: Machine Learning"
summary: Pipelines, evaluation, overfitting, model choice and honest validation, in one test.
minutes: 75
kind: checkpoint
---

**Passing standard:** all three exercises pass and you score at least 9/12 on the quiz.

:::quiz phase5-final Phase 5 quiz
? You're predicting whether a customer will cancel next month. That's:
- [x] Binary classification
- [ ] Regression
- [ ] Clustering
> Two possible labels.

? Training accuracy 99%, test accuracy 71%. The most likely problem?
- [x] Overfitting
- [ ] Underfitting
- [ ] Too little regularisation is impossible
> Reduce complexity, regularise, or get more data.

? Which split is right for predicting next season's matches?
- [ ] A random 80/20 split of all matches
- [x] Train on earlier seasons, test on the later season
> Random splits let the model learn from the future.

? Which metric should you use to compare two betting models' probabilities?
- [ ] Accuracy
- [x] Log loss (or Brier score)
- [ ] R²
> Proper scoring rules judge probabilities.

? What's wrong with scaling the full dataset before cross-validation?
- [x] The scaler learns from the validation folds, leaking information
- [ ] Nothing
- [ ] Scaling must come after the model
> Put preprocessing in a pipeline.

? In `GridSearchCV`, how is the "best" model chosen?
- [x] By the mean cross-validated score on the training data
- [ ] By the test score
- [ ] At random
> The test set should never be used for choices.

? A random forest beats logistic regression on training data but loses on test data. Which do you deploy?
- [x] Logistic regression
- [ ] The random forest
> Test performance is what matters.

? Which models need feature scaling?
- [x] Logistic regression with regularisation
- [x] k-nearest neighbours
- [ ] Decision trees
- [ ] Random forests
> Trees split on thresholds, so scale doesn't matter to them.

? What does `OneHotEncoder` do?
- [x] Turns each category into its own 0/1 column
- [ ] Converts numbers into categories
- [ ] Removes rare categories
> It avoids inventing an order between categories.

? Why might gradient boosting lose to logistic regression on 700 rows?
- [x] Flexible models need more data and overfit small, noisy datasets
- [ ] Boosting can't do classification
- [ ] Logistic regression is always better
> Simple models often win on small data.

? Permutation importance measures:
- [x] How much a validation score drops when one feature's values are shuffled
- [ ] How often a feature is used in splits
- [ ] The correlation of a feature with the target
> It reflects what the model actually relies on.

? A model's 70% predictions come true 55% of the time. It is:
- [x] Overconfident (poorly calibrated)
- [ ] Underconfident
- [ ] Perfectly calibrated
> Its probabilities are too extreme.
:::

:::exercise cp5-pipeline A complete pipeline
The house data has a numeric column with missing values. Write `house_pipeline()` returning an **unfitted** pipeline that:

1. imputes and standardises the numeric columns `size_sqm`, `bedrooms`, `bathrooms`, `age_years`, `distance_km`, `has_garden` (median imputation),
2. one-hot encodes `neighbourhood` (unknown categories ignored),
3. fits `Ridge(alpha=1.0)` to the **log** of the price.

For step 3, wrap the Ridge in `TransformedTargetRegressor(regressor=Ridge(alpha=1.0), func=np.log, inverse_func=np.exp)` so `predict` returns prices in pounds.

@@starter
import numpy as np
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]

def house_pipeline():
    return Pipeline([("model", Ridge())])

@@solution
import numpy as np
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]

def house_pipeline():
    prep = ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="ignore"), ["neighbourhood"]),
    ])
    model = TransformedTargetRegressor(regressor=Ridge(alpha=1.0), func=np.log, inverse_func=np.exp)
    return Pipeline([("prep", prep), ("model", model)])

@@tests
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

def test_fits_with_missing():
    """Handles missing values and predicts prices in pounds"""
    h = pd.read_csv("data/houses.csv")
    h.loc[h.sample(frac=0.1, random_state=0).index, "age_years"] = np.nan
    X, y = h.drop(columns=["price"]), h["price"]
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=0)
    model = house_pipeline().fit(Xtr, ytr)
    pred = model.predict(Xte)
    assert pred.min() > 10_000, "predictions should be in pounds (use inverse_func=np.exp)"
    assert mean_absolute_error(yte, pred) < 30_000

def test_unseen_category():
    """Copes with a new neighbourhood"""
    h = pd.read_csv("data/houses.csv")
    model = house_pipeline().fit(h.drop(columns=["price"]), h["price"])
    row = h.drop(columns=["price"]).iloc[[0]].copy()
    row["neighbourhood"] = "Brand New Estate"
    assert model.predict(row).shape == (1,)
:::

:::exercise cp5-select Model selection, honestly
Write `select_and_test(X, y, seed)`:

1. split into 75% train and 25% test (`random_state=seed`, `stratify=y`)
2. using 5-fold CV on the **training data only** (`cross_val_score`, scoring `"neg_log_loss"`), compare: `make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))` and `RandomForestClassifier(n_estimators=200, min_samples_leaf=5, random_state=seed)`
3. refit the better one on all the training data and compute its test log loss

Return `(best_name, test_log_loss)` with `best_name` being `"logistic"` or `"forest"` and the loss rounded to 4 decimals.

@@starter
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def select_and_test(X, y, seed):
    return ("logistic", 0.0)

@@solution
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def select_and_test(X, y, seed):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=seed, stratify=y)
    candidates = {
        "logistic": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
        "forest": RandomForestClassifier(n_estimators=200, min_samples_leaf=5, random_state=seed),
    }
    cv_loss = {name: -cross_val_score(m, X_train, y_train, cv=5, scoring="neg_log_loss").mean() for name, m in candidates.items()}
    best = min(cv_loss, key=cv_loss.get)
    model = candidates[best].fit(X_train, y_train)
    return (best, round(log_loss(y_test, model.predict_proba(X_test)), 4))

@@tests
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def reference(X, y, seed):
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=seed, stratify=y)
    c = {"logistic": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
         "forest": RandomForestClassifier(n_estimators=200, min_samples_leaf=5, random_state=seed)}
    s = {k: -cross_val_score(m, Xtr, ytr, cv=5, scoring="neg_log_loss").mean() for k, m in c.items()}
    b = min(s, key=s.get)
    return (b, round(log_loss(yte, c[b].fit(Xtr, ytr).predict_proba(Xte)), 4))

def test_reference():
    """Chooses by CV on training data and reports the test loss"""
    X, y = load_breast_cancer(return_X_y=True)
    assert select_and_test(X, y, 0) == reference(X, y, 0)
:::

:::exercise cp5-text Classify text with a baseline
Write `text_vs_baseline(texts, labels, seed)`: split 75/25 (`random_state=seed`, `stratify=labels`), then return a dictionary of test accuracies, rounded to 3 decimals:

- `"baseline"`: `DummyClassifier(strategy="most_frequent")`
- `"tfidf_logistic"`: `TfidfVectorizer(ngram_range=(1, 2))` followed by `LogisticRegression(max_iter=1000)`

@@starter
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline

def text_vs_baseline(texts, labels, seed):
    return {}

@@solution
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline

def text_vs_baseline(texts, labels, seed):
    X_train, X_test, y_train, y_test = train_test_split(texts, labels, test_size=0.25, random_state=seed, stratify=labels)
    baseline = DummyClassifier(strategy="most_frequent").fit(X_train, y_train)
    model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2)), LogisticRegression(max_iter=1000)).fit(X_train, y_train)
    return {"baseline": round(baseline.score(X_test, y_test), 3), "tfidf_logistic": round(model.score(X_test, y_test), 3)}

@@tests
import pandas as pd

def test_reviews():
    """Beats the baseline by a wide margin"""
    r = pd.read_csv("data/reviews.csv")
    out = text_vs_baseline(r["review"], r["sentiment"], 2)
    assert 0.45 <= out["baseline"] <= 0.55, out
    assert out["tfidf_logistic"] > 0.95, out
:::

## Phase 5 complete

You can now build, evaluate and tune machine learning models like a professional, and, just as important, you know how models fool their builders. Phase 6 applies all of it to time-ordered data, with honest backtests, calibration, value betting and trading.
