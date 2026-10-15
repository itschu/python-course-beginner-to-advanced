---
title: "Checkpoint: Edge AI & TinyML"
summary: Budgets, features, quantization and deployment, tested together.
minutes: 60
kind: checkpoint
---

:::quiz tinyml-cp-quiz Concepts
? A keyword-spotting model has 20,000 parameters. Roughly how much flash do its weights need as int8, and as float32?
- [x] About 20 KB and 80 KB
- [ ] About 2 KB and 8 KB
- [ ] About 20 MB and 80 MB
> One byte per int8 parameter, four per float32.

? Which feature is the most microcontroller-friendly?
- [ ] A 1024-point FFT in double precision
- [x] An integer zero-crossing count
- [ ] A per-window gradient-boosted embedding
> Cheap, integer-only and robust.

? After quantization, accuracy drops from 99% to 80%. What do you check first?
- [x] Whether the scales are dominated by an outlier, and whether per-channel scales or percentile calibration help
- [ ] The learning rate
- [ ] The microcontroller's clock speed
> A single huge activation or weight can leave every other value with only a few quantization levels.

? Why does the firmware run check vectors at boot?
- [x] To detect a model or feature implementation that doesn't match the training reference before acting on its predictions
- [ ] To warm up the CPU cache
- [ ] To calibrate the accelerometer
> A mismatch means wrong predictions; refusing to run is safer.

? Which of these belong on a TinyML deployment checklist? (choose all that apply)
- [x] Flash, RAM and latency measured on the device
- [x] Predictions on logged device data compared with the Python reference
- [x] Smoothing and a confidence threshold to limit false events
- [x] A model version reported by the device
> All four come up in real projects.
:::

:::exercise tinyml-cp-affine Asymmetric (affine) quantization
ReLU outputs and many sensor readings are never negative, so symmetric int8 wastes half its range on them. **Affine** quantization to `uint8` uses a scale and a **zero point**:

$$
s = \frac{\max - \min}{255}, \qquad z = \text{round}\left(-\frac{\min}{s}\right), \qquad q = \text{clamp}(\text{round}(v / s) + z,\ 0,\ 255), \qquad v \approx s\,(q - z)
$$

Write `affine_params(values)` returning `(scale, zero_point)` (include 0.0 in the range, as TensorFlow Lite does, so that zero is represented exactly), `affine_quantize(values, scale, zero_point)` returning a list of ints, and `affine_dequantize(q, scale, zero_point)` returning a list of floats.

@@starter
def affine_params(values):
    pass

def affine_quantize(values, scale, zero_point):
    pass

def affine_dequantize(q, scale, zero_point):
    pass

@@solution
def affine_params(values):
    lo = min(min(values), 0.0)
    hi = max(max(values), 0.0)
    scale = (hi - lo) / 255 if hi > lo else 1.0
    zero_point = round(-lo / scale)
    return scale, zero_point

def affine_quantize(values, scale, zero_point):
    return [max(0, min(255, round(v / scale) + zero_point)) for v in values]

def affine_dequantize(q, scale, zero_point):
    return [scale * (v - zero_point) for v in q]

@@tests
def test_positive_values():
    """Non-negative values use the full 0-255 range with zero point 0"""
    scale, zp = affine_params([0.0, 1.0, 2.55])
    assert zp == 0 and abs(scale - 0.01) < 1e-12
    assert affine_quantize([0.0, 1.0, 2.55], scale, zp) == [0, 100, 255]

def test_zero_exact():
    """Zero is represented exactly"""
    values = [-1.0, 0.0, 3.0]
    scale, zp = affine_params(values)
    q = affine_quantize(values, scale, zp)
    assert affine_dequantize(q, scale, zp)[1] == 0.0

def test_round_trip():
    """Round trip error is at most half a step"""
    values = [-0.7, 0.13, 1.9, 2.2, 0.0]
    scale, zp = affine_params(values)
    restored = affine_dequantize(affine_quantize(values, scale, zp), scale, zp)
    assert max(abs(a - b) for a, b in zip(values, restored)) <= scale / 2 + 1e-12

def test_ints():
    """Quantized values are ints in 0..255"""
    scale, zp = affine_params([-5.0, 5.0])
    q = affine_quantize([-5.0, 5.0, 100.0], scale, zp)
    assert all(type(v) is int and 0 <= v <= 255 for v in q) and q[2] == 255

@@hint
Extend the range to include zero: `lo = min(min(values), 0.0)`, `hi = max(max(values), 0.0)`. Then `scale = (hi - lo) / 255` and `zero_point = round(-lo / scale)`.
:::

:::exercise tinyml-cp-budget Pick the model that fits
You're choosing a model for a wearable. Write `choose(candidates, flash_bytes, max_macs)` where each candidate is a dict with `"name"`, `"layers"` (sizes like `[5, 8, 4]`) and `"accuracy"`. A candidate fits if its int8 weights plus int32 biases fit in `flash_bytes` and its MACs per prediction are at most `max_macs`. Return the name of the most accurate candidate that fits; on a tie, the one with fewer MACs. Return `None` if nothing fits.

@@starter
def choose(candidates, flash_bytes, max_macs):
    pass

@@solution
def cost(layers):
    flash = macs = 0
    for n_in, n_out in zip(layers, layers[1:]):
        flash += n_in * n_out + 4 * n_out
        macs += n_in * n_out
    return flash, macs

def choose(candidates, flash_bytes, max_macs):
    fitting = []
    for c in candidates:
        flash, macs = cost(c["layers"])
        if flash <= flash_bytes and macs <= max_macs:
            fitting.append((-c["accuracy"], macs, c["name"]))
    return min(fitting)[2] if fitting else None

@@tests
CANDIDATES = [
    {"name": "tiny", "layers": [5, 4, 4], "accuracy": 0.97},
    {"name": "small", "layers": [5, 8, 4], "accuracy": 0.98},
    {"name": "raw-cnn", "layers": [120, 64, 32, 4], "accuracy": 0.99},
    {"name": "small-twin", "layers": [5, 8, 8, 4], "accuracy": 0.98},
]

def test_best_that_fits():
    """Picks the most accurate model within budget"""
    assert choose(CANDIDATES, flash_bytes=1000, max_macs=200) == "small"

def test_big_budget():
    """With room to spare, the biggest model wins"""
    assert choose(CANDIDATES, flash_bytes=20_000, max_macs=20_000) == "raw-cnn"

def test_tie_prefers_cheaper():
    """Equal accuracy: fewer MACs wins"""
    assert choose(CANDIDATES[1:2] + CANDIDATES[3:], flash_bytes=1000, max_macs=1000) == "small"

def test_nothing_fits():
    """None when nothing fits"""
    assert choose(CANDIDATES, flash_bytes=10, max_macs=10) is None

@@hint
Compute flash as `n_in * n_out` (int8 weights) plus `4 * n_out` (int32 biases) per layer, and MACs as `n_in * n_out`. Sorting tuples like `(-accuracy, macs, name)` puts the best candidate first.
:::

## Phase 13 complete

You've taken a model all the way from raw sensor data to firmware: designing integer features, training under a budget, quantizing to int8, exporting it as code, writing bit-exact integer inference in Rust, and planning its deployment, measurement and updates.

The final phase pulls everything together into a capstone (on a server, or on a device) and looks at careers in ML engineering and embedded systems.
