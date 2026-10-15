---
title: Fearless concurrency
summary: Threads, scoped threads, channels, Arc and Mutex, atomics, and how Send and Sync stop data races at compile time.
minutes: 60
kind: lesson
language: rust
---

Your laptop has many CPU cores. Python struggles to use them for computation because of the Global Interpreter Lock (GIL), so Python ML libraries do their heavy lifting in C, C++ or Rust. Rust uses all your cores directly, and its ownership rules make one of the nastiest classes of bugs, **data races**, a compile error.

## Spawning threads

```rust
use std::thread;
use std::time::Duration;

fn main() {
    let handle = thread::spawn(|| {
        for i in 1..=3 {
            println!("  worker: step {i}");
            thread::sleep(Duration::from_millis(5));
        }
        42                                 // a thread can return a value
    });

    println!("main: waiting");
    let answer = handle.join().unwrap();   // wait for the thread to finish
    println!("main: worker returned {answer}");
}
```

`thread::spawn` runs a closure on a new operating-system thread. `join` waits for it and returns its result (an `Err` if the thread panicked).

A spawned thread may outlive the function that started it, so its closure must **own** everything it uses. Try borrowing a local variable and the compiler stops you, suggesting `move`:

```rust
use std::thread;

fn main() {
    let odds = vec![2.1, 3.4, 3.6];
    let handle = thread::spawn(move || {          // move: the thread takes ownership of odds
        odds.iter().map(|o| 1.0 / o).sum::<f64>()
    });
    println!("overround: {:.4}", handle.join().unwrap());
}
```

## Scoped threads: borrowing safely

Often you want threads that *borrow* local data and are guaranteed to finish before the function returns. `thread::scope` does exactly that:

```rust
use std::thread;

fn main() {
    let data: Vec<u64> = (1..=1_000_000).collect();
    let chunks: Vec<&[u64]> = data.chunks(250_000).collect();

    let total: u64 = thread::scope(|s| {
        let handles: Vec<_> = chunks.iter().map(|chunk| s.spawn(move || chunk.iter().sum::<u64>())).collect();
        handles.into_iter().map(|h| h.join().unwrap()).sum()
    });                                            // every thread has finished here

    println!("sum = {total} using {} threads", chunks.len());
}
```

Each thread sums a quarter of the data, borrowing it, with no copying. The scope guarantees no thread outlives `data`.

## Channels: sending messages between threads

"Do not communicate by sharing memory; share memory by communicating." A **channel** has a sending end and a receiving end, like a queue between threads (Python's `queue.Queue`):

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    for sensor_id in 0..3 {
        let tx = tx.clone();                       // each producer gets its own sender
        thread::spawn(move || {
            for reading in 0..2 {
                let value = 20.0 + sensor_id as f64 + reading as f64 * 0.5;
                tx.send((sensor_id, value)).unwrap();
            }
        });
    }
    drop(tx);                                      // close the original sender

    let mut received: Vec<(i32, f64)> = rx.iter().collect();   // ends when all senders are gone
    received.sort_by(|a, b| a.partial_cmp(b).unwrap());
    println!("{received:?}");
}
```

`mpsc` stands for multiple producer, single consumer. Sending a value **moves** it into the channel, so the sender can't touch it afterwards: no sharing, no race.

## Shared state: Arc and Mutex

Sometimes threads really do need to share and update the same data. You need two things:

- `Arc<T>` (**a**tomically **r**eference **c**ounted): the thread-safe version of `Rc`, so several threads can own the data.
- `Mutex<T>` (mutual exclusion): only one thread at a time can access the data inside. `lock()` waits for its turn and returns a guard; the lock is released when the guard is dropped.

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counts = Arc::new(Mutex::new(HashMap::new()));
    let batches = vec![vec!["H", "D", "H"], vec!["A", "H"], vec!["D", "D", "H"]];

    let mut handles = Vec::new();
    for batch in batches {
        let counts = Arc::clone(&counts);
        handles.push(thread::spawn(move || {
            for result in batch {
                let mut map = counts.lock().unwrap();     // wait for the lock
                *map.entry(result).or_insert(0) += 1;
            }                                              // lock released here
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    let map = counts.lock().unwrap();
    let mut keys: Vec<_> = map.keys().copied().collect();
    keys.sort();
    for k in keys {
        println!("{k}: {}", map[k]);
    }
}
```

The data lives *inside* the mutex, so it's impossible to touch it without locking. In Python or C++ the lock and the data are separate, and nothing stops you forgetting the lock.

## Send and Sync: how the compiler knows

Try to share an `Rc` between threads, or a `RefCell` without a lock:

```rust expect-error
use std::rc::Rc;
use std::thread;

fn main() {
    let shared = Rc::new(5);
    let copy = Rc::clone(&shared);
    thread::spawn(move || println!("{copy}")).join().unwrap();
}
```

The error says `Rc<i32> cannot be sent between threads safely`. Two marker traits, implemented automatically by the compiler, make this work:

- **`Send`**: a value can be moved to another thread. Almost everything is `Send`; `Rc` isn't, because its count isn't updated atomically.
- **`Sync`**: a value can be shared by reference between threads. `Mutex<T>` is `Sync`; `RefCell<T>` isn't.

`thread::spawn` requires its closure to be `Send`, so non-thread-safe types simply can't reach another thread. That's "fearless concurrency": if it compiles, it has no data races. (Deadlocks and logic bugs are still possible.)

