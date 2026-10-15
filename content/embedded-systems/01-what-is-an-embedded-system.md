---
title: What is an embedded system?
summary: Microcontrollers versus computers, what's inside a chip like the RP2040, memory maps, the development workflow, and what to buy.
minutes: 40
kind: lesson
---

An **embedded system** is a computer built into a device to do one job: the controller in a washing machine, a fitness tracker, a car's brake system, a thermostat, a drone's flight controller, a smart doorbell. There are tens of billions of them, far more than laptops and phones combined.

Most are built around a **microcontroller** (MCU): a whole computer on one chip, with a processor, memory and peripherals for talking to the outside world, often costing less than a dollar.

## Microcontroller versus your laptop

| | Laptop | Raspberry Pi 5 (single-board computer) | Raspberry Pi Pico (RP2040 microcontroller) |
| --- | --- | --- | --- |
| CPU | 8+ cores at 3–5 GHz | 4 cores at 2.4 GHz | 2 Arm Cortex-M0+ cores at 133 MHz |
| RAM | 16 GB | 4–16 GB | **264 KB** |
| Storage | 1 TB SSD | SD card | **2 MB** of flash |
| Operating system | Windows, macOS, Linux | Linux | **none** (your program is the only thing running) |
| Power | 30–100 W | 5–12 W | **~0.1 W**, microwatts asleep |
| Boots in | 10–30 s | 10–20 s | **milliseconds** |
| Price | $1000 | $60–120 | **$4** |

The Pico has about 60,000 times less RAM than your laptop. That's the defining constraint of embedded work: everything must fit, and timing must be predictable. It's also why Rust (no garbage collector, no runtime) and MicroPython (a Python built to fit in 256 KB) are the two languages of this phase.

Embedded systems also often have **real-time** requirements: an airbag controller that answers in 50 ms instead of 5 ms is broken, even though it computed the right answer.

## What's inside a microcontroller

```text
┌──────────────────────────── RP2040 ────────────────────────────┐
│  2× Cortex-M0+ CPU    264 KB SRAM     (2 MB flash is a separate │
│                                         chip on the Pico board) │
│  ── bus ────────────────────────────────────────────────────── │
│  GPIO (30 pins)  UART ×2  SPI ×2  I2C ×2  PWM ×16 channels      │
│  ADC (12-bit, 4 inputs + temperature)  Timers  Watchdog  USB    │
│  PIO (programmable I/O state machines)  DMA                     │
└─────────────────────────────────────────────────────────────────┘
```

- **GPIO** (general-purpose input/output): pins you can switch high (3.3 V) or low (0 V), or read. LEDs, buttons, relays.
- **ADC** (analog-to-digital converter): measures a voltage, e.g. from a light sensor or a potentiometer.
- **PWM** (pulse-width modulation): switches a pin on and off very fast to dim LEDs or control motors and servos.
- **UART, I2C, SPI**: serial protocols for talking to GPS modules, sensors, displays and other chips.
- **Timers** and the **watchdog**: precise timing, and an automatic reset if the program hangs.

You'll use every one of these in this phase.

## Memory-mapped I/O

How does code switch on an LED? There's no special "LED instruction". Each peripheral has **registers**: memory addresses that, instead of storing data, control hardware. On the RP2040, writing a value with bit 25 set to the address `0xd000_0014` turns GPIO 25 (the Pico's LED) on.

```text
0x0000_0000  ROM (bootloader)
0x1000_0000  external flash (your program lives here)
0x2000_0000  SRAM (variables and the stack)
0x4000_0000  peripheral registers (UART, I2C, SPI, PWM, ADC, timers, ...)
0xd000_0000  SIO: single-cycle GPIO registers
```

MicroPython hides these addresses behind `Pin(25).on()`. Embedded Rust's libraries hide them behind safe types. But knowing they're there explains everything else.

## The development workflow

Embedded code is written on your laptop and runs on the board:

```text
 laptop                                              board
 ┌──────────────────────────┐   USB cable    ┌───────────────────┐
 │ MicroPython: Thonny or   │ ─────────────► │ MicroPython       │
 │ VS Code + mpremote       │  REPL / files  │ interpreter runs  │
 │                          │                │ your .py files    │
 │ Rust: cargo build        │ ─────────────► │ your compiled     │
 │  (cross-compile for Arm) │  flash with    │ firmware runs     │
 │                          │  probe-rs or   │ directly          │
 │                          │  UF2 drag+drop │                   │
 └──────────────────────────┘                └───────────────────┘
```

- **MicroPython** runs an interpreter on the chip. You copy `.py` files to it, or type into its REPL over USB. Very fast to experiment with; slower and bigger than compiled code.
- **Embedded Rust** (or C) is **cross-compiled** on your laptop for the chip's processor (target `thumbv6m-none-eabi` for the RP2040), then **flashed** onto it. Fast, small and reliable.

## The simulator in this course

You don't need any hardware for this phase. The Python cells here include a **simulated Raspberry Pi Pico**: the standard MicroPython `machine` module (pins, PWM, ADC, I2C, UART, timers, watchdog) plus a `pico_sim` module to control the simulated world: press buttons, set sensor readings and inspect what your pins did.

