"""A small Raspberry Pi Pico simulator for the embedded lessons.

Loaded after public/pyodide-harness.py by the browser worker and by
scripts/validate_content.py. It installs MicroPython-style modules so lesson
code can be written the way it runs on a real board:

    machine     Pin, PWM, ADC, I2C, UART, Timer, WDT, freq, lightsleep, ...
    micropython const, schedule, ...
    time        gains MicroPython's sleep_ms, sleep_us, ticks_ms, ticks_us, ticks_diff, ticks_add
    utime       alias of time

and a `pico_sim` module that lessons and tests use to control the simulated
world (press buttons, set sensor values, read back pin history).

Time is virtual: sleep_ms(1000) returns instantly but moves the simulated clock
forward by one second, firing any timers and pin interrupts that fall due. Every
hardware access moves the clock on by a few microseconds, so polling loops end.
The harness calls pico_sim.reset() before every run, so each cell starts with a
fresh board.
"""
import math as _math
import random as _random
import sys as _sys
import time as _time
import types as _types

_TICK_US = 10          # each hardware access or ticks_*() call costs 10 µs of virtual time
_VREF = 3.3
_PIN_NAMES = {"LED": 25}


class _World:
    def __init__(self):
        self.now_us = 0
        self.pins = {}           # id -> Pin (last constructed object for that id)
        self.levels = {}         # id -> current logic level
        self.history = {}        # id -> [(t_ms, value)]
        self.inputs = []         # scheduled (t_us, pin_id, value)
        self.timers = []
        self.adc_sources = {}    # channel -> (fn(t_s) -> volts, noise_volts)
        self.pwm = {}            # pin id -> PWM
        self.i2c_devices = {0x48: TMP102(), 0x68: MPU6050()}
        self.uart_rx = {}        # uart id -> bytearray waiting to be read
        self.uart_tx = {}        # uart id -> bytearray written by code
        self.wdt = None
        self.rng = _random.Random(1234)
        self.log = []
        self.trace = False
        self.in_callback = False


_world = None


def _now_ms():
    return _world.now_us // 1000


def _set_level(pin_id, value, source="code"):
    value = 1 if value else 0
    old = _world.levels.get(pin_id)
    if old == value:
        return
    _world.levels[pin_id] = value
    _world.history.setdefault(pin_id, []).append((_now_ms(), value))
    if _world.trace:
        print(f"[{_now_ms():>6} ms] GP{pin_id} -> {value}")
    pin = _world.pins.get(pin_id)
    if pin is not None and old is not None and pin._handler is not None and source == "input":
        rising = value == 1
        if (rising and pin._trigger & Pin.IRQ_RISING) or (not rising and pin._trigger & Pin.IRQ_FALLING):
            _run_callback(pin._handler, pin)


def _run_callback(fn, arg):
    if _world.in_callback:
        return
    _world.in_callback = True
    try:
        fn(arg)
    finally:
        _world.in_callback = False


def _advance(us):
    """Move the virtual clock forward, firing inputs and timers in time order."""
    target = _world.now_us + max(0, int(us))
    while True:
        next_input = min((e[0] for e in _world.inputs), default=None)
        next_timer = min((t._next_us for t in _world.timers if t._active), default=None)
        candidates = [t for t in (next_input, next_timer) if t is not None and t <= target]
        if not candidates or _world.in_callback:
            break
        when = min(candidates)
        _world.now_us = max(_world.now_us, when)
        if next_input is not None and next_input == when:
            due = [e for e in _world.inputs if e[0] == when]
            _world.inputs = [e for e in _world.inputs if e[0] != when]
            for _, pin_id, value in due:
                _set_level(pin_id, value, source="input")
        else:
            for timer in [t for t in _world.timers if t._active and t._next_us == when]:
                if timer._mode == Timer.ONE_SHOT:
                    timer._active = False
                else:
                    timer._next_us += timer._period_us
                _run_callback(timer._callback, timer)
        _check_watchdog()
    _world.now_us = max(_world.now_us, target)
    _check_watchdog()


