---
title: Where Rust fits in machine learning
summary: What Python is great at, where it struggles, and the jobs in the ML stack that Rust now does, from tokenizers to devices.
minutes: 35
kind: lesson
language: rust
---

Python is, and will remain, the language of machine learning research and experimentation. Its ecosystem (NumPy, pandas, scikit-learn, PyTorch, Jupyter) is unmatched, and you can try an idea in minutes. So why has Rust spread through the ML world?

## Python is fast only when Python isn't running

NumPy, PyTorch and scikit-learn are fast because the heavy loops run in C, C++, Fortran or CUDA. The moment your own Python code loops over data, it slows down dramatically. Run this:

```python
import time
import numpy as np

values = np.random.default_rng(0).random(1_000_000)

t0 = time.perf_counter()
total = 0.0
for v in values:          # a Python loop: one interpreter step per element
    total += v * v
t1 = time.perf_counter()
fast = float(np.dot(values, values))   # one call into compiled code
t2 = time.perf_counter()

print(f"python loop: {total:.2f} in {(t1 - t0) * 1000:.0f} ms")
print(f"numpy:       {fast:.2f} in {(t2 - t1) * 1000:.1f} ms")
```

(It's even slower in the browser, which runs Python on WebAssembly.) The same plain loop in Rust is as fast as the NumPy call, because Rust compiles to machine code:

```rust
use std::time::Instant;

fn main() {
    // a simple pseudo-random generator, so we need no crates
    let mut x: u64 = 42;
    let values: Vec<f64> = (0..1_000_000)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            (x >> 11) as f64 / (1u64 << 53) as f64
        })
        .collect();

    let start = Instant::now();
    let mut total = 0.0;
    for v in &values {
        total += v * v;
    }
    println!("rust loop: {total:.2} in {:.1} ms (debug build!)", start.elapsed().as_secs_f64() * 1000.0);
}
```

This matters whenever the work doesn't fit neatly into big array operations: tokenising text, parsing data, custom feature engineering, tree traversal, simulations, game logic, or serving many small predictions with low latency.

## Where Rust is used in ML today

| Job | Rust project | Why Rust |
| --- | --- | --- |
| DataFrames | **Polars** | Multi-threaded, memory-efficient, often 5 to 20× faster than pandas |
| Tokenising text for LLMs | Hugging Face **tokenizers** | Tokenising terabytes of text in Python would take forever |
| Data validation | **pydantic-core** | The engine behind Pydantic v2 (and FastAPI) |
| Python tooling | **uv**, **ruff** | Package management and linting 10 to 100× faster |
| Model inference | **Candle**, **Burn**, **ort**, **tract** | Small binaries, no Python, predictable latency |
| Vector databases | **Qdrant**, LanceDB | Fast similarity search for retrieval (RAG) |
| LLM serving | Hugging Face **text-embeddings-inference**, routers in TGI | Throughput and safety in long-running servers |
| Edge and embedded ML | **Burn** (no_std), **microflow** | Runs on microcontrollers with no OS (Phase 13) |

Notice the pattern: **train in Python, run in Rust**. Research, exploration and training stay in Python with PyTorch or scikit-learn. Rust takes over for data processing at scale, Python extensions, inference services, and devices where Python can't go.

## What you'll do in this phase

1. Build the maths yourself: vectors, matrices, linear and logistic regression, and a small neural network trained with backpropagation, all in plain Rust. You built these in Python in Phases 4 and 7, so you can focus on the Rust.
2. Tour the real libraries: ndarray, Polars, linfa, Candle and Burn.
3. Call Rust from Python with PyO3, the way Polars and pydantic-core do.
4. Move a trained model from Python to Rust and prove both give the same predictions. That's exactly the skill you'll need to put a model on a microcontroller in Phase 13.

:::note Why build things you could import?
In real work, you'll use a library. But writing a matrix multiply and a backward pass once, in a language that makes every allocation and type visible, teaches you what those libraries do and what they cost. It's also the only way on a microcontroller, where most libraries can't run.
:::

## A first exercise

:::exercise rml-dot-product Dot product and norm
Write `dot(a: &[f64], b: &[f64]) -> f64` (the sum of `a[i] * b[i]`) and `norm(a: &[f64]) -> f64` (the square root of `a · a`). You can assume both slices have the same length.

Try writing `dot` with iterators: `zip`, `map` and `sum`.

@@starter
fn dot(a: &[f64], b: &[f64]) -> f64 {
    todo!()
}

fn norm(a: &[f64]) -> f64 {
    todo!()
}

@@solution
fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn norm(a: &[f64]) -> f64 {
    dot(a, a).sqrt()
}

@@tests
/// [1, 2, 3] · [4, 5, 6] = 32
#[test]
fn dot_product() {
    assert_eq!(dot(&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0]), 32.0);
}

/// Orthogonal vectors have a dot product of 0
#[test]
fn orthogonal() {
    assert_eq!(dot(&[1.0, 0.0], &[0.0, 5.0]), 0.0);
}

/// The norm of [3, 4] is 5
#[test]
fn norm_345() {
    assert_eq!(norm(&[3.0, 4.0]), 5.0);
}

@@hint
`a.iter().zip(b).map(|(x, y)| x * y).sum()`.
:::

:::quiz rml-why-check Quick check
? Why is a plain Python loop over a million numbers slow?
- [ ] Python uses 64-bit floats
- [x] Each step goes through the interpreter, checking types and creating objects
- [ ] Python can't use the CPU
> NumPy is fast because the loop runs in compiled C instead.

? What's the most common split between Python and Rust in ML teams?
- [x] Research and training in Python; data processing, extensions and inference in Rust
- [ ] Everything in Rust
- [ ] Training in Rust, inference in Python
> Python's ecosystem wins for experimentation; Rust wins for fast, small, reliable deployment.

? Which of these are written in Rust? (choose all that apply)
- [x] Polars
- [x] Hugging Face tokenizers
- [x] uv and ruff
- [ ] scikit-learn
> scikit-learn is Python with Cython and C++ inside.
:::
