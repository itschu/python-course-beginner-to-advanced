---
title: Training a tiny model
summary: Train logistic regression and a small neural network on the gesture features, count their parameters, and pick the smallest model that's good enough.
minutes: 50
kind: lesson
---

With five features per window, the learning problem is small. That's the point: in TinyML, a good feature design lets a **tiny** model do the job.

## The dataset

Every cell runs on its own, so each one starts by computing the features (the same integer features as lesson 2):

```python
import math
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

N = 40

def features(counts):
    out = []
    for axis in range(3):
        x = [int(v) for v in counts[:, axis]]
        s, sq = sum(x), sum(v * v for v in x)
        out.append(math.isqrt(N * sq - s * s))
    for axis in range(2):
        x = [int(v) for v in counts[:, axis]]
        s = sum(x)
        d = [N * v - s for v in x]
        out.append(sum(1 for a, b in zip(d, d[1:]) if a * b < 0))
    return out

df = pd.read_csv("data/gestures.csv")
windows = [w for _, w in df.groupby("window")]
X = np.array([features(np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)) for w in windows])
y = np.array([w.gesture.iloc[0] for w in windows])

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
print(X_train.shape, X_test.shape)
print(pd.Series(y_train).value_counts().to_dict())
```

The split is **stratified**, so each gesture has the same share in training and test. With real recordings you'd split **by person** instead, so the test set measures how well the model works for someone it has never seen (Phase 6's lesson on leakage applies here too).

## Logistic regression versus a small network

```python
import math
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

N = 40

def features(counts):
    out = []
    for axis in range(3):
        x = [int(v) for v in counts[:, axis]]
        s, sq = sum(x), sum(v * v for v in x)
        out.append(math.isqrt(N * sq - s * s))
    for axis in range(2):
        x = [int(v) for v in counts[:, axis]]
        s = sum(x)
        d = [N * v - s for v in x]
        out.append(sum(1 for a, b in zip(d, d[1:]) if a * b < 0))
    return out

df = pd.read_csv("data/gestures.csv")
windows = [w for _, w in df.groupby("window")]
X = np.array([features(np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)) for w in windows])
y = np.array([w.gesture.iloc[0] for w in windows])
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

def n_params(model):
    clf = model[-1]
    if hasattr(clf, "coefs_"):
        return sum(w.size for w in clf.coefs_) + sum(b.size for b in clf.intercepts_)
    return clf.coef_.size + clf.intercept_.size

candidates = {
    "logistic, 3 std features": (LogisticRegression(max_iter=1000), [0, 1, 2]),
    "logistic, all 5 features": (LogisticRegression(max_iter=1000), [0, 1, 2, 3, 4]),
    "MLP 5-8-4": (MLPClassifier(hidden_layer_sizes=(8,), max_iter=4000, random_state=1), [0, 1, 2, 3, 4]),
}
for name, (clf, cols) in candidates.items():
    model = make_pipeline(StandardScaler(), clf).fit(X_train[:, cols], y_train)
    print(f"{name:<26} accuracy {model.score(X_test[:, cols], y_test):.3f}   {n_params(model):>3} parameters")

model = make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(8,), max_iter=4000, random_state=1))
model.fit(X_train, y_train)
print(model.classes_)
print(confusion_matrix(y_test, model.predict(X_test), labels=model.classes_))
```

Notes:

- The **standard scaler** matters even more than usual: the std features are in the hundreds of thousands while crossing counts are below 40. Without scaling, the model would barely see the crossings.
- Adding the two zero-crossing features fixes most of the confusion between wave and circle and between shake and wave.
- The MLP with 8 hidden units has **84 parameters** and gets every test window right, one more than logistic regression. With 60 test windows that difference is within noise, but it's also the shape of model you'll quantize and deploy: a hidden layer with ReLU is what real TinyML networks are built from, and the techniques scale to bigger ones.

## How small can it go?

For a device, "best accuracy" isn't the goal. The goal is **the smallest, cheapest model that meets the requirement**. Try shrinking the hidden layer and watch accuracy:

```python
import math
import numpy as np
import pandas as pd
from sklearn.model_selection import cross_val_score
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

N = 40

def features(counts):
    out = []
    for axis in range(3):
        x = [int(v) for v in counts[:, axis]]
        s, sq = sum(x), sum(v * v for v in x)
        out.append(math.isqrt(N * sq - s * s))
    for axis in range(2):
        x = [int(v) for v in counts[:, axis]]
        s = sum(x)
        d = [N * v - s for v in x]
        out.append(sum(1 for a, b in zip(d, d[1:]) if a * b < 0))
    return out

df = pd.read_csv("data/gestures.csv")
windows = [w for _, w in df.groupby("window")]
X = np.array([features(np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)) for w in windows])
y = np.array([w.gesture.iloc[0] for w in windows])

for hidden in (2, 4, 8, 16):
    model = make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(hidden,), max_iter=4000, random_state=1))
    scores = cross_val_score(model, X, y, cv=5)
    params = 5 * hidden + hidden + hidden * 4 + 4
    print(f"hidden {hidden:>2}: {params:>4} params, cross-validated accuracy {scores.mean():.3f}")
```

