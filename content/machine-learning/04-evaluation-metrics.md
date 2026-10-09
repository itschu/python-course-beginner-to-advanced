---
title: Choosing the right metric
summary: Why accuracy misleads, precision and recall, ROC AUC, and the probability metrics (log loss, Brier score, calibration) that matter most for betting and risk.
minutes: 55
kind: lesson
---

The metric you optimise is the model's definition of "good". Pick the wrong one and you'll build a model that's excellent at the wrong thing.

## Why accuracy misleads

Suppose 1% of transactions are fraud. A model that says "never fraud" is 99% accurate and completely useless:

```python
import numpy as np
from sklearn.metrics import accuracy_score, recall_score

rng = np.random.default_rng(0)
y = (rng.random(10_000) < 0.01).astype(int)         # 1% fraud
never = np.zeros_like(y)
print(f"accuracy {accuracy_score(y, never):.1%}, frauds caught {recall_score(y, never):.0%}")
```

Accuracy also ignores *how confident* predictions are. For betting it's nearly irrelevant: you can be "right" 70% of the time backing heavy favourites and still lose money.

## Precision, recall and F1

From the confusion matrix of a binary problem (positive = the thing you're looking for):

| | Predicted positive | Predicted negative |
| --- | --- | --- |
| **Actually positive** | true positive (TP) | false negative (FN) |
| **Actually negative** | false positive (FP) | true negative (TN) |

- **Precision** = TP / (TP + FP): of the cases you flagged, how many were real?
- **Recall** = TP / (TP + FN): of the real cases, how many did you catch?
- **F1** = the harmonic mean of the two: a single number that's high only when both are.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(data.data, data.target, test_size=0.25, random_state=0, stratify=data.target)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(X_train, y_train)
print(classification_report(y_test, model.predict(X_test), target_names=data.target_names, digits=3))
```

Precision and recall trade off: lowering the threshold catches more (recall up) but raises more false alarms (precision down).

## ROC curves and AUC

A **ROC curve** plots the true positive rate against the false positive rate for *every* threshold. The **AUC** (area under the curve) summarises it: 0.5 is random guessing, 1.0 is perfect ranking. AUC measures how well a model **ranks** cases, regardless of threshold:

```python
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import RocCurveDisplay, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

fig, ax = plt.subplots(figsize=(5, 4.5))
for name, model in [("logistic regression", make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))),
                    ("decision tree (depth 2)", DecisionTreeClassifier(max_depth=2, random_state=0))]:
    model.fit(X_train, y_train)
    RocCurveDisplay.from_estimator(model, X_test, y_test, name=name, ax=ax)
ax.plot([0, 1], [0, 1], linestyle="--", color="grey")
ax.set_title("ROC curves")
fig.tight_layout()
plt.show()
```

## Probability metrics: log loss and Brier score

When the **probabilities themselves** drive decisions, as in betting, insurance pricing, credit risk or medical risk scores, you need metrics that judge probabilities directly:

- **Log loss** (from Phase 4): the average of $-\ln p$, where $p$ is the probability given to what happened. It heavily punishes confident mistakes. Lower is better.
- **Brier score**: the mean squared difference between the predicted probability and the outcome (0 or 1). Lower is better, and it's gentler on confident mistakes than log loss.

```python
import numpy as np
from sklearn.metrics import brier_score_loss, log_loss

y = np.array([1, 0, 1, 1, 0])
cautious = np.array([0.6, 0.4, 0.6, 0.6, 0.4])
confident = np.array([0.95, 0.05, 0.95, 0.95, 0.05])
overconfident_wrong = np.array([0.95, 0.05, 0.95, 0.05, 0.05])     # one confident mistake

for name, p in [("cautious", cautious), ("confident", confident), ("one confident mistake", overconfident_wrong)]:
    print(f"{name:>22}: log loss {log_loss(y, p):.3f}, Brier {brier_score_loss(y, p):.3f}")
