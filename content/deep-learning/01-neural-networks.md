---
title: Neural networks, from one neuron to many layers
summary: What deep learning is and when it beats other models, how a neuron and a layer compute, why activation functions matter, and how a network's size controls what it can learn.
minutes: 45
kind: lesson
---

**Deep learning** means machine learning with **neural networks**: models built from many simple units arranged in layers. The same idea powers image recognition, speech recognition, translation and large language models such as Claude.

This phase builds a neural network from scratch in NumPy first, running in your browser, so that nothing about it is magic. Then you'll switch to **PyTorch**, the library most researchers and companies use, in Google Colab with a free GPU.

## When deep learning wins, and when it doesn't

| Data | Usually best | Why |
| --- | --- | --- |
| Images, audio, video | Deep learning (CNNs, transformers) | Networks learn the features (edges, shapes, sounds) themselves |
| Text | Deep learning (transformers) | Meaning depends on word order and context |
| Long sequences, e.g. sensor data | Deep learning, sometimes | When there's lots of data and complex patterns |
| **Tables of features** (like match stats or house prices) | **Gradient boosting** | Trees handle mixed features, missing values and small data better |

For most betting and business problems with tabular data, gradient boosting from Phase 5 is still the model to beat. Lesson 10 tests that claim directly.

## A single neuron

A neuron takes inputs $x_1, \dots, x_n$, multiplies each by a **weight**, adds a **bias**, and passes the result through an **activation function**:

$$
z = w_1 x_1 + w_2 x_2 + \dots + w_n x_n + b = \mathbf{x} \cdot \mathbf{w} + b, \qquad a = \sigma(z)
$$

With a sigmoid activation, a single neuron is exactly logistic regression from Phase 4.

```python
import numpy as np

x = np.array([0.8, 0.2, 0.5])        # one example with three features
w = np.array([1.5, -2.0, 0.7])       # one weight per feature
b = -0.3                              # the bias

z = x @ w + b                         # the weighted sum
a = 1 / (1 + np.exp(-z))              # sigmoid activation
print(f"z = {z:.3f}, output = {a:.3f}")
```

## Activation functions

```python
import matplotlib.pyplot as plt
import numpy as np

z = np.linspace(-5, 5, 200)
fig, ax = plt.subplots(figsize=(6, 3.5))
ax.plot(z, 1 / (1 + np.exp(-z)), label="sigmoid: squashes to (0, 1)")
ax.plot(z, np.tanh(z), label="tanh: squashes to (-1, 1)")
ax.plot(z, np.maximum(0, z), label="ReLU: max(0, z)")
ax.axhline(0, color="grey", lw=0.5)
ax.set_ylim(-1.5, 3)
ax.legend()
fig.tight_layout()
plt.show()
```

- **ReLU** (rectified linear unit) is the default for hidden layers: cheap to compute, and its gradient doesn't vanish for positive inputs.
- **Sigmoid** turns a single output into a probability (binary classification).
- **Softmax** turns a vector of scores into probabilities that sum to 1 (multi-class, like home/draw/away).

## A layer is a matrix multiplication

A layer is many neurons side by side, each with its own weights. Stack the weight vectors as columns of a matrix $W$, and a whole layer, for a whole batch of examples, is one matrix multiplication:

$$
H = \text{ReLU}(XW + \mathbf{b})
$$

```python
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(size=(4, 3))                       # a batch: 4 examples, 3 features
W1, b1 = rng.normal(size=(3, 5)), np.zeros(5)     # layer 1: 3 inputs -> 5 neurons
W2, b2 = rng.normal(size=(5, 2)), np.zeros(2)     # layer 2: 5 inputs -> 2 outputs

H = np.maximum(0, X @ W1 + b1)                    # hidden layer, ReLU
out = H @ W2 + b2                                 # output layer (raw scores)
print("hidden:", H.shape, " output:", out.shape)
print("parameters:", W1.size + b1.size + W2.size + b2.size)
print(out.round(3))
```

Each extra layer feeds on the previous layer's output. A network with several hidden layers is "deep", which is where the name comes from.

## Why activation functions are essential

Without an activation, two layers collapse into one: $(XW_1)W_2 = X(W_1W_2)$, which is still a linear model. However many linear layers you stack, the result is a straight line (or flat plane).

```python
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(size=(4, 3))
W1, W2 = rng.normal(size=(3, 5)), rng.normal(size=(5, 2))

two_layers = (X @ W1) @ W2
one_layer = X @ (W1 @ W2)
print("two linear layers equal one:", np.allclose(two_layers, one_layer))
```

The non-linearity between layers is what lets a network bend its decision boundary and fit curves.

## Size controls what a network can learn

With enough hidden units, a network with one hidden layer can approximate almost any smooth function (the **universal approximation theorem**). Here scikit-learn's `MLPRegressor` fits a noisy sine wave with 1, 4 and 64 ReLU units. Each ReLU unit adds one "kink" to a piecewise-straight line:

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.neural_network import MLPRegressor

rng = np.random.default_rng(0)
x = np.sort(rng.uniform(-3, 3, 200)).reshape(-1, 1)
y = np.sin(2 * x).ravel() + rng.normal(0, 0.1, 200)

fig, ax = plt.subplots(figsize=(7, 3.5))
ax.scatter(x, y, s=8, color="grey", alpha=0.5)
for units in [1, 4, 64]:
    net = MLPRegressor(hidden_layer_sizes=(units,), solver="lbfgs", max_iter=5000, random_state=0).fit(x, y)
    ax.plot(x, net.predict(x), lw=2, label=f"{units} hidden units, R² = {net.score(x, y):.2f}")
