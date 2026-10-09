---
title: Training deep networks well
summary: Softmax and cross-entropy for many classes, weight initialisation and vanishing gradients, momentum and Adam, dropout, weight decay and early stopping, ending with a NumPy network that reads handwritten digits.
minutes: 60
kind: lesson
---

You can now build and train a small network. Making deeper networks train reliably took the field decades of tricks. This lesson covers the ones every modern network still uses, and finishes with a network that recognises handwritten digits, written entirely in NumPy.

## Many classes: softmax and cross-entropy

For $K$ classes, the output layer produces $K$ scores (**logits**), softmax turns them into probabilities, and the loss is the cross-entropy: minus the log of the probability given to the correct class. That's the multi-class log loss from Phase 5.

Like sigmoid with log loss, the combination has a beautifully simple gradient. With $Y$ the one-hot matrix of true classes:

$$
\frac{\partial L}{\partial \text{logits}} = \frac{P - Y}{n}
$$

```python
import numpy as np

def softmax(z):
    e = np.exp(z - z.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)

def cross_entropy(logits, y):
    return -np.mean(np.log(softmax(logits)[np.arange(len(y)), y]))

rng = np.random.default_rng(0)
logits, y = rng.normal(size=(4, 3)), np.array([0, 2, 1, 2])

P = softmax(logits)
Y = np.eye(3)[y]                       # one-hot: row i has a 1 in column y[i]
analytic = (P - Y) / len(y)

numeric = np.zeros_like(logits)
eps = 1e-6
for idx in np.ndindex(logits.shape):
    step = np.zeros_like(logits)
    step[idx] = eps
    numeric[idx] = (cross_entropy(logits + step, y) - cross_entropy(logits - step, y)) / (2 * eps)
print("max difference:", np.abs(analytic - numeric).max())
```

## Initialisation and vanishing gradients

Each layer multiplies the signal by its weights. If the weights are a little too small, the signal shrinks layer after layer until it vanishes; a little too big, and it explodes. Gradients flowing backwards suffer the same fate.

**He initialisation** draws weights with standard deviation $\sqrt{2 / n_{\text{in}}}$, chosen so that the scale of the signal is preserved through ReLU layers. Here are ten layers of 100 ReLU units, with three choices:

```python
import matplotlib.pyplot as plt
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(size=(256, 100))
depth = 10

fig, axes = plt.subplots(1, 2, figsize=(10, 3.5))
for label, std in [("std 0.01 (too small)", 0.01), ("He: sqrt(2/100)", np.sqrt(2 / 100)), ("std 0.3 (too big)", 0.3)]:
    h, scales = X, []
    for _ in range(depth):
        h = np.maximum(0, h @ rng.normal(0, std, size=(100, 100)))
        scales.append(h.std())
    axes[0].plot(range(1, depth + 1), scales, "o-", label=label)
axes[0].set_yscale("log")
axes[0].set_title("Signal size by layer (ReLU)")
axes[0].set_xlabel("layer")
axes[0].legend()

# Gradient size by layer: sigmoid versus ReLU with He initialisation
for act in ["sigmoid", "relu"]:
    rng = np.random.default_rng(0)
    std = 1 / np.sqrt(100) if act == "sigmoid" else np.sqrt(2 / 100)
    Ws = [rng.normal(0, std, size=(100, 100)) for _ in range(depth)]
    hs, zs = [X], []
    for W in Ws:
        z = hs[-1] @ W
        zs.append(z)
        hs.append(1 / (1 + np.exp(-z)) if act == "sigmoid" else np.maximum(0, z))
    upstream, sizes = np.ones_like(hs[-1]), []
    for i in reversed(range(depth)):
        local = hs[i + 1] * (1 - hs[i + 1]) if act == "sigmoid" else (zs[i] > 0)
        dz = upstream * local
        sizes.append(np.abs(hs[i].T @ dz).mean())      # average weight-gradient size
        upstream = dz @ Ws[i].T
    axes[1].plot(range(1, depth + 1), sizes[::-1], "o-", label=act)
axes[1].set_yscale("log")
axes[1].set_title("Gradient size by layer")
axes[1].set_xlabel("layer")
axes[1].legend()
fig.tight_layout()
plt.show()
```

- On the left, too-small weights shrink the signal by a factor of about 15 per layer, and too-big ones double it per layer. He initialisation keeps it steady.
- On the right, the sigmoid network's first layer gets gradients around ten million times smaller than its last layer, so the early layers barely learn. Sigmoid's slope is at most 0.25, and those small factors multiply. ReLU's slope is 1 wherever it's active, so gradients survive.

