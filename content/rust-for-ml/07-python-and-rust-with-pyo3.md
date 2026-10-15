---
title: Speed up Python with Rust (PyO3)
summary: Find the slow loop, rewrite it in Rust, and call it from Python as a normal module with PyO3 and maturin, the way Polars and pydantic-core are built.
minutes: 55
kind: lesson
language: rust
---

You don't have to choose between Python and Rust. The most practical way to use Rust in ML is often to keep your Python project and move **one slow function** into Rust. That's how Polars, pydantic-core, tokenizers, ruff and orjson work: a Rust core with a Python interface.

## Step 1: find the slow loop

Most data work is fast in NumPy and pandas. The trouble starts with **sequential** logic that can't be vectorised: each step depends on the previous one. Elo ratings are a classic example from Phase 6: every match updates the ratings used by the next match.

```python
import time
import numpy as np

def elo_features(home, away, result, n_teams, k=20.0):
    """For each match, the home team's pre-match Elo advantage. Leak-free: ratings update after."""
    ratings = [1500.0] * n_teams
    out = np.empty(len(home))
    for i in range(len(home)):
        h, a = home[i], away[i]
        diff = ratings[h] - ratings[a]
        out[i] = diff
        expected = 1.0 / (1.0 + 10 ** (-diff / 400.0))
        change = k * (result[i] - expected)
        ratings[h] += change
        ratings[a] -= change
    return out

rng = np.random.default_rng(0)
n = 100_000
home = rng.integers(0, 20, n)
away = (home + rng.integers(1, 20, n)) % 20
result = rng.choice([0.0, 0.5, 1.0], n)

t0 = time.perf_counter()
features = elo_features(home, away, result, 20)
print(f"{n:,} matches in {time.perf_counter() - t0:.2f} s")
print(features[:5])
```

There's no NumPy trick that removes this loop. In Rust, the same function processes millions of matches per second.

## Step 2: write the core in plain Rust

Keep the core free of any Python types, so it's easy to test with `cargo test` and reuse elsewhere:

```rust
fn elo_features(home: &[usize], away: &[usize], result: &[f64], n_teams: usize, k: f64) -> Vec<f64> {
    let mut ratings = vec![1500.0; n_teams];
    let mut out = Vec::with_capacity(home.len());
    for ((&h, &a), &r) in home.iter().zip(away).zip(result) {
        let diff = ratings[h] - ratings[a];
        out.push(diff);
        let expected = 1.0 / (1.0 + 10f64.powf(-diff / 400.0));
        let change = k * (r - expected);
        ratings[h] += change;
        ratings[a] -= change;
    }
    out
}

fn main() {
    let home = [0, 1, 2, 0];
    let away = [1, 2, 0, 2];
    let result = [1.0, 0.5, 0.0, 1.0];
    println!("{:.2?}", elo_features(&home, &away, &result, 3, 20.0));
}
```

## Step 3: wrap it with PyO3

