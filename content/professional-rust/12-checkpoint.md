---
title: "Checkpoint: Professional Rust"
summary: Traits, generics, lifetimes, iterators, smart pointers, concurrency and unsafe, tested together.
minutes: 75
kind: checkpoint
language: rust
---

:::quiz prust-cp-quiz Concepts
? You need a list holding a mix of model types that all implement `Model`. Which type?
- [ ] `Vec<impl Model>`
- [x] `Vec<Box<dyn Model>>`
- [ ] `Vec<&Model>`
> Trait objects allow different concrete types in one collection.

? Which of these give you zero-cost abstractions (no run-time overhead compared with hand-written code)? (choose all that apply)
- [x] Generics with trait bounds
- [x] Iterator adapter chains
- [x] async functions compiled to state machines
- [ ] `Rc<RefCell<T>>`
> Rc and RefCell do real work at run time: counting references and checking borrows.

? Several threads must append to the same Vec. What do you wrap it in?
- [ ] `Rc<RefCell<Vec<T>>>`
- [x] `Arc<Mutex<Vec<T>>>`
- [ ] `Box<Vec<T>>`
> Arc for shared ownership across threads, Mutex for exclusive access.

? When do you have to write lifetime annotations?
- [ ] On every reference
- [x] When a function returns a reference and the compiler can't tell which input it borrows from
- [ ] Never in safe code
> Elision handles single-input and &self cases.

? What does `#[cfg(test)]` do?
- [x] Compiles the item only when running tests
- [ ] Marks a function as a test
- [ ] Turns on debug assertions
> `#[test]` marks individual test functions.

? What must a `// SAFETY:` comment explain?
- [ ] What the code does
- [x] Why the conditions required by the unsafe operation actually hold here
- [ ] Who wrote the code
> It's the proof the compiler couldn't do.
:::

:::exercise prust-cp-generic-window A generic sliding window
Write `struct Window<T, const N: usize>` that keeps the last `N` values pushed (oldest are dropped) using a `VecDeque<T>`, with:

- `new() -> Self`
- `push(&mut self, value: T)`
- `is_full(&self) -> bool`
- `iter(&self) -> impl Iterator<Item = &T>` (oldest first)

and a generic function `window_mean<const N: usize>(w: &Window<f64, N>) -> Option<f64>` (None if empty).

@@starter
use std::collections::VecDeque;

struct Window<T, const N: usize> {
    values: VecDeque<T>,
}

impl<T, const N: usize> Window<T, N> {
    fn new() -> Self {
        todo!()
    }

    fn push(&mut self, value: T) {
        todo!()
    }

    fn is_full(&self) -> bool {
        todo!()
    }

    fn iter(&self) -> impl Iterator<Item = &T> {
        self.values.iter()
    }
}

fn window_mean<const N: usize>(w: &Window<f64, N>) -> Option<f64> {
    todo!()
}

@@solution
use std::collections::VecDeque;

struct Window<T, const N: usize> {
    values: VecDeque<T>,
}

impl<T, const N: usize> Window<T, N> {
    fn new() -> Self {
        Window { values: VecDeque::with_capacity(N) }
    }

    fn push(&mut self, value: T) {
        if self.values.len() == N {
            self.values.pop_front();
        }
        self.values.push_back(value);
    }

    fn is_full(&self) -> bool {
        self.values.len() == N
    }

    fn iter(&self) -> impl Iterator<Item = &T> {
        self.values.iter()
    }
}

fn window_mean<const N: usize>(w: &Window<f64, N>) -> Option<f64> {
    let count = w.iter().count();
    if count == 0 {
        return None;
    }
    Some(w.iter().sum::<f64>() / count as f64)
}

@@tests
/// Keeps only the last N values
#[test]
fn keeps_last() {
    let mut w: Window<u32, 3> = Window::new();
    for v in 1..=5 {
        w.push(v);
    }
    assert!(w.is_full());
    assert_eq!(w.iter().copied().collect::<Vec<_>>(), vec![3, 4, 5]);
}

