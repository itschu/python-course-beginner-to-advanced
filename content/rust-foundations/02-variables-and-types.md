---
title: Variables, mutability and types
summary: let and mut, shadowing, Rust's number types, overflow, conversions and type inference.
minutes: 50
kind: lesson
language: rust
---

## Variables are immutable by default

In Python, any variable can be reassigned. In Rust, a variable declared with `let` can't change unless you say so with `mut`:

```rust
fn main() {
    let stake = 10.0;
    let mut bankroll = 100.0;   // mut: this one is allowed to change
    bankroll -= stake;
    bankroll += stake * 2.5;
    println!("Bankroll: {bankroll}");
}
```

Try to change `stake` and the compiler stops you:

```rust expect-error
fn main() {
    let stake = 10.0;
    stake = 20.0;
    println!("{stake}");
}
```

The error says `cannot assign twice to immutable variable` and suggests the fix: `help: consider making this binding mutable: mut stake`.

Why make immutability the default? Most values never change after they're computed. When a variable *is* marked `mut`, that tells every reader "watch this one, it changes". It also lets the compiler catch bugs where something is modified by accident.

## Shadowing

You can declare a new variable with the same name. The new one **shadows** the old one:

```rust
fn main() {
    let odds = "2.50";               // text from a file
    let odds: f64 = odds.parse().unwrap();   // now a number, same name
    let odds = odds - 1.0;           // the net payout per unit
    println!("{odds}");
}
```

Shadowing is common when converting a value step by step: you don't need `odds_str`, `odds_float` and `odds_net`. Each `let` creates a brand new variable, so the type can change; `mut` can't do that.

## Every value has a type

Python checks types while the program runs. Rust checks them at compile time, and every variable has exactly one type that never changes. Usually the compiler **infers** it, so you rarely write it:

```rust
fn main() {
    let goals = 3;            // i32: a 32-bit integer (the default)
    let odds = 2.5;           // f64: a 64-bit float (the default)
    let home_win = true;      // bool
    let result = 'H';         // char: one Unicode character, in single quotes
    let team = "Arsenal";     // &str: a piece of text (lesson 6)

    // You can always write the type explicitly:
    let attendance: u32 = 60_704;
    println!("{goals} {odds} {home_win} {result} {team} {attendance}");
}
```

Mixing types is a compile error, not a run-time surprise. Python happily computes `3 + 2.5`; Rust refuses until you convert one side:

```rust expect-error
fn main() {
    let goals = 3;
    let xg = 2.4;
    println!("{}", goals + xg);
}
```

## Integer types

Python has one `int` that grows as large as needed. Rust makes you choose a size, because a size is what the hardware actually works with:

| Type | Range | Typical use |
| --- | --- | --- |
| `u8` | 0 to 255 | bytes, pixel values, sensor registers |
| `i16` | -32,768 to 32,767 | raw accelerometer readings |
| `u16` | 0 to 65,535 | ADC readings on a microcontroller |
| `i32` | about ±2.1 billion | the default integer |
| `u32` | 0 to about 4.3 billion | counts, IDs, hardware registers |
| `i64` / `u64` | about ±9.2 × 10¹⁸ / 0 to 1.8 × 10¹⁹ | timestamps, big totals |
| `usize` | depends on the machine (64-bit on your laptop) | indexes and lengths |

`i` means signed (can be negative), `u` means unsigned. The number is the size in bits. In embedded systems (Phase 12) these choices really matter: a microcontroller has kilobytes of memory, and registers are exactly 8, 16 or 32 bits wide.

```rust
fn main() {
    println!("u8:  {} to {}", u8::MIN, u8::MAX);
    println!("i16: {} to {}", i16::MIN, i16::MAX);
    println!("u32 max: {}", u32::MAX);
    let big = 1_000_000_000_000_u64;      // a suffix sets the type; _ separates digits
    println!("{big}");
}
```

## Overflow

