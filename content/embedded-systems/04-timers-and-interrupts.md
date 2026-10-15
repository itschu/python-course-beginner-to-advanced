---
title: Timers, interrupts and state machines
summary: React to events instantly with pin interrupts, run code on a schedule with hardware timers, and do several things at once with non-blocking state machines.
minutes: 55
kind: lesson
---

The polling loop from the last lesson has two problems. It wastes energy checking a button that's almost never pressed, and while it's busy (or sleeping), it can miss short events. Microcontrollers solve both with **interrupts**.

## Pin interrupts

An **interrupt** is a hardware signal that pauses whatever the CPU is doing and runs a short function, the **interrupt service routine** (ISR, or handler), then resumes. A GPIO pin can trigger one on a rising edge (0 → 1), a falling edge (1 → 0), or both:

```python
from machine import Pin
import time
import pico_sim

presses = 0

def on_press(pin):
    global presses
    presses += 1

button = Pin(14, Pin.IN, Pin.PULL_UP)
button.irq(trigger=Pin.IRQ_FALLING, handler=on_press)

pico_sim.press(14, at_ms=250)
pico_sim.press(14, at_ms=600)

time.sleep_ms(1000)      # the main program is busy doing something else (or asleep)
print("presses:", presses)
```

The main code never looked at the button, yet both presses were counted: the hardware called `on_press` the moment each edge happened.

## Rules for interrupt handlers

An ISR interrupts your program at an unpredictable moment, so it must be **short and simple**:

- **Do as little as possible**: set a flag, increment a counter, record a timestamp. Do the real work in the main loop.
- **Don't allocate memory** (no new lists, strings or floats) in a "hard" interrupt; on many ports this raises an error. Use `micropython.schedule(fn, arg)` to run longer code soon after, outside the interrupt.
- **Don't sleep or wait** inside a handler.
- **Share data carefully**. The main loop might be halfway through reading a variable when the ISR changes it. Single integers are fine; for anything bigger, briefly disable interrupts (`state = machine.disable_irq()` ... `machine.enable_irq(state)`).

The pattern looks like this:

```python
from machine import Pin
import time
import pico_sim

button_flag = False
pressed_at = 0

def on_press(pin):
    global button_flag, pressed_at
    button_flag = True                 # just record the event...
    pressed_at = time.ticks_ms()

button = Pin(14, Pin.IN, Pin.PULL_UP)
button.irq(trigger=Pin.IRQ_FALLING, handler=on_press)
led = Pin(25, Pin.OUT)
pico_sim.press(14, at_ms=300)

for _ in range(100):                   # main loop: while True on a real board
    if button_flag:                    # ...and handle it here
        button_flag = False
        led.toggle()
        print(f"handled press from {pressed_at} ms at {time.ticks_ms()} ms")
    time.sleep_ms(10)
```

## Hardware timers

A **timer** calls a function at a fixed rate, independently of the main loop: blink a heartbeat LED, sample a sensor exactly 100 times a second, or check that everything is alive.

```python
from machine import Pin, Timer
import time
import pico_sim

led = Pin(25, Pin.OUT)
samples = []

def heartbeat(timer):
    led.toggle()

def sample(timer):
    samples.append(time.ticks_ms())

Timer(period=250, mode=Timer.PERIODIC, callback=heartbeat)
sampler = Timer(freq=20, mode=Timer.PERIODIC, callback=sample)     # 20 Hz = every 50 ms

time.sleep_ms(1000)
sampler.deinit()
print(pico_sim.waveform(25, step_ms=125))
print(len(samples), "samples at", samples[:5], "...")
```

`Timer.ONE_SHOT` runs the callback once after the period, which is handy for timeouts ("turn the light off 30 seconds after the last motion").

## Doing several things at once: non-blocking code

`time.sleep_ms(500)` **blocks**: nothing else happens for half a second. Blink one LED with sleeps and you can't blink a second LED at a different rate, or react to a button, at the same time.

