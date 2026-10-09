---
title: "Project: a neural network library from scratch"
summary: Package everything so far into a tiny, PyTorch-shaped library - layers with forward and backward passes, a loss, a model container, Adam and a training loop with early stopping - and use it to read handwritten digits.
minutes: 120
kind: project
---

You've written forward passes, backward passes and optimisers as loose functions. Real libraries organise them as **objects**: each layer knows how to run forward, how to send gradients backward, and which parameters it owns. In this project you'll build a miniature version of PyTorch's design in about 100 lines of NumPy, so that when you meet `nn.Linear`, `nn.Sequential` and `torch.optim.Adam` in the next lesson, you'll know exactly what's inside them.

The design:

- Every **layer** has `forward(X)`, `backward(dout)`, `params()` and `grads()`.
- A **loss** has `forward(logits, y)`, returning a number, and `backward()`, returning the gradient for the logits.
- **`Sequential`** chains layers.
- An **optimiser** updates parameters **in place** from their gradients.
- **`fit`** runs the training loop.

## Step 1: Layers

:::exercise nn-layers Dense and ReLU layers
Write two classes:

- `Dense(n_in, n_out, rng)`: create `self.W` with He initialisation (`rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out))`) and `self.b` as zeros. `forward(X)` stores `X` and returns `X @ W + b`. `backward(dZ)` stores `self.dW` and `self.db` and returns the gradient for `X`. `params()` returns `[self.W, self.b]` and `grads()` returns `[self.dW, self.db]`.
- `ReLU()`: `forward(Z)` stores what it needs and returns `max(0, Z)`; `backward(dH)` returns the gradient for `Z`. It has no parameters, so `params()` and `grads()` return empty lists.

@@starter
import numpy as np

class Dense:
    def __init__(self, n_in, n_out, rng):
        pass

    def forward(self, X):
        pass

    def backward(self, dZ):
        pass

    def params(self):
        return []

    def grads(self):
        return []

class ReLU:
    def forward(self, Z):
        pass

    def backward(self, dH):
        pass

    def params(self):
        return []

    def grads(self):
        return []

@@solution
import numpy as np

class Dense:
    def __init__(self, n_in, n_out, rng):
        self.W = rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out))
        self.b = np.zeros(n_out)

    def forward(self, X):
        self.X = X
        return X @ self.W + self.b

    def backward(self, dZ):
        self.dW = self.X.T @ dZ
        self.db = dZ.sum(axis=0)
        return dZ @ self.W.T

    def params(self):
        return [self.W, self.b]

    def grads(self):
        return [self.dW, self.db]

class ReLU:
    def forward(self, Z):
        self.mask = Z > 0
        return Z * self.mask

    def backward(self, dH):
        return dH * self.mask

    def params(self):
        return []

    def grads(self):
        return []

@@tests
import numpy as np

def test_dense_forward_backward():
    """Shapes, values and stored gradients"""
    layer = Dense(3, 2, np.random.default_rng(0))
    assert layer.W.shape == (3, 2) and np.array_equal(layer.b, [0.0, 0.0])
    X = np.array([[1.0, 2.0, 3.0], [0.0, -1.0, 1.0]])
    out = layer.forward(X)
    assert np.allclose(out, X @ layer.W)
    dZ = np.array([[1.0, 0.0], [0.5, -1.0]])
    dX = layer.backward(dZ)
    assert np.allclose(dX, dZ @ layer.W.T)
    assert np.allclose(layer.dW, X.T @ dZ) and np.allclose(layer.db, [1.5, -1.0])
    assert layer.params()[0] is layer.W and len(layer.grads()) == 2

def test_he_initialisation():
    """Weights have standard deviation close to sqrt(2 / n_in)"""
    layer = Dense(200, 300, np.random.default_rng(1))
    assert abs(layer.W.std() - np.sqrt(2 / 200)) < 0.005

def test_relu():
    """Forward and backward"""
    relu = ReLU()
    Z = np.array([[-1.0, 2.0], [3.0, 0.0]])
    assert np.array_equal(relu.forward(Z), [[0.0, 2.0], [3.0, 0.0]])
    assert np.array_equal(relu.backward(np.ones((2, 2))), [[0.0, 1.0], [1.0, 0.0]])
    assert relu.params() == [] and relu.grads() == []
