---
title: Linear regression in Rust
summary: Fit a line exactly, then train a multi-feature linear model with gradient descent, standardising features first.
minutes: 55
kind: lesson
language: rust
---

You trained linear regression with scikit-learn in Phase 5 and derived gradient descent in Phase 4. Now you'll write the training loop yourself in Rust. The maths is the same; what's new is managing the data and loops explicitly.

## The closed-form answer for one feature

With a single feature, the least-squares line `y = a + b x` has an exact formula:

$$
b = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sum (x_i - \bar{x})^2}, \qquad a = \bar{y} - b\,\bar{x}
$$

```rust
fn mean(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}

fn fit_line(xs: &[f64], ys: &[f64]) -> (f64, f64) {
    let (mx, my) = (mean(xs), mean(ys));
    let mut num = 0.0;
    let mut den = 0.0;
    for (x, y) in xs.iter().zip(ys) {
        num += (x - mx) * (y - my);
        den += (x - mx) * (x - mx);
    }
    let slope = num / den;
    (my - slope * mx, slope)
}

fn main() {
    // house size (100 m²) against price (£100k)
    let size = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0];
    let price = [1.6, 2.3, 2.9, 3.2, 4.1, 5.2];
    let (a, b) = fit_line(&size, &price);
    println!("price ≈ {a:.3} + {b:.3} × size");
    println!("a 1.3 (130 m²) house: {:.2}", a + b * 1.3);
}
```

## Gradient descent for many features

With several features there's still a closed form (the "normal equations"), but it needs a matrix inverse that's slow and numerically fragile for large problems. Gradient descent is how almost every model, including every neural network, is trained, so let's write it.

For a model $\hat{y} = w \cdot x + b$ and mean squared error, the gradients are:

$$
\frac{\partial L}{\partial w_j} = \frac{2}{n} \sum_i (\hat{y}_i - y_i)\, x_{ij}, \qquad \frac{\partial L}{\partial b} = \frac{2}{n} \sum_i (\hat{y}_i - y_i)
$$

```rust
struct LinearModel {
    weights: Vec<f64>,
    bias: f64,
}

impl LinearModel {
    fn new(n_features: usize) -> Self {
        LinearModel { weights: vec![0.0; n_features], bias: 0.0 }
    }

    fn predict(&self, x: &[f64]) -> f64 {
        self.bias + self.weights.iter().zip(x).map(|(w, xi)| w * xi).sum::<f64>()
    }

    fn mse(&self, xs: &[Vec<f64>], ys: &[f64]) -> f64 {
        xs.iter().zip(ys).map(|(x, y)| (self.predict(x) - y).powi(2)).sum::<f64>() / ys.len() as f64
    }

    fn step(&mut self, xs: &[Vec<f64>], ys: &[f64], lr: f64) {
        let n = ys.len() as f64;
        let mut grad_w = vec![0.0; self.weights.len()];
        let mut grad_b = 0.0;
        for (x, y) in xs.iter().zip(ys) {
            let err = self.predict(x) - y;
            for (g, xi) in grad_w.iter_mut().zip(x) {
                *g += 2.0 * err * xi / n;
            }
            grad_b += 2.0 * err / n;
        }
        for (w, g) in self.weights.iter_mut().zip(&grad_w) {
            *w -= lr * g;
        }
        self.bias -= lr * grad_b;
    }
}

fn main() {
    // y = 3 + 2·x0 − 1·x1, exactly
    let xs: Vec<Vec<f64>> = vec![vec![0.0, 1.0], vec![1.0, 0.0], vec![2.0, 1.0], vec![3.0, 2.0], vec![1.0, 3.0]];
    let ys: Vec<f64> = xs.iter().map(|x| 3.0 + 2.0 * x[0] - x[1]).collect();

    let mut model = LinearModel::new(2);
    for epoch in 0..=2000 {
        model.step(&xs, &ys, 0.05);
        if epoch % 500 == 0 {
            println!("epoch {epoch:>4}: mse {:.6}", model.mse(&xs, &ys));
        }
    }
    println!("weights {:.3?}, bias {:.3}", model.weights, model.bias);
}
```

