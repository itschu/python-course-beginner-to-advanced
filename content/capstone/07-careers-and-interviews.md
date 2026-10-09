---
title: ML careers and interviews
summary: The main ML roles and what each needs, the skills to add after this course, how ML interviews are structured, the questions to expect, coding from scratch, and a 90-day plan for what comes next.
minutes: 60
kind: lesson
---

You now have the skills of a junior ML practitioner: Python, data analysis, the maths, classical ML, deep learning, honest evaluation and a backend. This lesson is about turning that into a job, or into serious independent work.

## The roles

"Machine learning" covers several different jobs. Job titles vary between companies, so read the description, not the title.

| Role | What you'd do | Emphasis | Beyond this course |
| --- | --- | --- | --- |
| **Data analyst** | Answer business questions with data, dashboards and reports | SQL, pandas, statistics, communication | More SQL; a BI tool such as Power BI or Looker |
| **Data scientist** | Models and experiments that inform decisions | Statistics, ML, experiment design, communication | A/B testing, causal inference |
| **ML engineer** | Build, ship and run models in products | Software engineering, ML, serving, MLOps | Cloud, CI/CD, experiment tracking, orchestration |
| **MLOps / platform engineer** | Infrastructure for training, deployment and monitoring | DevOps, Docker, Kubernetes, cloud | Kubernetes, infrastructure as code |
| **Research engineer / scientist** | New methods, large models, publications | Deep learning, maths, reading and writing papers | Usually a master's or PhD, or strong published work |
| **Quant researcher / trader** | Models for pricing and trading | Statistics, time series, probability, speed | Finance knowledge, often C++, strong maths |
| **Sports data scientist / trader** | Models for clubs, media, betting companies or syndicates | Probability models, the market, honest backtesting | Domain knowledge; the companies' own data |

Given why you took this course: sports betting and trading firms hire people who can build **calibrated probability models and evaluate them honestly**, which is exactly what Phase 6 and this capstone taught. Your projects are directly relevant. Be realistic about doing it alone, though. As you saw, markets are efficient, edges are small and noisy, and bookmakers limit winning accounts. Working inside the industry is a far more reliable route than living off your own bets.

## Skills to add next

This course covered the core. Job adverts will also mention:

| Skill | Why | Where to start |
| --- | --- | --- |
| **SQL**, more deeply | Every data job uses it: window functions, CTEs, query plans | SQLBolt, then the SQL problems on LeetCode or HackerRank |
| **Cloud basics** | Models run on AWS, GCP or Azure | One provider's free tier; deploy your API there |
| **Experiment tracking** | Comparing hundreds of runs | MLflow or Weights & Biases on your capstone |
| **Orchestration** | Scheduled, dependent jobs | Prefect, Dagster or Airflow for the data pipeline |
| **LLMs** | Prompting, retrieval-augmented generation (RAG), fine-tuning | Hugging Face's LLM course; build a small RAG app over your own documents |
| **Statistics, more deeply** | A/B tests, causal inference, time series | *Trustworthy Online Controlled Experiments* (Kohavi et al.); *Forecasting: Principles and Practice* (Hyndman & Athanasopoulos, free online) |

Don't try to learn all of it before applying. Pick what the jobs you want ask for.

## Your CV

- **One page**, with links to GitHub, your portfolio and any write-ups.
- **Projects with numbers and judgment**: "Built a walk-forward football model; blend with the market improved log loss slightly over one season (within noise); deployed as a FastAPI service with tests and Docker." That's far stronger than a list of libraries.
- **Skills grouped and honest**: list only what you could discuss in an interview.
- Tailor the top third to each job: the first few lines are all that some readers see.

## The interview loop

Most ML interviews combine several of these stages:

| Stage | What happens | How to prepare | In this course |
| --- | --- | --- | --- |
| Recruiter screen | Background, motivation, logistics | A two-minute story of who you are and what you've built | This phase |
| Coding | Python problems: data structures, algorithms | LeetCode-style practice in Python, easy to medium | Phases 1–2 |
| Data manipulation | pandas or SQL on a realistic table | Practise groupby, joins, window functions | Phase 3 |
| ML fundamentals | Concepts, trade-offs, debugging | The question table below | Phases 4–7 |
| ML coding | Implement a metric or algorithm from scratch | The exercises below; k-means, logistic regression, a decision stump | Phases 4–5, 7 |
| ML system design | Design a system end to end, out loud | The framework from lesson 1 | This phase |
| Take-home | A small project in a few days | Treat it like a portfolio project: README, tests, honest evaluation | Lesson 5 |
| Behavioural | Teamwork, failures, conflicts | Prepare stories using STAR: situation, task, action, result | |

### ML fundamentals: questions to expect

Practise answering each out loud in about two minutes:

| Question | A good answer covers |
| --- | --- |
| Explain the bias–variance trade-off | Underfitting vs overfitting; how model complexity and data size move each; how you'd diagnose it with learning curves |
| What is data leakage? Give examples | Features unavailable at prediction time, preprocessing fitted on test data, random splits on time series; how to prevent each |
| Why use log loss instead of accuracy? | Proper scoring rules reward honest probabilities; accuracy ignores confidence and calibration |
| How do you handle class imbalance? | Better metrics (PR AUC, recall at a precision), class weights, threshold choice, resampling; why accuracy misleads |
| How does gradient boosting work? | Sequential trees fitted to the gradient of the loss; learning rate; early stopping; why it's strong on tabular data |
| L1 vs L2 regularisation? | Penalties on weight size; L1 gives sparsity; both reduce variance |
| How would you know your model is overfitting? | A gap between training and validation scores; cross-validation; learning curves |
| What is calibration and how do you fix it? | Predicted probabilities matching observed frequencies; reliability plots; Platt scaling, isotonic regression, temperature scaling |
| How do you evaluate a model on time series? | Walk-forward validation, no shuffling, refitting as time passes, point-in-time features |
| Your model works offline but not in production. Why? | Leakage, train/serve skew, drift, bugs in feature code; how monitoring would catch each |

### ML system design

You'll be asked something like "Design a system to recommend bets" or "Design fraud detection for payments". Use the structure from lesson 1, and talk through it:

1. **Clarify** the goal, the users and the constraints (latency, scale, cost of errors).
2. **Metrics**: business and model, offline and online.
3. **Data**: sources, labels, what's known at prediction time.
4. **Features and model**: start simple, with a baseline; say what you'd try next.
5. **Evaluation**: how you'd split the data, and how you'd test online (A/B test, shadow mode).
6. **Serving**: batch or online, latency, model versioning.
7. **Monitoring**: drift, performance, data quality, and what happens when they fail.

Interviewers care more about your reasoning and trade-offs than about naming specific tools.

### Spot the bug

Debugging questions are common: "This pipeline scores 85% on random data. What's wrong?"

```python
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

rng = np.random.default_rng(0)
X = rng.normal(size=(100, 1000))        # 1,000 features of pure noise
y = rng.integers(0, 2, 100)             # random labels

X_best = SelectKBest(f_classif, k=20).fit_transform(X, y)
scores = cross_val_score(LogisticRegression(max_iter=1000), X_best, y, cv=StratifiedKFold(5, shuffle=True, random_state=0))
print(f"cross-validated accuracy on pure noise: {scores.mean():.2f}")
```

The features were selected using **all** the labels, including those of the validation folds. Out of 1,000 noise features, some match the labels by chance, and the selection picks exactly those. Every step that learns from data, including feature selection, scaling and imputation, must happen **inside** cross-validation. You'll fix it below.

## After the course: a 90-day plan

| Weeks | Focus |
| --- | --- |
| 1–4 | Polish two portfolio projects (lesson 5): READMEs, tests, a deployed demo, one blog post. |
| 5–8 | Enter a Kaggle Playground competition, doing it properly (lesson 6). Learn one skill from the table above that your target jobs ask for. |
| 9–12 | Build one original project on data you collect yourself. Apply for jobs, practise interviews out loud, and keep writing. |

Keep the habit going afterwards: one project, one paper and one write-up a month adds up to a lot within a year.

## Practice

:::exercise int-auc ROC AUC from scratch
A classic ML coding question. Write `roc_auc(y_true, scores)` without using scikit-learn. ROC AUC is the probability that a randomly chosen positive has a higher score than a randomly chosen negative, with ties counting as half. Raise `ValueError` if `y_true` doesn't contain both classes. (Hint: rank all the scores, giving tied values their average rank. Then AUC = (sum of the positives' ranks − n_pos(n_pos + 1)/2) / (n_pos × n_neg).)

@@starter
import numpy as np

def roc_auc(y_true, scores):
    y, s = np.asarray(y_true), np.asarray(scores)
    return float(np.mean((s > 0.5) == y))

@@solution
import numpy as np
from scipy.stats import rankdata

def roc_auc(y_true, scores):
    y = np.asarray(y_true).astype(bool)
    n_pos, n_neg = y.sum(), (~y).sum()
    if n_pos == 0 or n_neg == 0:
        raise ValueError("y_true must contain both classes")
    ranks = rankdata(scores)
    return float((ranks[y].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))

@@tests
import math
import numpy as np
import pytest
from sklearn.metrics import roc_auc_score

def test_matches_sklearn():
    """Random data, with and without ties"""
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 2000)
    s = rng.normal(y * 0.8, 1)
    assert math.isclose(roc_auc(y, s), roc_auc_score(y, s), rel_tol=1e-9)
    rounded = np.round(s, 1)
    assert math.isclose(roc_auc(y, rounded), roc_auc_score(y, rounded), rel_tol=1e-9)

def test_small_cases():
    """Perfect, reversed and tied"""
    assert roc_auc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]) == 1.0
    assert roc_auc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1]) == 0.0
    assert roc_auc([0, 1], [0.5, 0.5]) == 0.5

