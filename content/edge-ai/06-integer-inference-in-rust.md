---
title: Integer-only inference in Rust
summary: Write the firmware side in no_std-friendly Rust, with an integer square root, the window features, input quantization, int8 dense layers with requantization, and argmax.
minutes: 60
kind: lesson
language: rust
---

Now the Rust half. Everything in this lesson uses only `core`: fixed-size arrays, integers and loops, no heap and no floats, so it compiles unchanged for the Pico with `#![no_std]`. Each function must reproduce the Python reference from lessons 2 and 4 **bit for bit**.

## Integer square root

Python's `math.isqrt(n)` returns the largest integer `r` with `r² ≤ n`. `f64::sqrt` isn't a safe substitute: it's slow without an FPU, and for large `u64` values the float rounding can give an answer one too high. An integer-only version uses Newton's method:

```rust
fn isqrt(n: u64) -> u64 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = x / 2 + 1;      // not (x + 1) / 2: that overflows for u64::MAX
    while y < x {               // Newton's iteration, decreasing until it settles
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

fn main() {
    for n in [0, 1, 15, 16, 17, 1_000_000, 1_700_000_000_000, u64::MAX] {
        println!("isqrt({n}) = {}", isqrt(n));
    }
}
```

## The window features

With `N = 40` samples of `[x, y, z]` counts as `i16`, compute the sums in `i64` (lesson 2 showed `N·Σx²` can reach about 1.7 × 10¹², far beyond `i32`):

```rust static
const N: usize = 40;

fn features(window: &[[i16; 3]; N]) -> [i64; 5] {
    let mut out = [0i64; 5];
    for axis in 0..3 {
        let (mut sum, mut sum_sq) = (0i64, 0i64);
        for sample in window {
            let v = sample[axis] as i64;
            sum += v;
            sum_sq += v * v;
        }
        out[axis] = isqrt((N as i64 * sum_sq - sum * sum) as u64) as i64;
    }
    // ... zero crossings for axes 0 and 1: you'll write these in the exercise
    out
}
```

## Quantized layers

The three integer operations from lesson 4 translate directly. `i64` intermediates prevent overflow, and `>>` on signed integers floors exactly like Python's, so the results match:

```rust
const SHIFT: u32 = 24;
const ROUND: i64 = 1 << (SHIFT - 1);

/// Standardise and quantize one feature: clamp(((f - mean) * mult + ROUND) >> SHIFT).
fn quantize_input(f: i64, mean: i64, mult: i64) -> i8 {
    (((f - mean) * mult + ROUND) >> SHIFT).clamp(-127, 127) as i8
}

/// int8 × int8 products summed into an i32, plus an i32 bias.
fn dense<const IN: usize, const OUT: usize>(x: &[i8; IN], w: &[[i8; IN]; OUT], b: &[i32; OUT]) -> [i32; OUT] {
    let mut acc = *b;
    for k in 0..OUT {
        for j in 0..IN {
            acc[k] += w[k][j] as i32 * x[j] as i32;
        }
    }
    acc
}

/// ReLU, then scale back down to int8 (0..=127) with a fixed-point multiplier.
fn relu_requantize<const N: usize>(acc: &[i32; N], mult: i64) -> [i8; N] {
    let mut out = [0i8; N];
    for k in 0..N {
        out[k] = ((acc[k].max(0) as i64 * mult + ROUND) >> SHIFT).clamp(0, 127) as i8;
    }
    out
}

fn main() {
    let x = [quantize_input(250_000, 227_410, 4354), quantize_input(3, 9, 107_070_403)];
    println!("quantized input {x:?}");
    let w = [[50, -20], [-100, 30], [10, 10]];
    let acc = dense(&x, &w, &[100, -50, 0]);
    println!("accumulators {acc:?}");
    println!("hidden {:?}", relu_requantize(&acc, 77_812));
}
```

Const generics (Phase 10) make each layer's shape part of its type: `dense::<5, 8>` and `dense::<8, 4>` are separate functions the compiler optimises for their exact sizes, and passing a wrongly shaped weight matrix is a compile error.

How much work is one prediction? The first layer is 5 × 8 = 40 multiply-accumulates, the second 8 × 4 = 32: **72 MACs**. Even the RP2040's Cortex-M0+, which takes a cycle or so per 32-bit multiply, does that in well under 10 microseconds at 125 MHz. The feature extraction (120 samples, a few operations each, plus three square roots) costs more than the network.

## Practice

:::exercise tinyml-rs-features Window features in Rust
Write `isqrt(n: u64) -> u64` (the floor of the square root, exact for every `u64`) and `features(window: &[[i16; 3]; N]) -> [i64; 5]` returning `[std_x, std_y, std_z, zc_x, zc_y]` exactly as defined in lesson 2:

- `std_a = isqrt(N·Σv² − (Σv)²)` for axis `a`
- `zc_a` = the number of neighbouring pairs where `d_i = N·v_i − Σv` and `d_{i+1}` have a negative product

The tests compare with Python's output on real windows.

@@starter
const N: usize = 40;

fn isqrt(n: u64) -> u64 {
    todo!()
}

fn features(window: &[[i16; 3]; N]) -> [i64; 5] {
    todo!()
}

@@solution
const N: usize = 40;

fn isqrt(n: u64) -> u64 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = x / 2 + 1;
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
        for sample in window {
            let v = sample[axis] as i64;
            sum += v;
            sum_sq += v * v;
        }
        sums[axis] = sum;
        out[axis] = isqrt((N as i64 * sum_sq - sum * sum) as u64) as i64;
    }
    for axis in 0..2 {
        let mut crossings = 0;
        for pair in window.windows(2) {
            let a = N as i64 * pair[0][axis] as i64 - sums[axis];
            let b = N as i64 * pair[1][axis] as i64 - sums[axis];
            if a * b < 0 {
                crossings += 1;
            }
        }
        out[3 + axis] = crossings;
    }
    out
}

@@tests
/// isqrt is exact, including the largest u64
#[test]
fn square_roots() {
    for (n, r) in [(0, 0), (1, 1), (15, 3), (16, 4), (17, 4), (1_700_000_000_000, 1_303_840)] {
        assert_eq!(isqrt(n), r, "isqrt({n})");
    }
    assert_eq!(isqrt(u64::MAX), 4_294_967_295);
    let big = 4_294_967_295u64 * 4_294_967_295;
    assert_eq!(isqrt(big), 4_294_967_295);
    assert_eq!(isqrt(big - 1), 4_294_967_294);
}

/// A still sensor has no spread and no crossings
#[test]
fn still() {
    assert_eq!(features(&[[0, 0, 16384]; N]), [0, 0, 0, 0, 0]);
}

/// A square wave on x: N·std = 40000, 7 crossings
#[test]
fn square_wave() {
    let mut w = [[0i16, 0, 16384]; N];
    for (i, s) in w.iter_mut().enumerate() {
        s[0] = if (i / 5) % 2 == 0 { 1000 } else { -1000 };
    }
    assert_eq!(features(&w), [40000, 0, 0, 7, 0]);
}

/// Matches Python on a real circle window (window 0 of gestures.csv)
#[test]
fn real_window() {
    let w: [[i16; 3]; N] = [[-5980, 5226, 13238], [-6160, 5816, 16466], [-7111, 10748, 12632], [-5849, 9519, 14270], [-5194, 11010, 14582], [-1589, 11600, 17105], [-16, 11731, 15008], [918, 13713, 14516], [770, 13844, 14729], [3867, 13402, 15270], [5636, 11616, 14451], [5718, 10895, 14598], [5997, 10781, 14844], [9437, 9060, 15254], [10666, 8962, 16351], [11026, 9552, 15483], [10764, 7946, 14893], [11747, 5046, 15385], [10699, 5489, 14860], [11944, 4522, 15352], [10174, 2343, 15221], [8995, 1393, 16630], [7012, 492, 15008], [8028, 836, 14877], [4538, -1753, 15024], [1475, -164, 15794], [1688, -1294, 15729], [-1540, -2064, 16613], [-3801, 1098, 15090], [-5620, -1114, 14631], [-5210, 590, 14107], [-7684, 2114, 14500], [-6963, 3539, 14746], [-7455, 5767, 15254], [-9159, 4440, 15303], [-6029, 6930, 16253], [-5587, 8716, 15958], [-7438, 8700, 15090], [-4014, 11256, 15499], [-2490, 12419, 13631]];
    assert_eq!(features(&w), [275593, 193013, 35417, 4, 3]);
}

@@hint
Newton's method for isqrt: start with `x = n` and `y = n / 2 + 1`, then repeat `x = y; y = (x + n / x) / 2` while `y < x`. (Writing `(n + 1) / 2` would overflow for `u64::MAX`.)

@@hint
For crossings, `window.windows(2)` gives each neighbouring pair of samples. Remember each axis's sum from the first loop.
:::

:::exercise tinyml-rs-layers Quantized layers and argmax
Write the generic building blocks:

- `quantize_input<const N: usize>(f: &[i64; N], mean: &[i64; N], mult: &[i64; N]) -> [i8; N]`
- `dense<const IN: usize, const OUT: usize>(x: &[i8; IN], w: &[[i8; IN]; OUT], b: &[i32; OUT]) -> [i32; OUT]`
- `relu_requantize<const N: usize>(acc: &[i32; N], mult: i64) -> [i8; N]` (result clamped to 0..=127)
- `argmax<const N: usize>(values: &[i32; N]) -> usize` (the first index on ties)