The fix is to never block. Each job remembers **when it last ran**, and the main loop checks every job quickly and often:

```python
from machine import Pin
import time
import pico_sim

red = Pin(15, Pin.OUT)
green = Pin(16, Pin.OUT)
last_red = last_green = time.ticks_ms()

start = time.ticks_ms()
while time.ticks_diff(time.ticks_ms(), start) < 1200:
    now = time.ticks_ms()
    if time.ticks_diff(now, last_red) >= 200:       # red blinks every 200 ms
        red.toggle()
        last_red = now
    if time.ticks_diff(now, last_green) >= 300:     # green every 300 ms, independently
        green.toggle()
        last_green = now
    time.sleep_ms(1)

print(pico_sim.waveform(15, step_ms=100))
print(pico_sim.waveform(16, step_ms=100))
```

## State machines

Real devices have **modes**: a traffic light is red, then red-and-amber, then green, then amber. Writing that with nested `if`s and sleeps gets messy fast. A **state machine** makes it explicit: a current state, how long it lasts, and what comes next.

```python
from machine import Pin
import time
import pico_sim

RED, AMBER, GREEN = Pin(15, Pin.OUT), Pin(16, Pin.OUT), Pin(17, Pin.OUT)

# state: (lights on, duration in ms, next state)
STATES = {
    "stop":       ((RED,), 3000, "get_ready"),
    "get_ready":  ((RED, AMBER), 1000, "go"),
    "go":         ((GREEN,), 3000, "slow_down"),
    "slow_down":  ((AMBER,), 1000, "stop"),
}

def show(state):
    lights_on = STATES[state][0]
    for light in (RED, AMBER, GREEN):
        light.value(light in lights_on)

state = "stop"
entered = time.ticks_ms()
show(state)
for _ in range(10_000):                      # 10 seconds of 1 ms ticks
    lights, duration, next_state = STATES[state]
    if time.ticks_diff(time.ticks_ms(), entered) >= duration:
        state = next_state
        entered = time.ticks_ms()
        show(state)
    time.sleep_ms(1)

for pin in (15, 16, 17):
    print(pico_sim.waveform(pin, step_ms=500))
```

This loop never blocks, so you could add a pedestrian button (an interrupt that sets a flag) and the state machine would react on its next pass. You'll see the same pattern in Rust with `enum` states and `match`.

## Practice

:::exercise emb-irq-counter Count events with an interrupt
A flow meter produces one pulse (a falling edge on GPIO 2) per 2.25 ml of water. Set up a pin with a pull-up and an interrupt handler that counts pulses. The starter simulates 40 pulses while the main program sleeps for 2 seconds.

After the sleep, set `litres` to the volume measured, in litres.

@@starter
from machine import Pin
import time
import pico_sim

ML_PER_PULSE = 2.25

# set up the pin and interrupt handler here

# simulated pulses from the flow meter (leave these lines in)
for i in range(40):
    pico_sim.press(2, at_ms=100 + i * 40, hold_ms=10)

time.sleep_ms(2000)
litres = None

@@solution
from machine import Pin
import time
import pico_sim

ML_PER_PULSE = 2.25

pulses = 0

def on_pulse(pin):
    global pulses
    pulses += 1

flow = Pin(2, Pin.IN, Pin.PULL_UP)
flow.irq(trigger=Pin.IRQ_FALLING, handler=on_pulse)

# simulated pulses from the flow meter (leave these lines in)
for i in range(40):
    pico_sim.press(2, at_ms=100 + i * 40, hold_ms=10)

time.sleep_ms(2000)
litres = pulses * ML_PER_PULSE / 1000

@@tests
def test_litres():
    """40 pulses of 2.25 ml is 0.09 litres"""
    assert litres is not None and abs(litres - 0.09) < 1e-9, f"litres = {litres}"

def test_used_interrupt():
    """Counts with an interrupt handler, not polling"""
    assert "irq(" in source, "use pin.irq(...) to count the pulses"
