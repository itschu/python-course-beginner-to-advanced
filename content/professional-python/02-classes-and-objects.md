---
title: Classes and objects
summary: Bundle data and behaviour together with classes, the foundation of how libraries like pandas and scikit-learn are built.
minutes: 55
kind: lesson
---

Every value in Python is an **object**: a bundle of data plus the operations that work on it. A string has data (its characters) and methods (`upper`, `split`). A **class** is a blueprint for making your own kinds of object.

Why bother? Because when you meet scikit-learn, you'll write `model = LogisticRegression()` then `model.fit(X, y)` and `model.predict(X)`. That's a class, an object, and methods. Understanding them turns libraries from magic into tools.

## Your first class

```python
class Bet:
    def __init__(self, selection, stake, odds):
        self.selection = selection
        self.stake = stake
        self.odds = odds

    def potential_return(self):
        return self.stake * self.odds

    def profit_if_won(self):
        return self.stake * (self.odds - 1)


bet = Bet("Ashford City", 10, 2.5)     # create an object (an "instance")
print(bet.selection, bet.stake, bet.odds)
print(bet.potential_return())
print(bet.profit_if_won())

another = Bet("Draw", 5, 3.4)          # a second, independent instance
print(another.potential_return())
```

- `class Bet:` defines the class. By convention, class names use `CapitalisedWords`.
- `__init__` (with two underscores each side) is the **initialiser**. It runs automatically when you create an object and sets up its data.
- `self` is the object itself. `self.stake = stake` stores the value as an **attribute** on this particular object.
- Functions defined inside a class are **methods**. They always take `self` first, so they can use the object's data. When you call `bet.potential_return()`, Python passes `bet` as `self` automatically.

## Changing state

Methods can change an object's attributes. That's what makes objects good at modelling things that evolve over time:

```python
class Bankroll:
    def __init__(self, starting_amount):
        self.balance = starting_amount
        self.history = [starting_amount]

    def record(self, profit):
        self.balance += profit
        self.history.append(self.balance)

    def peak(self):
        return max(self.history)

    def drawdown(self):
        """How far below its peak the bankroll is now."""
        return self.peak() - self.balance


bank = Bankroll(100)
for p in [15, -10, -10, 25, -30]:
    bank.record(p)
print(bank.balance, bank.history)
print("Peak:", bank.peak(), "Drawdown:", bank.drawdown())
```

## Printing objects nicely: `__repr__`

By default, printing an object isn't very helpful:

```python
class Team:
    def __init__(self, name, rating):
        self.name = name
        self.rating = rating

print(Team("Ashford City", 1540))
```

Define `__repr__` to control how it's shown. Aim for something that looks like the code that would recreate it:

```python
class Team:
    def __init__(self, name, rating):
        self.name = name
        self.rating = rating

    def __repr__(self):
        return f"Team(name={self.name!r}, rating={self.rating})"

    def __str__(self):
        return f"{self.name} ({self.rating})"

t = Team("Ashford City", 1540)
print(repr(t))
print(t)            # print uses __str__ if it exists
print([t])          # lists show their items' repr
```

Methods with double underscores are called **dunder methods** ("double underscore"). Python calls them for you in special situations. You'll meet more in the next lesson.

## Class attributes

Attributes defined directly in the class body are shared by every instance. They're good for constants:

```python
class EloRating:
    K = 20              # shared by all instances
    START = 1500

    def __init__(self):
        self.rating = self.START

    def expected_score(self, opponent):
        return 1 / (1 + 10 ** ((opponent.rating - self.rating) / 400))

    def update(self, opponent, actual_score):
        expected = self.expected_score(opponent)
        self.rating += self.K * (actual_score - expected)


a, b = EloRating(), EloRating()
a.update(b, 1)          # a beats b
b.update(a, 0)
print(round(a.rating, 1), round(b.rating, 1))
```

That's the Elo rating system, which ranks chess players and, as you'll see in Phase 6, makes a great feature for football models.

## Validation in `__init__`

An object should never be in an invalid state. Check inputs when it's created:

```python
class Bet:
    def __init__(self, selection, stake, odds):
        if stake <= 0:
            raise ValueError(f"stake must be positive, got {stake}")
        if odds <= 1:
            raise ValueError(f"odds must be greater than 1, got {odds}")
        self.selection = selection
        self.stake = stake
        self.odds = odds

try:
    Bet("Ashford City", -5, 2.0)
except ValueError as e:
    print("Rejected:", e)
```

## When to use a class

Use a class when some data and the functions that work on it belong together, especially when there's state that changes (a bankroll, a model being trained, a connection to a database). Don't force everything into classes: plain functions are often simpler and better. Python lets you mix both freely.

## Practice

:::exercise counter-class A click counter
Write a class `Counter` with:

- `__init__(self, start=0)` storing the count in `self.count`
- `increment(self, by=1)` adding `by` to the count
- `reset(self)` setting the count back to the starting value

@@starter
class Counter:
    pass

@@solution
class Counter:
    def __init__(self, start=0):
        self.start = start
        self.count = start

    def increment(self, by=1):
        self.count += by

    def reset(self):
        self.count = self.start

@@tests
def test_default_start():
    """Starts at 0 by default"""
    assert Counter().count == 0

def test_increment():
    """increment adds 1, or `by`"""
    c = Counter()
    c.increment()
    c.increment(5)
    assert c.count == 6

def test_custom_start_and_reset():
    """reset returns to the starting value"""
    c = Counter(10)
    c.increment(3)
    c.reset()
    assert c.count == 10

def test_independent():
    """Two counters don't share a count"""
    a, b = Counter(), Counter()
    a.increment()
    assert b.count == 0

@@hint
Store the starting value as an attribute too (e.g. `self.start`) so `reset` knows what to go back to.
:::

:::exercise bet-class A Bet class
Write a class `Bet` with:

- `__init__(self, selection, stake, odds)`: raise `ValueError` if `stake <= 0` or `odds <= 1`. Store all three, and set `self.result = None` (not settled yet).
- `settle(self, won)`: set `self.result` to `"won"` or `"lost"`. Raise `ValueError` if the bet has already been settled.
- `profit(self)`: `stake * (odds - 1)` if won, `-stake` if lost, and `0` if not settled yet.
- `__repr__`: return e.g. `Bet('Draw', stake=10, odds=3.4, result=None)`.

@@starter
class Bet:
    def __init__(self, selection, stake, odds):
        pass

@@solution
class Bet:
    def __init__(self, selection, stake, odds):
        if stake <= 0:
            raise ValueError("stake must be positive")
        if odds <= 1:
            raise ValueError("odds must be greater than 1")
        self.selection = selection
        self.stake = stake
        self.odds = odds
        self.result = None

    def settle(self, won):
        if self.result is not None:
            raise ValueError("bet already settled")
        self.result = "won" if won else "lost"

    def profit(self):
        if self.result == "won":
            return self.stake * (self.odds - 1)
        if self.result == "lost":
            return -self.stake
        return 0

    def __repr__(self):
        return f"Bet({self.selection!r}, stake={self.stake}, odds={self.odds}, result={self.result!r})"

@@tests
import math

def raises(fn):
    try:
        fn()
    except ValueError:
        return True
    return False

def test_validation():
    """Rejects bad stakes and odds"""
    assert raises(lambda: Bet("A", 0, 2.0))
    assert raises(lambda: Bet("A", 10, 1.0))

def test_profit():
    """Profit depends on the result"""
    b = Bet("Ashford", 10, 2.5)
    assert b.profit() == 0
    b.settle(True)
    assert math.isclose(b.profit(), 15)
    lost = Bet("Draw", 4, 3.4)
    lost.settle(False)
    assert lost.profit() == -4

def test_cannot_settle_twice():
    """Settling twice raises ValueError"""
    b = Bet("A", 10, 2.0)
    b.settle(True)
    assert raises(lambda: b.settle(False))

def test_repr():
    """Has a helpful repr"""
    assert repr(Bet("Draw", 10, 3.4)) == "Bet('Draw', stake=10, odds=3.4, result=None)", f"got {Bet('Draw', 10, 3.4)!r}"