:::

## Step 2: The loss

:::exercise nn-loss Softmax cross-entropy loss
Write a class `SoftmaxCrossEntropy` with `forward(logits, y)`, which computes softmax probabilities (stably), stores what `backward` needs and returns the mean cross-entropy as a float, and `backward()`, which returns `(P - Y) / n`.

@@starter
import numpy as np

class SoftmaxCrossEntropy:
    def forward(self, logits, y):
        return 0.0

    def backward(self):
        pass

@@solution
import numpy as np

class SoftmaxCrossEntropy:
    def forward(self, logits, y):
        z = logits - logits.max(axis=1, keepdims=True)
        self.P = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
        self.y = y
        return float(-np.mean(np.log(self.P[np.arange(len(y)), y])))

    def backward(self):
        d = self.P.copy()
        d[np.arange(len(self.y)), self.y] -= 1
        return d / len(self.y)

@@tests
import math
import numpy as np

def test_loss_and_gradient():
    """Known values"""
    loss_fn = SoftmaxCrossEntropy()
    loss = loss_fn.forward(np.zeros((2, 4)), np.array([1, 3]))
    assert math.isclose(loss, math.log(4))
    d = loss_fn.backward()
    assert np.allclose(d, [[0.125, -0.375, 0.125, 0.125], [0.125, 0.125, 0.125, -0.375]])

def test_numerical():
    """Gradient matches a numerical estimate"""
    rng = np.random.default_rng(0)
    logits, y = rng.normal(size=(6, 3)), rng.integers(0, 3, 6)
    loss_fn = SoftmaxCrossEntropy()
    loss_fn.forward(logits, y)
    d = loss_fn.backward()
    eps = 1e-6
    E = np.zeros_like(logits); E[4, 1] = eps
    numeric = (SoftmaxCrossEntropy().forward(logits + E, y) - SoftmaxCrossEntropy().forward(logits - E, y)) / (2 * eps)
    assert math.isclose(d[4, 1], numeric, rel_tol=1e-5)
:::

## Step 3: The model and the optimiser

:::exercise nn-model Sequential and Adam
The layer classes from step 1 are included in the starter. Write:

- `Sequential(layers)`: `forward(X)` passes `X` through each layer in order; `backward(dout)` passes the gradient through the layers in **reverse** order; `params()` and `grads()` return flat lists of every layer's parameters and gradients, in matching order.
- `Adam(lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8)`: `step(params, grads)` performs one Adam update on every parameter **in place** (use `p -= ...`, so the layers see the change). Keep one `m` and `v` array per parameter, created on the first call, and a step counter `t`.

@@starter
import numpy as np

class Dense:
    def __init__(self, n_in, n_out, rng):
        self.W = rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out))
        self.b = np.zeros(n_out)
    def forward(self, X):
        self.X = X
        return X @ self.W + self.b
    def backward(self, dZ):
        self.dW, self.db = self.X.T @ dZ, dZ.sum(axis=0)
        return dZ @ self.W.T
    def params(self):
        return [self.W, self.b]
    def grads(self):
        return [self.dW, self.db]

class ReLU:
    def forward(self, Z):
        self.mask = Z > 0
        return Z * self.mask
    def backward(self, dH):
        return dH * self.mask
    def params(self):
        return []
    def grads(self):
        return []

class Sequential:
    def __init__(self, layers):
        self.layers = layers

    def forward(self, X):
        pass

    def backward(self, dout):
        pass

    def params(self):
        return []

    def grads(self):
        return []

class Adam:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
        pass

    def step(self, params, grads):
        pass

@@solution
import numpy as np

class Dense:
    def __init__(self, n_in, n_out, rng):
        self.W = rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out))
        self.b = np.zeros(n_out)
    def forward(self, X):
        self.X = X
        return X @ self.W + self.b
    def backward(self, dZ):
        self.dW, self.db = self.X.T @ dZ, dZ.sum(axis=0)
        return dZ @ self.W.T
    def params(self):
        return [self.W, self.b]
    def grads(self):
        return [self.dW, self.db]

class ReLU:
    def forward(self, Z):
        self.mask = Z > 0
        return Z * self.mask
    def backward(self, dH):
        return dH * self.mask
    def params(self):
        return []
    def grads(self):
        return []