ax.legend()
fig.tight_layout()
plt.show()
```

More capacity fits more complex patterns, and also memorises noise more easily. Everything you learned about overfitting in Phase 5 applies, with one difference: neural networks are usually so big that they **could** memorise the training data, so validation sets, regularisation and early stopping are part of every training run.

## Practice

:::exercise dl-activations Activation functions
Write three functions that work element-wise on NumPy arrays:

- `relu(z)`: `max(0, z)`.
- `sigmoid(z)`: $1 / (1 + e^{-z})$.
- `softmax(z)`: for a 2-D array, turn each **row** into probabilities that sum to 1. Subtract each row's maximum before exponentiating, so large scores don't overflow.

@@starter
import numpy as np

def relu(z):
    pass

def sigmoid(z):
    pass

def softmax(z):
    pass

@@solution
import numpy as np

def relu(z):
    return np.maximum(0, z)

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

def softmax(z):
    z = np.asarray(z, dtype=float)
    e = np.exp(z - z.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)

@@tests
import numpy as np

def test_relu():
    """Negatives become 0"""
    assert np.array_equal(relu(np.array([-2.0, 0.0, 3.5])), [0.0, 0.0, 3.5])

def test_sigmoid():
    """sigmoid(0) = 0.5, symmetric"""
    s = sigmoid(np.array([-2.0, 0.0, 2.0]))
    assert np.isclose(s[1], 0.5) and np.isclose(s[0] + s[2], 1.0)

def test_softmax_rows():
    """Rows sum to 1 and keep the order of the scores"""
    p = softmax(np.array([[1.0, 2.0, 3.0], [0.0, 0.0, 0.0]]))
    assert np.allclose(p.sum(axis=1), 1)
    assert np.allclose(p[1], 1 / 3) and p[0, 2] > p[0, 1] > p[0, 0]

def test_softmax_large_scores():
    """No overflow for large scores"""
    p = softmax(np.array([[1000.0, 1000.0]]))
    assert np.allclose(p, 0.5)
:::

:::exercise dl-forward A forward pass
Write `forward(X, layers)`, where `layers` is a list of `(W, b)` pairs. Apply each layer in turn as `X @ W + b`, with ReLU after every layer **except the last**, and return the final output.

@@starter
import numpy as np

def forward(X, layers):
    return X

@@solution
import numpy as np

def forward(X, layers):
    out = X
    for i, (W, b) in enumerate(layers):
        out = out @ W + b
        if i < len(layers) - 1:
            out = np.maximum(0, out)
    return out

@@tests
import numpy as np

def test_two_layers():
    """Matches a hand-written two-layer network"""
    rng = np.random.default_rng(1)
    X = rng.normal(size=(6, 4))
    W1, b1 = rng.normal(size=(4, 8)), rng.normal(size=8)
    W2, b2 = rng.normal(size=(8, 3)), rng.normal(size=3)
    expected = np.maximum(0, X @ W1 + b1) @ W2 + b2
    assert np.allclose(forward(X, [(W1, b1), (W2, b2)]), expected)

def test_last_layer_not_rectified():
    """The output layer can be negative"""
    X = np.array([[1.0]])
    out = forward(X, [(np.array([[2.0]]), np.array([0.0])), (np.array([[-1.0]]), np.array([0.0]))])
    assert np.allclose(out, [[-2.0]])

def test_single_layer():
    """One layer is just a linear model"""
    X = np.array([[1.0, -1.0]])
    assert np.allclose(forward(X, [(np.array([[1.0], [3.0]]), np.array([0.5]))]), [[-1.5]])
:::

:::exercise dl-params Counting parameters
Write `count_parameters(sizes)`, where `sizes` lists the width of each layer from input to output. For example, `[64, 32, 10]` means 64 inputs, a hidden layer of 32 and 10 outputs. Each connection between consecutive layers has a weight matrix and each layer after the input has one bias per neuron. Return the total number of parameters.

@@starter
def count_parameters(sizes):
    return 0

@@solution
def count_parameters(sizes):
    return sum(n_in * n_out + n_out for n_in, n_out in zip(sizes[:-1], sizes[1:]))

@@tests
def test_examples():
    """Weights plus biases, layer by layer"""
    assert count_parameters([64, 32, 10]) == 64 * 32 + 32 + 32 * 10 + 10
    assert count_parameters([3, 5, 2]) == 32
    assert count_parameters([784, 128, 64, 10]) == 109386

def test_logistic_regression():
    """No hidden layer: one weight per feature plus a bias"""
    assert count_parameters([10, 1]) == 11
:::

:::quiz dl-intro-quiz Quick check
? You have 5,000 rows of match statistics in a table. Which model should you try first?
- [x] Gradient boosting
- [ ] A deep convolutional network
- [ ] A transformer
> For tabular data, gradient boosting is usually as good or better, faster and easier to tune.

? What is a neuron with a sigmoid activation equivalent to?
- [x] Logistic regression
- [ ] A decision tree
- [ ] k-nearest neighbours
> A weighted sum plus a bias, squashed into a probability.

? Why do neural networks need non-linear activation functions?
- [x] Without them, any number of layers collapses into a single linear model
- [ ] They make training faster
- [ ] They reduce the number of parameters
> $(XW_1)W_2 = X(W_1 W_2)$.

? A layer maps 100 inputs to 50 neurons. How many parameters does it have?
- [ ] 150
- [ ] 5,000
- [x] 5,050
> 100 × 50 weights plus 50 biases.
:::