That's why hidden layers use ReLU (or relatives such as GELU) with He initialisation. Very deep networks add **normalisation layers** and **residual connections** (lesson 8) to keep things stable.

## Better optimisers: momentum and Adam

Plain SGD takes a step proportional to the current gradient. Two improvements are standard:

- **Momentum** keeps a running sum of past gradients, like a ball rolling downhill that builds up speed in consistent directions and smooths out zig-zags.
- **Adam** keeps running averages of both the gradient ($m$) and its square ($v$), and divides one by the square root of the other, so every weight gets its own step size. It works well with little tuning, which makes it the default choice:

$$
m \leftarrow \beta_1 m + (1 - \beta_1) g, \quad v \leftarrow \beta_2 v + (1 - \beta_2) g^2, \quad w \leftarrow w - \eta \frac{\hat m}{\sqrt{\hat v} + \epsilon}
$$

where $\hat m = m / (1 - \beta_1^t)$ and $\hat v = v / (1 - \beta_2^t)$ correct for both averages starting at zero.

The cell below defines a complete multi-layer network in NumPy (with dropout and weight decay, used later) and trains it on scikit-learn's handwritten digits: 8×8 pixel images of the digits 0 to 9.

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

digits = load_digits()
X, y = digits.data / 16.0, digits.target                  # pixels scaled to 0-1
X_rest, X_test, y_rest, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
X_train, X_val, y_train, y_val = train_test_split(X_rest, y_rest, test_size=0.2, random_state=0, stratify=y_rest)

def init(sizes, rng):
    return [[rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out)), np.zeros(n_out)]
            for n_in, n_out in zip(sizes[:-1], sizes[1:])]

def forward(X, params, drop=0.0, rng=None):
    """Softmax probabilities, plus what the backward pass needs."""
    cache, out = [], X
    for i, (W, b) in enumerate(params):
        z = out @ W + b
        mask = None
        if i < len(params) - 1:
            out = np.maximum(0, z)
            if drop > 0 and rng is not None:                 # dropout, only when training
                mask = (rng.random(out.shape) >= drop) / (1 - drop)
                out = out * mask
        else:
            out = z
        cache.append((X if i == 0 else cache[-1][3], z, mask, out))
    e = np.exp(out - out.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True), cache

def backward(P, y, params, cache, l2=0.0):
    dZ = P.copy()
    dZ[np.arange(len(y)), y] -= 1
    dZ /= len(y)                                             # softmax + cross-entropy
    grads = [None] * len(params)
    for i in reversed(range(len(params))):
        inputs, z, mask, _ = cache[i]
        if i < len(params) - 1:                              # hidden layer: dropout, then ReLU
            if mask is not None:
                dZ = dZ * mask
            dZ = dZ * (z > 0)
        grads[i] = [inputs.T @ dZ + l2 * params[i][0], dZ.sum(axis=0)]
        dZ = dZ @ params[i][0].T                             # gradient for the layer below
    return grads

def cross_entropy(P, y):
    return -np.mean(np.log(P[np.arange(len(y)), y]))

def make_optimizer(name, params, lr):
    m = [[np.zeros_like(p) for p in layer] for layer in params]
    v = [[np.zeros_like(p) for p in layer] for layer in params]
    t = 0
    def step(grads):
        nonlocal t
        t += 1
        for i, layer in enumerate(params):
            for j, g in enumerate(grads[i]):
                if name == "sgd":
                    layer[j] -= lr * g
                elif name == "momentum":
                    m[i][j] = 0.9 * m[i][j] + g
                    layer[j] -= lr * m[i][j]
                else:                                        # adam
                    m[i][j] = 0.9 * m[i][j] + 0.1 * g
                    v[i][j] = 0.999 * v[i][j] + 0.001 * g ** 2
                    m_hat, v_hat = m[i][j] / (1 - 0.9 ** t), v[i][j] / (1 - 0.999 ** t)
                    layer[j] -= lr * m_hat / (np.sqrt(v_hat) + 1e-8)
    return step

def train(sizes, opt="adam", lr=1e-3, epochs=20, drop=0.0, l2=0.0, X_tr=X_train, y_tr=y_train, patience=None, seed=0):
    rng = np.random.default_rng(seed)
    params = init(sizes, rng)
    step = make_optimizer(opt, params, lr)
    history, best = [], {"val": np.inf, "epoch": 0}
    for epoch in range(epochs):
        order = rng.permutation(len(y_tr))
        for start in range(0, len(y_tr), 32):
            idx = order[start:start + 32]
            P, cache = forward(X_tr[idx], params, drop, rng)
            step(backward(P, y_tr[idx], params, cache, l2))
        history.append((cross_entropy(forward(X_tr, params)[0], y_tr), cross_entropy(forward(X_val, params)[0], y_val)))
        if history[-1][1] < best["val"]:
            best = {"val": history[-1][1], "epoch": epoch, "params": [[W.copy(), b.copy()] for W, b in params]}
        elif patience and epoch - best["epoch"] >= patience:
            break
    return params, history, best

