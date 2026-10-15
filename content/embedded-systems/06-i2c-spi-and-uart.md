---
title: "Talking to chips: I2C, SPI and UART"
summary: Scan an I2C bus, read and write sensor registers, decode two's complement data, wake an accelerometer, and parse GPS sentences from a UART.
minutes: 65
kind: lesson
---

Sensors, displays, radios and GPS modules are chips of their own. The microcontroller talks to them over one of three serial protocols:

| | I2C | SPI | UART |
| --- | --- | --- | --- |
| Wires | 2 (SDA data, SCL clock) + ground | 4 (SCK, MOSI, MISO, CS) + ground | 2 (TX, RX) + ground |
| Devices | many on one bus, each with a 7-bit **address** | many, one **chip-select** wire each | one to one |
| Speed | 100 kHz – 1 MHz | 10+ MHz | 9600 – 115200 baud typically |
| Typical use | sensors (temperature, IMU), small OLED displays | SD cards, fast displays, radios | GPS, Bluetooth modules, PC serial |

## I2C: addresses and registers

Every I2C device has an address (from its datasheet), and most expose numbered **registers**: one register holds the temperature, another the configuration, and so on. Reading a sensor is "write the register number, then read some bytes back".

The simulated Pico has two devices on its I2C bus: a **TMP102** temperature sensor at `0x48` and an **MPU-6050** accelerometer and gyroscope at `0x68`. Start by scanning the bus, the first thing to do with any new circuit:

```python
from machine import I2C, Pin

i2c = I2C(0, scl=Pin(5), sda=Pin(4), freq=400_000)
print([hex(address) for address in i2c.scan()])
```

If a device you wired up doesn't appear, check the wiring and power before anything else.

## Reading a temperature sensor

The TMP102 datasheet says register `0x00` holds the temperature as a **12-bit two's complement** number, left-aligned in two bytes, at 0.0625 °C per step. So:

1. Read 2 bytes from register 0.
2. Combine them **big-endian** (most significant byte first) and shift right 4 bits to get the 12-bit value.
3. If bit 11 (the sign bit) is set, the number is negative: subtract 4096.
4. Multiply by 0.0625.

```python
from machine import I2C, Pin
import pico_sim

pico_sim.set_temperature(-7.25)          # simulator: a cold day

i2c = I2C(0, scl=Pin(5), sda=Pin(4))
data = i2c.readfrom_mem(0x48, 0x00, 2)  # 2 bytes from register 0 of device 0x48
print("raw bytes:", data.hex())

raw = (data[0] << 4) | (data[1] >> 4)   # 12 bits
if raw & 0x800:                          # sign bit set: negative
    raw -= 1 << 12
print(f"{raw * 0.0625} °C")
```

**Two's complement** is how every computer stores negative integers: for an n-bit number, values with the top bit set represent `value - 2^n`. You'll meet it in almost every sensor datasheet. Python's `int.from_bytes(data, "big", signed=True)` handles the common 16-bit case for you.

## Waking an accelerometer

Many devices start in a low-power sleep mode and must be configured first. The MPU-6050's register map says:

| Register | Name | Meaning |
| --- | --- | --- |
| `0x75` | WHO_AM_I | always reads `0x68`: a quick "is this the right chip?" check |
| `0x6B` | PWR_MGMT_1 | bit 6 = SLEEP (set after power-on). Write 0 to wake it. |
| `0x3B`–`0x40` | ACCEL_XOUT_H ... ACCEL_ZOUT_L | X, Y, Z acceleration: three signed 16-bit big-endian values |

At the default ±2 g range, 16384 counts = 1 g.

```python
from machine import I2C, Pin
import struct
import pico_sim

pico_sim.set_acceleration(0.0, 0.5, 0.866)      # board tilted 30° (gravity is 1 g)

i2c = I2C(0, scl=Pin(5), sda=Pin(4))
MPU = 0x68
print("WHO_AM_I:", hex(i2c.readfrom_mem(MPU, 0x75, 1)[0]))

print("asleep:", i2c.readfrom_mem(MPU, 0x3B, 6).hex())   # all zeros: still asleep
i2c.writeto_mem(MPU, 0x6B, b"\x00")                       # wake up

raw = i2c.readfrom_mem(MPU, 0x3B, 6)
x, y, z = struct.unpack(">hhh", raw)          # > big-endian, h signed 16-bit
print("counts:", x, y, z)
print("g:", [round(v / 16384, 3) for v in (x, y, z)])
```

`struct.unpack(">hhh", ...)` decodes three big-endian signed 16-bit numbers in one go. It works the same in MicroPython.

## SPI in brief

SPI is faster and simpler electrically: the controller drives a clock, and data flows both ways at once (MOSI out, MISO in) while that device's **chip-select** pin is held low. There are no addresses; the chip-select wire picks the device. In MicroPython:

```python static
from machine import SPI, Pin

spi = SPI(0, baudrate=10_000_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))
cs = Pin(17, Pin.OUT, value=1)

cs.value(0)                       # select the device
spi.write(b"\x9f")                # send a command (here: "read ID" for a flash chip)
chip_id = spi.read(3)             # read 3 bytes back
cs.value(1)                       # deselect
```

SPI drives the colour displays, SD cards and LoRa radios you might add later.

## UART and GPS

A **UART** sends bytes one bit at a time at an agreed speed (the **baud rate**), with no clock wire. Connect the GPS module's TX to the Pico's RX and vice versa. GPS modules send text lines called **NMEA sentences**, like:

```text
$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
```

Fields are comma-separated: time (12:35:19 UTC), latitude 48° 07.038' N, longitude 11° 31.000' E, fix quality 1 (GPS fix), 8 satellites, and so on. The two hex digits after `*` are a **checksum**: the XOR of every character between `$` and `*`. Always check it: serial lines pick up noise, and a corrupted position is worse than none.

```python
from machine import UART, Pin
import pico_sim

pico_sim.uart_feed(0, "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\r\n")

uart = UART(0, baudrate=9600, tx=Pin(0), rx=Pin(1))
line = uart.readline().decode().strip()
print(line)

body, checksum = line[1:].split("*")
calculated = 0
for ch in body:
    calculated ^= ord(ch)
print("checksum ok:", calculated == int(checksum, 16))

fields = body.split(",")
print("time", fields[1], "satellites", int(fields[7]))
```

## Practice

:::exercise emb-tmp102 Read the TMP102
Write `read_temperature(i2c, address=0x48)` that reads register 0 of a TMP102 and returns the temperature in °C, handling negative temperatures. Use `i2c.readfrom_mem`.

@@starter
def read_temperature(i2c, address=0x48):
    pass

@@solution
def read_temperature(i2c, address=0x48):
    data = i2c.readfrom_mem(address, 0x00, 2)
    raw = (data[0] << 4) | (data[1] >> 4)
    if raw & 0x800:
        raw -= 1 << 12
    return raw * 0.0625

@@tests
from machine import I2C, Pin
import pico_sim

def bus():
    return I2C(0, scl=Pin(5), sda=Pin(4))

def test_positive():
    """Reads a warm temperature"""
    pico_sim.set_temperature(23.5)
    assert read_temperature(bus()) == 23.5

def test_negative():
    """Handles two's complement for negative temperatures"""
    pico_sim.set_temperature(-12.0625)
    assert read_temperature(bus()) == -12.0625

def test_resolution():
    """Resolution is 0.0625 °C"""
    pico_sim.set_temperature(0.0625)
    assert read_temperature(bus()) == 0.0625

@@hint
`raw = (data[0] << 4) | (data[1] >> 4)` gives the 12-bit value. If `raw & 0x800` is non-zero, subtract 4096.
:::

:::exercise emb-mpu6050 An MPU-6050 driver
Write a class `MPU6050` with:

- `__init__(self, i2c, address=0x68)`: check `WHO_AM_I` (register `0x75`) is `0x68`, raising `OSError` otherwise, then wake the chip by writing `0` to register `0x6B`.
- `acceleration(self)`: read 6 bytes from `0x3B` and return `(x, y, z)` in g (16384 counts per g), each rounded to 3 decimal places.
- `tilt_degrees(self)`: the angle between the board's Z axis and vertical, `degrees(acos(z / magnitude))`, rounded to 1 decimal place.

@@starter
import math
import struct

class MPU6050:
    def __init__(self, i2c, address=0x68):
        pass

    def acceleration(self):
        pass

    def tilt_degrees(self):
        pass

@@solution
import math
import struct

class MPU6050:
    def __init__(self, i2c, address=0x68):
        self.i2c = i2c
        self.address = address
        who = i2c.readfrom_mem(address, 0x75, 1)[0]
        if who != 0x68:
            raise OSError(f"unexpected WHO_AM_I {who:#x}")
        i2c.writeto_mem(address, 0x6B, b"\x00")

    def acceleration(self):
        raw = self.i2c.readfrom_mem(self.address, 0x3B, 6)
        return tuple(round(v / 16384, 3) for v in struct.unpack(">hhh", raw))

    def tilt_degrees(self):
        x, y, z = self.acceleration()
        magnitude = math.sqrt(x * x + y * y + z * z)
        return round(math.degrees(math.acos(z / magnitude)), 1)

@@tests
from machine import I2C, Pin
import pico_sim

def make():
    return MPU6050(I2C(0, scl=Pin(5), sda=Pin(4)))

