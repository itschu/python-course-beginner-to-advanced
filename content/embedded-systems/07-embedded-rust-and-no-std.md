---
title: "Embedded Rust: no_std and the toolchain"
summary: How a Rust program runs with no operating system, what core, alloc and std provide, cross-compiling and flashing a Pico, and writing code that never allocates.
minutes: 55
kind: lesson
language: rust
---

MicroPython is wonderful for experiments. For products, most teams write firmware in C, and increasingly in Rust: it's as fast and small as C, without C's memory bugs, which cause the majority of security vulnerabilities in embedded devices.

## std, alloc and core

Rust's standard library comes in three layers:

| Crate | Needs | Gives you |
| --- | --- | --- |
| `core` | nothing at all | primitive types, `Option`, `Result`, iterators, slices, `str`, traits, formatting machinery, atomics |
| `alloc` | a heap allocator | `Vec`, `String`, `Box`, `Rc`, `BTreeMap` |
| `std` | an operating system | files, threads, networking, `HashMap`, `println!`, time |

A microcontroller has no operating system, so firmware starts with `#![no_std]`: only `core` is available. That still includes most of what you've used in Phases 9 and 10: structs, enums, traits, generics, iterators, `match`, `Option`, `Result`, slices and arrays. What's missing is anything that needs a heap or an OS. Many programs also skip `alloc` entirely, so memory use is fixed and known when you compile.

## A complete bare-metal program

Here's the "blinky" of embedded Rust for the Raspberry Pi Pico, using the `rp2040-hal` crate:

```rust static
#![no_std]                       // only `core`: no OS, no heap
#![no_main]                      // no normal main: the runtime calls our #[entry] function

use panic_halt as _;             // what to do on panic: stop (there's nowhere to print)
use rp2040_hal as hal;
use hal::pac;
use embedded_hal::delay::DelayNs;
use embedded_hal::digital::OutputPin;

#[unsafe(link_section = ".boot2")]
#[used]
pub static BOOT2: [u8; 256] = rp2040_boot2::BOOT_LOADER_GENERIC_03H;   // the flash boot loader

const XTAL_FREQ_HZ: u32 = 12_000_000;

#[hal::entry]
fn main() -> ! {                 // `!` means "never returns"
    let mut pac = pac::Peripherals::take().unwrap();     // singleton access to every peripheral
    let mut watchdog = hal::Watchdog::new(pac.WATCHDOG);
    let clocks = hal::clocks::init_clocks_and_plls(
        XTAL_FREQ_HZ, pac.XOSC, pac.CLOCKS, pac.PLL_SYS, pac.PLL_USB, &mut pac.RESETS, &mut watchdog,
    )
    .ok()
    .unwrap();
    let mut timer = hal::Timer::new(pac.TIMER, &mut pac.RESETS, &clocks);

    let sio = hal::Sio::new(pac.SIO);
    let pins = hal::gpio::Pins::new(pac.IO_BANK0, pac.PADS_BANK0, sio.gpio_bank0, &mut pac.RESETS);
    let mut led = pins.gpio25.into_push_pull_output();

    loop {
        led.set_high().unwrap();
        timer.delay_ms(500);
        led.set_low().unwrap();
        timer.delay_ms(500);
    }
}
```

More setup than MicroPython's three lines, but every step is explicit: configure the clocks, take ownership of the GPIO bank, turn pin 25 into an output, loop forever. Next lesson explains `Peripherals::take()` and `into_push_pull_output()`, which are where Rust's type system starts protecting your hardware.

## The toolchain

```bash
# 1. Add the compiler target for the chip's CPU
rustup target add thumbv6m-none-eabi          # RP2040 (Pico, Pico W): Cortex-M0+
rustup target add thumbv8m.main-none-eabihf   # RP2350 (Pico 2): Cortex-M33 with a float unit

# 2. Install probe-rs, to flash and debug over a debug probe
cargo install probe-rs-tools

# 3. Start from a template rather than from scratch
cargo install cargo-generate
cargo generate --git https://github.com/rp-rs/rp2040-project-template
```