class Sequential:
    def __init__(self, layers):
        self.layers = layers

    def forward(self, X):
        for layer in self.layers:
            X = layer.forward(X)
        return X

    def backward(self, dout):
        for layer in reversed(self.layers):
            dout = layer.backward(dout)
        return dout

    def params(self):
        return [p for layer in self.layers for p in layer.params()]

    def grads(self):
        return [g for layer in self.layers for g in layer.grads()]

class Adam:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
        self.lr, self.beta1, self.beta2, self.eps = lr, beta1, beta2, eps
        self.m, self.v, self.t = None, None, 0

    def step(self, params, grads):
        if self.m is None:
            self.m = [np.zeros_like(p) for p in params]
            self.v = [np.zeros_like(p) for p in params]
        self.t += 1
        for p, g, m, v in zip(params, grads, self.m, self.v):
            m *= self.beta1
            m += (1 - self.beta1) * g
            v *= self.beta2
            v += (1 - self.beta2) * g ** 2
            m_hat = m / (1 - self.beta1 ** self.t)
            v_hat = v / (1 - self.beta2 ** self.t)
            p -= self.lr * m_hat / (np.sqrt(v_hat) + self.eps)

@@tests
import numpy as np

def make_model(seed=0):
    rng = np.random.default_rng(seed)
    return Sequential([Dense(4, 8, rng), ReLU(), Dense(8, 3, rng)])

def test_forward_backward():
    """Chains the layers both ways"""
    model = make_model()
    X = np.random.default_rng(1).normal(size=(5, 4))
    d1, r, d2 = model.layers
    out = model.forward(X)
    assert np.allclose(out, np.maximum(0, X @ d1.W + d1.b) @ d2.W + d2.b)
    dX = model.backward(np.ones((5, 3)))
    assert dX.shape == (5, 4)
    assert len(model.params()) == 4 and len(model.grads()) == 4
    assert model.params()[2] is d2.W and model.grads()[0] is d1.dW

def test_adam_in_place():
    """Updates the layer's own arrays"""
    model = make_model()
    W_before = model.layers[0].W.copy()
    W_object = model.layers[0].W
    X = np.random.default_rng(2).normal(size=(5, 4))
    model.forward(X)
    model.backward(np.ones((5, 3)))
    grad = model.layers[0].dW.copy()
    Adam(lr=0.01).step(model.params(), model.grads())
    assert model.layers[0].W is W_object, "update in place with -="
    moved = np.abs(model.layers[0].W - W_before)
    has_grad = np.abs(grad) > 1e-6
    # Adam's first step moves every weight with a gradient by about lr
    assert has_grad.any() and np.allclose(moved[has_grad], 0.01, atol=1e-4)

def test_adam_minimises():
    """Fits a linear regression"""
    rng = np.random.default_rng(3)
    X = rng.normal(size=(200, 2))
    y = X @ np.array([[1.5], [-2.0]]) + 0.5
    layer = Dense(2, 1, rng)
    model, opt = Sequential([layer]), Adam(lr=0.05)
    for _ in range(500):
        out = model.forward(X)
        model.backward(2 * (out - y) / len(y))
        opt.step(model.params(), model.grads())
    assert np.allclose(layer.W.ravel(), [1.5, -2.0], atol=0.02) and abs(layer.b[0] - 0.5) < 0.02
:::

## Step 4: The training loop

:::exercise nn-fit Training with early stopping
Write `fit(model, loss_fn, optimizer, X, y, X_val, y_val, epochs=50, batch_size=32, patience=5, seed=0)`:

1. Each epoch, shuffle with `rng.permutation` (from `np.random.default_rng(seed)`, created once), and for each mini-batch: forward, compute the loss, backward from `loss_fn.backward()`, and `optimizer.step(model.params(), model.grads())`.
2. After each epoch, compute the validation loss and append it to a history list.
3. Keep copies of the parameters from the epoch with the lowest validation loss. Stop when `patience` epochs have passed without improvement.
4. Before returning, copy the best parameters back **into** the model's arrays (`p[...] = best`), then return the history.

The classes from steps 1 to 3 are included in the starter.

