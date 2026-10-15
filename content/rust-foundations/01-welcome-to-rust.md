---
title: Welcome to Rust
summary: Why a Python developer should learn Rust, how Rust code is compiled and run, and your first programs.
minutes: 40
kind: lesson
language: rust
---

You can already build, evaluate and serve machine learning models in Python. So why learn a second language?

Because Python has limits, and Rust removes them:

- **Speed.** Python is interpreted: every `a + b` goes through layers of checks at run time. Rust is **compiled** to machine code ahead of time, so the same loop often runs 10 to 100 times faster. That's why the fast parts of the Python ML world are increasingly written in Rust: Polars, Hugging Face `tokenizers`, `pydantic-core`, and the `uv` and `ruff` tools you installed in Phase 2.
- **Small and predictable.** A Rust program has no interpreter and no garbage collector. It can run on a microcontroller with 264 KB of RAM and no operating system, which is where this course ends up: running your own models inside embedded devices.
- **Safety.** Rust's compiler refuses to build programs with whole classes of bugs: using memory after it's freed, data races between threads, forgetting to handle a missing value. C and C++ can't promise that, which is why Microsoft, Google, Amazon and the Linux kernel now use Rust for new systems code.

The price is a stricter compiler. Rust makes you think up front about things Python handles for you. This phase teaches those ideas slowly, always comparing with the Python you know.

## Running Rust on this site

