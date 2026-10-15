---
title: Unsafe Rust and FFI
summary: What unsafe really allows, raw pointers, volatile memory access, calling C, and exposing Rust to C and Python.
minutes: 50
kind: lesson
language: rust
---

Rust's compiler can't verify everything. Talking to hardware registers, calling C libraries, or writing certain high-performance data structures involves operations whose safety only a human can check. For those, Rust has `unsafe`.

## What unsafe allows

Inside an `unsafe { ... }` block you can do five extra things:

1. Dereference a **raw pointer** (`*const T`, `*mut T`)
2. Call an `unsafe fn` (including C functions)
3. Access or modify a mutable `static` variable
4. Implement an `unsafe trait` (like `Send` by hand)
5. Access fields of a `union`

That's all. `unsafe` doesn't turn off the borrow checker or type checking for normal references. It means: "I, the programmer, promise this is correct; the compiler can't check it." Every `unsafe` block should come with a `// SAFETY:` comment explaining why the promise holds.

## Raw pointers

References (`&T`) are always valid: never null, never dangling. Raw pointers make no such promise. Creating one is safe; reading through one is not:

```rust
fn main() {
    let readings = [20.5_f32, 21.0, 21.5];
    let ptr: *const f32 = readings.as_ptr();      // safe: just an address

    // SAFETY: ptr points at `readings`, which has 3 elements and is still alive,
    // so offsets 0, 1 and 2 are in bounds.
    let second = unsafe { *ptr.add(1) };
    println!("second reading: {second}");
    println!("address: {ptr:p}");
}
```

## Safe abstractions over unsafe code

The Rust way is to wrap a small amount of `unsafe` code inside a function with a **safe** interface that makes misuse impossible. `Vec`, `String` and `HashMap` are all built like this. Most Rust programmers never write `unsafe` at all; they use safe APIs built on top of it.

```rust
/// Sums `len` values starting at `ptr`.
///
/// # Safety
/// `ptr` must point at `len` valid, initialised u32 values.
unsafe fn sum_raw(ptr: *const u32, len: usize) -> u32 {
    let mut total = 0;
    for i in 0..len {
        // SAFETY: the caller guarantees i < len values are valid.
        total += unsafe { *ptr.add(i) };
    }
    total
}

/// The safe wrapper: a slice always knows its own valid length.
fn sum(values: &[u32]) -> u32 {
    // SAFETY: as_ptr() and len() describe exactly the slice's valid memory.
    unsafe { sum_raw(values.as_ptr(), values.len()) }
}

fn main() {
    println!("{}", sum(&[1, 2, 3, 4]));
}
```

## Volatile access: talking to hardware

On a microcontroller, hardware is controlled through **memory-mapped registers**: special addresses where reading or writing talks to a peripheral instead of RAM. On the Raspberry Pi Pico's RP2040, for example, writing a bit mask to the address `0xd000_0014` sets output pins high.

Normally the compiler may optimise away a write that's never read back, or merge two reads into one. For hardware that would be a disaster, so register access uses **volatile** reads and writes, which the compiler must perform exactly as written:

```rust static
const SIO_GPIO_OUT_SET: *mut u32 = 0xd000_0014 as *mut u32;   // RP2040: set output pins high
const LED_PIN: u32 = 25;

fn led_on() {
    // SAFETY: this address is the RP2040's GPIO_OUT_SET register, and writing a
    // pin mask to it has no other side effects.
    unsafe { core::ptr::write_volatile(SIO_GPIO_OUT_SET, 1 << LED_PIN) };
}
```

That only works on the actual chip. Here's the same pattern on a "register" that's just a variable, so you can run it:

```rust
use std::ptr::{read_volatile, write_volatile};

fn main() {
    let mut fake_register: u32 = 0;
    let reg: *mut u32 = &mut fake_register;

    // SAFETY: reg points at a live, aligned u32 that nothing else is using.
    unsafe {
        write_volatile(reg, read_volatile(reg) | (1 << 25));   // set bit 25 (LED on)
        write_volatile(reg, read_volatile(reg) | (1 << 3));    // set bit 3
        write_volatile(reg, read_volatile(reg) & !(1 << 25));  // clear bit 25 (LED off)
    }
    println!("{fake_register:#034b}");
}
```