@@starter
import numpy as np

class Dense:
    def __init__(self, n_in, n_out, rng):
        self.W = rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out))
        self.b = np.zeros(n_out)
    def forward(self, X):
        self.X = X
        return X @ self.W + self.b
    def backward(self, dZ):
        self.dW, self.db = self.X.T @ dZ, dZ.sum(axis=0)
        return dZ @ self.W.T
    def params(self):
        return [self.W, self.b]
    def grads(self):
        return [self.dW, self.db]

class ReLU:
    def forward(self, Z):
        self.mask = Z > 0
        return Z * self.mask
    def backward(self, dH):
        return dH * self.mask
    def params(self):
        return []
    def grads(self):
        return []

class SoftmaxCrossEntropy:
    def forward(self, logits, y):
        z = logits - logits.max(axis=1, keepdims=True)
        self.P, self.y = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True), y
        return float(-np.mean(np.log(self.P[np.arange(len(y)), y])))
    def backward(self):
        d = self.P.copy()
        d[np.arange(len(self.y)), self.y] -= 1
        return d / len(self.y)

class Sequential:
    def __init__(self, layers):
        self.layers = layers
    def forward(self, X):
        for layer in self.layers:
            X = layer.forward(X)
        return X
    def backward(self, dout):
        for layer in reversed(self.layers):
            dout = layer.backward(dout)
        return dout
    def params(self):
        return [p for layer in self.layers for p in layer.params()]
    def grads(self):
        return [g for layer in self.layers for g in layer.grads()]

class Adam:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
        self.lr, self.beta1, self.beta2, self.eps = lr, beta1, beta2, eps
        self.m, self.v, self.t = None, None, 0
    def step(self, params, grads):
        if self.m is None:
            self.m, self.v = [np.zeros_like(p) for p in params], [np.zeros_like(p) for p in params]
        self.t += 1
        for p, g, m, v in zip(params, grads, self.m, self.v):
            m *= self.beta1
            m += (1 - self.beta1) * g
            v *= self.beta2
            v += (1 - self.beta2) * g ** 2
            p -= self.lr * (m / (1 - self.beta1 ** self.t)) / (np.sqrt(v / (1 - self.beta2 ** self.t)) + self.eps)

def fit(model, loss_fn, optimizer, X, y, X_val, y_val, epochs=50, batch_size=32, patience=5, seed=0):
    return []

@@solution
import numpy as np

class Dense:
    def __init__(self, n_in, n_out, rng):
        self.W = rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out))
        self.b = np.zeros(n_out)
    def forward(self, X):
        self.X = X
        return X @ self.W + self.b
    def backward(self, dZ):
        self.dW, self.db = self.X.T @ dZ, dZ.sum(axis=0)
        return dZ @ self.W.T
    def params(self):
        return [self.W, self.b]
    def grads(self):
        return [self.dW, self.db]

class ReLU:
    def forward(self, Z):
        self.mask = Z > 0
        return Z * self.mask
    def backward(self, dH):
        return dH * self.mask
    def params(self):
        return []
    def grads(self):
        return []

class SoftmaxCrossEntropy:
    def forward(self, logits, y):
        z = logits - logits.max(axis=1, keepdims=True)
        self.P, self.y = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True), y
        return float(-np.mean(np.log(self.P[np.arange(len(y)), y])))
    def backward(self):
        d = self.P.copy()
        d[np.arange(len(self.y)), self.y] -= 1
        return d / len(self.y)

class Sequential:
    def __init__(self, layers):
        self.layers = layers
    def forward(self, X):
        for layer in self.layers:
            X = layer.forward(X)
        return X
    def backward(self, dout):
        for layer in reversed(self.layers):
            dout = layer.backward(dout)
        return dout
    def params(self):
        return [p for layer in self.layers for p in layer.params()]
    def grads(self):
        return [g for layer in self.layers for g in layer.grads()]

