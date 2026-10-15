---
title: Error handling with Result
summary: panic versus Result, the ? operator, your own error types, and turning Options into Results.
minutes: 55
kind: lesson
language: rust
---

Python signals problems with **exceptions**: any function might raise one, and you find out at run time unless you read every line of every function you call. Rust has no exceptions. Instead, it splits problems into two kinds.

## 1. Bugs: panic

A **panic** means "this should never happen, the program is broken". It stops the program (or the thread) with a message. Indexing past the end of a `Vec`, `.unwrap()` on `None`, integer overflow in debug builds, and `todo!()` all panic. You can panic yourself:

```rust expect-error
fn set_stake(stake: f64) {
    if stake < 0.0 {
        panic!("stake can't be negative, got {stake}");
    }
    println!("staking {stake}");
}

fn main() {
    set_stake(10.0);
    set_stake(-5.0);
}
```

Use panics for programming mistakes, not for things that can go wrong in normal use, like a missing file or a typo in user input.

## 2. Expected failures: Result

Operations that can fail in normal use return `Result<T, E>`, another enum from the standard library:

```rust static
enum Result<T, E> {
    Ok(T),     // success, with a value of type T
    Err(E),    // failure, with an error of type E
}
```

The function's signature *tells you* it can fail, and the compiler won't let you use the value without dealing with the error. `str::parse` returns a `Result`:

```rust
fn main() {
    for text in ["2.50", "evens", ""] {
        match text.parse::<f64>() {
            Ok(odds) => println!("{text:?} -> {odds}"),
            Err(e) => println!("{text:?} -> error: {e}"),
        }
    }
}
```

## Returning a Result

Your own functions return `Ok(value)` or `Err(error)`. The error can be any type. A `String` message is fine to start with:

```rust
fn implied_probability(odds: f64) -> Result<f64, String> {
    if odds <= 1.0 {
        return Err(format!("odds must be above 1.0, got {odds}"));
    }
    Ok(1.0 / odds)
}

fn main() {
    println!("{:?}", implied_probability(2.0));
    println!("{:?}", implied_probability(0.8));
    let p = implied_probability(4.0).unwrap_or(0.0);
    println!("{p}");
}
```

## The ? operator

Handling every `Result` with `match` gets long. The `?` operator says: "if this is `Ok`, give me the value; if it's `Err`, **return the error from my function** right now". It's like letting a Python exception propagate, but visible:

```rust
fn parse_odds(text: &str) -> Result<f64, String> {
    let odds: f64 = text.trim().parse().map_err(|_| format!("not a number: {text:?}"))?;
    if odds <= 1.0 {
        return Err(format!("odds must be above 1.0, got {odds}"));
    }
    Ok(odds)
}

fn margin(line: &str) -> Result<f64, String> {
    let mut total = 0.0;
    for part in line.split(',') {
        total += 1.0 / parse_odds(part)?;      // any bad price stops here
    }
    Ok(total - 1.0)
}

fn main() {
    println!("{:?}", margin("2.10, 3.40, 3.60"));
    println!("{:?}", margin("2.10, evens, 3.60"));
    println!("{:?}", margin("2.10, 0.9, 3.60"));
}
```

`map_err` converts one error type into another, here the `ParseFloatError` into a `String`, so that `?` can return it from a function whose error type is `String`. `?` only works inside functions that return a `Result` (or an `Option`).

| Python | Rust |
| --- | --- |
| `raise ValueError("bad")` | `return Err(...)` |
| letting an exception propagate | `?` |
| `try: ... except ValueError as e:` | `match result { Ok(v) => ..., Err(e) => ... }` |
| any function might raise | the signature says whether it can fail |

## Your own error type

A `String` error is fine for small programs, but callers can't easily tell *which* error happened. Real code uses an enum:

