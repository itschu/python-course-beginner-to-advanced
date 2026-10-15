---
title: Closures and iterators
summary: Anonymous functions that capture their environment, iterator adapters that replace most loops, and implementing Iterator for your own types.
minutes: 55
kind: lesson
language: rust
---

## Closures

A **closure** is an anonymous function, like a Python `lambda` but allowed to contain whole blocks. Parameters go between pipes:

```rust
fn main() {
    let implied = |odds: f64| 1.0 / odds;
    let add = |a, b| a + b;                  // types inferred from use
    let describe = |team: &str, odds: f64| {
        let p = implied(odds);
        format!("{team}: {:.1}%", p * 100.0)
    };
    println!("{}", implied(2.0));
    println!("{}", add(2, 3));
    println!("{}", describe("Arsenal", 2.5));
}
```

Closures **capture** variables from their surroundings:

```rust
fn main() {
    let margin = 0.05;
    let fair = |odds: f64| odds * (1.0 + margin);     // borrows margin
    println!("{:.3}", fair(2.0));

    let mut count = 0;
    let mut record = || count += 1;                   // mutably borrows count
    record();
    record();
    println!("recorded {count}");

    let name = String::from("Arsenal");
    let owns = move || name.len();                    // move: the closure takes ownership of name
    println!("{}", owns());
}
```

By default a closure borrows what it uses, as little as it can. `move` forces it to take ownership, which you need when the closure outlives the current function, for example when it runs on another thread (lesson 8).

## Passing closures to functions

Functions that take closures use one of three traits, depending on what the closure is allowed to do:

| Trait | The closure may | Can be called |
| --- | --- | --- |
| `Fn` | read captured values | many times |
| `FnMut` | change captured values | many times |
| `FnOnce` | consume captured values | once |

```rust
fn apply_to_all(values: &[f64], f: impl Fn(f64) -> f64) -> Vec<f64> {
    let mut out = Vec::new();
    for &v in values {
        out.push(f(v));
    }
    out
}

fn main() {
    let odds = [2.0, 4.0, 5.0];
    let scale = 100.0;
    println!("{:?}", apply_to_all(&odds, |o| scale / o));
    println!("{:?}", apply_to_all(&odds, f64::sqrt));     // a named function works too
}
```

## Iterators

An **iterator** produces a sequence of values on demand, like a Python generator. Every collection can give you one: `.iter()` (borrows each item), `.iter_mut()` (mutably borrows) or `.into_iter()` (takes ownership).

Iterators have dozens of **adapter** methods that transform them. Chained together they replace most loops, and they read like a description of the result:

```rust
fn main() {
    let goals = vec![2, 0, 3, 1, 4, 0, 2];

    let total: i32 = goals.iter().sum();
    let high: Vec<i32> = goals.iter().filter(|&&g| g >= 3).copied().collect();
    let doubled: Vec<i32> = goals.iter().map(|g| g * 2).collect();
    let clean_sheets = goals.iter().filter(|&&g| g == 0).count();
    let max = goals.iter().max();
    let first_big = goals.iter().position(|&g| g >= 3);
    let any_seven = goals.iter().any(|&g| g >= 7);

    println!("{total} {high:?} {doubled:?} {clean_sheets} {max:?} {first_big:?} {any_seven}");
}
```

| Python | Rust iterator |
| --- | --- |
| `[f(x) for x in xs]` | `xs.iter().map(f).collect()` |
| `[x for x in xs if p(x)]` | `xs.iter().filter(p).collect()` |
| `sum(xs)`, `max(xs)`, `len(...)` | `.sum()`, `.max()`, `.count()` |
| `enumerate(xs)` | `.enumerate()` |
| `zip(a, b)` | `a.iter().zip(&b)` |
| `any(...)`, `all(...)` | `.any(...)`, `.all(...)` |
| `itertools.islice(xs, n)` | `.take(n)`, `.skip(n)` |
| `itertools.accumulate` | `.scan(...)` |
| `functools.reduce` | `.fold(init, f)` |
| `sorted(...)`, `reversed(...)` | collect then `.sort()`, or `.rev()` |
| `itertools.chain` | `.chain(...)` |
| `xs[::2]` | `.step_by(2)` |
| `itertools.pairwise` | `.windows(2)` on a slice |