def _check_watchdog():
    wdt = _world.wdt
    if wdt is not None and _world.now_us - wdt._fed_us > wdt._timeout_us:
        _world.wdt = None
        raise WatchdogReset(
            f"Watchdog reset at {_now_ms()} ms: feed() wasn't called within {wdt._timeout_us // 1000} ms"
        )


def _tick():
    _advance(_TICK_US)


class WatchdogReset(Exception):
    """Raised when the simulated watchdog timer resets the board."""


# ------------------------------------------------------------------ machine


class Pin:
    IN = 0
    OUT = 1
    OPEN_DRAIN = 2
    PULL_UP = 1
    PULL_DOWN = 2
    IRQ_FALLING = 4
    IRQ_RISING = 8

    def __init__(self, id, mode=-1, pull=None, value=None):
        if isinstance(id, str):
            if id not in _PIN_NAMES:
                raise ValueError(f"unknown pin name {id!r}")
            id = _PIN_NAMES[id]
        if not isinstance(id, int) or not 0 <= id <= 29:
            raise ValueError("invalid pin: the Pico has GP0 to GP29")
        self._id = id
        self._handler = None
        self._trigger = 0
        _world.pins[id] = self
        self.init(mode, pull, value)

    def init(self, mode=-1, pull=None, value=None):
        if mode != -1:
            self._mode = mode
        elif not hasattr(self, "_mode"):
            self._mode = Pin.IN
        self._pull = pull
        if self._id not in _world.levels:
            default = 1 if pull == Pin.PULL_UP else 0
            _world.levels[self._id] = default
            _world.history.setdefault(self._id, []).append((_now_ms(), default))
        if value is not None:
            _set_level(self._id, value)

    def value(self, v=None):
        _tick()
        if v is None:
            return _world.levels.get(self._id, 0)
        if self._mode == Pin.IN:
            return None
        _set_level(self._id, v)

    def __call__(self, v=None):
        return self.value(v)

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)

    def high(self):
        self.value(1)

    def low(self):
        self.value(0)

    def toggle(self):
        self.value(0 if _world.levels.get(self._id, 0) else 1)

    def irq(self, handler=None, trigger=IRQ_FALLING | IRQ_RISING, hard=False):
        self._handler = handler
        self._trigger = trigger

    def __repr__(self):
        mode = {0: "IN", 1: "OUT", 2: "OPEN_DRAIN"}.get(self._mode, "?")
        return f"Pin(GPIO{self._id}, mode={mode})"


class Signal:
    def __init__(self, pin, invert=False):
        self._pin = pin
        self._invert = invert

    def value(self, v=None):
        if v is None:
            return self._pin.value() ^ self._invert
        self._pin.value(bool(v) ^ self._invert)

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)


class PWM:
    def __init__(self, pin, freq=None, duty_u16=None, duty_ns=None):
        self._pin = pin
        self._freq = 1000
        self._duty = 0
        self.history = [(_now_ms(), 0)]
        _world.pwm[pin._id] = self
        if freq is not None:
            self.freq(freq)
        if duty_u16 is not None:
            self.duty_u16(duty_u16)
        if duty_ns is not None:
            self.duty_ns(duty_ns)

    def freq(self, value=None):
        if value is None:
            return self._freq
        if not 8 <= value <= 62_500_000:
            raise ValueError("freq out of range: the Pico's PWM runs from 8 Hz to 62.5 MHz")
        self._freq = int(value)

    def duty_u16(self, value=None):
        if value is None:
            return self._duty
        if not 0 <= value <= 65535:
            raise ValueError("duty_u16 must be between 0 and 65535")
        self._duty = int(value)
        self.history.append((_now_ms(), self._duty))
        _tick()

    def duty_ns(self, value=None):
        period_ns = 1_000_000_000 / self._freq
        if value is None:
            return round(self._duty / 65535 * period_ns)
        self.duty_u16(round(min(value, period_ns) / period_ns * 65535))

    def deinit(self):
        self.duty_u16(0)