A project has a few embedded-specific files:

- `.cargo/config.toml` sets the default target and the **runner**, so `cargo run` builds, flashes and starts the firmware:

```toml
[build]
target = "thumbv6m-none-eabi"

[target.thumbv6m-none-eabi]
runner = "probe-rs run --chip RP2040"
```

- `memory.x` tells the linker where flash and RAM are on this chip:

```text
MEMORY {
    BOOT2 : ORIGIN = 0x10000000, LENGTH = 0x100
    FLASH : ORIGIN = 0x10000100, LENGTH = 2048K - 0x100
    RAM   : ORIGIN = 0x20000000, LENGTH = 256K
}
```

Without a debug probe, you can convert the build to a `.uf2` file with `elf2uf2-rs` and drag it onto the Pico's USB drive (hold BOOTSEL while plugging it in). A probe (like the $12 Raspberry Pi Debug Probe, or a second Pico running debug firmware) is worth it: `cargo run` flashes in seconds, and **defmt** sends efficient log messages back to your terminal:

```rust static
defmt::info!("temperature = {} °C, battery = {=u16} mV", temp, millivolts);
```

## Writing code without a heap

No `Vec`, `String` or `format!`, so how do you collect readings or build a message? With fixed-size arrays and the length tracked separately, sized at compile time. The `heapless` crate packages this up (`heapless::Vec<T, N>`, `heapless::String<N>`), but it's worth writing once yourself. This code only uses `core` features, so it would compile with `#![no_std]`:

```rust
/// A list with a fixed capacity, stored inline (no heap).
struct FixedVec<T: Copy + Default, const N: usize> {
    items: [T; N],
    len: usize,
}

impl<T: Copy + Default, const N: usize> FixedVec<T, N> {
    fn new() -> Self {
        FixedVec { items: [T::default(); N], len: 0 }
    }

    /// Like Vec::push, but returns the item back if there's no room.
    fn push(&mut self, item: T) -> Result<(), T> {
        if self.len == N {
            return Err(item);
        }
        self.items[self.len] = item;
        self.len += 1;
        Ok(())
    }

    fn as_slice(&self) -> &[T] {
        &self.items[..self.len]
    }
}

fn main() {
    let mut readings: FixedVec<i16, 4> = FixedVec::new();
    for r in [215, 216, 218, 221, 230] {
        if readings.push(r).is_err() {
            println!("buffer full, dropped {r}");
        }
    }
    let total: i32 = readings.as_slice().iter().map(|&r| r as i32).sum();
    println!("{:?}, mean {}", readings.as_slice(), total / readings.len as i32);
    println!("size in RAM: {} bytes", std::mem::size_of::<FixedVec<i16, 4>>());
}
```

(The `main` and `println!` are only there so you can run it here. In firmware, the struct is unchanged.)

Memory use is fixed and visible: `size_of` tells you exactly how many bytes, and the compiler can report the total RAM your firmware needs. There's no way to run out of heap at 3 a.m. after a week of uptime, a classic failure in long-running devices.

## Practice

:::exercise emb-rs-format-number Format a number without format!
On a microcontroller without `alloc`, there's no `format!` or `String`. Write `write_u32(value: u32, buf: &mut [u8; 10]) -> &str` that writes the decimal digits of `value` into the end of `buf` and returns them as a string slice (borrowing `buf`). Use only `core` operations: `%`, `/`, array indexing and `core::str::from_utf8`.

`10` bytes is enough for any `u32` (the maximum, 4294967295, has 10 digits).

@@starter
fn write_u32(value: u32, buf: &mut [u8; 10]) -> &str {
    todo!()
}

