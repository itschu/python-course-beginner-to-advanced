---
title: "Project: an end-to-end gesture recogniser"
summary: Train, quantize and export the gesture model in Python, then implement the complete integer pipeline in Rust and prove it matches Python on real windows, ready for a Pico.
minutes: 120
kind: project
language: rust
---

This project joins the whole course together: Python data work and modelling (Phases 3 to 7), Rust (Phases 9 to 11) and embedded systems (Phase 12). You'll ship a gesture recogniser whose firmware logic is fully tested on your laptop before it ever touches a board.

```text
 Python (training machine)                                Rust (firmware)
 ───────────────────────────                              ──────────────────────────────────
 gestures.csv ─► features ─► MLP 5-8-4 ─► int8 ─► model.rs ─► features ─► quantized MLP ─► class
                                  │                            ▲
                                  └──── check vectors ─────────┘   tests prove both sides agree
```

## Step 0: train and export

Run this cell. It's lessons 2 to 5 in one place: features, training, calibration, quantization and export, plus **check vectors** (test windows' features and the integer logits Python computes for them):

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

W1, b1, W2, b2 = mlp.coefs_[0].T, mlp.intercepts_[0], mlp.coefs_[1].T, mlp.intercepts_[1]
Z = scaler.transform(X_train)
s_x, s_w1, s_w2 = np.abs(Z).max() / 127, np.abs(W1).max() / 127, np.abs(W2).max() / 127
s_h = np.maximum(0, Z @ W1.T + b1).max() / 127
mean_q = np.round(scaler.mean_).astype(int)
in_mult = np.round((1 << SHIFT) / (scaler.scale_ * s_x)).astype(int)
w1_q, b1_q = np.round(W1 / s_w1).astype(int), np.round(b1 / (s_x * s_w1)).astype(int)
w2_q, b2_q = np.round(W2 / s_w2).astype(int), np.round(b2 / (s_h * s_w2)).astype(int)
h_mult = int(round((1 << SHIFT) * s_x * s_w1 / s_h))

def logits_int(f):
    xq = [max(-127, min(127, ((int(f[j]) - int(mean_q[j])) * int(in_mult[j]) + ROUND) >> SHIFT)) for j in range(5)]
    h = [max(0, min(127, (max(int(b1_q[k]) + sum(int(w1_q[k, j]) * xq[j] for j in range(5)), 0) * h_mult + ROUND) >> SHIFT))
         for k in range(8)]
    return [int(b2_q[c]) + sum(int(w2_q[c, k]) * h[k] for k in range(8)) for c in range(4)]

int_pred = np.array([mlp.classes_[int(np.argmax(logits_int(f)))] for f in X_test])
print(f"int8 test accuracy {(int_pred == y_test).mean():.3f}   (float {mlp.score(scaler.transform(X_test), y_test):.3f})")

def rust(name, arr, ty):
    arr = np.asarray(arr)
    if arr.ndim == 1:
        return f"const {name}: [{ty}; {len(arr)}] = [{', '.join(str(int(v)) for v in arr)}];"
    rows = "".join("    [" + ", ".join(str(int(v)) for v in r) + "],\n" for r in arr)
    return f"const {name}: [[{ty}; {arr.shape[1]}]; {arr.shape[0]}] = [\n{rows}];"

print("\n// ---- model.rs ----")
print(f"const CLASSES: [&str; 4] = [{', '.join(chr(34) + c + chr(34) for c in mlp.classes_)}];")
print(f"const H_MULT: i64 = {h_mult};")
for name, arr, ty in [("MEAN", mean_q, "i64"), ("IN_MULT", in_mult, "i64"), ("W1", w1_q, "i8"),
                      ("B1", b1_q, "i32"), ("W2", w2_q, "i8"), ("B2", b2_q, "i32")]:
    print(rust(name, arr, ty))
