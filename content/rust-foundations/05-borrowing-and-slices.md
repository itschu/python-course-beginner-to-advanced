---
title: Borrowing, references and slices
summary: Use a value without taking ownership. Shared and mutable references, the borrowing rules, and slices.
minutes: 55
kind: lesson
language: rust
---

Moving values into functions and back out is clumsy. Usually a function only needs to *look at* a value, or change it, without owning it. That's **borrowing**.

## References

`&value` creates a **reference**: a pointer that lets you use a value without owning it. A function that takes `&String` borrows the string:

```rust
fn letters(team: &String) -> usize {
    team.len()
}                       // team is only a reference: nothing is freed here

fn main() {
    let team = String::from("Arsenal");
    let n = letters(&team);           // lend team to the function
    println!("{team} has {n} letters");  // still ours
}
```

Borrowing is like lending someone a book: they can read it, but you still own it and get it back.

## Mutable references

A plain `&` reference is read-only. To let a function change the value, lend it with `&mut`:

```rust
fn add_suffix(team: &mut String) {
    team.push_str(" FC");
}

fn main() {
    let mut team = String::from("Arsenal");   // the variable must be mut too
    add_suffix(&mut team);
    add_suffix(&mut team);
    println!("{team}");
}
```

In Python, a function can quietly modify any list you pass it. In Rust, you can see it at the call site: `&mut team` announces "this might change".

## The borrowing rules

At any moment, a value can have **either**:

- any number of shared references `&T`, **or**
- exactly one mutable reference `&mut T`,

but not both. And a reference must never outlive the value it points to.

This is the rule that the **borrow checker** enforces. It sounds abstract, so here's the bug it prevents:

```rust expect-error
fn main() {
    let mut odds = vec![2.1, 3.4, 3.6];
    let first = &odds[0];      // a shared borrow into the vector
    odds.push(5.0);            // a mutable borrow: might move the whole vector!
    println!("{first}");
}
```

When a `Vec` grows past its capacity, it moves all its elements to a new, bigger block of heap memory. `first` would then point at freed memory. In C++ this compiles and crashes (or worse, silently reads garbage). Rust refuses to compile it: `cannot borrow odds as mutable because it is also borrowed as immutable`.

The fix is to finish using the shared borrow before mutating:

```rust
fn main() {
    let mut odds = vec![2.1, 3.4, 3.6];
    let first = odds[0];       // copy the f64 out instead of borrowing it
    odds.push(5.0);
    println!("{first} {odds:?}");
}
```

A borrow lasts from where it's created until its **last use**, not until the end of the block. So this is fine:

```rust
fn main() {
    let mut scores = vec![1, 2, 3];
    let total: i32 = scores.iter().sum();   // shared borrow, used and finished
    scores.push(total);                     // now a mutable borrow is allowed
    println!("{scores:?}");
}
```

:::tip When the borrow checker complains
Don't fight it with `.clone()` everywhere. Ask: *who should own this data, and who only needs to look at it?* Often the fix is to finish reading before you write, to copy a small value out, or to restructure into smaller functions. The compiler is pointing at a real ordering problem.
:::

## Dangling references are impossible

A function can't return a reference to something it created, because that value is dropped when the function ends:

```rust expect-error
fn make_name() -> &String {
    let name = String::from("Arsenal");
    &name
}

fn main() {
    println!("{}", make_name());
}
```

Return the owned `String` instead. Ownership moves out to the caller, and nothing dangles.

## Slices

A **slice** is a reference to part of a sequence. `&v[1..3]` borrows elements 1 and 2 of `v`, like Python's `v[1:3]` but *without copying*:

```rust
fn average(values: &[f64]) -> f64 {
    let total: f64 = values.iter().sum();
    total / values.len() as f64
}

fn main() {
    let prices = vec![1.10, 1.12, 1.11, 1.15, 1.18, 1.17];
    println!("all:      {:.4}", average(&prices));
    println!("last 3:   {:.4}", average(&prices[3..]));
    println!("first 2:  {:.4}", average(&prices[..2]));

    let fixed = [2.0, 4.0];          // a fixed-size array, on the stack
    println!("array:    {:.4}", average(&fixed));
}
```

`&[f64]` (a slice of `f64`) is the most flexible parameter type for "a sequence of numbers": it accepts a borrowed `Vec`, part of a `Vec`, or an array. This is a key Rust habit:

| Parameter | Accepts |
| --- | --- |
| `Vec<f64>` | Only a `Vec`, and takes ownership of it |
| `&Vec<f64>` | Only a borrowed `Vec` |
| `&[f64]` | A borrowed `Vec`, array, or any part of either. **Prefer this.** |
| `&mut [f64]` | The same, and the function may change the elements (but not the length) |

Indexing past the end panics, just as Python raises `IndexError`. `.get(i)` returns an `Option` instead (lesson 8).

