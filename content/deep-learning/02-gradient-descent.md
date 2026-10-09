---
title: Loss functions and gradient descent
summary: How networks learn - define a loss, compute its gradient, step downhill - with learning rates, feature scaling, mini-batches and gradient checking, all in NumPy.
minutes: 50
kind: lesson
---

Training a neural network means finding weights that make a **loss function** small. The loss measures how wrong the predictions are: mean squared error for regression, cross-entropy (log loss) for classification. A network can have millions of weights, so you can't try them all. Instead you follow the slope downhill.

## Gradient descent

The **gradient** of the loss is the vector of partial derivatives with respect to each weight. It points uphill, so you take a small step the other way:

$$
w \leftarrow w - \eta \, \frac{\partial L}{\partial w}
$$

The step size $\eta$ is the **learning rate**. Here's gradient descent on $L(w) = (w - 3)^2$, whose gradient is $2(w - 3)$, starting from $w = -4$:

```python
import matplotlib.pyplot as plt
import numpy as np

def descend(lr, steps=25, w=-4.0):
    path = [w]
    for _ in range(steps):
        w = w - lr * 2 * (w - 3)          # gradient of (w - 3)^2
        path.append(w)
    return np.array(path)

grid = np.linspace(-6, 12, 200)
fig, axes = plt.subplots(1, 3, figsize=(10, 3), sharey=True)
for ax, lr in zip(axes, [0.02, 0.3, 1.02]):
    path = descend(lr)
    ax.plot(grid, (grid - 3) ** 2, color="grey")
    ax.plot(path, (path - 3) ** 2, "o-", ms=3)
    ax.set_title(f"learning rate {lr}: w ends at {path[-1]:.2f}")
    ax.set_ylim(0, 100)
fig.tight_layout()
plt.show()
```

- Too small (0.02): it moves in the right direction but very slowly.
- About right (0.3): it reaches the minimum at $w = 3$ in a few steps.
- Too big (1.02): every step overshoots further than the last, and the loss explodes.

Choosing the learning rate is the single most important tuning decision in deep learning.

## Linear regression by gradient descent

For a linear model $\hat{y} = X\mathbf{w} + b$ with mean squared error $L = \frac{1}{n}\sum (\hat{y}_i - y_i)^2$, the gradients are:

$$
\frac{\partial L}{\partial \mathbf{w}} = \frac{2}{n} X^\top (\hat{\mathbf{y}} - \mathbf{y}), \qquad \frac{\partial L}{\partial b} = \frac{2}{n} \sum_i (\hat{y}_i - y_i)
$$

Let's train it on house prices (in thousands) and check the answer against scikit-learn's exact solution:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

houses = pd.read_csv("data/houses.csv")
cols = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X = houses[cols].to_numpy(dtype=float)
y = houses["price"].to_numpy(dtype=float) / 1000
X = (X - X.mean(axis=0)) / X.std(axis=0)          # standardise: mean 0, sd 1

w, b, lr, losses = np.zeros(X.shape[1]), 0.0, 0.1, []
for step in range(200):
    error = X @ w + b - y
    losses.append(np.mean(error ** 2))
    w -= lr * 2 * X.T @ error / len(y)
    b -= lr * 2 * error.mean()

exact = LinearRegression().fit(X, y)
print("gradient descent:", w.round(2), round(b, 2))
print("scikit-learn:    ", exact.coef_.round(2), round(exact.intercept_, 2))

fig, ax = plt.subplots(figsize=(6, 3))
ax.plot(losses)
ax.set_yscale("log")
ax.set_xlabel("step")
ax.set_ylabel("mean squared error")
fig.tight_layout()
plt.show()
```

Two hundred small steps land on the same weights as the exact formula. For linear regression the formula is faster, but for neural networks there's no formula, and gradient descent is all there is.

## Why scaling matters

The features above were standardised. Without that, `size_sqm` (around 100) and `has_garden` (0 or 1) have gradients of wildly different sizes, so no single learning rate suits them all:

```python
import numpy as np
import pandas as pd

houses = pd.read_csv("data/houses.csv")
cols = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X = houses[cols].to_numpy(dtype=float)
y = houses["price"].to_numpy(dtype=float) / 1000

for lr in [1e-5, 1e-4]:
    w, b = np.zeros(X.shape[1]), 0.0
    with np.errstate(over="ignore", invalid="ignore"):
        for step in range(200):
            error = X @ w + b - y
            w -= lr * 2 * X.T @ error / len(y)
            b -= lr * 2 * error.mean()
        loss = np.mean((X @ w + b - y) ** 2)
    print(f"unscaled, learning rate {lr}: loss after 200 steps = {loss:.4g}")
