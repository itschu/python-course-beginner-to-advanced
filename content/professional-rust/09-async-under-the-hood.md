---
title: Async Rust under the hood
summary: What futures, poll and wakers are, a tiny executor written from scratch, and where Tokio (servers) and Embassy (microcontrollers) fit.
minutes: 55
kind: lesson
language: rust
---

Threads are great for using many cores on heavy computation. But a web server handling 10,000 slow connections, or a microcontroller waiting on a button, a sensor and a radio at the same time, spends most of its time **waiting**. One thread per wait is wasteful (each thread needs its own stack, and a microcontroller may not have threads at all). **Async** code lets one thread juggle thousands of waiting tasks.

You met `async`/`await` in Python's FastAPI lessons. Rust's version looks the same but works very differently inside, and understanding that difference is what lets it run on a chip with no operating system.

## async fn and .await

```rust static
async fn fetch_odds(match_id: u32) -> f64 {
    let response = http_get(format!("/odds/{match_id}")).await;   // wait without blocking the thread
    response.parse().unwrap()
}

async fn best_of_two() -> f64 {
    let (a, b) = futures::join!(fetch_odds(1), fetch_odds(2));   // both requests in flight at once
    a.max(b)
}
```

Calling an `async fn` doesn't run it. It returns a **future**: a value representing work that hasn't finished yet. Nothing happens until something **polls** the future, usually by `.await`ing it inside another async function, all the way up to an **executor** (also called a runtime) at the top.

Python's asyncio has a built-in executor, the event loop. Rust's standard library deliberately doesn't ship one, so you pick one that suits your platform:

| Runtime | Where | Used for |
| --- | --- | --- |
| [Tokio](https://tokio.rs/) | servers, desktops | web services (`axum`), databases, networking |
| [Embassy](https://embassy.dev/) | microcontrollers | firmware: GPIO, sensors, radios, USB (Phase 12) |
| smol, async-std | general purpose | smaller alternatives to Tokio |

## The Future trait

A future is anything that implements this trait from the standard library:

```rust static
pub trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}

pub enum Poll<T> {
    Ready(T),   // finished, here's the result
    Pending,    // not yet: I'll call cx.waker().wake() when it's worth polling me again
}
```

The executor calls `poll`. The future either finishes (`Ready`) or says `Pending` and **stores the waker** so that whatever it's waiting for (a network packet, a timer, a button interrupt) can wake it later. The executor then sleeps until a waker fires, instead of checking every future in a busy loop. On a microcontroller, "sleep" means a low-power CPU mode, which saves battery.

(`Pin` guarantees the future won't be moved in memory between polls, which matters because async functions can hold references to their own local variables. You rarely deal with it directly.)

## A future and an executor from scratch

Here's a complete, working async runtime in about 30 lines of standard Rust, with a hand-written future that needs three polls before it's ready:

```rust
use std::future::Future;
use std::pin::{pin, Pin};
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};
use std::thread::{self, Thread};

/// A future that pretends to wait for a sensor: Pending twice, then Ready.
struct SensorReading {
    polls: u32,
}

impl Future for SensorReading {
    type Output = f64;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<f64> {
        self.polls += 1;
        println!("  polled ({})", self.polls);
        if self.polls < 3 {
            cx.waker().wake_by_ref();     // "poll me again" (a real driver would wait for an interrupt)
            Poll::Pending
        } else {
            Poll::Ready(21.5)
        }
    }
}

/// The waker unparks (wakes up) the thread running the executor.
struct ThreadWaker(Thread);

impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

/// A minimal executor: poll the future; if it's pending, sleep until woken.
fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = pin!(future);
    let waker = Waker::from(Arc::new(ThreadWaker(thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(value) => return value,
            Poll::Pending => thread::park(),
        }
    }
}

async fn average_temperature() -> f64 {
    println!("reading sensor 1");
    let a = SensorReading { polls: 0 }.await;
    println!("reading sensor 2");
    let b = SensorReading { polls: 0 }.await;
    (a + b) / 2.0
}

fn main() {
    let result = block_on(average_temperature());
    println!("average: {result}");
}
```

The compiler turns `average_temperature` into a **state machine**: an enum with one state per `.await` point, holding exactly the local variables alive at that point. Each `poll` advances it as far as it can go. No heap allocation, no threads: just an enum whose size is known at compile time. That's why async Rust works on a microcontroller with no operating system and a few kilobytes of RAM, while Python's asyncio needs a full interpreter.

## Tokio in practice

On a server you'd write:

```rust static
#[tokio::main]
async fn main() {
    let app = axum::Router::new().route("/health", axum::routing::get(|| async { "ok" }));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

`#[tokio::main]` sets up the executor and runs `main` on it. `tokio::spawn` runs tasks concurrently across a pool of threads. Phase 11 uses this to serve a model, like FastAPI did in Phase 8.

## Embassy in practice

On a Raspberry Pi Pico, Embassy's executor runs tasks that wait on hardware. This blinks an LED and reacts to a button at the same time, on a single core, sleeping whenever there's nothing to do:

```rust static
#[embassy_executor::task]
async fn blink(mut led: Output<'static>) {
    loop {
        led.toggle();
        Timer::after_millis(500).await;          // the CPU sleeps here
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_rp::init(Default::default());
    spawner.spawn(blink(Output::new(p.PIN_25, Level::Low))).unwrap();
    let mut button = Input::new(p.PIN_14, Pull::Up);
    loop {
        button.wait_for_falling_edge().await;    // woken by a GPIO interrupt
        defmt::info!("button pressed");
    }
}
```

You'll build exactly this in Phase 12.

## Common async pitfalls

- **Blocking inside async code.** `std::thread::sleep` or a long computation inside an async task freezes every other task on that thread. Use the runtime's timer (`tokio::time::sleep`, `embassy_time::Timer`), and move heavy work to `tokio::task::spawn_blocking` or a thread.
- **Forgetting to await.** A future that's never awaited never runs (the compiler warns you).
- **Holding a `std::sync::Mutex` guard across an `.await`.** Use the runtime's async mutex instead.

## Practice

:::exercise prust-async-future Write a future by hand
Implement `Future` for `Countdown`: each `poll` decreases `remaining` by one, wakes itself and returns `Pending`; when `remaining` reaches 0, it returns `Ready(label)` (the `String` it was created with, cloned).

Then write `async fn both(a: Countdown, b: Countdown) -> String` that awaits `a` and then `b` and returns their labels joined with `" and "`.

The `block_on` executor from the lesson is included so the tests can run your futures.

@@starter
use std::future::Future;
use std::pin::{pin, Pin};
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};
use std::thread::{self, Thread};

struct Countdown {
    remaining: u32,
    label: String,
}

impl Future for Countdown {
    type Output = String;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<String> {
        todo!()
    }
}

async fn both(a: Countdown, b: Countdown) -> String {
    todo!()
}

struct ThreadWaker(Thread);

impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = pin!(future);
    let waker = Waker::from(Arc::new(ThreadWaker(thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(value) => return value,
            Poll::Pending => thread::park(),
        }
    }
}

@@solution
use std::future::Future;
use std::pin::{pin, Pin};
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};
use std::thread::{self, Thread};

struct Countdown {
    remaining: u32,
    label: String,
}

impl Future for Countdown {
    type Output = String;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<String> {
        if self.remaining == 0 {
            return Poll::Ready(self.label.clone());
        }
        self.remaining -= 1;
        cx.waker().wake_by_ref();
        Poll::Pending
    }
}

async fn both(a: Countdown, b: Countdown) -> String {
    let first = a.await;
    let second = b.await;
    format!("{first} and {second}")
}

struct ThreadWaker(Thread);

impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = pin!(future);
    let waker = Waker::from(Arc::new(ThreadWaker(thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(value) => return value,
            Poll::Pending => thread::park(),
        }
    }
}

@@tests
use std::task::Waker;

/// Pending until the countdown reaches zero, then Ready
#[test]
fn polls() {
    let mut f = Countdown { remaining: 2, label: "led".to_string() };
    let mut cx = Context::from_waker(Waker::noop());
    assert_eq!(Pin::new(&mut f).poll(&mut cx), Poll::Pending);
    assert_eq!(Pin::new(&mut f).poll(&mut cx), Poll::Pending);
    assert_eq!(Pin::new(&mut f).poll(&mut cx), Poll::Ready("led".to_string()));
}

/// Runs on the executor
#[test]
fn runs() {
    assert_eq!(block_on(Countdown { remaining: 5, label: "ok".to_string() }), "ok");
}

/// both awaits the two futures in turn
#[test]
fn awaits_both() {
    let a = Countdown { remaining: 1, label: "sensor".to_string() };
    let b = Countdown { remaining: 3, label: "radio".to_string() };
    assert_eq!(block_on(both(a, b)), "sensor and radio");
}

@@hint
In `poll`: if `self.remaining == 0` return `Poll::Ready(self.label.clone())`. Otherwise decrease it, call `cx.waker().wake_by_ref()` so the executor polls again, and return `Poll::Pending`.

@@hint
`both` is ordinary async code: `let first = a.await; let second = b.await;` then `format!`.
:::

:::quiz prust-async-check Quick check
? What happens when you call an async fn without awaiting it?
- [ ] It runs in the background
- [x] Nothing runs: you just get a future
> Futures are lazy. They only make progress when polled by an executor.

? What does a future do when it returns Poll::Pending?
- [ ] Busy-waits
- [x] Arranges for the waker to be called when it can make progress
- [ ] Panics
> The executor can then sleep (on a microcontroller, in a low-power mode) until a waker fires.

? Why can async Rust run on a microcontroller without an OS?
- [ ] It uses threads
- [x] Async functions compile into fixed-size state machines; no heap or threads are needed
- [ ] Microcontrollers have built-in executors
> Embassy provides a tiny executor that runs these state machines.

? What's wrong with calling `std::thread::sleep` inside a Tokio task?
- [x] It blocks the whole thread, so other tasks on it can't run
- [ ] Nothing
- [ ] It doesn't compile
> Use `tokio::time::sleep(...).await` instead.
:::
