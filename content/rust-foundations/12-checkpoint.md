---
title: "Checkpoint: Rust Foundations"
summary: Test yourself on ownership, borrowing, enums, collections and error handling before moving on.
minutes: 75
kind: checkpoint
language: rust
---

This checkpoint mixes everything from the phase. Try each exercise without hints first; if you get stuck, go back to the lesson rather than straight to the solution.

:::quiz rust-cp-quiz Concepts
? Which line moves ownership?
- [ ] `let n = 5; let m = n;`
- [x] `let s = String::from("a"); let t = s;`
- [ ] `let s = "a"; let t = s;`
> Integers and `&str` are `Copy`. A `String` owns heap memory, so assignment moves it.

? A function only needs to read a list of team names. Which parameter type is best?
- [ ] `Vec<String>`
- [x] `&[String]`
- [ ] `&mut Vec<String>`
> Borrow it, as a slice: the caller keeps ownership, and arrays and parts of vectors work too.

? What's wrong with this code? `let r; { let x = 5; r = &x; } println!("{r}");`
- [ ] Nothing
- [x] r would point at x after x has been dropped
- [ ] x must be mut
> The borrow checker rejects references that outlive the value they point to.

? Which is the idiomatic way to say "this lookup may find nothing"?
- [ ] Return -1
- [ ] Return a null pointer
- [x] Return an `Option`
> Rust has no null; `Option<T>` makes absence explicit in the type.

? What does `let x: u8 = 255; let y = x + 1;` do in a debug build?
- [ ] y is 0
- [ ] y is 256
- [x] It panics with an overflow error
> Debug builds check for overflow. Use `wrapping_add`, `checked_add` or `saturating_add` to choose the behaviour.

? Which of these will the compiler refuse? (choose all that apply)
- [x] Using a `String` after it has been moved
- [x] A `match` on an enum that forgets a variant
- [x] Adding an `i32` to an `f64` without converting
- [ ] Shadowing a variable with a new `let`
> Shadowing is allowed. The other three are compile errors.
:::

:::exercise rust-cp-form Recent form
`results` is a list of results from a team's point of view, oldest first, each `'W'`, `'D'` or `'L'`. Write `form_points(results: &[char], last: usize) -> u32` returning the points (3, 1, 0) from the **most recent** `last` matches. If there are fewer matches than `last`, use them all. Panic-free: ignore any other characters (they count as 0 points but still use up a match).

@@starter
fn form_points(results: &[char], last: usize) -> u32 {
    todo!()
}

@@solution
fn form_points(results: &[char], last: usize) -> u32 {
    let start = results.len().saturating_sub(last);
    let mut total = 0;
    for &r in &results[start..] {
        total += match r {
            'W' => 3,
            'D' => 1,
            _ => 0,
        };
    }
    total
}

@@tests
/// The last 3 of W W L D W are L D W = 4 points
#[test]
fn last_three() {
    assert_eq!(form_points(&['W', 'W', 'L', 'D', 'W'], 3), 4);
}

/// Fewer matches than asked for uses them all
#[test]
fn short() {
    assert_eq!(form_points(&['W', 'D'], 5), 4);
}

/// Unknown characters score nothing
#[test]
fn unknown() {
    assert_eq!(form_points(&['W', '?', 'W'], 2), 3);
}

/// No matches
#[test]
fn empty() {
    assert_eq!(form_points(&[], 5), 0);
}

@@hint
`results.len().saturating_sub(last)` is the index to start from, without underflowing.
:::

:::exercise rust-cp-inventory Component inventory
You're stocking parts for the embedded phase. Write an `Inventory` struct backed by a `HashMap<String, u32>` with:

- `Inventory::new()`
- `add(&mut self, part: &str, count: u32)`
- `take(&mut self, part: &str, count: u32) -> Result<u32, String>`: removes `count` and returns how many are left. If there aren't enough (or the part is unknown), return an `Err` and change nothing.
- `low_stock(&self, threshold: u32) -> Vec<String>`: parts with fewer than `threshold` left, sorted alphabetically.

@@starter
use std::collections::HashMap;

struct Inventory {
    parts: HashMap<String, u32>,
}

impl Inventory {
    fn new() -> Inventory {
        todo!()
    }

    fn add(&mut self, part: &str, count: u32) {
        todo!()
    }

    fn take(&mut self, part: &str, count: u32) -> Result<u32, String> {
        todo!()
    }

    fn low_stock(&self, threshold: u32) -> Vec<String> {
        todo!()
    }
}

@@solution
use std::collections::HashMap;

struct Inventory {
    parts: HashMap<String, u32>,
}

impl Inventory {
    fn new() -> Inventory {
        Inventory { parts: HashMap::new() }
    }

    fn add(&mut self, part: &str, count: u32) {
        *self.parts.entry(part.to_string()).or_insert(0) += count;
    }

