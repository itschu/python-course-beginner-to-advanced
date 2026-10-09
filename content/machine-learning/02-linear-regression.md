---
title: Linear regression in practice
summary: Fit and interpret linear models, encode categories, check residuals, add non-linear features, and measure errors with MAE, RMSE and R².
minutes: 55
kind: lesson
---

Linear regression is the workhorse of statistics and the first model to try for any numeric target. It's fast, it's interpretable, and it makes a strong baseline that fancier models must beat.

The model predicts a weighted sum of the features:

$$
\hat{y} = w_0 + w_1 x_1 + w_2 x_2 + \dots + w_d x_d
$$

and chooses the weights that minimise the squared errors on the training data. You derived the solution in Phase 4.

## Fitting and interpreting

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split

houses = pd.read_csv("data/houses.csv")
features = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X_train, X_test, y_train, y_test = train_test_split(houses[features], houses["price"], test_size=0.25, random_state=0)

model = LinearRegression().fit(X_train, y_train)
coefficients = pd.Series(model.coef_, index=features).round(0)
print(coefficients)
print("intercept:", round(model.intercept_))
```

Read each coefficient as: *the change in predicted price for a one-unit increase in that feature, holding the other features fixed*. So each extra m² adds about £2,100, each extra bathroom about £17,000, and each km from the centre costs nearly £4,000.

Be careful with interpretation:

- **Correlated features share credit.** `bedrooms` and `size_sqm` move together, so their individual coefficients can be unstable or even have surprising signs. The *predictions* are still fine.
- **Coefficients aren't causal.** Adding a bedroom by dividing a room wouldn't necessarily raise the value by that amount.
- **Scale matters for comparing coefficients.** To compare importance, standardise the features first, or use the permutation importance you'll meet later.

## Regression metrics

| Metric | Formula | Meaning |
| --- | --- | --- |
| MAE | mean of $\lvert y - \hat{y}\rvert$ | typical error, in the target's units; robust to outliers |
| RMSE | $\sqrt{\text{mean of } (y - \hat{y})^2}$ | like MAE but punishes big errors more |
| R² | $1 - \frac{\text{SSE}}{\text{total variance}}$ | share of variation explained; 1 is perfect, 0 is no better than predicting the mean |

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import train_test_split

houses = pd.read_csv("data/houses.csv")
features = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X_train, X_test, y_train, y_test = train_test_split(houses[features], houses["price"], test_size=0.25, random_state=0)
pred = LinearRegression().fit(X_train, y_train).predict(X_test)

print(f"MAE  £{mean_absolute_error(y_test, pred):,.0f}")
print(f"RMSE £{root_mean_squared_error(y_test, pred):,.0f}")
print(f"R²   {r2_score(y_test, pred):.3f}")
```

Report errors in the target's units (pounds, goals) whenever you can. "The model is typically off by £36,000" means something to everyone; an R² on its own doesn't.

## Categorical features: one-hot encoding

Models need numbers, but `neighbourhood` is text. You can't just number the categories (1 = Central, 2 = Riverside...), because that invents a fake order. Instead, **one-hot encode**: one 0/1 column per category:

```python
import pandas as pd

houses = pd.read_csv("data/houses.csv")
encoded = pd.get_dummies(houses[["neighbourhood"]], drop_first=True, dtype=int)
print(encoded.head())
print(encoded.columns.tolist())
```

`drop_first=True` drops one category (it becomes the reference level), since its column would be redundant for a linear model. In a pipeline you'll use scikit-learn's `OneHotEncoder` instead, which remembers the categories it saw during training.

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

houses = pd.read_csv("data/houses.csv")
numeric = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X = pd.concat([houses[numeric], pd.get_dummies(houses["neighbourhood"], drop_first=True, dtype=int)], axis=1)
X_train, X_test, y_train, y_test = train_test_split(X, houses["price"], test_size=0.25, random_state=0)

model = LinearRegression().fit(X_train, y_train)
print(f"MAE with neighbourhood: £{mean_absolute_error(y_test, model.predict(X_test)):,.0f}")
print(pd.Series(model.coef_, index=X.columns).round(0).tail(4))
```

Adding the neighbourhood cuts the error noticeably. The neighbourhood coefficients are relative to the dropped reference category (Central).

## Residuals: what the model gets wrong

A **residual** is actual minus predicted. Plotting residuals against predictions reveals problems that a single score hides:

```python
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split

houses = pd.read_csv("data/houses.csv")
numeric = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X = pd.concat([houses[numeric], pd.get_dummies(houses["neighbourhood"], drop_first=True, dtype=int)], axis=1)
X_train, X_test, y_train, y_test = train_test_split(X, houses["price"], test_size=0.25, random_state=0)
pred = LinearRegression().fit(X_train, y_train).predict(X_test)
residuals = y_test - pred

fig, ax = plt.subplots(figsize=(6, 3.5))
ax.scatter(pred / 1000, residuals / 1000, s=10, alpha=0.6)
ax.axhline(0, color="black", linewidth=1)
ax.set_xlabel("Predicted price (£k)")
ax.set_ylabel("Residual (£k)")
ax.set_title("Errors grow with price")
fig.tight_layout()
plt.show()
```

The spread fans out as prices rise: errors tend to be larger for expensive homes. A common remedy is to **model the log of the target**, so the model predicts percentage differences rather than pound differences. Whether it helps depends on what you measure:

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

houses = pd.read_csv("data/houses.csv")
numeric = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X = pd.concat([houses[numeric], pd.get_dummies(houses["neighbourhood"], drop_first=True, dtype=int)], axis=1)
X_train, X_test, y_train, y_test = train_test_split(X, houses["price"], test_size=0.25, random_state=0)

plain = LinearRegression().fit(X_train, y_train).predict(X_test)
logged = np.exp(LinearRegression().fit(X_train, np.log(y_train)).predict(X_test))
for name, pred in [("plain target", plain), ("log target", logged)]:
    mae = mean_absolute_error(y_test, pred)
    pct = np.mean(np.abs(y_test - pred) / y_test)
    print(f"{name}: MAE £{mae:,.0f}, mean percentage error {pct:.1%}")
```