In Phase 12 you'll see that you almost never write this yourself: generated crates (PACs) and HALs wrap every register in a safe API.

## FFI: calling C

The **foreign function interface** lets Rust call functions written in C (and anything that exposes a C interface: C++, Fortran, vendor SDKs for microcontrollers). You declare the functions in an `extern "C"` block:

```rust
use std::ffi::{c_char, c_int, CStr};

// Functions from the C standard library, which every Rust program links against.
unsafe extern "C" {
    fn abs(x: c_int) -> c_int;
    fn strlen(s: *const c_char) -> usize;
}

fn main() {
    let text = c"Ferris";                      // a C string literal: NUL-terminated
    // SAFETY: abs is defined for all ints except INT_MIN; text is a valid C string.
    let (a, n) = unsafe { (abs(-42), strlen(text.as_ptr())) };
    println!("abs = {a}, strlen = {n}");
    let back: &CStr = text;
    println!("{:?}", back.to_str());
}
```

Calling C is `unsafe` because the compiler can't check what the C code does with your pointers. Tools like `bindgen` generate these declarations from C header files automatically.

## FFI: exposing Rust to C (and Python)

You can also export Rust functions with a C interface, so C, C++, Python (via `ctypes`), or a microcontroller vendor's C SDK can call them:

```rust static
#[repr(C)]                         // lay the struct out exactly like C would
pub struct Prediction {
    pub home: f32,
    pub draw: f32,
    pub away: f32,
}

#[unsafe(no_mangle)]               // keep the symbol name "predict" so C can find it
pub extern "C" fn predict(elo_diff: f32) -> Prediction {
    let home = 1.0 / (1.0 + 10f32.powf(-elo_diff / 400.0));
    Prediction { home: home * 0.75, draw: 0.25, away: (1.0 - home) * 0.75 }
}
```

```python static
import ctypes

class Prediction(ctypes.Structure):
    _fields_ = [("home", ctypes.c_float), ("draw", ctypes.c_float), ("away", ctypes.c_float)]

lib = ctypes.CDLL("./target/release/libpredict.so")
lib.predict.restype = Prediction
p = lib.predict(ctypes.c_float(120.0))
print(p.home, p.draw, p.away)
```

For Python, the PyO3 crate (Phase 11) is far more convenient than raw `ctypes`: it handles Python objects, errors and NumPy arrays safely.

## Guidelines

- Prefer safe code. Use `unsafe` only for FFI, hardware access, or proven performance needs.
- Keep each `unsafe` block as small as possible, and write a `// SAFETY:` comment.
- Wrap it in a safe API so callers can't misuse it.
- Test unsafe code with [Miri](https://github.com/rust-lang/miri) (`cargo +nightly miri test`), which detects undefined behaviour.

## Practice

:::exercise prust-unsafe-wrapper A safe wrapper
`average_raw` is an unsafe function that averages `len` floats starting at `ptr`. Write a **safe** function `average(values: &[f32]) -> Option<f32>` that returns `None` for an empty slice, and otherwise calls `average_raw` correctly, with a `// SAFETY:` comment.

@@starter
/// # Safety
/// `ptr` must point at `len` valid f32 values, and `len` must be greater than 0.
unsafe fn average_raw(ptr: *const f32, len: usize) -> f32 {
    let mut total = 0.0;
    for i in 0..len {
        total += unsafe { *ptr.add(i) };
    }
    total / len as f32
}

fn average(values: &[f32]) -> Option<f32> {
    todo!()
}

@@solution
/// # Safety
/// `ptr` must point at `len` valid f32 values, and `len` must be greater than 0.
unsafe fn average_raw(ptr: *const f32, len: usize) -> f32 {
    let mut total = 0.0;
    for i in 0..len {
        total += unsafe { *ptr.add(i) };
    }
    total / len as f32
}

fn average(values: &[f32]) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    // SAFETY: the slice is non-empty, and as_ptr()/len() describe exactly its valid elements.
    Some(unsafe { average_raw(values.as_ptr(), values.len()) })
}

