---
title: "Project: a tested bankroll tracker"
summary: Design and build a small, professional library with dataclasses, custom exceptions, generators and your own test suite, then set it up as a real project with CI.
minutes: 150
kind: project
---

You'll build `bankroll`, a small library that records bets, tracks a bankroll and reports performance statistics. It uses everything from this phase: classes and dataclasses, properties, custom exceptions, generators, type hints and tests.

By the end, you'll also set it up on your own computer as a proper project with pytest, Ruff and GitHub Actions. It's a portfolio piece, and you'll reuse it to evaluate strategies in Phase 6.

## The design

```text
Bet (frozen dataclass)          one bet: selection, stake, odds, and an optional result
Bankroll (class)                starting balance, a list of bets, and methods to place and settle them
InsufficientFunds (exception)   raised when a stake is bigger than the available balance
```

Two rules make the design robust:

1. **A `Bet` never changes.** Settling creates a *new* settled `Bet` with `dataclasses.replace`. Immutable values are easy to reason about, and impossible to change by accident.
2. **The balance is calculated, never stored.** The `balance` property works it out from the bets every time it's read, so it can never drift out of sync with them.

## Step 1: The Bet

:::exercise bt-bet The Bet dataclass
Write a frozen dataclass `Bet` with fields `selection: str`, `stake: float`, `odds: float` and `won: bool | None = None` (`None` means not settled yet).

- `__post_init__`: raise `ValueError` if `stake <= 0` or `odds <= 1`.
- property `settled`: `True` if `won` is not `None`.
- property `profit`: `stake * (odds - 1)` if won, `-stake` if lost, `0.0` if unsettled.
- method `settle(won: bool) -> Bet`: return a **new** settled Bet using `dataclasses.replace`. Raise `ValueError` if this bet is already settled.

@@starter
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

@@solution
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

    def __post_init__(self):
        if self.stake <= 0:
            raise ValueError(f"stake must be positive, got {self.stake}")
        if self.odds <= 1:
            raise ValueError(f"odds must be greater than 1, got {self.odds}")

    @property
    def settled(self) -> bool:
        return self.won is not None

    @property
    def profit(self) -> float:
        if self.won is None:
            return 0.0
        return self.stake * (self.odds - 1) if self.won else -self.stake

    def settle(self, won: bool) -> "Bet":
        if self.settled:
            raise ValueError("bet is already settled")
        return replace(self, won=won)

@@tests
import math

def raises(fn, exc=ValueError):
    try:
        fn()
    except exc:
        return True
    return False

def test_validation():
    """Rejects bad stakes and odds"""
    assert raises(lambda: Bet("A", 0, 2.0))
    assert raises(lambda: Bet("A", 5, 1.0))

def test_unsettled():
    """A new bet is unsettled with zero profit"""
    b = Bet("Ashford", 10, 2.5)
    assert b.settled is False and b.profit == 0.0

def test_settle_returns_new_bet():
    """settle returns a new Bet and leaves the original unchanged"""
    b = Bet("Ashford", 10, 2.5)
    won = b.settle(True)
    assert won is not b and won.won is True and b.won is None
    assert math.isclose(won.profit, 15)
    assert b.settle(False).profit == -10

def test_cannot_settle_twice():
    """Settling a settled bet raises ValueError"""
    assert raises(lambda: Bet("A", 10, 2.0).settle(True).settle(True))

def test_frozen():
    """Bets are immutable"""
    assert raises(lambda: setattr(Bet("A", 1, 2.0), "stake", 5), Exception)
:::

## Step 2: The Bankroll

:::exercise bt-bankroll The Bankroll class
The `Bet` class from step 1 is included in the starter. Add:

- `class InsufficientFunds(Exception)`: a custom exception.
- `class Bankroll` with `__init__(self, starting: float)`, storing `self.starting` and `self.bets: list[Bet] = []`.
- property `balance`: starting amount, plus the profit of settled bets, minus the stakes of **unsettled** bets (that money is tied up).
- `place(self, bet: Bet) -> int`: raise `InsufficientFunds` if `bet.stake` is more than the balance; otherwise append the bet and return its index.
- `settle(self, index: int, won: bool) -> None`: replace the bet at `index` with its settled version.
- `__len__`: the number of bets.