print("\n// ---- check vectors: features -> integer logits ----")
for f in X_test[:4]:
    print(f"// {list(map(int, f))} -> {logits_int(f)}")
```

The constants in the exercises below were produced by this cell. (Training runs in your browser's Python; if a weight ever differs by one in the last place, that's floating-point noise between Python builds, and the exercises' fixed constants and check vectors are what count.)

## Step 1: the model in Rust

:::exercise proj-tinyml-predict Integer inference with the real model
The exported model is in the starter. Implement:

- `predict_logits(f: &[i64; 5]) -> [i32; 4]`: quantize the input (`clamp(((f − MEAN) × IN_MULT + ROUND) >> SHIFT, −127, 127)`), run the hidden layer with ReLU and requantization (`H_MULT`, clamp 0 to 127), then the output layer. Return the output accumulators (the logits).
- `classify(f: &[i64; 5]) -> &'static str`: the name of the class with the largest logit (the first on ties).

The tests compare with the logits Python computed, exactly.

@@starter
const CLASSES: [&str; 4] = ["circle", "idle", "shake", "wave"];
const SHIFT: u32 = 24;
const ROUND: i64 = 1 << (SHIFT - 1);
const H_MULT: i64 = 77812;
const MEAN: [i64; 5] = [227410, 93876, 43624, 9, 12];
const IN_MULT: [i64; 5] = [4354, 9378, 29306, 107070403, 100735708];
const W1: [[i8; 5]; 8] = [
    [-39, -69, 29, 19, 60],
    [103, 8, -30, 105, 45],
    [-46, 54, -71, -120, -36],
    [20, 9, -56, -33, -5],
    [-114, -111, 98, -22, 63],
    [-127, 49, 39, 101, 36],
    [-90, -95, -63, -19, -37],
    [10, -44, 96, -86, 0],
];
const B1: [i32; 8] = [3834, 4523, 968, 973, 257, 180, 1071, 1225];
const W2: [[i8; 8]; 4] = [
    [-67, -91, 97, -26, -120, 27, -29, 19],
    [-22, -116, -64, -41, 70, 63, 91, -105],
    [-46, 54, -46, 3, -30, -23, -43, -32],
    [35, -117, -44, -73, 51, -127, -47, 104],
];
const B2: [i32; 4] = [1712, -653, 430, -17];

fn predict_logits(f: &[i64; 5]) -> [i32; 4] {
    todo!()
}

fn classify(f: &[i64; 5]) -> &'static str {
    todo!()
}

@@solution
const CLASSES: [&str; 4] = ["circle", "idle", "shake", "wave"];
const SHIFT: u32 = 24;
const ROUND: i64 = 1 << (SHIFT - 1);
const H_MULT: i64 = 77812;
const MEAN: [i64; 5] = [227410, 93876, 43624, 9, 12];
const IN_MULT: [i64; 5] = [4354, 9378, 29306, 107070403, 100735708];
const W1: [[i8; 5]; 8] = [
    [-39, -69, 29, 19, 60],
    [103, 8, -30, 105, 45],
    [-46, 54, -71, -120, -36],
    [20, 9, -56, -33, -5],
    [-114, -111, 98, -22, 63],
    [-127, 49, 39, 101, 36],
    [-90, -95, -63, -19, -37],
    [10, -44, 96, -86, 0],
];
const B1: [i32; 8] = [3834, 4523, 968, 973, 257, 180, 1071, 1225];
const W2: [[i8; 8]; 4] = [
    [-67, -91, 97, -26, -120, 27, -29, 19],
    [-22, -116, -64, -41, 70, 63, 91, -105],
    [-46, 54, -46, 3, -30, -23, -43, -32],
    [35, -117, -44, -73, 51, -127, -47, 104],
];
const B2: [i32; 4] = [1712, -653, 430, -17];