/// Works with non-Copy types
#[test]
fn strings() {
    let mut w: Window<String, 2> = Window::new();
    w.push("a".into());
    assert!(!w.is_full());
    w.push("b".into());
    w.push("c".into());
    assert_eq!(w.iter().cloned().collect::<Vec<_>>(), vec!["b".to_string(), "c".to_string()]);
}

/// Mean of the window
#[test]
fn mean() {
    let mut w: Window<f64, 2> = Window::new();
    assert_eq!(window_mean(&w), None);
    w.push(1.0);
    w.push(2.0);
    w.push(4.0);
    assert_eq!(window_mean(&w), Some(3.0));
}

@@hint
In `push`, if `self.values.len() == N`, call `pop_front()` before `push_back(value)`.
:::

:::exercise prust-cp-scheduler A tiny task scheduler
Firmware often runs several jobs at different rates from one loop. Write a `Scheduler` that holds tasks as `Box<dyn FnMut(u64) -> Option<String>>` with a period in milliseconds:

- `add(&mut self, period_ms: u64, task: Box<dyn FnMut(u64) -> Option<String>>)`
- `run_until(&mut self, end_ms: u64) -> Vec<String>`: for every millisecond `t` from 1 to `end_ms` inclusive, call each task whose period divides `t` (in the order they were added), passing `t`. Collect every `Some(message)` returned, in order.

@@starter
struct Scheduler {
    tasks: Vec<(u64, Box<dyn FnMut(u64) -> Option<String>>)>,
}

impl Scheduler {
    fn new() -> Scheduler {
        Scheduler { tasks: Vec::new() }
    }

    fn add(&mut self, period_ms: u64, task: Box<dyn FnMut(u64) -> Option<String>>) {
        todo!()
    }

    fn run_until(&mut self, end_ms: u64) -> Vec<String> {
        todo!()
    }
}

@@solution
struct Scheduler {
    tasks: Vec<(u64, Box<dyn FnMut(u64) -> Option<String>>)>,
}

impl Scheduler {
    fn new() -> Scheduler {
        Scheduler { tasks: Vec::new() }
    }

    fn add(&mut self, period_ms: u64, task: Box<dyn FnMut(u64) -> Option<String>>) {
        self.tasks.push((period_ms, task));
    }

    fn run_until(&mut self, end_ms: u64) -> Vec<String> {
        let mut log = Vec::new();
        for t in 1..=end_ms {
            for (period, task) in self.tasks.iter_mut() {
                if t % *period == 0 {
                    if let Some(message) = task(t) {
                        log.push(message);
                    }
                }
            }
        }
        log
    }
}

@@tests
/// Runs tasks at their own rates, in order
#[test]
fn rates() {
    let mut s = Scheduler::new();
    s.add(250, Box::new(|t| Some(format!("blink@{t}"))));
    s.add(500, Box::new(|t| Some(format!("sensor@{t}"))));
    assert_eq!(
        s.run_until(500),
        vec!["blink@250", "blink@500", "sensor@500"]
    );
}

/// Tasks can keep state and stay quiet
#[test]
fn stateful() {
    let mut s = Scheduler::new();
    let mut count = 0;
    s.add(100, Box::new(move |_| {
        count += 1;
        if count % 3 == 0 { Some(format!("third call ({count})")) } else { None }
    }));
    assert_eq!(s.run_until(700), vec!["third call (3)", "third call (6)"]);
}

@@hint
`add` just pushes `(period_ms, task)`. In `run_until`, loop `for t in 1..=end_ms`, then `for (period, task) in self.tasks.iter_mut()`; call a boxed closure with `task(t)`.
:::

## Phase 10 complete

You now know the Rust that professionals use: traits and generics for flexible, zero-cost APIs; lifetimes; iterator pipelines; smart pointers; threads, channels and locks; what async really compiles to; and how unsafe code and FFI connect Rust to C, Python and hardware.

Next, Phase 11 puts Rust to work on machine learning, and Phase 12 takes it onto a microcontroller.
