---
title: "Checkpoint: Deep Learning"
summary: Backpropagation, training techniques, PyTorch, CNNs, attention and choosing the right model, in one test.
minutes: 75
kind: checkpoint
---

**Passing standard:** all three exercises pass and you score at least 9/12 on the quiz.

:::quiz phase7-final Phase 7 quiz
? A network has two hidden layers but no activation functions. What can it represent?
- [x] Only linear functions, the same as a single layer
- [ ] Any function, given enough units
- [ ] Only step functions
> Without non-linearities, stacked layers collapse into one matrix multiplication.

? For a dense layer $Z = XW + b$, the gradient with respect to $W$ is:
- [x] $X^\top \, dZ$
- [ ] $dZ \, W^\top$
- [ ] $dZ \, X^\top$
> And it must have the same shape as $W$.

? Training loss oscillates wildly and occasionally shoots up to `nan`. What do you change first?
- [x] Lower the learning rate
- [ ] Add more layers
- [ ] Remove the validation set
> Divergence is the classic symptom of too large a learning rate.

? Why use He initialisation with ReLU layers?
- [x] It keeps activations and gradients at a stable scale through many layers
- [ ] It makes training deterministic
- [ ] It removes the need for a learning rate
> Weights with standard deviation √(2 / n_in).

? What does Adam keep for every parameter?
- [x] Running averages of its gradient and squared gradient
- [ ] A copy of the best value so far
- [ ] Its value from the previous epoch only
> Dividing one by the square root of the other gives each parameter its own step size.

? Your PyTorch model's validation accuracy changes every time you evaluate the same weights on the same data. The most likely bug?
- [x] You forgot `model.eval()`, so dropout is still active
- [ ] You forgot `optimizer.zero_grad()`
- [ ] The learning rate is too high
> Evaluation must switch off dropout and freeze batch-norm statistics.

? A model's last layer is `nn.Linear(128, 10)` and you train it with `nn.CrossEntropyLoss`. To get class probabilities at prediction time you should:
- [x] Apply `torch.softmax(logits, dim=1)`
- [ ] Nothing, the outputs are already probabilities
- [ ] Apply `torch.sigmoid` to each output
> The loss applies softmax internally during training; the model itself outputs logits.

? How many parameters does `nn.Conv2d(16, 32, kernel_size=3)` have?
- [ ] 288
- [x] 4,640
- [ ] 147,456
> 32 filters × (16 × 3 × 3 weights + 1 bias) = 4,640.

? You have 2,000 labelled photos of three kinds of product defect. The best starting point is:
- [x] Fine-tune a CNN pretrained on ImageNet
- [ ] Train a large CNN from scratch
- [ ] Gradient boosting on the raw pixels
> Pretrained features make small image datasets workable.

? In self-attention, what determines how much position $i$ draws on position $j$?
- [x] How well $i$'s query matches $j$'s key, after a softmax over all keys
- [ ] How close the two positions are
- [ ] The size of $j$'s value vector
> softmax(QKᵀ / √d) gives the weights; the values are then averaged with them.

? Why does a GPT-style model use a causal mask?
- [x] It generates text left to right, so each token may only use earlier tokens
- [ ] To hide padding
- [ ] To make attention cheaper
> During training it must not peek at the tokens it's learning to predict.

? On a table of 5,000 rows of match statistics, which is the most sensible order of models to try?
- [x] A simple baseline, then gradient boosting, and a neural network only if there's a specific reason
- [ ] A transformer first, because it's the most powerful
- [ ] Only neural networks, since they can approximate any function
> On small tabular data, trees and structured models usually win.
:::

:::exercise cp7-softmax-regression Gradients of softmax regression
Multi-class logistic regression is a one-layer network: logits $Z = XW + \mathbf{b}$, then softmax and mean cross-entropy. Write `softmax_regression_grads(X, y, W, b)` returning the tuple `(loss, dW, db)` for integer labels `y`.

@@starter
import numpy as np

def softmax_regression_grads(X, y, W, b):
    return 0.0, np.zeros_like(W), np.zeros_like(b)

@@solution
import numpy as np

def softmax_regression_grads(X, y, W, b):
    Z = X @ W + b
    Z = Z - Z.max(axis=1, keepdims=True)
    P = np.exp(Z) / np.exp(Z).sum(axis=1, keepdims=True)
    n = len(y)
    loss = float(-np.mean(np.log(P[np.arange(n), y])))
    dZ = P.copy()
    dZ[np.arange(n), y] -= 1
    dZ /= n
    return loss, X.T @ dZ, dZ.sum(axis=0)

@@tests
import math
import numpy as np

def test_zero_weights():
    """With zero weights, every class is equally likely"""
    X, y = np.array([[1.0, 2.0], [3.0, -1.0]]), np.array([0, 2])
    loss, dW, db = softmax_regression_grads(X, y, np.zeros((2, 3)), np.zeros(3))
    assert math.isclose(loss, math.log(3))
    assert np.allclose(db, [1 / 3 - 0.5, 1 / 3, 1 / 3 - 0.5])