@@tests
/// Averages a slice
#[test]
fn averages() {
    assert_eq!(average(&[1.0, 2.0, 3.0, 6.0]), Some(3.0));
}

/// Works on part of an array
#[test]
fn sub_slice() {
    let a = [10.0, 2.0, 4.0];
    assert_eq!(average(&a[1..]), Some(3.0));
}

/// Empty gives None instead of dividing by zero
#[test]
fn empty() {
    assert_eq!(average(&[]), None);
}

@@hint
Check `values.is_empty()` first, then `Some(unsafe { average_raw(values.as_ptr(), values.len()) })`.
:::

:::exercise prust-register-bits Register bit helpers
Hardware registers are 32-bit words where each bit (or group of bits) controls something. Write three pure functions, no `unsafe` needed:

- `set_bit(reg: u32, bit: u32) -> u32`: returns `reg` with that bit set to 1
- `clear_bit(reg: u32, bit: u32) -> u32`: returns `reg` with that bit set to 0
- `read_field(reg: u32, offset: u32, width: u32) -> u32`: returns the `width` bits starting at bit `offset`, shifted down to start at bit 0. For example, bits 4 to 6 of `0b0101_0000` are `0b101` = 5.

@@starter
fn set_bit(reg: u32, bit: u32) -> u32 {
    todo!()
}

fn clear_bit(reg: u32, bit: u32) -> u32 {
    todo!()
}

fn read_field(reg: u32, offset: u32, width: u32) -> u32 {
    todo!()
}

@@solution
fn set_bit(reg: u32, bit: u32) -> u32 {
    reg | (1 << bit)
}

fn clear_bit(reg: u32, bit: u32) -> u32 {
    reg & !(1 << bit)
}

fn read_field(reg: u32, offset: u32, width: u32) -> u32 {
    let mask = if width >= 32 { u32::MAX } else { (1 << width) - 1 };
    (reg >> offset) & mask
}

@@tests
/// Sets a bit without changing the others
#[test]
fn set() {
    assert_eq!(set_bit(0b1000, 0), 0b1001);
    assert_eq!(set_bit(0, 25), 1 << 25);
    assert_eq!(set_bit(0b1, 0), 0b1);
}

/// Clears a bit without changing the others
#[test]
fn clear() {
    assert_eq!(clear_bit(0b1011, 1), 0b1001);
    assert_eq!(clear_bit(0, 5), 0);
}

/// Reads a multi-bit field
#[test]
fn field() {
    assert_eq!(read_field(0b0101_0000, 4, 3), 0b101);
    assert_eq!(read_field(0xABCD_1234, 16, 16), 0xABCD);
    assert_eq!(read_field(0xFFFF_FFFF, 0, 32), 0xFFFF_FFFF);
}

@@hint
Set: `reg | (1 << bit)`. Clear: `reg & !(1 << bit)` (`!` flips every bit of the mask).

@@hint
For a field, shift right by `offset`, then AND with a mask of `width` ones: `(1 << width) - 1`. Watch out: `1 << 32` overflows, so treat `width >= 32` as `u32::MAX`.
:::

:::quiz prust-unsafe-check Quick check
? Does `unsafe` turn off the borrow checker?
- [ ] Yes, inside the block
- [x] No: it only allows a few extra operations, like dereferencing raw pointers
> References are still checked normally inside unsafe blocks.

? Why use write_volatile for a hardware register?
- [ ] It's faster
- [x] The compiler must perform every volatile access exactly as written, never optimise it away
- [ ] It makes the write atomic
> To the compiler, a register looks like ordinary memory; volatile tells it each access matters.

? What does `#[repr(C)]` do?
- [x] Lays out a struct's fields the way C would, so C code can share it
- [ ] Makes the struct callable from C
- [ ] Compiles the struct with a C compiler
> Rust otherwise reorders fields freely to save space.

? What's the idiomatic way to use unsafe code?
- [ ] Mark whole programs unsafe for speed
- [x] Keep it small, document why it's sound, and wrap it in a safe API
- [ ] Avoid comments so it's harder to misuse
> This is how the standard library itself is written.
:::
