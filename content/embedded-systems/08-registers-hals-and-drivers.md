---
title: Registers, HALs and portable drivers
summary: The layers of embedded Rust, from raw registers to PACs, HALs and embedded-hal traits; typestate pins; and writing a sensor driver that runs on any chip and is tested on your laptop.
minutes: 60
kind: lesson
language: rust
---

Embedded Rust is built in layers. Each one wraps the one below in a safer, more convenient API:

```text
 your application
        │
 drivers (tmp102, mpu6050, ssd1306 display, ...)   ← generic over embedded-hal traits: work on ANY chip
        │
 embedded-hal traits (OutputPin, InputPin, I2c, SpiDevice, DelayNs)
        │
 HAL: hardware abstraction layer (rp2040-hal, embassy-rp, stm32f4xx-hal, esp-hal)
        │
 PAC: peripheral access crate (rp2040-pac), generated from the chip's register description
        │
 registers at fixed addresses (memory-mapped I/O)
```

## Layer 1: registers and the PAC

At the bottom are the registers from lesson 1 and Phase 10's volatile writes. Chip vendors publish a machine-readable description of every register (an SVD file), and a tool called `svd2rust` turns it into a **PAC**: one safe-ish Rust method per register and field. Instead of `write_volatile(0xd000_0014 as *mut u32, 1 << 25)` you write:

```rust static
let pac = rp2040_pac::Peripherals::take().unwrap();
pac.SIO.gpio_out_set().write(|w| unsafe { w.bits(1 << 25) });
```

`Peripherals::take()` returns `Some` **only the first time** it's called. There's exactly one set of hardware, so there's exactly one owner of it: Rust's ownership rules, applied to physical peripherals. Two parts of the program can't both configure the same UART by accident.

## Layer 2: the HAL and typestate

A **HAL** builds a friendly API on top of the PAC: `pins.gpio25.into_push_pull_output()`, `I2C::i2c0(...)`, `uart.write_full_blocking(...)`.

HALs use a pattern called **typestate**: a pin's mode is part of its **type**, so using a pin the wrong way is a compile error instead of a confusing hardware bug. Here's the idea in miniature, runnable on your laptop:

```rust
use std::marker::PhantomData;

// Zero-sized marker types for the modes
struct Input;
struct Output;

struct Pin<Mode> {
    number: u8,
    _mode: PhantomData<Mode>,       // remembers the mode in the type, takes no memory
}

impl Pin<Input> {
    fn new(number: u8) -> Self {
        Pin { number, _mode: PhantomData }
    }
    fn is_high(&self) -> bool {
        false // a real HAL reads a register here
    }
    // Changing mode CONSUMES the old pin and returns a new type
    fn into_output(self) -> Pin<Output> {
        println!("GP{}: configured as output", self.number);
        Pin { number: self.number, _mode: PhantomData }
    }
}

impl Pin<Output> {
    fn set_high(&mut self) {
        println!("GP{}: high", self.number);
    }
}

fn main() {
    let button = Pin::<Input>::new(14);
    println!("button high? {}", button.is_high());

    let mut led = Pin::<Input>::new(25).into_output();
    led.set_high();
    // button.set_high();     // compile error: no method `set_high` for Pin<Input>
    // led.is_high();         // compile error: no method `is_high` for Pin<Output>
    println!("a Pin takes {} byte(s)", std::mem::size_of::<Pin<Output>>());
}
```

The mode costs nothing at run time (the `Pin` is one byte, the pin number), and impossible operations simply don't exist. In C, writing to an input pin compiles fine and silently does nothing.

## Layer 3: embedded-hal, the portable interface

Every HAL is different, so how can one sensor driver work on an RP2040, an STM32 and an ESP32? Through the **embedded-hal** crate: a set of traits that every HAL implements. A driver is written once, generic over those traits.

The real traits look like this (slightly simplified):

```rust static
pub trait OutputPin {
    type Error;
    fn set_low(&mut self) -> Result<(), Self::Error>;
    fn set_high(&mut self) -> Result<(), Self::Error>;
}

pub trait I2c {
    type Error;
    fn write(&mut self, address: u8, bytes: &[u8]) -> Result<(), Self::Error>;
    fn read(&mut self, address: u8, buffer: &mut [u8]) -> Result<(), Self::Error>;
    fn write_read(&mut self, address: u8, bytes: &[u8], buffer: &mut [u8]) -> Result<(), Self::Error>;
}

pub trait DelayNs {
    fn delay_ns(&mut self, ns: u32);
    fn delay_ms(&mut self, ms: u32) { /* provided */ }
}
```

`type Error` is an **associated type**: each HAL chooses its own error type (a bus fault, a NACK, a timeout), and drivers pass it along.

## Writing a portable driver

Here's a complete driver for an LED that can be on, off, or blink a pattern, written against our own copy of the `OutputPin` trait (so it runs here). On a real board you'd `use embedded_hal::digital::OutputPin` instead; nothing else changes:

```rust
trait OutputPin {
    type Error;
    fn set_low(&mut self) -> Result<(), Self::Error>;
    fn set_high(&mut self) -> Result<(), Self::Error>;
}

/// A driver for a status LED. Works with ANY pin type from ANY HAL.
struct StatusLed<P: OutputPin> {
    pin: P,
    on: bool,
}

impl<P: OutputPin> StatusLed<P> {
    fn new(mut pin: P) -> Result<Self, P::Error> {
        pin.set_low()?;
        Ok(StatusLed { pin, on: false })
    }

    fn toggle(&mut self) -> Result<(), P::Error> {
        if self.on { self.pin.set_low()? } else { self.pin.set_high()? }
        self.on = !self.on;
        Ok(())
    }
}

/// A fake pin for tests: records every change instead of touching hardware.
#[derive(Default)]
struct MockPin {
    log: Vec<bool>,
}

impl OutputPin for MockPin {
    type Error = core::convert::Infallible;   // a mock can't fail
    fn set_low(&mut self) -> Result<(), Self::Error> {
        self.log.push(false);
        Ok(())
    }
    fn set_high(&mut self) -> Result<(), Self::Error> {
        self.log.push(true);
        Ok(())
    }
}

fn main() {
    let mut led = StatusLed::new(MockPin::default()).unwrap();
    for _ in 0..3 {
        led.toggle().unwrap();
    }
    println!("pin history: {:?}", led.pin.log);
}
```