def test_numerical_gradients():
    """dW and db match numerical estimates"""
    rng = np.random.default_rng(0)
    X, y = rng.normal(size=(10, 4)), rng.integers(0, 3, 10)
    W, b = rng.normal(size=(4, 3)), rng.normal(size=3)
    loss, dW, db = softmax_regression_grads(X, y, W, b)
    eps = 1e-6
    E = np.zeros_like(W); E[2, 1] = eps
    num = (softmax_regression_grads(X, y, W + E, b)[0] - softmax_regression_grads(X, y, W - E, b)[0]) / (2 * eps)
    assert math.isclose(dW[2, 1], num, rel_tol=1e-5)
    e = np.zeros(3); e[0] = eps
    num_b = (softmax_regression_grads(X, y, W, b + e)[0] - softmax_regression_grads(X, y, W, b - e)[0]) / (2 * eps)
    assert math.isclose(db[0], num_b, rel_tol=1e-5)
:::

:::exercise cp7-conv Multi-channel convolution
Write `conv_layer(images, kernels, bias)`: `images` has shape `(C, H, W)` (channels first), `kernels` has shape `(F, C, k, k)` and `bias` has shape `(F,)`. Return the valid convolution (stride 1, no padding, no kernel flip) with shape `(F, H - k + 1, W - k + 1)`: each output map is the sum over all input channels of that channel convolved with the filter's matching kernel slice, plus the filter's bias.

@@starter
import numpy as np

def conv_layer(images, kernels, bias):
    return np.zeros((kernels.shape[0], 1, 1))

@@solution
import numpy as np

def conv_layer(images, kernels, bias):
    F, C, k, _ = kernels.shape
    _, H, W = images.shape
    out = np.zeros((F, H - k + 1, W - k + 1))
    for f in range(F):
        for i in range(H - k + 1):
            for j in range(W - k + 1):
                out[f, i, j] = np.sum(images[:, i:i + k, j:j + k] * kernels[f]) + bias[f]
    return out

@@tests
import numpy as np

def test_single_channel():
    """One channel, one filter"""
    image = np.arange(16, dtype=float).reshape(1, 4, 4)
    kernel = np.array([[[[1.0, 0.0], [0.0, -1.0]]]])
    out = conv_layer(image, kernel, np.array([0.5]))
    assert out.shape == (1, 3, 3) and np.allclose(out, -4.5)

def test_channels_are_summed():
    """Each filter sums over all input channels"""
    rng = np.random.default_rng(0)
    images, kernels, bias = rng.normal(size=(3, 6, 5)), rng.normal(size=(4, 3, 3, 3)), rng.normal(size=4)
    out = conv_layer(images, kernels, bias)
    assert out.shape == (4, 4, 3)
    expected = np.sum(images[:, 1:4, 2:5] * kernels[2]) + bias[2]
    assert np.isclose(out[2, 1, 2], expected)
:::

:::exercise cp7-mha Multi-head attention
Write `multi_head_attention(X, W_q, W_k, W_v, n_heads)` for one sequence `X` of shape `(n, d)`, with projection matrices of shape `(d, d)`. Compute `Q = X @ W_q` (and likewise `K`, `V`), split the `d` columns into `n_heads` equal consecutive chunks, run scaled dot-product attention separately for each head (scale by the square root of the **head** size), and concatenate the heads' outputs back into shape `(n, d)`.

@@starter
import numpy as np

def multi_head_attention(X, W_q, W_k, W_v, n_heads):
    return X

@@solution
import numpy as np

def multi_head_attention(X, W_q, W_k, W_v, n_heads):
    Q, K, V = X @ W_q, X @ W_k, X @ W_v
    size = X.shape[1] // n_heads
    heads = []
    for h in range(n_heads):
        cols = slice(h * size, (h + 1) * size)
        scores = Q[:, cols] @ K[:, cols].T / np.sqrt(size)
        weights = np.exp(scores - scores.max(axis=1, keepdims=True))
        weights /= weights.sum(axis=1, keepdims=True)
        heads.append(weights @ V[:, cols])
    return np.concatenate(heads, axis=1)

@@tests
import numpy as np

def attend(Q, K, V):
    s = Q @ K.T / np.sqrt(Q.shape[1])
    w = np.exp(s - s.max(axis=1, keepdims=True))
    return (w / w.sum(axis=1, keepdims=True)) @ V

def test_one_head_is_plain_attention():
    """With one head it's ordinary attention"""
    rng = np.random.default_rng(0)
    X, Wq, Wk, Wv = rng.normal(size=(5, 8)), rng.normal(size=(8, 8)), rng.normal(size=(8, 8)), rng.normal(size=(8, 8))
    assert np.allclose(multi_head_attention(X, Wq, Wk, Wv, 1), attend(X @ Wq, X @ Wk, X @ Wv))

def test_heads_are_independent():
    """Each head attends on its own slice of the projections"""
    rng = np.random.default_rng(1)
    X, Wq, Wk, Wv = rng.normal(size=(6, 8)), rng.normal(size=(8, 8)), rng.normal(size=(8, 8)), rng.normal(size=(8, 8))
    out = multi_head_attention(X, Wq, Wk, Wv, 2)
    Q, K, V = X @ Wq, X @ Wk, X @ Wv
    assert out.shape == (6, 8)
    assert np.allclose(out[:, 4:], attend(Q[:, 4:], K[:, 4:], V[:, 4:]))
:::

## Phase 7 complete

You've built neural networks from scratch, trained them in PyTorch, used CNNs and transfer learning for images, and seen how attention and transformers work. Just as important, you've seen where deep learning *doesn't* help, and how to tell. Phase 8 turns models into products: you'll build web APIs with FastAPI that serve predictions, store data and handle users.
