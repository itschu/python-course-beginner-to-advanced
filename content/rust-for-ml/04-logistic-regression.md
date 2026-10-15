---
title: Logistic regression and evaluation
summary: Train a classifier that outputs probabilities, measure it with log loss and accuracy, and extend it to three classes with softmax.
minutes: 55
kind: lesson
language: rust
---

Linear regression predicts a number. To predict a **probability** (will the home team win?), squash the linear score through the **sigmoid** function, $\sigma(z) = 1 / (1 + e^{-z})$, which maps any number to between 0 and 1.

## Sigmoid without overflow

`(-z).exp()` overflows to infinity for very negative `z` (say −1000), giving `1 / inf = 0`, which is fine, but `z.exp()` in other formulas can produce `inf / inf = NaN`. A numerically careful version:

```rust
fn sigmoid(z: f64) -> f64 {
    if z >= 0.0 {
        1.0 / (1.0 + (-z).exp())
    } else {
        let e = z.exp();
        e / (1.0 + e)
    }
}

fn main() {
    for z in [-1000.0, -2.0, 0.0, 2.0, 1000.0] {
        println!("sigmoid({z}) = {}", sigmoid(z));
    }
}
```

## Log loss

Classification models are trained to minimise **log loss** (cross-entropy), the metric you used for match predictions in Phase 6. For a true label $y \in \{0, 1\}$ and predicted probability $p$:

$$
L = -\big(y \log p + (1 - y) \log(1 - p)\big)
$$

Confident wrong answers are punished heavily. Clamp `p` away from exactly 0 and 1, otherwise `ln(0)` is −∞.

The gradient of log loss through the sigmoid is beautifully simple: $\partial L / \partial z = p - y$. So the training loop looks almost exactly like linear regression's, with `p - y` in place of `prediction - y`.

## Training a classifier

Here's a complete training run on a synthetic dataset: will a team win, given its rating advantage and recent form?

```rust
fn sigmoid(z: f64) -> f64 {
    if z >= 0.0 { 1.0 / (1.0 + (-z).exp()) } else { let e = z.exp(); e / (1.0 + e) }
}

/// A tiny deterministic random generator (xorshift), so we need no crates.
struct Rng(u64);
impl Rng {
    fn uniform(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

fn main() {
    // features: [rating advantage, form], label: did they win?
    let mut rng = Rng(7);
    let mut xs = Vec::new();
    let mut ys = Vec::new();
    for _ in 0..400 {
        let x = [rng.uniform() * 4.0 - 2.0, rng.uniform() * 2.0 - 1.0];
        let p_true = sigmoid(1.5 * x[0] + 0.8 * x[1] - 0.2);
        ys.push(if rng.uniform() < p_true { 1.0 } else { 0.0 });
        xs.push(x);
    }

    let (mut w, mut b) = ([0.0_f64; 2], 0.0_f64);
    let lr = 0.5;
    for epoch in 0..=300 {
        let (mut gw, mut gb, mut loss) = ([0.0; 2], 0.0, 0.0);
        for (x, &y) in xs.iter().zip(&ys) {
            let p = sigmoid(w[0] * x[0] + w[1] * x[1] + b);
            let pc = p.clamp(1e-12, 1.0 - 1e-12);
            loss -= y * pc.ln() + (1.0 - y) * (1.0 - pc).ln();
            let err = p - y;                       // the gradient with respect to z
            gw[0] += err * x[0];
            gw[1] += err * x[1];
            gb += err;
        }
        let n = ys.len() as f64;
        w[0] -= lr * gw[0] / n;
        w[1] -= lr * gw[1] / n;
        b -= lr * gb / n;
        if epoch % 100 == 0 {
            println!("epoch {epoch:>3}: log loss {:.4}", loss / n);
        }
    }
    println!("learned w = [{:.2}, {:.2}], b = {:.2}  (true: [1.5, 0.8], -0.2)", w[0], w[1], b);
}
```

