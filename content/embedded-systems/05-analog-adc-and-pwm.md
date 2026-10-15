---
title: "Analog in and out: ADC, filtering and PWM"
summary: Read sensors with the ADC, tame noise with moving averages and exponential filters, and use PWM to dim LEDs and position servos.
minutes: 55
kind: lesson
---

## Reading voltages with the ADC

The Pico has three ADC pins (GP26, GP27, GP28) plus an internal temperature sensor on channel 4. `read_u16()` returns 0 to 65535 for 0 to 3.3 V:

```python
from machine import ADC
import pico_sim

pico_sim.set_adc(26, 1.2)            # simulator: put 1.2 V on GP26 (e.g. from a potentiometer)

pot = ADC(26)                        # or ADC(0): channel 0 is GP26
raw = pot.read_u16()
volts = raw / 65535 * 3.3
print(raw, f"{volts:.3f} V")
```

The RP2040's internal temperature sensor gives a voltage that falls as the chip warms up. The datasheet's formula converts it:

```python
from machine import ADC
import pico_sim

pico_sim.set_core_temperature(31.0)   # simulator only

sensor = ADC(ADC.CORE_TEMP)           # channel 4
volts = sensor.read_u16() / 65535 * 3.3
celsius = 27 - (volts - 0.706) / 0.001721       # from the RP2040 datasheet
print(f"{celsius:.1f} °C")
```