fig, ax = plt.subplots(figsize=(6, 3.5))
for opt, lr in [("sgd", 0.01), ("momentum", 0.01), ("adam", 0.001)]:
    params, history, _ = train([64, 64, 10], opt, lr, epochs=10)
    accuracy = np.mean(forward(X_test, params)[0].argmax(axis=1) == y_test)
    print(f"{opt:>8} (lr {lr}): training loss after 10 epochs {history[-1][0]:.3f}, test accuracy {accuracy:.3f}")
    ax.plot(range(1, 11), [h[0] for h in history], "o-", label=f"{opt}, lr {lr}")
ax.set_xlabel("epoch")
ax.set_ylabel("training loss")
ax.legend()
fig.tight_layout()
plt.show()
```

With the same learning rate, momentum races ahead of plain SGD, and Adam gets most of the way there with a ten-times smaller rate. Given enough epochs (or a bigger learning rate) SGD gets there too: optimisers mostly change how *fast* and how *reliably* you reach a good solution.

## Regularisation and early stopping

A big network can memorise a small training set. Three standard defences:

- **Weight decay** (L2 regularisation) adds $\lambda \sum w^2$ to the loss, which adds $2\lambda w$ to each gradient and keeps weights small.
- **Dropout** randomly zeroes a fraction of hidden units on each training step (and scales the survivors up so the expected total is unchanged). The network can't rely on any single unit. At prediction time all units are used.
- **Early stopping** tracks the loss on a validation set after each epoch and keeps the weights from the best epoch, stopping once it hasn't improved for a while (the **patience**).

Below, a large network trains on only 300 examples, without and with dropout. Then a final model trains on the full training set with dropout and early stopping, and is evaluated once on the test set. (This cell repeats the network code so it runs on its own.)

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

digits = load_digits()
X, y = digits.data / 16.0, digits.target
X_rest, X_test, y_rest, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
X_train, X_val, y_train, y_val = train_test_split(X_rest, y_rest, test_size=0.2, random_state=0, stratify=y_rest)

def init(sizes, rng):
    return [[rng.normal(0, np.sqrt(2 / n_in), size=(n_in, n_out)), np.zeros(n_out)]
            for n_in, n_out in zip(sizes[:-1], sizes[1:])]

def forward(X, params, drop=0.0, rng=None):
    cache, out = [], X
    for i, (W, b) in enumerate(params):
        z = out @ W + b
        mask = None
        if i < len(params) - 1:
            out = np.maximum(0, z)
            if drop > 0 and rng is not None:
                mask = (rng.random(out.shape) >= drop) / (1 - drop)
                out = out * mask
        else:
            out = z
        cache.append((X if i == 0 else cache[-1][3], z, mask, out))
    e = np.exp(out - out.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True), cache

def backward(P, y, params, cache, l2=0.0):
    dZ = P.copy()
    dZ[np.arange(len(y)), y] -= 1
    dZ /= len(y)
    grads = [None] * len(params)
    for i in reversed(range(len(params))):
        inputs, z, mask, _ = cache[i]
        if i < len(params) - 1:
            if mask is not None:
                dZ = dZ * mask
            dZ = dZ * (z > 0)
        grads[i] = [inputs.T @ dZ + l2 * params[i][0], dZ.sum(axis=0)]
        dZ = dZ @ params[i][0].T
    return grads

def cross_entropy(P, y):
    return -np.mean(np.log(P[np.arange(len(y)), y]))

def train(sizes, lr=1e-3, epochs=100, drop=0.0, l2=0.0, X_tr=X_train, y_tr=y_train, patience=None, seed=0):
    """Adam with mini-batches of 32; keeps the weights from the best validation epoch."""
    rng = np.random.default_rng(seed)
    params = init(sizes, rng)
    m = [[np.zeros_like(p) for p in layer] for layer in params]
    v = [[np.zeros_like(p) for p in layer] for layer in params]
    t, history, best = 0, [], {"val": np.inf, "epoch": 0}
    for epoch in range(epochs):
        order = rng.permutation(len(y_tr))
        for start in range(0, len(y_tr), 32):
            idx = order[start:start + 32]
            P, cache = forward(X_tr[idx], params, drop, rng)
            grads = backward(P, y_tr[idx], params, cache, l2)
            t += 1
            for i, layer in enumerate(params):
                for j, g in enumerate(grads[i]):
                    m[i][j] = 0.9 * m[i][j] + 0.1 * g
                    v[i][j] = 0.999 * v[i][j] + 0.001 * g ** 2
                    layer[j] -= lr * (m[i][j] / (1 - 0.9 ** t)) / (np.sqrt(v[i][j] / (1 - 0.999 ** t)) + 1e-8)
        history.append((cross_entropy(forward(X_tr, params)[0], y_tr), cross_entropy(forward(X_val, params)[0], y_val)))
        if history[-1][1] < best["val"]:
            best = {"val": history[-1][1], "epoch": epoch, "params": [[W.copy(), b.copy()] for W, b in params]}
        elif patience and epoch - best["epoch"] >= patience:
            break
    return params, history, best

fig, axes = plt.subplots(1, 2, figsize=(10, 3.5), sharey=True)
for ax, drop in zip(axes, [0.0, 0.3]):
    _, history, best = train([64, 128, 128, 10], drop=drop, X_tr=X_train[:300], y_tr=y_train[:300])
    ax.plot([h[0] for h in history], label="training loss")
    ax.plot([h[1] for h in history], label="validation loss")
    ax.axvline(best["epoch"], color="grey", ls=":")
    ax.set_title(f"300 examples, dropout {drop}")
    ax.set_yscale("log")
    ax.set_xlabel("epoch")
    ax.legend()
    print(f"dropout {drop}: final training loss {history[-1][0]:.4f}, final validation loss {history[-1][1]:.3f}, "
          f"best validation loss {best['val']:.3f} at epoch {best['epoch']}")
fig.tight_layout()
plt.show()

_, history, best = train([64, 128, 10], drop=0.2, patience=10)
test_accuracy = np.mean(forward(X_test, best["params"])[0].argmax(axis=1) == y_test)
logreg = LogisticRegression(max_iter=2000).fit(X_train, y_train)
print(f"\nfull training set: stopped after {len(history)} epochs, best epoch {best['epoch']}")
print(f"test accuracy: network {test_accuracy:.3f}, logistic regression {logreg.score(X_test, y_test):.3f}")
```

