---
title: Async firmware with Embassy
summary: Write firmware as concurrent async tasks that sleep between events, share data between tasks with channels, and design the logic as testable state machines.
minutes: 60
kind: lesson
language: rust
---

In Phase 10 you saw that async Rust compiles to state machines that need no threads and no heap. **Embassy** turns that into a framework for microcontrollers: each job in your firmware is an `async` task, and while every task is waiting (for a timer, a pin edge, an I2C transfer) the executor puts the CPU to sleep. You get the simplicity of "one loop per job" without an RTOS, and low power for free.

## Blinky and a button, concurrently

```rust static
#![no_std]
#![no_main]

use defmt::info;
use embassy_executor::Spawner;
use embassy_rp::gpio::{Input, Level, Output, Pull};
use embassy_time::Timer;
use {defmt_rtt as _, panic_probe as _};

#[embassy_executor::task]
async fn heartbeat(mut led: Output<'static>) {
    loop {
        led.toggle();
        Timer::after_millis(500).await;           // sleeps; other tasks run meanwhile
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_rp::init(Default::default());
    spawner.spawn(heartbeat(Output::new(p.PIN_25, Level::Low))).unwrap();

    let mut button = Input::new(p.PIN_14, Pull::Up);
    let mut presses = 0u32;
    loop {
        button.wait_for_falling_edge().await;     // woken by the GPIO interrupt
        presses += 1;
        info!("pressed {} times", presses);
        Timer::after_millis(30).await;            // simple debounce
    }
}
```

Compare this with the MicroPython non-blocking loop from lesson 4: no `ticks_diff` bookkeeping, no flags set by interrupt handlers. Each job reads top to bottom like a simple blocking program, and Embassy wires up the interrupts and timers underneath. This is the same `async`/`.await` you know from FastAPI, running on a $4 chip.

:::warning Embassy moves quickly
Embassy is young and its APIs still change between releases (for example, how tasks are spawned). The code here shows the shape of an Embassy program; when you build for real, copy the matching example for your Embassy version and board.
:::

