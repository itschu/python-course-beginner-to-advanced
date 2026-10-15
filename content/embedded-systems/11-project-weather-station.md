---
title: "Project: a smart weather station"
summary: Build complete MicroPython firmware for a simulated Pico, with sensor drivers, filtering, alarms with hysteresis, a UART data log, a watchdog and a timer-driven main loop.
minutes: 120
kind: project
---

You'll build the firmware for a small weather station:

```text
 TMP102 (I2C 0x48) ──┐                         ┌── GP15  red alarm LED
 light sensor (GP26) ┼──► Pico ── firmware ────┼── GP18  buzzer
 button (GP14) ──────┘                         ├── GP25  heartbeat LED
                                               └── UART0 → data log (CSV lines)
```

Requirements:

1. Sample temperature and light once per second.
2. Smooth the temperature with an exponential moving average.
3. Raise an alarm (red LED on, buzzer beeps) when the smoothed temperature goes above 30 °C, and clear it only when it falls below 28 °C.
4. The button silences the buzzer for the current alarm (the LED stays on).
5. Log every reading over UART as a CSV line with a checksum.
6. Feed the watchdog; blink a heartbeat LED.

Professional firmware is split into layers you can test separately: **drivers** (talk to hardware), **logic** (pure functions and small classes) and the **main loop** (wiring them together). The steps follow those layers. Each exercise is self-contained, so the classes from earlier steps are repeated where they're needed.

## Step 1: drivers

:::exercise ws-drivers Sensor drivers
Write two small driver classes:

- `Tmp102(i2c, address=0x48)` with `read()` returning °C (12-bit two's complement, 0.0625 °C per step, register 0).
- `LightSensor(adc)` with `read_percent()`: `read_u16()` scaled to 0–100 and rounded to 1 decimal place.

@@starter
class Tmp102:
    def __init__(self, i2c, address=0x48):
        pass

    def read(self):
        pass


class LightSensor:
    def __init__(self, adc):
        pass

    def read_percent(self):
        pass

@@solution
class Tmp102:
    def __init__(self, i2c, address=0x48):
        self.i2c = i2c
        self.address = address

    def read(self):
        data = self.i2c.readfrom_mem(self.address, 0x00, 2)
        raw = (data[0] << 4) | (data[1] >> 4)
        if raw & 0x800:
            raw -= 1 << 12
        return raw * 0.0625


class LightSensor:
    def __init__(self, adc):
        self.adc = adc

    def read_percent(self):
        return round(self.adc.read_u16() / 65535 * 100, 1)

@@tests
from machine import ADC, I2C, Pin
import pico_sim

def test_temperature():
    """Reads positive and negative temperatures"""
    sensor = Tmp102(I2C(0, scl=Pin(5), sda=Pin(4)))
    pico_sim.set_temperature(24.25)
    assert sensor.read() == 24.25
    pico_sim.set_temperature(-3.5)
    assert sensor.read() == -3.5

def test_light():
    """Scales the ADC to a percentage"""
    pico_sim.set_adc(26, 3.3)
    assert LightSensor(ADC(26)).read_percent() == 100.0
    pico_sim.set_adc(26, 0.0)
    assert LightSensor(ADC(26)).read_percent() == 0.0
    pico_sim.set_adc(26, 1.65)
    assert abs(LightSensor(ADC(26)).read_percent() - 50.0) <= 0.1

@@hint
The TMP102 code is the same as lesson 6, inside a class. For light, `self.adc.read_u16() / 65535 * 100`.
:::

## Step 2: logic

:::exercise ws-logic Filter, alarm and log line
Write the pure logic (no hardware):

- `Ema(alpha)` with `update(x)` (the first value is used as-is).
- `Alarm(on_above=30.0, off_below=28.0)` with `update(temperature)` returning whether the alarm is active (hysteresis), and `silence()`, which mutes the buzzer **until the alarm clears**. Add a property-like method `buzzer_on()` that's true when the alarm is active and not silenced. When the alarm clears, the silence is forgotten, so the next alarm sounds again.
- `log_line(t_ms, temperature, light)` returning a string like `"12000,21.50,63.2*4F\n"`: time, temperature with 2 decimals, light with 1 decimal, then `*` and the XOR of every character before the `*`, as two uppercase hex digits.

@@starter
class Ema:
    def __init__(self, alpha):
        pass

    def update(self, x):
        pass


class Alarm:
    def __init__(self, on_above=30.0, off_below=28.0):
        pass

    def update(self, temperature):
        pass

    def silence(self):
        pass

    def buzzer_on(self):
        pass


def log_line(t_ms, temperature, light):
    pass

@@solution
class Ema:
    def __init__(self, alpha):
        self.alpha = alpha
        self.value = None

    def update(self, x):
        self.value = x if self.value is None else self.value + self.alpha * (x - self.value)
        return self.value


class Alarm:
    def __init__(self, on_above=30.0, off_below=28.0):
        self.on_above = on_above
        self.off_below = off_below
        self.active = False
        self.silenced = False

    def update(self, temperature):
        if temperature > self.on_above:
            self.active = True
        elif temperature < self.off_below:
            self.active = False
            self.silenced = False
        return self.active

    def silence(self):
        if self.active:
            self.silenced = True

    def buzzer_on(self):
        return self.active and not self.silenced


def log_line(t_ms, temperature, light):
    body = f"{t_ms},{temperature:.2f},{light:.1f}"
    checksum = 0
    for ch in body:
        checksum ^= ord(ch)
    return f"{body}*{checksum:02X}\n"

@@tests
def test_ema():
    """EMA smooths toward new values"""
    e = Ema(0.5)
    assert e.update(20) == 20
    assert e.update(30) == 25

def test_alarm_hysteresis():
    """The alarm turns on above 30 and off below 28"""
    a = Alarm()
    assert [a.update(t) for t in [29, 30.5, 29, 28.5, 27.9, 29.5]] == [False, True, True, True, False, False]

def test_silence():
    """Silence mutes the buzzer for this alarm only"""
    a = Alarm()
    a.update(31)
    assert a.buzzer_on()
    a.silence()
    assert a.active and not a.buzzer_on()
    a.update(27)            # alarm clears
    a.update(31)            # a new alarm
    assert a.buzzer_on(), "a new alarm should sound again"

def test_silence_when_quiet():
    """Silencing with no alarm does nothing"""
    a = Alarm()
    a.silence()
    a.update(31)
    assert a.buzzer_on()

def test_log_line():
    """Formats a CSV line with an XOR checksum"""
    line = log_line(12000, 21.5, 63.24)
    body, rest = line.split("*")
    assert body == "12000,21.50,63.2"
    expected = 0
    for ch in body:
        expected ^= ord(ch)
    assert rest == f"{expected:02X}\n"

@@hint
`Alarm` needs two flags: `active` and `silenced`. Clear `silenced` whenever the alarm turns off, and only allow `silence()` to set it while the alarm is active.

@@hint
`f"{checksum:02X}"` formats a number as two uppercase hex digits.
:::

## Step 3: the firmware

Now wire it together. On a real board, this is `main.py`, and the loop is `while True:`.

:::exercise ws-firmware The main loop
Complete `run(duration_ms)`, the firmware's main loop. The drivers and logic from steps 1 and 2 are included. Each second (use a `Timer` that sets a flag, or `ticks_diff`):

1. read the temperature and light; smooth the temperature with `Ema(0.3)`
2. update the alarm with the **smoothed** temperature; set the red LED (GP15) to whether the alarm is active, and the buzzer (GP18) to `alarm.buzzer_on()`
3. write `log_line(now_ms, smoothed, light)` to UART 0

Also: toggle the heartbeat LED (GP25) each second, call `alarm.silence()` when the button on GP14 (pull-up) is pressed (use an interrupt), and feed a `WDT(timeout=2000)` every loop iteration. Sleep at most 10 ms at a time.

The starter sets up a simulated world: the room heats up to 35 °C and cools again, and someone presses the button.

@@starter
from machine import ADC, I2C, Pin, Timer, UART, WDT
import time
import pico_sim


class Tmp102:
    def __init__(self, i2c, address=0x48):
        self.i2c, self.address = i2c, address

    def read(self):
        d = self.i2c.readfrom_mem(self.address, 0x00, 2)
        raw = (d[0] << 4) | (d[1] >> 4)
        return (raw - 4096 if raw & 0x800 else raw) * 0.0625


class LightSensor:
    def __init__(self, adc):
        self.adc = adc

    def read_percent(self):
        return round(self.adc.read_u16() / 65535 * 100, 1)


class Ema:
    def __init__(self, alpha):
        self.alpha, self.value = alpha, None

    def update(self, x):
        self.value = x if self.value is None else self.value + self.alpha * (x - self.value)
        return self.value


class Alarm:
    def __init__(self, on_above=30.0, off_below=28.0):
        self.on_above, self.off_below = on_above, off_below
        self.active = self.silenced = False

    def update(self, t):
        if t > self.on_above:
            self.active = True
        elif t < self.off_below:
            self.active = self.silenced = False
        return self.active

    def silence(self):
        if self.active:
            self.silenced = True

    def buzzer_on(self):
        return self.active and not self.silenced


def log_line(t_ms, temperature, light):
    body = f"{t_ms},{temperature:.2f},{light:.1f}"
    cs = 0
    for ch in body:
        cs ^= ord(ch)
    return f"{body}*{cs:02X}\n"


# --- the simulated world (leave this in) ---
def room_temperature(t):          # t in seconds: heats to 35 °C at t = 20 s, back to 22 °C by t = 40 s
    return 22 + 13 * max(0.0, 1 - abs(t - 20) / 20)

pico_sim.set_temperature(room_temperature)
pico_sim.set_adc(26, 2.0)
pico_sim.press(14, at_ms=21_500, hold_ms=200)
# --------------------------------------------


def run(duration_ms):
    pass


run(45_000)

@@solution
from machine import ADC, I2C, Pin, Timer, UART, WDT
import time
import pico_sim


class Tmp102:
    def __init__(self, i2c, address=0x48):
        self.i2c, self.address = i2c, address

    def read(self):
        d = self.i2c.readfrom_mem(self.address, 0x00, 2)
        raw = (d[0] << 4) | (d[1] >> 4)
        return (raw - 4096 if raw & 0x800 else raw) * 0.0625


class LightSensor:
    def __init__(self, adc):
        self.adc = adc

    def read_percent(self):
        return round(self.adc.read_u16() / 65535 * 100, 1)


class Ema:
    def __init__(self, alpha):
        self.alpha, self.value = alpha, None

    def update(self, x):
        self.value = x if self.value is None else self.value + self.alpha * (x - self.value)
        return self.value


class Alarm:
    def __init__(self, on_above=30.0, off_below=28.0):
        self.on_above, self.off_below = on_above, off_below
        self.active = self.silenced = False

    def update(self, t):
        if t > self.on_above:
            self.active = True
        elif t < self.off_below:
            self.active = self.silenced = False
        return self.active

    def silence(self):
        if self.active:
            self.silenced = True

    def buzzer_on(self):
        return self.active and not self.silenced


def log_line(t_ms, temperature, light):
    body = f"{t_ms},{temperature:.2f},{light:.1f}"
    cs = 0
    for ch in body:
        cs ^= ord(ch)
    return f"{body}*{cs:02X}\n"


# --- the simulated world (leave this in) ---
def room_temperature(t):          # t in seconds: heats to 35 °C at t = 20 s, back to 22 °C by t = 40 s
    return 22 + 13 * max(0.0, 1 - abs(t - 20) / 20)

pico_sim.set_temperature(room_temperature)
pico_sim.set_adc(26, 2.0)
pico_sim.press(14, at_ms=21_500, hold_ms=200)
# --------------------------------------------


def run(duration_ms):
    i2c = I2C(0, scl=Pin(5), sda=Pin(4))
    thermometer = Tmp102(i2c)
    light_sensor = LightSensor(ADC(26))
    uart = UART(0, baudrate=115200)
    red, buzzer, heartbeat = Pin(15, Pin.OUT), Pin(18, Pin.OUT), Pin(25, Pin.OUT)
    smoother, alarm = Ema(0.3), Alarm()
    wdt = WDT(timeout=2000)

    state = {"due": False}

    def tick(timer):
        state["due"] = True

    def on_button(pin):
        alarm.silence()

    button = Pin(14, Pin.IN, Pin.PULL_UP)
    button.irq(trigger=Pin.IRQ_FALLING, handler=on_button)
    timer = Timer(period=1000, mode=Timer.PERIODIC, callback=tick)

    start = time.ticks_ms()
    while time.ticks_diff(time.ticks_ms(), start) < duration_ms:
        if state["due"]:
            state["due"] = False
            smoothed = smoother.update(thermometer.read())
            light = light_sensor.read_percent()
            red.value(alarm.update(smoothed))
            heartbeat.toggle()
            uart.write(log_line(time.ticks_ms(), smoothed, light))
        buzzer.value(alarm.buzzer_on())
        wdt.feed()
        time.sleep_ms(10)
    timer.deinit()


run(45_000)

@@tests
import pico_sim

def lines():
    return [l for l in pico_sim.uart_output(0).splitlines() if l]

def test_logs_every_second():
    """Logs one valid line per second"""
    out = lines()
    assert 43 <= len(out) <= 45, f"{len(out)} lines logged"
    for line in out:
        body, cs = line.split("*")
        x = 0
        for ch in body:
            x ^= ord(ch)
        assert int(cs, 16) == x, f"bad checksum in {line!r}"
        t, temp, light = body.split(",")
        assert abs(float(light) - 60.6) < 0.2, line

def test_alarm_led():
    """The red LED turns on once while it's hot, then off when it cools"""
    changes = pico_sim.history(15)[1:]
    assert [v for _, v in changes] == [1, 0], f"red LED history: {changes}"
    on, off = changes[0][0], changes[1][0]
    assert 13_000 < on < 20_000 and 26_000 < off < 36_000, f"on at {on} ms, off at {off} ms"

def test_button_silences():
    """The buzzer sounds with the alarm and stops when the button is pressed"""
    changes = pico_sim.history(18)[1:]
    assert changes and changes[0][1] == 1, f"buzzer history: {changes}"
    assert 21_500 <= changes[1][0] <= 21_600 and changes[1][1] == 0, f"buzzer history: {changes}"
    assert len(changes) == 2, "the buzzer should stay silent for the rest of this alarm"

def test_heartbeat():
    """The heartbeat LED blinks each second"""
    assert len(pico_sim.history(25)) >= 40
@@hint
Set up the hardware at the start of `run`. A `Timer(period=1000, ...)` whose callback only sets a flag is the cleanest way to sample once a second; the main loop checks the flag.

@@hint
Interrupt handlers can't reassign a local variable of `run`, but they can change a mutable object: `state = {"due": False}` and `state["due"] = True` in the callback. Update the buzzer and feed the watchdog on every loop pass, not just once a second, so the button takes effect immediately.
:::

## Run it on a real Pico

1. Flash MicroPython onto the Pico with Thonny (Tools → Options → Interpreter → install MicroPython).
2. Wire the TMP102 (or any I2C temperature sensor) to GP4 (SDA) and GP5 (SCL) with 3.3 V and ground, a photoresistor divider to GP26, a red LED with a 330 Ω resistor on GP15, a small active buzzer on GP18 (through a transistor if it draws more than about 10 mA) and a button from GP14 to ground.
3. Save your code as `main.py` on the Pico, removing the `pico_sim` lines and replacing `run(45_000)` with a `while True` loop.
4. Connect a USB-serial adapter to UART0 (GP0 TX) and watch the log with any serial terminal, or log over USB with `print` instead.

:::tip Extend it
- Store the last 24 hours of hourly averages in a ring buffer and show min/max on a small SSD1306 OLED (I2C).
- Use the Pico W's Wi-Fi to send readings to the FastAPI service from Phase 8.
- Port the logic layer to Rust with Embassy: the `Alarm` and `Ema` classes become a struct and a state machine you can unit test with `cargo test`.
:::