What happens if a `u8` goes past 255? In a debug build, Rust **panics** (crashes with a message) instead of silently giving a wrong answer:

```rust expect-error
fn main() {
    let readings: Vec<u8> = vec![200, 100];
    let total: u8 = readings[0] + readings[1];
    println!("{total}");
}
```

When you *want* specific overflow behaviour, say so with a method:

```rust
fn main() {
    let a: u8 = 200;
    let b: u8 = 100;
    println!("checked:    {:?}", a.checked_add(b));     // None: it would overflow
    println!("saturating: {}", a.saturating_add(b));    // 255: stops at the maximum
    println!("wrapping:   {}", a.wrapping_add(b));      // 44: wraps around like a car odometer
    println!("widened:    {}", a as u16 + b as u16);    // 300: use a bigger type
}
```

Saturating arithmetic is handy for sensor values and audio; wrapping arithmetic is how hardware counters and checksums behave.

## Floats and integer division

`f64` is the same 64-bit float as Python's `float`. `f32` uses half the memory and is what most microcontrollers and GPUs prefer.

Dividing two integers gives an integer, rounded toward zero, like Python's `//` (for positive numbers):

```rust
fn main() {
    println!("{}", 7 / 2);          // 3
    println!("{}", 7 % 2);          // 1, the remainder
    println!("{}", 7.0 / 2.0);      // 3.5
    println!("{}", -7 / 2);         // -3 (Python's -7 // 2 is -4!)
    println!("{}", 2_f64.powi(10)); // 1024: powers are methods
    println!("{:.4}", 2_f64.sqrt());
    println!("{}", (2.567_f64 * 100.0).round() / 100.0);
}
```

## Converting between types with `as`

`as` converts between number types. It's explicit, so you always see where a conversion happens:

```rust
fn main() {
    let goals: i32 = 7;
    let matches: i32 = 3;
    let average = goals as f64 / matches as f64;
    println!("{average:.2} goals per match");

    let raw: u16 = 40_000;
    let volts = raw as f32 / 65_535.0 * 3.3;     // an ADC reading to volts
    println!("{volts:.3} V");

    println!("{}", 3.99_f64 as i32);   // 3: float to int truncates
    println!("{}", 300_i32 as u8);     // 44: int to smaller int keeps the low bits
}
```

:::warning `as` can lose information
`as` never fails: it truncates floats and chops off high bits. For conversions that might not fit, use `u8::try_from(x)`, which returns an error instead (lesson 10).
:::

## Constants

Values that never change and are known before the program runs are `const`. They need a type and are written in `SCREAMING_SNAKE_CASE`:

```rust
const MAX_STAKE: f64 = 50.0;
const LED_PIN: u8 = 25;

fn main() {
    println!("Max stake {MAX_STAKE}, LED on GP{LED_PIN}");
}
```

## Tuples

A tuple groups a fixed number of values, possibly of different types, like a Python tuple:

```rust
fn main() {
    let score: (u8, u8) = (2, 1);
    let (home, away) = score;          // unpacking, like home, away = score
    println!("{home}-{away}, total {}", score.0 + score.1);
}
```

## Practice

:::exercise rust-adc-to-volts ADC to volts
A microcontroller's analog-to-digital converter turns a voltage between 0 and 3.3 V into a `u16` from 0 to 65535.

Write `adc_to_volts(raw: u16) -> f32` that converts a reading back to volts: `raw / 65535 * 3.3`.

@@starter
fn adc_to_volts(raw: u16) -> f32 {
    todo!()
}

@@solution
fn adc_to_volts(raw: u16) -> f32 {
    raw as f32 / 65_535.0 * 3.3
}

@@tests
fn close(a: f32, b: f32) -> bool {
    (a - b).abs() < 1e-4
}

/// 0 is 0 V
#[test]
fn zero() {
    assert!(close(adc_to_volts(0), 0.0));
}