class ADC:
    CORE_TEMP = 4

    def __init__(self, pin):
        if isinstance(pin, Pin):
            pin = pin._id
        if pin in (26, 27, 28, 29):
            self._channel = pin - 26
        elif pin in (0, 1, 2, 3, 4):
            self._channel = pin
        else:
            raise ValueError("ADC needs GP26, GP27, GP28 or channel 0-4")

    def read_u16(self):
        _tick()
        if self._channel == 4:
            volts = 0.706 - (_core_temp - 27) * 0.001721
            noise = 0.0
        else:
            fn, noise = _world.adc_sources.get(self._channel, (lambda t: 0.0, 0.0))
            volts = fn(_world.now_us / 1_000_000)
        if noise:
            volts += _world.rng.gauss(0, noise)
        volts = min(max(volts, 0.0), _VREF)
        # The Pico's ADC is 12-bit; read_u16 scales it to 16 bits.
        raw12 = round(volts / _VREF * 4095)
        return raw12 << 4 | raw12 >> 8


class I2C:
    def __init__(self, id=0, scl=None, sda=None, freq=400_000):
        self._id = id
        self._freq = freq
        self._pointer = {}

    def scan(self):
        _tick()
        return sorted(_world.i2c_devices)

    def _device(self, addr):
        _tick()
        dev = _world.i2c_devices.get(addr)
        if dev is None:
            raise OSError(19, "ENODEV: no I2C device answered at address " + hex(addr))
        return dev

    def readfrom_mem(self, addr, memaddr, nbytes, addrsize=8):
        dev = self._device(addr)
        return bytes(dev.read(memaddr + i) for i in range(nbytes))

    def readfrom_mem_into(self, addr, memaddr, buf, addrsize=8):
        data = self.readfrom_mem(addr, memaddr, len(buf))
        buf[:] = data

    def writeto_mem(self, addr, memaddr, buf, addrsize=8):
        dev = self._device(addr)
        for i, b in enumerate(bytes(buf)):
            dev.write(memaddr + i, b)

    def writeto(self, addr, buf, stop=True):
        dev = self._device(addr)
        data = bytes(buf)
        if data:
            self._pointer[addr] = data[0]
            for i, b in enumerate(data[1:]):
                dev.write(data[0] + i, b)
        return 1

    def readfrom(self, addr, nbytes, stop=True):
        dev = self._device(addr)
        start = self._pointer.get(addr, 0)
        return bytes(dev.read(start + i) for i in range(nbytes))


class SoftI2C(I2C):
    pass