print("standardised, learning rate 0.1: loss after 200 steps = 2455 (the minimum)")
```

The small learning rate crawls; ten times bigger and it diverges. Always scale inputs before training a neural network.

## Mini-batches and epochs

Computing the gradient on every example for every step is slow with millions of rows. **Stochastic gradient descent (SGD)** estimates the gradient from a small random **mini-batch** (say 32 examples) instead. One pass through all the data is an **epoch**.

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

houses = pd.read_csv("data/houses.csv")
cols = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X = houses[cols].to_numpy(dtype=float)
X = (X - X.mean(axis=0)) / X.std(axis=0)
y = houses["price"].to_numpy(dtype=float) / 1000

rng = np.random.default_rng(0)
w, b, lr, batch_size = np.zeros(X.shape[1]), 0.0, 0.05, 32
batch_losses, epoch_losses = [], []
for epoch in range(10):
    order = rng.permutation(len(y))                  # shuffle every epoch
    for start in range(0, len(y), batch_size):
        idx = order[start:start + batch_size]
        error = X[idx] @ w + b - y[idx]
        batch_losses.append(np.mean(error ** 2))
        w -= lr * 2 * X[idx].T @ error / len(idx)
        b -= lr * 2 * error.mean()
    epoch_losses.append(np.mean((X @ w + b - y) ** 2))

print(f"{len(batch_losses)} updates in 10 epochs; full-data loss after each epoch:")
print(np.round(epoch_losses, 0))
fig, ax = plt.subplots(figsize=(6, 3))
ax.plot(batch_losses, lw=0.7)
ax.set_yscale("log")
ax.set_xlabel("update")
ax.set_ylabel("mini-batch loss")
fig.tight_layout()
plt.show()
```

The mini-batch loss is noisy, but the trend is down, and each update is 25 times cheaper than a full-data step. On a GPU, batches of 32 to 512 are processed in parallel, which is why deep learning and GPUs go together.

## Checking gradients numerically

When you write gradients by hand (as you will next lesson), a tiny mistake makes training quietly fail. The fix is a **gradient check**: compare your formula with a numerical estimate from the definition of a derivative:

$$
\frac{\partial L}{\partial w_j} \approx \frac{L(w_j + \varepsilon) - L(w_j - \varepsilon)}{2\varepsilon}
$$

```python
import numpy as np

rng = np.random.default_rng(0)
X, y = rng.normal(size=(50, 3)), rng.normal(size=50)
w, b = rng.normal(size=3), 0.5

def loss(w):
    return np.mean((X @ w + b - y) ** 2)

analytic = 2 * X.T @ (X @ w + b - y) / len(y)
numeric = np.zeros_like(w)
eps = 1e-5
for j in range(len(w)):
    step = np.zeros_like(w)
    step[j] = eps
    numeric[j] = (loss(w + step) - loss(w - step)) / (2 * eps)

print("analytic:", analytic.round(6))
print("numeric: ", numeric.round(6))
print("max relative difference:", np.max(np.abs(analytic - numeric) / np.abs(analytic)))
```

A relative difference around $10^{-8}$ or smaller means the formula is right. Something like $10^{-2}$ means a bug.

## Practice

:::exercise gd-grads Gradients of mean squared error
Write `mse_gradients(X, y, w, b)` that returns the tuple `(dw, db)`: the gradients of $L = \frac{1}{n}\sum_i (X_i \cdot \mathbf{w} + b - y_i)^2$ with respect to `w` (an array) and `b` (a float).

@@starter
import numpy as np

def mse_gradients(X, y, w, b):
    return np.zeros_like(w), 0.0

@@solution
import numpy as np

def mse_gradients(X, y, w, b):
    error = X @ w + b - y
    return 2 * X.T @ error / len(y), 2 * error.mean()

@@tests
import numpy as np

def test_small_example():
    """Hand-checkable values"""
    X = np.array([[1.0, 0.0], [0.0, 1.0]])
    y = np.array([1.0, 2.0])
    dw, db = mse_gradients(X, y, np.array([0.0, 0.0]), 0.0)
    # errors are -1 and -2
    assert np.allclose(dw, [-1.0, -2.0]) and np.isclose(db, -3.0)

def test_against_numerical():
    """Matches a numerical gradient"""
    rng = np.random.default_rng(3)
    X, y, w, b = rng.normal(size=(40, 4)), rng.normal(size=40), rng.normal(size=4), 0.3
    loss = lambda w, b: np.mean((X @ w + b - y) ** 2)
    dw, db = mse_gradients(X, y, w, b)
    eps = 1e-6
    num_w = [(loss(w + eps * np.eye(4)[j], b) - loss(w - eps * np.eye(4)[j], b)) / (2 * eps) for j in range(4)]
    assert np.allclose(dw, num_w, atol=1e-6)
    assert np.isclose(db, (loss(w, b + eps) - loss(w, b - eps)) / (2 * eps), atol=1e-6)
