---
title: Decision trees and random forests
summary: How trees split data, why a single tree overfits, how averaging many trees fixes it, and how to measure which features matter.
minutes: 50
kind: lesson
---

Linear models assume straight-line relationships. **Decision trees** don't: they learn a flowchart of yes/no questions, capturing non-linear patterns and interactions automatically. Combined into **forests**, they're among the most effective models for tabular data.

## A decision tree

A tree repeatedly picks the feature and threshold that best separates the training data, then repeats within each branch:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier, export_text

data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(data.data, data.target, test_size=0.25, random_state=0, stratify=data.target)

tree = DecisionTreeClassifier(max_depth=2, random_state=0).fit(X_train, y_train)
print(export_text(tree, feature_names=list(data.feature_names)))
print(f"test accuracy: {tree.score(X_test, y_test):.3f}")
```

Read it top to bottom like a flowchart. Each leaf predicts the majority class of the training examples that reach it, and `predict_proba` gives the class proportions in that leaf. Trees need no feature scaling and handle interactions ("big tumours with rough texture") naturally.

```python
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.tree import DecisionTreeClassifier, plot_tree

data = load_breast_cancer()
tree = DecisionTreeClassifier(max_depth=2, random_state=0).fit(data.data, data.target)
fig, ax = plt.subplots(figsize=(10, 5))
plot_tree(tree, feature_names=data.feature_names, class_names=data.target_names, filled=True, ax=ax, fontsize=8)
plt.show()
```

## Trees overfit

Left unconstrained, a tree keeps splitting until every leaf is pure: it memorises the training set.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=3, stratify=y)

for depth in [1, 2, 3, 5, 8, None]:
    tree = DecisionTreeClassifier(max_depth=depth, random_state=0).fit(X_train, y_train)
    print(f"max_depth={str(depth):>4}: train {tree.score(X_train, y_train):.3f}, test {tree.score(X_test, y_test):.3f}, leaves {tree.get_n_leaves()}")
```

Control complexity with `max_depth`, `min_samples_leaf` (each leaf needs at least this many examples) or `max_leaf_nodes`. Trees are also **unstable**: small changes in the data can produce a completely different tree.

## Random forests: the wisdom of crowds

A **random forest** trains many trees, each on a random bootstrap sample of the rows and considering a random subset of features at each split, then averages their predictions. Individual trees overfit in different ways; averaging cancels much of the noise:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score
from sklearn.tree import DecisionTreeClassifier

X, y = load_breast_cancer(return_X_y=True)
for name, model in [("single tree", DecisionTreeClassifier(random_state=0)),
                    ("random forest (300 trees)", RandomForestClassifier(n_estimators=300, random_state=0))]:
    scores = cross_val_score(model, X, y, cv=5)
    print(f"{name:>26}: CV accuracy {scores.mean():.3f} ± {scores.std():.3f}")
```

Random forests work well with little tuning, which makes them a superb second model after a linear baseline. The main settings:

| Hyperparameter | Effect |
| --- | --- |
| `n_estimators` | number of trees; more is better but slower, with diminishing returns |
| `max_features` | features considered per split; smaller means more diverse trees |
| `min_samples_leaf` | larger values give smoother predictions and better probabilities |
| `max_depth` | caps tree depth |

Forests also work for regression (`RandomForestRegressor`), averaging the trees' numeric predictions:

```python
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold, cross_val_score

houses = pd.read_csv("data/houses.csv")
X = pd.concat([houses.drop(columns=["price", "neighbourhood"]), pd.get_dummies(houses["neighbourhood"], dtype=int)], axis=1)
y = houses["price"]
cv = KFold(5, shuffle=True, random_state=0)
for name, model in [("linear regression", LinearRegression()),
                    ("random forest", RandomForestRegressor(n_estimators=300, min_samples_leaf=2, random_state=0))]:
    mae = -cross_val_score(model, X, y, cv=cv, scoring="neg_mean_absolute_error").mean()
    print(f"{name:>18}: CV MAE £{mae:,.0f}")
```

Don't assume the fancier model wins. Linear models are hard to beat when the true relationships are close to linear, and they extrapolate sensibly where trees can't (a tree can never predict a price higher than any it saw in training).

## Feature importance

Forests report `feature_importances_`, based on how much each feature reduced impurity across all splits. It's quick but biased towards features with many distinct values. **Permutation importance** is more reliable: shuffle one feature's values on validation data and measure how much the score drops:

```python
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_breast_cancer
from sklearn.inspection import permutation_importance
from sklearn.model_selection import train_test_split