Read the curves:

- Without dropout, the training loss heads towards zero (memorisation) while the validation loss bottoms out and then creeps up. That gap is overfitting, and the dotted line marks where early stopping would keep the weights.
- With dropout, memorisation is slower and the best validation loss is lower: about 0.13, against 0.16 without.
- On the full training set, the network gets about 98% of test digits right, ahead of logistic regression's 97%.

On this small, easy dataset the regularisation effects are modest; on large networks they matter a lot. Treat dropout rate and weight decay as hyperparameters, chosen by validation loss like any other.

## Practice

:::exercise tr-softmax Softmax cross-entropy
Write `softmax_cross_entropy(logits, y)` for logits of shape `(n, K)` and integer labels `y`. Return the tuple `(loss, dlogits)`: the mean cross-entropy and its gradient with respect to the logits, `(P - Y) / n`. Use the max-subtraction trick for stability.

@@starter
import numpy as np

def softmax_cross_entropy(logits, y):
    return 0.0, np.zeros_like(logits)

@@solution
import numpy as np

def softmax_cross_entropy(logits, y):
    z = logits - logits.max(axis=1, keepdims=True)
    P = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
    n = len(y)
    loss = -np.mean(np.log(P[np.arange(n), y]))
    d = P.copy()
    d[np.arange(n), y] -= 1
    return float(loss), d / n

@@tests
import math
import numpy as np

def test_uniform():
    """Equal logits: loss is ln K"""
    loss, d = softmax_cross_entropy(np.zeros((2, 4)), np.array([0, 3]))
    assert math.isclose(loss, math.log(4))
    assert np.allclose(d[0], [-0.375, 0.125, 0.125, 0.125])

def test_gradient_numerically():
    """Gradient matches a numerical estimate"""
    rng = np.random.default_rng(0)
    logits, y = rng.normal(size=(5, 3)), np.array([0, 1, 2, 1, 0])
    loss, d = softmax_cross_entropy(logits, y)
    eps = 1e-6
    E = np.zeros_like(logits); E[3, 2] = eps
    numeric = (softmax_cross_entropy(logits + E, y)[0] - softmax_cross_entropy(logits - E, y)[0]) / (2 * eps)
    assert math.isclose(d[3, 2], numeric, rel_tol=1e-5)

