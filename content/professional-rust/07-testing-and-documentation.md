---
title: Testing and documentation
summary: Unit tests, should_panic, testing with mocks through traits, integration tests, doc tests and benchmarks.
minutes: 45
kind: lesson
language: rust
---

Testing is built into Rust: no extra framework to install. You've been passing tests all phase; now you'll write them.

## Unit tests

Tests live in a `tests` module in the same file as the code, marked `#[cfg(test)]` so they're only compiled when testing:

```rust static
pub fn implied_probability(odds: f64) -> f64 {
    1.0 / odds
}

#[cfg(test)]
mod tests {
    use super::*;          // the parent module's items, including private ones

    #[test]
    fn evens_is_half() {
        assert_eq!(implied_probability(2.0), 0.5);
    }

    #[test]
    fn probabilities_are_below_one() {
        for odds in [1.01, 2.0, 50.0] {
            let p = implied_probability(odds);
            assert!(p > 0.0 && p < 1.0, "odds {odds} gave {p}");
        }
    }
}
```

Run them with `cargo test`. Each `#[test]` function passes if it returns without panicking.

| Macro | Checks | pytest equivalent |
| --- | --- | --- |
| `assert!(cond)` | `cond` is true | `assert cond` |
| `assert!(cond, "msg {x}")` | the same, with a message | `assert cond, f"msg {x}"` |
| `assert_eq!(a, b)` | `a == b`, printing both on failure | `assert a == b` |
| `assert_ne!(a, b)` | `a != b` | `assert a != b` |
| `#[should_panic]` | the test panics | `pytest.raises(...)` |

Floats rarely compare exactly, so write a helper like `fn close(a: f64, b: f64) -> bool { (a - b).abs() < 1e-9 }`, or use the `approx` crate.

Tests can also return `Result`, so you can use `?` inside them:

```rust static
#[test]
fn parses_market() -> Result<(), String> {
    let m = Market::parse("2.10 3.40 3.60")?;
    assert!(m.margin() > 0.0);
    Ok(())
}
```

## Testing panics

```rust static
#[test]
#[should_panic(expected = "stake can't be negative")]
fn negative_stake_panics() {
    Bet::new(2.0, -5.0);
}
```

## Integration tests and doc tests

- **Integration tests** go in a `tests/` folder next to `src/`. Each file is compiled as a separate crate that uses your library like an outside user would: only `pub` items are visible.
- **Doc tests**: code examples in `///` documentation comments are compiled and run by `cargo test`. Your documentation can never go out of date:

```rust static
/// Converts decimal odds to an implied probability.
///
/// ```
/// let p = betting::implied_probability(4.0);
/// assert_eq!(p, 0.25);
/// ```
pub fn implied_probability(odds: f64) -> f64 {
    1.0 / odds
}
```

`cargo doc --open` turns these comments into a website like the ones on [docs.rs](https://docs.rs/), where every published crate's documentation lives.

## Testing code that talks to hardware

How do you test code that reads a sensor or sends an email? Put the outside world behind a **trait**, and give the tests a fake ("mock") implementation. This is the single most useful testing pattern in embedded Rust, and you'll use it heavily in Phase 12:

```rust
trait Thermometer {
    fn read_celsius(&mut self) -> f64;
}

struct Fan {
    on: bool,
}

// The controller works with ANY thermometer: a real sensor or a fake one.
fn update_fan<T: Thermometer>(sensor: &mut T, fan: &mut Fan) {
    let t = sensor.read_celsius();
    if t > 28.0 {
        fan.on = true;
    } else if t < 25.0 {
        fan.on = false;          // between 25 and 28: leave it alone (hysteresis)
    }
}

// A fake thermometer that replays a list of readings.
struct FakeThermometer {
    readings: Vec<f64>,
}

impl Thermometer for FakeThermometer {
    fn read_celsius(&mut self) -> f64 {
        self.readings.remove(0)
    }
}

fn main() {
    let mut sensor = FakeThermometer { readings: vec![24.0, 29.0, 27.0, 24.5] };
    let mut fan = Fan { on: false };
    for _ in 0..4 {
        update_fan(&mut sensor, &mut fan);
        println!("fan on: {}", fan.on);
    }
}
```

The `update_fan` logic is now fully testable on your laptop, with no hardware attached. On the device, a real `Tmp102` driver implements the same trait.

## Benchmarks and profiling

- `cargo bench` with the [`criterion`](https://docs.rs/criterion) crate measures how long code takes, with statistics, so you can compare changes reliably.
- Always benchmark `--release` builds.
- `cargo flamegraph` shows where time is spent.

## Practice

:::exercise prust-write-tests Write the tests
This time the function is written for you, and **you write the tests**. `median(values: &mut [f64]) -> Option<f64>` sorts the values and returns the median. Write at least three `#[test]` functions in the editor below the function:

1. `odd_length`: the median of `[3.0, 1.0, 2.0]` is `Some(2.0)`
2. `even_length`: the median of `[4.0, 1.0, 3.0, 2.0]` is `Some(2.5)`
3. `empty`: the median of an empty slice is `None`

