---
title: Generics
summary: Write one function or type that works for many types, constrain it with trait bounds, and use const generics for fixed-size buffers.
minutes: 50
kind: lesson
language: rust
---

Python functions work on any type that happens to support the operations you use ("duck typing"), and you find out at run time if it doesn't. Rust gets the same flexibility with **generics**, checked at compile time.

## Generic functions

`T` is a **type parameter**: a placeholder for "some type". The `<T: PartialOrd + Copy>` part is a **trait bound**: it says which abilities `T` must have.

```rust
fn largest<T: PartialOrd + Copy>(items: &[T]) -> T {
    let mut best = items[0];
    for &item in items {
        if item > best {
            best = item;
        }
    }
    best
}

fn main() {
    println!("{}", largest(&[3, 9, 2]));            // T = i32
    println!("{}", largest(&[2.1, 3.4, 1.9]));      // T = f64
    println!("{}", largest(&['a', 'z', 'm']));      // T = char
}
```

Without the bound, the compiler refuses: it can't know that every possible `T` supports `>`. Bounds turn "hopefully it works" into a checked contract.

When bounds get long, move them into a `where` clause:

```rust
use std::fmt::Display;

fn report<T, U>(label: T, values: &[U]) -> String
where
    T: Display,
    U: Display + PartialOrd,
{
    let mut parts = Vec::new();
    for v in values {
        parts.push(v.to_string());
    }
    format!("{label}: {}", parts.join(", "))
}

fn main() {
    println!("{}", report("goals", &[2, 0, 3]));
    println!("{}", report(2024, &[1.5, 2.25]));
}
```

## Generic structs and enums

You already use generic types every day: `Vec<T>`, `Option<T>`, `Result<T, E>` and `HashMap<K, V>`. You can write your own:

```rust
#[derive(Debug)]
struct Labelled<T> {
    label: String,
    value: T,
}

impl<T: std::fmt::Debug> Labelled<T> {
    fn describe(&self) -> String {
        format!("{} = {:?}", self.label, self.value)
    }
}

fn main() {
    let a = Labelled { label: "odds".to_string(), value: 2.5 };
    let b = Labelled { label: "teams".to_string(), value: vec!["Arsenal", "Chelsea"] };
    println!("{}", a.describe());
    println!("{}", b.describe());
}
```

## Zero-cost: monomorphization

How can generic code be as fast as hand-written code? When you call `largest` with `i32` and with `f64`, the compiler generates two separate functions, `largest_i32` and `largest_f64`, each optimised for its type. This is called **monomorphization**. There's no type checking at run time, unlike Python, where every `>` asks "what type is this?".

The trade-off: more generated code means slightly longer compile times and bigger binaries. On a microcontroller with 2 MB of flash, that occasionally matters; lesson 6 shows the alternative.

## Generic over traits you define

Generics and traits combine into very flexible designs. Here's a moving-average filter that works on any numeric type that can be converted to `f64`:

```rust
fn mean<T>(values: &[T]) -> Option<f64>
where
    T: Copy + Into<f64>,
{
    if values.is_empty() {
        return None;
    }
    let mut total = 0.0;
    for &v in values {
        total += v.into();
    }
    Some(total / values.len() as f64)
}

fn main() {
    let adc: [u16; 4] = [1000, 1010, 990, 1004];   // raw sensor counts
    let temps: [f32; 3] = [21.5, 21.7, 21.6];
    println!("{:?}", mean(&adc));
    println!("{:?}", mean(&temps));
}
```

## Const generics: sizes as parameters

Generics can also be parameterised by **values**, usually sizes. `[T; N]` is an array of exactly `N` elements, and `N` can be a generic parameter. This is how embedded Rust builds fixed-size buffers that live on the stack, with no heap allocation:

```rust
struct RingBuffer<const N: usize> {
    data: [f32; N],
    next: usize,
    len: usize,
}

impl<const N: usize> RingBuffer<N> {
    fn new() -> Self {
        RingBuffer { data: [0.0; N], next: 0, len: 0 }
    }

    fn push(&mut self, value: f32) {
        self.data[self.next] = value;
        self.next = (self.next + 1) % N;
        if self.len < N {
            self.len += 1;
        }
    }

    fn average(&self) -> Option<f32> {
        if self.len == 0 {
            return None;
        }
        let total: f32 = self.data[..self.len].iter().sum();
        Some(total / self.len as f32)
    }
}

fn main() {
    let mut last_four: RingBuffer<4> = RingBuffer::new();
    for reading in [20.0, 21.0, 22.0, 23.0, 30.0] {
        last_four.push(reading);
        println!("after {reading}: average {:?}", last_four.average());
    }
    println!("uses {} bytes, fixed at compile time", std::mem::size_of::<RingBuffer<4>>());
}
```

