---
title: Derivatives and gradient descent
summary: Derivatives as slopes, gradients, the chain rule, and gradient descent, the algorithm that trains almost every ML model. You'll fit linear and logistic regression with it from scratch.
minutes: 60
kind: lesson
---

Training a model means finding the parameters that make its **loss** (its error) as small as possible. For most models there's no formula like the normal equation, so we search: start somewhere, work out which direction is downhill, take a small step, repeat. That's **gradient descent**, and it trains everything from logistic regression to GPT.

## Derivatives are slopes

The derivative $f'(x)$ is the slope of $f$ at $x$: how fast $f$ changes when $x$ changes a tiny bit. You can estimate it numerically by nudging $x$:

$$
f'(x) \approx \frac{f(x + h) - f(x - h)}{2h}
$$

```python
def f(x):
    return (x - 3) ** 2 + 1

def derivative(func, x, h=1e-5):
    return (func(x + h) - func(x - h)) / (2 * h)

for x in [0, 2, 3, 5]:
    print(f"x = {x}: slope {derivative(f, x):+.3f}")
```

At $x = 3$ the slope is zero: that's the minimum. To the left the slope is negative (going right goes downhill); to the right it's positive.

A few derivative rules you'll see in ML papers:

| Function | Derivative |
| --- | --- |
| $x^n$ | $n x^{n-1}$ |
| $e^x$ | $e^x$ |
| $\ln x$ | $1/x$ |
| $\sigma(x) = 1/(1+e^{-x})$ | $\sigma(x)(1 - \sigma(x))$ |
| $f(g(x))$ (chain rule) | $f'(g(x)) \cdot g'(x)$ |

## Gradient descent in one dimension

Move **against** the slope, by a step proportional to it:

$$
x \leftarrow x - \eta \, f'(x)
$$

$\eta$ (eta) is the **learning rate**.

```python
import matplotlib.pyplot as plt
import numpy as np

def f(x):
    return (x - 3) ** 2 + 1

def f_prime(x):
    return 2 * (x - 3)

def descend(lr, x=-4.0, steps=25):
    path = [x]
    for _ in range(steps):
        x = x - lr * f_prime(x)
        path.append(x)
    return np.array(path)

xs = np.linspace(-5, 10, 200)
fig, axes = plt.subplots(1, 3, figsize=(12, 3.2), sharey=True)
for ax, lr in zip(axes, [0.05, 0.4, 1.02]):
    path = descend(lr)
    ax.plot(xs, f(xs), color="grey")
    ax.plot(path, f(path), "o-", markersize=3)
    ax.set_title(f"learning rate {lr}: ends at x = {path[-1]:.2f}")
    ax.set_ylim(0, 60)
fig.tight_layout()
plt.show()
```

- Too small, and it crawls.
- Well chosen, and it converges quickly.
- Too large, and it overshoots and **diverges**.

Choosing the learning rate is one of the most important practical decisions when training models, especially neural networks.

## Gradients: many parameters at once

With many parameters, the **gradient** $\nabla L$ is the vector of partial derivatives, one per parameter, each saying how the loss changes if you nudge just that parameter. It points uphill; gradient descent steps the opposite way:

$$
\mathbf{w} \leftarrow \mathbf{w} - \eta \, \nabla L(\mathbf{w})
$$

## Linear regression by gradient descent

For linear regression with mean squared error $L = \frac{1}{n}\lVert \mathbf{y} - X\mathbf{w} \rVert^2$, the gradient is:

$$
\nabla L = -\frac{2}{n} X^\top (\mathbf{y} - X\mathbf{w})
$$

```python
import numpy as np
import pandas as pd

houses = pd.read_csv("data/houses.csv")
features = ["size_sqm", "age_years", "distance_km"]
X_raw = houses[features].to_numpy(float)
X = (X_raw - X_raw.mean(axis=0)) / X_raw.std(axis=0)       # standardise: crucial for gradient descent
X = np.column_stack([np.ones(len(X)), X])
y = houses["price"].to_numpy(float) / 1000                  # in £ thousands

w = np.zeros(X.shape[1])
lr = 0.1
for epoch in range(300):
    residuals = y - X @ w
    gradient = -2 / len(y) * X.T @ residuals
    w -= lr * gradient
    if epoch % 75 == 0:
        print(f"epoch {epoch:>3}: MSE {np.mean(residuals ** 2):,.1f}")

exact = np.linalg.solve(X.T @ X, X.T @ y)
print("gradient descent:", w.round(2))
print("normal equation: ", exact.round(2))
```