fn predict_logits(f: &[i64; 5]) -> [i32; 4] {
    let mut x = [0i32; 5];
    for j in 0..5 {
        x[j] = (((f[j] - MEAN[j]) * IN_MULT[j] + ROUND) >> SHIFT).clamp(-127, 127) as i32;
    }
    let mut h = [0i32; 8];
    for k in 0..8 {
        let mut acc = B1[k];
        for j in 0..5 {
            acc += W1[k][j] as i32 * x[j];
        }
        h[k] = ((acc.max(0) as i64 * H_MULT + ROUND) >> SHIFT).clamp(0, 127) as i32;
    }
    let mut logits = B2;
    for c in 0..4 {
        for k in 0..8 {
            logits[c] += W2[c][k] as i32 * h[k];
        }
    }
    logits
}

fn classify(f: &[i64; 5]) -> &'static str {
    let logits = predict_logits(f);
    let mut best = 0;
    for c in 1..4 {
        if logits[c] > logits[best] {
            best = c;
        }
    }
    CLASSES[best]
}

@@tests
/// Matches Python's integer logits on test windows, exactly
#[test]
fn matches_python() {
    let checks: [([i64; 5], [i32; 4]); 4] = [
        ([299475, 37553, 77444, 6, 9], [-3585, -4918, -2768, 6426]),
        ([358022, 79816, 17869, 21, 22], [-8592, -11320, 3607, -12375]),
        ([292853, 41468, 76894, 4, 17], [-6319, -4878, -3690, 7641]),
        ([133097, 103763, 47720, 3, 11], [1528, -3101, -3540, 1067]),
    ];
    for (f, want) in checks {
        assert_eq!(predict_logits(&f), want, "features {f:?}");
    }
}

/// Classifies one window of each gesture
#[test]
fn classifies() {
    assert_eq!(classify(&[262777, 266087, 18010, 3, 2]), "circle");
    assert_eq!(classify(&[54083, 39342, 48035, 16, 19]), "idle");
    assert_eq!(classify(&[624226, 194609, 23784, 19, 19]), "shake");
    assert_eq!(classify(&[299475, 37553, 77444, 6, 9]), "wave");
}

/// Quantization flips this circle to a wave, exactly as in the Python int8 reference
#[test]
fn same_mistake_as_python() {
    assert_eq!(classify(&[125848, 55737, 40576, 2, 9]), "wave");
}

@@hint
Follow lesson 6: quantize the five inputs, then the hidden layer (`acc = B1[k] + Σ W1[k][j] × x[j]`, then `((acc.max(0) as i64 × H_MULT + ROUND) >> SHIFT).clamp(0, 127)`), then the output layer starting from `B2`.

@@hint
Cast every `i8` weight to `i32` before multiplying.
:::

Notice the last test: the Rust firmware makes **the same mistake** as the Python int8 reference on the one misclassified test window. That's what "bit-exact" buys you: any difference you see on the device is a real-world data problem, never an implementation bug.

## Step 2: from raw samples to a gesture, with a boot self-test

:::exercise proj-tinyml-end-to-end The complete pipeline and a self-test
The feature code (lesson 6) and the model from step 1 are included. Write:

- `classify_window(window: &[[i16; 3]; N]) -> &'static str`: features, then `classify`.
- `self_test() -> bool`: firmware runs this at boot. It returns `true` only if `classify_window(&CHECK_WINDOW)` is `"circle"` **and** `features(&CHECK_WINDOW)` equals `CHECK_FEATURES`. On a device, a `false` would light an error LED instead of running a broken model.