(Why `|&&g|` in `filter`? `.iter()` yields `&i32`, and `filter` passes a reference to *that*, so the closure receives `&&i32`. The `&&g` pattern unwraps both. `.copied()` turns `&i32` items into `i32`.)

## Laziness and collect

Adapters are **lazy**: nothing happens until something consumes the iterator, like `sum`, `count`, a `for` loop or `collect`. Like Python generators, this lets you process huge or even infinite sequences:

```rust
fn main() {
    // the first 5 square numbers above 50, from an infinite range
    let squares: Vec<u64> = (1..).map(|n: u64| n * n).filter(|&s| s > 50).take(5).collect();
    println!("{squares:?}");
}
```

`collect` can build many kinds of collection. Tell it which with a type annotation:

```rust
use std::collections::{HashMap, HashSet};

fn main() {
    let teams = ["Arsenal", "Chelsea", "Arsenal", "Spurs"];
    let unique: HashSet<&str> = teams.iter().copied().collect();
    let lengths: HashMap<&str, usize> = teams.iter().map(|t| (*t, t.len())).collect();
    let joined: String = teams.iter().map(|t| &t[..1]).collect();
    // Collecting Results: Ok(Vec) if all parse, or the first Err
    let parsed: Result<Vec<f64>, _> = "2.1 3.4 3.6".split(' ').map(str::parse::<f64>).collect();
    println!("{} {} {joined} {parsed:?}", unique.len(), lengths["Spurs"]);
}
```

## Iterators are fast

You might expect all those closures to be slower than a hand-written loop. They aren't: the compiler inlines everything and usually produces exactly the same machine code, sometimes better (it can skip bounds checks). This is another **zero-cost abstraction**. Write the clear version.

## fold and scan

`fold` carries an accumulator through the sequence; `scan` does the same but yields each intermediate value:

```rust
fn main() {
    let profits = [10.0, -5.0, 20.0, -15.0, 5.0];
    let final_bank = profits.iter().fold(100.0, |bank, p| bank + p);
    let history: Vec<f64> = profits
        .iter()
        .scan(100.0, |bank, p| {
            *bank += p;
            Some(*bank)
        })
        .collect();
    println!("{final_bank} {history:?}");

    let prices = [1.10, 1.12, 1.11, 1.15];
    let returns: Vec<f64> = prices.windows(2).map(|w| w[1] / w[0] - 1.0).collect();
    println!("{returns:.4?}");
}
```

## Implementing Iterator

Any type can be an iterator by implementing one method, `next`, returning `Some(item)` or `None` when it's finished. Then every adapter works on it:

```rust
struct Fibonacci {
    a: u64,
    b: u64,
}

impl Iterator for Fibonacci {
    type Item = u64;

    fn next(&mut self) -> Option<u64> {
        let current = self.a;
        self.a = self.b;
        self.b += current;
        Some(current)
    }
}

fn main() {
    let fib = Fibonacci { a: 0, b: 1 };
    let even: Vec<u64> = fib.filter(|n| n % 2 == 0).take(6).collect();
    println!("{even:?}");
}
```

`type Item = u64;` is an **associated type**: part of the trait that each implementor fills in.

## Practice

:::exercise prust-iter-stats Season stats with iterators
`matches` holds `(home_goals, away_goals)` pairs. Using iterator methods (no `for` loops), write:

- `total_goals(matches: &[(u32, u32)]) -> u32`
- `home_win_rate(matches: &[(u32, u32)]) -> f64`: the fraction of home wins (0.0 for no matches)
- `high_scoring(matches: &[(u32, u32)], min_goals: u32) -> Vec<usize>`: the indexes of matches with at least `min_goals` goals

@@starter
fn total_goals(matches: &[(u32, u32)]) -> u32 {
    todo!()
}

fn home_win_rate(matches: &[(u32, u32)]) -> f64 {
    todo!()
}

fn high_scoring(matches: &[(u32, u32)], min_goals: u32) -> Vec<usize> {
    todo!()
}

@@solution
fn total_goals(matches: &[(u32, u32)]) -> u32 {
    matches.iter().map(|(h, a)| h + a).sum()
}