Same answer, found by walking downhill. Without standardising, features on very different scales make the loss surface a long, thin valley, and gradient descent zig-zags painfully (try removing that line).

## Logistic regression from scratch

For classification we predict a **probability** with the sigmoid function, which squashes any number into (0, 1):

$$
p = \sigma(\mathbf{w}^\top \mathbf{x}) = \frac{1}{1 + e^{-\mathbf{w}^\top \mathbf{x}}}
$$

The loss is **log loss** (cross-entropy), which punishes confident wrong predictions heavily:

$$
L = -\frac{1}{n}\sum_i \big[ y_i \ln p_i + (1 - y_i) \ln(1 - p_i) \big]
$$

Its gradient is wonderfully simple: $\nabla L = \frac{1}{n} X^\top (\mathbf{p} - \mathbf{y})$.

```python
import numpy as np
import pandas as pd

houses = pd.read_csv("data/houses.csv")
y = (houses["price"] > houses["price"].median()).to_numpy(int)       # 1 = above-median price
X_raw = houses[["size_sqm", "distance_km", "age_years"]].to_numpy(float)
X = np.column_stack([np.ones(len(y)), (X_raw - X_raw.mean(axis=0)) / X_raw.std(axis=0)])

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

w = np.zeros(X.shape[1])
for step in range(2000):
    p = sigmoid(X @ w)
    w -= 0.5 * X.T @ (p - y) / len(y)

p = sigmoid(X @ w)
log_loss = -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))
accuracy = ((p > 0.5) == y).mean()
print("weights (intercept, size, distance, age):", w.round(2))
print(f"log loss {log_loss:.3f} (a coin-flip model scores {np.log(2):.3f}), accuracy {accuracy:.1%}")
```

That's a complete logistic regression, the most important baseline model in this course, in about ten lines. In Phase 5 you'll use scikit-learn's version, which adds regularisation and better optimisers.

## The chain rule and backpropagation

Neural networks are functions inside functions: $L(\sigma(W_2\,\sigma(W_1 x)))$. The **chain rule** says the derivative of a composition is the product of the derivatives of its parts. **Backpropagation** applies the chain rule layer by layer from the loss backwards, computing every gradient in one efficient pass. Libraries like PyTorch do it automatically ("autograd"), and you'll implement it by hand in NumPy at the start of Phase 7.

## Practice

:::exercise calc-derivative Numerical derivative
Write `derivative(f, x, h=1e-5)` using the central difference formula, and `gradient(f, point, h=1e-5)` that returns a NumPy array of partial derivatives of a function of a vector, by nudging one coordinate at a time.

@@starter
import numpy as np

def derivative(f, x, h=1e-5):
    return 0.0

def gradient(f, point, h=1e-5):
    point = np.asarray(point, dtype=float)
    return np.zeros_like(point)

@@solution
import numpy as np

def derivative(f, x, h=1e-5):
    return (f(x + h) - f(x - h)) / (2 * h)

def gradient(f, point, h=1e-5):
    point = np.asarray(point, dtype=float)
    grad = np.zeros_like(point)
    for i in range(len(point)):
        step = np.zeros_like(point)
        step[i] = h
        grad[i] = (f(point + step) - f(point - step)) / (2 * h)
    return grad

@@tests
import math
import numpy as np

def test_derivative():
    """Matches known derivatives"""
    assert math.isclose(derivative(lambda x: x ** 3, 2.0), 12.0, rel_tol=1e-6)
    assert math.isclose(derivative(math.exp, 1.0), math.e, rel_tol=1e-6)
    assert math.isclose(derivative(math.sin, 0.0), 1.0, rel_tol=1e-6)

def test_gradient():
    """Gradient of x² + 3y² at (1, 2) is (2, 12)"""
    g = gradient(lambda v: v[0] ** 2 + 3 * v[1] ** 2, [1.0, 2.0])
    assert np.allclose(g, [2.0, 12.0], atol=1e-4)
:::

:::exercise calc-gd Gradient descent
Write `gradient_descent(grad, start, lr, steps)` that starts at the NumPy array `start`, applies `x = x - lr * grad(x)` for `steps` iterations, and returns a tuple `(final_x, history)` where `history` is a list of the **positions** visited, including the start (so it has `steps + 1` entries). Store copies, so later updates don't change earlier entries.

