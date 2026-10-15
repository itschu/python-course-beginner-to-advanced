---
title: Electronics essentials
summary: Voltage, current and resistance, Ohm's law, LED resistors, voltage dividers, pull-up resistors, logic levels and reading a datasheet.
minutes: 50
kind: lesson
---

You don't need an electronics degree to program microcontrollers, but you do need a handful of ideas so you don't destroy a board (or misread a sensor). This lesson covers them, with Python doing the arithmetic.

## Voltage, current and resistance

The classic analogy is water in pipes:

| Quantity | Symbol, unit | Water analogy | Example |
| --- | --- | --- | --- |
| **Voltage** | V, volts | water pressure | the Pico's pins are 3.3 V when high |
| **Current** | I, amperes (A) | flow rate | an LED uses about 10 mA (0.010 A) |
| **Resistance** | R, ohms (Ω) | a narrow pipe | a 330 Ω resistor |

They're linked by **Ohm's law**:

$$
V = I \times R
$$

and the power turned into heat is $P = V \times I$.

```python
def current_amps(volts, ohms):
    return volts / ohms

# 3.3 V across a 330 Ω resistor
i = current_amps(3.3, 330)
print(f"{i * 1000:.1f} mA, {3.3 * i * 1000:.1f} mW")
```

## LEDs need a resistor

An LED isn't a resistor: once the voltage across it reaches its **forward voltage** ($V_f$, about 2 V for red, 3 V for blue or white), it conducts almost without limit, and burns out (or damages the pin) in a fraction of a second. A **series resistor** limits the current:

$$
R = \frac{V_{supply} - V_f}{I_{LED}}
$$

```text
 GPIO 15 ──[ 330 Ω ]──►|── GND        (►| is the LED; its longer leg goes toward the GPIO)
```

```python
def led_resistor(supply_v, forward_v, current_ma):
    return (supply_v - forward_v) / (current_ma / 1000)

print(f"red LED at 10 mA from 3.3 V:  {led_resistor(3.3, 2.0, 10):.0f} Ω")
print(f"blue LED at 5 mA from 3.3 V:  {led_resistor(3.3, 3.0, 5):.0f} Ω")
```

Resistors come in standard values (the E12 series: 100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820 and those × 10, × 100, ...). Pick the **next higher** standard value so the current stays below your target.

:::warning Know your pin limits
An RP2040 GPIO pin can safely supply about 12 mA, and the whole chip about 50 mA. Motors, relays, speakers and long LED strips need far more: drive them through a transistor or a driver board, never directly from a pin. And never connect a 5 V signal to a 3.3 V pin.
:::

## Voltage dividers

Two resistors in series split a voltage. This is how you measure a voltage that's too high for the ADC (like a 9 V battery), and how most analog sensors (light, temperature, potentiometers) produce a voltage the microcontroller can read:

```text
 V_in ──[ R1 ]──┬──[ R2 ]── GND
                │
              V_out = V_in × R2 / (R1 + R2)
```

```python
def divider_out(v_in, r1, r2):
    return v_in * r2 / (r1 + r2)

# Measure a 9 V battery safely on a 3.3 V ADC with 20 kΩ and 10 kΩ
print(f"{divider_out(9.0, 20_000, 10_000):.2f} V at the ADC")

# A photoresistor (LDR) as R1 with a 10 kΩ fixed resistor as R2:
for lux, ldr_ohms in [("dark", 200_000), ("room", 10_000), ("sunlight", 500)]:
    print(f"{lux:>8}: {divider_out(3.3, ldr_ohms, 10_000):.2f} V")
```

## Logic levels

A digital input reads a voltage as 0 or 1. For a 3.3 V chip like the RP2040, roughly: below about 0.8 V is **low** (0), above about 2.0 V is **high** (1), and in between is undefined. Datasheets call these $V_{IL}$ and $V_{IH}$.

## Pull-up and pull-down resistors

A button connected between a pin and ground works when pressed (the pin is pulled to 0 V). But when it's released, the pin isn't connected to anything: it's **floating**, and it reads random values from electrical noise.

A **pull-up resistor** (e.g. 10 kΩ from the pin to 3.3 V) holds the pin high when the button is open. Pressing the button connects the pin straight to ground, so it reads low:

```text
 3.3 V ──[ 10 kΩ ]──┬── GPIO 14         released: reads 1
                    │                   pressed:  reads 0 ("active low")
                   [ button ]
                    │
                   GND
```

Microcontrollers have **built-in** pull-ups you can switch on in software, so a button needs no extra parts: `Pin(14, Pin.IN, Pin.PULL_UP)` in MicroPython. Remember that the logic is inverted: **0 means pressed**.

## Analog-to-digital conversion

An ADC turns a voltage into a number. The RP2040's ADC is **12-bit**: 0 V reads 0 and 3.3 V reads 4095 ($2^{12} - 1$). MicroPython's `read_u16()` scales that up to 0–65535 so code is the same on every chip.

$$
V = \frac{\text{reading}}{2^{\text{bits}} - 1} \times V_{ref}
$$

The **resolution** is the smallest change it can detect: 3.3 V / 4095 ≈ 0.8 mV.

## Reading a datasheet

Every chip and sensor has a datasheet. They're long, but you only need a few things at first:

1. **Absolute maximum ratings**: never exceed these (e.g. supply voltage).
2. **Operating conditions**: supply voltage, logic levels, current draw.
3. **Pinout**: which pin does what.
4. **Interface**: the protocol (I2C, SPI, UART), its address and speed.
5. **Register map**: what each register does, and how to convert raw readings into units (lesson 6).

## Practice

:::exercise emb-led-resistor Choose an LED resistor
Write `led_resistor(supply_v, forward_v, current_ma)` returning the exact resistance in ohms, and `standard_resistor(ohms)` returning the smallest value from the E12 series (below) that is **at least** `ohms`. The series repeats every decade: multiply the base values by 1, 10, 100, 1000, 10000 and 100000.

Raise `ValueError` from `led_resistor` if `supply_v <= forward_v` (the LED can't light).

@@starter
E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]

def led_resistor(supply_v, forward_v, current_ma):
    pass

def standard_resistor(ohms):
    pass

@@solution
E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]

def led_resistor(supply_v, forward_v, current_ma):
    if supply_v <= forward_v:
        raise ValueError("supply voltage must be above the LED's forward voltage")
    return (supply_v - forward_v) / (current_ma / 1000)

def standard_resistor(ohms):
    for decade in [1, 10, 100, 1_000, 10_000, 100_000]:
        for base in E12:
            value = round(base * decade, 6)
            if value >= ohms:
                return value
    raise ValueError("too large for this table")

@@tests
import pytest

def test_exact():
    """Red LED at 10 mA from 3.3 V needs 130 Ω"""
    assert abs(led_resistor(3.3, 2.0, 10) - 130) < 1e-9

def test_invalid():
    """A supply below the forward voltage is an error"""
    with pytest.raises(ValueError):
        led_resistor(3.3, 3.4, 10)

def test_standard():
    """Rounds up to the E12 series"""
    assert standard_resistor(130) == 150
    assert standard_resistor(330) == 330
    assert standard_resistor(331) == 390
    assert standard_resistor(9_000) == 10_000
    assert standard_resistor(1.1) == 1.2

@@hint
Convert milliamps to amps: `current_ma / 1000`.

@@hint
For the standard value, loop over decades and base values in increasing order and return the first `base * decade >= ohms`. `round(..., 6)` avoids floating-point surprises like `3.3 * 100 = 329.99999999999994`.
:::

:::exercise emb-adc-convert ADC conversions
Write:

- `adc_to_volts(reading, bits=12, vref=3.3)`: convert a raw ADC reading to volts.
- `battery_volts(reading, r1, r2, bits=12, vref=3.3)`: the battery voltage when the ADC measures the middle of a divider (`r1` on top, `r2` to ground). Undo the divider: `V_in = V_out × (r1 + r2) / r2`.
- `battery_percent(volts, empty=3.0, full=4.2)`: a linear estimate from 0 to 100, clamped to that range and rounded to a whole number.

@@starter
def adc_to_volts(reading, bits=12, vref=3.3):
    pass

def battery_volts(reading, r1, r2, bits=12, vref=3.3):
    pass

def battery_percent(volts, empty=3.0, full=4.2):
    pass

@@solution
def adc_to_volts(reading, bits=12, vref=3.3):
    return reading / (2 ** bits - 1) * vref

def battery_volts(reading, r1, r2, bits=12, vref=3.3):
    return adc_to_volts(reading, bits, vref) * (r1 + r2) / r2

def battery_percent(volts, empty=3.0, full=4.2):
    percent = (volts - empty) / (full - empty) * 100
    return round(min(100, max(0, percent)))

@@tests
def test_full_scale():
    """4095 on a 12-bit ADC is 3.3 V"""
    assert abs(adc_to_volts(4095) - 3.3) < 1e-9
    assert adc_to_volts(0) == 0

def test_16_bit():
    """Works for read_u16 values too"""
    assert abs(adc_to_volts(32767.5, bits=16) - 1.65) < 1e-9

def test_battery():
    """A 100k/100k divider halves the voltage"""
    reading = 4095 * 1.9 / 3.3
    assert abs(battery_volts(reading, 100_000, 100_000) - 3.8) < 1e-9

def test_percent():
    """Linear between empty and full, clamped"""
    assert battery_percent(3.6) == 50
    assert battery_percent(4.5) == 100
    assert battery_percent(2.5) == 0

@@hint
`reading / (2 ** bits - 1) * vref`. For the battery, convert to volts first, then multiply by `(r1 + r2) / r2`.
:::

:::quiz emb-electronics-check Quick check
? Why does an LED need a series resistor?
- [ ] To make it brighter
- [x] To limit the current; otherwise it draws far too much and burns out
- [ ] To change its colour
> R = (V_supply − V_f) / I.

? A button connects GPIO 14 to ground and the pin has a pull-up. What does the pin read when the button is pressed?
- [x] 0
- [ ] 1
- [ ] A random value
> Pressing connects the pin to ground: "active low". Released, the pull-up makes it read 1.

? What's wrong with an input pin connected to nothing?
- [ ] Nothing
- [x] It floats and reads random values
- [ ] It always reads 1
> Use a pull-up or pull-down resistor (internal or external).

? A 12-bit ADC with a 3.3 V reference reads 2048. Roughly what voltage is that?
- [ ] 2.048 V
- [x] 1.65 V
- [ ] 3.3 V
> 2048 / 4095 × 3.3 ≈ 1.65 V.
:::