@@starter
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

    def __post_init__(self):
        if self.stake <= 0 or self.odds <= 1:
            raise ValueError("invalid bet")

    @property
    def settled(self) -> bool:
        return self.won is not None

    @property
    def profit(self) -> float:
        if self.won is None:
            return 0.0
        return self.stake * (self.odds - 1) if self.won else -self.stake

    def settle(self, won: bool) -> "Bet":
        if self.settled:
            raise ValueError("already settled")
        return replace(self, won=won)

# Add InsufficientFunds and Bankroll here

@@solution
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

    def __post_init__(self):
        if self.stake <= 0 or self.odds <= 1:
            raise ValueError("invalid bet")

    @property
    def settled(self) -> bool:
        return self.won is not None

    @property
    def profit(self) -> float:
        if self.won is None:
            return 0.0
        return self.stake * (self.odds - 1) if self.won else -self.stake

    def settle(self, won: bool) -> "Bet":
        if self.settled:
            raise ValueError("already settled")
        return replace(self, won=won)


class InsufficientFunds(Exception):
    """Raised when a stake is larger than the available balance."""


class Bankroll:
    def __init__(self, starting: float):
        self.starting = starting
        self.bets: list[Bet] = []

    @property
    def balance(self) -> float:
        settled = sum(b.profit for b in self.bets if b.settled)
        pending = sum(b.stake for b in self.bets if not b.settled)
        return self.starting + settled - pending

    def place(self, bet: Bet) -> int:
        if bet.stake > self.balance:
            raise InsufficientFunds(f"stake {bet.stake} exceeds balance {self.balance}")
        self.bets.append(bet)
        return len(self.bets) - 1

    def settle(self, index: int, won: bool) -> None:
        self.bets[index] = self.bets[index].settle(won)

    def __len__(self) -> int:
        return len(self.bets)

@@tests
import math

def test_custom_exception():
    """InsufficientFunds is an Exception subclass"""
    assert issubclass(InsufficientFunds, Exception)

def test_place_ties_up_money():
    """Placing a bet reduces the available balance"""
    br = Bankroll(100)
    i = br.place(Bet("A", 30, 2.0))
    assert i == 0 and len(br) == 1
    assert math.isclose(br.balance, 70)

def test_settle_win_and_loss():
    """Settled bets change the balance by their profit"""
    br = Bankroll(100)
    a = br.place(Bet("A", 10, 3.0))
    b = br.place(Bet("B", 20, 2.0))
    br.settle(a, True)
    br.settle(b, False)
    assert math.isclose(br.balance, 100 + 20 - 20)

def test_insufficient_funds():
    """Can't stake more than the balance"""
    br = Bankroll(50)
    br.place(Bet("A", 40, 2.0))
    try:
        br.place(Bet("B", 20, 2.0))
    except InsufficientFunds:
        assert len(br) == 1
        return
    raise AssertionError("expected InsufficientFunds")
:::

## Step 3: Performance statistics

:::exercise bt-stats Stats and a history generator
Extend the starter (which includes a working `Bet` and `Bankroll`) with these `Bankroll` methods. All of them only consider **settled** bets:

- `history(self)`: a **generator** yielding the balance after each settled bet, starting with the starting amount. (Ignore unsettled bets: this is the realised balance.)
- `roi(self) -> float`: total profit / total staked, or `0.0` if nothing is settled.
- `win_rate(self) -> float`: fraction of settled bets that won, or `0.0`.
- `max_drawdown(self) -> float`: the biggest drop from a peak in `history()`. For a history of `100, 120, 90, 110, 80`, the peak is 120 and the lowest point after it is 80, so the drawdown is `40`.

@@starter
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

    @property
    def settled(self):
        return self.won is not None

    @property
    def profit(self):
        if self.won is None:
            return 0.0
        return self.stake * (self.odds - 1) if self.won else -self.stake


class Bankroll:
    def __init__(self, starting):
        self.starting = starting
        self.bets = []

    def add_settled(self, stake, odds, won):
        self.bets.append(Bet("x", stake, odds, won))

    # add history, roi, win_rate and max_drawdown

