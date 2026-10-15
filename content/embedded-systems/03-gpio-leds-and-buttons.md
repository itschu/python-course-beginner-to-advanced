---
title: "GPIO: LEDs, buttons and debouncing"
summary: Drive outputs and read inputs with MicroPython's Pin class, write a polling main loop, and debounce a noisy switch.
minutes: 55
kind: lesson
---

This lesson uses the simulated Pico. Every `machine` call is real MicroPython and runs unchanged on a board; the `pico_sim` calls are the simulator's way of pressing buttons and showing you what happened.

## Outputs

```python
from machine import Pin
import time
import pico_sim

led = Pin(25, Pin.OUT)       # Pin("LED") on a Pico W
red = Pin(15, Pin.OUT, value=0)

led.on()
red.value(1)                 # same as on()
time.sleep_ms(300)
led.off()
red.toggle()
time.sleep_ms(300)

print(pico_sim.waveform(25, step_ms=100))
print(pico_sim.waveform(15, step_ms=100))
```

On a real board, wire an LED and a 330 Ω resistor from GP15 to ground (lesson 2).

## Inputs

```python
from machine import Pin
import time
import pico_sim

button = Pin(14, Pin.IN, Pin.PULL_UP)   # internal pull-up: reads 1 until pressed
print("released:", button.value())

pico_sim.press(14, at_ms=100, hold_ms=200)   # simulator: press the button at t = 100 ms
time.sleep_ms(150)
print("during the press:", button.value())  # 0: active low
time.sleep_ms(200)
print("after:", button.value())
```

## The main loop

Firmware usually runs forever: read inputs, decide, update outputs, repeat. This is called a **super loop**. On a real board it's `while True:`; in the simulator we run it for a fixed time so the cell finishes:

```python
from machine import Pin
import time
import pico_sim

led = Pin(25, Pin.OUT)
button = Pin(14, Pin.IN, Pin.PULL_UP)
pico_sim.press(14, at_ms=200, hold_ms=300)
pico_sim.press(14, at_ms=700, hold_ms=100)

start = time.ticks_ms()
while time.ticks_diff(time.ticks_ms(), start) < 1000:   # on a board: while True:
    led.value(not button.value())     # LED on while the button is held
    time.sleep_ms(10)                 # poll every 10 ms

print(pico_sim.waveform(14, step_ms=50))
print(pico_sim.waveform(25, step_ms=50))
```

Two MicroPython details:

- `time.ticks_ms()` is a millisecond counter that **wraps around** after a while (to keep it a small integer). Always compare times with `time.ticks_diff(now, then)`, never `now - then`.
- Polling every 10 ms is fine for a button. Next lesson shows interrupts, which react instantly without polling.

## Bouncing

A mechanical switch doesn't close cleanly. Its contacts bounce for a few milliseconds, so one press looks like several:

```python
from machine import Pin
import time
import pico_sim

button = Pin(14, Pin.IN, Pin.PULL_UP)
pico_sim.press(14, at_ms=100, hold_ms=300, bounce=True)   # a realistic, bouncy switch

presses = 0
last = button.value()
for _ in range(10_000):              # poll every 0.1 ms for one second
    now = button.value()
    if last == 1 and now == 0:       # a falling edge: released -> pressed
        presses += 1
    last = now
    time.sleep_us(100)

print("presses counted:", presses, "(the button was pressed once!)")
```

Counting every edge gives the wrong answer. That's the classic bug behind a remote control that skips two channels at once.

## Debouncing

The usual fix: **only accept a new state once it has been stable for a few milliseconds** (10–50 ms is typical). Here's a debouncer as a small class, the same idea used in professional firmware:

```python
from machine import Pin
import time
import pico_sim

class Debouncer:
    def __init__(self, pin, stable_ms=20):
        self.pin = pin
        self.stable_ms = stable_ms
        self.state = pin.value()          # the accepted, debounced state
        self.candidate = self.state
        self.since = time.ticks_ms()

    def update(self):
        """Call often. Returns True once per press (on the debounced falling edge)."""
        raw = self.pin.value()
        now = time.ticks_ms()
        if raw != self.candidate:
            self.candidate = raw          # the input changed: restart the timer
            self.since = now
        elif raw != self.state and time.ticks_diff(now, self.since) >= self.stable_ms:
            self.state = raw              # stable long enough: accept it
            return raw == 0
        return False

button = Pin(14, Pin.IN, Pin.PULL_UP)
pico_sim.press(14, at_ms=100, hold_ms=300, bounce=True)
pico_sim.press(14, at_ms=600, hold_ms=200, bounce=True)

debounced = Debouncer(button)
presses = 0
for _ in range(1000):
    if debounced.update():
        presses += 1
    time.sleep_ms(1)
print("presses counted:", presses)
```

