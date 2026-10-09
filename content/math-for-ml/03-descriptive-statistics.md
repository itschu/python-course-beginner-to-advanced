---
title: Describing data and relationships
summary: Centre, spread, percentiles and outliers; covariance and correlation; and why correlation is not causation.
minutes: 45
kind: lesson
---

Before modelling anything, you describe it: what's typical, how much it varies, and what moves together. These summaries also become features and diagnostics for models.

## Centre: mean, median, mode

```python
import numpy as np
import pandas as pd

houses = pd.read_csv("data/houses.csv")
price = houses["price"]
print(f"mean £{price.mean():,.0f}, median £{price.median():,.0f}")
print("most common bedroom count:", houses["bedrooms"].mode()[0])

incomes = np.array([28, 31, 30, 35, 29, 33, 1_000])    # £k, one billionaire in the room
print(f"mean {incomes.mean():.0f}, median {np.median(incomes):.0f}")
```

The mean is pulled by extreme values; the median isn't. When data is **skewed** (house prices, incomes, transaction sizes) the median is usually the more honest "typical" value.

## Spread: variance, standard deviation, percentiles

```python
import pandas as pd

houses = pd.read_csv("data/houses.csv")
price = houses["price"]
print(f"std £{price.std():,.0f}")
print(price.quantile([0.05, 0.25, 0.5, 0.75, 0.95]).map("£{:,.0f}".format))
iqr = price.quantile(0.75) - price.quantile(0.25)
print(f"IQR (middle 50%) £{iqr:,.0f}")
print(f"skew {price.skew():.2f}")    # > 0: a long right tail
```

The **interquartile range** (IQR), the spread of the middle 50%, is robust to outliers. A common rule flags values more than 1.5 × IQR beyond the quartiles as potential outliers:

```python
import pandas as pd

price = pd.read_csv("data/houses.csv")["price"]
q1, q3 = price.quantile([0.25, 0.75])
iqr = q3 - q1
outliers = price[(price < q1 - 1.5 * iqr) | (price > q3 + 1.5 * iqr)]
print(len(outliers), "potential outliers, e.g.", outliers.sort_values().tail(3).tolist())
```

Outliers aren't automatically errors. Investigate before you delete: the biggest houses are real, just rare.

## Standardising: z-scores

A **z-score** says how many standard deviations a value is from the mean. It puts different measurements on one scale:

```python
import pandas as pd

houses = pd.read_csv("data/houses.csv")
z = (houses["price"] - houses["price"].mean()) / houses["price"].std()
print(z.describe().round(2))
print(houses.loc[z.idxmax(), ["size_sqm", "neighbourhood", "price"]])
```

## Covariance and correlation