@@solution
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

    @property
    def settled(self):
        return self.won is not None

    @property
    def profit(self):
        if self.won is None:
            return 0.0
        return self.stake * (self.odds - 1) if self.won else -self.stake


class Bankroll:
    def __init__(self, starting):
        self.starting = starting
        self.bets = []

    def add_settled(self, stake, odds, won):
        self.bets.append(Bet("x", stake, odds, won))

    def _settled(self):
        return [b for b in self.bets if b.settled]

    def history(self):
        balance = self.starting
        yield balance
        for b in self._settled():
            balance += b.profit
            yield balance

    def roi(self):
        settled = self._settled()
        staked = sum(b.stake for b in settled)
        return sum(b.profit for b in settled) / staked if staked else 0.0

    def win_rate(self):
        settled = self._settled()
        return sum(b.won for b in settled) / len(settled) if settled else 0.0

    def max_drawdown(self):
        peak = float("-inf")
        worst = 0.0
        for balance in self.history():
            peak = max(peak, balance)
            worst = max(worst, peak - balance)
        return worst

@@tests
import inspect, math

def sample():
    br = Bankroll(100)
    br.add_settled(10, 3.0, True)    # +20 -> 120
    br.add_settled(30, 2.0, False)   # -30 -> 90
    br.add_settled(20, 2.0, True)    # +20 -> 110
    br.add_settled(30, 1.5, False)   # -30 -> 80
    br.bets.append(Bet("pending", 5, 2.0))   # unsettled, ignored
    return br

def test_history():
    """history yields the balance after each settled bet"""
    br = sample()
    assert inspect.isgeneratorfunction(Bankroll.history), "make history a generator with yield"
    assert list(br.history()) == [100, 120, 90, 110, 80]

def test_roi():
    """ROI is profit / staked over settled bets"""
    assert math.isclose(sample().roi(), -20 / 90)

def test_win_rate():
    """Win rate over settled bets"""
    assert math.isclose(sample().win_rate(), 0.5)

def test_drawdown():
    """Max drawdown from the 120 peak to 80 is 40"""
    assert math.isclose(sample().max_drawdown(), 40)

def test_empty():
    """An empty bankroll has zero stats"""
    br = Bankroll(50)
    assert list(br.history()) == [50]
    assert br.roi() == 0.0 and br.win_rate() == 0.0 and br.max_drawdown() == 0.0

@@hint
For the drawdown, walk through `history()` keeping the highest balance seen so far (`peak`). At each step, `peak - balance` is the current drawdown; keep the largest.
:::

## Step 4: Your own test suite

:::exercise bt-tests Test the Bankroll
A correct `Bet` and `Bankroll` are provided. Write **at least four** tests for them. The checker runs your tests against the correct code and against three broken versions:

1. `balance` forgets to subtract the stakes of unsettled bets,
2. `place` allows a stake bigger than the balance,
3. `settle` treats every bet as won.

Your tests must pass on the correct code and catch all three.

@@starter
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

    @property
    def settled(self):
        return self.won is not None

    @property
    def profit(self):
        if self.won is None:
            return 0.0
        return self.stake * (self.odds - 1) if self.won else -self.stake


class InsufficientFunds(Exception):
    pass


class Bankroll:
    def __init__(self, starting):
        self.starting = starting
        self.bets = []

    @property
    def balance(self):
        settled = sum(b.profit for b in self.bets if b.settled)
        pending = sum(b.stake for b in self.bets if not b.settled)
        return self.starting + settled - pending

    def place(self, bet):
        if bet.stake > self.balance:
            raise InsufficientFunds()
        self.bets.append(bet)
        return len(self.bets) - 1

    def settle(self, index, won):
        self.bets[index] = replace(self.bets[index], won=won)

# Write your tests below

@@solution
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Bet:
    selection: str
    stake: float
    odds: float
    won: bool | None = None

    @property
    def settled(self):
        return self.won is not None

    @property
    def profit(self):
        if self.won is None:
            return 0.0
        return self.stake * (self.odds - 1) if self.won else -self.stake


class InsufficientFunds(Exception):
    pass