```rust
use std::fmt;

#[derive(Debug, PartialEq)]
enum OddsError {
    NotANumber(String),
    TooLow(f64),
}

impl fmt::Display for OddsError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            OddsError::NotANumber(text) => write!(f, "{text:?} isn't a number"),
            OddsError::TooLow(odds) => write!(f, "odds of {odds} are too low"),
        }
    }
}

fn parse_odds(text: &str) -> Result<f64, OddsError> {
    let odds: f64 = text
        .trim()
        .parse()
        .map_err(|_| OddsError::NotANumber(text.to_string()))?;
    if odds <= 1.0 {
        return Err(OddsError::TooLow(odds));
    }
    Ok(odds)
}

fn main() {
    for t in ["2.5", "x", "1.0"] {
        match parse_odds(t) {
            Ok(o) => println!("ok: {o}"),
            Err(OddsError::TooLow(o)) => println!("too low ({o}): skip this market"),
            Err(e) => println!("error: {e}"),
        }
    }
}
```

Implementing `Display` (the `{}` format) gives the error a human-readable message. In real projects, the [`thiserror`](https://docs.rs/thiserror) crate writes that `impl` for you, and [`anyhow`](https://docs.rs/anyhow) gives applications one easy error type for everything.

## Converting between Option and Result

```rust
fn main() {
    let odds = vec![2.1, 3.4];
    // Option -> Result: give a reason for the None
    let third: Result<f64, String> = odds.get(2).copied().ok_or("no third price".to_string());
    println!("{third:?}");
    // Result -> Option: forget the reason
    let parsed: Option<i32> = "42".parse().ok();
    println!("{parsed:?}");
}
```

## main can return a Result

If `main` returns `Result`, you can use `?` in it, and an error ends the program with an error message and a failure exit code:

```rust expect-error
fn main() -> Result<(), String> {
    let stake: f64 = "ten".parse().map_err(|e| format!("bad stake: {e}"))?;
    println!("staking {stake}");
    Ok(())
}
```

`Ok(())` means "success, with nothing to return".

## Practice

:::exercise rust-result-parse-match Parse a result line
Write `parse_line(line: &str) -> Result<(String, String, u32, u32), String>` for lines like `"Arsenal,Chelsea,2,1"`.

Return an `Err` (with any message) if the line doesn't have exactly 4 comma-separated fields, or if either goal count isn't a whole number. Trim spaces around each field.

@@starter
fn parse_line(line: &str) -> Result<(String, String, u32, u32), String> {
    todo!()
}

@@solution
fn parse_line(line: &str) -> Result<(String, String, u32, u32), String> {
    let fields: Vec<&str> = line.split(',').map(|f| f.trim()).collect();
    if fields.len() != 4 {
        return Err(format!("expected 4 fields, got {}", fields.len()));
    }
    let home_goals: u32 = fields[2].parse().map_err(|_| format!("bad home goals: {}", fields[2]))?;
    let away_goals: u32 = fields[3].parse().map_err(|_| format!("bad away goals: {}", fields[3]))?;
    Ok((fields[0].to_string(), fields[1].to_string(), home_goals, away_goals))
}

@@tests
/// Parses a valid line
#[test]
fn valid() {
    assert_eq!(
        parse_line("Arsenal,Chelsea,2,1"),
        Ok(("Arsenal".to_string(), "Chelsea".to_string(), 2, 1))
    );
}

/// Trims spaces
#[test]
fn spaces() {
    assert_eq!(parse_line(" A , B , 0 , 3 "), Ok(("A".to_string(), "B".to_string(), 0, 3)));
}

/// Wrong number of fields is an error
#[test]
fn wrong_fields() {
    assert!(parse_line("Arsenal,Chelsea,2").is_err());
}

/// Bad numbers are an error, not a panic
#[test]
fn bad_number() {
    assert!(parse_line("Arsenal,Chelsea,two,1").is_err());
    assert!(parse_line("Arsenal,Chelsea,2,-1").is_err());
}

@@hint
Split and trim: `line.split(',').map(|f| f.trim()).collect::<Vec<&str>>()`. Check the length first.

@@hint
`fields[2].parse().map_err(|_| "bad goals".to_string())?` parses or returns the error.
:::

:::exercise rust-result-total-stake Total stake
A betting slip is text with one stake per line. Write `total_stake(slip: &str) -> Result<f64, String>` that adds up all the stakes, using `?`. Blank lines are skipped. Any line that isn't a number, or is a negative number, makes the whole function return `Err`.

@@starter
fn total_stake(slip: &str) -> Result<f64, String> {
    todo!()
}

@@solution
fn parse_stake(line: &str) -> Result<f64, String> {
    let stake: f64 = line.parse().map_err(|_| format!("not a stake: {line:?}"))?;
    if stake < 0.0 {
        return Err(format!("negative stake: {stake}"));
    }
    Ok(stake)
}

fn total_stake(slip: &str) -> Result<f64, String> {
    let mut total = 0.0;
    for line in slip.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        total += parse_stake(line)?;
    }
    Ok(total)
}