class Adam:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
        self.lr, self.beta1, self.beta2, self.eps = lr, beta1, beta2, eps
        self.m, self.v, self.t = None, None, 0
    def step(self, params, grads):
        if self.m is None:
            self.m, self.v = [np.zeros_like(p) for p in params], [np.zeros_like(p) for p in params]
        self.t += 1
        for p, g, m, v in zip(params, grads, self.m, self.v):
            m *= self.beta1
            m += (1 - self.beta1) * g
            v *= self.beta2
            v += (1 - self.beta2) * g ** 2
            p -= self.lr * (m / (1 - self.beta1 ** self.t)) / (np.sqrt(v / (1 - self.beta2 ** self.t)) + self.eps)

def fit(model, loss_fn, optimizer, X, y, X_val, y_val, epochs=50, batch_size=32, patience=5, seed=0):
    rng = np.random.default_rng(seed)
    history, best_loss, best_epoch, best_params = [], np.inf, 0, None
    for epoch in range(epochs):
        order = rng.permutation(len(y))
        for start in range(0, len(y), batch_size):
            idx = order[start:start + batch_size]
            loss_fn.forward(model.forward(X[idx]), y[idx])
            model.backward(loss_fn.backward())
            optimizer.step(model.params(), model.grads())
        val_loss = loss_fn.forward(model.forward(X_val), y_val)
        history.append(val_loss)
        if val_loss < best_loss:
            best_loss, best_epoch = val_loss, epoch
            best_params = [p.copy() for p in model.params()]
        elif epoch - best_epoch >= patience:
            break
    for p, best in zip(model.params(), best_params):
        p[...] = best
    return history

@@tests
import numpy as np
from sklearn.datasets import make_blobs

def data():
    X, y = make_blobs(n_samples=600, centers=3, cluster_std=1.0, random_state=0)
    X = (X - X.mean(axis=0)) / X.std(axis=0)
    return X[:400], y[:400], X[400:], y[400:]

def test_learns():
    """Reaches high validation accuracy"""
    X, y, X_val, y_val = data()
    rng = np.random.default_rng(0)
    model = Sequential([Dense(2, 16, rng), ReLU(), Dense(16, 3, rng)])
    history = fit(model, SoftmaxCrossEntropy(), Adam(0.01), X, y, X_val, y_val, epochs=30)
    assert 1 <= len(history) <= 30
    accuracy = np.mean(model.forward(X_val).argmax(axis=1) == y_val)
    assert accuracy > 0.85, accuracy

def test_restores_best_weights():
    """After fitting, the model has the best epoch's weights"""
    X, y, X_val, y_val = data()
    rng = np.random.default_rng(1)
    model = Sequential([Dense(2, 64, rng), ReLU(), Dense(64, 3, rng)])
    loss_fn = SoftmaxCrossEntropy()
    history = fit(model, loss_fn, Adam(0.05), X, y, X_val, y_val, epochs=60, patience=3)
    assert np.isclose(loss_fn.forward(model.forward(X_val), y_val), min(history))
    best = int(np.argmin(history))
    assert len(history) == min(60, best + 4), "stop once patience epochs pass without improvement"
:::

## Step 5: Read handwritten digits

Now use your library. The cell contains the finished classes so it runs on its own; swap in your own versions if you like.

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.datasets import load_digits
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split

class Dense:
    def __init__(self, n_in, n_out, rng):
        self.W = rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out))
        self.b = np.zeros(n_out)
    def forward(self, X):
        self.X = X
        return X @ self.W + self.b
    def backward(self, dZ):
        self.dW, self.db = self.X.T @ dZ, dZ.sum(axis=0)
        return dZ @ self.W.T
    def params(self):
        return [self.W, self.b]
    def grads(self):
        return [self.dW, self.db]

class ReLU:
    def forward(self, Z):
        self.mask = Z > 0
        return Z * self.mask
    def backward(self, dH):
        return dH * self.mask
    def params(self):
        return []
    def grads(self):
        return []

class SoftmaxCrossEntropy:
    def forward(self, logits, y):
        z = logits - logits.max(axis=1, keepdims=True)
        self.P, self.y = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True), y
        return float(-np.mean(np.log(self.P[np.arange(len(y)), y])))
    def backward(self):
        d = self.P.copy()
        d[np.arange(len(self.y)), self.y] -= 1
        return d / len(self.y)

