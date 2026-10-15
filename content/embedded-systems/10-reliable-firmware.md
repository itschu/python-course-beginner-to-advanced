---
title: Reliable firmware
summary: Firmware must run for years without a restart. Panic-free code, watchdogs, fixed-point arithmetic, checksums, timeouts and power budgets.
minutes: 60
kind: lesson
language: rust
---

A crashed web server restarts in a second and someone gets paged. A crashed thermostat, pacemaker or car controller is a real problem, and often nobody is there to press reset. This lesson collects the habits that make firmware dependable.

## 1. Don't panic

In `no_std` firmware a panic usually halts the chip or resets it. Rust code can panic in places that are easy to overlook:

| Panics | Panic-free alternative |
| --- | --- |
| `slice[i]` out of bounds | `slice.get(i)` → `Option` |
| `a + b` overflowing (debug builds) | `checked_add`, `saturating_add`, `wrapping_add` |
| `x / 0` | `checked_div` |
| `.unwrap()`, `.expect()` | `match`, `if let`, `?`, `unwrap_or` |
| `todo!()`, `unreachable!()` | handle the case |

```rust
fn average_reading(buffer: &[u16], count: usize) -> Option<u16> {
    let window = buffer.get(..count)?;               // None instead of a panic if count is too big
    let sum = window.iter().try_fold(0u32, |acc, &x| acc.checked_add(x as u32))?;
    let avg = sum.checked_div(window.len() as u32)?; // None for an empty window
    u16::try_from(avg).ok()
}

fn main() {
    let samples = [1000, 1010, 990, 1004];
    println!("{:?}", average_reading(&samples, 4));
    println!("{:?}", average_reading(&samples, 10));
    println!("{:?}", average_reading(&samples, 0));
}
```

Clippy can enforce this across a whole crate with lints like `clippy::indexing_slicing`, `clippy::unwrap_used` and `clippy::arithmetic_side_effects`.

## 2. Watchdogs

Even careful code can get stuck: a sensor that never answers, a loop with a bug, a cosmic ray flipping a bit. A **watchdog timer** is a hardware counter that resets the chip unless the program "feeds" it regularly. Feed it only from the main loop, after all the important work has completed, so it proves the whole system is alive:

```python static
from machine import WDT

wdt = WDT(timeout=2000)        # reset if not fed for 2 seconds
while True:
    read_sensors()
    update_outputs()
    wdt.feed()                 # "I'm still alive"
```

The course's MicroPython simulator implements `WDT` too: forget to feed it and the run stops with `WatchdogReset`. After a reset, firmware should check `machine.reset_cause()` and log that a watchdog reset happened, so you find the bug instead of hiding it.

## 3. Timeouts everywhere

Every wait for hardware needs a timeout. A disconnected sensor must not freeze the device:

```rust static
// Embassy: give the sensor 50 ms, then carry on without it
match embassy_time::with_timeout(Duration::from_millis(50), sensor.read()).await {
    Ok(Ok(value)) => use_reading(value),
    Ok(Err(bus_error)) => log_and_retry(bus_error),
    Err(_timeout) => mark_sensor_offline(),
}
```

## 4. Fixed-point arithmetic

The RP2040's Cortex-M0+ has **no floating-point unit**: every `f32` operation is emulated in software, roughly 50 to 100 times slower than an integer operation. Even chips with an FPU often lack fast `f64`. The classic solution is **fixed-point**: store numbers as integers scaled by a power of two.

In **Q16.16** format, a value `v` is stored as the `i32` `v × 65536`: 16 bits for the integer part and 16 for the fraction. Addition is ordinary integer addition. Multiplication needs a wider intermediate and a shift back:

```rust
const FRAC_BITS: u32 = 16;
const ONE: i32 = 1 << FRAC_BITS;                    // 1.0 in Q16.16

fn to_fixed(v: f32) -> i32 {
    (v * ONE as f32).round() as i32
}

fn to_float(q: i32) -> f32 {
    q as f32 / ONE as f32
}

fn mul(a: i32, b: i32) -> i32 {
    ((a as i64 * b as i64) >> FRAC_BITS) as i32     // widen to i64 so it can't overflow
}

fn main() {
    let gain = to_fixed(1.25);
    let reading = to_fixed(21.5);
    let offset = to_fixed(-0.75);
    let calibrated = mul(reading, gain) + offset;   // 21.5 × 1.25 − 0.75
    println!("{} (exact: {})", to_float(calibrated), 21.5 * 1.25 - 0.75);
    println!("resolution: {}", 1.0 / ONE as f32);
}
```

Fixed-point is also the foundation of **quantised neural networks** on microcontrollers, which is exactly what Phase 13 does with int8 weights.

## 5. Checksums: trust no byte