@@tests
/// Adds the stakes
#[test]
fn adds() {
    assert_eq!(total_stake("10\n5.5\n4.5"), Ok(20.0));
}

/// Skips blank lines
#[test]
fn blanks() {
    assert_eq!(total_stake("10\n\n  \n5"), Ok(15.0));
}

/// Rejects text
#[test]
fn text() {
    assert!(total_stake("10\nten").is_err());
}

/// Rejects negative stakes
#[test]
fn negative() {
    assert!(total_stake("10\n-5").is_err());
}

@@hint
A helper `fn parse_stake(line: &str) -> Result<f64, String>` keeps `total_stake` short: then `total += parse_stake(line)?;`.
:::

:::exercise rust-custom-error A sensor error type
A temperature sensor returns raw readings. Complete `read_celsius(raw: Option<i16>) -> Result<f64, SensorError>`:

- `None` means the sensor didn't answer: return `Err(SensorError::NoResponse)`
- the temperature is `raw as f64 * 0.0625`
- temperatures outside -40 to 125 °C are impossible for this sensor: return `Err(SensorError::OutOfRange(t))` with the temperature you computed

@@starter
#[derive(Debug, PartialEq)]
enum SensorError {
    NoResponse,
    OutOfRange(f64),
}

fn read_celsius(raw: Option<i16>) -> Result<f64, SensorError> {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
enum SensorError {
    NoResponse,
    OutOfRange(f64),
}

fn read_celsius(raw: Option<i16>) -> Result<f64, SensorError> {
    let raw = raw.ok_or(SensorError::NoResponse)?;
    let t = raw as f64 * 0.0625;
    if !(-40.0..=125.0).contains(&t) {
        return Err(SensorError::OutOfRange(t));
    }
    Ok(t)
}

@@tests
/// Converts a normal reading
#[test]
fn normal() {
    assert_eq!(read_celsius(Some(344)), Ok(21.5));
}

/// Negative temperatures work
#[test]
fn negative() {
    assert_eq!(read_celsius(Some(-160)), Ok(-10.0));
}

/// No answer is an error
#[test]
fn no_response() {
    assert_eq!(read_celsius(None), Err(SensorError::NoResponse));
}

/// Impossible values are an error
#[test]
fn out_of_range() {
    assert_eq!(read_celsius(Some(2048)), Err(SensorError::OutOfRange(128.0)));
}

@@hint
`let raw = raw.ok_or(SensorError::NoResponse)?;` turns the `Option` into a `Result` and returns early on `None`.

@@hint
`(-40.0..=125.0).contains(&t)` checks the range.
:::

:::quiz rust-errors-check Quick check
? When should you panic instead of returning an Err?
- [ ] When a file is missing
- [ ] When the user types a bad number
- [x] When the program has a bug and can't sensibly continue
> Expected failures (missing files, bad input, network errors) are `Result`s.

? What does `?` do with an `Err`?
- [ ] Panics
- [x] Returns it from the current function
- [ ] Ignores it
> `?` unwraps `Ok` values and propagates errors to the caller.

? Where can you use `?`?
- [ ] Anywhere
- [x] In functions that return Result (or Option)
- [ ] Only in main
> The error has to be returned somewhere, so the function's return type must allow it.

? What does `opt.ok_or(e)` do?
- [x] Turns Some(v) into Ok(v) and None into Err(e)
- [ ] Unwraps or panics
- [ ] Turns a Result into an Option
> `.ok()` goes the other way, from Result to Option.
:::
