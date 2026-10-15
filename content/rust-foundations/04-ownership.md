---
title: Ownership and moves
summary: Rust's big idea. Every value has one owner, and memory is freed exactly when the owner goes away, with no garbage collector.
minutes: 55
kind: lesson
language: rust
---

Ownership is the idea that makes Rust different from every language you've used. It's how Rust manages memory **without a garbage collector and without you calling `free`**. Take this lesson slowly: everything else builds on it.

## Where values live: the stack and the heap

A running program stores data in two places:

- **The stack** holds values whose size is known at compile time: numbers, bools, chars, fixed-size tuples and arrays. It's extremely fast. When a function returns, its stack space is reclaimed instantly.
- **The heap** holds data whose size can change or is only known at run time: a `String` you keep appending to, a `Vec` that grows. Asking for heap memory and giving it back is slower, and *someone* has to give it back.

A `String` is stored in two parts: a small fixed-size piece on the stack (a pointer to the text, its length and its capacity) and the actual characters on the heap.

```text
   stack (variable s)           heap
  ┌──────────┬──────────┐     ┌───┬───┬───┬───┬───┬───┬───┐
  │ ptr      │ ─────────┼───▶ │ A │ r │ s │ e │ n │ a │ l │
  │ len      │ 7        │     └───┴───┴───┴───┴───┴───┴───┘
  │ capacity │ 7        │
  └──────────┴──────────┘
```

How languages give heap memory back:

| Language | Who frees heap memory? | Cost |
| --- | --- | --- |
| C | You, by calling `free`. Forget it and you leak; do it twice or too early and you crash or get hacked. | Bugs |
| Python, Java, Go | A garbage collector that runs now and then and finds unused objects | Pauses, extra memory, unpredictable timing |
| Rust | The compiler inserts the cleanup at exactly the right place, using **ownership rules** | Learning the rules |

## The three rules

1. Every value has exactly one **owner**: a variable.
2. There can only be one owner at a time.
3. When the owner goes **out of scope**, the value is dropped and its memory is freed.

A **scope** is the block `{ ... }` a variable lives in:

```rust
fn main() {
    {
        let team = String::from("Arsenal");   // team owns a String on the heap
        println!("{team}");
    }                                          // scope ends: the String is freed here
    println!("team no longer exists here");
}
```

No garbage collector, no `free`: the compiler knows where the scope ends.

## Moves

What happens when you assign one variable to another?

```rust expect-error
fn main() {
    let a = String::from("Arsenal");
    let b = a;               // the String MOVES from a to b
    println!("{a}");         // error: a no longer owns anything
    println!("{b}");
}
```

In Python, `b = a` makes both names point at the same object. If Rust did that, both `a` and `b` would think they own the text, and both would try to free it at the end of `main`: a "double free" bug. So instead, **ownership moves to `b`** and `a` becomes unusable. The compiler error says `borrow of moved value: a`, and shows exactly where the move happened.

The same happens when you pass a value to a function. The function's parameter becomes the new owner:

```rust expect-error
fn shout(text: String) {
    println!("{}!", text.to_uppercase());
}                                   // text goes out of scope: the String is freed

fn main() {
    let team = String::from("Arsenal");
    shout(team);                    // ownership moves into the function
    shout(team);                    // error: team was moved
}
```

## Getting values back

A function can give ownership back by returning the value:

```rust
fn add_suffix(mut name: String) -> String {
    name.push_str(" FC");
    name                            // ownership moves out to the caller
}

fn main() {
    let team = String::from("Arsenal");
    let team = add_suffix(team);
    println!("{team}");
}
```

That works, but passing values in and out all the time would be tedious. The next lesson shows the real solution: **borrowing**, where a function uses a value without taking ownership.

## Clone: an explicit deep copy

If you genuinely want two independent copies, ask for one with `.clone()`:

```rust
fn main() {
    let a = String::from("Arsenal");
    let b = a.clone();               // copies the heap data too
    println!("{a} and {b}");
}
```

Cloning copies all the heap data, which can be expensive for big values. Rust makes it visible: when you see `.clone()`, you know a copy happens. Python copies are invisible (and its sharing bugs are too).

## Copy types

Why does this work, when the `String` version didn't?

```rust
fn main() {
    let a = 5;
    let b = a;
    println!("{a} {b}");
}
```