@@hint
Define `pulses = 0` and a handler that does `global pulses` then `pulses += 1`. Attach it with `flow.irq(trigger=Pin.IRQ_FALLING, handler=on_pulse)` **before** the simulated pulses start.
:::

:::exercise emb-blink-without-sleep Two jobs, one loop
Without blocking, run two jobs for **3000 ms** of simulated time:

1. Toggle the LED on GPIO 25 every **500 ms** (a heartbeat).
2. Poll the button on GPIO 14 (pull-up). On each new press, toggle the buzzer pin GPIO 18.

Your loop may sleep at most **5 ms** at a time. The starter simulates two button presses.

@@starter
from machine import Pin
import time
import pico_sim

led = Pin(25, Pin.OUT)
buzzer = Pin(18, Pin.OUT)
button = Pin(14, Pin.IN, Pin.PULL_UP)

# simulated button presses (leave these lines in)
pico_sim.press(14, at_ms=700, hold_ms=100)
pico_sim.press(14, at_ms=2100, hold_ms=100)

# your non-blocking loop here

@@solution
from machine import Pin
import time
import pico_sim

led = Pin(25, Pin.OUT)
buzzer = Pin(18, Pin.OUT)
button = Pin(14, Pin.IN, Pin.PULL_UP)

# simulated button presses (leave these lines in)
pico_sim.press(14, at_ms=700, hold_ms=100)
pico_sim.press(14, at_ms=2100, hold_ms=100)

start = last_blink = time.ticks_ms()
last_button = button.value()
while time.ticks_diff(time.ticks_ms(), start) < 3000:
    now = time.ticks_ms()
    if time.ticks_diff(now, last_blink) >= 500:
        led.toggle()
        last_blink = now
    reading = button.value()
    if last_button == 1 and reading == 0:
        buzzer.toggle()
    last_button = reading
    time.sleep_ms(1)

@@tests
import pico_sim

def test_heartbeat():
    """The LED toggles every 500 ms (5 or 6 times in 3 s)"""
    changes = pico_sim.history(25)[1:]
    assert len(changes) in (5, 6), f"LED changes: {changes}"
    gaps = [b[0] - a[0] for a, b in zip(changes, changes[1:])]
    assert all(495 <= g <= 510 for g in gaps), f"gaps: {gaps}"

def test_buzzer_follows_button():
    """The buzzer toggles promptly on each press"""
    changes = [t for t, _ in pico_sim.history(18)[1:]]
    assert len(changes) == 2, f"buzzer changes at {changes}"
    assert 700 <= changes[0] <= 710 and 2100 <= changes[1] <= 2110, f"buzzer changes at {changes}"

def test_no_long_sleeps():
    """Never sleeps for long"""
    import re
    sleeps = [int(n) for n in re.findall(r"sleep_ms\((\d+)\)", source)]
    assert sleeps and max(sleeps) <= 5, f"sleep_ms values: {sleeps}"
@@hint
Keep `last_blink` (when the LED last toggled) and `last_button` (the previous reading). Each pass: check whether 500 ms have passed since `last_blink`, check for a falling edge on the button, then `time.sleep_ms(1)`.
:::

:::quiz emb-interrupts-check Quick check
? What should an interrupt handler do?
- [ ] All the processing for the event
- [x] The minimum: record the event (a flag, a count, a timestamp) and return
- [ ] Sleep until the event finishes
> Heavy work belongs in the main loop or in a scheduled callback.

? Why can't you blink two LEDs at different rates with `sleep_ms`?
- [x] Sleeping blocks everything else, so only one timing can be followed at once
- [ ] There's only one timer
- [ ] Pins can't change at the same time
> Non-blocking loops (or timers, or async) let several jobs share the CPU.

? What does a state machine make explicit?
- [x] The possible modes, how long each lasts or what triggers a change, and which mode comes next
- [ ] The memory layout
- [ ] Interrupt priorities
> States plus transitions: easy to reason about, test and extend.
:::
