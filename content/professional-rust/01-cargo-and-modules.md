---
title: Install Rust, Cargo projects and modules
summary: Set up Rust on your own machine, structure a project with modules and visibility, and use crates from crates.io.
minutes: 50
kind: lesson
language: rust
---

Until now everything ran on the Rust Playground. Real projects live on your machine, so it's time to install Rust.

## Installing Rust

Rust is installed with **rustup**, which manages compiler versions and extra targets (like microcontrollers):

```bash
# macOS and Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows: download and run rustup-init.exe from https://rustup.rs
# (it will ask you to install the Visual Studio C++ build tools first)

rustc --version          # check it worked
cargo --version
rustup update            # update to the latest stable Rust (every 6 weeks)
```

In VS Code, install the **rust-analyzer** extension. It shows types inline, completes code, and underlines errors as you type, so you see the compiler's complaints before you even run `cargo build`.

## A Cargo project

```bash
cargo new league          # a binary (application) project
cargo new --lib ratings   # a library project
```

```text
league/
├── Cargo.toml        # the project file: name, version, edition, dependencies (like pyproject.toml)
├── Cargo.lock        # exact versions of every dependency (like uv.lock); commit it for applications
├── src/
│   └── main.rs       # the binary's entry point (src/lib.rs for a library)
└── target/           # build output; ignored by git
```

```toml
[package]
name = "league"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }
csv = "1"
```

`cargo add csv` adds a dependency for you. The first `cargo build` downloads and compiles the dependencies; later builds only recompile what changed.