Simple values that live entirely on the stack, such as integers, floats, bools, chars, and tuples or arrays of them, implement the `Copy` trait. Copying them is as cheap as moving them, so Rust just copies, and both variables stay usable. Types that own heap memory, like `String` and `Vec`, are never `Copy`.

| Moves (one owner) | Copies |
| --- | --- |
| `String`, `Vec<T>`, `HashMap`, `Box<T>`, most structs | `i32`, `u8`, `f64`, `bool`, `char`, `(i32, f64)`, `[u8; 4]`, `&str` |

## Why this matters for you

- **Speed without a garbage collector**: no pauses, which matters for a trading system or for an ML model answering in under a millisecond.
- **Embedded systems**: a microcontroller can't afford a garbage collector. Ownership gives you automatic, predictable memory management in a few kilobytes.
- **Concurrency**: in Phase 10 you'll see that ownership is also what stops two threads from modifying the same data at once.

## Practice

Ownership exercises are mostly about making code compile. Read each compiler error: it tells you what moved and where.

:::exercise rust-fix-move Fix the move
`describe` takes ownership of the `String`, so `main`-style code that uses the team name afterwards fails.

Change `describe` so it takes a `String` **and gives it back** together with the description, as a tuple `(String, String)`: the original team name first, then the text `"<team> has <n> letters"`.

@@starter
fn describe(team: String) -> (String, String) {
    todo!()
}

@@solution
fn describe(team: String) -> (String, String) {
    let text = format!("{} has {} letters", team, team.len());
    (team, text)
}

@@tests
/// Gives the name back and describes it
#[test]
fn arsenal() {
    let team = String::from("Arsenal");
    let (team, text) = describe(team);
    assert_eq!(team, "Arsenal");
    assert_eq!(text, "Arsenal has 7 letters");
}

/// Works for another team
#[test]
fn spurs() {
    let (team, text) = describe(String::from("Spurs"));
    assert_eq!((team.as_str(), text.as_str()), ("Spurs", "Spurs has 5 letters"));
}

@@hint
Build the text first with `format!`, using `team.len()`. Then return `(team, text)`: the String moves back out to the caller.
:::

:::exercise rust-clone-teams Keep a backup
Write `with_backup(teams: Vec<String>) -> (Vec<String>, Vec<String>)` that returns the original list and an independent copy of it, so that changing one doesn't affect the other.

@@starter
fn with_backup(teams: Vec<String>) -> (Vec<String>, Vec<String>) {
    todo!()
}

@@solution
fn with_backup(teams: Vec<String>) -> (Vec<String>, Vec<String>) {
    let backup = teams.clone();
    (teams, backup)
}

@@tests
/// Returns two equal lists
#[test]
fn equal() {
    let (a, b) = with_backup(vec!["Arsenal".to_string(), "Chelsea".to_string()]);
    assert_eq!(a, b);
    assert_eq!(a.len(), 2);
}

/// Changing the original doesn't change the backup
#[test]
fn independent() {
    let (mut a, b) = with_backup(vec!["Arsenal".to_string()]);
    a.push("Spurs".to_string());
    a[0].push_str(" FC");
    assert_eq!(b, vec!["Arsenal".to_string()]);
}

@@hint
`teams.clone()` copies the vector and every `String` inside it.
:::

:::quiz rust-ownership-check Quick check
? After `let b = a;` where `a` is a `String`, what can you do with `a`?
- [ ] Use it normally
- [x] Nothing until it's assigned a new value: it was moved
- [ ] Read it but not change it
> Ownership moved to `b`. Using `a` is a compile error.

? After `let b = a;` where `a` is an `i32`, what can you do with `a`?
- [x] Use it normally: integers are Copy
- [ ] Nothing: it was moved
> Stack-only types like integers are copied, not moved.

? When is the memory of a `String` freed?
- [ ] When the garbage collector runs
- [ ] When you call free()
- [x] When its owner goes out of scope
> The compiler inserts the cleanup (a "drop") at the end of the owner's scope.

? Why does Rust move a `String` instead of letting two variables own it?
- [ ] To make programs slower but safer
- [x] Two owners would both free the same memory (a double free)
- [ ] Strings are immutable
> One owner means exactly one cleanup.
:::