Cross-validation (Phase 5) gives a more reliable estimate than one test split when you only have 240 windows. Two hidden units are too few, but four do as well as sixteen: on a device you'd ship the 44-parameter model. We'll keep 8 in the next lessons, because a little headroom makes quantization errors easier to absorb.

:::tip What matters on the device
Accuracy on a test set isn't the whole story. A gesture recogniser that constantly fires false "shake" events while the user is walking is useless, however good its test accuracy. Collect plenty of **negative** examples (walking, typing, sitting on a bus) as "idle", measure false positives per hour, and add smoothing (lesson 7).
:::

## Practice

:::exercise tinyml-train-small Train within a budget
Complete `train(X_train, y_train)`. It must return a **fitted** scikit-learn pipeline that starts with a `StandardScaler`, ends with an `MLPClassifier` with **at most 100 parameters**, and reaches at least **95%** accuracy on the test windows. Use `random_state` so the result is reproducible.

The starter already computes the features and the train/test split.

@@starter
import math
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

N = 40

def features(counts):
    out = []
    for axis in range(3):
        x = [int(v) for v in counts[:, axis]]
        s, sq = sum(x), sum(v * v for v in x)
        out.append(math.isqrt(N * sq - s * s))
    for axis in range(2):
        x = [int(v) for v in counts[:, axis]]
        s = sum(x)
        d = [N * v - s for v in x]
        out.append(sum(1 for a, b in zip(d, d[1:]) if a * b < 0))
    return out

df = pd.read_csv("data/gestures.csv")
windows = [w for _, w in df.groupby("window")]
X = np.array([features(np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)) for w in windows])
y = np.array([w.gesture.iloc[0] for w in windows])
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

def train(X_train, y_train):
    pass

@@solution
import math
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

N = 40

def features(counts):
    out = []
    for axis in range(3):
        x = [int(v) for v in counts[:, axis]]
        s, sq = sum(x), sum(v * v for v in x)
        out.append(math.isqrt(N * sq - s * s))
    for axis in range(2):
        x = [int(v) for v in counts[:, axis]]
        s = sum(x)
        d = [N * v - s for v in x]
        out.append(sum(1 for a, b in zip(d, d[1:]) if a * b < 0))
    return out

df = pd.read_csv("data/gestures.csv")
windows = [w for _, w in df.groupby("window")]
X = np.array([features(np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)) for w in windows])
y = np.array([w.gesture.iloc[0] for w in windows])
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

def train(X_train, y_train):
    model = make_pipeline(
        StandardScaler(),
        MLPClassifier(hidden_layer_sizes=(8,), max_iter=4000, random_state=1),
    )
    return model.fit(X_train, y_train)

@@tests
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

model = train(X_train, y_train)

def test_pipeline_shape():
    """A StandardScaler followed by an MLPClassifier"""
    assert isinstance(model[0], StandardScaler) and isinstance(model[-1], MLPClassifier)

def test_budget():
    """At most 100 parameters"""
    clf = model[-1]
    n = sum(w.size for w in clf.coefs_) + sum(b.size for b in clf.intercepts_)
    assert n <= 100, f"{n} parameters"

def test_accuracy():
    """At least 95% test accuracy"""
    acc = model.score(X_test, y_test)
    assert acc >= 0.95, f"test accuracy {acc:.3f}"

@@hint
`make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(8,), max_iter=4000, random_state=1)).fit(X_train, y_train)`.

@@hint
A 5-8-4 network has 5×8 + 8 + 8×4 + 4 = 84 parameters. 16 hidden units would be 164: over budget.
:::

:::quiz tinyml-training-check Quick check
? Why is standardising especially important for these features?
- [x] The std features are around 100,000 while crossing counts are below 40, so unscaled the crossings would barely matter
- [ ] The MLP requires values between 0 and 1
- [ ] To make them integers
> The scaler's means and standard deviations become part of the deployed model.

? With real recordings from 20 people, how should you split train and test?
- [ ] Randomly by window
- [x] By person, so the test set contains only people the model never saw
- [ ] By gesture
> Windows from the same person are similar; a random split leaks that similarity and overstates accuracy.

? What's the goal when choosing a TinyML model?
- [ ] The highest possible accuracy
- [x] The smallest, cheapest model that meets the requirements on the device
- [ ] The most layers
> Every parameter costs flash, every MAC costs time and energy.
:::