@@solution
fn write_u32(value: u32, buf: &mut [u8; 10]) -> &str {
    let mut i = buf.len();
    let mut v = value;
    loop {
        i -= 1;
        buf[i] = b'0' + (v % 10) as u8;
        v /= 10;
        if v == 0 {
            break;
        }
    }
    core::str::from_utf8(&buf[i..]).unwrap()
}

@@tests
/// Writes ordinary numbers
#[test]
fn ordinary() {
    let mut buf = [0u8; 10];
    assert_eq!(write_u32(2024, &mut buf), "2024");
}

/// Zero is "0", not an empty string
#[test]
fn zero() {
    let mut buf = [0u8; 10];
    assert_eq!(write_u32(0, &mut buf), "0");
}

/// The largest u32 fits
#[test]
fn max() {
    let mut buf = [0u8; 10];
    assert_eq!(write_u32(u32::MAX, &mut buf), "4294967295");
}

@@hint
Fill the buffer from the end: take `v % 10` for the last digit, convert it with `b'0' + digit as u8`, then `v /= 10`. A `loop` with the check at the end handles 0 correctly.

@@hint
Finish with `core::str::from_utf8(&buf[i..]).unwrap()`. The digits are always valid UTF-8, so the `unwrap` can't fail.
:::

:::exercise emb-rs-min-max-avg Statistics without a heap
Write `stats(samples: &[i16]) -> Option<(i16, i16, i16)>` returning `(min, max, mean)` for a non-empty slice, or `None` if it's empty. The mean is rounded toward zero. Use an `i32` accumulator so the sum can't overflow, and don't allocate.

@@starter
fn stats(samples: &[i16]) -> Option<(i16, i16, i16)> {
    todo!()
}

@@solution
fn stats(samples: &[i16]) -> Option<(i16, i16, i16)> {
    let first = *samples.first()?;
    let (mut min, mut max, mut sum) = (first, first, 0i32);
    for &s in samples {
        min = min.min(s);
        max = max.max(s);
        sum += s as i32;
    }
    Some((min, max, (sum / samples.len() as i32) as i16))
}

@@tests
/// Min, max and mean
#[test]
fn basic() {
    assert_eq!(stats(&[215, 230, 218, 221]), Some((215, 230, 221)));
}

/// Negative values and rounding toward zero
#[test]
fn negative() {
    assert_eq!(stats(&[-5, -6]), Some((-6, -5, -5)));
}

/// No overflow with large values
#[test]
fn large() {
    assert_eq!(stats(&[i16::MAX, i16::MAX, i16::MAX]), Some((i16::MAX, i16::MAX, i16::MAX)));
}

/// Empty gives None
#[test]
fn empty() {
    assert_eq!(stats(&[]), None);
}

@@hint
`let first = *samples.first()?;` handles the empty case. Accumulate the sum in an `i32`: three `i16::MAX` values overflow an `i16`.
:::

:::quiz emb-nostd-check Quick check
? Which of these can you use in a `#![no_std]` program without an allocator? (choose all that apply)
- [x] `Option` and `Result`
- [x] Iterators and slices
- [x] Fixed-size arrays and const generics
- [ ] `Vec` and `String`
> `Vec` and `String` live in `alloc`, which needs a heap.

? What does `fn main() -> !` mean?
- [ ] main returns an error
- [x] main never returns
- [ ] main returns a boolean
> Firmware loops forever; `!` is the "never" type.

? What is `thumbv6m-none-eabi`?
- [x] The compiler target for Cortex-M0+ chips like the RP2040, with no operating system
- [ ] A Rust edition
- [ ] A debug probe
> `none` means no OS. Add it with rustup.

? Why avoid a heap in long-running firmware?
- [ ] Heaps are slow to read
- [x] Memory use stays fixed and known at compile time, so it can't run out or fragment after days of uptime
- [ ] The borrow checker doesn't work with a heap
> Static allocation makes worst-case memory use provable.
:::