/// 65535 is 3.3 V
#[test]
fn full_scale() {
    assert!(close(adc_to_volts(65_535), 3.3), "got {}", adc_to_volts(65_535));
}

/// Half scale is about 1.65 V
#[test]
fn half() {
    assert!(close(adc_to_volts(32_768), 1.650025), "got {}", adc_to_volts(32_768));
}

@@hint
Convert first: `raw as f32`. A `u16` can't be divided by a float.
:::

:::exercise rust-goal-average Goals per match
Write `goals_per_match(goals: u32, matches: u32) -> f64` that returns the average, rounded to 2 decimal places. If `matches` is 0, return `0.0` instead of dividing by zero.

@@starter
fn goals_per_match(goals: u32, matches: u32) -> f64 {
    todo!()
}

@@solution
fn goals_per_match(goals: u32, matches: u32) -> f64 {
    if matches == 0 {
        return 0.0;
    }
    let average = goals as f64 / matches as f64;
    (average * 100.0).round() / 100.0
}

@@tests
/// 7 goals in 3 matches is 2.33
#[test]
fn rounds() {
    assert_eq!(goals_per_match(7, 3), 2.33);
}

/// 10 goals in 4 matches is 2.5
#[test]
fn exact() {
    assert_eq!(goals_per_match(10, 4), 2.5);
}

/// No matches gives 0.0
#[test]
fn no_matches() {
    assert_eq!(goals_per_match(5, 0), 0.0);
}

@@hint
Convert both numbers with `as f64` before dividing, otherwise `7 / 3` is `2`.

@@hint
To round to 2 places: multiply by 100, `.round()`, divide by 100. `if matches == 0 { return 0.0; }` handles the special case.
:::

:::exercise rust-saturating-volume A volume knob
A volume setting is a `u8` from 0 to 255. Write `turn_up(volume: u8, steps: u8) -> u8` that adds `steps`, but stops at 255 instead of overflowing, and `turn_down(volume: u8, steps: u8) -> u8` that stops at 0.

@@starter
fn turn_up(volume: u8, steps: u8) -> u8 {
    volume + steps
}

fn turn_down(volume: u8, steps: u8) -> u8 {
    volume - steps
}

@@solution
fn turn_up(volume: u8, steps: u8) -> u8 {
    volume.saturating_add(steps)
}

fn turn_down(volume: u8, steps: u8) -> u8 {
    volume.saturating_sub(steps)
}

@@tests
/// Normal steps up and down
#[test]
fn normal() {
    assert_eq!(turn_up(100, 20), 120);
    assert_eq!(turn_down(100, 20), 80);
}

/// Stops at 255
#[test]
fn max() {
    assert_eq!(turn_up(250, 10), 255);
}

/// Stops at 0
#[test]
fn min() {
    assert_eq!(turn_down(5, 10), 0);
}

@@hint
The starter overflows and panics. Integer types have `saturating_add` and `saturating_sub` methods.
:::

:::quiz rust-types-check Quick check
? What happens when you compile `let x = 5; x = 6;`?
- [ ] x becomes 6
- [x] A compile error: x isn't mutable
- [ ] A new variable is created
> Use `let mut x = 5;` to allow reassignment, or `let x = 6;` to shadow it with a new variable.

? Which type would you choose for a value from 0 to 1023 read from a 10-bit sensor, to use as little memory as possible?
- [ ] u8
- [x] u16
- [ ] i64
> A `u8` only goes to 255. A `u16` holds up to 65,535 in 2 bytes.

? What is `7 / 2` in Rust?
- [ ] 3.5
- [x] 3
- [ ] 4
> Both operands are integers, so the result is an integer, rounded toward zero.

? What does `300_i32 as u8` give?
- [ ] 255
- [ ] A compile error
- [x] 44
> `as` keeps the low 8 bits (300 − 256 = 44). Use `u8::try_from` if you want an error instead.
:::