:::

:::exercise gd-train Train with gradient descent
Write `fit_linear(X, y, lr, steps)`. Start from `w` = zeros and `b` = 0. At each step, record the current mean squared error in a list, then update `w` and `b` with the gradients from the previous exercise. Return `(w, b, losses)`.

@@starter
import numpy as np

def fit_linear(X, y, lr, steps):
    return np.zeros(X.shape[1]), 0.0, []

@@solution
import numpy as np

def fit_linear(X, y, lr, steps):
    w, b, losses = np.zeros(X.shape[1]), 0.0, []
    for _ in range(steps):
        error = X @ w + b - y
        losses.append(float(np.mean(error ** 2)))
        w = w - lr * 2 * X.T @ error / len(y)
        b = b - lr * 2 * error.mean()
    return w, b, losses

@@tests
import numpy as np

def test_recovers_true_weights():
    """Finds the weights that generated the data"""
    rng = np.random.default_rng(0)
    X = rng.normal(size=(500, 3))
    y = X @ np.array([2.0, -1.0, 0.5]) + 4.0 + rng.normal(0, 0.1, 500)
    w, b, losses = fit_linear(X, y, 0.1, 300)
    assert np.allclose(w, [2.0, -1.0, 0.5], atol=0.02) and abs(b - 4.0) < 0.02

def test_losses_recorded():
    """One loss per step, decreasing, starting from the all-zero model"""
    X = np.array([[1.0], [2.0], [3.0]])
    y = np.array([2.0, 4.0, 6.0])
    w, b, losses = fit_linear(X, y, 0.05, 50)
    assert len(losses) == 50 and np.isclose(losses[0], np.mean(y ** 2))
    assert all(a >= b for a, b in zip(losses, losses[1:]))
:::

:::exercise gd-numgrad A numerical gradient
Write `numerical_gradient(f, w, eps=1e-5)` that estimates the gradient of a function `f` (which takes a NumPy array and returns a number) at `w` using central differences: for each element $j$, $(f(w + \varepsilon e_j) - f(w - \varepsilon e_j)) / 2\varepsilon$. Don't modify `w`. Return an array the same shape as `w`.

@@starter
import numpy as np

def numerical_gradient(f, w, eps=1e-5):
    return np.zeros_like(w)

@@solution
import numpy as np

def numerical_gradient(f, w, eps=1e-5):
    w = np.asarray(w, dtype=float)
    grad = np.zeros_like(w)
    for j in range(w.size):
        step = np.zeros_like(w)
        step.flat[j] = eps
        grad.flat[j] = (f(w + step) - f(w - step)) / (2 * eps)
    return grad

@@tests
import numpy as np

def test_quadratic():
    """Gradient of sum(w^2) is 2w"""
    w = np.array([1.0, -2.0, 0.5])
    assert np.allclose(numerical_gradient(lambda v: np.sum(v ** 2), w), 2 * w, atol=1e-6)

def test_does_not_modify_input():
    """The input array is unchanged"""
    w = np.array([1.0, 2.0])
    numerical_gradient(lambda v: np.sum(v ** 3), w)
    assert np.array_equal(w, [1.0, 2.0])

def test_matrix_input():
    """Works for 2-D arrays too"""
    W = np.array([[1.0, 2.0], [3.0, 4.0]])
    g = numerical_gradient(lambda M: np.sum(M ** 2) / 2, W)
    assert g.shape == (2, 2) and np.allclose(g, W, atol=1e-6)
:::

:::quiz gd-quiz Quick check
? Your training loss gets bigger with every step and becomes `nan`. The most likely cause?
- [x] The learning rate is too high
- [ ] The learning rate is too low
- [ ] The model has too few parameters
> Each step overshoots the minimum by more than the last.

? Why standardise features before gradient descent?
- [x] So one learning rate works for all weights
- [ ] It makes the model more accurate on any data
- [ ] Neural networks can't read unscaled numbers
> Features on very different scales get gradients of very different sizes.

? 6,400 training examples, batch size 64. How many weight updates happen in one epoch?
- [ ] 64
- [x] 100
- [ ] 6,400
> 6,400 / 64 = 100 mini-batches per pass through the data.

? Your hand-written gradient and the numerical gradient differ by 5% in relative terms. What does that suggest?
- [x] A bug in the gradient formula
- [ ] Normal rounding error
- [ ] The learning rate is wrong
> Correct gradients agree to around 1e-7 or better.
:::