It recovers the true weights (2, −1) and bias 3. Each `step` touches every training example once: that's one **epoch** of full-batch gradient descent.

## Standardise your features

Gradient descent struggles when features have very different scales (a house's size in m² next to its number of bathrooms): the error surface becomes a long narrow valley and the learning rate that's safe for one feature is far too small for the other. The fix you used in scikit-learn, `StandardScaler`, is simple to write:

```rust
struct Scaler {
    mean: Vec<f64>,
    std: Vec<f64>,
}

impl Scaler {
    fn fit(xs: &[Vec<f64>]) -> Scaler {
        let n = xs.len() as f64;
        let d = xs[0].len();
        let mut mean = vec![0.0; d];
        let mut std = vec![0.0; d];
        for j in 0..d {
            mean[j] = xs.iter().map(|x| x[j]).sum::<f64>() / n;
            let var = xs.iter().map(|x| (x[j] - mean[j]).powi(2)).sum::<f64>() / n;
            std[j] = if var > 0.0 { var.sqrt() } else { 1.0 };   // avoid dividing by zero
        }
        Scaler { mean, std }
    }

    fn transform(&self, x: &[f64]) -> Vec<f64> {
        x.iter().zip(&self.mean).zip(&self.std).map(|((v, m), s)| (v - m) / s).collect()
    }
}

fn main() {
    let raw = vec![vec![50.0, 1.0], vec![80.0, 2.0], vec![120.0, 2.0], vec![200.0, 3.0]];
    let scaler = Scaler::fit(&raw);
    for x in &raw {
        println!("{:?} -> {:.3?}", x, scaler.transform(x));
    }
}
```

Like scikit-learn, it uses the **population** standard deviation (dividing by n). Remember the rule from Phase 5: fit the scaler on the **training** data only, and reuse those means and standard deviations for test data and in production. When you move a model to Rust or a microcontroller, the scaler's numbers are part of the model and must be exported with it.

## Practice

:::exercise rml-fit-line Fit a line and measure R²
Write `fit_line(xs: &[f64], ys: &[f64]) -> (f64, f64)` returning `(intercept, slope)` with the closed-form formula, and `r_squared(xs: &[f64], ys: &[f64], intercept: f64, slope: f64) -> f64`, which is `1 − SS_res / SS_tot` where `SS_res = Σ(y − ŷ)²` and `SS_tot = Σ(y − ȳ)²`.

@@starter
fn mean(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}

fn fit_line(xs: &[f64], ys: &[f64]) -> (f64, f64) {
    todo!()
}

fn r_squared(xs: &[f64], ys: &[f64], intercept: f64, slope: f64) -> f64 {
    todo!()
}

@@solution
fn mean(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}

fn fit_line(xs: &[f64], ys: &[f64]) -> (f64, f64) {
    let (mx, my) = (mean(xs), mean(ys));
    let mut num = 0.0;
    let mut den = 0.0;
    for (x, y) in xs.iter().zip(ys) {
        num += (x - mx) * (y - my);
        den += (x - mx) * (x - mx);
    }
    let slope = num / den;
    (my - slope * mx, slope)
}

fn r_squared(xs: &[f64], ys: &[f64], intercept: f64, slope: f64) -> f64 {
    let my = mean(ys);
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    for (x, y) in xs.iter().zip(ys) {
        let pred = intercept + slope * x;
        ss_res += (y - pred).powi(2);
        ss_tot += (y - my).powi(2);
    }
    1.0 - ss_res / ss_tot
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Recovers an exact line
#[test]
fn exact_line() {
    let xs = [0.0, 1.0, 2.0, 3.0];
    let ys = [1.0, 3.0, 5.0, 7.0];
    let (a, b) = fit_line(&xs, &ys);
    assert!(close(a, 1.0) && close(b, 2.0), "got ({a}, {b})");
    assert!(close(r_squared(&xs, &ys, a, b), 1.0));
}

/// Noisy data: matches numpy.polyfit
#[test]
fn noisy() {
    let xs = [1.0, 2.0, 3.0, 4.0, 5.0];
    let ys = [2.0, 4.0, 5.0, 4.0, 5.0];
    let (a, b) = fit_line(&xs, &ys);
    assert!(close(a, 2.2) && close(b, 0.6), "got ({a}, {b})");
    assert!(close(r_squared(&xs, &ys, a, b), 0.6), "got {}", r_squared(&xs, &ys, a, b));
}

@@hint
Copy the formula from the lesson for `fit_line`. For R², loop once, adding `(y - pred)²` and `(y - mean_y)²`.
:::

:::exercise rml-gd-train Train with gradient descent
Write `train(xs: &[Vec<f64>], ys: &[f64], lr: f64, epochs: usize) -> (Vec<f64>, f64)` that starts from all-zero weights and bias and runs `epochs` steps of full-batch gradient descent on mean squared error, returning `(weights, bias)`.

@@starter
fn train(xs: &[Vec<f64>], ys: &[f64], lr: f64, epochs: usize) -> (Vec<f64>, f64) {
    todo!()
}

@@solution
fn train(xs: &[Vec<f64>], ys: &[f64], lr: f64, epochs: usize) -> (Vec<f64>, f64) {
    let d = xs[0].len();
    let n = ys.len() as f64;
    let mut w = vec![0.0; d];
    let mut b = 0.0;
    for _ in 0..epochs {
        let mut grad_w = vec![0.0; d];
        let mut grad_b = 0.0;
        for (x, y) in xs.iter().zip(ys) {
            let pred = b + w.iter().zip(x).map(|(wi, xi)| wi * xi).sum::<f64>();
            let err = pred - y;
            for j in 0..d {
                grad_w[j] += 2.0 * err * x[j] / n;
            }
            grad_b += 2.0 * err / n;
        }
        for j in 0..d {
            w[j] -= lr * grad_w[j];
        }
        b -= lr * grad_b;
    }
    (w, b)
}

@@tests
/// Learns y = 1 + 4·x0 − 2·x1
#[test]
fn learns() {
    let xs: Vec<Vec<f64>> = (0..20).map(|i| vec![(i % 5) as f64 / 4.0, (i / 5) as f64 / 3.0]).collect();
    let ys: Vec<f64> = xs.iter().map(|x| 1.0 + 4.0 * x[0] - 2.0 * x[1]).collect();
    let (w, b) = train(&xs, &ys, 0.3, 3000);
    assert!((w[0] - 4.0).abs() < 1e-3 && (w[1] + 2.0).abs() < 1e-3, "weights {w:?}");
    assert!((b - 1.0).abs() < 1e-3, "bias {b}");
}

/// One step from zero moves along the negative gradient
#[test]
fn one_step() {
    let (w, b) = train(&[vec![1.0], vec![2.0]], &[2.0, 4.0], 0.1, 1);
    // grad_w = 2/2 * (-2*1 + -4*2) = -10, grad_b = 2/2 * (-2 - 4) = -6
    assert!((w[0] - 1.0).abs() < 1e-12 && (b - 0.6).abs() < 1e-12, "got {w:?} {b}");
}

/// Zero epochs leaves everything at zero
#[test]
fn zero_epochs() {
    assert_eq!(train(&[vec![1.0, 2.0]], &[3.0], 0.1, 0), (vec![0.0, 0.0], 0.0));
}

@@hint
Each epoch: compute `grad_w` and `grad_b` over all examples (prediction minus target, times `2 / n`, times the feature for weights), then update `w[j] -= lr * grad_w[j]` and `b -= lr * grad_b`.
:::

:::quiz rml-linreg-check Quick check
? Why standardise features before gradient descent?
- [ ] It changes the model's predictions
- [x] Features on very different scales make gradient descent slow or unstable
- [ ] Rust requires it
> Equal scales let one learning rate suit every weight.

? When deploying a model trained on standardised features, what must you ship with the weights?
- [ ] Nothing else
- [x] The scaler's means and standard deviations from the training data
- [ ] The whole training set
> The same transformation must be applied to every new input.

? What is one epoch of full-batch gradient descent?
- [x] One weight update computed from every training example
- [ ] One update per example
- [ ] A fixed number of seconds of training
> Mini-batch and stochastic gradient descent update more often, using parts of the data.
:::
