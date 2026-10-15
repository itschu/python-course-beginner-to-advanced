---
title: "Checkpoint: Embedded Systems"
summary: Electronics, MicroPython, protocols and embedded Rust, tested together.
minutes: 75
kind: checkpoint
language: rust
---

The quiz covers the whole phase; the exercises are firmware logic in Rust, written the way you would for a real device: no heap, no panics, testable on a laptop.

:::quiz emb-cp-quiz Concepts
? A red LED (forward voltage 2.0 V) should draw about 5 mA from a 3.3 V pin. Which resistor?
- [ ] 33 Ω
- [x] 270 Ω (260 Ω rounded up to a standard value)
- [ ] 10 kΩ
> (3.3 − 2.0) / 0.005 = 260 Ω; the next E12 value up is 270 Ω.

? Which protocol would you choose for 5 sensors on two wires?
- [x] I2C
- [ ] SPI
- [ ] UART
> I2C devices share SDA and SCL and are selected by address.

? An MPU-6050 register pair reads 0xC000 at the ±2 g range. What acceleration is that?
- [ ] 3 g
- [x] −1 g
- [ ] 0.75 g
> 0xC000 as a signed 16-bit number is −16384, and 16384 counts = 1 g.

? Why is an interrupt handler a bad place to log a message over UART?
- [ ] UART is too fast
- [x] It's slow and may allocate memory; handlers should only record the event
- [ ] UART can't be used with interrupts
> Set a flag or push to a queue; let the main loop do the slow work.

? Which are good reasons to put device logic in a pure state machine? (choose all that apply)
- [x] It can be unit tested without hardware
- [x] Every state and transition is explicit
- [x] The compiler checks that every state/event combination is handled
- [ ] It removes the need for a watchdog
> A watchdog guards against everything you didn't anticipate.

? Which statement about `#![no_std]` is true?
- [ ] You can't use iterators
- [x] You can use core (Option, Result, iterators, slices, traits) but not std's OS features
- [ ] You must write everything in unsafe Rust
> Most everyday Rust works without std.
:::

:::exercise emb-cp-ring-buffer A lock-free-style ring buffer
Interrupt handlers often push bytes into a ring buffer that the main loop drains. Write `RingBuffer<const N: usize>` holding `u8`s in a `[u8; N]` with no heap:

- `new() -> Self`
- `push(&mut self, byte: u8) -> bool`: false (and nothing stored) if full
- `pop(&mut self) -> Option<u8>`: the oldest byte
- `len(&self) -> usize`, `is_empty(&self) -> bool`

Use a `head` index, a `tail` index and a `len` counter, wrapping with `% N`.

@@starter
struct RingBuffer<const N: usize> {
    data: [u8; N],
    head: usize,
    tail: usize,
    len: usize,
}

impl<const N: usize> RingBuffer<N> {
    fn new() -> Self {
        todo!()
    }

    fn push(&mut self, byte: u8) -> bool {
        todo!()
    }

    fn pop(&mut self) -> Option<u8> {
        todo!()
    }

    fn len(&self) -> usize {
        todo!()
    }

    fn is_empty(&self) -> bool {
        todo!()
    }
}

@@solution
struct RingBuffer<const N: usize> {
    data: [u8; N],
    head: usize,
    tail: usize,
    len: usize,
}

impl<const N: usize> RingBuffer<N> {
    fn new() -> Self {
        RingBuffer { data: [0; N], head: 0, tail: 0, len: 0 }
    }

    fn push(&mut self, byte: u8) -> bool {
        if self.len == N {
            return false;
        }
        self.data[self.tail] = byte;
        self.tail = (self.tail + 1) % N;
        self.len += 1;
        true
    }

    fn pop(&mut self) -> Option<u8> {
        if self.len == 0 {
            return None;
        }
        let byte = self.data[self.head];
        self.head = (self.head + 1) % N;
        self.len -= 1;
        Some(byte)
    }

    fn len(&self) -> usize {
        self.len
    }

    fn is_empty(&self) -> bool {
        self.len == 0
    }
}

@@tests
/// First in, first out
#[test]
fn fifo() {
    let mut rb: RingBuffer<4> = RingBuffer::new();
    assert!(rb.push(1) && rb.push(2) && rb.push(3));
    assert_eq!(rb.pop(), Some(1));
    assert_eq!(rb.pop(), Some(2));
    assert_eq!(rb.len(), 1);
}

/// A full buffer refuses new bytes
#[test]
fn full() {
    let mut rb: RingBuffer<2> = RingBuffer::new();
    assert!(rb.push(7));
    assert!(rb.push(8));
    assert!(!rb.push(9));
    assert_eq!(rb.pop(), Some(7));
    assert_eq!(rb.pop(), Some(8));
    assert_eq!(rb.pop(), None);
}

/// Wraps around many times
#[test]
fn wraps() {
    let mut rb: RingBuffer<3> = RingBuffer::new();
    for i in 0..100u8 {
        assert!(rb.push(i));
        assert_eq!(rb.pop(), Some(i));
    }
    assert!(rb.is_empty());
}