The checker calls each of your test functions and reports whether it exists and passes. (Once it passes, try breaking `median` on purpose, for example by deleting the `sort_by` line, and run your tests with **Run only** to see them catch the bug.)

@@starter
fn median(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.total_cmp(b));
    let mid = values.len() / 2;
    if values.len() % 2 == 0 {
        Some((values[mid - 1] + values[mid]) / 2.0)
    } else {
        Some(values[mid])
    }
}

#[test]
fn odd_length() {
    todo!()
}

@@solution
fn median(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.total_cmp(b));
    let mid = values.len() / 2;
    if values.len() % 2 == 0 {
        Some((values[mid - 1] + values[mid]) / 2.0)
    } else {
        Some(values[mid])
    }
}

#[test]
fn odd_length() {
    assert_eq!(median(&mut [3.0, 1.0, 2.0]), Some(2.0));
}

#[test]
fn even_length() {
    assert_eq!(median(&mut [4.0, 1.0, 3.0, 2.0]), Some(2.5));
}

#[test]
fn empty() {
    assert_eq!(median(&mut []), None);
}

@@tests
/// Your odd_length test exists and passes
#[test]
fn has_odd_length() {
    super::odd_length();
}

/// Your even_length test exists and passes
#[test]
fn has_even_length() {
    super::even_length();
}

/// Your empty test exists and passes
#[test]
fn has_empty() {
    super::empty();
}

@@hint
Each test is a function marked `#[test]` containing an assertion, for example `assert_eq!(median(&mut [3.0, 1.0, 2.0]), Some(2.0));`.

@@hint
For the empty case, `median(&mut [])` works: Rust infers the slice type from the function's parameter.
:::

:::exercise prust-mock-sensor Test with a mock
Write a `FakeButton` that implements the `Button` trait by returning the values from a list, one per call (and `false` once the list runs out). Then write `count_presses(button: &mut impl Button, polls: usize) -> u32` that polls the button `polls` times and counts **presses**: changes from not-pressed to pressed. Holding the button down counts once.

@@starter
trait Button {
    fn is_pressed(&mut self) -> bool;
}

struct FakeButton {
    states: Vec<bool>,
    next: usize,
}

impl FakeButton {
    fn new(states: Vec<bool>) -> FakeButton {
        FakeButton { states, next: 0 }
    }
}

// impl Button for FakeButton { ... }

fn count_presses(button: &mut impl Button, polls: usize) -> u32 {
    todo!()
}

@@solution
trait Button {
    fn is_pressed(&mut self) -> bool;
}

struct FakeButton {
    states: Vec<bool>,
    next: usize,
}

impl FakeButton {
    fn new(states: Vec<bool>) -> FakeButton {
        FakeButton { states, next: 0 }
    }
}

impl Button for FakeButton {
    fn is_pressed(&mut self) -> bool {
        let state = self.states.get(self.next).copied().unwrap_or(false);
        self.next += 1;
        state
    }
}

fn count_presses(button: &mut impl Button, polls: usize) -> u32 {
    let mut was_pressed = false;
    let mut count = 0;
    for _ in 0..polls {
        let pressed = button.is_pressed();
        if pressed && !was_pressed {
            count += 1;
        }
        was_pressed = pressed;
    }
    count
}

@@tests
/// The fake replays its states, then reports false
#[test]
fn fake_replays() {
    let mut b = FakeButton::new(vec![true, false]);
    assert!(b.is_pressed());
    assert!(!b.is_pressed());
    assert!(!b.is_pressed());
}

/// Holding the button counts as one press
#[test]
fn hold_counts_once() {
    let mut b = FakeButton::new(vec![false, true, true, true, false]);
    assert_eq!(count_presses(&mut b, 5), 1);
}

/// Separate presses are counted
#[test]
fn separate_presses() {
    let mut b = FakeButton::new(vec![true, false, true, true, false, true]);
    assert_eq!(count_presses(&mut b, 10), 3);
}

@@hint
In the fake: `self.states.get(self.next).copied().unwrap_or(false)`, then increase `self.next`.

@@hint
In `count_presses`, remember the previous state. A press is `pressed && !was_pressed`.
:::

:::quiz prust-testing-check Quick check
? Why are unit tests wrapped in `#[cfg(test)]`?
- [x] So they're only compiled when running tests, not in the final program
- [ ] To make them run in parallel
- [ ] It's required for assert_eq!
> `cfg(test)` is conditional compilation: the module disappears from normal builds.

? Where are doc tests written?
- [ ] In tests/
- [x] In code blocks inside /// documentation comments
- [ ] In README.md only
> `cargo test` compiles and runs every example in your docs.

? How do you unit test logic that reads a hardware sensor?
- [ ] You can't without hardware
- [x] Put the sensor behind a trait and use a fake implementation in tests
- [ ] Use unsafe code
> Traits let the same logic run against a real driver or a mock.
:::