@@starter
import numpy as np

def gradient_descent(grad, start, lr, steps):
    x = np.asarray(start, dtype=float)
    history = [x.copy()]
    return x, history

@@solution
import numpy as np

def gradient_descent(grad, start, lr, steps):
    x = np.asarray(start, dtype=float)
    history = [x.copy()]
    for _ in range(steps):
        x = x - lr * grad(x)
        history.append(x.copy())
    return x, history

@@tests
import numpy as np

def bowl_grad(v):
    # gradient of (x - 1)² + 2(y + 3)²
    return np.array([2 * (v[0] - 1), 4 * (v[1] + 3)])

def test_converges():
    """Finds the minimum of a bowl at (1, -3)"""
    x, history = gradient_descent(bowl_grad, [5.0, 5.0], 0.1, 200)
    assert np.allclose(x, [1, -3], atol=1e-4)
    assert len(history) == 201

def test_history_starts_at_start():
    """History begins at the start point and isn't aliased"""
    _, history = gradient_descent(bowl_grad, [5.0, 5.0], 0.1, 3)
    assert np.allclose(history[0], [5, 5]) and not np.allclose(history[0], history[1])

def test_diverges():
    """Too large a learning rate diverges"""
    x, _ = gradient_descent(bowl_grad, [5.0, 5.0], 0.6, 50)
    assert np.abs(x).max() > 1e3
:::

:::exercise calc-logreg Log loss and its gradient
Write two functions for logistic regression:

- `log_loss(y, p, eps=1e-15)`: mean log loss, clipping `p` to `[eps, 1 - eps]` first so `log(0)` can't happen. Return a float.
- `fit_logistic(X, y, lr, steps)`: `X` already includes a column of ones. Start with zero weights and run `steps` gradient descent updates with gradient $X^\top(\sigma(X\mathbf{w}) - \mathbf{y}) / n$. Return the weights.

@@starter
import numpy as np

def log_loss(y, p, eps=1e-15):
    return 0.0

def fit_logistic(X, y, lr, steps):
    return np.zeros(X.shape[1])

@@solution
import numpy as np

def log_loss(y, p, eps=1e-15):
    y = np.asarray(y, dtype=float)
    p = np.clip(np.asarray(p, dtype=float), eps, 1 - eps)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))

def fit_logistic(X, y, lr, steps):
    w = np.zeros(X.shape[1])
    for _ in range(steps):
        p = 1 / (1 + np.exp(-(X @ w)))
        w -= lr * X.T @ (p - y) / len(y)
    return w

@@tests
import math
import numpy as np

def test_log_loss_values():
    """Log loss for simple cases"""
    assert math.isclose(log_loss([1, 0], [0.5, 0.5]), math.log(2))
    assert log_loss([1], [0.99]) < 0.02
    assert math.isfinite(log_loss([1, 0], [0.0, 1.0])), "clip p so log(0) doesn't happen"

def test_fit():
    """Learns a separable relationship"""
    rng = np.random.default_rng(0)
    x = rng.normal(0, 1, 400)
    y = (x + rng.normal(0, 0.5, 400) > 0).astype(float)
    X = np.column_stack([np.ones(400), x])
    w = fit_logistic(X, y, 0.5, 2000)
    p = 1 / (1 + np.exp(-(X @ w)))
    assert w[1] > 1.5, w
    assert log_loss(y, p) < 0.35
:::

:::quiz calc-quiz Quick check
? At a minimum of a smooth function, the derivative is:
- [x] Zero
- [ ] Positive
- [ ] Negative
> The slope is flat at the bottom.

? In gradient descent, why do we subtract the gradient?
- [x] The gradient points uphill, so its negative points downhill
- [ ] To make the numbers smaller
- [ ] It's a convention with no reason
> We want to decrease the loss.

? Gradient descent's loss is increasing and exploding. The most likely fix?
- [x] Lower the learning rate
- [ ] Raise the learning rate
- [ ] Train for more steps
> Too-large steps overshoot the minimum.

? Why standardise features before gradient descent?
- [x] Features on similar scales make the loss surface rounder, so gradient descent converges much faster
- [ ] It changes what the model can learn
- [ ] It's only needed for neural networks
> It's standard practice for any gradient-based model.
:::