This is the workflow professional embedded Rust teams use: drivers and application logic are generic over traits, **unit tested on a laptop with mocks** (the [`embedded-hal-mock`](https://docs.rs/embedded-hal-mock) crate provides ready-made ones), and only the thin hardware setup needs a board. Thousands of drivers on crates.io work this way: search for your sensor's name before writing your own.

## Practice

:::exercise emb-rs-tmp102-driver A portable TMP102 driver
Write a `Tmp102<I: I2c>` driver using the simplified `I2c` trait in the starter:

- `Tmp102::new(i2c: I, address: u8) -> Self`
- `read_celsius(&mut self) -> Result<f32, I::Error>`: use `write_read` to write the register number `0x00` and read 2 bytes, then convert the 12-bit two's complement value (0.0625 °C per step).
- `release(self) -> I`: give the bus back (so it can be shared with other drivers)

The tests use a mock I2C bus.

@@starter
trait I2c {
    type Error;
    fn write_read(&mut self, address: u8, bytes: &[u8], buffer: &mut [u8]) -> Result<(), Self::Error>;
}

struct Tmp102<I: I2c> {
    i2c: I,
    address: u8,
}

impl<I: I2c> Tmp102<I> {
    fn new(i2c: I, address: u8) -> Self {
        todo!()
    }

    fn read_celsius(&mut self) -> Result<f32, I::Error> {
        todo!()
    }

    fn release(self) -> I {
        todo!()
    }
}

@@solution
trait I2c {
    type Error;
    fn write_read(&mut self, address: u8, bytes: &[u8], buffer: &mut [u8]) -> Result<(), Self::Error>;
}

struct Tmp102<I: I2c> {
    i2c: I,
    address: u8,
}

impl<I: I2c> Tmp102<I> {
    fn new(i2c: I, address: u8) -> Self {
        Tmp102 { i2c, address }
    }

    fn read_celsius(&mut self) -> Result<f32, I::Error> {
        let mut buf = [0u8; 2];
        self.i2c.write_read(self.address, &[0x00], &mut buf)?;
        // i16 keeps the sign; an arithmetic shift right by 4 drops the unused bits.
        let raw = i16::from_be_bytes(buf) >> 4;
        Ok(raw as f32 * 0.0625)
    }

    fn release(self) -> I {
        self.i2c
    }
}

@@tests
#[derive(Debug, PartialEq)]
struct Nack;

/// A fake bus that answers with fixed bytes and records the transfers.
struct MockI2c {
    reply: [u8; 2],
    calls: Vec<(u8, Vec<u8>)>,
    fail: bool,
}

impl I2c for MockI2c {
    type Error = Nack;
    fn write_read(&mut self, address: u8, bytes: &[u8], buffer: &mut [u8]) -> Result<(), Nack> {
        self.calls.push((address, bytes.to_vec()));
        if self.fail {
            return Err(Nack);
        }
        buffer.copy_from_slice(&self.reply);
        Ok(())
    }
}

fn bus(reply: [u8; 2]) -> MockI2c {
    MockI2c { reply, calls: Vec::new(), fail: false }
}

/// 0x1580 is 21.5 °C, read from register 0 at the right address
#[test]
fn positive() {
    let mut t = Tmp102::new(bus([0x15, 0x80]), 0x48);
    assert_eq!(t.read_celsius(), Ok(21.5));
    let bus = t.release();
    assert_eq!(bus.calls, vec![(0x48, vec![0x00])]);
}

/// 0xF8C0 is -7.25 °C
#[test]
fn negative() {
    let mut t = Tmp102::new(bus([0xF8, 0xC0]), 0x48);
    assert_eq!(t.read_celsius(), Ok(-7.25));
}

/// Bus errors are passed to the caller
#[test]
fn error() {
    let mut b = bus([0, 0]);
    b.fail = true;
    let mut t = Tmp102::new(b, 0x49);
    assert_eq!(t.read_celsius(), Err(Nack));
}

@@hint
`self.i2c.write_read(self.address, &[0x00], &mut buf)?` does the transfer and passes errors on.

@@hint
`i16::from_be_bytes(buf) >> 4` is a neat trick: treating the two bytes as a signed 16-bit number keeps the sign, and shifting a signed number right keeps it negative.
:::

:::exercise emb-rs-typestate Typestate for a sensor
An accelerometer must be woken before it can be read. Encode that rule in types:

- `Accelerometer<Asleep>::new(id: u8)` creates a sleeping sensor.
- `wake(self) -> Accelerometer<Awake>` consumes the sleeping sensor and returns an awake one, adding `"wake"` to its log.
- `read_g(&mut self) -> f32` exists **only** for `Awake` sensors: it adds `"read"` to the log and returns `1.0`.
- `sleep(self) -> Accelerometer<Asleep>` puts an awake sensor back to sleep, adding `"sleep"` to the log.
- `log(&self) -> &[&'static str]` works in **both** states.

@@starter
use std::marker::PhantomData;

struct Asleep;
struct Awake;

struct Accelerometer<State> {
    id: u8,
    log: Vec<&'static str>,
    _state: PhantomData<State>,
}

// impl blocks here

@@solution
use std::marker::PhantomData;

struct Asleep;
struct Awake;

struct Accelerometer<State> {
    id: u8,
    log: Vec<&'static str>,
    _state: PhantomData<State>,
}

impl Accelerometer<Asleep> {
    fn new(id: u8) -> Self {
        Accelerometer { id, log: Vec::new(), _state: PhantomData }
    }

    fn wake(mut self) -> Accelerometer<Awake> {
        self.log.push("wake");
        Accelerometer { id: self.id, log: self.log, _state: PhantomData }
    }
}

impl Accelerometer<Awake> {
    fn read_g(&mut self) -> f32 {
        self.log.push("read");
        1.0
    }

    fn sleep(mut self) -> Accelerometer<Asleep> {
        self.log.push("sleep");
        Accelerometer { id: self.id, log: self.log, _state: PhantomData }
    }
}

impl<State> Accelerometer<State> {
    fn log(&self) -> &[&'static str] {
        &self.log
    }
}

@@tests
/// Wake, read twice, sleep
#[test]
fn lifecycle() {
    let sensor = Accelerometer::<Asleep>::new(0x68);
    let mut awake = sensor.wake();
    assert_eq!(awake.read_g(), 1.0);
    awake.read_g();
    let asleep = awake.sleep();
    assert_eq!(asleep.log(), &["wake", "read", "read", "sleep"]);
    assert_eq!(asleep.id, 0x68);
}

/// A new sensor has an empty log
#[test]
fn new_is_asleep() {
    assert!(Accelerometer::<Asleep>::new(1).log().is_empty());
}

@@hint
Write three `impl` blocks: `impl Accelerometer<Asleep>` (new, wake), `impl Accelerometer<Awake>` (read_g, sleep), and `impl<State> Accelerometer<State>` (log).

@@hint
Changing state builds a new struct from the old one's fields: `Accelerometer { id: self.id, log: self.log, _state: PhantomData }`. The return type decides the new state.
:::

After it passes, try adding `Accelerometer::<Asleep>::new(1).read_g();` to the bottom of your code and press **Run only**: the compiler refuses, because a sleeping sensor has no `read_g`.

:::quiz emb-hal-check Quick check
? Why does `Peripherals::take()` return an Option?
- [ ] The chip might not exist
- [x] It hands out the peripherals only once, so there's a single owner of the hardware
- [ ] To support hot-plugging
> Ownership applied to physical devices: no two parts of the code configure the same UART.

? What lets a sensor driver from crates.io work on an RP2040, an STM32 and an ESP32?
- [ ] Each driver has a version per chip
- [x] It's generic over embedded-hal traits that every HAL implements
- [ ] It uses unsafe pointers
> Write once against traits, run on any chip.

? What does the typestate pattern turn into compile errors?
- [x] Using a peripheral in the wrong mode, like writing to an input pin
- [ ] All runtime errors
- [ ] Bus timeouts
> The mode is part of the type, so invalid methods don't exist.

? How do professional teams test driver logic without hardware?
- [ ] They can't
- [x] With mock implementations of the embedded-hal traits
- [ ] In the debugger only
> embedded-hal-mock provides ready-made mocks for pins, I2C, SPI and delays.
:::