```python
from machine import Pin
import time
import pico_sim

led = Pin(25, Pin.OUT)       # the Pico's on-board LED is GPIO 25
for _ in range(6):
    led.toggle()
    time.sleep_ms(200)

print(pico_sim.waveform(25, step_ms=100))   # █ = high, ▁ = low, one character per 100 ms
print(pico_sim.history(25))                 # (time in ms, level) for every change
```

Time in the simulator is **virtual**: `sleep_ms(200)` returns instantly but moves the simulated clock forward 200 ms. The code itself is real MicroPython: it runs unchanged on a real Pico (just leave out the `pico_sim` lines).

:::tip Want to see it on real hardware?
[Wokwi](https://wokwi.com/) simulates a Pico with real circuits (LEDs, buttons, sensors, displays) in your browser, in MicroPython or Rust. When you're ready for a physical board, see the shopping list below.
:::

## A starter kit

Everything for Phases 12 and 13 costs about $25–40:

| Part | Why |
| --- | --- |
| Raspberry Pi **Pico 2 W** (or Pico W / Pico) with headers | The microcontroller. The "W" has Wi-Fi and Bluetooth. |
| USB cable (micro-USB) | Power and programming |
| Half-size breadboard and jumper wires | Build circuits without soldering |
| LEDs, 330 Ω and 10 kΩ resistors | Outputs, current limiting, pull-ups |
| Push buttons | Inputs |
| Potentiometer (10 kΩ) and a photoresistor | Analog inputs |
| MPU-6050 accelerometer module | I2C sensor; used for the gesture project in Phase 13 |
| Optional: Raspberry Pi Debug Probe (~$12) | Flash and debug Rust firmware with probe-rs |

## Practice

:::exercise emb-memory-budget Will it fit?
A sensor logger stores readings in RAM before sending them. Write `max_readings(ram_bytes, reserved_bytes, bytes_per_reading)` that returns how many whole readings fit in the RAM left after `reserved_bytes` (the stack, buffers and other variables). Return 0 if nothing is left.

Then set `PICO_READINGS` to the number of 12-byte readings that fit on a Pico (264 KB, where 1 KB = 1024 bytes) with 64 KB reserved.

@@starter
def max_readings(ram_bytes, reserved_bytes, bytes_per_reading):
    pass

PICO_READINGS = None

@@solution
def max_readings(ram_bytes, reserved_bytes, bytes_per_reading):
    available = ram_bytes - reserved_bytes
    if available <= 0:
        return 0
    return available // bytes_per_reading

PICO_READINGS = max_readings(264 * 1024, 64 * 1024, 12)

@@tests
def test_simple():
    """1000 bytes free fits 83 readings of 12 bytes"""
    assert max_readings(1100, 100, 12) == 83

def test_nothing_left():
    """Returns 0 when the reserve uses everything"""
    assert max_readings(1000, 1000, 4) == 0
    assert max_readings(1000, 2000, 4) == 0

def test_pico():
    """A Pico fits 17,066 readings"""
    assert PICO_READINGS == 17066

@@hint
Integer division `//` gives whole readings. `(264 - 64) * 1024 // 12`.
:::

:::exercise emb-blink-pattern Blink a pattern
Using the simulator, make GPIO 25 blink the letter **S** in Morse code: three short flashes. Each flash is **on for 200 ms, then off for 200 ms**, and the LED must end up off.

Use `Pin`, `led.on()`, `led.off()` and `time.sleep_ms()`.

@@starter
from machine import Pin
import time

led = Pin(25, Pin.OUT)
# blink three times

@@solution
from machine import Pin
import time

led = Pin(25, Pin.OUT)
for _ in range(3):
    led.on()
    time.sleep_ms(200)
    led.off()
    time.sleep_ms(200)

@@tests
import pico_sim

def test_three_flashes():
    """The LED turns on exactly three times"""
    ons = [t for t, v in pico_sim.history(25) if v == 1]
    assert len(ons) == 3, f"the LED turned on {len(ons)} times"

def test_timing():
    """Each flash is 200 ms on and 200 ms off"""
    h = pico_sim.history(25)[1:]   # skip the initial state
    times = [t for t, _ in h]
    gaps = [b - a for a, b in zip(times, times[1:])]
    assert gaps and all(g == 200 for g in gaps), f"gaps between changes: {gaps}"

def test_ends_off():
    """The LED ends up off"""
    assert pico_sim.level(25) == 0
@@hint
A `for _ in range(3):` loop with `led.on()`, `time.sleep_ms(200)`, `led.off()`, `time.sleep_ms(200)`.
:::

:::quiz emb-intro-check Quick check
? How much RAM does a Raspberry Pi Pico (RP2040) have?
- [ ] 264 MB
- [x] 264 KB
- [ ] 2 GB
> About 60,000 times less than a typical laptop.

? What runs on a bare microcontroller alongside your program?
- [ ] Linux
- [ ] A garbage collector
- [x] Nothing: your program is the only software (unless you add an RTOS)
> That's why boot times are milliseconds and timing is predictable.

? How does software control a peripheral like a GPIO pin?
- [ ] With special CPU instructions per device
- [x] By reading and writing registers at fixed memory addresses
- [ ] Through files
> This is memory-mapped I/O.

? What does "real-time" mean for an embedded system?
- [ ] It's very fast
- [x] It must respond within a guaranteed deadline
- [ ] It shows the current time
> A correct answer that arrives too late is a failure.
:::