data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(data.data, data.target, test_size=0.3, random_state=0, stratify=data.target)
forest = RandomForestClassifier(n_estimators=300, random_state=0).fit(X_train, y_train)

impurity = pd.Series(forest.feature_importances_, index=data.feature_names).sort_values(ascending=False)
perm = permutation_importance(forest, X_test, y_test, n_repeats=10, random_state=0)
permutation = pd.Series(perm.importances_mean, index=data.feature_names).sort_values(ascending=False)
print("impurity-based (top 5):\n", impurity.head().round(3))
print("\npermutation on test data (top 5):\n", permutation.head().round(3))
```

Remember: importance says what the **model** relies on, not what causes the outcome. Correlated features split their importance, so a genuinely important feature can look weak if a near-copy exists.

## Practice

:::exercise tree-depth Find the best depth
Write `best_depth(X, y, depths, seed)` that evaluates `DecisionTreeClassifier(max_depth=d, random_state=seed)` for each depth with 5-fold cross-validation (`cross_val_score(..., cv=5)`, accuracy) and returns a tuple `(best_depth, best_score)` with the score rounded to 3 decimals.

@@starter
from sklearn.model_selection import cross_val_score
from sklearn.tree import DecisionTreeClassifier

def best_depth(X, y, depths, seed):
    return (depths[0], 0.0)

@@solution
from sklearn.model_selection import cross_val_score
from sklearn.tree import DecisionTreeClassifier

def best_depth(X, y, depths, seed):
    scores = {d: cross_val_score(DecisionTreeClassifier(max_depth=d, random_state=seed), X, y, cv=5).mean() for d in depths}
    best = max(scores, key=scores.get)
    return (best, round(float(scores[best]), 3))

@@tests
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import cross_val_score
from sklearn.tree import DecisionTreeClassifier

def test_reference():
    """Picks the best depth by CV accuracy"""
    X, y = load_breast_cancer(return_X_y=True)
    depths = [1, 2, 3, 4, 6, 10]
    s = {d: cross_val_score(DecisionTreeClassifier(max_depth=d, random_state=0), X, y, cv=5).mean() for d in depths}
    b = max(s, key=s.get)
    assert best_depth(X, y, depths, 0) == (b, round(float(s[b]), 3))
:::

:::exercise tree-importance Permutation importance
Write `top_features(model, X_val, y_val, feature_names, n, seed)`: compute `permutation_importance(model, X_val, y_val, n_repeats=10, random_state=seed)` and return a list of the `n` feature names with the highest mean importance, most important first.

@@starter
from sklearn.inspection import permutation_importance

def top_features(model, X_val, y_val, feature_names, n, seed):
    return []

@@solution
import numpy as np
from sklearn.inspection import permutation_importance

def top_features(model, X_val, y_val, feature_names, n, seed):
    result = permutation_importance(model, X_val, y_val, n_repeats=10, random_state=seed)
    order = np.argsort(result.importances_mean)[::-1][:n]
    return [feature_names[i] for i in order]

@@tests
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance

def test_synthetic():
    """Finds the features that actually drive the target"""
    rng = np.random.default_rng(0)
    X = rng.normal(size=(600, 5))
    y = 5 * X[:, 2] + 2 * X[:, 0] + rng.normal(0, 0.5, 600)
    model = RandomForestRegressor(n_estimators=100, random_state=0).fit(X[:400], y[:400])
    names = ["a", "b", "c", "d", "e"]
    assert top_features(model, X[400:], y[400:], names, 2, 0) == ["c", "a"]
:::

:::quiz tree-quiz Quick check
? A decision tree with no depth limit usually:
- [x] Overfits the training data
- [ ] Underfits
- [ ] Needs feature scaling
> It keeps splitting until it memorises the training set.

? How does a random forest reduce overfitting?
- [x] It averages many different trees trained on random samples of rows and features
- [ ] It uses one very deep tree
- [ ] It removes features
> Averaging cancels the individual trees' errors.

? Which is more reliable for measuring what a model relies on?
- [x] Permutation importance on validation data
- [ ] Impurity-based importance on training data
> Impurity importance is biased towards features with many distinct values.

? A random forest can't predict a house price higher than the highest it saw in training. Why?
- [x] Its predictions are averages of training targets in the leaves
- [ ] Forests always underestimate
- [ ] It's a bug
> Trees can't extrapolate beyond the range of the training targets.
:::