The size is part of the type, so `RingBuffer<4>` and `RingBuffer<64>` are different types, and the memory needed is known before the program runs. That's exactly what firmware needs.

## Practice

:::exercise prust-generic-pair A generic min-max
Write `min_max<T: PartialOrd + Copy>(items: &[T]) -> Option<(T, T)>` returning the smallest and largest items, or `None` for an empty slice.

@@starter
fn min_max<T: PartialOrd + Copy>(items: &[T]) -> Option<(T, T)> {
    todo!()
}

@@solution
fn min_max<T: PartialOrd + Copy>(items: &[T]) -> Option<(T, T)> {
    let first = *items.first()?;
    let mut lo = first;
    let mut hi = first;
    for &item in items {
        if item < lo {
            lo = item;
        }
        if item > hi {
            hi = item;
        }
    }
    Some((lo, hi))
}

@@tests
/// Works for integers
#[test]
fn ints() {
    assert_eq!(min_max(&[3, -1, 9, 4]), Some((-1, 9)));
}

/// Works for floats
#[test]
fn floats() {
    assert_eq!(min_max(&[2.5, 1.5]), Some((1.5, 2.5)));
}

/// Works for chars
#[test]
fn chars() {
    assert_eq!(min_max(&['m', 'a', 'z']), Some(('a', 'z')));
}

/// Empty gives None
#[test]
fn empty() {
    let empty: [u8; 0] = [];
    assert_eq!(min_max(&empty), None);
}

@@hint
`let first = *items.first()?;` returns `None` early for an empty slice (`?` works on `Option` too).
:::

:::exercise prust-generic-stack A generic bounded stack
Implement `Stack<T, const N: usize>`, a stack that holds at most `N` items in a `Vec<T>`:

- `new() -> Self`
- `push(&mut self, item: T) -> Result<(), T>`: if the stack is full, give the item back in an `Err`
- `pop(&mut self) -> Option<T>`
- `len(&self) -> usize` and `is_full(&self) -> bool`

@@starter
struct Stack<T, const N: usize> {
    items: Vec<T>,
}

impl<T, const N: usize> Stack<T, N> {
    fn new() -> Self {
        todo!()
    }

    fn push(&mut self, item: T) -> Result<(), T> {
        todo!()
    }

    fn pop(&mut self) -> Option<T> {
        todo!()
    }

    fn len(&self) -> usize {
        todo!()
    }

    fn is_full(&self) -> bool {
        todo!()
    }
}

@@solution
struct Stack<T, const N: usize> {
    items: Vec<T>,
}

impl<T, const N: usize> Stack<T, N> {
    fn new() -> Self {
        Stack { items: Vec::with_capacity(N) }
    }

    fn push(&mut self, item: T) -> Result<(), T> {
        if self.is_full() {
            return Err(item);
        }
        self.items.push(item);
        Ok(())
    }

    fn pop(&mut self) -> Option<T> {
        self.items.pop()
    }

    fn len(&self) -> usize {
        self.items.len()
    }

    fn is_full(&self) -> bool {
        self.items.len() >= N
    }
}

@@tests
/// Push and pop in LIFO order
#[test]
fn lifo() {
    let mut s: Stack<&str, 3> = Stack::new();
    s.push("a").unwrap();
    s.push("b").unwrap();
    assert_eq!(s.pop(), Some("b"));
    assert_eq!(s.len(), 1);
}

/// A full stack gives the item back
#[test]
fn full() {
    let mut s: Stack<String, 2> = Stack::new();
    assert!(s.push("x".to_string()).is_ok());
    assert!(s.push("y".to_string()).is_ok());
    assert!(s.is_full());
    assert_eq!(s.push("z".to_string()), Err("z".to_string()));
    assert_eq!(s.len(), 2);
}

/// Popping an empty stack gives None
#[test]
fn empty() {
    let mut s: Stack<u8, 1> = Stack::new();
    assert_eq!(s.pop(), None);
}

@@hint
`N` is usable like a normal constant inside the impl: `self.items.len() >= N`.
:::

:::quiz prust-generics-check Quick check
? Why does `fn largest<T>(items: &[T]) -> T` fail to compile if it uses `>`?
- [ ] Generic functions can't compare
- [x] Nothing says T supports comparison; add a PartialOrd bound
- [ ] T must be a number
> Trait bounds tell the compiler what a generic type can do.

? What is monomorphization?
- [x] Generating a separate optimised copy of generic code for each concrete type used
- [ ] Checking types at run time
- [ ] Converting all types to one type
> It's why generics in Rust cost nothing at run time.

? What's special about `RingBuffer<const N: usize>`?
- [ ] It can grow
- [x] Its size is part of the type and known at compile time, so it needs no heap
- [ ] N must be a power of two
> Const generics give fixed-size, stack-allocated buffers: ideal for embedded code.
:::