@@starter
const CLASSES: [&str; 4] = ["circle", "idle", "shake", "wave"];
const SHIFT: u32 = 24;
const ROUND: i64 = 1 << (SHIFT - 1);
const H_MULT: i64 = 77812;
const MEAN: [i64; 5] = [227410, 93876, 43624, 9, 12];
const IN_MULT: [i64; 5] = [4354, 9378, 29306, 107070403, 100735708];
const W1: [[i8; 5]; 8] = [
    [-39, -69, 29, 19, 60],
    [103, 8, -30, 105, 45],
    [-46, 54, -71, -120, -36],
    [20, 9, -56, -33, -5],
    [-114, -111, 98, -22, 63],
    [-127, 49, 39, 101, 36],
    [-90, -95, -63, -19, -37],
    [10, -44, 96, -86, 0],
];
const B1: [i32; 8] = [3834, 4523, 968, 973, 257, 180, 1071, 1225];
const W2: [[i8; 8]; 4] = [
    [-67, -91, 97, -26, -120, 27, -29, 19],
    [-22, -116, -64, -41, 70, 63, 91, -105],
    [-46, 54, -46, 3, -30, -23, -43, -32],
    [35, -117, -44, -73, 51, -127, -47, 104],
];
const B2: [i32; 4] = [1712, -653, 430, -17];

const N: usize = 40;

fn isqrt(n: u64) -> u64 {
    if n < 2 {
        return n;
    }
    let (mut x, mut y) = (n, n / 2 + 1);
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

fn features(window: &[[i16; 3]; N]) -> [i64; 5] {
    let mut out = [0i64; 5];
    let mut sums = [0i64; 3];
    for axis in 0..3 {
        let (mut sum, mut sum_sq) = (0i64, 0i64);
        for s in window {
            let v = s[axis] as i64;
            sum += v;
            sum_sq += v * v;
        }
        sums[axis] = sum;
        out[axis] = isqrt((N as i64 * sum_sq - sum * sum) as u64) as i64;
    }
    for axis in 0..2 {
        out[3 + axis] = window
            .windows(2)
            .filter(|p| (N as i64 * p[0][axis] as i64 - sums[axis]) * (N as i64 * p[1][axis] as i64 - sums[axis]) < 0)
            .count() as i64;
    }
    out
}

fn predict_logits(f: &[i64; 5]) -> [i32; 4] {
    let mut x = [0i32; 5];
    for j in 0..5 {
        x[j] = (((f[j] - MEAN[j]) * IN_MULT[j] + ROUND) >> SHIFT).clamp(-127, 127) as i32;
    }
    let mut h = [0i32; 8];
    for k in 0..8 {
        let mut acc = B1[k];
        for j in 0..5 {
            acc += W1[k][j] as i32 * x[j];
        }
        h[k] = ((acc.max(0) as i64 * H_MULT + ROUND) >> SHIFT).clamp(0, 127) as i32;
    }
    let mut logits = B2;
    for c in 0..4 {
        for k in 0..8 {
            logits[c] += W2[c][k] as i32 * h[k];
        }
    }
    logits
}

fn classify(f: &[i64; 5]) -> &'static str {
    let logits = predict_logits(f);
    let mut best = 0;
    for c in 1..4 {
        if logits[c] > logits[best] {
            best = c;
        }
    }
    CLASSES[best]
}

const CHECK_WINDOW: [[i16; 3]; N] = [[-5980, 5226, 13238], [-6160, 5816, 16466], [-7111, 10748, 12632], [-5849, 9519, 14270], [-5194, 11010, 14582], [-1589, 11600, 17105], [-16, 11731, 15008], [918, 13713, 14516], [770, 13844, 14729], [3867, 13402, 15270], [5636, 11616, 14451], [5718, 10895, 14598], [5997, 10781, 14844], [9437, 9060, 15254], [10666, 8962, 16351], [11026, 9552, 15483], [10764, 7946, 14893], [11747, 5046, 15385], [10699, 5489, 14860], [11944, 4522, 15352], [10174, 2343, 15221], [8995, 1393, 16630], [7012, 492, 15008], [8028, 836, 14877], [4538, -1753, 15024], [1475, -164, 15794], [1688, -1294, 15729], [-1540, -2064, 16613], [-3801, 1098, 15090], [-5620, -1114, 14631], [-5210, 590, 14107], [-7684, 2114, 14500], [-6963, 3539, 14746], [-7455, 5767, 15254], [-9159, 4440, 15303], [-6029, 6930, 16253], [-5587, 8716, 15958], [-7438, 8700, 15090], [-4014, 11256, 15499], [-2490, 12419, 13631]];
const CHECK_FEATURES: [i64; 5] = [275593, 193013, 35417, 4, 3];

