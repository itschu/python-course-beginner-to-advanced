---
title: "Checkpoint: Rust for Machine Learning"
summary: Implement and verify ML building blocks in Rust, and choose the right tool for each deployment.
minutes: 70
kind: checkpoint
language: rust
---

:::quiz rml-cp-quiz Concepts
? A Python preprocessing loop with sequential dependencies takes 40 minutes. What's the best first move?
- [ ] Rewrite the whole project in Rust
- [x] Profile it, then move the hot loop into a Rust extension with PyO3, testing it against the Python version
- [ ] Buy a faster computer
> Keep Python where it's good, and replace only the measured bottleneck.

? In what order does scikit-learn's predict_proba return home/draw/away classes labelled "H", "D", "A"?
- [ ] H, D, A
- [x] A, D, H (sorted labels)
- [ ] Random
> `model.classes_` tells you; always check it before porting.

? Which are part of a deployed logistic regression pipeline that must be exported? (choose all that apply)
- [x] The scaler's means and standard deviations
- [x] The weights and biases
- [x] The exact feature definitions and their order
- [ ] The training data
> Everything needed to turn a raw input into a prediction.

? What's the main benefit of a row-major flat buffer for a matrix?
- [x] Contiguous memory and one allocation, which is cache-friendly
- [ ] It sorts the values
- [ ] It uses integers
> It's the layout NumPy, PyTorch and ndarray use by default.
:::

:::exercise rml-cp-knn k-nearest neighbours
Write `knn_predict(train_x: &[[f64; 2]], train_y: &[u8], query: [f64; 2], k: usize) -> u8` that finds the `k` training points closest to `query` (Euclidean distance) and returns the most common label among them. Break ties in the vote by returning the **smallest** label. Use `total_cmp` to sort distances.

@@starter
fn knn_predict(train_x: &[[f64; 2]], train_y: &[u8], query: [f64; 2], k: usize) -> u8 {
    todo!()
}

@@solution
use std::collections::HashMap;

fn knn_predict(train_x: &[[f64; 2]], train_y: &[u8], query: [f64; 2], k: usize) -> u8 {
    let mut distances: Vec<(f64, u8)> = train_x
        .iter()
        .zip(train_y)
        .map(|(p, &label)| (((p[0] - query[0]).powi(2) + (p[1] - query[1]).powi(2)).sqrt(), label))
        .collect();
    distances.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut votes: HashMap<u8, usize> = HashMap::new();
    for &(_, label) in distances.iter().take(k) {
        *votes.entry(label).or_insert(0) += 1;
    }
    let mut best = (0usize, u8::MAX);
    for (label, count) in votes {
        if count > best.0 || (count == best.0 && label < best.1) {
            best = (count, label);
        }
    }
    best.1
}

@@tests
const X: [[f64; 2]; 6] = [[0.0, 0.0], [0.1, 0.2], [0.2, 0.1], [5.0, 5.0], [5.1, 4.9], [4.8, 5.2]];
const Y: [u8; 6] = [0, 0, 0, 1, 1, 1];

/// Classifies points near each cluster
#[test]
fn clusters() {
    assert_eq!(knn_predict(&X, &Y, [0.3, 0.3], 3), 0);
    assert_eq!(knn_predict(&X, &Y, [4.5, 4.5], 3), 1);
}

/// k = 1 returns the nearest point's label
#[test]
fn nearest() {
    assert_eq!(knn_predict(&X, &Y, [5.0, 5.05], 1), 1);
}

/// Ties go to the smallest label
#[test]
fn tie() {
    let x = [[0.0, 0.0], [2.0, 0.0]];
    assert_eq!(knn_predict(&x, &[1, 0], [1.0, 0.0], 2), 0);
}

@@hint
Build a `Vec<(distance, label)>`, sort it with `sort_by(|a, b| a.0.total_cmp(&b.0))`, and count the labels of the first `k` in a `HashMap`.
:::

:::exercise rml-cp-kmeans One step of k-means
Write `kmeans_step(points: &[[f64; 2]], centroids: &[[f64; 2]]) -> (Vec<usize>, Vec<[f64; 2]>)`, one iteration of k-means:

1. assign each point to its nearest centroid (on ties, the lower index), and
2. move each centroid to the mean of its assigned points (a centroid with no points stays where it is).

Return the assignments and the new centroids.

@@starter
fn kmeans_step(points: &[[f64; 2]], centroids: &[[f64; 2]]) -> (Vec<usize>, Vec<[f64; 2]>) {
    todo!()
}

@@solution
fn kmeans_step(points: &[[f64; 2]], centroids: &[[f64; 2]]) -> (Vec<usize>, Vec<[f64; 2]>) {
    let dist2 = |a: &[f64; 2], b: &[f64; 2]| (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2);
    let assignments: Vec<usize> = points
        .iter()
        .map(|p| {
            let mut best = 0;
            for (i, c) in centroids.iter().enumerate() {
                if dist2(p, c) < dist2(p, &centroids[best]) {
                    best = i;
                }
            }
            best
        })
        .collect();
    let mut sums = vec![[0.0; 2]; centroids.len()];
    let mut counts = vec![0usize; centroids.len()];
    for (p, &a) in points.iter().zip(&assignments) {
        sums[a][0] += p[0];
        sums[a][1] += p[1];
        counts[a] += 1;
    }
    let new_centroids = centroids
        .iter()
        .enumerate()
        .map(|(i, c)| if counts[i] == 0 { *c } else { [sums[i][0] / counts[i] as f64, sums[i][1] / counts[i] as f64] })
        .collect();
    (assignments, new_centroids)
}

@@tests
/// Assigns points and moves the centroids to the means
#[test]
fn step() {
    let pts = [[0.0, 0.0], [0.0, 2.0], [10.0, 10.0], [12.0, 10.0]];
    let (a, c) = kmeans_step(&pts, &[[1.0, 1.0], [9.0, 9.0]]);
    assert_eq!(a, vec![0, 0, 1, 1]);
    assert_eq!(c, vec![[0.0, 1.0], [11.0, 10.0]]);
}

/// An empty cluster keeps its centroid
#[test]
fn empty_cluster() {
    let (a, c) = kmeans_step(&[[0.0, 0.0], [1.0, 0.0]], &[[0.0, 0.0], [100.0, 100.0]]);
    assert_eq!(a, vec![0, 0]);
    assert_eq!(c[1], [100.0, 100.0]);
}

/// Ties go to the lower index
#[test]
fn tie() {
    let (a, _) = kmeans_step(&[[1.0, 0.0]], &[[0.0, 0.0], [2.0, 0.0]]);
    assert_eq!(a, vec![0]);
}

@@hint
Use squared distance (no need for `sqrt` when comparing). Only switch to a new centroid when it's strictly closer, which keeps the lower index on ties.
:::

## Phase 11 complete

You can now implement and verify ML models in Rust, use the Rust ML ecosystem, accelerate Python with PyO3, and move a model from Python to Rust with proof that it behaves identically.

Next: Phase 12 leaves the laptop behind. You'll program microcontrollers with MicroPython and embedded Rust, and in Phase 13 you'll put a model on one.