| Command | Python equivalent |
| --- | --- |
| `cargo new` | `uv init` |
| `cargo add serde` | `uv add pydantic` |
| `cargo run` | `uv run python main.py` |
| `cargo test` | `pytest` |
| `cargo fmt` | `ruff format` |
| `cargo clippy` | `ruff check` (but much more thorough) |
| `cargo doc --open` | building Sphinx docs |
| `cargo build --release` | (no equivalent: Python isn't compiled) |

:::tip Always run cargo clippy
Clippy has hundreds of lints that catch bugs and suggest more idiomatic code, each with an explanation. Treat its warnings as free code review.
:::

## Modules

As a project grows, you split it into **modules**. A module is a namespace, like a Python module, and it can be written inline with `mod name { ... }` or in its own file:

```rust
mod odds {
    // Private by default: only code inside `odds` can call this.
    fn validate(value: f64) -> bool {
        value.is_finite() && value > 1.0
    }

    // `pub` makes it visible outside the module.
    pub fn implied_probability(value: f64) -> Option<f64> {
        if validate(value) { Some(1.0 / value) } else { None }
    }

    pub mod format {
        pub fn percent(p: f64) -> String {
            format!("{:.1}%", p * 100.0)
        }
    }
}

use odds::format::percent;      // bring a name into scope, like `from x import y`

fn main() {
    let p = odds::implied_probability(2.5).unwrap();
    println!("{}", percent(p));
    // odds::validate(2.5) would not compile: it's private
}
```

**Everything is private unless marked `pub`.** That's the opposite of Python, where everything is public and a leading underscore is only a convention. Rust enforces it: private items can't be used from outside, so you can change them freely without breaking anyone.

This applies to struct fields too. A `pub struct` with private fields can only be built through its public constructor, which is how the `Odds` type in the last project guaranteed valid values:

```rust
mod money {
    #[derive(Debug, Clone, Copy)]
    pub struct Stake {
        cents: u64,              // private field
    }

    impl Stake {
        pub fn from_units(units: f64) -> Option<Stake> {
            if units.is_finite() && units >= 0.0 {
                Some(Stake { cents: (units * 100.0).round() as u64 })
            } else {
                None
            }
        }

        pub fn units(&self) -> f64 {
            self.cents as f64 / 100.0
        }
    }
}

fn main() {
    let s = money::Stake::from_units(10.255).unwrap();
    println!("{:?} = {}", s, s.units());
    // money::Stake { cents: 5 } would not compile: cents is private
}
```

## Modules in files

In a real project, each module usually gets its own file. With this layout:

```text
src/
├── main.rs
├── odds.rs
└── ratings/
    ├── mod.rs        (or src/ratings.rs next to a ratings/ folder)
    └── elo.rs
```

```rust static
// src/main.rs
mod odds;        // load src/odds.rs as the module `odds`
mod ratings;     // load src/ratings/mod.rs

use ratings::elo::expected_score;

fn main() {
    println!("{:?}", odds::implied_probability(2.0));
    println!("{}", expected_score(1600.0, 1500.0));
}
```

```rust static
// src/ratings/mod.rs
pub mod elo;     // load src/ratings/elo.rs
```

Paths inside a crate start from `crate::` (the root), `super::` (the parent module) or `self::` (the current module), like absolute and relative imports in Python.

## Crates: binaries and libraries

A **crate** is one compilation unit: a binary (with `main`) or a library (with `lib.rs`). A **package** (one `Cargo.toml`) can contain a library and several binaries. A common layout puts all the logic in `src/lib.rs` and keeps `src/main.rs` tiny, so the logic is easy to test and reuse.

Some crates you'll meet in the rest of the course:

| Crate | Purpose |
| --- | --- |
| `serde`, `serde_json` | Serialise structs to and from JSON, TOML, CSV, ... |
| `rand` | Random numbers |
| `rayon` | Easy parallel iterators |
| `tokio`, `axum` | Async runtime and web framework |
| `ndarray`, `polars` | Arrays and DataFrames |
| `embedded-hal`, `embassy-*` | Microcontrollers (Phase 12) |
| `pyo3` | Python extensions in Rust (Phase 11) |

Crates on the Playground: the Playground includes the 100 most downloaded crates, so you can try `rand` or `serde` there too. Exercises on this site stick to the standard library.

## Practice

:::exercise prust-modules Make a module's API public
The `elo` module below is complete, but nothing in it is public, so the tests (which live outside the module) can't use it.

Press **Check my code** first and read the compiler errors: they name each private item the tests tried to use. Then make exactly the right things public: the `Rating` struct and its `value` method, `Rating::new`, and the `expected_score` and `update` functions. Leave the helper `k_factor` private.

@@starter
mod elo {
    #[derive(Debug, Clone, Copy, PartialEq)]
    struct Rating(f64);

    impl Rating {
        fn new(value: f64) -> Rating {
            Rating(value)
        }

        fn value(&self) -> f64 {
            self.0
        }
    }

    fn k_factor() -> f64 {
        20.0
    }

    fn expected_score(a: Rating, b: Rating) -> f64 {
        1.0 / (1.0 + 10f64.powf((b.0 - a.0) / 400.0))
    }

    fn update(a: Rating, b: Rating, score: f64) -> Rating {
        Rating(a.0 + k_factor() * (score - expected_score(a, b)))
    }
}

@@solution
mod elo {
    #[derive(Debug, Clone, Copy, PartialEq)]
    pub struct Rating(f64);

    impl Rating {
        pub fn new(value: f64) -> Rating {
            Rating(value)
        }

        pub fn value(&self) -> f64 {
            self.0
        }
    }

    fn k_factor() -> f64 {
        20.0
    }

    pub fn expected_score(a: Rating, b: Rating) -> f64 {
        1.0 / (1.0 + 10f64.powf((b.0 - a.0) / 400.0))
    }

    pub fn update(a: Rating, b: Rating, score: f64) -> Rating {
        Rating(a.0 + k_factor() * (score - expected_score(a, b)))
    }
}

@@tests
use super::elo::{expected_score, update, Rating};

/// Equal ratings expect 0.5
#[test]
fn equal() {
    assert_eq!(expected_score(Rating::new(1500.0), Rating::new(1500.0)), 0.5);
}

/// A win against an equal team gains 10 points
#[test]
fn win() {
    let a = update(Rating::new(1500.0), Rating::new(1500.0), 1.0);
    assert_eq!(a.value(), 1510.0);
}

/// 400 points stronger expects about 0.909
#[test]
fn stronger() {
    let e = expected_score(Rating::new(1900.0), Rating::new(1500.0));
    assert!((e - 10.0 / 11.0).abs() < 1e-9);
}

@@hint
Add `pub` in front of `struct Rating`, `fn new`, `fn value`, `fn expected_score` and `fn update`. Keep `k_factor` private: making it public isn't needed by anything outside.
:::

:::quiz prust-cargo-check Quick check
? What is private by default in Rust?
- [ ] Nothing
- [ ] Only functions starting with _
- [x] Everything: functions, structs, fields and modules, unless marked pub
> Privacy is enforced by the compiler, not a naming convention.

? Which file lists a project's dependencies?
- [ ] requirements.txt
- [x] Cargo.toml
- [ ] Cargo.lock
> Cargo.toml lists them; Cargo.lock pins the exact versions that were resolved.

? Why put most logic in src/lib.rs and keep src/main.rs small?
- [x] The library can be tested and reused by other binaries and crates
- [ ] main.rs has a size limit
- [ ] Libraries compile faster
> A thin main is a common, testable layout.

? What does `cargo clippy` do?
- [ ] Formats code
- [x] Lints code for bugs and unidiomatic patterns
- [ ] Removes unused dependencies
> `cargo fmt` formats; clippy lints.
:::