It measures the chip's own temperature, not the room's (and it's not very accurate), but it's a handy sensor that needs no wiring.

## Noise

Real analog readings jitter: electrical noise, a wobbly power supply, the ADC's own imperfections. The simulator can add realistic noise:

```python
from machine import ADC
import time
import pico_sim

pico_sim.set_adc(26, 1.65, noise=0.03)      # 1.65 V with about ±30 mV of noise

adc = ADC(26)
readings = []
for _ in range(10):
    readings.append(round(adc.read_u16() / 65535 * 3.3, 3))
    time.sleep_ms(10)
print(readings)
```

If you used these raw readings to switch a heater on above 1.65 V, it would flicker on and off. Two fixes: **filter** the readings, and add **hysteresis** to decisions.

## Filtering

A **moving average** of the last N readings smooths noise but reacts slowly, and needs memory for N values. An **exponential moving average** (EMA) needs just one number:

$$
\text{smoothed} \leftarrow \text{smoothed} + \alpha \times (\text{reading} - \text{smoothed})
$$

A small α (like 0.1) is very smooth but slow; a large α (like 0.5) is fast but noisier. It's exactly the `ewm(alpha=...)` you used in pandas, computed one reading at a time.

```python
from machine import ADC
import time
import pico_sim

# a signal that steps from 1.0 V to 2.0 V after half a second, with noise
pico_sim.set_adc(26, lambda t: 1.0 if t < 0.5 else 2.0, noise=0.05)
adc = ADC(26)

smoothed = None
alpha = 0.2
for i in range(100):
    volts = adc.read_u16() / 65535 * 3.3
    smoothed = volts if smoothed is None else smoothed + alpha * (volts - smoothed)
    if i % 10 == 9:
        print(f"t={i * 10 + 10:>4} ms  raw {volts:.3f}  smoothed {smoothed:.3f}")
    time.sleep_ms(10)
```

**Hysteresis** means using two thresholds: switch on above 1.70 V, but only switch off below 1.60 V. Small wobbles around a single threshold no longer cause flicker. Thermostats work this way.

## PWM: analog-ish output

A digital pin can only be fully on or fully off. **Pulse-width modulation** switches it very fast, and the fraction of time it's on, the **duty cycle**, sets the average power. At 1 kHz, an LED at 25% duty looks a quarter as bright, and a motor runs at roughly a quarter speed.

```text
 duty 25%   ▔|____|▔|____|▔|____     average 0.83 V
 duty 75%   ▔▔▔|_|▔▔▔|_|▔▔▔|_|      average 2.48 V
```

```python
from machine import Pin, PWM
import time
import pico_sim

led = PWM(Pin(15), freq=1000)
for percent in (0, 10, 50, 100, 50, 0):         # fade up and down
    led.duty_u16(int(percent / 100 * 65535))
    time.sleep_ms(100)

print(pico_sim.pwm_history(15))
```

Our eyes perceive brightness logarithmically, so a linear fade looks like it jumps quickly to bright and then barely changes. Real projects apply **gamma correction**, `duty = (brightness ** 2.2)`, to make fades look smooth.

## Servos

A hobby servo motor reads its target angle from the **width** of a pulse sent 50 times a second (every 20 ms): about 0.5 ms means 0°, 1.5 ms means 90° and 2.5 ms means 180° (check your servo's datasheet; many use 1 to 2 ms).

```python
from machine import Pin, PWM
import pico_sim

servo = PWM(Pin(16), freq=50)

def set_angle(degrees):
    pulse_ns = 500_000 + degrees / 180 * 2_000_000     # 0.5 ms to 2.5 ms
    servo.duty_ns(int(pulse_ns))

for angle in (0, 90, 180):
    set_angle(angle)
    print(angle, "° ->", servo.duty_u16(), "/ 65535 duty")
print(pico_sim.pwm_duty(16))
```

Servos and motors draw more current than a GPIO pin can supply. Power them from a separate 5 V supply (with a shared ground); the GPIO pin only carries the signal.

## Practice

:::exercise emb-ema-filter An EMA filter with hysteresis
Write a class `Smoother` with:

- `__init__(self, alpha)`
- `update(self, value)`: updates and returns the smoothed value. The first value is used as-is.

Then write a class `Thermostat` with `__init__(self, on_above, off_below)` and `update(self, temperature)`, which returns whether the fan should be on. It turns on when the temperature goes **above** `on_above`, turns off when it goes **below** `off_below`, and otherwise keeps its current state. It starts off.

@@starter
class Smoother:
    def __init__(self, alpha):
        pass

    def update(self, value):
        pass


class Thermostat:
    def __init__(self, on_above, off_below):
        pass

    def update(self, temperature):
        pass

@@solution
class Smoother:
    def __init__(self, alpha):
        self.alpha = alpha
        self.value = None

    def update(self, value):
        if self.value is None:
            self.value = value
        else:
            self.value += self.alpha * (value - self.value)
        return self.value


class Thermostat:
    def __init__(self, on_above, off_below):
        self.on_above = on_above
        self.off_below = off_below
        self.on = False

    def update(self, temperature):
        if temperature > self.on_above:
            self.on = True
        elif temperature < self.off_below:
            self.on = False
        return self.on

@@tests
def test_first_value():
    """The first reading is used as-is"""
    assert Smoother(0.1).update(20.0) == 20.0

def test_smoothing():
    """Moves a fraction alpha toward each new reading"""
    s = Smoother(0.25)
    s.update(20.0)
    assert abs(s.update(24.0) - 21.0) < 1e-9
    assert abs(s.update(24.0) - 21.75) < 1e-9

def test_hysteresis():
    """The fan doesn't flicker between the thresholds"""
    t = Thermostat(on_above=28.0, off_below=26.0)
    temps = [25, 27, 28.5, 27.5, 26.5, 25.9, 27, 28.1]
    assert [t.update(x) for x in temps] == [False, False, True, True, True, False, False, True]

@@hint
`Smoother` stores `self.value = None` and replaces it with the first reading. `Thermostat` stores `self.on = False` and only changes it when a threshold is crossed.
:::

:::exercise emb-servo-and-dimmer Map sensors to outputs
Write:

- `servo_duty_u16(degrees, min_ms=0.5, max_ms=2.5, freq=50)`: the `duty_u16` value (0 to 65535, rounded to an int) for a servo angle from 0 to 180. Clamp the angle to that range first. The pulse width moves linearly from `min_ms` to `max_ms`, and the period is `1000 / freq` ms.
- `light_to_brightness(raw_u16)`: a night light. In the dark (low ADC readings) the LED is bright. Return a `duty_u16` equal to `65535 - raw_u16`, but squared for gamma correction: `int(65535 * (1 - raw_u16 / 65535) ** 2)`.

@@starter
def servo_duty_u16(degrees, min_ms=0.5, max_ms=2.5, freq=50):
    pass

def light_to_brightness(raw_u16):
    pass

@@solution
def servo_duty_u16(degrees, min_ms=0.5, max_ms=2.5, freq=50):
    degrees = max(0, min(180, degrees))
    pulse_ms = min_ms + degrees / 180 * (max_ms - min_ms)
    period_ms = 1000 / freq
    return round(pulse_ms / period_ms * 65535)

def light_to_brightness(raw_u16):
    return int(65535 * (1 - raw_u16 / 65535) ** 2)

@@tests
def test_servo_ends():
    """0° is 0.5 ms and 180° is 2.5 ms of a 20 ms period"""
    assert servo_duty_u16(0) == round(0.5 / 20 * 65535)
    assert servo_duty_u16(180) == round(2.5 / 20 * 65535)

def test_servo_middle_and_clamp():
    """90° is 1.5 ms, and angles are clamped"""
    assert servo_duty_u16(90) == round(1.5 / 20 * 65535)
    assert servo_duty_u16(-30) == servo_duty_u16(0)
    assert servo_duty_u16(200) == servo_duty_u16(180)

def test_brightness():
    """Bright in the dark, off in full light, gamma in between"""
    assert light_to_brightness(0) == 65535
    assert light_to_brightness(65535) == 0
    assert light_to_brightness(32768) == int(65535 * (1 - 32768 / 65535) ** 2)

@@hint
Pulse width: `min_ms + degrees / 180 * (max_ms - min_ms)`. Duty is the pulse width divided by the period (`1000 / freq` ms), times 65535.
:::

:::quiz emb-analog-check Quick check
? What does a 25% PWM duty cycle on a 3.3 V pin deliver on average?
- [ ] 3.3 V at quarter speed
- [x] About 0.83 V
- [ ] 25 mA
> The pin is fully on a quarter of the time: 0.25 × 3.3 V.

? An EMA with alpha = 0.05 versus alpha = 0.5. Which reacts faster to a real change?
- [ ] 0.05
- [x] 0.5
> Larger alpha follows new readings more closely, and lets more noise through.

? Why use two thresholds (hysteresis) for a thermostat?
- [x] So noise around a single threshold doesn't switch the output on and off rapidly
- [ ] To save memory
- [ ] Because the ADC has two channels
> It's the standard cure for flickering outputs.

? How is a hobby servo's angle set?
- [ ] By the PWM frequency
- [x] By the width of a pulse repeated every 20 ms
- [ ] By the voltage on its power wire
> About 0.5 to 2.5 ms (or 1 to 2 ms) covers its range.
:::
