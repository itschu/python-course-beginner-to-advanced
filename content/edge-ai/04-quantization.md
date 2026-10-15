---
title: "Quantization: from float32 to int8"
summary: Represent weights and activations as 8-bit integers with a scale, do a whole layer in integer arithmetic, fold the scaler into the input, and measure what accuracy it costs.
minutes: 65
kind: lesson
---

Your trained network stores every weight as a 64-bit float in scikit-learn (32-bit in PyTorch). **Quantization** replaces each one with an 8-bit integer plus one shared **scale** per tensor. The model gets 4 to 8 times smaller, and every multiply becomes a fast integer multiply, which matters enormously on a chip like the RP2040 with no floating-point unit.

## Symmetric quantization

Choose a scale so the largest weight maps to 127:

$$
s = \frac{\max |w|}{127}, \qquad q = \text{round}\left(\frac{w}{s}\right) \in [-127, 127], \qquad w \approx q \times s
$$

```python
import numpy as np

w = np.array([0.823, -0.314, 0.052, -1.27, 0.661, 0.0009])
scale = np.abs(w).max() / 127
q = np.round(w / scale).astype(np.int8)
restored = q * scale

print("scale", scale)
print("int8 ", q)
print("error", np.round(restored - w, 4))
print("max error", np.abs(restored - w).max(), "<= scale / 2 =", scale / 2)
```

Each weight is off by at most half a step ($s/2$). Small weights lose the most relative precision: `0.0009` became `0`. That's usually fine, because a tiny weight barely affects the output anyway.

There's also **asymmetric** (affine) quantization, $w \approx s (q - z)$ with a **zero point** $z$, which uses the full range when values are mostly positive (like ReLU outputs). TensorFlow Lite uses symmetric int8 for weights and asymmetric int8 for activations. We'll keep everything symmetric, and since ReLU outputs are never negative, they use the range 0 to 127.

## A dense layer in integers

A dense layer computes $y_k = b_k + \sum_j W_{kj} x_j$. If inputs have scale $s_x$ and weights have scale $s_w$, then

$$
y_k \approx s_x s_w \underbrace{\Big( \frac{b_k}{s_x s_w} + \sum_j q^W_{kj}\, q^x_j \Big)}_{\text{an integer: } acc_k}
$$

So the device computes the **accumulator** `acc` entirely in integers (int8 × int8 products summed in an `i32`), with the bias pre-quantized to the scale $s_x s_w$ as an `i32`. The real value is `acc × s_x × s_w`.

Before the next layer, the output must become int8 again with its own scale $s_y$ (chosen by looking at the range of activations on training data, called **calibration**): $q^y = \text{round}(acc \times \frac{s_x s_w}{s_y})$. The ratio $M = s_x s_w / s_y$ is a float, which we don't want on the device. Store it as a **fixed-point multiplier** instead: $m = \text{round}(M \times 2^{24})$, and compute

```text
q_y = (acc × m + 2^23) >> 24          // + 2^23 rounds to nearest; >> 24 divides by 2^24
```

with a 64-bit intermediate. This is exactly how TensorFlow Lite Micro and CMSIS-NN requantize.

## Folding the scaler into the input

The model was trained on **standardised** features, $z = (f - \mu) / \sigma$. On the device, we standardise and quantize in one integer step, with a fixed-point multiplier per feature:

$$
q^x_j = \text{clamp}\Big(\big((f_j - \mu_j) \cdot m_j + 2^{23}\big) \gg 24,\ -127,\ 127\Big), \qquad m_j = \text{round}\Big(\frac{2^{24}}{\sigma_j\, s_x}\Big)
$$

where $\mu_j$ is rounded to an integer (the features are integers anyway).

## The whole quantized model

This cell trains the lesson 3 network, quantizes it, and runs integer-only inference, written exactly as the Rust firmware will do it, so it serves as the **reference implementation**:

```python
import math
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

N, SHIFT = 40, 24
ROUND = 1 << (SHIFT - 1)

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

scaler = StandardScaler().fit(X_train)
mlp = MLPClassifier(hidden_layer_sizes=(8,), max_iter=4000, random_state=1).fit(scaler.transform(X_train), y_train)
W1, b1 = mlp.coefs_[0].T, mlp.intercepts_[0]          # (8, 5), (8,)
W2, b2 = mlp.coefs_[1].T, mlp.intercepts_[1]          # (4, 8), (4,)

# --- calibrate scales on the training data ---
Z = scaler.transform(X_train)
s_x = np.abs(Z).max() / 127
s_w1 = np.abs(W1).max() / 127
s_h = np.maximum(0, Z @ W1.T + b1).max() / 127
s_w2 = np.abs(W2).max() / 127

# --- quantize ---
mean_q = np.round(scaler.mean_).astype(int)
in_mult = np.round((1 << SHIFT) / (scaler.scale_ * s_x)).astype(int)
w1_q, b1_q = np.round(W1 / s_w1).astype(int), np.round(b1 / (s_x * s_w1)).astype(int)
w2_q, b2_q = np.round(W2 / s_w2).astype(int), np.round(b2 / (s_h * s_w2)).astype(int)
h_mult = int(round((1 << SHIFT) * s_x * s_w1 / s_h))

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def predict_int(f):
    """Integer-only inference: the reference for the Rust version."""
    xq = [clamp(((int(f[j]) - int(mean_q[j])) * int(in_mult[j]) + ROUND) >> SHIFT, -127, 127) for j in range(5)]
    h = []
    for k in range(8):
        acc = int(b1_q[k]) + sum(int(w1_q[k, j]) * xq[j] for j in range(5))
        h.append(clamp((max(acc, 0) * h_mult + ROUND) >> SHIFT, 0, 127))      # ReLU + requantize
    logits = [int(b2_q[c]) + sum(int(w2_q[c, k]) * h[k] for k in range(8)) for c in range(4)]
    return logits.index(max(logits))                                          # argmax: no softmax needed

float_pred = mlp.predict(scaler.transform(X_test))
int_pred = np.array([mlp.classes_[predict_int(f)] for f in X_test])
print(f"float model accuracy: {(float_pred == y_test).mean():.3f}")
print(f"int8 model accuracy:  {(int_pred == y_test).mean():.3f}")
print(f"agreement:            {(int_pred == float_pred).mean():.3f}")
print("weights layer 1 (int8):\n", w1_q)
print("hidden multiplier", h_mult, "≈", round(h_mult / (1 << SHIFT), 6))
```

Two details make the integer version simple:

- The **softmax** isn't needed to pick a class: it never changes which logit is largest. If you need probabilities (for a confidence threshold), compare logits instead, or compute softmax only on the winner.
- **ReLU** before requantization is just `max(acc, 0)`.

Quantization usually costs a little accuracy. Here, one test window out of 60 flips. If the drop were larger, the usual fixes are per-channel scales (one scale per output unit instead of per tensor), better calibration (clip outliers at a percentile instead of the max), or **quantization-aware training**, where the model is trained with simulated rounding so it learns weights that survive it.

## Practice

:::exercise tinyml-quantize-symmetric Symmetric quantization
Write `quantize(values)` returning `(q, scale)`: `scale = max(|v|) / 127` and `q` a list of Python ints, `round(v / scale)` clamped to [-127, 127]. If every value is 0, use `scale = 1.0`.

Then write `dequantize(q, scale)` returning a list of floats, and `max_error(values)` returning the largest absolute difference between the values and their quantize/dequantize round trip.

@@starter
def quantize(values):
    pass

def dequantize(q, scale):
    pass

def max_error(values):
    pass

@@solution
def quantize(values):
    largest = max(abs(v) for v in values)
    scale = largest / 127 if largest > 0 else 1.0
    q = [max(-127, min(127, round(v / scale))) for v in values]
    return q, scale

def dequantize(q, scale):
    return [v * scale for v in q]

def max_error(values):
    q, scale = quantize(values)
    return max(abs(a - b) for a, b in zip(values, dequantize(q, scale)))

@@tests
def test_largest_maps_to_127():
    """The largest magnitude maps to ±127"""
    q, scale = quantize([0.5, -2.0, 1.0])
    assert q == [32, -127, 64] and abs(scale - 2.0 / 127) < 1e-12

