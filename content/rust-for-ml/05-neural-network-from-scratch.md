---
title: A neural network from scratch
summary: Dense layers, ReLU, a forward pass and backpropagation in plain Rust, trained to solve XOR, the problem no linear model can.
minutes: 70
kind: lesson
language: rust
---

In Phase 7 you built a neural network library in NumPy and then used PyTorch, where `loss.backward()` computes every gradient for you. Here you'll write the forward and backward passes by hand in Rust. It's the clearest way to see that a neural network is just matrix multiplications, simple non-linear functions and the chain rule.

## The problem: XOR

XOR outputs 1 when exactly one input is 1. No straight line separates the 1s from the 0s, so logistic regression can't learn it. One hidden layer can.

| x₀ | x₁ | XOR |
| --- | --- | --- |
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

## The network

```text
input (2) ──► dense W1 (4×2), b1 ──► ReLU ──► dense W2 (1×4), b2 ──► sigmoid ──► p
```

Forward pass, for one example:

$$
h = \text{ReLU}(W_1 x + b_1), \qquad p = \sigma(W_2 h + b_2)
$$

Backward pass, using the chain rule from the output back to the input. With log loss, the gradient at the output score is again just $p - y$:

$$
\delta_2 = p - y, \quad \frac{\partial L}{\partial W_2} = \delta_2\, h^\top, \quad \frac{\partial L}{\partial b_2} = \delta_2
$$

$$
\delta_1 = (W_2^\top \delta_2) \odot \mathbb{1}[W_1 x + b_1 > 0], \quad \frac{\partial L}{\partial W_1} = \delta_1\, x^\top, \quad \frac{\partial L}{\partial b_1} = \delta_1
$$

$\odot$ means element-wise multiplication, and $\mathbb{1}[\cdot > 0]$ is ReLU's derivative: 1 where the unit was active, 0 where it wasn't.

## The code

Fixed sizes make this a perfect fit for arrays with const sizes: no heap allocation at all, which is also exactly how you'd write it for a microcontroller.

```rust
const IN: usize = 2;
const HID: usize = 4;

struct Mlp {
    w1: [[f64; IN]; HID],
    b1: [f64; HID],
    w2: [f64; HID],
    b2: f64,
}

fn sigmoid(z: f64) -> f64 {
    1.0 / (1.0 + (-z).exp())
}

impl Mlp {
    /// Returns the pre-activations z1, hidden activations h, and output probability p.
    fn forward(&self, x: &[f64; IN]) -> ([f64; HID], [f64; HID], f64) {
        let mut z1 = [0.0; HID];
        let mut h = [0.0; HID];
        for j in 0..HID {
            z1[j] = self.b1[j] + self.w1[j][0] * x[0] + self.w1[j][1] * x[1];
            h[j] = z1[j].max(0.0);                                  // ReLU
        }
        let z2 = self.b2 + (0..HID).map(|j| self.w2[j] * h[j]).sum::<f64>();
        (z1, h, sigmoid(z2))
    }

    /// One step of gradient descent on a batch, returning the mean log loss.
    fn train_step(&mut self, xs: &[[f64; IN]], ys: &[f64], lr: f64) -> f64 {
        let n = xs.len() as f64;
        let (mut gw1, mut gb1) = ([[0.0; IN]; HID], [0.0; HID]);
        let (mut gw2, mut gb2) = ([0.0; HID], 0.0);
        let mut loss = 0.0;
        for (x, &y) in xs.iter().zip(ys) {
            let (z1, h, p) = self.forward(x);
            loss -= y * p.max(1e-12).ln() + (1.0 - y) * (1.0 - p).max(1e-12).ln();
            let d2 = p - y;                                       // output layer
            for j in 0..HID {
                gw2[j] += d2 * h[j];
            }
            gb2 += d2;
            for j in 0..HID {                                     // hidden layer
                let d1 = if z1[j] > 0.0 { d2 * self.w2[j] } else { 0.0 };
                gw1[j][0] += d1 * x[0];
                gw1[j][1] += d1 * x[1];
                gb1[j] += d1;
            }
        }
        for j in 0..HID {
            self.w2[j] -= lr * gw2[j] / n;
            self.b1[j] -= lr * gb1[j] / n;
            for i in 0..IN {
                self.w1[j][i] -= lr * gw1[j][i] / n;
            }
        }
        self.b2 -= lr * gb2 / n;
        loss / n
    }
}

fn main() {
    let xs = [[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]];
    let ys = [0.0, 1.0, 1.0, 0.0];
    // Small, varied starting weights (in practice: random, e.g. He initialisation)
    let mut net = Mlp {
        w1: [[0.5, -0.4], [-0.3, 0.6], [0.7, 0.2], [-0.6, -0.5]],
        b1: [0.1, 0.1, -0.1, 0.2],
        w2: [0.4, -0.5, 0.3, 0.6],
        b2: 0.0,
    };
    for epoch in 0..=3000 {
        let loss = net.train_step(&xs, &ys, 0.5);
        if epoch % 1000 == 0 {
            println!("epoch {epoch:>4}: loss {loss:.4}");
        }
    }
    for x in &xs {
        println!("{x:?} -> {:.3}", net.forward(x).2);
    }
}
```

