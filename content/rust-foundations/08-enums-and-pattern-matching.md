---
title: Enums and pattern matching
summary: Model choices with enums, handle every case with match, and replace None with Option.
minutes: 55
kind: lesson
language: rust
---

## Enums

An **enum** is a type that is exactly one of several **variants**:

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum Outcome {
    HomeWin,
    Draw,
    AwayWin,
}

fn main() {
    let results = [Outcome::HomeWin, Outcome::Draw, Outcome::AwayWin];
    let latest = results[1];
    println!("{latest:?}");
    println!("{}", latest == Outcome::HomeWin);
}
```

Python has `enum.Enum` for this, but Rust enums go much further: each variant can carry **its own data**:

```rust expect-warning
#[derive(Debug)]
enum Bet {
    Single { selection: String, odds: f64 },
    Accumulator(Vec<f64>),             // a list of odds that must all win
    Void,                              // cancelled: stake returned
}

fn main() {
    let bets = vec![
        Bet::Single { selection: "Arsenal".to_string(), odds: 2.5 },
        Bet::Accumulator(vec![1.5, 2.0, 1.8]),
        Bet::Void,
    ];
    for bet in &bets {
        println!("{bet:?}");
    }
}
```

(The compiler warns about data you store but never read. Here we only print the bets, so the next example reads them with `match`.)

A value of type `Bet` is a single, an accumulator *or* void, never a confusing mix. In Python you might use a class with optional fields and a `kind` string, and every function would have to remember which fields make sense for which kind.

## match

`match` compares a value against **patterns** and runs the first arm that fits. It's like Python's `match` statement, but with one crucial difference: **it must cover every possible case**, or the program doesn't compile.

```rust
#[derive(Debug)]
enum Bet {
    Single { selection: String, odds: f64 },
    Accumulator(Vec<f64>),
    Void,
}

fn total_odds(bet: &Bet) -> f64 {
    match bet {
        Bet::Single { odds, .. } => *odds,              // .. ignores the other fields
        Bet::Accumulator(legs) => legs.iter().product(),
        Bet::Void => 1.0,
    }
}

fn main() {
    let acca = Bet::Accumulator(vec![1.5, 2.0, 1.8]);
    let single = Bet::Single { selection: "Arsenal".to_string(), odds: 2.5 };
    println!("{:.2}", total_odds(&acca));
    println!("{:.2}", total_odds(&single));
    println!("{:.2}", total_odds(&Bet::Void));
    if let Bet::Single { selection, .. } = &single {
        println!("single on {selection}");
    }
}
```

Each arm **destructures** the variant, pulling out its data into new variables (`odds`, `legs`). Delete the `Bet::Void` arm and compile: the error is `non-exhaustive patterns: Bet::Void not covered`. When you add a new variant months later, the compiler lists every `match` you need to update. That's one of the best safety features in Rust.

`match` is an expression, so it produces a value. Patterns can also be numbers, ranges, tuples and conditions (**guards**):

```rust
fn describe_goals(goals: u32) -> &'static str {
    match goals {
        0 => "goalless",
        1 | 2 => "low scoring",              // | means "or"
        3..=5 => "entertaining",             // an inclusive range
        _ => "a goal fest",                  // _ matches anything else
    }
}

fn classify(score: (u32, u32)) -> String {
    match score {
        (0, 0) => "0-0 draw".to_string(),
        (h, a) if h == a => format!("{h}-{a} score draw"),
        (h, a) if h > a + 2 => format!("home thrashing by {}", h - a),
        (h, a) => format!("{h}-{a}"),
    }
}

fn main() {
    for g in [0, 2, 4, 9] {
        println!("{g}: {}", describe_goals(g));
    }
    for s in [(0, 0), (2, 2), (5, 1), (1, 2)] {
        println!("{}", classify(s));
    }
}
```

(`&'static str` is the type of a string literal that lives for the whole program. The `'static` part is a **lifetime**, covered in Phase 10.)

## Option: Rust has no None

Python uses `None` for "no value", and `None` sneaks in everywhere: `AttributeError: 'NoneType' object has no attribute ...` is one of the most common Python crashes.

Rust has no null at all. A value that might be missing has the type `Option<T>`, an enum from the standard library:

```rust static
enum Option<T> {
    Some(T),     // there is a value, of type T
    None,        // there isn't
}
```

The compiler won't let you use an `Option<f64>` as if it were an `f64`. You must handle the `None` case first:

```rust
fn best_odds(odds: &[f64]) -> Option<f64> {
    if odds.is_empty() {
        return None;
    }
    let mut best = odds[0];
    for &o in odds {
        if o > best {
            best = o;
        }
    }
    Some(best)
}