Data arriving over I2C, UART or radio can be corrupted. Many sensors append a **CRC** (cyclic redundancy check) to each reading; Sensirion's popular humidity sensors (SHT3x, SHT4x) use CRC-8 with polynomial `0x31` and initial value `0xFF`. Check it, and discard bad readings:

```text
for each byte:
    crc ^= byte
    repeat 8 times:
        if the top bit of crc is set: crc = (crc << 1) ^ 0x31
        else:                         crc = crc << 1
```

You'll implement it in the exercise. The datasheet's test value: the CRC of `[0xBE, 0xEF]` is `0x92`.

## 6. Power budgets

Battery devices live or die by their average current. A device that's awake for 50 ms every minute and asleep the rest of the time has an average current of:

$$
I_{avg} = \frac{I_{active} \times t_{active} + I_{sleep} \times t_{sleep}}{t_{active} + t_{sleep}}
$$

and lasts about `capacity (mAh) / I_avg (mA)` hours. Sleep current usually dominates, which is why `lightsleep`, `deepsleep` and Embassy's sleeping executor matter so much.

## 7. Test on the laptop, then on the bench

- **Unit tests** for all logic (state machines, parsers, filters, fixed-point maths) on your laptop, with mocks for hardware (lesson 8).
- **Hardware-in-the-loop** tests on a real board, run by `cargo test` with tools like `probe-rs` and `embedded-test`.
- **Soak tests**: leave it running for days and log resets.

## Practice

:::exercise emb-rs-crc8 Sensirion CRC-8
Write `crc8(data: &[u8]) -> u8` using polynomial `0x31` and initial value `0xFF`, then `check_reading(frame: [u8; 3]) -> Option<u16>`: the first two bytes are a big-endian reading and the third is its CRC. Return the reading if the CRC matches, otherwise `None`.

@@starter
fn crc8(data: &[u8]) -> u8 {
    todo!()
}

fn check_reading(frame: [u8; 3]) -> Option<u16> {
    todo!()
}

@@solution
fn crc8(data: &[u8]) -> u8 {
    let mut crc: u8 = 0xFF;
    for &byte in data {
        crc ^= byte;
        for _ in 0..8 {
            crc = if crc & 0x80 != 0 { (crc << 1) ^ 0x31 } else { crc << 1 };
        }
    }
    crc
}

fn check_reading(frame: [u8; 3]) -> Option<u16> {
    if crc8(&frame[..2]) == frame[2] {
        Some(u16::from_be_bytes([frame[0], frame[1]]))
    } else {
        None
    }
}

@@tests
/// The datasheet's test vector: CRC(0xBE, 0xEF) = 0x92
#[test]
fn datasheet_vector() {
    assert_eq!(crc8(&[0xBE, 0xEF]), 0x92);
}

/// Empty data gives the initial value
#[test]
fn empty() {
    assert_eq!(crc8(&[]), 0xFF);
}

/// A good frame returns the reading
#[test]
fn good_frame() {
    assert_eq!(check_reading([0xBE, 0xEF, 0x92]), Some(0xBEEF));
}

/// A corrupted frame is rejected
#[test]
fn bad_frame() {
    assert_eq!(check_reading([0xBE, 0xEE, 0x92]), None);
    assert_eq!(check_reading([0xBE, 0xEF, 0x93]), None);
}

@@hint
Start with `let mut crc: u8 = 0xFF;`. For each byte, `crc ^= byte;` then 8 times: if the top bit (`crc & 0x80`) is set, `crc = (crc << 1) ^ 0x31`, else `crc <<= 1`. Shifting a `u8` left drops the top bit, which is what you want.
:::

:::exercise emb-rs-fixed-ema A fixed-point filter
Implement an exponential moving average using only integers, for a chip without an FPU. Values are Q16.16 `i32`s and `alpha` is also Q16.16.

- `mul(a: i32, b: i32) -> i32`: Q16.16 multiplication (widen to `i64`, shift right 16)
- `struct Ema { alpha: i32, value: Option<i32> }` with `new(alpha: i32)` and `update(&mut self, sample: i32) -> i32`: the first sample is used as-is; after that `value + alpha × (sample − value)`.

@@starter
const ONE: i32 = 1 << 16;

fn mul(a: i32, b: i32) -> i32 {
    todo!()
}

struct Ema {
    alpha: i32,
    value: Option<i32>,
}

impl Ema {
    fn new(alpha: i32) -> Ema {
        todo!()
    }

    fn update(&mut self, sample: i32) -> i32 {
        todo!()
    }
}

@@solution
const ONE: i32 = 1 << 16;

fn mul(a: i32, b: i32) -> i32 {
    ((a as i64 * b as i64) >> 16) as i32
}