@@hint
`{self.selection!r}` inside an f-string adds the quotes around the string, like `repr()` does.
:::

:::exercise elo-class Elo league
Complete the `League` class. It keeps an Elo rating for each team (starting at 1500) and updates them after each match:

- expected score of A against B: $E_A = 1 / (1 + 10^{(R_B - R_A)/400})$
- actual score: 1 for a win, 0.5 for a draw, 0 for a loss
- new rating: $R_A + K \times (\text{actual} - E_A)$, and the same for B with its own expected and actual scores, using the ratings from **before** the match.

`rating(team)` returns a team's rating (1500 if it hasn't played).

@@starter
class League:
    K = 20

    def __init__(self):
        self.ratings = {}

    def rating(self, team):
        return 1500

    def record(self, home, away, home_goals, away_goals):
        pass

@@solution
class League:
    K = 20

    def __init__(self):
        self.ratings = {}

    def rating(self, team):
        return self.ratings.get(team, 1500)

    def record(self, home, away, home_goals, away_goals):
        ra, rb = self.rating(home), self.rating(away)
        expected_a = 1 / (1 + 10 ** ((rb - ra) / 400))
        if home_goals > away_goals:
            actual_a = 1
        elif home_goals < away_goals:
            actual_a = 0
        else:
            actual_a = 0.5
        self.ratings[home] = ra + self.K * (actual_a - expected_a)
        self.ratings[away] = rb + self.K * ((1 - actual_a) - (1 - expected_a))

@@tests
import math

def test_new_team():
    """Unknown teams are rated 1500"""
    assert League().rating("Anyone") == 1500

def test_first_win():
    """A win between equal teams moves ratings by K/2"""
    lg = League()
    lg.record("A", "B", 2, 0)
    assert math.isclose(lg.rating("A"), 1510)
    assert math.isclose(lg.rating("B"), 1490)

def test_draw_between_equals():
    """A draw between equal teams changes nothing"""
    lg = League()
    lg.record("A", "B", 1, 1)
    assert math.isclose(lg.rating("A"), 1500) and math.isclose(lg.rating("B"), 1500)

def test_sequence():
    """Ratings update correctly over several matches"""
    lg = League()
    lg.record("A", "B", 1, 0)
    lg.record("B", "C", 1, 1)
    lg.record("C", "A", 3, 1)
    assert math.isclose(lg.rating("A"), 1499.70, abs_tol=0.01), lg.rating("A")
    assert math.isclose(lg.rating("B"), 1490.29, abs_tol=0.01), lg.rating("B")
    assert math.isclose(lg.rating("C"), 1510.01, abs_tol=0.01), lg.rating("C")

def test_zero_sum():
    """Points gained by one team are lost by the other"""
    lg = League()
    lg.record("A", "B", 3, 2)
    lg.record("A", "C", 0, 1)
    assert math.isclose(sum(lg.ratings.values()), 1500 * len(lg.ratings))

@@hint
Read both ratings *before* changing anything. Compute `expected_a`, decide `actual_a`, then update both. B's actual score is `1 - actual_a` and its expected score is `1 - expected_a`.
:::

:::quiz classes-quiz Quick check
? What is `self` in a method?
- [x] The object the method was called on
- [ ] The class itself
- [ ] A Python keyword that must be spelled exactly `self`
> `self` is just a naming convention, but always use it. Python passes the instance as the first argument automatically.

? When does `__init__` run?
- [x] Automatically, when you create an instance like `Bet(...)`
- [ ] When you call `bet.__init__()` yourself
- [ ] When the program starts
> You almost never call it directly.

? In `model = LogisticRegression()` then `model.fit(X, y)`, what is `fit`?
- [ ] A class
- [x] A method
- [ ] An attribute
> `model` is an object (an instance of the `LogisticRegression` class) and `fit` is one of its methods.

? What's the difference between a class attribute and an instance attribute?
- [x] A class attribute is shared by all instances; an instance attribute belongs to one object
- [ ] There's no difference
- [ ] Class attributes can't be read from instances
> In the Elo example, `K` is shared while each object has its own `rating`.
:::