fn classify_window(window: &[[i16; 3]; N]) -> &'static str {
    todo!()
}

fn self_test() -> bool {
    todo!()
}

@@solution
const CLASSES: [&str; 4] = ["circle", "idle", "shake", "wave"];
const SHIFT: u32 = 24;
const ROUND: i64 = 1 << (SHIFT - 1);
const H_MULT: i64 = 77812;
const MEAN: [i64; 5] = [227410, 93876, 43624, 9, 12];
const IN_MULT: [i64; 5] = [4354, 9378, 29306, 107070403, 100735708];
const W1: [[i8; 5]; 8] = [
    [-39, -69, 29, 19, 60],
    [103, 8, -30, 105, 45],
    [-46, 54, -71, -120, -36],
    [20, 9, -56, -33, -5],
    [-114, -111, 98, -22, 63],
    [-127, 49, 39, 101, 36],
    [-90, -95, -63, -19, -37],
    [10, -44, 96, -86, 0],
];
const B1: [i32; 8] = [3834, 4523, 968, 973, 257, 180, 1071, 1225];
const W2: [[i8; 8]; 4] = [
    [-67, -91, 97, -26, -120, 27, -29, 19],
    [-22, -116, -64, -41, 70, 63, 91, -105],
    [-46, 54, -46, 3, -30, -23, -43, -32],
    [35, -117, -44, -73, 51, -127, -47, 104],
];
const B2: [i32; 4] = [1712, -653, 430, -17];

const N: usize = 40;

fn isqrt(n: u64) -> u64 {
    if n < 2 {
        return n;
    }
    let (mut x, mut y) = (n, n / 2 + 1);
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

fn features(window: &[[i16; 3]; N]) -> [i64; 5] {
    let mut out = [0i64; 5];
    let mut sums = [0i64; 3];
    for axis in 0..3 {
        let (mut sum, mut sum_sq) = (0i64, 0i64);
        for s in window {
            let v = s[axis] as i64;
            sum += v;
            sum_sq += v * v;
        }
        sums[axis] = sum;
        out[axis] = isqrt((N as i64 * sum_sq - sum * sum) as u64) as i64;
    }
    for axis in 0..2 {
        out[3 + axis] = window
            .windows(2)
            .filter(|p| (N as i64 * p[0][axis] as i64 - sums[axis]) * (N as i64 * p[1][axis] as i64 - sums[axis]) < 0)
            .count() as i64;
    }
    out
}

fn predict_logits(f: &[i64; 5]) -> [i32; 4] {
    let mut x = [0i32; 5];
    for j in 0..5 {
        x[j] = (((f[j] - MEAN[j]) * IN_MULT[j] + ROUND) >> SHIFT).clamp(-127, 127) as i32;
    }
    let mut h = [0i32; 8];
    for k in 0..8 {
        let mut acc = B1[k];
        for j in 0..5 {
            acc += W1[k][j] as i32 * x[j];
        }
        h[k] = ((acc.max(0) as i64 * H_MULT + ROUND) >> SHIFT).clamp(0, 127) as i32;
    }
    let mut logits = B2;
    for c in 0..4 {
        for k in 0..8 {
            logits[c] += W2[c][k] as i32 * h[k];
        }
    }
    logits
}

fn classify(f: &[i64; 5]) -> &'static str {
    let logits = predict_logits(f);
    let mut best = 0;
    for c in 1..4 {
        if logits[c] > logits[best] {
            best = c;
        }
    }
    CLASSES[best]
}