struct Ema {
    alpha: i32,
    value: Option<i32>,
}

impl Ema {
    fn new(alpha: i32) -> Ema {
        Ema { alpha, value: None }
    }

    fn update(&mut self, sample: i32) -> i32 {
        let next = match self.value {
            None => sample,
            Some(v) => v + mul(self.alpha, sample - v),
        };
        self.value = Some(next);
        next
    }
}

@@tests
fn q(v: f64) -> i32 {
    (v * ONE as f64).round() as i32
}

/// Fixed-point multiplication
#[test]
fn multiplies() {
    assert_eq!(mul(q(1.5), q(2.0)), q(3.0));
    assert_eq!(mul(q(-0.5), q(21.5)), q(-10.75));
}

/// No overflow for large intermediate products
#[test]
fn no_overflow() {
    assert_eq!(mul(q(1000.0), q(30.0)), q(30000.0));
}

/// The EMA moves a fraction alpha toward each sample
#[test]
fn ema() {
    let mut f = Ema::new(q(0.25));
    assert_eq!(f.update(q(20.0)), q(20.0));
    assert_eq!(f.update(q(24.0)), q(21.0));
    assert_eq!(f.update(q(24.0)), q(21.75));
}

@@hint
`((a as i64 * b as i64) >> 16) as i32`. Without the `i64`, `1000.0 × 30.0` in Q16.16 overflows an `i32` intermediate.
:::

:::exercise emb-rs-battery-life Battery life
Write `battery_life_days(capacity_mah: f32, active_ma: f32, active_ms: u32, sleep_ua: f32, period_s: u32) -> f32`: the device wakes for `active_ms` milliseconds every `period_s` seconds, drawing `active_ma` milliamps, and sleeps the rest of the period drawing `sleep_ua` **micro**amps. Return the battery life in days.

@@starter
fn battery_life_days(capacity_mah: f32, active_ma: f32, active_ms: u32, sleep_ua: f32, period_s: u32) -> f32 {
    todo!()
}

@@solution
fn battery_life_days(capacity_mah: f32, active_ma: f32, active_ms: u32, sleep_ua: f32, period_s: u32) -> f32 {
    let period_ms = period_s as f32 * 1000.0;
    let active = active_ms as f32;
    let sleep = period_ms - active;
    let average_ma = (active_ma * active + sleep_ua / 1000.0 * sleep) / period_ms;
    capacity_mah / average_ma / 24.0
}

@@tests
fn close(a: f32, b: f32) -> bool {
    (a - b).abs() / b < 1e-4
}

/// Always awake: 1000 mAh at 25 mA is 40 hours
#[test]
fn always_on() {
    assert!(close(battery_life_days(1000.0, 25.0, 1000, 0.0, 1), 40.0 / 24.0));
}

/// A sensor node waking 50 ms per minute
#[test]
fn duty_cycled() {
    // average = (25 × 50 + 0.02 × 59950) / 60000 ≈ 0.04083 mA
    let days = battery_life_days(1000.0, 25.0, 50, 20.0, 60);
    assert!(close(days, 1000.0 / ((25.0 * 50.0 + 0.02 * 59950.0) / 60000.0) / 24.0), "got {days}");
}

/// Sleep current matters
#[test]
fn sleep_current_dominates() {
    let good = battery_life_days(1000.0, 25.0, 50, 20.0, 60);
    let leaky = battery_life_days(1000.0, 25.0, 50, 500.0, 60);
    assert!(good > 2.0 * leaky);
}

@@hint
Work in milliseconds and milliamps: convert `sleep_ua` to mA by dividing by 1000. The average current is the time-weighted average; hours = capacity / average; days = hours / 24.
:::

:::quiz emb-reliable-check Quick check
? Which of these can panic? (choose all that apply)
- [x] `buffer[i]`
- [x] `value.unwrap()`
- [ ] `buffer.get(i)`
- [ ] `a.saturating_add(b)`
> `get` returns an Option and saturating arithmetic never panics.

? When should firmware feed the watchdog?
- [ ] In a timer interrupt, every 10 ms
- [x] In the main loop, after the important work has completed
- [ ] Once at startup
> Feeding it from an interrupt would keep a frozen main loop alive.

? Why use fixed-point arithmetic on an RP2040?
- [x] It has no floating-point unit, so floats are emulated and slow
- [ ] Floats are inaccurate
- [ ] Rust doesn't support f32 in no_std
> f32 works, just much more slowly; integers are fast everywhere.

? A sensor node is asleep 99.9% of the time. What usually dominates its battery life?
- [ ] Its active current
- [x] Its sleep current
- [ ] The CPU clock speed
> Microamps for 99.9% of the time add up to more than milliamps for 0.1%.
:::
