---
title: Kaggle, research papers and learning in public
summary: Keep improving after the course - compete on Kaggle without fooling yourself, check train/test shift with adversarial validation, read and implement research papers, and build a public record of your learning.
minutes: 60
kind: lesson
---

Finishing a course is the start, not the end. The people who become strong in ML keep three habits: they **practise on real problems**, they **read what others have discovered**, and they **share what they learn**. This lesson gives you a way into each.

## Kaggle

[Kaggle](https://www.kaggle.com/) hosts datasets, free notebooks with GPUs, and competitions. For learning, it's unbeatable: real problems, a fixed metric, and when a competition ends, the winners usually explain exactly what they did.

**Where to start:**

- **Getting Started competitions** (Titanic, House Prices): no deadline, lots of tutorials.
- **Playground Series**: short tabular competitions that run regularly. Ideal for practising the workflow from this course.
- **Featured competitions**: harder, sometimes with prizes. Join one when you're comfortable, even just to read the discussions.

**How competitions are scored.** You predict a hidden test set. During the competition, your score on part of it appears on the **public leaderboard**. The final ranking uses the rest, the **private leaderboard**, revealed only at the end. You choose which submissions count.

### Don't overfit the public leaderboard

Every submission tells you a little about the public part of the test set. Submit enough tweaks, keep whichever scores best, and you end up fitting noise. When the private leaderboard is revealed, rankings "shake up". This simulation makes 200 tweaks of the same model, none of which is really better than the others:

```python
import numpy as np
from sklearn.metrics import roc_auc_score

rng = np.random.default_rng(0)
n = 5000
y = rng.random(n) < 0.3                         # the hidden test labels
signal = y + rng.normal(0, 1.2, n)              # a reasonable model's scores
public = rng.random(n) < 0.3                    # 30% of test rows are on the public leaderboard
tweaks = signal + rng.normal(0, 0.6, (200, n))  # 200 variations, all equally good in truth

pub = np.array([roc_auc_score(y[public], s[public]) for s in tweaks])
priv = np.array([roc_auc_score(y[~public], s[~public]) for s in tweaks])
best = pub.argmax()
print(f"best on the public leaderboard: public AUC {pub[best]:.4f}, private AUC {priv[best]:.4f}")
print(f"average private AUC of all tweaks: {priv.mean():.4f}")
print(f"its private rank: {(priv > priv[best]).sum() + 1} of {len(tweaks)}")
print(f"correlation between public and private scores: {np.corrcoef(pub, priv)[0, 1]:.2f}")
```

The winning tweak scored 0.725 on the public leaderboard but only 0.703 privately: exactly average, and around the middle of the private ranking. Public and private scores barely correlate, because the differences between the tweaks were pure noise. It's the same winner's curse as in value betting (Phase 6): picking the best of many noisy scores guarantees disappointment.

**The fix: trust your own cross-validation.** Build a validation scheme that mimics how the test set was split from the training data (random, by time, by group), use it for every decision, and treat the public leaderboard as one more noisy fold.

### A competition workflow

1. **Read** the data description and the evaluation metric carefully. Optimise that metric.
2. **Check** how the test set differs from the training set (adversarial validation, below), and design your cross-validation to match.
3. **Submit a simple baseline** on day one, so the whole pipeline works end to end.
4. **Iterate** on features and models, logging every experiment with its CV score.
5. **Ensemble** near the end: averaging different models usually helps.
6. **Choose final submissions** by CV, not by public score.
7. **Afterwards, read the winning solutions.** This is where most of the learning happens.

### Adversarial validation

Is the test set like the training set? Label training rows 0 and test rows 1, and see whether a classifier can tell them apart. If cross-validated ROC AUC is about 0.5, the distributions look the same. If it's much higher, something has shifted, and the features the classifier relies on tell you what.

Here it is on the EUR/USD data from Phase 6, with 2015–2022 as "train" and 2023–2024 as "test":

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"])
fx["ret_1d"] = fx["Close"].pct_change()
fx["ret_5d"] = fx["Close"].pct_change(5)
fx["range"] = (fx["High"] - fx["Low"]) / fx["Close"]
fx["ma_gap"] = fx["Close"] / fx["Close"].rolling(20).mean() - 1
fx = fx.dropna()
train, test = fx[fx["Date"] < "2023-01-01"], fx[fx["Date"] >= "2023-01-01"]

def adversarial_auc(features):
    X = pd.concat([train[features], test[features]])
    is_test = np.r_[np.zeros(len(train)), np.ones(len(test))]
    clf = RandomForestClassifier(n_estimators=100, min_samples_leaf=5, random_state=0)
    p = cross_val_predict(clf, X, is_test, cv=StratifiedKFold(5, shuffle=True, random_state=0), method="predict_proba")[:, 1]
    return roc_auc_score(is_test, p)

print(f"returns and range features: AUC {adversarial_auc(['ret_1d', 'ret_5d', 'range', 'ma_gap']):.3f}")
print(f"raw closing price:          AUC {adversarial_auc(['Close']):.3f}")
```

Returns and ranges look the same in both periods (AUC about 0.53), but the raw price level gives the period away (about 0.82): prices drift, so the test period sits at levels the model rarely saw in training. A model using raw prices would be learning "what the price was in 2017", which won't carry over. This is why Phase 6 used returns.

## Reading research papers

Papers are where new methods appear first. They're dense, but you don't have to read them front to back. S. Keshav's short guide *How to Read a Paper* (2007) suggests three passes:

1. **Five minutes:** title, abstract, introduction, headings, conclusion, figures. What problem, what claim, is it relevant?
2. **An hour:** read it properly, skipping proofs. Understand the method and the evidence. Note what you don't follow.
3. **Several hours:** re-derive the key steps and reproduce a result. This is how you really learn a method.

**Where to find them:** [arXiv](https://arxiv.org/) (most ML papers appear here first), [Hugging Face Papers](https://huggingface.co/papers) (daily highlights), and the big conferences (NeurIPS, ICML, ICLR). For applied topics, search Google Scholar and follow the citations backwards.

**A starter reading list**, connected to this course:

| Paper | Why read it |
| --- | --- |
| Maher, *Modelling Association Football Scores* (1982) | The Poisson goal model you built |
| Dixon & Coles, *Modelling Association Football Scores and Inefficiencies in the Football Betting Market* (1997) | Low-score correction and time decay |
| Kaunitz, Zhong & Kreiner, *Beating the bookies with their own numbers* (2017) | A betting strategy using market odds, and what happened when bookmakers noticed |
| Hubáček, Šourek & Železný, *Exploiting sports-betting market using machine learning* (2019) | Why a betting model should be deliberately *different* from the bookmaker's, not just accurate |
| [Chen & Guestrin, *XGBoost* (2016)](https://arxiv.org/abs/1603.02754) | Gradient boosting at scale |
| Grinsztajn, Oyallon & Varoquaux, *Why do tree-based models still outperform deep learning on tabular data?* (2022) | Evidence behind "start with gradient boosting" |
| Guo et al., *On Calibration of Modern Neural Networks* (2017) | Why neural nets are overconfident, and temperature scaling |
| [He et al., *Deep Residual Learning for Image Recognition* (2015)](https://arxiv.org/abs/1512.03385) | ResNets, the networks you fine-tuned |
| [Vaswani et al., *Attention Is All You Need* (2017)](https://arxiv.org/abs/1706.03762) | The transformer |
| Sculley et al., *Hidden Technical Debt in Machine Learning Systems* (2015) | Why ML systems are hard to maintain |

### From equation to code

A core skill is turning a paper's equations into working code. Take the **focal loss** from [Lin et al., *Focal Loss for Dense Object Detection* (2017)](https://arxiv.org/abs/1708.02002). For a binary label $y$ and a predicted probability $p$ of the positive class, the paper defines

$$
p_t = \begin{cases} p & \text{if } y = 1 \\ 1 - p & \text{otherwise} \end{cases}
\qquad
\text{FL}(p_t) = -\alpha_t (1 - p_t)^\gamma \log(p_t)
$$

where $\alpha_t$ is $\alpha$ for positives and $1 - \alpha$ for negatives. With $\gamma = 0$ and no $\alpha$, it's ordinary cross-entropy. With $\gamma = 2$, an example the model already gets right with $p_t = 0.9$ is down-weighted by $(1 - 0.9)^2 = 0.01$, so training focuses on the hard examples. You'll implement it below. When you do this with any paper:

- **Map every symbol** to a variable, and write down its shape.
- **Check the special cases** the paper mentions (here, $\gamma = 0$ gives cross-entropy).
- **Handle numerical edge cases** the paper ignores, such as $\log(0)$.
- **Compare with a reference implementation** if one exists.

## Learning in public

Sharing your work builds a track record, gets you feedback, and makes you learn more deeply, because explaining something reveals the gaps.

- **GitHub:** commit your projects and exercises. Steady activity over months says a lot.
- **Write:** a short post for every project or paper you work through. "What I learned implementing X" posts are useful to others and show how you think.
- **Kaggle notebooks:** publish clear analyses; good ones get upvoted and found.
- **Open source:** start with documentation fixes or issues labelled "good first issue" in libraries you use, such as scikit-learn or pandas.
- **Communities:** Kaggle discussions, the Hugging Face forums and Discord, and DataTalks.Club are welcoming places to ask questions and help others.

You don't need to be an expert to share. A clear write-up from someone a few months ahead is often more helpful to beginners than an expert's.

## Practice

:::exercise kg-adversarial Adversarial validation
Write `adversarial_auc(train, test, features, seed=0)`. Stack the `features` columns of `train` (labelled 0) and `test` (labelled 1), get **out-of-fold** probabilities of being a test row with `cross_val_predict(..., method="predict_proba")`, using `RandomForestClassifier(n_estimators=100, min_samples_leaf=5, random_state=seed)` and `StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)`, and return the ROC AUC as a float. Use only the listed features.

The starter fits and scores on the same rows. Run the tests to see why that's wrong.

@@starter
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score

def adversarial_auc(train, test, features, seed=0):
    X = pd.concat([train[features], test[features]])
    y = np.r_[np.zeros(len(train)), np.ones(len(test))]
    clf = RandomForestClassifier(n_estimators=100, min_samples_leaf=5, random_state=seed).fit(X, y)
    return float(roc_auc_score(y, clf.predict_proba(X)[:, 1]))

@@solution
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

def adversarial_auc(train, test, features, seed=0):
    X = pd.concat([train[features], test[features]])
    y = np.r_[np.zeros(len(train)), np.ones(len(test))]
    clf = RandomForestClassifier(n_estimators=100, min_samples_leaf=5, random_state=seed)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    p = cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]
    return float(roc_auc_score(y, p))

@@tests
import numpy as np
import pandas as pd

rng = np.random.default_rng(0)
train = pd.DataFrame({"x1": rng.normal(0, 1, 300), "x2": rng.normal(0, 1, 300), "id": np.arange(300)})
test_same = pd.DataFrame({"x1": rng.normal(0, 1, 200), "x2": rng.normal(0, 1, 200), "id": np.arange(300, 500)})
test_shifted = pd.DataFrame({"x1": rng.normal(2.5, 1, 200), "x2": rng.normal(0, 1, 200), "id": np.arange(300, 500)})

def test_same_distribution():
    """Indistinguishable data scores close to 0.5 (needs out-of-fold predictions)"""
    auc = adversarial_auc(train, test_same, ["x1", "x2"])
    assert isinstance(auc, float) and 0.4 < auc < 0.6

def test_shift_detected():
    """A shifted feature is easy to spot"""
    assert adversarial_auc(train, test_shifted, ["x1", "x2"]) > 0.9

def test_only_listed_features():
    """The id column would give the game away, so it mustn't be used"""
    assert adversarial_auc(train, test_same, ["x2"]) < 0.6
:::

:::exercise kg-rank Rank averaging
Kagglers often ensemble by averaging **ranks** rather than raw scores, so that models with different score scales count equally (the result only matters for metrics like AUC that depend on order). Write `rank_average(predictions, weights=None)`. `predictions` is a list of equal-length arrays. Convert each to ranks with `scipy.stats.rankdata` (which gives tied values their average rank), divide by the array length, then take a weighted average across models. `weights` defaults to equal weights and should be normalised to sum to 1. Return a NumPy array.

@@starter
import numpy as np

def rank_average(predictions, weights=None):
    return np.mean(predictions, axis=0)

@@solution
import numpy as np
from scipy.stats import rankdata

def rank_average(predictions, weights=None):
    ranks = np.array([rankdata(p) / len(p) for p in predictions])
    w = np.ones(len(predictions)) if weights is None else np.asarray(weights, dtype=float)
    return (w / w.sum()) @ ranks

@@tests
import numpy as np
from scipy.stats import rankdata

rng = np.random.default_rng(2)
a, b = rng.random(50), rng.normal(0, 10, 50)

def test_equal_weights():
    """Average of normalised ranks"""
    expected = (rankdata(a) / 50 + rankdata(b) / 50) / 2
    assert np.allclose(rank_average([a, b]), expected)

def test_scale_free():
    """A monotonic transform of one model changes nothing"""
    assert np.allclose(rank_average([a, b]), rank_average([np.log(a), b * 1000]))

def test_weights_and_ties():
    """Weights are normalised; ties share their average rank"""
    expected = 0.75 * rankdata(a) / 50 + 0.25 * rankdata(b) / 50
    assert np.allclose(rank_average([a, b], weights=[3, 1]), expected)
    assert np.allclose(rank_average([np.array([0.1, 0.5, 0.5, 0.9])]), [0.25, 0.625, 0.625, 1.0])
:::

:::exercise kg-focal From paper to code: focal loss
Implement the focal loss from the lesson as `focal_loss(y_true, p, gamma=2.0, alpha=None)`. `y_true` holds 0/1 labels and `p` the predicted probabilities of class 1. Clip `p` to `[1e-7, 1 - 1e-7]` first. Compute $p_t$, and $\alpha_t$ (`alpha` for positives, `1 - alpha` for negatives, or 1 for every example when `alpha` is `None`), and return the **mean** of $-\alpha_t (1 - p_t)^\gamma \log(p_t)$ as a float.

@@starter
import numpy as np

def focal_loss(y_true, p, gamma=2.0, alpha=None):
    y, p = np.asarray(y_true), np.clip(np.asarray(p, dtype=float), 1e-7, 1 - 1e-7)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))

@@solution
import numpy as np

def focal_loss(y_true, p, gamma=2.0, alpha=None):
    y = np.asarray(y_true)
    p = np.clip(np.asarray(p, dtype=float), 1e-7, 1 - 1e-7)
    p_t = np.where(y == 1, p, 1 - p)
    alpha_t = 1.0 if alpha is None else np.where(y == 1, alpha, 1 - alpha)
    return float(np.mean(-alpha_t * (1 - p_t) ** gamma * np.log(p_t)))

@@tests
import math
import numpy as np
from sklearn.metrics import log_loss

rng = np.random.default_rng(4)
y = rng.integers(0, 2, 200)
p = rng.random(200)

def test_gamma_zero_is_cross_entropy():
    """The special case from the paper"""
    assert math.isclose(focal_loss(y, p, gamma=0), log_loss(y, p), rel_tol=1e-9)

def test_easy_examples_down_weighted():
    """p_t = 0.9 is weighted by (1 - 0.9)^2"""
    assert math.isclose(focal_loss([1], [0.9]), 0.01 * -math.log(0.9), rel_tol=1e-9)
    assert math.isclose(focal_loss([0], [0.1]), 0.01 * -math.log(0.9), rel_tol=1e-9)

def test_alpha_and_clipping():
    """alpha for positives, 1 - alpha for negatives; no infinities"""
    expected = np.mean(np.where(y == 1, 0.25, 0.75) * (1 - np.where(y == 1, p, 1 - p)) ** 2
                       * -np.log(np.where(y == 1, p, 1 - p)))
    assert math.isclose(focal_loss(y, p, gamma=2, alpha=0.25), expected, rel_tol=1e-9)
    assert math.isfinite(focal_loss([1, 0], [0.0, 1.0]))
:::

:::quiz kg-quiz Quick check
? You've made 150 submissions and your best public score is far above your cross-validation score. What's most likely?
- [x] You've overfitted the public leaderboard; expect a drop on the private one
- [ ] Your model will win
- [ ] Cross-validation is broken
> Picking the best of many noisy scores is the winner's curse. Trust a CV that mimics the test split.

? Adversarial validation gives an AUC of 0.95. What does that tell you?
- [x] Training and test data differ a lot; find which features give it away
- [ ] Your model will score 0.95 on the test set
- [ ] Everything is fine
> Look at the features the classifier relies on, and consider dropping or transforming them.

? What should you do in a first, five-minute pass through a paper?
- [x] Read the title, abstract, introduction, headings, figures and conclusion
- [ ] Check every proof
- [ ] Reimplement the method
> Decide whether it's relevant before investing hours.

? With γ = 0 and no α, what does the focal loss reduce to?
- [x] Ordinary cross-entropy (log loss)
- [ ] Mean squared error
- [ ] Zero
> Always check the special cases a paper mentions; they make excellent tests.
:::
