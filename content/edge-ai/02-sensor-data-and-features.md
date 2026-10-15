---
title: Sensor data, windows and features
summary: Look at accelerometer data, cut a continuous stream into windows, and design features that are cheap, integer-only and computable on a microcontroller.
minutes: 55
kind: lesson
---

## Looking at the data

Each row of `gestures.csv` is one accelerometer sample: x, y and z acceleration in **g** (1 g is Earth's gravity). A sensor lying still reads about (0, 0, 1): gravity pulls straight down the z axis. Plot one window of each gesture:

```python
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv("data/gestures.csv")
fig, axes = plt.subplots(1, 4, figsize=(12, 2.8), sharey=True)
for ax, gesture in zip(axes, ["idle", "wave", "shake", "circle"]):
    window = df[df.gesture == gesture].window.iloc[0]
    w = df[df.window == window]
    for axis in ["ax", "ay", "az"]:
        ax.plot(w.t_ms, w[axis], label=axis)
    ax.set_title(gesture)
    ax.set_xlabel("ms")
axes[0].set_ylabel("g")
axes[0].legend()
plt.tight_layout()
plt.show()
```

You can already see the differences: **idle** is flat; **wave** swings x slowly; **shake** swings x fast and hard; **circle** moves x and y together, a quarter of a cycle apart (a sine and a cosine).

## From a stream to windows

On the device, samples arrive continuously, 25 per second. A classifier looks at a fixed-length **window**: here the last 40 samples (1.6 s). To react quickly, windows **overlap**: every 10 new samples (0.4 s), classify the latest 40. That's a sliding window with size 40 and **step** 10:

```text
 samples:  ──────────────────────────────────────────────►
 window 1: [0 ........................ 39]
 window 2:           [10 ........................ 49]
 window 3:                     [20 ........................ 59]
```

Smaller steps react faster but cost more computation; on a microcontroller you choose the step to fit your time and energy budget.

## Raw counts, not g

The MPU-6050 doesn't report g: it reports signed 16-bit **counts**, 16384 per g at the ±2 g range (Phase 12, lesson 6). Firmware works directly in counts, because converting every sample to a float is slow on a chip without an FPU. So our features are computed from integer counts too:

```python
import numpy as np
import pandas as pd

df = pd.read_csv("data/gestures.csv")
w = df[df.window == 0]
counts = np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)
print(w.gesture.iloc[0], counts.shape)
print(counts[:5])
```

## Designing features for a microcontroller

You could feed all 120 raw numbers (40 samples × 3 axes) into a neural network. But a small model learns much faster, and runs much cheaper, from a handful of well-chosen **features**: numbers that summarise the window. Good TinyML features are:

- **informative**: they separate the classes,
- **cheap**: a few operations per sample,
- **integer-friendly**: no floats, no division if possible, nothing that can overflow.

Two simple features capture a lot about movement:

1. **How much** each axis moves: its standard deviation. Idle is tiny, shake is huge.
2. **How fast** it moves: the number of times the signal crosses its own mean, the **zero-crossing count**. A 1 Hz wave crosses about 3 times in 1.6 s; a 6 Hz shake crosses about 19 times. (For idle, it's high too: noise crosses the mean all the time. That's fine: idle is recognised by its tiny standard deviation.)

## Making them integer-only

The standard deviation is $\sqrt{\frac{1}{N}\sum x^2 - \left(\frac{1}{N}\sum x\right)^2}$, which needs divisions and a float square root. Multiply through by $N$ and it becomes:

$$
N \cdot \sigma = \sqrt{N \sum x_i^2 - \left(\sum x_i\right)^2}
$$

Everything under the square root is an integer, and an **integer square root** (`math.isqrt` in Python, a short loop in Rust) gives an exact integer answer. We use $N\sigma$ as the feature: scaling a feature by a constant changes nothing once it's standardised.

For zero crossings, comparing each sample with the mean $\frac{1}{N}\sum x$ would need a division too. Instead compare $N x_i$ with $\sum x$: the sign of $N x_i - \sum x$ is the same as the sign of $x_i - \text{mean}$.

```python
import math
import numpy as np
import pandas as pd

N = 40

def axis_features(x):
    """x: a list of N integer counts. Returns (N * std, zero crossings), integers only."""
    s = sum(x)
    sq = sum(v * v for v in x)
    n_std = math.isqrt(N * sq - s * s)
    d = [N * v - s for v in x]                      # sign = above or below the mean
    crossings = sum(1 for a, b in zip(d, d[1:]) if a * b < 0)
    return n_std, crossings

df = pd.read_csv("data/gestures.csv")
for gesture in ["idle", "wave", "shake", "circle"]:
    w = df[df.gesture == gesture]
    w = w[w.window == w.window.iloc[0]]
    counts = np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)
    stats = [axis_features([int(v) for v in counts[:, a]]) for a in range(3)]
    print(f"{gesture:>6}: " + "  ".join(f"{name}: std×N {s:>7,} zc {z:>2}" for name, (s, z) in zip("xyz", stats)))
```

How big can these numbers get? A sample is at most 32,767 in magnitude, so $N \sum x^2$ is at most $40 \times 40 \times 32767^2 \approx 1.7 \times 10^{12}$: too big for 32 bits, fine for 64. In Rust you'll use `i64` for these sums. Checking the worst case like this is a habit worth keeping.

## Which features?

Compute features for every window and look at how well each one separates the gestures:

```python
import math
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

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
rows = []
for window, w in df.groupby("window"):
    counts = np.round(w[["ax", "ay", "az"]].to_numpy() * 16384).astype(int)
    rows.append(features(counts) + [w.gesture.iloc[0]])
feats = pd.DataFrame(rows, columns=["std_x", "std_y", "std_z", "zc_x", "zc_y", "gesture"])
print(feats.groupby("gesture").mean().round(0))

fig, ax = plt.subplots(figsize=(6, 4))
for gesture, group in feats.groupby("gesture"):
    ax.scatter(group.std_x, group.zc_x, label=gesture, s=14)
ax.set_xlabel("N × std of x (counts)")
ax.set_ylabel("zero crossings of x")
ax.legend()
plt.show()
```

The scatter plot shows four fairly clear clusters from just two numbers. The remaining features help with the hard cases: circle versus wave (circle moves y as much as x; wave mostly x).

We'll use these five features from now on: `[std_x, std_y, std_z, zc_x, zc_y]`, all as `N × std` and crossing counts.

## Practice

:::exercise tinyml-sliding-windows Sliding windows
Write `sliding_windows(samples, size, step)` that returns a list of windows (each a list of `size` consecutive samples) starting at positions 0, `step`, `2 × step`, ... Only complete windows are returned.

@@starter
def sliding_windows(samples, size, step):
    pass

@@solution
def sliding_windows(samples, size, step):
    return [list(samples[start:start + size]) for start in range(0, len(samples) - size + 1, step)]

@@tests
def test_overlapping():
    """Size 4, step 2"""
    assert sliding_windows(list(range(8)), 4, 2) == [[0, 1, 2, 3], [2, 3, 4, 5], [4, 5, 6, 7]]

def test_incomplete_dropped():
    """An incomplete last window is dropped"""
    assert sliding_windows(list(range(7)), 4, 2) == [[0, 1, 2, 3], [2, 3, 4, 5]]

def test_non_overlapping():
    """Step equal to size gives back-to-back windows"""
    assert sliding_windows("abcdef", 3, 3) == [["a", "b", "c"], ["d", "e", "f"]]

def test_too_short():
    """Too few samples, no windows"""
    assert sliding_windows([1, 2], 3, 1) == []

@@hint
Windows start at `range(0, len(samples) - size + 1, step)`.
:::

:::exercise tinyml-integer-features Integer features
Write `features(counts)` for one window. `counts` is a list of `N = 40` tuples `(x, y, z)` of integers. Return the list `[std_x, std_y, std_z, zc_x, zc_y]` where each `std` is `isqrt(N × Σv² − (Σv)²)` for that axis and each `zc` is the number of mean crossings: neighbouring samples where `N × v − Σv` changes sign (a product below zero).

Use only integer arithmetic (`math.isqrt`, no floats).

@@starter
import math

N = 40

def features(counts):
    pass

@@solution
import math

N = 40

def features(counts):
    axes = list(zip(*counts))
    out = []
    for x in axes:
        s = sum(x)
        sq = sum(v * v for v in x)
        out.append(math.isqrt(N * sq - s * s))
    for x in axes[:2]:
        s = sum(x)
        d = [N * v - s for v in x]
        out.append(sum(1 for a, b in zip(d, d[1:]) if a * b < 0))
    return out

@@tests
import math

def test_still():
    """A sensor lying still has zero spread and no crossings"""
    counts = [(0, 0, 16384)] * 40
    assert features(counts) == [0, 0, 0, 0, 0]

def test_square_wave():
    """A square wave of ±1000 counts on x"""
    counts = [(1000 if (i // 5) % 2 == 0 else -1000, 0, 16384) for i in range(40)]
    # std is exactly 1000, so N × std = 40000; the sign flips every 5 samples: 7 crossings
    assert features(counts) == [40000, 0, 0, 7, 0]

def test_integers_only():
    """Returns plain integers"""
    counts = [(i * 37 % 1000, -i * 11, 16000 + i) for i in range(40)]
    result = features(counts)
    assert all(isinstance(v, int) for v in result), result
    assert result[2] == math.isqrt(40 * sum((16000 + i) ** 2 for i in range(40)) - sum(16000 + i for i in range(40)) ** 2)

def test_real_window():
    """Matches the reference on a real circle window"""
    import pandas as pd
    df = pd.read_csv("data/gestures.csv")
    w = df[df.window == 0]
    counts = [tuple(int(round(v * 16384)) for v in row) for row in w[["ax", "ay", "az"]].to_numpy()]
    assert features(counts) == [275593, 193013, 35417, 4, 3]

@@hint
`list(zip(*counts))` turns 40 `(x, y, z)` tuples into three lists: all the x values, all the y values and all the z values.
:::

:::quiz tinyml-features-check Quick check
? Why compute features from raw sensor counts instead of converting to g first?
- [x] Converting every sample to a float is slow on a microcontroller without an FPU, and the counts are exact integers
- [ ] Counts are more accurate than g
- [ ] Models can't learn from g
> Scaling by 1/16384 changes nothing once features are standardised.

? Why compare N·x with Σx instead of x with the mean?
- [ ] It's more accurate
- [x] It has the same sign, and avoids a division
> Integer-only, exact, and fast.

? What does overlapping windows (step smaller than size) buy you?
- [x] Faster reactions to new gestures, at the cost of more computation
- [ ] More accurate labels
- [ ] Less memory
> With step 10 at 25 Hz, the device classifies every 0.4 s.
:::