class Sequential:
    def __init__(self, layers):
        self.layers = layers
    def forward(self, X):
        for layer in self.layers:
            X = layer.forward(X)
        return X
    def backward(self, dout):
        for layer in reversed(self.layers):
            dout = layer.backward(dout)
        return dout
    def params(self):
        return [p for layer in self.layers for p in layer.params()]
    def grads(self):
        return [g for layer in self.layers for g in layer.grads()]

class Adam:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
        self.lr, self.beta1, self.beta2, self.eps = lr, beta1, beta2, eps
        self.m, self.v, self.t = None, None, 0
    def step(self, params, grads):
        if self.m is None:
            self.m, self.v = [np.zeros_like(p) for p in params], [np.zeros_like(p) for p in params]
        self.t += 1
        for p, g, m, v in zip(params, grads, self.m, self.v):
            m *= self.beta1
            m += (1 - self.beta1) * g
            v *= self.beta2
            v += (1 - self.beta2) * g ** 2
            p -= self.lr * (m / (1 - self.beta1 ** self.t)) / (np.sqrt(v / (1 - self.beta2 ** self.t)) + self.eps)

def fit(model, loss_fn, optimizer, X, y, X_val, y_val, epochs=50, batch_size=32, patience=5, seed=0):
    rng = np.random.default_rng(seed)
    history, best_loss, best_epoch, best_params = [], np.inf, 0, None
    for epoch in range(epochs):
        order = rng.permutation(len(y))
        for start in range(0, len(y), batch_size):
            idx = order[start:start + batch_size]
            loss_fn.forward(model.forward(X[idx]), y[idx])
            model.backward(loss_fn.backward())
            optimizer.step(model.params(), model.grads())
        history.append(loss_fn.forward(model.forward(X_val), y_val))
        if history[-1] < best_loss:
            best_loss, best_epoch, best_params = history[-1], epoch, [p.copy() for p in model.params()]
        elif epoch - best_epoch >= patience:
            break
    for p, best in zip(model.params(), best_params):
        p[...] = best
    return history

digits = load_digits()
X, y = digits.data / 16.0, digits.target
X_rest, X_test, y_rest, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
X_train, X_val, y_train, y_val = train_test_split(X_rest, y_rest, test_size=0.2, random_state=0, stratify=y_rest)

rng = np.random.default_rng(0)
model = Sequential([Dense(64, 128, rng), ReLU(), Dense(128, 64, rng), ReLU(), Dense(64, 10, rng)])
history = fit(model, SoftmaxCrossEntropy(), Adam(0.001), X_train, y_train, X_val, y_val, epochs=100, patience=10)

pred = model.forward(X_test).argmax(axis=1)
print(f"trained for {len(history)} epochs; best validation loss {min(history):.3f}")
print(f"test accuracy: {np.mean(pred == y_test):.3f}")
print("confusion matrix (rows = true digit, columns = predicted):")
print(confusion_matrix(y_test, pred))

wrong = np.flatnonzero(pred != y_test)[:8]
fig, axes = plt.subplots(1, len(wrong), figsize=(1.4 * len(wrong), 1.9))
for ax, i in zip(np.atleast_1d(axes), wrong):
    ax.imshow(X_test[i].reshape(8, 8), cmap="gray_r")
    ax.set_title(f"true {y_test[i]}\npred {pred[i]}", fontsize=9)
    ax.axis("off")
fig.tight_layout()
plt.show()
```

Your library should get about 97% of the test digits right. Look at the mistakes: at 8×8 pixels, several are genuinely ambiguous even to a person. The confusion matrix shows which digits get mixed up most.

## Extensions

Each of these is a small, testable addition to your library:

1. A `Dropout(rate)` layer with a `training` flag: active in `fit`, switched off for predictions.
2. An `SGD(lr, momentum=0.9)` optimiser, and a comparison with Adam.
3. A learning-rate schedule that halves `optimizer.lr` whenever the validation loss hasn't improved for three epochs.
4. `save(model, path)` and `load(model, path)` using `np.savez` with one array per parameter.
5. A `Sigmoid` layer and a binary loss, then a model for home win / not home win on Phase 5's match features.

:::tip What you've built
This is the same architecture as PyTorch's `nn.Module`, `nn.Sequential`, `nn.CrossEntropyLoss` and `torch.optim.Adam`. The main things PyTorch adds are automatic backward passes, GPU support and speed. You'll start using it in the next lesson.
:::