def test_one_class():
    """AUC is undefined with one class"""
    with pytest.raises(ValueError):
        roc_auc([1, 1, 1], [0.2, 0.4, 0.6])
:::

:::exercise int-prf Precision, recall and F1
Write `prf(y_true, y_pred, labels)` without using scikit-learn's metrics. Return a dict mapping each label to a tuple `(precision, recall, f1)` of floats, treating that label as the positive class. When a value would divide by zero (no predictions of that label, no true examples of it, or precision and recall both zero), use `0.0`.

@@starter
def prf(y_true, y_pred, labels):
    accuracy = sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true)
    return {label: (accuracy, accuracy, accuracy) for label in labels}

@@solution
def prf(y_true, y_pred, labels):
    out = {}
    for label in labels:
        tp = sum(t == label and p == label for t, p in zip(y_true, y_pred))
        predicted = sum(p == label for p in y_pred)
        actual = sum(t == label for t in y_true)
        precision = tp / predicted if predicted else 0.0
        recall = tp / actual if actual else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        out[label] = (float(precision), float(recall), float(f1))
    return out

@@tests
import numpy as np
from sklearn.metrics import precision_recall_fscore_support

def check(y_true, y_pred, labels):
    p, r, f, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    out = prf(y_true, y_pred, labels)
    assert list(out) == labels
    for i, label in enumerate(labels):
        assert np.allclose(out[label], (p[i], r[i], f[i]))

def test_match_outcomes():
    """Three classes, compared with scikit-learn"""
    rng = np.random.default_rng(1)
    y_true = list(rng.choice(["H", "D", "A"], 300, p=[0.45, 0.27, 0.28]))
    y_pred = [t if rng.random() < 0.5 else rng.choice(["H", "A"]) for t in y_true]
    check(y_true, y_pred, ["A", "D", "H"])

def test_zero_division():
    """A label never predicted, and one never seen"""
    check(["H", "H", "A"], ["H", "A", "A"], ["A", "D", "H"])
    assert prf(["H", "A"], ["H", "H"], ["A"]) == {"A": (0.0, 0.0, 0.0)}
:::

:::exercise int-leak Fix the leak
The starter is the pipeline from "Spot the bug": it reports high accuracy on pure noise. Fix `cv_accuracy(X, y)` so that feature selection happens **inside** cross-validation: build a pipeline of `SelectKBest(f_classif, k=20)` followed by `LogisticRegression(max_iter=1000)`, and return the mean of `cross_val_score` with `cv=StratifiedKFold(5, shuffle=True, random_state=0)`.

@@starter
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

def cv_accuracy(X, y):
    X_best = SelectKBest(f_classif, k=20).fit_transform(X, y)
    scores = cross_val_score(LogisticRegression(max_iter=1000), X_best, y, cv=StratifiedKFold(5, shuffle=True, random_state=0))
    return float(scores.mean())

@@solution
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline

def cv_accuracy(X, y):
    model = make_pipeline(SelectKBest(f_classif, k=20), LogisticRegression(max_iter=1000))
    scores = cross_val_score(model, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=0))
    return float(scores.mean())

@@tests
import math
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline

rng = np.random.default_rng(0)
X = rng.normal(size=(100, 1000))
y = rng.integers(0, 2, 100)

def test_noise_is_not_learnable():
    """Pure noise should score near chance, not 85%"""
    assert cv_accuracy(X, y) < 0.7

def test_matches_reference():
    """Selection and model refitted inside every fold"""
    ref = cross_val_score(make_pipeline(SelectKBest(f_classif, k=20), LogisticRegression(max_iter=1000)),
                          X, y, cv=StratifiedKFold(5, shuffle=True, random_state=0)).mean()
    assert math.isclose(cv_accuracy(X, y), ref)

def test_real_signal_still_found():
    """Five informative features are still picked up"""
    X2 = X.copy()
    X2[:, :5] += 1.5 * y[:, None]
    assert cv_accuracy(X2, y) > 0.8
:::

:::quiz int-quiz Quick check
? A job advert asks for "deploying models, CI/CD, Docker and monitoring". Which role is it?
- [x] ML engineer
- [ ] Data analyst
- [ ] Research scientist
> ML engineers build and run models in products.

? In a system design interview, what should you do first?
- [x] Clarify the goal, users, constraints and how success is measured
- [ ] Name the most advanced model you know
- [ ] Start writing code
> Interviewers want to see that you understand the problem before solving it.

? Feature scaling was fitted on the whole dataset before cross-validation. Why is that a problem?
- [x] Information from the validation folds leaks into training, so scores are optimistic
- [ ] Scaling makes models slower
- [ ] It isn't a problem for any model
> Every step that learns from data belongs inside the cross-validation loop: use a pipeline.

? What makes a project description on a CV strong?
- [x] What you built, how you evaluated it, and the honest result, with a link
- [ ] A long list of libraries
- [ ] Claims of 99% accuracy
> Show judgment and evidence, not keywords.
:::