fn home_win_rate(matches: &[(u32, u32)]) -> f64 {
    if matches.is_empty() {
        return 0.0;
    }
    let wins = matches.iter().filter(|(h, a)| h > a).count();
    wins as f64 / matches.len() as f64
}

fn high_scoring(matches: &[(u32, u32)], min_goals: u32) -> Vec<usize> {
    matches
        .iter()
        .enumerate()
        .filter(|(_, (h, a))| h + a >= min_goals)
        .map(|(i, _)| i)
        .collect()
}

@@tests
const SEASON: [(u32, u32); 4] = [(2, 1), (0, 0), (3, 3), (1, 2)];

/// Total goals
#[test]
fn total() {
    assert_eq!(total_goals(&SEASON), 12);
}

/// Home win rate
#[test]
fn rate() {
    assert_eq!(home_win_rate(&SEASON), 0.25);
    assert_eq!(home_win_rate(&[]), 0.0);
}

/// Indexes of high-scoring matches
#[test]
fn high() {
    assert_eq!(high_scoring(&SEASON, 3), vec![0, 2, 3]);
    assert_eq!(high_scoring(&SEASON, 6), vec![2]);
}


@@hint
`matches.iter().map(|(h, a)| h + a).sum()`. Closures can destructure tuples in their parameters.

@@hint
For `high_scoring`: `.enumerate()`, then `.filter(|(_, (h, a))| h + a >= min_goals)`, then `.map(|(i, _)| i)`, then `.collect()`.
:::

:::exercise prust-iter-impl A countdown iterator
Implement `Iterator` for `Countdown` so that `Countdown::new(3)` yields `3, 2, 1` and then stops. Then write `launch_sequence(from: u32) -> String` that returns, for example, `"3...2...1...liftoff!"` using your iterator and adapters.

@@starter
struct Countdown {
    remaining: u32,
}

impl Countdown {
    fn new(from: u32) -> Countdown {
        Countdown { remaining: from }
    }
}

// impl Iterator for Countdown { ... }

fn launch_sequence(from: u32) -> String {
    todo!()
}

@@solution
struct Countdown {
    remaining: u32,
}

impl Countdown {
    fn new(from: u32) -> Countdown {
        Countdown { remaining: from }
    }
}

impl Iterator for Countdown {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        if self.remaining == 0 {
            return None;
        }
        let current = self.remaining;
        self.remaining -= 1;
        Some(current)
    }
}

fn launch_sequence(from: u32) -> String {
    let steps: String = Countdown::new(from).map(|n| format!("{n}...")).collect();
    steps + "liftoff!"
}

@@tests
/// Counts down and stops
#[test]
fn counts() {
    let values: Vec<u32> = Countdown::new(3).collect();
    assert_eq!(values, vec![3, 2, 1]);
}

/// Works with adapters
#[test]
fn adapters() {
    let total: u32 = Countdown::new(4).sum();
    assert_eq!(total, 10);
}

/// The launch sequence
#[test]
fn launch() {
    assert_eq!(launch_sequence(3), "3...2...1...liftoff!");
    assert_eq!(launch_sequence(0), "liftoff!");
}

@@hint
`impl Iterator for Countdown { type Item = u32; fn next(&mut self) -> Option<u32> { ... } }`. Return `None` when `remaining` is 0.

@@hint
`Countdown::new(from).map(|n| format!("{n}...")).collect::<String>()` builds the first part.
:::

:::quiz prust-iter-check Quick check
? When does `v.iter().map(f).filter(p)` run `f`?
- [ ] Immediately, for every item
- [x] Only when something consumes the iterator, like collect or sum
> Adapters are lazy, like Python generators.

? Which closure trait does a closure that increments a captured counter implement?
- [ ] Fn
- [x] FnMut
- [ ] Only FnOnce
> It changes captured state, so it needs FnMut (and can be called many times).

? Are iterator chains slower than hand-written loops?
- [ ] Yes, closures add overhead
- [x] Usually not: they compile to the same machine code
> Iterators are a zero-cost abstraction.

? What does `move` before a closure do?
- [x] Makes the closure take ownership of the variables it captures
- [ ] Moves the closure to another thread
- [ ] Makes the closure callable only once
> It's needed when the closure must outlive the variables' scope, e.g. on another thread.
:::
