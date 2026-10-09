---
title: Pipelines and feature engineering
summary: Combine preprocessing and models into one leak-proof object with Pipeline and ColumnTransformer, handle missing values and categories, and engineer better features.
minutes: 55
kind: lesson
---

Real datasets mix numbers, categories and missing values, and need several preprocessing steps before a model can use them. Doing those steps by hand is error-prone, and it's the most common source of **data leakage** in ML projects. scikit-learn's pipelines solve both problems.

## The leakage trap

Suppose you standardise all your data, *then* split it into train and test. The scaler's mean and standard deviation were computed using the test rows too, so a little information about the test set has leaked into training. With scaling the effect is small; with steps like imputation, feature selection or target encoding, it can make a useless model look excellent.

The rule: **every step that learns from data must learn only from the training data**, and then be applied unchanged to validation and test data. Pipelines enforce this automatically, including inside cross-validation.

## Pipeline

A `Pipeline` chains steps; the last one is the model. Calling `fit` fits each step in order on the training data; `predict` pushes new data through the same fitted steps:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
pipe = Pipeline([
    ("scale", StandardScaler()),
    ("model", LogisticRegression(max_iter=1000)),
])
scores = cross_val_score(pipe, X, y, cv=5)      # the scaler is refitted inside every fold: no leakage
print(f"CV accuracy {scores.mean():.3f}")
pipe.fit(X, y)
print(pipe.named_steps["model"].coef_.shape)
```

`make_pipeline(StandardScaler(), LogisticRegression())` is a shortcut that names the steps automatically (`standardscaler`, `logisticregression`).

## ColumnTransformer: different steps for different columns

Numeric columns need scaling and imputation; categorical columns need encoding. `ColumnTransformer` applies the right steps to each group of columns and glues the results together:

```python
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

houses = pd.read_csv("data/houses.csv")
rng = np.random.default_rng(0)
houses.loc[rng.random(len(houses)) < 0.1, "age_years"] = np.nan      # simulate some missing ages

numeric = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
categorical = ["neighbourhood"]

preprocess = ColumnTransformer([
    ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric),
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
])
model = Pipeline([("prep", preprocess), ("reg", LinearRegression())])

X, y = houses[numeric + categorical], houses["price"]
mae = -cross_val_score(model, X, y, cv=KFold(5, shuffle=True, random_state=0), scoring="neg_mean_absolute_error").mean()
print(f"CV MAE £{mae:,.0f}")

model.fit(X, y)
print(model.named_steps["prep"].get_feature_names_out())
```

- `SimpleImputer` fills missing values with a statistic learned from the training data (`mean`, `median`, `most_frequent` or a constant).
- `OneHotEncoder(handle_unknown="ignore")` learns the categories seen in training and encodes an unseen category as all zeros instead of crashing, which matters in production.
- The whole thing is **one object**: fit it, cross-validate it, tune it, save it, deploy it.

## Feature engineering

Better features usually beat fancier models. Feature engineering means using domain knowledge to create inputs that make the pattern easier to learn:

| Idea | Example |
| --- | --- |
| Ratios and differences | price per m², goal difference, home rating minus away rating |
| Transformations | log of skewed values (prices, incomes), square roots of counts |
| Date parts | day of week, month, days since last match (rest days) |
| Aggregates over history | rolling form, season-to-date averages (always shifted!) |
| Interactions | size × neighbourhood quality |
| Binning | age groups, odds bands |

`FunctionTransformer` puts your own feature code inside a pipeline:

```python
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, cross_val_score
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

def add_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["log_size"] = np.log(df["size_sqm"])
    df["rooms"] = df["bedrooms"] + df["bathrooms"]
    df["near_centre"] = (df["distance_km"] < 3).astype(int)
    return df

houses = pd.read_csv("data/houses.csv")
X, y = houses.drop(columns=["price"]), houses["price"]