Every number the network uses is visible: 8 + 4 weights and biases in the hidden layer and 4 + 1 in the output, 17 parameters in all. A model that fits a microcontroller (Phase 13) is the same thing with a few thousand parameters.

:::tip Check your gradients numerically
Hand-written backward passes are easy to get subtly wrong. Professionals check them with **finite differences**: nudge one weight by ε, measure how the loss changes, and compare `(L(w+ε) − L(w−ε)) / 2ε` with your gradient. If they disagree beyond about 1e-6, there's a bug.
:::

## Practice

:::exercise rml-dense-layer A dense layer
Write `dense(weights: &[Vec<f32>], bias: &[f32], input: &[f32], relu: bool) -> Vec<f32>`. `weights` has one row per output unit. Each output is `row · input + bias[k]`, passed through ReLU (`max(0, x)`) if `relu` is true.

Use `f32`, the type real models and microcontrollers use.

@@starter
fn dense(weights: &[Vec<f32>], bias: &[f32], input: &[f32], relu: bool) -> Vec<f32> {
    todo!()
}

@@solution
fn dense(weights: &[Vec<f32>], bias: &[f32], input: &[f32], relu: bool) -> Vec<f32> {
    weights
        .iter()
        .zip(bias)
        .map(|(row, b)| {
            let z: f32 = row.iter().zip(input).map(|(w, x)| w * x).sum::<f32>() + b;
            if relu { z.max(0.0) } else { z }
        })
        .collect()
}

@@tests
/// Computes W x + b
#[test]
fn linear() {
    let w = vec![vec![1.0, 2.0], vec![-1.0, 0.5]];
    assert_eq!(dense(&w, &[0.5, 0.0], &[1.0, 2.0], false), vec![5.5, 0.0]);
}

/// ReLU zeroes negative outputs
#[test]
fn relu() {
    let w = vec![vec![1.0], vec![-1.0]];
    assert_eq!(dense(&w, &[0.0, 0.0], &[3.0], true), vec![3.0, 0.0]);
    assert_eq!(dense(&w, &[0.0, 0.0], &[3.0], false), vec![3.0, -3.0]);
}

/// Output size equals the number of rows
#[test]
fn shapes() {
    let w = vec![vec![0.0; 5]; 3];
    assert_eq!(dense(&w, &[1.0, 2.0, 3.0], &[1.0; 5], true).len(), 3);
}

@@hint
For each `(row, b)` in `weights.iter().zip(bias)`, compute the dot product with `input`, add `b`, and apply `z.max(0.0)` if `relu`.
:::

:::exercise rml-backprop Backpropagation for one example
The network below has one hidden ReLU layer and a sigmoid output, like the lesson's. Complete `gradients`, which returns the gradients of the log loss for **one** example `(x, y)` as a `Grads` struct.

Use the formulas from the lesson: `d2 = p − y`; `gw2[j] = d2 × h[j]`; `gb2 = d2`; for each hidden unit `d1 = d2 × w2[j]` if `z1[j] > 0` (else 0); `gw1[j][i] = d1 × x[i]`; `gb1[j] = d1`.

The tests compare your gradients with numerical finite-difference gradients.

@@starter
const IN: usize = 2;
const HID: usize = 3;

#[derive(Clone)]
struct Net {
    w1: [[f64; IN]; HID],
    b1: [f64; HID],
    w2: [f64; HID],
    b2: f64,
}

#[derive(Debug)]
struct Grads {
    w1: [[f64; IN]; HID],
    b1: [f64; HID],
    w2: [f64; HID],
    b2: f64,
}

fn sigmoid(z: f64) -> f64 {
    1.0 / (1.0 + (-z).exp())
}

impl Net {
    fn forward(&self, x: &[f64; IN]) -> ([f64; HID], [f64; HID], f64) {
        let mut z1 = [0.0; HID];
        let mut h = [0.0; HID];
        for j in 0..HID {
            z1[j] = self.b1[j] + (0..IN).map(|i| self.w1[j][i] * x[i]).sum::<f64>();
            h[j] = z1[j].max(0.0);
        }
        let z2 = self.b2 + (0..HID).map(|j| self.w2[j] * h[j]).sum::<f64>();
        (z1, h, sigmoid(z2))
    }

    fn loss(&self, x: &[f64; IN], y: f64) -> f64 {
        let p = self.forward(x).2;
        -(y * p.ln() + (1.0 - y) * (1.0 - p).ln())
    }

    fn gradients(&self, x: &[f64; IN], y: f64) -> Grads {
        todo!()
    }
}

@@solution
const IN: usize = 2;
const HID: usize = 3;