with `SHIFT = 24` and rounding `+ (1 << 23)` before each shift, as in the lesson. Inputs are clamped to -127..=127.

@@starter
const SHIFT: u32 = 24;
const ROUND: i64 = 1 << (SHIFT - 1);

fn quantize_input<const N: usize>(f: &[i64; N], mean: &[i64; N], mult: &[i64; N]) -> [i8; N] {
    todo!()
}

fn dense<const IN: usize, const OUT: usize>(x: &[i8; IN], w: &[[i8; IN]; OUT], b: &[i32; OUT]) -> [i32; OUT] {
    todo!()
}

fn relu_requantize<const N: usize>(acc: &[i32; N], mult: i64) -> [i8; N] {
    todo!()
}

fn argmax<const N: usize>(values: &[i32; N]) -> usize {
    todo!()
}

@@solution
const SHIFT: u32 = 24;
const ROUND: i64 = 1 << (SHIFT - 1);

fn quantize_input<const N: usize>(f: &[i64; N], mean: &[i64; N], mult: &[i64; N]) -> [i8; N] {
    let mut out = [0i8; N];
    for j in 0..N {
        out[j] = (((f[j] - mean[j]) * mult[j] + ROUND) >> SHIFT).clamp(-127, 127) as i8;
    }
    out
}

fn dense<const IN: usize, const OUT: usize>(x: &[i8; IN], w: &[[i8; IN]; OUT], b: &[i32; OUT]) -> [i32; OUT] {
    let mut acc = *b;
    for k in 0..OUT {
        for j in 0..IN {
            acc[k] += w[k][j] as i32 * x[j] as i32;
        }
    }
    acc
}

fn relu_requantize<const N: usize>(acc: &[i32; N], mult: i64) -> [i8; N] {
    let mut out = [0i8; N];
    for k in 0..N {
        out[k] = ((acc[k].max(0) as i64 * mult + ROUND) >> SHIFT).clamp(0, 127) as i8;
    }
    out
}

fn argmax<const N: usize>(values: &[i32; N]) -> usize {
    let mut best = 0;
    for i in 1..N {
        if values[i] > values[best] {
            best = i;
        }
    }
    best
}

@@tests
/// Standardises and quantizes, matching Python
#[test]
fn inputs() {
    let q = quantize_input(&[299475, 37553, 77444, 6, 9], &[227410, 93876, 43624, 9, 12], &[4354, 9378, 29306, 107070403, 100735708]);
    assert_eq!(q, [19, -31, 59, -19, -18]);
}

/// Inputs are clamped to ±127
#[test]
fn input_clamp() {
    assert_eq!(quantize_input(&[1_000_000, -1_000_000], &[0, 0], &[1 << 24, 1 << 24]), [127, -127]);
}

/// Integer dense layer
#[test]
fn dense_layer() {
    let acc = dense(&[1, -2, 3], &[[10, 20, 30], [-1, 0, 1]], &[100, -5]);
    assert_eq!(acc, [160, -3]);
}

/// No overflow at the extremes: 127 × -127 × 64 inputs fits in i32
#[test]
fn dense_extremes() {
    let acc = dense(&[127i8; 64], &[[-127i8; 64]; 1], &[0]);
    assert_eq!(acc, [-127 * 127 * 64]);
}

/// ReLU then requantize, rounding to nearest
#[test]
fn requantize() {
    let half = 1i64 << 23;
    assert_eq!(relu_requantize(&[10, 11, -40, 1000], half), [5, 6, 0, 127]);
}

/// argmax picks the first of equal maxima
#[test]
fn arg_max() {
    assert_eq!(argmax(&[3, 9, 2, 9]), 1);
    assert_eq!(argmax(&[-5, -2, -9]), 1);
}

@@hint
Cast before multiplying: `w[k][j] as i32 * x[j] as i32` (an `i8 * i8` product would overflow `i8`). For requantization, widen to `i64`.
:::

:::quiz tinyml-rs-check Quick check
? Why compute the window sums in i64?
- [ ] i64 is faster
- [x] N·Σx² can reach about 1.7 × 10¹², which overflows i32
- [ ] Rust requires it
> Always check the worst case for every intermediate value.

? Why is `x >> 24` on a negative i64 in Rust consistent with Python's `>>`?
- [x] Both are arithmetic shifts that round toward negative infinity
- [ ] Neither works on negative numbers
- [ ] Rust rounds toward zero, so they differ
> That's why the + 2²³ rounding gives identical results in both languages.

? How many multiply-accumulates does the 5-8-4 network need per prediction?
- [ ] 84
- [x] 72
- [ ] 12
> 5 × 8 + 8 × 4. Biases are additions, not MACs.
:::