## Atomics

For a single counter or flag, a mutex is overkill. **Atomic** types are updated with special CPU instructions that can't be interrupted. They're also how interrupt handlers and the main loop communicate on microcontrollers:

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;

static REQUESTS: AtomicU64 = AtomicU64::new(0);

fn main() {
    thread::scope(|s| {
        for _ in 0..4 {
            s.spawn(|| {
                for _ in 0..1000 {
                    REQUESTS.fetch_add(1, Ordering::Relaxed);
                }
            });
        }
    });
    println!("{}", REQUESTS.load(Ordering::Relaxed));
}
```

## Rayon: parallelism in one word

In real projects, the [`rayon`](https://docs.rs/rayon) crate turns an iterator into a parallel one by changing `iter()` to `par_iter()`. It splits the work across all your cores automatically:

```rust static
use rayon::prelude::*;

let total_error: f64 = rows
    .par_iter()                                  // was .iter()
    .map(|row| (model.predict(&row.features) - row.target).powi(2))
    .sum();
```

This is how Polars and many Rust ML tools use every core.

## Practice

:::exercise prust-parallel-sum Parallel sum of squares
Write `parallel_sum_squares(values: &[f64], threads: usize) -> f64` that splits `values` into `threads` roughly equal chunks, sums the squares of each chunk on its own scoped thread, and adds the results.

Use `values.chunks(chunk_size)` where `chunk_size = values.len().div_ceil(threads)` (at least 1).

@@starter
use std::thread;

fn parallel_sum_squares(values: &[f64], threads: usize) -> f64 {
    todo!()
}

@@solution
use std::thread;

fn parallel_sum_squares(values: &[f64], threads: usize) -> f64 {
    let chunk_size = values.len().div_ceil(threads.max(1)).max(1);
    thread::scope(|s| {
        let handles: Vec<_> = values
            .chunks(chunk_size)
            .map(|chunk| s.spawn(move || chunk.iter().map(|v| v * v).sum::<f64>()))
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).sum()
    })
}

@@tests
/// Matches the single-threaded answer
#[test]
fn matches_sequential() {
    let values: Vec<f64> = (1..=1000).map(|i| i as f64).collect();
    let expected: f64 = values.iter().map(|v| v * v).sum();
    assert_eq!(parallel_sum_squares(&values, 4), expected);
}

/// Works with more threads than values
#[test]
fn more_threads_than_values() {
    assert_eq!(parallel_sum_squares(&[1.0, 2.0], 8), 5.0);
}

/// Empty input
#[test]
fn empty() {
    assert_eq!(parallel_sum_squares(&[], 3), 0.0);
}

@@hint
Inside `thread::scope(|s| { ... })`, spawn one thread per chunk with `s.spawn(move || ...)`, collect the handles into a `Vec`, then join them and sum.
:::

:::exercise prust-channel-pipeline A sensor pipeline with channels
Write `collect_readings(sensors: Vec<Vec<f64>>) -> Vec<f64>`. Start one thread per sensor; each thread sends every reading in its list through a channel. The main thread receives all readings and returns them **sorted** in ascending order.

@@starter
use std::sync::mpsc;
use std::thread;

fn collect_readings(sensors: Vec<Vec<f64>>) -> Vec<f64> {
    todo!()
}

@@solution
use std::sync::mpsc;
use std::thread;

fn collect_readings(sensors: Vec<Vec<f64>>) -> Vec<f64> {
    let (tx, rx) = mpsc::channel();
    for readings in sensors {
        let tx = tx.clone();
        thread::spawn(move || {
            for r in readings {
                tx.send(r).unwrap();
            }
        });
    }
    drop(tx);
    let mut all: Vec<f64> = rx.iter().collect();
    all.sort_by(|a, b| a.total_cmp(b));
    all
}

@@tests
/// Collects everything from every sensor
#[test]
fn collects() {
    let out = collect_readings(vec![vec![3.0, 1.0], vec![2.0], vec![5.0, 4.0]]);
    assert_eq!(out, vec![1.0, 2.0, 3.0, 4.0, 5.0]);
}

/// No sensors, no readings (and no hang)
#[test]
fn none() {
    assert!(collect_readings(vec![]).is_empty());
}

@@hint
Clone `tx` for each thread and `move` the clone in. After spawning, `drop(tx)` so the receiver knows when every sender is finished; otherwise `rx.iter()` waits forever.
:::

:::quiz prust-concurrency-check Quick check
? Why must a closure passed to `thread::spawn` usually be `move`?
- [ ] Threads can't read variables
- [x] The thread may outlive the current function, so it must own what it uses
- [ ] move makes it run faster
> `thread::scope` is the alternative when you want threads to borrow.

? Which type lets several threads own and change a HashMap?
- [ ] `Rc<RefCell<HashMap>>`
- [x] `Arc<Mutex<HashMap>>`
- [ ] `Box<HashMap>`
> Arc is the thread-safe Rc; Mutex lets one thread at a time change the data.

? What does it mean that `Rc` is not `Send`?
- [x] The compiler won't let an Rc move to another thread
- [ ] Rc can't be sent over a network
- [ ] Rc is slower than Arc
> Its reference count isn't atomic, so sharing it across threads could corrupt it.

? Which bug does Rust's type system rule out completely in safe code?
- [ ] Deadlocks
- [x] Data races
- [ ] Logic errors
> Deadlocks are still possible; data races are compile errors.
:::