With 400 noisy samples, the learned weights land close to the true ones, but not exactly: that's sampling noise, the same reason your Phase 5 models' coefficients wobbled between train/test splits.

## Three classes: softmax

Football has three outcomes. **Multinomial** logistic regression has one weight vector per class, and **softmax** turns the three scores into probabilities that sum to 1:

$$
p_k = \frac{e^{z_k}}{\sum_j e^{z_j}}
$$

Subtract the largest score before exponentiating so nothing overflows; it doesn't change the result:

```rust
fn softmax(z: &[f64]) -> Vec<f64> {
    let max = z.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let exps: Vec<f64> = z.iter().map(|v| (v - max).exp()).collect();
    let total: f64 = exps.iter().sum();
    exps.iter().map(|e| e / total).collect()
}

fn main() {
    println!("{:.3?}", softmax(&[2.0, 1.0, 0.1]));
    println!("{:.3?}", softmax(&[1000.0, 999.0, 998.0]));   // no overflow
}
```

This is exactly what scikit-learn's `LogisticRegression.predict_proba` computes for three classes, and what you'll reproduce in the project at the end of this phase.

## Practice

:::exercise rml-logistic-metrics Classification metrics
Write:

- `log_loss(ys: &[f64], ps: &[f64]) -> f64`: the mean log loss, clamping each `p` to `[1e-15, 1 − 1e-15]`
- `accuracy(ys: &[f64], ps: &[f64]) -> f64`: the fraction where `p >= 0.5` matches `y == 1.0`
- `confusion(ys: &[f64], ps: &[f64]) -> [[u32; 2]; 2]`: `matrix[actual][predicted]`, with class 1 meaning `y == 1.0` / `p >= 0.5`

@@starter
fn log_loss(ys: &[f64], ps: &[f64]) -> f64 {
    todo!()
}

fn accuracy(ys: &[f64], ps: &[f64]) -> f64 {
    todo!()
}

fn confusion(ys: &[f64], ps: &[f64]) -> [[u32; 2]; 2] {
    todo!()
}

@@solution
fn log_loss(ys: &[f64], ps: &[f64]) -> f64 {
    let total: f64 = ys
        .iter()
        .zip(ps)
        .map(|(&y, &p)| {
            let p = p.clamp(1e-15, 1.0 - 1e-15);
            -(y * p.ln() + (1.0 - y) * (1.0 - p).ln())
        })
        .sum();
    total / ys.len() as f64
}

fn accuracy(ys: &[f64], ps: &[f64]) -> f64 {
    let correct = ys.iter().zip(ps).filter(|&(&y, &p)| (p >= 0.5) == (y == 1.0)).count();
    correct as f64 / ys.len() as f64
}