class UART:
    def __init__(self, id, baudrate=115200, tx=None, rx=None, bits=8, parity=None, stop=1, timeout=0):
        self._id = id
        self._baud = baudrate
        _world.uart_rx.setdefault(id, bytearray())
        _world.uart_tx.setdefault(id, bytearray())

    def init(self, baudrate=115200, **kwargs):
        self._baud = baudrate

    def write(self, buf):
        if isinstance(buf, str):
            buf = buf.encode()
        _world.uart_tx[self._id].extend(buf)
        # 10 bits per byte on the wire (start + 8 data + stop)
        _advance(len(buf) * 10 * 1_000_000 // self._baud)
        return len(buf)

    def any(self):
        _tick()
        return len(_world.uart_rx[self._id])

    def read(self, nbytes=None):
        _tick()
        rx = _world.uart_rx[self._id]
        if not rx:
            return None
        n = len(rx) if nbytes is None else min(nbytes, len(rx))
        data = bytes(rx[:n])
        del rx[:n]
        return data

    def readline(self):
        _tick()
        rx = _world.uart_rx[self._id]
        if not rx:
            return None
        end = rx.find(b"\n")
        n = len(rx) if end == -1 else end + 1
        data = bytes(rx[:n])
        del rx[:n]
        return data


class Timer:
    ONE_SHOT = 0
    PERIODIC = 1

    def __init__(self, id=-1, mode=PERIODIC, period=-1, freq=-1, callback=None):
        self._active = False
        _world.timers.append(self)
        if callback is not None:
            self.init(mode=mode, period=period, freq=freq, callback=callback)

    def init(self, mode=PERIODIC, period=-1, freq=-1, callback=None, tick_hz=1000):
        if freq > 0:
            period_us = round(1_000_000 / freq)
        elif period > 0:
            period_us = round(period * 1_000_000 / tick_hz)
        else:
            raise ValueError("Timer needs period= (ms) or freq= (Hz)")
        self._mode = mode
        self._period_us = period_us
        self._callback = callback
        self._next_us = _world.now_us + period_us
        self._active = True

    def deinit(self):
        self._active = False


class WDT:
    def __init__(self, id=0, timeout=5000):
        if not 1 <= timeout <= 8388:
            raise ValueError("the Pico's watchdog timeout must be 1 to 8388 ms")
        self._timeout_us = timeout * 1000
        self._fed_us = _world.now_us
        _world.wdt = self

    def feed(self):
        self._fed_us = _world.now_us


_core_temp = 25.0


def freq(hz=None):
    return 125_000_000 if hz is None else None


def unique_id():
    return b"\xe6\x61\x38\x52\x83\x2c\x5a\x28"


def lightsleep(ms=None):
    _world.log.append((_now_ms(), "lightsleep", ms))
    _advance((ms or 0) * 1000)


def deepsleep(ms=None):
    _world.log.append((_now_ms(), "deepsleep", ms))
    _advance((ms or 0) * 1000)


def idle():
    _tick()


def disable_irq():
    return 0


def enable_irq(state=0):
    return None


def reset_cause():
    return 1


# ------------------------------------------------------------------ simulated I2C devices


class I2CDevice:
    """Base class for simulated register-based devices. Subclass and override read/write."""

    def __init__(self):
        self.regs = bytearray(256)

    def read(self, reg):
        return self.regs[reg & 0xFF]

    def write(self, reg, value):
        self.regs[reg & 0xFF] = value & 0xFF


def _int16_bytes(value):
    value = max(-32768, min(32767, int(round(value))))
    value &= 0xFFFF
    return value >> 8, value & 0xFF


class TMP102(I2CDevice):
    """Texas Instruments TMP102 temperature sensor at 0x48 (register 0 = temperature)."""

    def __init__(self):
        super().__init__()
        self.temperature = 21.5          # °C, or a function of time in seconds
        self.regs[1], self.regs[2] = 0x60, 0xA0

    def _celsius(self):
        t = self.temperature
        return t(_world.now_us / 1_000_000) if callable(t) else t

    def read(self, reg):
        if reg in (0, 1):
            raw = round(self._celsius() / 0.0625) & 0xFFF   # 12-bit two's complement
            word = raw << 4
            return word >> 8 if reg == 0 else word & 0xFF
        if reg in (2, 3):
            return self.regs[reg - 1]
        return 0

    def write(self, reg, value):
        if reg in (2, 3):
            self.regs[reg - 1] = value & 0xFF


class MPU6050(I2CDevice):
    """InvenSense MPU-6050 accelerometer/gyro at 0x68. Wakes when 0 is written to PWR_MGMT_1 (0x6B)."""

    WHO_AM_I = 0x75
    PWR_MGMT_1 = 0x6B
    ACCEL_XOUT_H = 0x3B

    def __init__(self):
        super().__init__()
        self.regs[self.WHO_AM_I] = 0x68
        self.regs[self.PWR_MGMT_1] = 0x40          # asleep after power-on
        self.acceleration = (0.0, 0.0, 1.0)       # g, or a function of time returning (x, y, z)
        self.gyro = (0.0, 0.0, 0.0)               # degrees per second
        self.temperature = 24.0

    def _data_registers(self):
        acc = self.acceleration
        acc = acc(_world.now_us / 1_000_000) if callable(acc) else acc
        values = [a * 16384 for a in acc]                     # ±2 g range
        values.append((self.temperature - 36.53) * 340)
        values += [g * 131 for g in self.gyro]                # ±250 °/s range
        out = []
        for v in values:
            out.extend(_int16_bytes(v))
        return out

    def read(self, reg):
        if 0x3B <= reg <= 0x48:
            if self.regs[self.PWR_MGMT_1] & 0x40:
                return 0                                       # still asleep: no new samples
            return self._data_registers()[reg - 0x3B]
        return self.regs[reg]


# ------------------------------------------------------------------ pico_sim: control the world


def reset():
    """Start a fresh simulated board (the harness does this before every run)."""
    global _world, _core_temp
    _world = _World()
    _core_temp = 25.0


def now_ms():
    """The simulated time in milliseconds since the board started."""
    return _now_ms()


def history(pin):
    """[(time_ms, value), ...] for every change of a pin's level."""
    if isinstance(pin, Pin):
        pin = pin._id
    return list(_world.history.get(_PIN_NAMES.get(pin, pin), []))


def level(pin):
    if isinstance(pin, Pin):
        pin = pin._id
    return _world.levels.get(_PIN_NAMES.get(pin, pin), 0)


def waveform(pin, until_ms=None, step_ms=100):
    """Draw a pin's history as text: one character per step_ms."""
    events = history(pin)
    if not events:
        return f"GP{pin}: (never used)"
    end = _now_ms() if until_ms is None else until_ms
    chars = []
    t = 0
    while t < max(end, step_ms):
        value = 0
        for when, v in events:
            if when <= t:
                value = v
        chars.append("█" if value else "▁")
        t += step_ms
    name = pin._id if isinstance(pin, Pin) else pin
    return f"GP{name} {''.join(chars)}"


def press(pin, at_ms, hold_ms=100, active_low=True, bounce=False):
    """Schedule a button press on an input pin. Buttons usually pull the pin low (active_low)."""
    if isinstance(pin, Pin):
        pin = pin._id
    down, up = (0, 1) if active_low else (1, 0)
    start = int(at_ms * 1000)
    if bounce:
        # A real switch chatters for a few milliseconds when it closes and opens.
        for i in range(4):
            set_input(pin, down if i % 2 == 0 else up, at_us=start + i * 300)
        set_input(pin, down, at_us=start + 1500)
        end = start + int(hold_ms * 1000)
        for i in range(4):
            set_input(pin, up if i % 2 == 0 else down, at_us=end + i * 300)
        set_input(pin, up, at_us=end + 1500)
    else:
        set_input(pin, down, at_us=start)
        set_input(pin, up, at_us=start + int(hold_ms * 1000))


def set_input(pin, value, at_ms=None, at_us=None):
    """Drive an input pin from outside (now, or at a future time)."""
    if isinstance(pin, Pin):
        pin = pin._id
    when = _world.now_us if at_ms is None and at_us is None else (at_us if at_us is not None else int(at_ms * 1000))
    if when <= _world.now_us:
        _set_level(pin, value, source="input")
    else:
        _world.inputs.append((when, pin, 1 if value else 0))


def set_adc(pin, volts, noise=0.0):
    """Set the voltage on an ADC pin: a number, or a function of time in seconds. noise is a standard deviation in volts."""
    if isinstance(pin, Pin):
        pin = pin._id
    channel = pin - 26 if pin >= 26 else pin
    fn = volts if callable(volts) else (lambda t, v=float(volts): v)
    _world.adc_sources[channel] = (fn, noise)


def set_core_temperature(celsius):
    global _core_temp
    _core_temp = celsius


def set_temperature(celsius):
    """Temperature seen by the TMP102 at 0x48 (a number, or a function of time in seconds)."""
    _world.i2c_devices[0x48].temperature = celsius


def set_acceleration(x, y=None, z=None):
    """Acceleration in g seen by the MPU-6050 at 0x68. Pass x, y, z or one function of time returning a tuple."""
    _world.i2c_devices[0x68].acceleration = x if callable(x) else (x, y, z)


def add_i2c_device(address, device):
    _world.i2c_devices[address] = device


def remove_i2c_device(address):
    _world.i2c_devices.pop(address, None)


def i2c_device(address):
    return _world.i2c_devices[address]


def uart_feed(uart_id, data):
    """Bytes arriving on a UART's RX pin (e.g. from a GPS module)."""
    if isinstance(data, str):
        data = data.encode()
    _world.uart_rx.setdefault(uart_id, bytearray()).extend(data)


def uart_output(uart_id):
    """Everything the code has written to a UART, as text."""
    return bytes(_world.uart_tx.get(uart_id, b"")).decode(errors="replace")


def pwm_duty(pin):
    if isinstance(pin, Pin):
        pin = pin._id
    p = _world.pwm.get(pin)
    return None if p is None else p._duty


def pwm_history(pin):
    if isinstance(pin, Pin):
        pin = pin._id
    p = _world.pwm.get(pin)
    return [] if p is None else list(p.history)


def trace(enabled=True):
    """Print every output pin change as it happens."""
    _world.trace = enabled


def events():
    """Sleep events: [(time_ms, 'lightsleep' | 'deepsleep', ms)]."""
    return list(_world.log)


# ------------------------------------------------------------------ time additions


def sleep_ms(ms):
    _advance(int(ms) * 1000)


def sleep_us(us):
    _advance(int(us))


def ticks_ms():
    _tick()
    return (_world.now_us // 1000) & 0x3FFFFFFF


def ticks_us():
    _tick()
    return _world.now_us & 0x3FFFFFFF


def ticks_cpu():
    return ticks_us()


def ticks_add(ticks, delta):
    return (ticks + delta) & 0x3FFFFFFF


def ticks_diff(end, start):
    half = 0x40000000 // 2
    return ((end - start + half) & 0x3FFFFFFF) - half


# ------------------------------------------------------------------ install the modules


def _install():
    g = globals()
    machine = _types.ModuleType("machine", "Simulated MicroPython machine module (Raspberry Pi Pico)")
    for name in ("Pin", "Signal", "PWM", "ADC", "I2C", "SoftI2C", "UART", "Timer", "WDT", "freq", "unique_id",
                 "lightsleep", "deepsleep", "idle", "disable_irq", "enable_irq", "reset_cause"):
        setattr(machine, name, g[name])

    def machine_reset():
        raise SystemExit("machine.reset(): the board would restart here")

    machine.reset = machine_reset

    sim = _types.ModuleType("pico_sim", "Control the simulated Raspberry Pi Pico (not part of MicroPython)")
    for name in ("reset", "now_ms", "history", "level", "waveform", "press", "set_input", "set_adc",
                 "set_core_temperature", "set_temperature", "set_acceleration", "add_i2c_device",
                 "remove_i2c_device", "i2c_device", "uart_feed", "uart_output", "pwm_duty", "pwm_history",
                 "trace", "events", "I2CDevice", "TMP102", "MPU6050", "WatchdogReset"):
        setattr(sim, name, g[name])

    upy = _types.ModuleType("micropython")
    upy.const = lambda x: x
    upy.schedule = lambda fn, arg: fn(arg)
    upy.alloc_emergency_exception_buf = lambda n: None
    upy.mem_info = lambda *a: print("stack: 532 out of 7936\nGC: total: 233024, used: 9248, free: 223776")
    upy.opt_level = lambda *a: 0

    for name in ("sleep_ms", "sleep_us", "ticks_ms", "ticks_us", "ticks_cpu", "ticks_add", "ticks_diff"):
        setattr(_time, name, g[name])

    import gc as _gc
    if not hasattr(_gc, "mem_free"):
        _gc.mem_free = lambda: 223_776
        _gc.mem_alloc = lambda: 9_248

    _sys.modules["machine"] = machine
    _sys.modules["pico_sim"] = sim
    _sys.modules["micropython"] = upy
    _sys.modules["utime"] = _time
    reset()


_install()
