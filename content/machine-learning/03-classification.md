---
title: Classification with logistic regression
summary: Predict categories and probabilities, understand decision boundaries and thresholds, handle more than two classes, and read a confusion matrix.
minutes: 50
kind: lesson
---

Classification predicts a category: spam or not, malignant or benign, home/draw/away. Most classifiers can also output **probabilities**, and for decisions (including bets) the probabilities matter more than the labels.

## Logistic regression

You built logistic regression from scratch in Phase 4: a linear score passed through the sigmoid to get a probability. scikit-learn's version adds regularisation and a fast optimiser:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(data.data, data.target, test_size=0.25, random_state=0, stratify=data.target)

model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
model.fit(X_train, y_train)

print("classes:", list(data.target_names))          # 0 = malignant, 1 = benign
print("labels:       ", model.predict(X_test[:5]))
print("P(benign):    ", model.predict_proba(X_test[:5])[:, 1].round(3))
print(f"test accuracy: {model.score(X_test, y_test):.3f}")
```

`predict_proba` returns one column per class, in the order of `model.classes_`. `predict` simply picks the class with the highest probability, which for two classes means a **threshold** of 0.5.

## Decision boundaries

With two features you can see what a classifier learned. Logistic regression draws a straight-line boundary:

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

data = load_breast_cancer()
cols = [0, 1]                                       # mean radius, mean texture
X, y = data.data[:, cols], data.target
model = make_pipeline(StandardScaler(), LogisticRegression()).fit(X, y)

xx, yy = np.meshgrid(np.linspace(X[:, 0].min(), X[:, 0].max(), 200), np.linspace(X[:, 1].min(), X[:, 1].max(), 200))
probs = model.predict_proba(np.column_stack([xx.ravel(), yy.ravel()]))[:, 1].reshape(xx.shape)

fig, ax = plt.subplots(figsize=(6, 4))
contour = ax.contourf(xx, yy, probs, levels=20, cmap="RdBu", alpha=0.6)
ax.contour(xx, yy, probs, levels=[0.5], colors="black")
ax.scatter(X[:, 0], X[:, 1], c=y, cmap="RdBu", edgecolor="k", s=15)
fig.colorbar(contour, label="P(benign)")
ax.set_xlabel(data.feature_names[0])
ax.set_ylabel(data.feature_names[1])
ax.set_title("Logistic regression: a straight boundary, smooth probabilities")
fig.tight_layout()
plt.show()
```

The black line is where P = 0.5. Probabilities change smoothly across it, so points near the line are uncertain. Trees and boosting (later lessons) can draw much more complex boundaries.

## Regularisation: C and l1_ratio

scikit-learn's logistic regression is **regularised** by default: it penalises large weights to reduce overfitting. `C` controls the strength (smaller `C` means stronger regularisation, simpler models). `l1_ratio` chooses the type: `0` (the default) is L2, which shrinks all weights; `1` is L1, which can set weights exactly to zero, selecting features for you.

```python
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

for C in [0.01, 0.1, 1, 100]:
    model = make_pipeline(StandardScaler(), LogisticRegression(C=C, l1_ratio=1, solver="saga", max_iter=10_000))
    model.fit(X_train, y_train)
    weights = model[-1].coef_[0]
    print(f"C={C:>6}: test accuracy {model.score(X_test, y_test):.3f}, features used {np.sum(weights != 0):>2} of 30")
```

You'll see in lesson 5 how to choose `C` properly with cross-validation.

## Thresholds

The default 0.5 threshold isn't sacred. If missing a malignant tumour is far worse than a false alarm, flag anything with even a modest probability of being malignant:

```python
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X_train, y_train)
p_malignant = model.predict_proba(X_test)[:, 0]

for threshold in [0.5, 0.2, 0.05]:
    flagged = p_malignant >= threshold
    missed = np.sum(~flagged & (y_test == 0))
    false_alarms = np.sum(flagged & (y_test == 1))
    print(f"flag if P(malignant) >= {threshold}: missed cancers {missed}, false alarms {false_alarms}")
```

Choosing a threshold is a **business decision** about the costs of different mistakes, not a modelling one. In betting, the equivalent is choosing how big an edge you need before you bet.

## More than two classes

Logistic regression handles several classes by giving each class its own set of weights and turning the scores into probabilities that sum to 1 (the **softmax** function). The wine dataset has three grape varieties:

```python
from sklearn.datasets import load_wine
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_wine(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=1, stratify=y)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X_train, y_train)

print("probabilities (each row sums to 1):")
print(model.predict_proba(X_test[:4]).round(3))
print(f"accuracy: {model.score(X_test, y_test):.3f}")
```