fn confusion(ys: &[f64], ps: &[f64]) -> [[u32; 2]; 2] {
    let mut m = [[0u32; 2]; 2];
    for (&y, &p) in ys.iter().zip(ps) {
        let actual = (y == 1.0) as usize;
        let predicted = (p >= 0.5) as usize;
        m[actual][predicted] += 1;
    }
    m
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Log loss of 0.5 on everything is ln 2
#[test]
fn coin_flip() {
    assert!(close(log_loss(&[1.0, 0.0], &[0.5, 0.5]), std::f64::consts::LN_2));
}

/// Matches sklearn.metrics.log_loss
#[test]
fn sklearn_value() {
    let ll = log_loss(&[1.0, 0.0, 1.0, 1.0], &[0.9, 0.2, 0.6, 0.4]);
    assert!((ll - 0.4389051).abs() < 1e-6, "got {ll}");
}

/// A certain wrong answer is huge but finite
#[test]
fn clamped() {
    let ll = log_loss(&[1.0], &[0.0]);
    assert!(ll.is_finite() && ll > 30.0);
}

/// Accuracy and the confusion matrix
#[test]
fn accuracy_confusion() {
    let ys = [1.0, 0.0, 1.0, 1.0, 0.0];
    let ps = [0.9, 0.6, 0.4, 0.7, 0.1];
    assert!(close(accuracy(&ys, &ps), 0.6));
    assert_eq!(confusion(&ys, &ps), [[1, 1], [1, 2]]);
}

@@hint
`p.clamp(1e-15, 1.0 - 1e-15)` keeps `ln` finite. For the confusion matrix, `(y == 1.0) as usize` turns a bool into 0 or 1, which you can use as an index.
:::

:::exercise rml-softmax-predict Multinomial prediction
A three-class logistic regression has a `3 × d` weight matrix (one row per class, stored as `[[f64; D]; 3]` here) and 3 biases. Write `predict_proba<const D: usize>(weights: &[[f64; D]; 3], biases: &[f64; 3], x: &[f64; D]) -> [f64; 3]` that computes each class's score `w_k · x + b_k` and applies a numerically stable softmax.

@@starter
fn predict_proba<const D: usize>(weights: &[[f64; D]; 3], biases: &[f64; 3], x: &[f64; D]) -> [f64; 3] {
    todo!()
}

@@solution
fn predict_proba<const D: usize>(weights: &[[f64; D]; 3], biases: &[f64; 3], x: &[f64; D]) -> [f64; 3] {
    let mut z = [0.0; 3];
    for k in 0..3 {
        z[k] = biases[k] + weights[k].iter().zip(x).map(|(w, v)| w * v).sum::<f64>();
    }
    let max = z.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let mut exps = [0.0; 3];
    for k in 0..3 {
        exps[k] = (z[k] - max).exp();
    }
    let total: f64 = exps.iter().sum();
    [exps[0] / total, exps[1] / total, exps[2] / total]
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Probabilities sum to 1
#[test]
fn sums_to_one() {
    let p = predict_proba(&[[1.0, 0.0], [0.0, 1.0], [0.5, 0.5]], &[0.0, 0.1, -0.1], &[0.3, 2.0]);
    assert!(close(p.iter().sum::<f64>(), 1.0));
}

/// Equal scores give equal probabilities
#[test]
fn uniform() {
    let p = predict_proba(&[[0.0], [0.0], [0.0]], &[0.0, 0.0, 0.0], &[5.0]);
    assert!(p.iter().all(|&v| close(v, 1.0 / 3.0)), "got {p:?}");
}

/// Matches a hand-computed softmax
#[test]
fn known() {
    let p = predict_proba(&[[1.0], [0.0], [-1.0]], &[0.0, 0.0, 0.0], &[1.0]);
    let e = [1f64.exp(), 1.0, (-1f64).exp()];
    let t: f64 = e.iter().sum();
    assert!(close(p[0], e[0] / t) && close(p[2], e[2] / t), "got {p:?}");
}

/// Huge scores don't overflow
#[test]
fn stable() {
    let p = predict_proba(&[[1.0], [0.0], [0.0]], &[0.0, 0.0, 0.0], &[1000.0]);
    assert!(close(p[0], 1.0) && p.iter().all(|v| v.is_finite()), "got {p:?}");
}

@@hint
First compute the three scores `z[k]`. Then subtract the largest before calling `.exp()`, and divide each by the total.
:::

:::quiz rml-logistic-check Quick check
? What is the gradient of log loss with respect to the logistic model's score z?
- [x] p − y
- [ ] (p − y)²
- [ ] y log p
> That's why logistic regression training looks just like linear regression's.

? Why subtract the maximum score inside softmax?
- [ ] To make the largest probability 1
- [x] To prevent exp() overflowing; the probabilities are unchanged
- [ ] To normalise the features
> e^(z−m) / Σ e^(z−m) = e^z / Σ e^z.

? Why clamp p before taking ln in log loss?
- [x] ln(0) is −∞, which would make the loss infinite
- [ ] To make training faster
- [ ] Probabilities above 1 are possible
> Clamping keeps a single confident mistake from producing an infinite average.
:::