Get started with the Embassy examples for your board: `embassy/examples/rp` (Pico and Pico W) or `examples/rp235x` (Pico 2) in the [Embassy repository](https://github.com/embassy-rs/embassy).

## Async I2C

HAL drivers in Embassy are async too, so a sensor read doesn't block other tasks while the bytes travel over the bus:

```rust static
use embassy_rp::i2c::{self, Config, I2c};
use embassy_rp::bind_interrupts;
use embassy_rp::peripherals::I2C0;

bind_interrupts!(struct Irqs {
    I2C0_IRQ => i2c::InterruptHandler<I2C0>;
});

#[embassy_executor::task]
async fn read_temperature(mut i2c: I2c<'static, I2C0, i2c::Async>) {
    loop {
        let mut buf = [0u8; 2];
        match i2c.write_read_async(0x48u16, [0x00], &mut buf).await {
            Ok(()) => {
                let celsius = (i16::from_be_bytes(buf) >> 4) as f32 * 0.0625;
                info!("temperature {} °C", celsius);
            }
            Err(e) => defmt::warn!("TMP102 read failed: {}", e),
        }
        Timer::after_secs(1).await;
    }
}
```

Async drivers implement the `embedded-hal-async` traits, so the portable TMP102 driver from lesson 8 can be made async by adding `async` and `.await`.

## Sharing data between tasks: channels

Tasks shouldn't share mutable globals. As in Phase 10, they **send messages**. `embassy-sync` provides a channel with a fixed capacity, stored in a `static` (no heap):

```rust static
use embassy_sync::blocking_mutex::raw::CriticalSectionRawMutex;
use embassy_sync::channel::Channel;

#[derive(Clone, Copy, defmt::Format)]
enum Event {
    ButtonPressed,
    Temperature(i16),        // tenths of a degree
}

static EVENTS: Channel<CriticalSectionRawMutex, Event, 8> = Channel::new();

#[embassy_executor::task]
async fn button_task(mut button: Input<'static>) {
    loop {
        button.wait_for_falling_edge().await;
        EVENTS.send(Event::ButtonPressed).await;   // waits if the channel is full
    }
}

#[embassy_executor::task]
async fn controller(mut fan: Output<'static>) {
    let mut logic = FanLogic::new();               // the state machine below
    loop {
        let event = EVENTS.receive().await;
        let on = logic.handle(event);
        fan.set_level(if on { Level::High } else { Level::Low });
    }
}
```

`CriticalSectionRawMutex` makes the channel safe to use from interrupts as well as tasks. The capacity (8) is part of the type: memory is fixed at compile time.

## Keep the logic pure

Notice the `controller` task above: it receives events, asks `FanLogic` what to do, and sets a pin. **All the decisions live in plain Rust** that doesn't touch hardware, so you can test it on your laptop, exhaustively. This is the most valuable habit in firmware: the hardware layer is thin; the logic is a pure function or a state machine you can unit test.

Here's a complete example: a hallway light with a motion sensor and a button.

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum Event {
    Motion,
    ButtonPress,
    Tick { now_ms: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum State {
    Off,
    AutoOn { until_ms: u32 },     // switched on by motion, turns itself off
    ManualOn,                     // switched on by the button, stays on
}

const AUTO_ON_MS: u32 = 30_000;

fn next(state: State, event: Event, now_ms: u32) -> State {
    match (state, event) {
        (State::Off, Event::Motion) => State::AutoOn { until_ms: now_ms + AUTO_ON_MS },
        (State::AutoOn { .. }, Event::Motion) => State::AutoOn { until_ms: now_ms + AUTO_ON_MS },
        (State::AutoOn { until_ms }, Event::Tick { now_ms }) if now_ms >= until_ms => State::Off,
        (State::Off | State::AutoOn { .. }, Event::ButtonPress) => State::ManualOn,
        (State::ManualOn, Event::ButtonPress) => State::Off,
        (state, _) => state,                      // everything else: no change
    }
}

fn light_on(state: State) -> bool {
    !matches!(state, State::Off)
}

fn main() {
    let script = [
        (0, Event::Motion),
        (10_000, Event::Tick { now_ms: 10_000 }),
        (20_000, Event::Motion),                  // extends the timer
        (45_000, Event::Tick { now_ms: 45_000 }),
        (50_001, Event::Tick { now_ms: 50_001 }), // 30 s after the last motion
        (60_000, Event::ButtonPress),
        (99_000, Event::Tick { now_ms: 99_000 }), // manual mode ignores the timer
    ];
    let mut state = State::Off;
    for (t, event) in script {
        state = next(state, event, t);
        println!("{t:>6} ms {event:?} -> {state:?} (light {})", if light_on(state) { "on" } else { "off" });
    }
}
```

The `match` on `(state, event)` pairs is the whole specification of the device, readable at a glance, and the compiler checks that every combination is handled (the final `(state, _)` arm makes "ignore it" an explicit decision).

## Practice

:::exercise emb-rs-click-classifier Short, long and double clicks
Many devices have a single button that does different things for a short press, a long press and a double click. Write `classify(events: &[(u32, bool)]) -> Vec<Click>`, where each event is `(time_ms, pressed)` (true = pressed, false = released), alternating press and release, starting with a press.

Rules, with `LONG_MS = 800` and `DOUBLE_GAP_MS = 300`:

- a press held for `LONG_MS` or more is a `Long` click
- otherwise it's a short press. If the **next** press starts within `DOUBLE_GAP_MS` of this release, and is also short, the two together are one `Double` click. Otherwise it's a `Short` click.

@@starter
#[derive(Debug, Clone, Copy, PartialEq)]
enum Click {
    Short,
    Long,
    Double,
}

const LONG_MS: u32 = 800;
const DOUBLE_GAP_MS: u32 = 300;

fn classify(events: &[(u32, bool)]) -> Vec<Click> {
    todo!()
}

@@solution
#[derive(Debug, Clone, Copy, PartialEq)]
enum Click {
    Short,
    Long,
    Double,
}

const LONG_MS: u32 = 800;
const DOUBLE_GAP_MS: u32 = 300;

fn classify(events: &[(u32, bool)]) -> Vec<Click> {
    // Pair up presses and releases: (pressed_at, released_at)
    let presses: Vec<(u32, u32)> = events.chunks(2).filter(|c| c.len() == 2).map(|c| (c[0].0, c[1].0)).collect();
    let is_long = |p: &(u32, u32)| p.1 - p.0 >= LONG_MS;
    let mut clicks = Vec::new();
    let mut i = 0;
    while i < presses.len() {
        let current = presses[i];
        if is_long(&current) {
            clicks.push(Click::Long);
            i += 1;
        } else if i + 1 < presses.len()
            && !is_long(&presses[i + 1])
            && presses[i + 1].0 - current.1 <= DOUBLE_GAP_MS
        {
            clicks.push(Click::Double);
            i += 2;
        } else {
            clicks.push(Click::Short);
            i += 1;
        }
    }
    clicks
}

@@tests
/// A quick press is Short, a held press is Long
#[test]
fn short_and_long() {
    assert_eq!(classify(&[(0, true), (100, false)]), vec![Click::Short]);
    assert_eq!(classify(&[(0, true), (900, false)]), vec![Click::Long]);
}

/// Two quick presses close together are a Double
#[test]
fn double() {
    assert_eq!(classify(&[(0, true), (80, false), (250, true), (330, false)]), vec![Click::Double]);
}

/// Presses too far apart are two Shorts
#[test]
fn two_shorts() {
    assert_eq!(classify(&[(0, true), (80, false), (600, true), (680, false)]), vec![Click::Short, Click::Short]);
}

/// A long press is never part of a double
#[test]
fn long_after_short() {
    let events = [(0, true), (80, false), (200, true), (1200, false), (1300, true), (1350, false)];
    assert_eq!(classify(&events), vec![Click::Short, Click::Long, Click::Short]);
}

@@hint
First pair the events into `(pressed_at, released_at)` tuples with `events.chunks(2)`. Then walk through the presses with an index, looking one press ahead to detect doubles.
:::

:::exercise emb-rs-charger A battery charger state machine
Model a battery charger as a state machine. Write `next(state: Charger, event: Input) -> Charger`:

- `Idle` + `Plugged` → `Charging`
- `Charging` + `Voltage(mv)` → `Full` if `mv >= 4200`, `Fault` if `mv > 4300` (check this first), otherwise stay `Charging`
- `Charging` + `TemperatureC(t)` → `Fault` if `t > 45` or `t < 0`
- `Full` + `Voltage(mv)` → back to `Charging` if `mv < 4000` (top up)
- any state + `Unplugged` → `Idle`, **except** `Fault`, which stays `Fault` until `Reset`
- `Fault` + `Reset` → `Idle`
- everything else: no change

@@starter
#[derive(Debug, Clone, Copy, PartialEq)]
enum Charger {
    Idle,
    Charging,
    Full,
    Fault,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Input {
    Plugged,
    Unplugged,
    Voltage(u32),
    TemperatureC(i32),
    Reset,
}

fn next(state: Charger, event: Input) -> Charger {
    todo!()
}

@@solution
#[derive(Debug, Clone, Copy, PartialEq)]
enum Charger {
    Idle,
    Charging,
    Full,
    Fault,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Input {
    Plugged,
    Unplugged,
    Voltage(u32),
    TemperatureC(i32),
    Reset,
}

fn next(state: Charger, event: Input) -> Charger {
    use Charger::*;
    match (state, event) {
        (Fault, Input::Reset) => Idle,
        (Fault, _) => Fault,
        (_, Input::Unplugged) => Idle,
        (Idle, Input::Plugged) => Charging,
        (Charging, Input::Voltage(mv)) if mv > 4300 => Fault,
        (Charging, Input::Voltage(mv)) if mv >= 4200 => Full,
        (Charging, Input::TemperatureC(t)) if !(0..=45).contains(&t) => Fault,
        (Full, Input::Voltage(mv)) if mv < 4000 => Charging,
        (s, _) => s,
    }
}

@@tests
use Charger::*;

/// A normal charge cycle
#[test]
fn normal_cycle() {
    let mut s = Idle;
    for e in [Input::Plugged, Input::Voltage(3900), Input::TemperatureC(30), Input::Voltage(4200)] {
        s = next(s, e);
    }
    assert_eq!(s, Full);
    assert_eq!(next(s, Input::Voltage(3990)), Charging);
    assert_eq!(next(s, Input::Unplugged), Idle);
}

/// Over-voltage and temperature faults
#[test]
fn faults() {
    assert_eq!(next(Charging, Input::Voltage(4400)), Fault);
    assert_eq!(next(Charging, Input::TemperatureC(50)), Fault);
    assert_eq!(next(Charging, Input::TemperatureC(-5)), Fault);
    assert_eq!(next(Charging, Input::TemperatureC(45)), Charging);
}

/// A fault latches until reset
#[test]
fn fault_latches() {
    assert_eq!(next(Fault, Input::Unplugged), Fault);
    assert_eq!(next(Fault, Input::Plugged), Fault);
    assert_eq!(next(Fault, Input::Reset), Idle);
}

/// Irrelevant events change nothing
#[test]
fn ignored() {
    assert_eq!(next(Idle, Input::Voltage(4200)), Idle);
    assert_eq!(next(Idle, Input::Reset), Idle);
    assert_eq!(next(Full, Input::Plugged), Full);
}

@@hint
`match (state, event)` with the `Fault` arms first, then `Unplugged`, then the rest. Guards like `if mv > 4300` go on the arm; order matters, since the first matching arm wins.
:::

:::quiz emb-embassy-check Quick check
? What does the CPU do while every Embassy task is waiting?
- [ ] Polls each task in a busy loop
- [x] Sleeps until an interrupt (timer, GPIO, peripheral) wakes a task
- [ ] Runs the garbage collector
> That's how async firmware saves power.

? How should two Embassy tasks share events?
- [ ] Through a global `static mut`
- [x] Through a fixed-capacity channel (or another embassy-sync primitive)
- [ ] By calling each other directly
> Channels are safe across tasks and interrupts and need no heap.

? Why keep device logic in a pure state machine separate from the hardware tasks?
- [x] It can be unit tested exhaustively on a laptop
- [ ] It runs faster
- [ ] Embassy requires it
> The hardware layer stays thin; the decisions are testable code.
:::
