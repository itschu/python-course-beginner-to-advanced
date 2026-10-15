---
title: Structs and methods
summary: Group data into your own types, add methods with impl, and derive Debug, Clone and PartialEq.
minutes: 50
kind: lesson
language: rust
---

A **struct** groups related values into one named type. It's Rust's equivalent of a Python dataclass:

```python static
from dataclasses import dataclass

@dataclass
class Bet:
    selection: str
    odds: float
    stake: float
```

```rust
struct Bet {
    selection: String,
    odds: f64,
    stake: f64,
}

fn main() {
    let bet = Bet {
        selection: String::from("Arsenal"),
        odds: 2.5,
        stake: 10.0,
    };
    println!("{} @ {} for {}", bet.selection, bet.odds, bet.stake);
}
```

Fields are accessed with a dot, like Python. Every field must be given a value: there are no defaults unless you write them.

If a local variable has the same name as a field, you can write it once (the **field init shorthand**):

```rust
struct Match {
    home: String,
    away: String,
    home_goals: u8,
    away_goals: u8,
}

fn main() {
    let home = String::from("Arsenal");
    let away = String::from("Chelsea");
    let m = Match { home, away, home_goals: 2, away_goals: 1 };
    println!("{} {}-{} {}", m.home, m.home_goals, m.away_goals, m.away);
}
```

## Mutability is all or nothing

To change a field, the whole variable must be `mut`:

```rust
struct Bankroll {
    balance: f64,
}

fn main() {
    let mut bank = Bankroll { balance: 100.0 };
    bank.balance -= 10.0;
    println!("{}", bank.balance);
}
```

## Methods with impl

Methods go in a separate `impl` block. The first parameter says how the method uses the value:

| First parameter | Meaning | Python equivalent |
| --- | --- | --- |
| `&self` | Read the value (borrow) | a normal method that doesn't change `self` |
| `&mut self` | Change the value (mutable borrow) | a method that changes `self.x` |
| `self` | Take ownership (the value is consumed) | no real equivalent |
| none | An **associated function**, called on the type | `@staticmethod` / `@classmethod` |

```rust
struct Bet {
    selection: String,
    odds: f64,
    stake: f64,
}

impl Bet {
    // An associated function: called as Bet::new(...). Like a constructor.
    fn new(selection: &str, odds: f64, stake: f64) -> Bet {
        Bet { selection: selection.to_string(), odds, stake }
    }

    fn potential_return(&self) -> f64 {
        self.odds * self.stake
    }

    fn profit_if_won(&self) -> f64 {
        self.potential_return() - self.stake
    }

    fn double_stake(&mut self) {
        self.stake *= 2.0;
    }
}

fn main() {
    let mut bet = Bet::new("Arsenal", 2.5, 10.0);
    println!("{}: returns {}", bet.selection, bet.potential_return());
    bet.double_stake();
    println!("after doubling: profit {}", bet.profit_if_won());
}
```

`new` isn't special in Rust: it's just the conventional name for a constructor. `Self` (capital S) is shorthand for the type being implemented, so `fn new(...) -> Self` is common too.

## Printing structs: derive

Try printing a struct with `{:?}`. It fails, because Rust doesn't assume every type should be printable:

```rust expect-error
struct Point {
    x: f64,
    y: f64,
}

fn main() {
    println!("{:?}", Point { x: 1.0, y: 2.0 });
}
```

The fix is one line. `#[derive(...)]` asks the compiler to write standard behaviour for you, the way `@dataclass` writes `__repr__` and `__eq__`:

```rust
#[derive(Debug, Clone, PartialEq)]
struct Point {
    x: f64,
    y: f64,
}

fn main() {
    let a = Point { x: 1.0, y: 2.0 };
    let b = a.clone();
    println!("{a:?}");
    println!("{b:#?}");
    println!("equal? {}", a == b);
}
```

| Derive | Gives you | Python equivalent |
| --- | --- | --- |
| `Debug` | `{:?}` printing | `__repr__` |
| `Clone` | `.clone()` | `copy.deepcopy` |
| `Copy` | Implicit copies instead of moves (only if all fields are `Copy`) | n/a |
| `PartialEq` | `==` and `!=` | `__eq__` |
| `Default` | `Type::default()` with zeros and empty strings | default field values |

These names (`Debug`, `Clone`, ...) are **traits**: shared behaviour that types can implement. Phase 10 covers traits properly.

## Tuple structs and unit-like structs

A **tuple struct** has fields without names. It's great for giving a distinct type to a plain number, so you can't mix them up:

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
struct Celsius(f64);

#[derive(Debug, Clone, Copy, PartialEq)]
struct Fahrenheit(f64);

fn to_fahrenheit(c: Celsius) -> Fahrenheit {
    Fahrenheit(c.0 * 9.0 / 5.0 + 32.0)
}