Create the project with [maturin](https://www.maturin.rs/), the build tool for Rust-powered Python packages:

```bash
uv tool install maturin
maturin new --bindings pyo3 fastelo
cd fastelo
cargo add numpy            # NumPy array support for PyO3
```

```rust static
// src/lib.rs
use numpy::{IntoPyArray, PyArray1, PyReadonlyArray1};
use pyo3::prelude::*;

/// Pre-match Elo advantage for each match (home rating minus away rating).
#[pyfunction]
#[pyo3(signature = (home, away, result, n_teams, k=20.0))]
fn elo_features<'py>(
    py: Python<'py>,
    home: PyReadonlyArray1<'py, i64>,
    away: PyReadonlyArray1<'py, i64>,
    result: PyReadonlyArray1<'py, f64>,
    n_teams: usize,
    k: f64,
) -> PyResult<Bound<'py, PyArray1<f64>>> {
    let (home, away, result) = (home.as_slice()?, away.as_slice()?, result.as_slice()?);
    if home.len() != away.len() || home.len() != result.len() {
        return Err(pyo3::exceptions::PyValueError::new_err("arrays must have the same length"));
    }
    let mut ratings = vec![1500.0; n_teams];
    let mut out = Vec::with_capacity(home.len());
    for i in 0..home.len() {
        let (h, a) = (home[i] as usize, away[i] as usize);
        let diff = ratings[h] - ratings[a];
        out.push(diff);
        let change = k * (result[i] - 1.0 / (1.0 + 10f64.powf(-diff / 400.0)));
        ratings[h] += change;
        ratings[a] -= change;
    }
    Ok(out.into_pyarray(py))
}

#[pymodule]
fn fastelo(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(elo_features, m)?)?;
    Ok(())
}
```

```bash
maturin develop --release     # compile and install into the current virtual environment
```

```python static
import fastelo
features = fastelo.elo_features(home, away, result, 20)   # same results, typically 50-100x faster
```

From Python's side, `fastelo` is an ordinary module. Rust errors become Python exceptions (`PyValueError` above), and NumPy arrays are read without copying. `maturin build --release` produces wheels you can publish to PyPI with `maturin publish`, and users install them with `pip` without needing Rust at all.

:::tip Make it parallel
Inside a PyO3 function you can release Python's GIL while Rust works, then use threads or `rayon` to spread the work across every core: something pure Python can't do. See the "Parallelism" chapter of the [PyO3 guide](https://pyo3.rs/).
:::

## When is it worth it?

- **Yes**: a hot loop with sequential dependencies, custom parsing, simulations (Monte Carlo seasons, backtests), string processing, tree or graph algorithms, anything you'd otherwise write in Cython or C.
- **No**: code that's already one NumPy/pandas/PyTorch call; I/O-bound code waiting on a network or database; code that runs once.

Profile first (Phase 2's `cProfile`), then move the hot spot, and keep a Python reference implementation to test the Rust one against.

## Practice

:::exercise rml-season-sim Monte Carlo season simulator core
A classic job for a Rust extension: simulating thousands of seasons. Write `simulate_points(probs: &[[f64; 3]], home: &[usize], away: &[usize], n_teams: usize, uniforms: &[f64]) -> Vec<u32>`.

For match `i`, `probs[i]` holds `[p_home, p_draw, p_away]`, and `uniforms[i]` is a random number in `[0, 1)` (passed in so results are reproducible). The result is a home win if `u < p_home`, a draw if `u < p_home + p_draw`, otherwise an away win. Award 3 points for a win and 1 each for a draw, and return every team's total.

@@starter
fn simulate_points(probs: &[[f64; 3]], home: &[usize], away: &[usize], n_teams: usize, uniforms: &[f64]) -> Vec<u32> {
    todo!()
}

@@solution
fn simulate_points(probs: &[[f64; 3]], home: &[usize], away: &[usize], n_teams: usize, uniforms: &[f64]) -> Vec<u32> {
    let mut points = vec![0u32; n_teams];
    for i in 0..probs.len() {
        let [p_home, p_draw, _] = probs[i];
        let u = uniforms[i];
        if u < p_home {
            points[home[i]] += 3;
        } else if u < p_home + p_draw {
            points[home[i]] += 1;
            points[away[i]] += 1;
        } else {
            points[away[i]] += 3;
        }
    }
    points
}

@@tests
const P: [f64; 3] = [0.5, 0.3, 0.2];

/// Each random number picks an outcome
#[test]
fn outcomes() {
    let probs = [P, P, P];
    let home = [0, 1, 2];
    let away = [1, 2, 0];
    // home win, draw, away win
    assert_eq!(simulate_points(&probs, &home, &away, 3, &[0.1, 0.6, 0.95]), vec![6, 1, 1]);
}

/// Boundaries: exactly p_home is a draw
#[test]
fn boundaries() {
    assert_eq!(simulate_points(&[P], &[0], &[1], 2, &[0.5]), vec![1, 1]);
    assert_eq!(simulate_points(&[P], &[0], &[1], 2, &[0.8]), vec![0, 3]);
}

/// Teams with no matches have zero points
#[test]
fn idle_team() {
    assert_eq!(simulate_points(&[P], &[0], &[1], 3, &[0.0]), vec![3, 0, 0]);
}

@@hint
Destructure the probabilities with `let [p_home, p_draw, _] = probs[i];`, then compare `uniforms[i]` with `p_home` and `p_home + p_draw`.
:::

:::quiz rml-pyo3-check Quick check
? Which kind of Python code benefits most from moving to Rust?
- [ ] A single large NumPy matrix multiply
- [x] A loop where each step depends on the previous one, like Elo updates
- [ ] Code waiting on a database
> NumPy already runs big array operations in compiled code; sequential loops can't be vectorised.

? What does maturin do?
- [x] Builds a Rust crate into a Python extension module or wheel
- [ ] Converts Python code to Rust
- [ ] Runs Rust in the browser
> `maturin develop` installs it into your virtual environment; `maturin build` makes wheels.

? Why keep the core function free of PyO3 types?
- [ ] PyO3 can't handle Vec
- [x] It's easier to unit test with cargo test and reuse outside Python
- [ ] It compiles faster
> A thin binding layer around a plain Rust core is the usual design.
:::