def test_large_logits():
    """No overflow"""
    loss, d = softmax_cross_entropy(np.array([[1000.0, 0.0]]), np.array([0]))
    assert loss < 1e-6 and np.all(np.isfinite(d))
:::

:::exercise tr-adam One Adam step
Write `adam_update(w, g, m, v, t, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8)`. Update the moving averages `m = beta1 * m + (1 - beta1) * g` and `v = beta2 * v + (1 - beta2) * g**2`, bias-correct them with step number `t` (starting at 1), and return the new `(w, m, v)`.

@@starter
import numpy as np

def adam_update(w, g, m, v, t, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
    return w, m, v

@@solution
import numpy as np

def adam_update(w, g, m, v, t, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
    m = beta1 * m + (1 - beta1) * g
    v = beta2 * v + (1 - beta2) * g ** 2
    m_hat = m / (1 - beta1 ** t)
    v_hat = v / (1 - beta2 ** t)
    return w - lr * m_hat / (np.sqrt(v_hat) + eps), m, v

@@tests
import numpy as np

def test_first_step():
    """The first step moves each weight by about lr, against the gradient's sign"""
    w, g = np.array([1.0, 1.0, 1.0]), np.array([0.5, -20.0, 1e-3])
    new_w, m, v = adam_update(w, g, np.zeros(3), np.zeros(3), 1, lr=0.01)
    assert np.allclose(new_w, [0.99, 1.01, 0.99], atol=1e-6)
    assert np.allclose(m, 0.1 * g) and np.allclose(v, 0.001 * g ** 2)

def test_minimises():
    """Many steps minimise a simple quadratic"""
    w, m, v = np.array([5.0, -3.0]), np.zeros(2), np.zeros(2)
    for t in range(1, 2001):
        w, m, v = adam_update(w, 2 * w, m, v, t, lr=0.05)
    assert np.allclose(w, 0, atol=1e-2)
:::

:::exercise tr-early Early stopping
Write `early_stopping(val_losses, patience)`. Go through the validation losses epoch by epoch (epochs numbered from 0), tracking the best (lowest) so far. Stop at the first epoch that is `patience` epochs after the best one. Return the tuple `(best_epoch, stop_epoch)`; if training never stops early, `stop_epoch` is the last epoch.

@@starter
def early_stopping(val_losses, patience):
    return 0, len(val_losses) - 1

@@solution
def early_stopping(val_losses, patience):
    best_epoch, best = 0, float("inf")
    for epoch, loss in enumerate(val_losses):
        if loss < best:
            best, best_epoch = loss, epoch
        elif epoch - best_epoch >= patience:
            return best_epoch, epoch
    return best_epoch, len(val_losses) - 1

@@tests
def test_stops():
    """Best at epoch 2, patience 3: stops at epoch 5"""
    losses = [1.0, 0.8, 0.7, 0.75, 0.72, 0.71, 0.69, 0.6]
    assert early_stopping(losses, 3) == (2, 5)

def test_patience_allows_recovery():
    """A longer patience sees the later improvement"""
    losses = [1.0, 0.8, 0.7, 0.75, 0.72, 0.71, 0.69, 0.6]
    assert early_stopping(losses, 5) == (7, 7)

def test_never_improves():
    """The first epoch is best"""
    assert early_stopping([0.5, 0.6, 0.7, 0.8], 2) == (0, 2)
:::

:::quiz tr-quiz Quick check
? Why does a deep network of sigmoid layers train slowly in its early layers?
- [x] Sigmoid's slope is at most 0.25, so gradients shrink every time they pass back through a layer
- [ ] Sigmoid is too expensive to compute
- [ ] Early layers have fewer parameters
> The vanishing gradient problem. ReLU's slope is 1 wherever it's active.

? What does He initialisation aim for?
- [x] Keeping the scale of activations roughly constant from layer to layer
- [ ] Making all weights equal
- [ ] Making the network converge in one step
> Weights with standard deviation √(2 / n_in) preserve the signal's size through ReLU layers.

? Why is dropout switched off when making predictions?
- [x] It's a training-time regulariser; at prediction time you want the full network
- [ ] It makes predictions faster
- [ ] Dropout only works on GPUs
> Inverted dropout scales the surviving units during training so nothing changes at prediction time.

? Training loss keeps falling but validation loss started rising 15 epochs ago. What should you do?
- [x] Stop and use the weights from the epoch with the lowest validation loss
- [ ] Train longer, the validation loss will come back down
- [ ] Increase the learning rate
> That's early stopping.
:::