    fn take(&mut self, part: &str, count: u32) -> Result<u32, String> {
        let Some(have) = self.parts.get_mut(part) else {
            return Err(format!("unknown part {part}"));
        };
        if *have < count {
            return Err(format!("only {have} {part} left"));
        }
        *have -= count;
        Ok(*have)
    }

    fn low_stock(&self, threshold: u32) -> Vec<String> {
        let mut low: Vec<String> = Vec::new();
        for (part, &count) in &self.parts {
            if count < threshold {
                low.push(part.clone());
            }
        }
        low.sort();
        low
    }
}

@@tests
/// Adding twice accumulates
#[test]
fn add() {
    let mut inv = Inventory::new();
    inv.add("LED", 10);
    inv.add("LED", 5);
    assert_eq!(inv.take("LED", 0), Ok(15));
}

/// Taking reduces the stock
#[test]
fn take() {
    let mut inv = Inventory::new();
    inv.add("resistor 330R", 20);
    assert_eq!(inv.take("resistor 330R", 8), Ok(12));
}

/// Taking too many is an error and changes nothing
#[test]
fn not_enough() {
    let mut inv = Inventory::new();
    inv.add("button", 2);
    assert!(inv.take("button", 3).is_err());
    assert_eq!(inv.take("button", 0), Ok(2));
    assert!(inv.take("servo", 1).is_err());
}

/// Lists low stock alphabetically
#[test]
fn low() {
    let mut inv = Inventory::new();
    inv.add("LED", 3);
    inv.add("button", 1);
    inv.add("wire", 50);
    assert_eq!(inv.low_stock(5), vec!["LED".to_string(), "button".to_string()]);
}

@@hint
`let Some(have) = self.parts.get_mut(part) else { return Err(...); };` gives you a `&mut u32` to change.

@@hint
For `low_stock`, loop over `&self.parts`, push `part.clone()` for low counts, then `.sort()`. (Uppercase letters sort before lowercase ones.)
:::

:::exercise rust-cp-commands Parse a robot command
A small robot accepts commands as text. Write `parse_command(text: &str) -> Result<Command, String>` for:

- `"forward 10"` → `Command::Forward(10)` (a `u32` distance)
- `"turn -90"` → `Command::Turn(-90)` (an `i32` angle, which must be between -180 and 180)
- `"stop"` → `Command::Stop`

Anything else, including missing or bad numbers and extra words, is an `Err`. Extra spaces between words are fine.

@@starter
#[derive(Debug, PartialEq)]
enum Command {
    Forward(u32),
    Turn(i32),
    Stop,
}

fn parse_command(text: &str) -> Result<Command, String> {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
enum Command {
    Forward(u32),
    Turn(i32),
    Stop,
}

fn parse_command(text: &str) -> Result<Command, String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    match words.as_slice() {
        ["stop"] => Ok(Command::Stop),
        ["forward", n] => {
            let distance = n.parse().map_err(|_| format!("bad distance {n}"))?;
            Ok(Command::Forward(distance))
        }
        ["turn", n] => {
            let angle: i32 = n.parse().map_err(|_| format!("bad angle {n}"))?;
            if !(-180..=180).contains(&angle) {
                return Err(format!("angle {angle} out of range"));
            }
            Ok(Command::Turn(angle))
        }
        _ => Err(format!("unknown command {text:?}")),
    }
}

@@tests
/// Parses all three commands
#[test]
fn valid() {
    assert_eq!(parse_command("forward 10"), Ok(Command::Forward(10)));
    assert_eq!(parse_command("turn -90"), Ok(Command::Turn(-90)));
    assert_eq!(parse_command("stop"), Ok(Command::Stop));
}

/// Extra spaces are fine
#[test]
fn spaces() {
    assert_eq!(parse_command("  forward    3 "), Ok(Command::Forward(3)));
}

/// Bad numbers and ranges are errors
#[test]
fn bad_numbers() {
    assert!(parse_command("forward -3").is_err());
    assert!(parse_command("forward ten").is_err());
    assert!(parse_command("turn 270").is_err());
}

/// Unknown or malformed commands are errors
#[test]
fn unknown() {
    assert!(parse_command("jump 3").is_err());
    assert!(parse_command("stop now").is_err());
    assert!(parse_command("forward").is_err());
    assert!(parse_command("").is_err());
}

@@hint
Collect the words into a `Vec<&str>` and `match words.as_slice()`. Slice patterns like `["forward", n]` match exactly two words and bind the second to `n`.
:::

## Phase 9 complete

You can now write real Rust: you understand ownership and borrowing, model data with structs and enums, handle every case with `match`, and treat errors as values. Those ideas are what make Rust both fast and safe, and they're exactly what you'll need on a microcontroller.

Phase 10 covers the professional toolkit: Cargo projects, traits, generics, lifetimes, iterators, smart pointers, concurrency and unsafe code.