Home/draw/away is exactly this kind of problem, and you'll model it this way in the project.

## The confusion matrix

A **confusion matrix** counts every combination of actual and predicted class. It shows *which* mistakes a model makes:

```python
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import ConfusionMatrixDisplay, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt

data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(data.data, data.target, test_size=0.25, random_state=0, stratify=data.target)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X_train, y_train)
pred = model.predict(X_test)

print(confusion_matrix(y_test, pred))      # rows: actual, columns: predicted
fig, ax = plt.subplots(figsize=(4, 3.5))
ConfusionMatrixDisplay.from_predictions(y_test, pred, display_labels=data.target_names, ax=ax, colorbar=False)
ax.set_title("Where the model goes wrong")
fig.tight_layout()
plt.show()
```

The next lesson turns these counts into the metrics professionals use.

## Practice

:::exercise clf-proba Probabilities and a custom threshold
Write `predict_with_threshold(model, X, threshold, positive_class=1)`. `model` is a fitted binary classifier. Return a NumPy array of 0/1 predictions: 1 where the predicted probability of `positive_class` is **at least** `threshold`.

Find the right probability column using `model.classes_`, don't assume it's column 1.

@@starter
import numpy as np

def predict_with_threshold(model, X, threshold, positive_class=1):
    return model.predict(X)

@@solution
import numpy as np

def predict_with_threshold(model, X, threshold, positive_class=1):
    column = list(model.classes_).index(positive_class)
    return (model.predict_proba(X)[:, column] >= threshold).astype(int)

@@tests
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X, y)

def test_default_like():
    """A 0.5 threshold matches predict"""
    assert np.array_equal(predict_with_threshold(model, X, 0.5), model.predict(X))

def test_low_threshold_flags_more():
    """A lower threshold flags more cases"""
    assert predict_with_threshold(model, X, 0.1).sum() > predict_with_threshold(model, X, 0.9).sum()

def test_other_class():
    """Works for the other class too"""
    p0 = model.predict_proba(X)[:, 0]
    assert np.array_equal(predict_with_threshold(model, X, 0.3, positive_class=0), (p0 >= 0.3).astype(int))
:::

:::exercise clf-sparsity L1 regularisation picks features
Write `features_kept(X_train, y_train, C)`: fit a pipeline of `StandardScaler()` and `LogisticRegression(C=C, l1_ratio=1, solver="saga", max_iter=10000)`, and return the number of non-zero weights (an int).

Then set `smallest_c_with_10_features` to the smallest value from `[0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]` that keeps **at least 10** features on the breast cancer data (use all of it as training data).

@@starter
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def features_kept(X_train, y_train, C):
    return 0

X, y = load_breast_cancer(return_X_y=True)
smallest_c_with_10_features = None

@@solution
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

def features_kept(X_train, y_train, C):
    model = make_pipeline(StandardScaler(), LogisticRegression(C=C, l1_ratio=1, solver="saga", max_iter=10000))
    model.fit(X_train, y_train)
    return int(np.sum(model[-1].coef_ != 0))

X, y = load_breast_cancer(return_X_y=True)
smallest_c_with_10_features = next(c for c in [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1] if features_kept(X, y, c) >= 10)

@@tests
import numpy as np
from sklearn.datasets import load_breast_cancer

def test_monotone():
    """Stronger regularisation keeps fewer features"""
    X, y = load_breast_cancer(return_X_y=True)
    assert features_kept(X, y, 0.01) < features_kept(X, y, 1)

def test_answer():
    """Finds the smallest C keeping at least 10 features"""
    X, y = load_breast_cancer(return_X_y=True)
    exp = next(c for c in [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1] if features_kept(X, y, c) >= 10)
    assert smallest_c_with_10_features == exp
:::

:::quiz clf-quiz Quick check
? For a binary classifier, what does `predict` do with the probabilities?
- [x] Picks the class with probability above 0.5
- [ ] Rounds each feature
- [ ] Picks a class at random
> You can choose a different threshold using `predict_proba`.

? In scikit-learn's LogisticRegression, a smaller `C` means:
- [x] Stronger regularisation and a simpler model
- [ ] Weaker regularisation
- [ ] More iterations
> C is the inverse of regularisation strength.

? Missing a fraud costs £500; a false alarm costs £5 of staff time. Which threshold makes sense?
- [x] A low threshold: flag even moderately suspicious transactions
- [ ] A high threshold: only flag near-certain fraud
- [ ] Always 0.5
> Thresholds should reflect the costs of each type of mistake.

? In a confusion matrix from scikit-learn, rows are:
- [x] Actual classes
- [ ] Predicted classes
> Columns are predictions.
:::