#[derive(Clone)]
struct Net {
    w1: [[f64; IN]; HID],
    b1: [f64; HID],
    w2: [f64; HID],
    b2: f64,
}

#[derive(Debug)]
struct Grads {
    w1: [[f64; IN]; HID],
    b1: [f64; HID],
    w2: [f64; HID],
    b2: f64,
}

fn sigmoid(z: f64) -> f64 {
    1.0 / (1.0 + (-z).exp())
}

impl Net {
    fn forward(&self, x: &[f64; IN]) -> ([f64; HID], [f64; HID], f64) {
        let mut z1 = [0.0; HID];
        let mut h = [0.0; HID];
        for j in 0..HID {
            z1[j] = self.b1[j] + (0..IN).map(|i| self.w1[j][i] * x[i]).sum::<f64>();
            h[j] = z1[j].max(0.0);
        }
        let z2 = self.b2 + (0..HID).map(|j| self.w2[j] * h[j]).sum::<f64>();
        (z1, h, sigmoid(z2))
    }

    fn loss(&self, x: &[f64; IN], y: f64) -> f64 {
        let p = self.forward(x).2;
        -(y * p.ln() + (1.0 - y) * (1.0 - p).ln())
    }

    fn gradients(&self, x: &[f64; IN], y: f64) -> Grads {
        let (z1, h, p) = self.forward(x);
        let d2 = p - y;
        let mut g = Grads { w1: [[0.0; IN]; HID], b1: [0.0; HID], w2: [0.0; HID], b2: d2 };
        for j in 0..HID {
            g.w2[j] = d2 * h[j];
            let d1 = if z1[j] > 0.0 { d2 * self.w2[j] } else { 0.0 };
            g.b1[j] = d1;
            for i in 0..IN {
                g.w1[j][i] = d1 * x[i];
            }
        }
        g
    }
}

@@tests
fn net() -> Net {
    Net {
        w1: [[0.5, -0.3], [0.2, 0.8], [-0.7, 0.1]],
        b1: [0.1, -0.2, 0.05],
        w2: [0.6, -0.4, 0.9],
        b2: 0.1,
    }
}

const EPS: f64 = 1e-6;

fn numeric(f: impl Fn(&mut Net, f64), x: &[f64; IN], y: f64) -> f64 {
    let mut plus = net();
    f(&mut plus, EPS);
    let mut minus = net();
    f(&mut minus, -EPS);
    (plus.loss(x, y) - minus.loss(x, y)) / (2.0 * EPS)
}

/// Output-layer gradients match finite differences
#[test]
fn output_layer() {
    let (x, y) = ([0.8, 0.6], 1.0);
    let g = net().gradients(&x, y);
    assert!((g.b2 - numeric(|n, e| n.b2 += e, &x, y)).abs() < 1e-6, "b2: {}", g.b2);
    for j in 0..HID {
        let num = numeric(|n, e| n.w2[j] += e, &x, y);
        assert!((g.w2[j] - num).abs() < 1e-6, "w2[{j}]: {} vs {num}", g.w2[j]);
    }
}

/// Hidden-layer gradients match finite differences
#[test]
fn hidden_layer() {
    let (x, y) = ([0.8, 0.6], 0.0);
    let g = net().gradients(&x, y);
    for j in 0..HID {
        let num = numeric(|n, e| n.b1[j] += e, &x, y);
        assert!((g.b1[j] - num).abs() < 1e-6, "b1[{j}]: {} vs {num}", g.b1[j]);
        for i in 0..IN {
            let num = numeric(|n, e| n.w1[j][i] += e, &x, y);
            assert!((g.w1[j][i] - num).abs() < 1e-6, "w1[{j}][{i}]: {} vs {num}", g.w1[j][i]);
        }
    }
}

/// Inactive ReLU units get zero gradient
#[test]
fn dead_units() {
    let g = net().gradients(&[0.8, 0.6], 1.0);
    // unit 2: z = 0.05 - 0.56 + 0.06 < 0
    assert_eq!(g.b1[2], 0.0);
    assert_eq!(g.w1[2], [0.0, 0.0]);
}

@@hint
Start with `let (z1, h, p) = self.forward(x); let d2 = p - y;`. Then fill each field in a loop over the hidden units.
:::

:::quiz rml-nn-check Quick check
? Why can't logistic regression learn XOR?
- [x] Its decision boundary is a straight line, and XOR's classes aren't linearly separable
- [ ] XOR has too many examples
- [ ] Logistic regression can't output 0 or 1
> A hidden layer with a non-linearity bends the boundary.

? What is ReLU's derivative?
- [ ] Always 1
- [x] 1 where its input was positive, 0 otherwise
- [ ] The sigmoid
> That's why "dead" units (always negative) stop learning.

? How do you check a hand-written backward pass?
- [ ] Train longer
- [x] Compare it with finite-difference gradients
- [ ] Use a bigger learning rate
> (L(w+ε) − L(w−ε)) / 2ε should match your gradient closely.
:::