```rust
fn normalise(values: &mut [f64]) {
    let max = values.iter().cloned().fold(f64::MIN, f64::max);
    for v in values.iter_mut() {
        *v /= max;          // *v: the value the reference points at
    }
}

fn main() {
    let mut readings = vec![2.0, 5.0, 4.0, 10.0];
    normalise(&mut readings);
    println!("{readings:?}");
}
```

`*v` **dereferences** the reference: it means "the value `v` points at". You need it when assigning through a `&mut` reference.

## Practice

:::exercise rust-max-in-slice Largest value
Write `largest(values: &[i32]) -> i32` that returns the largest value in a non-empty slice, using a `for` loop.

@@starter
fn largest(values: &[i32]) -> i32 {
    todo!()
}

@@solution
fn largest(values: &[i32]) -> i32 {
    let mut best = values[0];
    for &v in values {
        if v > best {
            best = v;
        }
    }
    best
}

@@tests
/// Finds the largest
#[test]
fn basic() {
    assert_eq!(largest(&[3, 9, 2, 7]), 9);
}

/// Works with negative numbers
#[test]
fn negatives() {
    assert_eq!(largest(&[-5, -2, -9]), -2);
}

/// Works on part of a Vec
#[test]
fn slice_of_vec() {
    let v = vec![100, 1, 2, 3];
    assert_eq!(largest(&v[1..]), 3);
}

@@hint
Start with `let mut best = values[0];` then loop with `for &v in values { ... }`. The `&v` pattern copies each `i32` out of its reference.
:::

:::exercise rust-apply-commission Apply commission
An exchange takes a 2% commission on winnings. Write `apply_commission(profits: &mut [f64])` that changes each **positive** profit in place to 98% of its value. Losses (zero or negative) are unchanged.

@@starter
fn apply_commission(profits: &mut [f64]) {
    todo!()
}

@@solution
fn apply_commission(profits: &mut [f64]) {
    for p in profits.iter_mut() {
        if *p > 0.0 {
            *p *= 0.98;
        }
    }
}

@@tests
/// Winnings lose 2%, losses are unchanged
#[test]
fn mixed() {
    let mut profits = vec![10.0, -5.0, 50.0, 0.0];
    apply_commission(&mut profits);
    assert_eq!(profits, vec![9.8, -5.0, 49.0, 0.0]);
}

/// An empty slice is fine
#[test]
fn empty() {
    let mut profits: Vec<f64> = vec![];
    apply_commission(&mut profits);
    assert!(profits.is_empty());
}

@@hint
`for p in profits.iter_mut()` gives you a `&mut f64` for each element. Read it with `*p` and change it with `*p *= 0.98;`.
:::

:::exercise rust-moving-average Moving average
Write `moving_average(values: &[f64], window: usize) -> Vec<f64>` that returns the average of each run of `window` consecutive values. For `[1, 2, 3, 4, 5]` and window 3 the answer is `[2, 3, 4]`. If there are fewer values than `window`, return an empty `Vec`.

@@starter
fn moving_average(values: &[f64], window: usize) -> Vec<f64> {
    todo!()
}

@@solution
fn moving_average(values: &[f64], window: usize) -> Vec<f64> {
    let mut result = Vec::new();
    if window == 0 || values.len() < window {
        return result;
    }
    for start in 0..=values.len() - window {
        let chunk = &values[start..start + window];
        let total: f64 = chunk.iter().sum();
        result.push(total / window as f64);
    }
    result
}

@@tests
/// Window of 3 over 5 values
#[test]
fn basic() {
    assert_eq!(moving_average(&[1.0, 2.0, 3.0, 4.0, 5.0], 3), vec![2.0, 3.0, 4.0]);
}

/// Window equal to the length gives one value
#[test]
fn whole() {
    assert_eq!(moving_average(&[2.0, 4.0], 2), vec![3.0]);
}

/// Too few values gives an empty Vec
#[test]
fn too_short() {
    assert!(moving_average(&[1.0], 3).is_empty());
}

@@hint
Loop over start positions `for start in 0..=values.len() - window`, take the slice `&values[start..start + window]`, and push its average.

@@hint
Check `values.len() < window` first and return early: otherwise `values.len() - window` would underflow a `usize` and panic.
:::

:::quiz rust-borrow-check Quick check
? How many `&mut` references to the same value can exist at once?
- [x] One
- [ ] Two
- [ ] Any number
> One mutable reference *or* any number of shared ones, never both.

? Which parameter type is the most flexible for "read a list of numbers"?
- [ ] `Vec<f64>`
- [ ] `&Vec<f64>`
- [x] `&[f64]`
> A slice accepts vectors, arrays and parts of either, and doesn't take ownership.

? Why can't you push to a `Vec` while holding a reference to one of its elements?
- [ ] Vecs are immutable
- [x] Pushing may move the elements to new memory, leaving the reference dangling
- [ ] References are read-only copies
> The borrow checker turns a classic C++ crash into a compile error.

? What does `*v *= 2.0` do when `v` is a `&mut f64`?
- [x] Doubles the value v points at
- [ ] Doubles the reference
- [ ] It's a compile error
> `*` dereferences: it gives you the value behind the reference.
:::