def test_ints():
    """Returns plain ints"""
    q, _ = quantize([0.1, 0.2])
    assert all(type(v) is int for v in q)

def test_zeros():
    """All zeros don't divide by zero"""
    assert quantize([0.0, 0.0]) == ([0, 0], 1.0)

def test_error_bound():
    """The error is at most half a step"""
    values = [0.82, -0.31, 0.05, -1.27, 0.66, 0.0009]
    _, scale = quantize(values)
    assert max_error(values) <= scale / 2 + 1e-12

@@hint
`round(v / scale)` then clamp with `max(-127, min(127, ...))`.
:::

:::exercise tinyml-requantize Fixed-point requantization
Write:

- `quantize_multiplier(real, shift=24)`: `round(real × 2**shift)`, as an int
- `requantize(acc, multiplier, shift=24, lo=-127, hi=127)`: `(acc × multiplier + 2**(shift − 1)) >> shift`, clamped to `[lo, hi]`
- `dense_int(xq, wq, bq)`: the int accumulators of a dense layer: for each output `k`, `bq[k] + Σ_j wq[k][j] × xq[j]` (lists of ints in, list of ints out)

@@starter
def quantize_multiplier(real, shift=24):
    pass

def requantize(acc, multiplier, shift=24, lo=-127, hi=127):
    pass

def dense_int(xq, wq, bq):
    pass

@@solution
def quantize_multiplier(real, shift=24):
    return round(real * (1 << shift))

def requantize(acc, multiplier, shift=24, lo=-127, hi=127):
    value = (acc * multiplier + (1 << (shift - 1))) >> shift
    return max(lo, min(hi, value))

def dense_int(xq, wq, bq):
    return [b + sum(w * x for w, x in zip(row, xq)) for row, b in zip(wq, bq)]

@@tests
def test_multiplier():
    """0.5 is 2**23 in Q24"""
    assert quantize_multiplier(0.5) == 1 << 23
    assert quantize_multiplier(0.001) == 16777

def test_requantize_rounds():
    """Rounds to nearest"""
    half = quantize_multiplier(0.5)
    assert requantize(10, half) == 5
    assert requantize(11, half) == 6       # 5.5 rounds up
    assert requantize(-11, half) == -5     # -5.5 rounds up (toward +infinity) too

def test_requantize_clamps():
    """Clamps to the int8 range (or a custom one)"""
    assert requantize(10_000, quantize_multiplier(1.0)) == 127
    assert requantize(-3, quantize_multiplier(1.0), lo=0) == 0

def test_dense():
    """Integer dense layer"""
    assert dense_int([1, -2, 3], [[10, 20, 30], [-1, 0, 1]], [100, -5]) == [100 + 10 - 40 + 90, -5 - 1 + 3]

@@hint
Python's `>>` on negative numbers rounds toward negative infinity, exactly like Rust's `>>` on signed integers. Adding `2**(shift - 1)` first turns that into round-to-nearest.
:::

:::quiz tinyml-quant-check Quick check
? With symmetric int8 quantization and scale s, what's the largest rounding error for one weight?
- [ ] s
- [x] s / 2
- [ ] 1 / 127
> Rounding to the nearest step is off by at most half a step.

? Why is the bias quantized to the scale s_x × s_w as an int32?
- [x] So it can be added directly to the int32 accumulator of int8 × int8 products
- [ ] Biases are always large
- [ ] int8 can't be negative
> The accumulator's scale is s_x × s_w.

? Why don't we need softmax to classify on the device?
- [ ] Softmax is too slow to exist
- [x] Softmax never changes which output is largest, so argmax of the logits gives the same class
- [ ] The int8 logits are already probabilities
> Softmax is monotonic.

? Accuracy drops a lot after quantization. Which are reasonable fixes? (choose all that apply)
- [x] Per-channel scales
- [x] Calibrating with a percentile instead of the maximum
- [x] Quantization-aware training
- [ ] Removing the bias
> All three are standard; TFLite supports each of them.
:::
