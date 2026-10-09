---
title: Backpropagation from scratch
summary: Use the chain rule to compute every gradient in a network in one backward pass, check it numerically, and train a two-layer network in NumPy that beats logistic regression on curved data.
minutes: 60
kind: lesson
---

Gradient descent needs the gradient of the loss with respect to **every** weight. **Backpropagation** computes all of them in one sweep backwards through the network, reusing intermediate results. It's just the chain rule from calculus, applied carefully. Once you've written it by hand, PyTorch's automatic version will make complete sense.

## The chain rule on a tiny network

Take one neuron with a sigmoid output and log loss. The forward pass is a chain of simple steps:

$$
z = wx + b, \qquad a = \sigma(z), \qquad L = -\big[y \ln a + (1 - y) \ln(1 - a)\big]
$$

The chain rule multiplies the local derivatives along the chain:

$$
\frac{\partial L}{\partial w} = \frac{\partial L}{\partial a} \cdot \frac{\partial a}{\partial z} \cdot \frac{\partial z}{\partial w}
$$

With $\frac{\partial L}{\partial a} = \frac{a - y}{a(1 - a)}$ and $\frac{\partial a}{\partial z} = a(1 - a)$, almost everything cancels: $\frac{\partial L}{\partial z} = a - y$. So $\frac{\partial L}{\partial w} = (a - y)\,x$ and $\frac{\partial L}{\partial b} = a - y$.

```python
import numpy as np

x, y, w, b = 2.0, 1.0, 0.5, -0.2

def loss(w, b):
    a = 1 / (1 + np.exp(-(w * x + b)))
    return -(y * np.log(a) + (1 - y) * np.log(1 - a))

a = 1 / (1 + np.exp(-(w * x + b)))
dz = a - y                                  # the famous simplification
print(f"backprop:  dL/dw = {dz * x:.6f}, dL/db = {dz:.6f}")

eps = 1e-6
print(f"numerical: dL/dw = {(loss(w + eps, b) - loss(w - eps, b)) / (2 * eps):.6f}, "
      f"dL/db = {(loss(w, b + eps) - loss(w, b - eps)) / (2 * eps):.6f}")
```

## Backprop through a layer

A network is a chain of layers. Each layer needs two methods: a **forward** pass that computes its output and remembers its input, and a **backward** pass that receives the gradient of the loss with respect to its output and returns the gradient with respect to its input (and its own weights).

For a dense layer $Z = XW + \mathbf{b}$, given $\frac{\partial L}{\partial Z}$ (written `dZ`, same shape as $Z$):

$$
\frac{\partial L}{\partial W} = X^\top \, dZ, \qquad \frac{\partial L}{\partial \mathbf{b}} = \sum_{\text{rows}} dZ, \qquad \frac{\partial L}{\partial X} = dZ \, W^\top
$$

For ReLU, $H = \max(0, Z)$, the gradient passes through where $Z > 0$ and is blocked elsewhere: `dZ = dH * (Z > 0)`.

A good habit: **every gradient has the same shape as the thing it's the gradient of.** If the shapes don't line up, the formula is wrong.

## A two-layer network in NumPy

Here's the full network for binary classification: dense → ReLU → dense → sigmoid, with mean log loss. Combining sigmoid and log loss gives the same simplification as before: the gradient at the output scores is $(P - y) / n$.