**Covariance** measures whether two variables move together, but its size depends on the units. **Correlation** (Pearson's $r$) rescales it to between −1 and 1:

$$
r = \frac{\text{cov}(X, Y)}{\sigma_X \, \sigma_Y}
$$

- $r = 1$: a perfect upward straight line; $r = -1$: perfect downward; $r = 0$: no *linear* relationship.

```python
import pandas as pd

houses = pd.read_csv("data/houses.csv")
cols = ["size_sqm", "bedrooms", "age_years", "distance_km", "price"]
print(houses[cols].corr().round(2))
print()
print(houses[cols].corr()["price"].drop("price").sort_values().round(2))
```

Size correlates strongly with price; distance and age correlate negatively. Bedrooms and size correlate with each other, too, which matters for modelling: features that carry the same information can confuse some models (**multicollinearity**).

```python
import matplotlib.pyplot as plt
import pandas as pd

houses = pd.read_csv("data/houses.csv")
fig, axes = plt.subplots(1, 3, figsize=(11, 3.2), sharey=True)
for ax, col in zip(axes, ["size_sqm", "distance_km", "age_years"]):
    r = houses[col].corr(houses["price"])
    ax.scatter(houses[col], houses["price"] / 1000, s=6, alpha=0.5)
    ax.set_title(f"{col}: r = {r:.2f}")
    ax.set_xlabel(col)
axes[0].set_ylabel("price (£k)")
fig.tight_layout()
plt.show()
```

### Pearson vs Spearman

Pearson only measures *straight-line* relationships. **Spearman's** correlation works on ranks, so it captures any consistently increasing (or decreasing) relationship and is robust to outliers:

```python
import numpy as np
import pandas as pd

x = np.linspace(1, 10, 50)
df = pd.DataFrame({"x": x, "y": np.exp(x)})       # always increasing, but very curved
print(df.corr(method="pearson").iloc[0, 1].round(3), df.corr(method="spearman").iloc[0, 1].round(3))
```

## Correlation is not causation

Three reasons two things can be correlated without one causing the other:

1. **A confounder** causes both. Ice cream sales and drownings both rise in summer.
2. **Reverse causation.** Teams that are winning tend to have *fewer* shots late in games, because they sit back to protect the lead, not because fewer shots cause winning.
3. **Chance.** Test enough pairs of variables and some will correlate by pure luck (more on this in the hypothesis testing lesson).

For prediction, correlation is enough: a feature only needs to carry information. For decisions ("if we do X, will Y improve?") you need causal reasoning or experiments.

```python
import pandas as pd

df = pd.read_csv("data/matches.csv")
print(df[["HS", "HST", "FTHG"]].corr().round(2))
```

Shots on target correlate with goals more than total shots do. That's a useful hint about which feature to use.

## Practice

:::exercise desc-summary A robust summary
Write `robust_summary(values)` that takes a pandas Series and returns a dictionary with `"mean"`, `"median"`, `"std"`, `"iqr"` and `"n_outliers"` (values more than 1.5 × IQR below Q1 or above Q3). Round floats to 2 decimals; `n_outliers` is an int.

@@starter
import pandas as pd

def robust_summary(values):
    return {}

@@solution
import pandas as pd

def robust_summary(values):
    q1, q3 = values.quantile([0.25, 0.75])
    iqr = q3 - q1
    outliers = (values < q1 - 1.5 * iqr) | (values > q3 + 1.5 * iqr)
    return {
        "mean": round(values.mean(), 2),
        "median": round(values.median(), 2),
        "std": round(values.std(), 2),
        "iqr": round(iqr, 2),
        "n_outliers": int(outliers.sum()),
    }

@@tests
import pandas as pd

def test_small():
    """A small example with one outlier"""
    got = robust_summary(pd.Series([1, 2, 3, 4, 5, 6, 7, 8, 100]))
    assert got["median"] == 5 and got["n_outliers"] == 1
    assert got["iqr"] == 4.0
    assert got["mean"] == round(136 / 9, 2)

def test_houses():
    """Works on house prices"""
    p = pd.read_csv("data/houses.csv")["price"]
    got = robust_summary(p)
    assert got["median"] == round(p.median(), 2) and got["std"] == round(p.std(), 2)
:::

:::exercise desc-corr Strongest correlations
Write `top_correlations(df, target, n)`: return a pandas Series of the `n` numeric columns (excluding `target`) with the largest **absolute** Pearson correlation with `target`, sorted by absolute value (largest first), keeping the sign of each correlation, rounded to 3 decimals.

@@starter
import pandas as pd

def top_correlations(df, target, n):
    return pd.Series(dtype=float)

@@solution
import pandas as pd

def top_correlations(df, target, n):
    corr = df.select_dtypes("number").corr()[target].drop(target)
    order = corr.abs().sort_values(ascending=False).index[:n]
    return corr[order].round(3)

@@tests
import pandas as pd

def test_houses():
    """Finds the strongest relationships with price"""
    df = pd.read_csv("data/houses.csv")
    got = top_correlations(df, "price", 3)
    corr = df.select_dtypes("number").corr()["price"].drop("price")
    exp = corr[corr.abs().sort_values(ascending=False).index[:3]].round(3)
    assert list(got.index) == list(exp.index), list(got.index)
    assert got.tolist() == exp.tolist()

def test_keeps_sign():
    """Keeps negative correlations negative"""
    df = pd.DataFrame({"y": [1, 2, 3, 4], "a": [4, 3, 2, 1], "b": [1, 1, 2, 1]})
    got = top_correlations(df, "y", 1)
    assert got.index[0] == "a" and got.iloc[0] == -1.0
:::

:::quiz desc-quiz Quick check
? Which summary of "typical" house price is least affected by a few mansions?
- [ ] Mean
- [x] Median
- [ ] Standard deviation
> The median is robust to extreme values.

? A correlation of r = -0.8 means:
- [x] A strong tendency for one variable to fall as the other rises
- [ ] Almost no relationship
- [ ] One variable causes the other to fall
> Correlation says nothing about causation.

? Two variables have Pearson r = 0. Could they still be strongly related?
- [x] Yes, the relationship could be non-linear (e.g. U-shaped)
- [ ] No
> Always plot your data.

? Ice cream sales and sunburn are correlated. The most likely explanation?
- [x] A confounder: sunny weather causes both
- [ ] Ice cream causes sunburn
- [ ] Pure chance
> Look for a third variable that drives both.
:::
