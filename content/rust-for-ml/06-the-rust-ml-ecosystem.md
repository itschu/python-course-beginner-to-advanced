---
title: The Rust ML ecosystem
summary: ndarray for arrays, Polars for DataFrames, linfa for classical ML, and Candle and Burn for deep learning, each compared with the Python tool you know.
minutes: 45
kind: lesson
language: rust
---

Writing matrix code by hand taught you what happens underneath. For real work, use the libraries. These examples need crates from crates.io, so they're shown rather than run here; try them in a Cargo project on your machine (`cargo add ndarray`, and so on).

| Python | Rust | What it's for |
| --- | --- | --- |
| NumPy | [`ndarray`](https://docs.rs/ndarray) (also `nalgebra` for fixed-size linear algebra) | N-dimensional arrays |
| pandas | [`polars`](https://docs.pola.rs/) | DataFrames |
| scikit-learn | [`linfa`](https://github.com/rust-ml/linfa), `smartcore` | Classical ML |
| PyTorch | [`candle`](https://github.com/huggingface/candle), [`burn`](https://burn.dev/), `tch` (bindings to libtorch) | Deep learning |
| ONNX Runtime | [`ort`](https://ort.pyke.io/), [`tract`](https://github.com/sonos/tract) | Running exported models |
| Hugging Face tokenizers | `tokenizers` (it's Rust already) | Text tokenisation |

## ndarray: NumPy for Rust

```rust static
use ndarray::{array, Array2, Axis};

fn main() {
    let x: Array2<f64> = array![[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]];
    let w = array![[0.5], [-0.25]];

    let y = x.dot(&w);                                // matrix multiply, like x @ w
    let means = x.mean_axis(Axis(0)).unwrap();        // column means, like x.mean(axis=0)
    let centred = &x - &means;                        // broadcasting, like x - means
    let doubled = x.mapv(|v| v * 2.0);                // element-wise, like x * 2

    println!("{y}\n{means}\n{centred}\n{}", doubled.shape()[0]);
}
```

The big differences from NumPy: element types are fixed at compile time (`Array2<f64>`), shapes are checked at run time like NumPy, and the `&x - &means` borrows avoid copying the arrays. ndarray has a [guide for NumPy users](https://docs.rs/ndarray/latest/ndarray/doc/ndarray_for_numpy_users/index.html) that maps every common NumPy call.

## Polars: DataFrames, fast

Polars is written in Rust and is also the fastest DataFrame library for Python (`pip install polars`). Its **lazy** API builds a query plan and optimises it before running, like a database:

```rust static
use polars::prelude::*;

fn main() -> PolarsResult<()> {
    let df = CsvReadOptions::default()
        .with_has_header(true)
        .try_into_reader_with_file_path(Some("data/matches.csv".into()))?
        .finish()?;

    let home_form = df
        .lazy()
        .group_by([col("HomeTeam")])
        .agg([
            col("FTHG").mean().alias("avg_scored"),
            col("FTAG").mean().alias("avg_conceded"),
            (col("FTR").eq(lit("H"))).mean().alias("win_rate"),
        ])
        .sort(["win_rate"], SortMultipleOptions::default().with_order_descending(true))
        .collect()?;

    println!("{home_form}");
    Ok(())
}
```

The same expression API works in Python, so learning Polars in Rust or Python transfers directly:

```python static
import polars as pl

(pl.read_csv("data/matches.csv")
   .group_by("HomeTeam")
   .agg(pl.col("FTHG").mean().alias("avg_scored"), (pl.col("FTR") == "H").mean().alias("win_rate"))
   .sort("win_rate", descending=True))
```

## linfa: scikit-learn-style ML

```rust static
use linfa::prelude::*;
use linfa_logistic::LogisticRegression;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (train, test) = linfa_datasets::winequality()
        .map_targets(|quality| *quality > 6)          // good wine or not
        .split_with_ratio(0.8);

    let model = LogisticRegression::default().max_iterations(200).fit(&train)?;
    let predictions = model.predict(&test);
    let cm = predictions.confusion_matrix(&test)?;
    println!("accuracy {:.3}", cm.accuracy());
    Ok(())
}
```

linfa covers linear models, SVMs, trees, k-means, DBSCAN, PCA and more, with a `fit` / `predict` design copied from scikit-learn. It's useful when an entire pipeline must be Rust, but scikit-learn is still far more complete.

## Candle: PyTorch-like and Hugging Face friendly

Candle, from Hugging Face, focuses on **inference**: loading pretrained models (LLMs, Whisper, Stable Diffusion, BERT) from the Hugging Face Hub and running them without Python, on CPU, CUDA or Apple Metal.

```rust static
use candle_core::{Device, Tensor};

fn main() -> candle_core::Result<()> {
    let device = Device::Cpu;                                   // or Device::new_cuda(0)?
    let a = Tensor::randn(0f32, 1.0, (2, 3), &device)?;
    let b = Tensor::randn(0f32, 1.0, (3, 4), &device)?;
    let c = a.matmul(&b)?.relu()?;
    println!("{c}");
    Ok(())
}
```

## Burn: train anywhere, run anywhere

Burn is a full deep learning framework: define models, train with automatic differentiation, and pick a **backend** at compile time: CPU (ndarray), GPU via WGPU (Vulkan, Metal, DirectX, even WebGPU in a browser), CUDA, or libtorch. Its `no_std` support means a model trained with Burn can be compiled into **microcontroller firmware**:

```rust static
use burn::prelude::*;
use burn::nn::{Linear, LinearConfig, Relu};

#[derive(Module, Debug)]
pub struct Mlp<B: Backend> {
    hidden: Linear<B>,
    output: Linear<B>,
    activation: Relu,
}

impl<B: Backend> Mlp<B> {
    pub fn new(device: &B::Device) -> Self {
        Self {
            hidden: LinearConfig::new(6, 16).init(device),
            output: LinearConfig::new(16, 3).init(device),
            activation: Relu::new(),
        }
    }

    pub fn forward(&self, x: Tensor<B, 2>) -> Tensor<B, 2> {
        self.output.forward(self.activation.forward(self.hidden.forward(x)))
    }
}
```

Notice the generic `B: Backend`: one model definition, compiled for whichever hardware you choose. That's the generics lesson from Phase 10 at work.

## Which should you use?

- **Exploring data or training a model:** stay in Python (pandas or Polars, scikit-learn, PyTorch).
- **A fast data pipeline:** Polars, from Python or Rust.
- **Serving a model you trained in PyTorch or scikit-learn:** export to ONNX, run it with `ort` or `tract` (lesson 8).
- **Running a Hugging Face model without Python:** Candle.
- **Training and deploying in Rust, including to a GPU in a browser or a microcontroller:** Burn.
- **A model on a tiny microcontroller:** hand-written or generated integer code, microflow, or TFLite Micro (Phase 13).

## Practice

A common array operation is standardising each **column** of a 2-D array: what `StandardScaler().fit_transform` or `(x - x.mean(axis=0)) / x.std(axis=0)` does. Write it on a flat row-major buffer, the same layout ndarray uses.

:::exercise rml-column-standardise Standardise columns
`data` is a row-major `rows × cols` matrix. Write `column_stats(data: &[f64], rows: usize, cols: usize) -> (Vec<f64>, Vec<f64>)` returning each column's mean and population standard deviation, and `standardise(data: &mut [f64], rows: usize, cols: usize)` that replaces every value with `(value − column mean) / column std`. A column with zero standard deviation should become all zeros (don't divide by zero).

@@starter
fn column_stats(data: &[f64], rows: usize, cols: usize) -> (Vec<f64>, Vec<f64>) {
    todo!()
}

fn standardise(data: &mut [f64], rows: usize, cols: usize) {
    todo!()
}

@@solution
fn column_stats(data: &[f64], rows: usize, cols: usize) -> (Vec<f64>, Vec<f64>) {
    let mut mean = vec![0.0; cols];
    let mut std = vec![0.0; cols];
    for r in 0..rows {
        for c in 0..cols {
            mean[c] += data[r * cols + c] / rows as f64;
        }
    }
    for r in 0..rows {
        for c in 0..cols {
            std[c] += (data[r * cols + c] - mean[c]).powi(2) / rows as f64;
        }
    }
    for s in std.iter_mut() {
        *s = s.sqrt();
    }
    (mean, std)
}

fn standardise(data: &mut [f64], rows: usize, cols: usize) {
    let (mean, std) = column_stats(data, rows, cols);
    for r in 0..rows {
        for c in 0..cols {
            let v = &mut data[r * cols + c];
            *v = if std[c] > 0.0 { (*v - mean[c]) / std[c] } else { 0.0 };
        }
    }
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Column means and standard deviations
#[test]
fn stats() {
    let data = [1.0, 10.0, 3.0, 10.0, 5.0, 10.0];
    let (mean, std) = column_stats(&data, 3, 2);
    assert!(close(mean[0], 3.0) && close(mean[1], 10.0));
    assert!(close(std[0], (8.0f64 / 3.0).sqrt()) && close(std[1], 0.0), "got {std:?}");
}

/// Standardised columns have mean 0 and std 1
#[test]
fn standardised() {
    let mut data = [1.0, 200.0, 2.0, 400.0, 3.0, 900.0, 6.0, 100.0];
    standardise(&mut data, 4, 2);
    let (mean, std) = column_stats(&data, 4, 2);
    for c in 0..2 {
        assert!(close(mean[c], 0.0) && close(std[c], 1.0), "column {c}: {} {}", mean[c], std[c]);
    }
}

/// Constant columns become zeros
#[test]
fn constant_column() {
    let mut data = [5.0, 1.0, 5.0, 2.0];
    standardise(&mut data, 2, 2);
    assert!(close(data[0], 0.0) && close(data[2], 0.0), "got {data:?}");
}

@@hint
Element `(r, c)` is `data[r * cols + c]`. Compute all the means in one pass and the variances in a second pass, then take square roots.
:::

:::quiz rml-ecosystem-check Quick check
? Which Rust crate is closest to pandas?
- [ ] ndarray
- [x] Polars
- [ ] Candle
> Polars is a DataFrame library, usable from Rust and Python.

? What makes Burn suitable for microcontrollers?
- [ ] It uses Python
- [x] It supports no_std, and the backend is chosen at compile time
- [ ] It only runs on GPUs
> The same model code can target a GPU or a chip with no operating system.

? You trained a model in PyTorch and want to serve it from a Rust web service. What's the usual route?
- [ ] Rewrite and retrain it in Rust
- [x] Export it to ONNX and run it with ort or tract
- [ ] Call Python from Rust for each request
> ONNX is the common exchange format between frameworks and runtimes.
:::