@@hint
Write at `tail` and read at `head`, advancing each with `(index + 1) % N`. The `len` counter tells full (`len == N`) from empty (`len == 0`), since `head == tail` in both cases.
:::

:::exercise emb-cp-frame Parse a sensor packet
A wireless sensor sends 8-byte packets: `[0xAA, id, temp_hi, temp_lo, humidity, battery, seq, crc]`.

- byte 0 must be the start byte `0xAA`
- temperature is a big-endian `i16` in hundredths of a degree
- humidity is a `u8` percentage (must be at most 100)
- battery is a `u8` in **20 mV steps**, so `165` means 3300 mV
- `crc` is the Sensirion CRC-8 (poly `0x31`, init `0xFF`) of bytes 0 to 6

Write `parse_packet(p: &[u8]) -> Result<Reading, PacketError>`. Check, in this order: length (exactly 8), start byte, CRC, humidity. Never panic, whatever the input.

@@starter
#[derive(Debug, PartialEq)]
struct Reading {
    id: u8,
    temperature_c: f32,
    humidity: u8,
    battery_mv: u16,
    seq: u8,
}

#[derive(Debug, PartialEq)]
enum PacketError {
    WrongLength(usize),
    BadStart(u8),
    BadCrc { expected: u8, got: u8 },
    BadHumidity(u8),
}

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

fn parse_packet(p: &[u8]) -> Result<Reading, PacketError> {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
struct Reading {
    id: u8,
    temperature_c: f32,
    humidity: u8,
    battery_mv: u16,
    seq: u8,
}

#[derive(Debug, PartialEq)]
enum PacketError {
    WrongLength(usize),
    BadStart(u8),
    BadCrc { expected: u8, got: u8 },
    BadHumidity(u8),
}

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

fn parse_packet(p: &[u8]) -> Result<Reading, PacketError> {
    let &[start, id, t_hi, t_lo, humidity, battery, seq, crc] = p else {
        return Err(PacketError::WrongLength(p.len()));
    };
    if start != 0xAA {
        return Err(PacketError::BadStart(start));
    }
    let expected = crc8(&p[..7]);
    if expected != crc {
        return Err(PacketError::BadCrc { expected, got: crc });
    }
    if humidity > 100 {
        return Err(PacketError::BadHumidity(humidity));
    }
    Ok(Reading {
        id,
        temperature_c: i16::from_be_bytes([t_hi, t_lo]) as f32 / 100.0,
        humidity,
        battery_mv: battery as u16 * 20,
        seq,
    })
}

@@tests
fn packet(body: [u8; 7]) -> Vec<u8> {
    let mut p = body.to_vec();
    p.push(crc8(&body));
    p
}

/// Parses a valid packet
#[test]
fn valid() {
    // 0x0866 = 2150 -> 21.50 °C
    let p = packet([0xAA, 3, 0x08, 0x66, 45, 165, 9]);
    assert_eq!(
        parse_packet(&p),
        Ok(Reading { id: 3, temperature_c: 21.5, humidity: 45, battery_mv: 3300, seq: 9 })
    );
}

/// Negative temperatures
#[test]
fn negative() {
    let t = (-725i16).to_be_bytes();
    let p = packet([0xAA, 1, t[0], t[1], 80, 150, 0]);
    assert_eq!(parse_packet(&p).unwrap().temperature_c, -7.25);
}

/// Each kind of error, in order
#[test]
fn errors() {
    assert_eq!(parse_packet(&[0xAA, 1, 2]), Err(PacketError::WrongLength(3)));
    assert_eq!(parse_packet(&[]), Err(PacketError::WrongLength(0)));
    assert_eq!(parse_packet(&packet([0x55, 1, 0, 0, 50, 150, 0])), Err(PacketError::BadStart(0x55)));
    let mut corrupted = packet([0xAA, 1, 0, 0, 50, 150, 0]);
    corrupted[3] ^= 0x01;
    assert!(matches!(parse_packet(&corrupted), Err(PacketError::BadCrc { .. })));
    assert_eq!(parse_packet(&packet([0xAA, 1, 0, 0, 101, 150, 0])), Err(PacketError::BadHumidity(101)));
}

@@hint
A slice pattern checks the length and names every byte at once: `let &[start, id, t_hi, t_lo, humidity, battery, seq, crc] = p else { return Err(...) };`

@@hint
`i16::from_be_bytes([t_hi, t_lo]) as f32 / 100.0` gives the temperature; `battery as u16 * 20` gives millivolts without overflowing a `u8`.
:::

## Phase 12 complete

You can now read a datasheet, wire and program sensors and actuators, use I2C, SPI and UART, write responsive firmware with interrupts, timers and state machines in MicroPython, and write portable, testable, panic-free embedded Rust with HALs, embedded-hal and Embassy.

Phase 13 brings the course together: you'll train a model in Python and run it on a microcontroller.