```python
import numpy as np

def init_params(n_in, n_hidden, seed=0):
    rng = np.random.default_rng(seed)
    return {
        "W1": rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_hidden)), "b1": np.zeros(n_hidden),
        "W2": rng.normal(0, np.sqrt(2 / n_hidden), size=(n_hidden, 1)), "b2": np.zeros(1),
    }

def forward(X, p):
    Z1 = X @ p["W1"] + p["b1"]
    H = np.maximum(0, Z1)
    Z2 = H @ p["W2"] + p["b2"]
    P = 1 / (1 + np.exp(-Z2.ravel()))
    return Z1, H, P

def loss_and_gradients(X, y, p):
    Z1, H, P = forward(X, p)
    Pc = np.clip(P, 1e-12, 1 - 1e-12)
    loss = -np.mean(y * np.log(Pc) + (1 - y) * np.log(1 - Pc))

    dZ2 = ((P - y) / len(y)).reshape(-1, 1)      # output layer
    grads = {"W2": H.T @ dZ2, "b2": dZ2.sum(axis=0)}
    dH = dZ2 @ p["W2"].T                          # back through layer 2
    dZ1 = dH * (Z1 > 0)                           # back through ReLU
    grads["W1"] = X.T @ dZ1
    grads["b1"] = dZ1.sum(axis=0)
    return loss, grads

# Gradient check on a small random problem
rng = np.random.default_rng(1)
X, y = rng.normal(size=(20, 2)), rng.integers(0, 2, 20).astype(float)
params = init_params(2, 5)
_, grads = loss_and_gradients(X, y, params)
eps = 1e-6
for name in params:
    numeric = np.zeros_like(params[name])
    for j in range(params[name].size):
        params[name].flat[j] += eps
        up = loss_and_gradients(X, y, params)[0]
        params[name].flat[j] -= 2 * eps
        down = loss_and_gradients(X, y, params)[0]
        params[name].flat[j] += eps
        numeric.flat[j] = (up - down) / (2 * eps)
    print(f"{name}: shape {params[name].shape}, max difference {np.max(np.abs(numeric - grads[name])):.2e}")
```

Every gradient matches its numerical estimate to many decimal places, so the backward pass is right.

## Training it

The "two moons" dataset has two interleaved half-circles. No straight line separates them, so logistic regression struggles. Let's train the network with plain gradient descent:

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.datasets import make_moons
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

def init_params(n_in, n_hidden, seed=0):
    rng = np.random.default_rng(seed)
    return {"W1": rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_hidden)), "b1": np.zeros(n_hidden),
            "W2": rng.normal(0, np.sqrt(2 / n_hidden), size=(n_hidden, 1)), "b2": np.zeros(1)}

def forward(X, p):
    Z1 = X @ p["W1"] + p["b1"]
    H = np.maximum(0, Z1)
    return Z1, H, 1 / (1 + np.exp(-(H @ p["W2"] + p["b2"]).ravel()))

def loss_and_gradients(X, y, p):
    Z1, H, P = forward(X, p)
    Pc = np.clip(P, 1e-12, 1 - 1e-12)
    loss = -np.mean(y * np.log(Pc) + (1 - y) * np.log(1 - Pc))
    dZ2 = ((P - y) / len(y)).reshape(-1, 1)
    dZ1 = (dZ2 @ p["W2"].T) * (Z1 > 0)
    return loss, {"W1": X.T @ dZ1, "b1": dZ1.sum(axis=0), "W2": H.T @ dZ2, "b2": dZ2.sum(axis=0)}

X, y = make_moons(n_samples=600, noise=0.25, random_state=0)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=0)

params, lr, history = init_params(2, 16), 0.5, []
for step in range(2000):
    loss, grads = loss_and_gradients(X_train, y_train, params)
    history.append(loss)
    for name in params:
        params[name] -= lr * grads[name]

accuracy = np.mean((forward(X_test, params)[2] > 0.5) == y_test)
logreg = LogisticRegression().fit(X_train, y_train)
print(f"final training loss {history[-1]:.3f}")
print(f"test accuracy: network {accuracy:.3f}, logistic regression {logreg.score(X_test, y_test):.3f}")