const CHECK_WINDOW: [[i16; 3]; N] = [[-5980, 5226, 13238], [-6160, 5816, 16466], [-7111, 10748, 12632], [-5849, 9519, 14270], [-5194, 11010, 14582], [-1589, 11600, 17105], [-16, 11731, 15008], [918, 13713, 14516], [770, 13844, 14729], [3867, 13402, 15270], [5636, 11616, 14451], [5718, 10895, 14598], [5997, 10781, 14844], [9437, 9060, 15254], [10666, 8962, 16351], [11026, 9552, 15483], [10764, 7946, 14893], [11747, 5046, 15385], [10699, 5489, 14860], [11944, 4522, 15352], [10174, 2343, 15221], [8995, 1393, 16630], [7012, 492, 15008], [8028, 836, 14877], [4538, -1753, 15024], [1475, -164, 15794], [1688, -1294, 15729], [-1540, -2064, 16613], [-3801, 1098, 15090], [-5620, -1114, 14631], [-5210, 590, 14107], [-7684, 2114, 14500], [-6963, 3539, 14746], [-7455, 5767, 15254], [-9159, 4440, 15303], [-6029, 6930, 16253], [-5587, 8716, 15958], [-7438, 8700, 15090], [-4014, 11256, 15499], [-2490, 12419, 13631]];
const CHECK_FEATURES: [i64; 5] = [275593, 193013, 35417, 4, 3];

fn classify_window(window: &[[i16; 3]; N]) -> &'static str {
    classify(&features(window))
}

fn self_test() -> bool {
    features(&CHECK_WINDOW) == CHECK_FEATURES && classify_window(&CHECK_WINDOW) == "circle"
}

@@tests
/// The boot self-test passes
#[test]
fn boot_check() {
    assert!(self_test());
}

/// A still sensor is idle
#[test]
fn still_is_idle() {
    let mut w = [[0i16, 0, 16384]; N];
    // a little sensor noise
    for (i, s) in w.iter_mut().enumerate() {
        s[0] = ((i * 37) % 200) as i16 - 100;
        s[1] = ((i * 53) % 160) as i16 - 80;
    }
    assert_eq!(classify_window(&w), "idle");
}

/// A fast, strong oscillation on x is a shake
#[test]
fn synthetic_shake() {
    let mut w = [[0i16, 0, 16384]; N];
    for (i, s) in w.iter_mut().enumerate() {
        let phase = i % 4;                          // a 6.25 Hz wave at 25 Hz: up, up, down, down
        s[0] = [6000, 12000, -6000, -12000][phase];
        s[1] = [1500, 3000, -1500, -3000][phase];
    }
    assert_eq!(classify_window(&w), "shake");
}

@@hint
`classify_window` is one line: `classify(&features(window))`. Arrays of the same size compare with `==`.
:::

## Running it on a Pico

1. Create an Embassy project for your board (`embassy/examples/rp` is a good template), and add `model.rs` (the constants), `inference.rs` (features, `predict_logits`, the `Smoother` from lesson 7) and the two tasks from lesson 7.
2. Keep `inference.rs` free of hardware code, and copy this project's tests into it: `cargo test` on your laptop must pass before you flash.
3. Call `self_test()` at boot, and blink the LED fast if it fails.
4. Flash with `cargo run --release` and watch the `defmt` log as you wave, shake and draw circles.
5. Record your **own** gestures: log raw windows over USB, label them, add them to the training data, retrain, re-export and reflash. Synthetic data gets you started; your own data makes it work for you.

:::tip Ideas to extend it
- Add a "tap" gesture using the z axis, and a feature for the peak magnitude.
- Replace the hand-designed features with the raw 120 values and a small 1-D convolutional network (train it in PyTorch, Phase 7), quantize it the same way, and compare size, speed and accuracy.
- Send recognised gestures over Bluetooth Low Energy from a Pico W to control music on your phone.
:::