fn main() {
    let prices = vec![2.1, 2.25, 2.05];
    match best_odds(&prices) {
        Some(o) => println!("Best price: {o}"),
        None => println!("No prices yet"),
    }
    println!("{:?}", best_odds(&[]));
}
```

Many standard library methods return `Option`: `.get(i)` on a `Vec`, `.find()` on a string, `.first()`, `.last()`, `.max()`, `.pop()`, and `HashMap::get`.

## Working with Option

`match` always works, but there are shorter tools for common cases:

```rust
fn main() {
    let scores = vec![3, 1, 4];

    // if let: handle just the Some case
    if let Some(first) = scores.first() {
        println!("first: {first}");
    }

    // unwrap_or: a default when it's None
    let tenth = scores.get(9).copied().unwrap_or(0);
    println!("tenth or 0: {tenth}");

    // map: transform the value inside, if there is one
    let doubled = scores.last().map(|x| x * 2);
    println!("{doubled:?}");

    // let else: get the value or leave the function early
    let Some(max) = scores.iter().max() else {
        println!("empty");
        return;
    };
    println!("max: {max}");
}
```

`.unwrap()` takes the value out and **panics** on `None`. It's fine in quick experiments and tests, but in real code prefer handling the `None` case: a panic on a microcontroller means the device stops working.

## Practice

:::exercise rust-enum-outcome From score to outcome
Write `outcome(home: u8, away: u8) -> Outcome` and `points(o: Outcome, for_home: bool) -> u8`, which returns the league points (3 for a win, 1 for a draw, 0 for a loss) for the home team if `for_home` is true, otherwise for the away team. Use `match`.

@@starter
#[derive(Debug, Clone, Copy, PartialEq)]
enum Outcome {
    HomeWin,
    Draw,
    AwayWin,
}

fn outcome(home: u8, away: u8) -> Outcome {
    todo!()
}

fn points(o: Outcome, for_home: bool) -> u8 {
    todo!()
}

@@solution
#[derive(Debug, Clone, Copy, PartialEq)]
enum Outcome {
    HomeWin,
    Draw,
    AwayWin,
}

fn outcome(home: u8, away: u8) -> Outcome {
    if home > away {
        Outcome::HomeWin
    } else if home == away {
        Outcome::Draw
    } else {
        Outcome::AwayWin
    }
}

fn points(o: Outcome, for_home: bool) -> u8 {
    match (o, for_home) {
        (Outcome::Draw, _) => 1,
        (Outcome::HomeWin, true) | (Outcome::AwayWin, false) => 3,
        _ => 0,
    }
}

@@tests
/// Scores become outcomes
#[test]
fn outcomes() {
    assert_eq!(outcome(2, 0), Outcome::HomeWin);
    assert_eq!(outcome(1, 1), Outcome::Draw);
    assert_eq!(outcome(0, 3), Outcome::AwayWin);
}

/// A home win is 3 points for home, 0 for away
#[test]
fn home_win_points() {
    assert_eq!(points(Outcome::HomeWin, true), 3);
    assert_eq!(points(Outcome::HomeWin, false), 0);
}

/// A draw is 1 point each
#[test]
fn draw_points() {
    assert_eq!(points(Outcome::Draw, true), 1);
    assert_eq!(points(Outcome::Draw, false), 1);
}

/// An away win is 3 points for away
#[test]
fn away_win_points() {
    assert_eq!(points(Outcome::AwayWin, false), 3);
    assert_eq!(points(Outcome::AwayWin, true), 0);
}

@@hint
You can match on a tuple: `match (o, for_home) { (Outcome::Draw, _) => 1, ... }`.
:::

:::exercise rust-option-implied Safe implied probability
Decimal odds below or equal to 1.0 are invalid. Write `implied_probability(odds: f64) -> Option<f64>` that returns `None` for invalid odds and `Some(1.0 / odds)` otherwise.

Then write `fair_odds(probabilities: &[f64]) -> Option<f64>` that returns `Some(1.0 / p)` for the **first** probability strictly between 0 and 1, or `None` if there isn't one.

@@starter
fn implied_probability(odds: f64) -> Option<f64> {
    todo!()
}

fn fair_odds(probabilities: &[f64]) -> Option<f64> {
    todo!()
}

@@solution
fn implied_probability(odds: f64) -> Option<f64> {
    if odds <= 1.0 { None } else { Some(1.0 / odds) }
}

fn fair_odds(probabilities: &[f64]) -> Option<f64> {
    for &p in probabilities {
        if p > 0.0 && p < 1.0 {
            return Some(1.0 / p);
        }
    }
    None
}

@@tests
/// 2.0 is 50%
#[test]
fn valid() {
    assert_eq!(implied_probability(2.0), Some(0.5));
}

/// Odds of 1.0 or less are invalid
#[test]
fn invalid() {
    assert_eq!(implied_probability(1.0), None);
    assert_eq!(implied_probability(0.5), None);
}

/// Skips invalid probabilities
#[test]
fn fair() {
    assert_eq!(fair_odds(&[0.0, 1.5, 0.25, 0.5]), Some(4.0));
}

/// None when nothing is valid
#[test]
fn none_valid() {
    assert_eq!(fair_odds(&[0.0, 1.0]), None);
    assert_eq!(fair_odds(&[]), None);
}

@@hint
`if odds <= 1.0 { None } else { Some(1.0 / odds) }`. For `fair_odds`, loop and `return Some(...)` from inside the loop; after the loop, `None`.
:::

:::exercise rust-enum-sensor Sensor readings
A sensor message is one of three things, modelled by the `Reading` enum. Write `describe(r: &Reading) -> String` returning:

- `Temperature(t)` → `"21.5 °C"` (one decimal place)
- `Humidity(h)` → `"45%"` (no decimals)
- `Error { code }` → `"error 3"`

Then write `average_temperature(readings: &[Reading]) -> Option<f64>`: the average of the temperature readings only, or `None` if there are none.

@@starter
enum Reading {
    Temperature(f64),
    Humidity(f64),
    Error { code: u8 },
}

fn describe(r: &Reading) -> String {
    todo!()
}

fn average_temperature(readings: &[Reading]) -> Option<f64> {
    todo!()
}

@@solution
enum Reading {
    Temperature(f64),
    Humidity(f64),
    Error { code: u8 },
}

fn describe(r: &Reading) -> String {
    match r {
        Reading::Temperature(t) => format!("{t:.1} °C"),
        Reading::Humidity(h) => format!("{h:.0}%"),
        Reading::Error { code } => format!("error {code}"),
    }
}

fn average_temperature(readings: &[Reading]) -> Option<f64> {
    let mut total = 0.0;
    let mut count = 0;
    for r in readings {
        if let Reading::Temperature(t) = r {
            total += t;
            count += 1;
        }
    }
    if count == 0 { None } else { Some(total / count as f64) }
}

@@tests
/// Describes each kind of reading
#[test]
fn describes() {
    assert_eq!(describe(&Reading::Temperature(21.46)), "21.5 °C");
    assert_eq!(describe(&Reading::Humidity(45.2)), "45%");
    assert_eq!(describe(&Reading::Error { code: 3 }), "error 3");
}

/// Averages only the temperatures
#[test]
fn averages() {
    let rs = [
        Reading::Temperature(20.0),
        Reading::Humidity(50.0),
        Reading::Temperature(22.0),
        Reading::Error { code: 1 },
    ];
    assert_eq!(average_temperature(&rs), Some(21.0));
}

/// None without temperatures
#[test]
fn no_temperatures() {
    assert_eq!(average_temperature(&[Reading::Humidity(40.0)]), None);
}

@@hint
`describe` is one `match` with three arms, each using `format!`.

@@hint
In `average_temperature`, use `if let Reading::Temperature(t) = r { ... }` inside the loop to pick out temperatures.
:::

:::quiz rust-enums-check Quick check
? What happens if a `match` doesn't cover every variant of an enum?
- [ ] The missing cases do nothing
- [ ] It panics at run time
- [x] It doesn't compile
> Matches must be exhaustive. Use `_ => ...` to deliberately handle "everything else".

? What type should a function that might not find a value return?
- [ ] The value, or null
- [x] `Option<T>`
- [ ] `T` and a bool
> `Option<T>` makes "might be missing" part of the type, so callers can't forget to check.

? What does `.unwrap()` do on `None`?
- [ ] Returns 0
- [ ] Returns None
- [x] Panics
> Use `unwrap_or`, `if let`, `match` or `let ... else` to handle `None` gracefully.

? Which is true about enum variants in Rust?
- [x] Each variant can hold different data
- [ ] All variants must hold the same fields
- [ ] Variants can only be names, like Python's Enum
> `Single { odds }`, `Accumulator(Vec<f64>)` and `Void` can all be variants of one enum.
:::