xx, yy = np.meshgrid(np.linspace(-2, 3, 200), np.linspace(-1.5, 2, 200))
grid = np.c_[xx.ravel(), yy.ravel()]
fig, axes = plt.subplots(1, 2, figsize=(10, 4))
for ax, (name, probs) in zip(axes, [("logistic regression", logreg.predict_proba(grid)[:, 1]),
                                     ("2-layer network", forward(grid, params)[2])]):
    ax.contourf(xx, yy, probs.reshape(xx.shape), levels=20, cmap="RdBu", alpha=0.6)
    ax.scatter(X_test[:, 0], X_test[:, 1], c=y_test, cmap="RdBu", edgecolor="k", s=15)
    ax.set_title(name)
fig.tight_layout()
plt.show()
```

The network bends its boundary around the moons and gets about 92% of the test points right, against 86% for the straight line of logistic regression. Sixteen hidden ReLU units, a hand-written backward pass and a loop: that's a neural network, with nothing hidden.

## The same thing in PyTorch, for later

PyTorch records every operation in the forward pass and runs backpropagation for you with `loss.backward()`. The training step from above becomes:

```python static
logits = model(X)                                   # forward pass
loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, y)
optimizer.zero_grad()
loss.backward()                                     # backpropagation, automatically
optimizer.step()                                    # w -= lr * grad, for every weight
```

It's the identical algorithm. Knowing what `backward()` does is what lets you debug it when training goes wrong.

## Practice

:::exercise bp-dense Backward pass of a dense layer
Write `dense_backward(dZ, X, W)` for a layer $Z = XW + \mathbf{b}$. Given the upstream gradient `dZ` (shape `(n, out)`), the layer's input `X` (shape `(n, in)`) and weights `W` (shape `(in, out)`), return the tuple `(dX, dW, db)`.

@@starter
import numpy as np

def dense_backward(dZ, X, W):
    return np.zeros_like(X), np.zeros_like(W), np.zeros(W.shape[1])

@@solution
import numpy as np

def dense_backward(dZ, X, W):
    return dZ @ W.T, X.T @ dZ, dZ.sum(axis=0)

@@tests
import numpy as np

def test_shapes_and_values():
    """Matches the formulas"""
    rng = np.random.default_rng(0)
    X, W, dZ = rng.normal(size=(5, 3)), rng.normal(size=(3, 4)), rng.normal(size=(5, 4))
    dX, dW, db = dense_backward(dZ, X, W)
    assert dX.shape == X.shape and dW.shape == W.shape and db.shape == (4,)
    assert np.allclose(dX, dZ @ W.T) and np.allclose(dW, X.T @ dZ) and np.allclose(db, dZ.sum(axis=0))

def test_against_numerical():
    """Gradients of L = sum(C * Z) for a fixed C"""
    rng = np.random.default_rng(1)
    X, W, b, C = rng.normal(size=(4, 3)), rng.normal(size=(3, 2)), rng.normal(size=2), rng.normal(size=(4, 2))
    loss = lambda X, W, b: np.sum(C * (X @ W + b))
    dX, dW, db = dense_backward(C, X, W)          # dL/dZ = C
    eps = 1e-6
    E = np.zeros_like(W); E[1, 0] = eps
    assert np.isclose(dW[1, 0], (loss(X, W + E, b) - loss(X, W - E, b)) / (2 * eps))
    E = np.zeros_like(X); E[2, 1] = eps
    assert np.isclose(dX[2, 1], (loss(X + E, W, b) - loss(X - E, W, b)) / (2 * eps))
:::

:::exercise bp-relu Backward pass of ReLU
Write `relu_backward(dH, Z)`: given the upstream gradient `dH` and the ReLU's input `Z` (same shapes), return the gradient with respect to `Z`. Gradients pass through where `Z > 0` and are zero elsewhere (including where `Z == 0`).

@@starter
import numpy as np

def relu_backward(dH, Z):
    return dH

@@solution
import numpy as np

def relu_backward(dH, Z):
    return dH * (Z > 0)

@@tests
import numpy as np

def test_masks():
    """Blocks gradients where the input was not positive"""
    Z = np.array([[-1.0, 0.0, 2.0], [3.0, -0.5, 0.1]])
    dH = np.array([[5.0, 5.0, 5.0], [1.0, 2.0, 3.0]])
    assert np.array_equal(relu_backward(dH, Z), [[0.0, 0.0, 5.0], [1.0, 0.0, 3.0]])
:::

:::exercise bp-mlp Gradients of a two-layer network
Write `mlp_gradients(X, y, p)` for the network in this lesson: `Z1 = X @ W1 + b1`, `H = relu(Z1)`, `Z2 = H @ W2 + b2` (shape `(n, 1)`), `P = sigmoid(Z2)`, and loss = mean log loss. `p` is a dict with keys `"W1"`, `"b1"`, `"W2"`, `"b2"`. Return a dict of gradients with the same keys and shapes. (Hint: the gradient at `Z2` is `(P - y) / n`, reshaped to a column.)

@@starter
import numpy as np

def mlp_gradients(X, y, p):
    return {name: np.zeros_like(value) for name, value in p.items()}

@@solution
import numpy as np

def mlp_gradients(X, y, p):
    Z1 = X @ p["W1"] + p["b1"]
    H = np.maximum(0, Z1)
    P = 1 / (1 + np.exp(-(H @ p["W2"] + p["b2"]).ravel()))
    dZ2 = ((P - y) / len(y)).reshape(-1, 1)
    dZ1 = (dZ2 @ p["W2"].T) * (Z1 > 0)
    return {"W1": X.T @ dZ1, "b1": dZ1.sum(axis=0), "W2": H.T @ dZ2, "b2": dZ2.sum(axis=0)}

@@tests
import numpy as np

def loss(X, y, p):
    H = np.maximum(0, X @ p["W1"] + p["b1"])
    P = 1 / (1 + np.exp(-(H @ p["W2"] + p["b2"]).ravel()))
    return -np.mean(y * np.log(P) + (1 - y) * np.log(1 - P))

def test_against_numerical():
    """Every gradient matches a numerical estimate"""
    rng = np.random.default_rng(2)
    X, y = rng.normal(size=(15, 3)), rng.integers(0, 2, 15).astype(float)
    p = {"W1": rng.normal(size=(3, 4)), "b1": rng.normal(size=4), "W2": rng.normal(size=(4, 1)), "b2": rng.normal(size=1)}
    g = mlp_gradients(X, y, p)
    eps = 1e-6
    for name in p:
        assert g[name].shape == p[name].shape, name
        for j in range(p[name].size):
            p[name].flat[j] += eps
            up = loss(X, y, p)
            p[name].flat[j] -= 2 * eps
            down = loss(X, y, p)
            p[name].flat[j] += eps
            assert np.isclose(g[name].flat[j], (up - down) / (2 * eps), atol=1e-6), name
:::

:::quiz bp-quiz Quick check
? What does backpropagation compute?
- [x] The gradient of the loss with respect to every weight, in one backward pass
- [ ] The best learning rate
- [ ] The network's predictions
> It's the chain rule, applied layer by layer from the output back to the input.

? For a dense layer $Z = XW + b$ with $X$ of shape (32, 10) and $W$ of shape (10, 5), what shape is $\partial L / \partial W$?
- [ ] (32, 5)
- [x] (10, 5)
- [ ] (32, 10)
> A gradient always has the same shape as the thing it's the gradient of.

? Why is the gradient check important?
- [x] A subtle bug in a hand-written backward pass makes training fail quietly
- [ ] It makes training faster
- [ ] PyTorch requires it
> Compare analytic and numerical gradients on a tiny problem before training.

? With a sigmoid output and log loss, the gradient with respect to the output score $z$ is:
- [x] $a - y$
- [ ] $a(1 - a)$
- [ ] $y / a$
> The sigmoid's derivative cancels against the log loss's.
:::