Python runs inside your browser. Rust needs a compiler, so the Rust cells on this site send your code to the official [Rust Playground](https://play.rust-lang.org/), which compiles it, runs it and sends the output back. You need to be online, and each run takes a second or two because the code is compiled first.

Press **Run**:

```rust
fn main() {
    println!("Hello, Rust!");
}
```

Every Rust program starts at a function called `main`. Compare with Python:

| Python | Rust |
| --- | --- |
| Code at the top level of a file runs | Only `fn main()` runs; everything else is definitions |
| `def name():` and indentation | `fn name() { ... }` with curly braces |
| Lines end at the newline | Statements end with `;` |
| `print("hi")` | `println!("hi");` (the `!` means it's a **macro**, explained later) |

Indentation doesn't matter to Rust (braces do), but everyone uses 4 spaces, exactly as in Python.

## Compiling versus interpreting

When you run Python, the interpreter reads your code and executes it line by line. A typo in a function is only discovered when that line runs.

Rust has two separate steps:

1. **Compile**: the compiler `rustc` checks the *entire* program and translates it into a machine-code executable. Any error stops here, before anything runs.
2. **Run**: the executable runs, at full speed, without the compiler.

Run this cell. It has a mistake, so it never gets to the first `println!`:

```rust expect-error
fn main() {
    println!("This line never runs");
    let goals = 3;
    println!("Goals: {}", gaols);
}
```

Read the error from the top. Rust's compiler errors are famously helpful: it shows the exact line, underlines the problem, and usually suggests the fix (`help: a local variable with a similar name exists: goals`). **Learning Rust is mostly learning to read these messages**, so never skim them.

## Printing values

`println!` uses `{}` placeholders, like a Python f-string. You can put a variable name inside the braces, or pass values after the string:

```rust
fn main() {
    let team = "Arsenal";
    let goals = 3;
    println!("{team} scored {goals} goals");          // like f"{team} scored {goals} goals"
    println!("{} scored {} goals", team, goals);      // positional values
    println!("Win probability: {:.3}", 1.0 / 2.25);   // 3 decimal places, like {:.3f}
    println!("{:>8}|{:<8}|", "right", "left");        // alignment, like Python
    print!("no newline, ");
    println!("then a newline");
}
```

`{:?}` is the **debug** format, for printing things like lists that have no single "nice" form. It's the equivalent of Python's `repr()`:

```rust
fn main() {
    let scores = vec![2, 0, 3, 1];      // vec! makes a growable list, like a Python list
    println!("{:?}", scores);
    println!("{scores:?}");
    println!("{scores:#?}");            // pretty-printed over several lines
}
```

## Comments

```rust
// A line comment, like # in Python.

/// A documentation comment: it documents the item below it,
/// and `cargo doc` turns it into a web page (like a docstring).
fn main() {
    /* A block comment
       can span lines. */
    println!("comments are ignored");
}
```

## Cargo: Rust's project tool

On your own machine you'll rarely call `rustc` directly. **Cargo** is Rust's build tool and package manager in one, playing the roles of `uv`, `pip`, `pytest` and `ruff` together:

```bash
cargo new betting_tools      # create a project (like uv init)
cd betting_tools
cargo run                    # compile and run src/main.rs
cargo test                   # run the tests (like pytest)
cargo build --release        # an optimised executable in target/release/
cargo add serde              # add a dependency from crates.io (like uv add)
cargo fmt                    # format the code (like ruff format)
cargo clippy                 # lint the code (like ruff check)
```

Libraries are called **crates**, and they live on [crates.io](https://crates.io/), Rust's PyPI. You'll install Rust locally in Phase 10. Until then, everything runs here.

:::tip Debug and release builds
The Playground compiles in **debug** mode: fast to compile, slower to run, with extra safety checks. `cargo build --release` takes longer to compile but turns on optimisations, and the result is often 10 to 50 times faster. Always benchmark release builds.
:::

## How exercises work in Rust

Rust exercises are graded with Rust's built-in test framework. Your code is compiled together with a `tests` module of `#[test]` functions, and `cargo test` runs them. Each test is described by the `///` comment above it.

Starter code often contains `todo!()`. It's a macro that compiles fine but crashes ("panics") if it runs, so the tests fail until you replace it with real code.

:::exercise rust-hello Your first Rust function
Write a function `greeting` that takes a name and returns the text `Hello, <name>!`.

The signature is written for you: `name: &str` means the function borrows some text, and `-> String` means it returns a new piece of text. `format!` works exactly like `println!`, but returns the text instead of printing it.

@@starter
fn greeting(name: &str) -> String {
    todo!()
}

@@solution
fn greeting(name: &str) -> String {
    format!("Hello, {name}!")
}

@@tests
/// Greets Ada
#[test]
fn greets_ada() {
    assert_eq!(greeting("Ada"), "Hello, Ada!");
}

/// Greets Ferris, the Rust mascot
#[test]
fn greets_ferris() {
    assert_eq!(greeting("Ferris"), "Hello, Ferris!");
}

@@hint
`format!("Hello, {name}!")` builds the text. Make it the last line of the function, **without** a semicolon, and it becomes the return value.
:::

Notice the hint: in Rust, the last expression in a function body, without a `;`, is its return value. You'll see why in lesson 3.

:::exercise rust-format-odds Format odds
Write `describe_odds(team: &str, odds: f64) -> String` that returns, for example, `Arsenal @ 2.50 (40.0%)`: the team, the decimal odds with 2 decimal places, and the implied probability (`1 / odds`) as a percentage with 1 decimal place.

@@starter
fn describe_odds(team: &str, odds: f64) -> String {
    todo!()
}

@@solution
fn describe_odds(team: &str, odds: f64) -> String {
    let probability = 100.0 / odds;
    format!("{team} @ {odds:.2} ({probability:.1}%)")
}

@@tests
/// Arsenal at 2.5 is 40%
#[test]
fn arsenal() {
    assert_eq!(describe_odds("Arsenal", 2.5), "Arsenal @ 2.50 (40.0%)");
}

/// Rounds the probability to 1 decimal place
#[test]
fn rounding() {
    assert_eq!(describe_odds("Draw", 3.3), "Draw @ 3.30 (30.3%)");
}

@@hint
Compute the percentage first: `let probability = 100.0 / odds;`. Then use `{odds:.2}` and `{probability:.1}` inside `format!`.
:::

:::quiz rust-welcome-check Quick check
? When does Rust find a misspelt variable name?
- [ ] When that line runs
- [x] When the program is compiled, before anything runs
- [ ] Never: it creates a new variable
> The compiler checks the whole program first. If there's any error, no executable is produced and nothing runs.

? What does the `!` in `println!` tell you?
- [ ] The output is important
- [x] It's a macro, not a normal function
- [ ] It can panic
> Macros generate code at compile time. That's how `println!` can check your `{}` placeholders against the values you pass.

? Which tool would you use to add a dependency and run the tests of a Rust project?
- [ ] pip
- [ ] rustc
- [x] cargo
> Cargo builds, runs, tests, formats, lints and manages dependencies.

? Which format prints a `Vec` like `[2, 0, 3]`?
- [ ] `{}`
- [x] `{:?}`
- [ ] `{:.2}`
> `{:?}` is the debug format. A `Vec` has no single "display" format, so `{}` won't compile for it.
:::