Debouncing adds 20 ms of delay, which no human notices. You can also debounce in hardware with a resistor and capacitor, but software is free.

## Practice

:::exercise emb-toggle-led Toggle with each press
Write a loop that runs for **2000 ms** of simulated time, polling GPIO 14 (button, pull-up) every 5 ms, and **toggles** the LED on GPIO 25 on each new press (each falling edge). The button in the tests doesn't bounce.

Use `time.ticks_ms()` and `time.ticks_diff()` for the 2000 ms limit.

@@starter
from machine import Pin
import time
import pico_sim

led = Pin(25, Pin.OUT)
button = Pin(14, Pin.IN, Pin.PULL_UP)

# Simulate someone pressing the button three times (leave these lines in)
for at in (300, 900, 1500):
    pico_sim.press(14, at_ms=at, hold_ms=200)

# your loop here

@@solution
from machine import Pin
import time
import pico_sim

led = Pin(25, Pin.OUT)
button = Pin(14, Pin.IN, Pin.PULL_UP)

# Simulate someone pressing the button three times (leave these lines in)
for at in (300, 900, 1500):
    pico_sim.press(14, at_ms=at, hold_ms=200)

last = button.value()
start = time.ticks_ms()
while time.ticks_diff(time.ticks_ms(), start) < 2000:
    now = button.value()
    if last == 1 and now == 0:
        led.toggle()
    last = now
    time.sleep_ms(5)

@@tests
import pico_sim

def test_toggles():
    """Three presses toggle the LED on, off, on"""
    ons = [t for t, v in pico_sim.history(25) if v == 1]
    offs = [t for t, v in pico_sim.history(25)[1:] if v == 0]
    assert len(ons) == 2 and len(offs) == 1, f"LED history: {pico_sim.history(25)}"
    assert pico_sim.level(25) == 1

def test_ran_two_seconds():
    """The loop ran for about 2 seconds of simulated time"""
    assert 1990 <= pico_sim.now_ms() <= 2100, f"ran for {pico_sim.now_ms()} ms"
@@hint
Remember the previous reading in `last`. A press is `last == 1 and now == 0`; then `led.toggle()`.
:::

:::exercise emb-debounce-count Count presses on a bouncy button
Write a function `count_presses(pin, duration_ms, stable_ms=20)` that polls `pin` every 1 ms for `duration_ms` milliseconds and returns the number of **debounced** presses (a press means the debounced state changes from 1 to 0). The pin uses a pull-up.

The tests simulate bouncy presses.

@@starter
import time

def count_presses(pin, duration_ms, stable_ms=20):
    pass

@@solution
import time

def count_presses(pin, duration_ms, stable_ms=20):
    state = pin.value()
    candidate = state
    since = time.ticks_ms()
    presses = 0
    for _ in range(duration_ms):
        raw = pin.value()
        now = time.ticks_ms()
        if raw != candidate:
            candidate = raw
            since = now
        elif raw != state and time.ticks_diff(now, since) >= stable_ms:
            state = raw
            if state == 0:
                presses += 1
        time.sleep_ms(1)
    return presses

@@tests
import pico_sim
from machine import Pin

def setup(presses):
    pico_sim.reset()
    pin = Pin(14, Pin.IN, Pin.PULL_UP)
    for at in presses:
        pico_sim.press(14, at_ms=at, hold_ms=150, bounce=True)
    return pin

def test_single():
    """One bouncy press counts once"""
    assert count_presses(setup([100]), 500) == 1

def test_three():
    """Three bouncy presses count three times"""
    assert count_presses(setup([100, 400, 700]), 1000) == 3

def test_none():
    """No presses, no count"""
    assert count_presses(setup([]), 300) == 0
@@hint
Adapt the `Debouncer` class from the lesson into the function: keep `state`, `candidate` and `since`, and increase a counter when the accepted state becomes 0.
:::

:::quiz emb-gpio-check Quick check
? With `Pin(14, Pin.IN, Pin.PULL_UP)` and a button to ground, what does `value()` return while pressed?
- [x] 0
- [ ] 1
> Active low: pressing pulls the pin to ground.

? Why compare times with `time.ticks_diff(now, start)` instead of `now - start`?
- [ ] It's faster
- [x] The tick counter wraps around, and ticks_diff handles the wrap correctly
- [ ] ticks_ms returns a string
> MicroPython keeps ticks small so they fit in a small integer.

? A single press is counted three times. What's the likely cause?
- [ ] A broken button
- [x] Contact bounce
- [ ] The LED resistor
> Accept a new state only after it has been stable for 10–50 ms.
:::