On this data the two are close: the log model tends to do a little better on percentage error and a little worse in pounds, and which wins changes with the random split. There's no free lunch. Choose the transformation by the metric that matters for your decision, and compare options with cross-validation (lesson 5) rather than a single split.

## Non-linear relationships

Linear regression is linear in its **weights**, not necessarily in the original features. Add transformed features, such as squares, logs or interactions, and it can fit curves:

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures

rng = np.random.default_rng(0)
x = np.sort(rng.uniform(0, 6, 80))
y = np.sin(x) + rng.normal(0, 0.2, 80)
X = x.reshape(-1, 1)

fig, ax = plt.subplots(figsize=(6, 3.5))
ax.scatter(x, y, s=12, color="grey")
for degree in [1, 3]:
    model = make_pipeline(PolynomialFeatures(degree), LinearRegression()).fit(X, y)
    ax.plot(x, model.predict(X), label=f"degree {degree}")
ax.legend()
ax.set_title("Polynomial features let a linear model bend")
fig.tight_layout()
plt.show()
```

More flexibility isn't free: with too many features, the model starts fitting noise. That's overfitting, the subject of lesson 5.

## Practice

:::exercise lr-metrics Regression report
Write `regression_report(y_true, y_pred)` returning a dictionary with `"mae"`, `"rmse"` and `"r2"`, using scikit-learn's metric functions, each rounded to 3 decimals.

@@starter
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error

def regression_report(y_true, y_pred):
    return {}

@@solution
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error

def regression_report(y_true, y_pred):
    return {
        "mae": round(mean_absolute_error(y_true, y_pred), 3),
        "rmse": round(root_mean_squared_error(y_true, y_pred), 3),
        "r2": round(r2_score(y_true, y_pred), 3),
    }

@@tests
def test_values():
    """Known values"""
    got = regression_report([3, 5, 7, 9], [2, 5, 8, 11])
    assert got == {"mae": 1.0, "rmse": round((6 / 4) ** 0.5, 3), "r2": round(1 - 6 / 20, 3)}, got

def test_perfect():
    """Perfect predictions"""
    assert regression_report([1, 2, 3], [1, 2, 3]) == {"mae": 0.0, "rmse": 0.0, "r2": 1.0}
:::

:::exercise lr-encode Encode and fit
Write `fit_house_model(houses, seed)`:

1. Build `X` from the numeric columns `size_sqm`, `bedrooms`, `bathrooms`, `age_years`, `distance_km`, `has_garden`, plus one-hot columns for `neighbourhood` (`pd.get_dummies(..., drop_first=True, dtype=int)`).
2. Split 75/25 with `random_state=seed`.
3. Fit `LinearRegression` on the **log** of the price.
4. Return the test MAE in pounds (convert predictions back with `np.exp`), rounded to the nearest pound as an int.

@@starter
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

def fit_house_model(houses, seed):
    return 0

@@solution
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

def fit_house_model(houses, seed):
    numeric = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
    X = pd.concat([houses[numeric], pd.get_dummies(houses["neighbourhood"], drop_first=True, dtype=int)], axis=1)
    X_train, X_test, y_train, y_test = train_test_split(X, houses["price"], test_size=0.25, random_state=seed)
    model = LinearRegression().fit(X_train, np.log(y_train))
    return int(round(mean_absolute_error(y_test, np.exp(model.predict(X_test)))))

@@tests
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

def reference(houses, seed):
    num = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
    X = pd.concat([houses[num], pd.get_dummies(houses["neighbourhood"], drop_first=True, dtype=int)], axis=1)
    a, b, c, d = train_test_split(X, houses["price"], test_size=0.25, random_state=seed)
    m = LinearRegression().fit(a, np.log(c))
    return int(round(mean_absolute_error(d, np.exp(m.predict(b)))))

def test_reference():
    """Matches the expected MAE"""
    houses = pd.read_csv("data/houses.csv")
    assert fit_house_model(houses, 3) == reference(houses, 3)

def test_better_than_plain():
    """Beats a plain model without neighbourhood"""
    houses = pd.read_csv("data/houses.csv")
    Xtr, Xte, ytr, yte = train_test_split(houses[["size_sqm", "age_years"]], houses["price"], test_size=0.25, random_state=3)
    plain = mean_absolute_error(yte, LinearRegression().fit(Xtr, ytr).predict(Xte))
    assert fit_house_model(houses, 3) < plain
:::

:::quiz lr-quiz Quick check
? A coefficient of 2,600 on `size_sqm` means:
- [x] Each extra m² adds about £2,600 to the predicted price, holding other features fixed
- [ ] Size causes price to rise by £2,600
- [ ] Size is the most important feature
> Interpretation is "holding other features fixed", and not causal.

? Why not encode neighbourhoods as 1, 2, 3, 4, 5?
- [x] It invents an order and equal spacing that don't exist
- [ ] Models can't handle integers
> One-hot encoding avoids fake ordering.

? Residuals fan out as predictions grow. What's a common thing to try?
- [x] Model the log of the target, then check whether it improves the metric you care about
- [ ] Remove the largest houses
- [ ] Use fewer features
> Logs turn multiplicative effects into additive ones, but always validate the change.

? Which metric is in the same units as the target and treats all errors equally?
- [x] MAE
- [ ] R²
- [ ] RMSE
> RMSE is also in the target's units, but it weights large errors more.
:::
