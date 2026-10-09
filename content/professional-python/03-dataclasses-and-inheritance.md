---
title: Dataclasses, inheritance and special methods
summary: Write less boilerplate with dataclasses, share behaviour with inheritance, and make your objects work with Python's operators.
minutes: 55
kind: lesson
---

## Dataclasses: classes for holding data

Many classes mostly *hold data*. Writing `__init__`, `__repr__` and `__eq__` by hand for them is tedious. The `dataclass` decorator writes them for you from type-annotated fields:

```python
from dataclasses import dataclass

@dataclass
class Match:
    home: str
    away: str
    home_goals: int
    away_goals: int

    def result(self) -> str:
        if self.home_goals > self.away_goals:
            return "H"
        if self.home_goals < self.away_goals:
            return "A"
        return "D"


m = Match("Ashford City", "Bramley Rovers", 2, 1)
print(m)                                              # a free, readable __repr__
print(m.result())
print(m == Match("Ashford City", "Bramley Rovers", 2, 1))   # a free __eq__ compares fields
```

The `name: type` lines are **type hints**. The dataclass uses them to know which fields exist. (Python doesn't enforce the types at runtime. Lesson 6 covers type hints properly.)

### Defaults, frozen objects and computed fields

```python
from dataclasses import dataclass, field

@dataclass(frozen=True)                 # frozen: fields can't be changed after creation
class Odds:
    home: float
    draw: float
    away: float

    @property
    def margin(self) -> float:
        return 1 / self.home + 1 / self.draw + 1 / self.away - 1


@dataclass
class BetSlip:
    owner: str
    stakes: list[float] = field(default_factory=list)   # a fresh list for every slip
    currency: str = "GBP"

    def total(self) -> float:
        return sum(self.stakes)


o = Odds(2.1, 3.4, 3.6)
print(o, round(o.margin, 4))

a, b = BetSlip("Ada"), BetSlip("Alan")
a.stakes.append(10)
print(a, b)          # b has its own empty list
```

- `frozen=True` makes instances immutable (and usable as dictionary keys). Use it for values that shouldn't change, like a set of odds.
- `field(default_factory=list)` is the safe way to give a mutable default. Remember the shared default list trap from Phase 1?
- `@property` turns a method into something you read like an attribute: `o.margin`, not `o.margin()`. Use it for values computed from other fields.

Validation can go in `__post_init__`, which runs after the generated `__init__`:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Probability:
    value: float

    def __post_init__(self):
        if not 0 <= self.value <= 1:
            raise ValueError(f"probability must be in [0, 1], got {self.value}")

print(Probability(0.4))
try:
    Probability(1.4)
except ValueError as e:
    print(e)
```

## Inheritance

A class can **inherit** from another, reusing its attributes and methods and adding or changing some:

```python
class Model:
    """Base class: every model has a name and can describe itself."""

    def __init__(self, name):
        self.name = name

    def predict(self, home_rating, away_rating):
        raise NotImplementedError("subclasses must implement predict")

    def describe(self):
        return f"{self.name}: home win probability {self.predict(1600, 1500):.2f}"


class AlwaysHome(Model):
    def __init__(self):
        super().__init__("Always home")

    def predict(self, home_rating, away_rating):
        return 0.46          # the historical home win rate


class EloModel(Model):
    def __init__(self, home_advantage=60):
        super().__init__("Elo")
        self.home_advantage = home_advantage

    def predict(self, home_rating, away_rating):
        diff = home_rating + self.home_advantage - away_rating
        return 1 / (1 + 10 ** (-diff / 400))


for model in [AlwaysHome(), EloModel()]:
    print(model.describe())
```

- `class EloModel(Model):` means EloModel **is a** Model and gets all of Model's methods.
- `super().__init__(...)` calls the parent's initialiser so the shared setup runs.
- Both subclasses provide `predict`, so code that works with "any Model" (like `describe`) works with both. This idea, many classes sharing one interface, is called **polymorphism**.

This is exactly how scikit-learn is designed: every model has `fit` and `predict`, so you can swap a logistic regression for a random forest by changing one line.

:::tip Prefer composition
Inheritance is powerful but creates tight coupling. Deep hierarchies (A inherits B inherits C inherits D) get hard to follow. Often it's simpler for an object to *have* another object (composition) than to *be* one (inheritance). A `Backtest` that has a `model` attribute is usually cleaner than a `Backtest` that inherits from a model class.
:::

## Special (dunder) methods

Dunder methods let your objects work with Python's built-in syntax:

| You write | Python calls |
| --- | --- |
| `len(x)` | `x.__len__()` |
| `a + b` | `a.__add__(b)` |
| `a == b` | `a.__eq__(b)` |
| `a < b` | `a.__lt__(b)` (used by `sorted`) |
| `x[i]` | `x.__getitem__(i)` |
| `item in x` | `x.__contains__(item)` |
| `for v in x` | `x.__iter__()` |

```python
class Season:
    def __init__(self, name, matches):
        self.name = name
        self.matches = list(matches)

    def __len__(self):
        return len(self.matches)

    def __getitem__(self, index):
        return self.matches[index]

    def __iter__(self):
        return iter(self.matches)

    def __add__(self, other):
        return Season(f"{self.name}+{other.name}", self.matches + other.matches)


s1 = Season("2023-24", ["A v B", "C v D"])
s2 = Season("2024-25", ["B v A"])
both = s1 + s2
print(len(both), both[0], both.name)
for match in both:
    print(match)
```

Dataclasses can generate ordering methods too, with `@dataclass(order=True)`, which compares fields in order.

## Practice

:::exercise money-dataclass A Money value
Write a frozen dataclass `Money` with fields `amount: float` and `currency: str`:

- `__post_init__` raises `ValueError` if `currency` isn't exactly 3 uppercase letters (like `"GBP"`).
- `__add__(self, other)` returns a new `Money` with the summed amount. Raise `ValueError` if the currencies differ.
- `__str__` returns e.g. `"12.50 GBP"` (2 decimal places).

@@starter
from dataclasses import dataclass

@dataclass(frozen=True)
class Money:
    amount: float
    currency: str

@@solution
from dataclasses import dataclass

@dataclass(frozen=True)
class Money:
    amount: float
    currency: str

    def __post_init__(self):
        if not (len(self.currency) == 3 and self.currency.isalpha() and self.currency.isupper()):
            raise ValueError(f"invalid currency code: {self.currency!r}")

    def __add__(self, other):
        if self.currency != other.currency:
            raise ValueError("can't add different currencies")
        return Money(self.amount + other.amount, self.currency)

    def __str__(self):
        return f"{self.amount:.2f} {self.currency}"

@@tests
import math

def raises(fn):
    try:
        fn()
    except ValueError:
        return True
    return False

def test_add():
    """Adding returns a new Money"""
    total = Money(10, "GBP") + Money(2.5, "GBP")
    assert isinstance(total, Money) and math.isclose(total.amount, 12.5) and total.currency == "GBP"

def test_str():
    """str shows two decimals and the currency"""
    assert str(Money(12.5, "GBP")) == "12.50 GBP"

def test_currency_mismatch():
    """Different currencies can't be added"""
    assert raises(lambda: Money(1, "GBP") + Money(1, "EUR"))

def test_bad_currency():
    """Currency must be 3 uppercase letters"""
    assert raises(lambda: Money(1, "gbp"))
    assert raises(lambda: Money(1, "POUND"))

def test_frozen():
    """Money is immutable"""
    m = Money(1, "GBP")
    try:
        m.amount = 5
    except Exception:
        return
    raise AssertionError("assigning to a field should fail on a frozen dataclass")
:::

:::exercise model-hierarchy Two models, one interface
A base class `Predictor` is provided. Write two subclasses:

- `HomeBias(Predictor)`: `predict(home_goals_avg, away_goals_avg)` always returns `"H"`.
- `GoalsModel(Predictor)`: returns `"H"` if `home_goals_avg` is more than `margin` above `away_goals_avg`, `"A"` if it's more than `margin` below, otherwise `"D"`. `margin` is set in `__init__` (default `0.3`), and it should call `super().__init__("goals")`.

The base class's `accuracy` method must work for both without changes.

@@starter
class Predictor:
    def __init__(self, name):
        self.name = name

    def predict(self, home_goals_avg, away_goals_avg):
        raise NotImplementedError

    def accuracy(self, rows):
        """rows: list of (home_avg, away_avg, actual_result)"""
        correct = sum(self.predict(h, a) == actual for h, a, actual in rows)
        return correct / len(rows)

@@solution
class Predictor:
    def __init__(self, name):
        self.name = name

    def predict(self, home_goals_avg, away_goals_avg):
        raise NotImplementedError

    def accuracy(self, rows):
        """rows: list of (home_avg, away_avg, actual_result)"""
        correct = sum(self.predict(h, a) == actual for h, a, actual in rows)
        return correct / len(rows)


class HomeBias(Predictor):
    def __init__(self):
        super().__init__("home bias")

    def predict(self, home_goals_avg, away_goals_avg):
        return "H"


class GoalsModel(Predictor):
    def __init__(self, margin=0.3):
        super().__init__("goals")
        self.margin = margin

    def predict(self, home_goals_avg, away_goals_avg):
        diff = home_goals_avg - away_goals_avg
        if diff > self.margin:
            return "H"
        if diff < -self.margin:
            return "A"
        return "D"

@@tests
ROWS = [(1.8, 1.0, "H"), (1.1, 1.6, "A"), (1.3, 1.2, "D"), (1.5, 1.4, "H")]

def test_home_bias():
    """HomeBias always predicts H"""
    m = HomeBias()
    assert isinstance(m, Predictor)
    assert m.predict(0.5, 3.0) == "H"
    assert m.accuracy(ROWS) == 0.5

def test_goals_model():
    """GoalsModel uses the margin"""
    m = GoalsModel()
    assert isinstance(m, Predictor) and m.name == "goals"
    assert [m.predict(h, a) for h, a, _ in ROWS] == ["H", "A", "D", "D"]
    assert m.accuracy(ROWS) == 0.75

def test_custom_margin():
    """The margin can be changed"""
    assert GoalsModel(margin=0.05).predict(1.5, 1.4) == "H"
:::

:::quiz dataclass-quiz Quick check
? What does `@dataclass` generate for you?
- [x] `__init__`
- [x] `__repr__`
- [x] `__eq__`
- [ ] A database table
> And optionally ordering and hashing methods.

? Why use `field(default_factory=list)` instead of `= []`?
- [x] So each instance gets its own new list
- [ ] Because lists aren't allowed in dataclasses
- [ ] It's faster
> A plain `[]` default would be shared, and dataclasses refuse it with an error to protect you.

? What does `super().__init__(...)` do in a subclass?
- [x] Runs the parent class's initialiser
- [ ] Creates a new parent object
- [ ] Deletes the parent class
> It lets the subclass reuse the parent's setup code.

? Which dunder method makes `len(obj)` work?
- [ ] `__size__`
- [x] `__len__`
- [ ] `__count__`
> Python calls `obj.__len__()` behind the scenes.
:::