fn main() {
    let room = Celsius(21.0);
    println!("{:?}", to_fahrenheit(room));
    // to_fahrenheit(Fahrenheit(70.0)) would not compile: wrong type!
}
```

This "newtype" pattern costs nothing at run time and prevents real bugs. NASA lost the Mars Climate Orbiter in 1999 because one team used pound-force seconds and another used newton-seconds.

## Practice

:::exercise rust-struct-bet A Bet struct
Complete the `Bet` methods:

- `Bet::new(odds: f64, stake: f64) -> Bet`
- `payout(&self, won: bool) -> f64`: `odds * stake` if won, otherwise `0.0`
- `profit(&self, won: bool) -> f64`: payout minus stake

@@starter
#[derive(Debug, Clone, PartialEq)]
struct Bet {
    odds: f64,
    stake: f64,
}

impl Bet {
    fn new(odds: f64, stake: f64) -> Bet {
        todo!()
    }

    fn payout(&self, won: bool) -> f64 {
        todo!()
    }

    fn profit(&self, won: bool) -> f64 {
        todo!()
    }
}

@@solution
#[derive(Debug, Clone, PartialEq)]
struct Bet {
    odds: f64,
    stake: f64,
}

impl Bet {
    fn new(odds: f64, stake: f64) -> Bet {
        Bet { odds, stake }
    }

    fn payout(&self, won: bool) -> f64 {
        if won { self.odds * self.stake } else { 0.0 }
    }

    fn profit(&self, won: bool) -> f64 {
        self.payout(won) - self.stake
    }
}

@@tests
/// new stores the odds and stake
#[test]
fn constructs() {
    assert_eq!(Bet::new(2.5, 10.0), Bet { odds: 2.5, stake: 10.0 });
}

/// A winning bet pays odds × stake
#[test]
fn payout_won() {
    assert_eq!(Bet::new(2.5, 10.0).payout(true), 25.0);
}

/// A losing bet pays nothing
#[test]
fn payout_lost() {
    assert_eq!(Bet::new(2.5, 10.0).payout(false), 0.0);
}

/// Profit is payout minus stake
#[test]
fn profit() {
    let bet = Bet::new(3.0, 5.0);
    assert_eq!(bet.profit(true), 10.0);
    assert_eq!(bet.profit(false), -5.0);
}

@@hint
`Bet { odds, stake }` uses the field init shorthand. Inside methods, read fields with `self.odds`.
:::

:::exercise rust-struct-bankroll A bankroll that records bets
Implement a `Bankroll` with:

- `Bankroll::new(start: f64)`: balance `start`, no history
- `settle(&mut self, profit: f64)`: adds `profit` to the balance and pushes the new balance onto `history`
- `peak(&self) -> f64`: the highest balance ever seen, including the starting balance
- `drawdown(&self) -> f64`: how far the current balance is below the peak

@@starter
struct Bankroll {
    start: f64,
    balance: f64,
    history: Vec<f64>,
}

impl Bankroll {
    fn new(start: f64) -> Bankroll {
        todo!()
    }

    fn settle(&mut self, profit: f64) {
        todo!()
    }

    fn peak(&self) -> f64 {
        todo!()
    }

    fn drawdown(&self) -> f64 {
        todo!()
    }
}

@@solution
struct Bankroll {
    start: f64,
    balance: f64,
    history: Vec<f64>,
}

impl Bankroll {
    fn new(start: f64) -> Bankroll {
        Bankroll { start, balance: start, history: Vec::new() }
    }

    fn settle(&mut self, profit: f64) {
        self.balance += profit;
        self.history.push(self.balance);
    }

    fn peak(&self) -> f64 {
        let mut best = self.start;
        for &b in &self.history {
            if b > best {
                best = b;
            }
        }
        best
    }

    fn drawdown(&self) -> f64 {
        self.peak() - self.balance
    }
}

@@tests
/// Starts with the given balance and empty history
#[test]
fn starts() {
    let b = Bankroll::new(100.0);
    assert_eq!(b.balance, 100.0);
    assert!(b.history.is_empty());
}

/// settle updates the balance and history
#[test]
fn settles() {
    let mut b = Bankroll::new(100.0);
    b.settle(15.0);
    b.settle(-5.0);
    assert_eq!(b.balance, 110.0);
    assert_eq!(b.history, vec![115.0, 110.0]);
}

/// peak and drawdown
#[test]
fn drawdown() {
    let mut b = Bankroll::new(100.0);
    for p in [20.0, -30.0, 5.0] {
        b.settle(p);
    }
    assert_eq!(b.peak(), 120.0);
    assert_eq!(b.drawdown(), 25.0);
}

/// The starting balance counts as a peak
#[test]
fn losing_from_start() {
    let mut b = Bankroll::new(100.0);
    b.settle(-10.0);
    assert_eq!(b.peak(), 100.0);
    assert_eq!(b.drawdown(), 10.0);
}

@@hint
`settle` needs `&mut self` because it changes the struct: `self.balance += profit; self.history.push(self.balance);`.

@@hint
For `peak`, start with `self.start` and loop over `&self.history` keeping the maximum.
:::

:::quiz rust-structs-check Quick check
? Which first parameter should a method have if it only reads the struct?
- [x] `&self`
- [ ] `&mut self`
- [ ] `self`
> `&self` borrows the value; the caller keeps it.

? How do you call an associated function like `new`?
- [ ] `bet.new()`
- [x] `Bet::new()`
- [ ] `new Bet()`
> Associated functions don't take `self`, so they're called on the type with `::`.

? What does `#[derive(Debug)]` do?
- [x] Generates the code needed to print the type with `{:?}`
- [ ] Turns on the debugger
- [ ] Makes the type copyable
> Derives write standard implementations of traits for you.

? Why wrap a plain f64 in `struct Celsius(f64)`?
- [ ] It's faster
- [x] The compiler stops you mixing it up with other f64 values, like Fahrenheit
- [ ] Floats can't be stored in structs otherwise
> The newtype pattern adds type safety for free.
:::