numeric = ["size_sqm", "log_size", "rooms", "age_years", "distance_km", "near_centre", "has_garden"]
model = Pipeline([
    ("features", FunctionTransformer(add_features)),
    ("prep", ColumnTransformer([
        ("num", StandardScaler(), numeric),
        ("cat", OneHotEncoder(handle_unknown="ignore"), ["neighbourhood"]),
    ])),
    ("reg", LinearRegression()),
])
mae = -cross_val_score(model, X, y, cv=KFold(5, shuffle=True, random_state=0), scoring="neg_mean_absolute_error").mean()
print(f"with engineered features: CV MAE £{mae:,.0f}")
```

Because `add_features` only looks at each row's own values, it can't leak. Features that look across rows (rolling averages, group means, target encoding) need more care: compute them from the past only, or inside the training fold.

:::tip The most valuable features come from understanding the problem
For football, domain knowledge suggests team strength (ratings), recent form, rest days, travel and injuries. For fraud, transaction velocity and deviations from a customer's usual behaviour. Talking to people who know the domain is often the fastest way to a better model.
:::

## Practice

:::exercise pipe-build Build a preprocessing pipeline
Write `build_model(numeric, categorical)` returning a `Pipeline` with:

1. a step named `"prep"`: a `ColumnTransformer` that imputes numeric columns with the **median** then standardises them, and one-hot encodes categorical columns with `handle_unknown="ignore"`
2. a step named `"model"`: `LogisticRegression(max_iter=1000)`

@@starter
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

def build_model(numeric, categorical):
    return Pipeline([("model", LogisticRegression(max_iter=1000))])

@@solution
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

def build_model(numeric, categorical):
    prep = ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric),
        ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
    ])
    return Pipeline([("prep", prep), ("model", LogisticRegression(max_iter=1000))])

@@tests
import numpy as np
import pandas as pd

def data():
    rng = np.random.default_rng(0)
    n = 400
    df = pd.DataFrame({
        "x1": rng.normal(size=n),
        "x2": rng.normal(10, 5, size=n),
        "colour": rng.choice(["red", "green", "blue"], size=n),
    })
    y = ((df["x1"] + (df["colour"] == "red") * 1.5 + rng.normal(0, 0.5, n)) > 0.5).astype(int)
    df.loc[rng.random(n) < 0.1, "x2"] = np.nan
    return df, y

def test_steps():
    """Has prep and model steps"""
    model = build_model(["x1", "x2"], ["colour"])
    assert list(model.named_steps) == ["prep", "model"]

def test_handles_missing_and_categories():
    """Fits with missing values and predicts unseen categories"""
    df, y = data()
    model = build_model(["x1", "x2"], ["colour"]).fit(df.iloc[:300], y.iloc[:300])
    assert model.score(df.iloc[300:], y.iloc[300:]) > 0.75
    new = pd.DataFrame({"x1": [0.0], "x2": [np.nan], "colour": ["purple"]})
    assert model.predict_proba(new).shape == (1, 2)
:::

:::exercise pipe-leak Spot the leak
The function `leaky_score` standardises and selects the 5 features most correlated with the target **before** cross-validating, a classic leak. On pure noise it reports impressive accuracy.

Write `honest_score(X, y)` that does the same steps **inside** a pipeline (`StandardScaler()`, `SelectKBest(f_classif, k=5)`, `LogisticRegression(max_iter=1000)`) and returns the mean 5-fold CV accuracy, rounded to 3 decimals.

@@starter
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def leaky_score(X, y):
    X_scaled = StandardScaler().fit_transform(X)
    X_selected = SelectKBest(f_classif, k=5).fit_transform(X_scaled, y)
    return round(cross_val_score(LogisticRegression(max_iter=1000), X_selected, y, cv=5).mean(), 3)

def honest_score(X, y):
    return leaky_score(X, y)

rng = np.random.default_rng(0)
X_noise = rng.normal(size=(50, 5000))
y_noise = rng.integers(0, 2, size=50)
print("leaky:", leaky_score(X_noise, y_noise))
print("honest:", honest_score(X_noise, y_noise))

@@solution
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def leaky_score(X, y):
    X_scaled = StandardScaler().fit_transform(X)
    X_selected = SelectKBest(f_classif, k=5).fit_transform(X_scaled, y)
    return round(cross_val_score(LogisticRegression(max_iter=1000), X_selected, y, cv=5).mean(), 3)

def honest_score(X, y):
    pipe = make_pipeline(StandardScaler(), SelectKBest(f_classif, k=5), LogisticRegression(max_iter=1000))
    return round(cross_val_score(pipe, X, y, cv=5).mean(), 3)

rng = np.random.default_rng(0)
X_noise = rng.normal(size=(50, 5000))
y_noise = rng.integers(0, 2, size=50)
print("leaky:", leaky_score(X_noise, y_noise))
print("honest:", honest_score(X_noise, y_noise))

@@tests
import numpy as np

def test_noise_is_honest():
    """On pure noise, the honest score is near chance and well below the leaky one"""
    rng = np.random.default_rng(0)
    X = rng.normal(size=(50, 5000))
    y = rng.integers(0, 2, size=50)
    honest = honest_score(X, y)
    assert honest < 0.7, honest
    assert leaky_score(X, y) - honest > 0.2

def test_uses_pipeline():
    """Puts the steps in a pipeline"""
    assert "make_pipeline" in source.split("def honest_score")[1] or "Pipeline(" in source.split("def honest_score")[1]
:::

:::quiz pipe-quiz Quick check
? Why fit preprocessing steps inside a pipeline during cross-validation?
- [x] So each fold's preprocessing learns only from that fold's training data, preventing leakage
- [ ] It's faster
- [ ] Pipelines give higher scores
> Honest scores, not higher ones.

? What does `OneHotEncoder(handle_unknown="ignore")` do with a category it never saw in training?
- [x] Encodes it as all zeros instead of raising an error
- [ ] Raises an error
- [ ] Adds a new column
> Important when new categories appear in production.

? Which feature can't leak, even if computed before splitting?
- [x] The log of each house's own size
- [ ] Each neighbourhood's average price
- [ ] Each team's average goals over the whole season
> Row-wise transformations don't use other rows; group statistics do.

? Selecting the "best" features using all the data, then cross-validating, tends to:
- [x] Overestimate performance, sometimes dramatically
- [ ] Underestimate performance
- [ ] Make no difference
> The exercise above shows it on pure noise.
:::
