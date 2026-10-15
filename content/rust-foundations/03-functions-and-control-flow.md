---
title: Functions and control flow
summary: Functions with typed parameters, expressions versus statements, if, loop, while and for.
minutes: 50
kind: lesson
language: rust
---

## Functions

A Rust function lists the type of every parameter and of the return value. Python type hints are optional suggestions; in Rust they're required and enforced:

```rust
fn implied_probability(odds: f64) -> f64 {
    1.0 / odds
}

fn print_line(team: &str, odds: f64) {        // no -> means it returns nothing
    println!("{team}: {:.1}%", implied_probability(odds) * 100.0);
}

fn main() {
    print_line("Home", 2.1);
    print_line("Draw", 3.4);
    print_line("Away", 3.6);
}
```

Functions can be defined in any order: `main` can call a function written below it.

## Expressions and statements

This is the idea that makes Rust code look different from Python. Almost everything in Rust is an **expression**: it produces a value. A **statement** performs an action and produces nothing. Adding `;` to the end of an expression turns it into a statement.

The last expression of a block `{ ... }` is the block's value. That's why the function above has no `return`: its body is the expression `1.0 / odds`.

```rust
fn main() {
    let margin = {
        let total = 1.0 / 2.1 + 1.0 / 3.4 + 1.0 / 3.6;
        total - 1.0                      // no semicolon: the block's value
    };
    println!("Bookmaker margin: {:.2}%", margin * 100.0);
}
```

A common beginner mistake is a stray semicolon at the end of a function:

```rust expect-error
fn double(x: i32) -> i32 {
    x * 2;
}

fn main() {
    println!("{}", double(4));
}
```

The error says `expected i32, found ()`. `()` is called the **unit type**: the "nothing" value, Rust's version of `None` for functions that return nothing. The semicolon turned `x * 2` into a statement, so the body produced `()`. The compiler even suggests removing it.

You *can* use `return` to leave a function early, just like Python:

```rust
fn kelly_fraction(probability: f64, odds: f64) -> f64 {
    let edge = probability * odds - 1.0;
    if edge <= 0.0 {
        return 0.0;       // no edge: don't bet
    }
    edge / (odds - 1.0)
}

fn main() {
    println!("{:.3}", kelly_fraction(0.55, 2.0));
    println!("{:.3}", kelly_fraction(0.40, 2.0));
}
```

## if is an expression

`if` works like Python's, without the colon and with braces. The condition must be a `bool`: Rust doesn't treat `0`, `""` or empty lists as false.

```rust
fn main() {
    let home_goals = 2;
    let away_goals = 2;
    if home_goals > away_goals {
        println!("Home win");
    } else if home_goals == away_goals {
        println!("Draw");
    } else {
        println!("Away win");
    }
}
```

Because `if` is an expression, it can produce a value, which replaces Python's `x if cond else y`:

```rust
fn main() {
    let goals = 3;
    let label = if goals > 2 { "over 2.5" } else { "under 2.5" };
    println!("{label}");
}
```

Both branches must have the same type.

## Loops

Rust has three loops.

**`loop`** repeats forever until you `break`. It can return a value from `break`, which is unusual and handy:

```rust
fn main() {
    let mut bankroll = 100.0;
    let mut bets = 0;
    let rounds = loop {
        bankroll *= 0.9;          // lose 10% each bet
        bets += 1;
        if bankroll < 50.0 {
            break bets;           // the loop's value
        }
    };
    println!("Below half after {rounds} bets ({bankroll:.2} left)");
}
```

On a microcontroller, `main` usually ends with a `loop {}` that runs forever: read sensors, update outputs, repeat. You'll write plenty of those in Phase 12.

**`while`** loops while a condition is true:

```rust
fn main() {
    let mut countdown = 3;
    while countdown > 0 {
        println!("{countdown}...");
        countdown -= 1;
    }
    println!("Kick-off!");
}
```

**`for`** loops over anything iterable, like Python's `for`. Ranges are written `start..end` (end excluded, like `range(start, end)`) or `start..=end` (end included):

```rust
fn main() {
    for minute in 0..3 {
        print!("{minute} ");
    }
    println!();
    for minute in (1..=10).step_by(3) {
        print!("{minute} ");
    }
    println!();
    for minute in (1..=3).rev() {
        print!("{minute} ");
    }
    println!();

    let teams = ["Arsenal", "Chelsea", "Spurs"];
    for (i, team) in teams.iter().enumerate() {
        println!("{}. {team}", i + 1);
    }
}
```

`continue` and `break` work as in Python. When loops are nested, you can label them and break out of the outer one directly, which Python can't do:

```rust
fn main() {
    'search: for home in 0..5 {
        for away in 0..5 {
            if home + away == 7 && home > away {
                println!("First score with 7 goals and a home win: {home}-{away}");
                break 'search;
            }
        }
    }
}
```

## Practice

:::exercise rust-match-result Match result
Write `result(home_goals: u32, away_goals: u32) -> char` that returns `'H'` for a home win, `'D'` for a draw and `'A'` for an away win.

@@starter
fn result(home_goals: u32, away_goals: u32) -> char {
    todo!()
}

@@solution
fn result(home_goals: u32, away_goals: u32) -> char {
    if home_goals > away_goals {
        'H'
    } else if home_goals == away_goals {
        'D'
    } else {
        'A'
    }
}

@@tests
/// 2-1 is a home win
#[test]
fn home() {
    assert_eq!(result(2, 1), 'H');
}

/// 0-0 is a draw
#[test]
fn draw() {
    assert_eq!(result(0, 0), 'D');
}

/// 1-3 is an away win
#[test]
fn away() {
    assert_eq!(result(1, 3), 'A');
}

@@hint
Use `if` / `else if` / `else` as the whole function body, with a `char` literal like `'H'` (single quotes) in each branch and no semicolons.
:::

:::exercise rust-sum-of-squares Sum of squares
Write `sum_of_squares(n: u64) -> u64` that returns 1² + 2² + ... + n², using a `for` loop over a range. `sum_of_squares(3)` is 1 + 4 + 9 = 14.

@@starter
fn sum_of_squares(n: u64) -> u64 {
    todo!()
}

@@solution
fn sum_of_squares(n: u64) -> u64 {
    let mut total = 0;
    for i in 1..=n {
        total += i * i;
    }
    total
}

@@tests
/// 1 + 4 + 9 = 14
#[test]
fn three() {
    assert_eq!(sum_of_squares(3), 14);
}

/// Zero gives zero
#[test]
fn zero() {
    assert_eq!(sum_of_squares(0), 0);
}

/// Matches the formula n(n+1)(2n+1)/6 for n = 100
#[test]
fn hundred() {
    assert_eq!(sum_of_squares(100), 338_350);
}

@@hint
`let mut total = 0;` then `for i in 1..=n { total += i * i; }`, and end the function with `total`.
:::

:::exercise rust-collatz Collatz steps
The Collatz sequence starts at a positive number `n`. If `n` is even, halve it; if it's odd, replace it with `3n + 1`. Repeat until you reach 1.

Write `collatz_steps(n: u64) -> u32` that returns how many steps it takes to reach 1. `collatz_steps(6)` is 8: 6 → 3 → 10 → 5 → 16 → 8 → 4 → 2 → 1.

@@starter
fn collatz_steps(n: u64) -> u32 {
    todo!()
}

@@solution
fn collatz_steps(n: u64) -> u32 {
    let mut n = n;
    let mut steps = 0;
    while n != 1 {
        n = if n % 2 == 0 { n / 2 } else { 3 * n + 1 };
        steps += 1;
    }
    steps
}

@@tests
/// 6 takes 8 steps
#[test]
fn six() {
    assert_eq!(collatz_steps(6), 8);
}

/// 1 takes no steps
#[test]
fn one() {
    assert_eq!(collatz_steps(1), 0);
}

/// 27 takes 111 steps
#[test]
fn twenty_seven() {
    assert_eq!(collatz_steps(27), 111);
}

@@hint
Parameters are immutable, so shadow it first: `let mut n = n;`. Then `while n != 1 { ... }`.

@@hint
`n = if n % 2 == 0 { n / 2 } else { 3 * n + 1 };` uses `if` as an expression.
:::

:::quiz rust-control-check Quick check
? What does this function return? `fn f() -> i32 { let x = 3; x + 1 }`
- [x] 4
- [ ] 3
- [ ] Nothing: it needs `return`
> The last expression without a semicolon, `x + 1`, is the return value.

? What is `()`?
- [ ] An empty list
- [x] The unit type: the value of expressions that produce nothing
- [ ] A syntax error
> Functions without `->` return `()`, and so do statements.

? Which range includes 10?
- [ ] `1..10`
- [x] `1..=10`
- [ ] `range(1, 10)`
> `..` excludes the end, like Python's `range`; `..=` includes it.

? Is `if 1 { ... }` valid Rust?
- [ ] Yes, 1 is truthy
- [x] No, the condition must be a bool
> Write `if x != 0 { ... }`. Rust has no truthiness.
:::