```

Both are **proper scoring rules**: you get the best expected score by reporting your true beliefs. That's why they're the right way to compare betting models against each other and against the bookmaker, as you did in Phase 4.

## Calibration

A model can rank well (high AUC) and still give badly calibrated probabilities. Check with a **calibration curve** (reliability diagram), just like the bookmaker check in Phase 3:

```python
import matplotlib.pyplot as plt
from sklearn.calibration import CalibrationDisplay
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.4, random_state=0, stratify=y)

fig, ax = plt.subplots(figsize=(5, 4.5))
for name, model in [("logistic regression", make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))),
                    ("naive Bayes", GaussianNB()),
                    ("random forest", RandomForestClassifier(n_estimators=200, random_state=0))]:
    model.fit(X_train, y_train)
    CalibrationDisplay.from_estimator(model, X_test, y_test, n_bins=6, name=name, ax=ax)
ax.set_title("Calibration curves")
fig.tight_layout()
plt.show()
```

Naive Bayes is famously overconfident: its probabilities pile up near 0 and 1. Phase 6 shows how to **recalibrate** a model's probabilities when they're off.

## Which metric?

| Situation | Good metrics |
| --- | --- |
| Balanced classes, labels are what matter | accuracy, F1 |
| Rare positives (fraud, disease) | precision, recall, PR curve |
| Ranking (who to target first) | ROC AUC |
| Probabilities drive decisions (betting, pricing, risk) | **log loss, Brier score, calibration** |
| Regression, errors cost the same | MAE |
| Regression, big errors are much worse | RMSE |

And always also report the metric that matters to the business: profit, cost saved, ROI. In betting, ROI on a properly out-of-sample backtest is the final judge.

## Practice

:::exercise met-confusion Precision and recall by hand
Write `precision_recall(y_true, y_pred)` that returns a tuple `(precision, recall)` for the positive class 1, computed from TP, FP and FN with NumPy (no scikit-learn metric functions). Return `0.0` for a metric whose denominator is zero. Round both to 4 decimals.

@@starter
import numpy as np

def precision_recall(y_true, y_pred):
    return (0.0, 0.0)

@@solution
import numpy as np

def precision_recall(y_true, y_pred):
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    tp = np.sum((y_pred == 1) & (y_true == 1))
    fp = np.sum((y_pred == 1) & (y_true == 0))
    fn = np.sum((y_pred == 0) & (y_true == 1))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return (round(float(precision), 4), round(float(recall), 4))

@@tests
from sklearn.metrics import precision_score, recall_score

def test_values():
    """Matches scikit-learn"""
    y = [1, 0, 1, 1, 0, 0, 1, 0]
    p = [1, 1, 0, 1, 0, 0, 1, 1]
    assert precision_recall(y, p) == (round(precision_score(y, p), 4), round(recall_score(y, p), 4))

def test_no_positive_predictions():
    """No positive predictions gives precision 0"""
    assert precision_recall([1, 0, 1], [0, 0, 0]) == (0.0, 0.0)

def test_no_sklearn_metrics():
    """Computed by hand"""
    assert "precision_score" not in source and "recall_score" not in source
:::

:::exercise met-brier Brier and log loss for three outcomes
For home/draw/away, the multi-class **Brier score** is the mean over matches of the sum of squared differences between the predicted probabilities and the one-hot outcome.

Write `multiclass_scores(probs, outcomes)` where `probs` is an (n, 3) array of probabilities for H, D, A and `outcomes` is a list of `"H"`, `"D"`, `"A"`. Return `(brier, log_loss)`, each rounded to 4 decimals.

@@starter
import numpy as np

def multiclass_scores(probs, outcomes):
    return (0.0, 0.0)

@@solution
import numpy as np

def multiclass_scores(probs, outcomes):
    probs = np.asarray(probs, dtype=float)
    idx = np.array(["HDA".index(o) for o in outcomes])
    one_hot = np.zeros_like(probs)
    one_hot[np.arange(len(idx)), idx] = 1
    brier = np.mean(np.sum((probs - one_hot) ** 2, axis=1))
    ll = -np.mean(np.log(probs[np.arange(len(idx)), idx]))
    return (round(float(brier), 4), round(float(ll), 4))

@@tests
import math
import numpy as np

def test_uniform():
    """A one-third forecaster"""
    b, ll = multiclass_scores(np.full((4, 3), 1 / 3), ["H", "D", "A", "H"])
    assert b == round(2 / 3, 4) and ll == round(math.log(3), 4)

def test_values():
    """A worked example"""
    probs = [[0.5, 0.3, 0.2], [0.2, 0.3, 0.5]]
    b, ll = multiclass_scores(probs, ["H", "D"])
    exp_b = ((0.5 ** 2 + 0.3 ** 2 + 0.2 ** 2) + (0.2 ** 2 + 0.7 ** 2 + 0.5 ** 2)) / 2
    assert b == round(exp_b, 4) and ll == round(-(math.log(0.5) + math.log(0.3)) / 2, 4)
:::

:::exercise met-choose Which model is better?
Two models produced probabilities for the same 6 binary outcomes. Compute each model's accuracy (threshold 0.5), log loss and Brier score with scikit-learn, and set:

- `better_accuracy` to `"A"`, `"B"` or `"tie"`
- `better_log_loss` to `"A"` or `"B"` (lower is better)

```python static
y       = [1, 1, 0, 1, 0, 1]
model_a = [0.55, 0.6, 0.45, 0.52, 0.4, 0.58]   # timid but usually right
model_b = [0.95, 0.9, 0.2, 0.97, 0.05, 0.03]   # confident, one huge mistake
```

@@starter
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss

y = [1, 1, 0, 1, 0, 1]
model_a = [0.55, 0.6, 0.45, 0.52, 0.4, 0.58]
model_b = [0.95, 0.9, 0.2, 0.97, 0.05, 0.03]

better_accuracy = None
better_log_loss = None

@@solution
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss

y = [1, 1, 0, 1, 0, 1]
model_a = [0.55, 0.6, 0.45, 0.52, 0.4, 0.58]
model_b = [0.95, 0.9, 0.2, 0.97, 0.05, 0.03]

acc_a = accuracy_score(y, [int(p >= 0.5) for p in model_a])
acc_b = accuracy_score(y, [int(p >= 0.5) for p in model_b])
better_accuracy = "A" if acc_a > acc_b else "B" if acc_b > acc_a else "tie"
better_log_loss = "A" if log_loss(y, model_a) < log_loss(y, model_b) else "B"

@@tests
from sklearn.metrics import log_loss

def test_accuracy():
    """Model A gets every case right at 0.5"""
    assert better_accuracy == "A"

def test_log_loss():
    """Log loss also prefers A: B's confident mistake is very costly"""
    y = [1, 1, 0, 1, 0, 1]
    exp = "A" if log_loss(y, [0.55, 0.6, 0.45, 0.52, 0.4, 0.58]) < log_loss(y, [0.95, 0.9, 0.2, 0.97, 0.05, 0.03]) else "B"
    assert better_log_loss == exp
:::

:::quiz met-quiz Quick check
? 2% of cases are positive. A model predicts "negative" for everything. Its accuracy and recall are:
- [x] 98% accuracy, 0% recall
- [ ] 2% accuracy, 100% recall
- [ ] 50% and 50%
> Accuracy hides the failure; recall exposes it.

? What does an AUC of 0.5 mean?
- [x] The model ranks no better than random
- [ ] Half the predictions are correct
- [ ] The model is perfectly calibrated
> AUC is about ranking positives above negatives.

? Why is log loss a good metric for betting models?
- [x] It judges the probabilities themselves and punishes confident mistakes
- [ ] It ignores probabilities
- [ ] It's the same as accuracy
> Betting decisions depend on probabilities, not labels.

? A model has a high AUC but its "70%" predictions come true 90% of the time. It's:
- [x] Good at ranking but poorly calibrated
- [ ] Perfect
- [ ] Bad at ranking
> Calibration and discrimination are different properties.
:::