class Bankroll:
    def __init__(self, starting):
        self.starting = starting
        self.bets = []

    @property
    def balance(self):
        settled = sum(b.profit for b in self.bets if b.settled)
        pending = sum(b.stake for b in self.bets if not b.settled)
        return self.starting + settled - pending

    def place(self, bet):
        if bet.stake > self.balance:
            raise InsufficientFunds()
        self.bets.append(bet)
        return len(self.bets) - 1

    def settle(self, index, won):
        self.bets[index] = replace(self.bets[index], won=won)


def test_pending_stake_is_tied_up():
    br = Bankroll(100)
    br.place(Bet("A", 30, 2.0))
    assert br.balance == 70

def test_cannot_overstake():
    br = Bankroll(10)
    try:
        br.place(Bet("A", 20, 2.0))
    except InsufficientFunds:
        return
    assert False, "expected InsufficientFunds"

def test_losing_bet():
    br = Bankroll(100)
    i = br.place(Bet("A", 10, 2.0))
    br.settle(i, False)
    assert br.balance == 90

def test_winning_bet():
    br = Bankroll(100)
    i = br.place(Bet("A", 10, 3.0))
    br.settle(i, True)
    assert br.balance == 120

@@tests
import dataclasses

BetCls = Bet
Correct = Bankroll

class NoPending(Correct):
    @property
    def balance(self):
        return self.starting + sum(b.profit for b in self.bets if b.settled)

class AllowsOverstake(Correct):
    def place(self, bet):
        self.bets.append(bet)
        return len(self.bets) - 1

class AlwaysWins(Correct):
    def settle(self, index, won):
        self.bets[index] = dataclasses.replace(self.bets[index], won=True)

def learner_tests():
    return [f for name, f in globals().items()
            if name.startswith("test_") and callable(f) and getattr(f, "__code__", None)
            and f.__code__.co_filename == "main.py"]

def failures(cls):
    count = 0
    for t in learner_tests():
        t.__globals__["Bankroll"] = cls
        try:
            t()
        except BaseException:
            count += 1
    for t in learner_tests():
        t.__globals__["Bankroll"] = Correct
    return count

def test_enough():
    """At least 4 tests"""
    assert len(learner_tests()) >= 4, f"found {len(learner_tests())}"

def test_correct():
    """Your tests pass on the correct code"""
    assert failures(Correct) == 0

def test_catch_pending():
    """Catches a balance that ignores pending stakes"""
    assert failures(NoPending) > 0, "check the balance after placing (but not settling) a bet"

def test_catch_overstake():
    """Catches place() allowing an oversized stake"""
    assert failures(AllowsOverstake) > 0, "check that staking more than the balance raises InsufficientFunds"

def test_catch_always_wins():
    """Catches settle() that always wins"""
    assert failures(AlwaysWins) > 0, "settle a losing bet and check the balance"
:::

## Step 5: Make it a real project

Now set it up on your computer. This is the part that turns an exercise into a portfolio piece.

```bash
uv init --package bankroll
cd bankroll
uv add --dev pytest ruff
```

1. Put `Bet`, `InsufficientFunds` and `Bankroll` in `src/bankroll/core.py`, and export them from `src/bankroll/__init__.py`:

```python static
from .core import Bankroll, Bet, InsufficientFunds

__all__ = ["Bankroll", "Bet", "InsufficientFunds"]
```

2. Put your tests in `tests/test_core.py`, importing with `from bankroll import Bankroll, Bet, InsufficientFunds`. Add parametrized tests and use `pytest.raises`.
3. Run `uv run pytest` and `uv run ruff check . && uv run ruff format .` until both are clean.
4. Add the GitHub Actions workflow from the previous lesson as `.github/workflows/ci.yml`.
5. Write a README with a short example of using the library, then push to GitHub and check that the CI badge goes green.

:::tip Stretch goals
- Add a `from_csv(path)` class method that loads bets from a CSV file (`@classmethod`).
- Add a command-line interface (`argparse`) that prints a summary report for a CSV of bets.
- Add `streaks()`, a generator that yields `(result, length)` for each run of wins or losses, using `itertools.groupby`.
:::