def test_wakes_and_reads():
    """Wakes the chip and reads acceleration in g"""
    pico_sim.set_acceleration(0.25, -0.5, 1.0)
    assert make().acceleration() == (0.25, -0.5, 1.0)

def test_tilt():
    """Flat is 0°, on its side is 90°"""
    pico_sim.set_acceleration(0.0, 0.0, 1.0)
    assert make().tilt_degrees() == 0.0
    pico_sim.set_acceleration(1.0, 0.0, 0.0)
    assert make().tilt_degrees() == 90.0

def test_wrong_chip():
    """Refuses a device with the wrong WHO_AM_I"""
    pico_sim.i2c_device(0x68).regs[0x75] = 0x70
    try:
        make()
    except OSError:
        return
    raise AssertionError("expected OSError for the wrong chip")

@@hint
In `__init__`, `i2c.readfrom_mem(address, 0x75, 1)[0]` is the WHO_AM_I byte. Wake with `i2c.writeto_mem(address, 0x6B, b"\x00")`.

@@hint
`struct.unpack(">hhh", raw)` decodes the three signed 16-bit values.
:::

:::exercise emb-nmea Parse GPS sentences
Write `parse_gga(line)` for a `$GPGGA` sentence. Return `None` if the line doesn't start with `$GPGGA`, has no `*`, or its checksum is wrong. Otherwise return a dict with:

- `"time"`: the time field as `"HH:MM:SS"`
- `"lat"` and `"lon"`: decimal degrees, rounded to 6 places. NMEA writes latitude as `ddmm.mmmm` and longitude as `dddmm.mmmm` (degrees, then minutes); decimal = degrees + minutes / 60, negative for `S` or `W`.
- `"satellites"`: an int

@@starter
def parse_gga(line):
    pass

@@solution
def parse_gga(line):
    line = line.strip()
    if not line.startswith("$GPGGA") or "*" not in line:
        return None
    body, checksum = line[1:].split("*", 1)
    calculated = 0
    for ch in body:
        calculated ^= ord(ch)
    try:
        if calculated != int(checksum, 16):
            return None
    except ValueError:
        return None
    f = body.split(",")

    def to_degrees(value, hemisphere, degree_digits):
        degrees = int(value[:degree_digits]) + float(value[degree_digits:]) / 60
        return round(-degrees if hemisphere in ("S", "W") else degrees, 6)

    return {
        "time": f"{f[1][0:2]}:{f[1][2:4]}:{f[1][4:6]}",
        "lat": to_degrees(f[2], f[3], 2),
        "lon": to_degrees(f[4], f[5], 3),
        "satellites": int(f[7]),
    }

@@tests
GOOD = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47"

def test_parses():
    """Parses a valid sentence"""
    assert parse_gga(GOOD) == {"time": "12:35:19", "lat": 48.1173, "lon": 11.516667, "satellites": 8}

def test_bad_checksum():
    """Rejects a corrupted sentence"""
    assert parse_gga(GOOD.replace("4807", "4817")) is None

def test_southern_western():
    """South and west are negative"""
    body = "GPGGA,000102,3352.000,S,15112.000,W,1,05,1.0,10.0,M,0.0,M,,"
    cs = 0
    for ch in body:
        cs ^= ord(ch)
    result = parse_gga(f"${body}*{cs:02X}\r\n")
    assert result["lat"] == -33.866667 and result["lon"] == -151.2, result

def test_other_sentences():
    """Ignores other sentence types and junk"""
    assert parse_gga("$GPRMC,123519,A,4807.038,N*6A") is None
    assert parse_gga("garbage") is None

@@hint
Split off the checksum with `line[1:].split("*", 1)` and XOR the `ord()` of every character of the body. Compare with `int(checksum, 16)`.

@@hint
For latitude `4807.038`: degrees are `int("48")`, minutes are `float("07.038")`. Longitude has three degree digits.
:::

:::quiz emb-protocols-check Quick check
? How does an I2C controller choose which device to talk to?
- [x] Each device has an address, sent at the start of every transfer
- [ ] With a separate chip-select wire per device
- [ ] It talks to all devices at once
> SPI uses chip-select wires; I2C uses addresses on a shared two-wire bus.

? A 16-bit two's complement register reads 0xFFF0. What value is it?
- [ ] 65520
- [x] −16
- [ ] 16
> 0xFFF0 = 65520, and 65520 − 65536 = −16.

? Why does the MPU-6050 read all zeros straight after power-on?
- [ ] It's broken
- [x] It starts in sleep mode; write 0 to PWR_MGMT_1 to wake it
- [ ] I2C needs a pull-down
> Datasheets always describe the power-on state; read that section first.

? What's the NMEA checksum for?
- [x] Detecting sentences corrupted on the serial line
- [ ] Encrypting the position
- [ ] Counting satellites
> Discard sentences whose XOR checksum doesn't match.
:::
