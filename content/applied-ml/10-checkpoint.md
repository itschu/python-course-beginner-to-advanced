---
title: "Checkpoint: Applied ML"
summary: Walk-forward evaluation, leakage, goal models, calibration, value betting, trading backtests and monitoring, in one test.
minutes: 75
kind: checkpoint
---

**Passing standard:** all three exercises pass and you score at least 9/12 on the quiz.

:::quiz phase6-final Phase 6 quiz
? You build a feature "team's average goals this season" using every match of the season, including later ones. What's wrong?
- [x] It leaks future results into earlier matches
- [ ] Nothing, as long as you use TimeSeriesSplit
- [ ] It should use the median instead
> Features must only use information available before kick-off. Use expanding means of earlier matches.

? Your labels are "did the price rise over the next 5 days?". Why add `gap=5` to TimeSeriesSplit?
- [x] The last training labels overlap the test period, which leaks future prices
- [ ] It makes training faster
- [ ] It balances the classes
> Each label looks 5 days ahead, so training rows just before the test period contain test-period information.

? A team rated 1400 beats a team rated 1700 away from home. Compared with a favourite's win, their Elo rating:
- [x] Rises more, because a win was unexpected
- [ ] Rises by the same amount
- [ ] Doesn't change, because Elo ignores away matches
> The update is k × (actual − expected), and expected was low.

? In the Poisson team model, the home side's expected goals are $\exp(\text{base} + \text{home} + \text{attack}_{\text{home team}} - \text{defence}_{\text{away team}})$. A team with a strong defence has:
- [x] A large defence parameter, which lowers its opponents' expected goals
- [ ] A small attack parameter
- [ ] A negative home parameter
> Defence is subtracted from the opponent's log expected goals.

? Events your model calls 70% happen only 60% of the time, and 30% events happen 40% of the time. The model is:
- [x] Overconfident, and Platt scaling fitted on later data could fix it
- [ ] Underconfident
- [ ] Perfectly calibrated
> Its probabilities are too extreme. Recalibrate on data the model wasn't trained on.

? How should you choose the weight for blending your model with the market?
- [x] By log loss on a validation season, then test it once on a later season
- [ ] By the ROI it produces on the test season
- [ ] Always use 0.5
> Choosing by test-season results (or by noisy ROI) overfits.

? You think a team has a 40% chance of winning, at odds of 2.80. The expected value per unit staked is:
- [ ] −0.12
- [x] +0.12
- [ ] +0.40
> 0.40 × 2.80 − 1 = 0.12.

? For the same bet, what stake does quarter Kelly suggest, as a fraction of your bankroll?
- [x] About 1.7%
- [ ] About 6.7%
- [ ] 25%
> Full Kelly is (0.4 × 2.8 − 1) / (2.8 − 1) ≈ 0.067; a quarter of that is ≈ 0.017.

? A strategy's daily returns have mean 0.02% and standard deviation 0.5%. Its annualised Sharpe ratio is about:
- [ ] 0.04
- [x] 0.63
- [ ] 10
> (0.0002 / 0.005) × √252 ≈ 0.04 × 15.9 ≈ 0.63.

? You backtest 100 moving-average pairs and report the best one's Sharpe ratio of 1.2. The main problem is:
- [x] Selection: the best of many trials is inflated, so it must be tested on fresh data
- [ ] Moving averages can't be backtested
- [ ] The Sharpe ratio should be above 2
> Data snooping. Count your trials, and keep a final test period untouched.

? The PSI of a key feature between the training period and last month is 0.4. What does that suggest?
- [x] A major distribution shift: check the data pipeline and consider retraining
- [ ] The model is more accurate than before
- [ ] Nothing, PSI only matters above 10
> Rule of thumb: below 0.1 stable, 0.1–0.25 moderate, above 0.25 major.

? Which is the fastest way to notice that a pipeline bug has broken a live betting model?
- [x] Monitoring its predictions (for example, disagreement with the market) as they're made
- [ ] Waiting for the season's ROI
- [ ] Re-reading the training code once a year
> Outcome metrics are noisy and slow; prediction checks work before results arrive.
:::

:::exercise cp6-walk Walk-forward predictions
Write `walk_forward(df, features, target, make_model, test_seasons)`. `df` is sorted by `Date` and has a `Season` column. For each season in `test_seasons`, in order:

1. Fit a fresh model, `make_model()`, on `df[features]` and `df[target]` for all rows dated **before that season's first match**.
2. Predict class probabilities for that season's rows with `predict_proba`.

Return one DataFrame with the predicted rows' original index and one column per class, named after `model.classes_`.

@@starter
import pandas as pd

def walk_forward(df, features, target, make_model, test_seasons):
    return pd.DataFrame()

@@solution
import pandas as pd

def walk_forward(df, features, target, make_model, test_seasons):
    parts = []
    for season in test_seasons:
        test = df[df["Season"] == season]
        train = df[df["Date"] < test["Date"].min()]
        model = make_model().fit(train[features], train[target])
        parts.append(pd.DataFrame(model.predict_proba(test[features]), index=test.index, columns=model.classes_))
    return pd.concat(parts)

@@tests
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

def load():
    df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
    implied = 1 / df[["AvgH", "AvgD", "AvgA"]]
    df["ImpH"] = implied["AvgH"] / implied.sum(axis=1)
    df["ImpA"] = implied["AvgA"] / implied.sum(axis=1)
    return df

class Spy:
    """A fake model that records which rows it was trained on."""
    seen = []
    def fit(self, X, y):
        Spy.seen.append(X.index)
        self.classes_ = np.array(sorted(y.unique()))
        return self
    def predict_proba(self, X):
        return np.full((len(X), len(self.classes_)), 1 / len(self.classes_))

def test_no_lookahead():
    """Each model only sees matches played before its season"""
    df = load()
    Spy.seen = []
    out = walk_forward(df, ["ImpH", "ImpA"], "FTR", Spy, ["2023-24", "2024-25"])
    assert len(Spy.seen) == 2, "fit one fresh model per test season"
    for season, seen in zip(["2023-24", "2024-25"], Spy.seen):
        first = df.loc[df["Season"] == season, "Date"].min()
        assert df.loc[seen, "Date"].max() < first
        assert len(seen) == (df["Date"] < first).sum()
    assert out.index.equals(df.index[df["Season"].isin(["2023-24", "2024-25"])])

def test_real_model():
    """Logistic regression on market probabilities"""
    df = load()
    out = walk_forward(df, ["ImpH", "ImpA"], "FTR", lambda: LogisticRegression(max_iter=1000), ["2023-24", "2024-25"])
    assert list(out.columns) == ["A", "D", "H"] and len(out) == 760
    assert np.allclose(out.sum(axis=1), 1)
    ref = []
    for season in ["2023-24", "2024-25"]:
        test = df[df["Season"] == season]
        train = df[df["Date"] < test["Date"].min()]
        ref.append(LogisticRegression(max_iter=1000).fit(train[["ImpH", "ImpA"]], train["FTR"]).predict_proba(test[["ImpH", "ImpA"]]))
    assert np.allclose(out.to_numpy(), np.vstack(ref))
    assert log_loss(df.loc[out.index, "FTR"], out.to_numpy(), labels=["A", "D", "H"]) < 1.06
:::

:::exercise cp6-strategy Evaluate a crossover strategy
Write `evaluate_crossover(close, fast, slow, cost=0.0001)` for a pandas Series of closing prices:

- Position: the sign of (fast moving average − slow moving average), and 0 until the slow average exists.
- Daily strategy returns: yesterday's position × today's simple return, minus `cost` × the absolute change in position (starting from flat), with no missing values.
- Return a dict with `"sharpe"` (mean / standard deviation × √252), `"max_drawdown"` (the largest fall of the compounded equity curve `(1 + r).cumprod()` from its running peak, as a fraction) and `"changes"` (the number of days on which the position changed).

@@starter
import numpy as np
import pandas as pd

def evaluate_crossover(close, fast, slow, cost=0.0001):
    return {"sharpe": 0.0, "max_drawdown": 0.0, "changes": 0}

@@solution
import numpy as np
import pandas as pd

def evaluate_crossover(close, fast, slow, cost=0.0001):
    f, s = close.rolling(fast).mean(), close.rolling(slow).mean()
    position = np.sign(f - s).where(s.notna(), 0)
    trades = position.diff().fillna(position.iloc[0]).abs()
    r = (position.shift(1) * close.pct_change()).fillna(0) - cost * trades
    equity = (1 + r).cumprod()
    return {
        "sharpe": float(r.mean() / r.std() * np.sqrt(252)),
        "max_drawdown": float((1 - equity / equity.cummax()).max()),
        "changes": int((trades > 0).sum()),
    }

@@tests
import math
import numpy as np
import pandas as pd

def reference(close, fast, slow, cost):
    f, s = close.rolling(fast).mean(), close.rolling(slow).mean()
    pos = np.sign(f - s).where(s.notna(), 0)
    trades = pos.diff().fillna(pos.iloc[0]).abs()
    r = (pos.shift(1) * close.pct_change()).fillna(0) - cost * trades
    eq = (1 + r).cumprod()
    return r.mean() / r.std() * np.sqrt(252), (1 - eq / eq.cummax()).max(), int((trades > 0).sum())

def test_small_series():
    """Hand-sized example"""
    close = pd.Series([1.00, 1.01, 1.03, 1.02, 1.00, 0.98, 0.99, 1.02, 1.05, 1.04])
    out = evaluate_crossover(close, 2, 3, cost=0.001)
    sharpe, dd, changes = reference(close, 2, 3, 0.001)
    assert out["changes"] == changes == 3
    assert math.isclose(out["sharpe"], sharpe) and math.isclose(out["max_drawdown"], dd)

def test_fx_data():
    """Matches the reference on the course's FX data"""
    close = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")["Close"]
    for fast, slow in [(50, 200), (10, 30)]:
        out = evaluate_crossover(close, fast, slow)
        sharpe, dd, changes = reference(close, fast, slow, 0.0001)
        assert math.isclose(out["sharpe"], sharpe, rel_tol=1e-9), (fast, slow)
        assert math.isclose(out["max_drawdown"], dd, rel_tol=1e-9) and out["changes"] == changes
:::

:::exercise cp6-clv Closing line value
Write `closing_line_value(taken_odds, closing_odds, picks)`. `taken_odds` holds the odds you bet at (length n), `closing_odds` is an (n, 3) array of closing odds for H, D and A, and `picks` holds the index (0, 1 or 2) of the outcome you backed. Remove the closing margin **proportionally**, turn the picked outcome's fair probability into fair odds (`1 / p`), and return `taken / fair_closing_odds - 1` for each bet as a NumPy array.

@@starter
import numpy as np

def closing_line_value(taken_odds, closing_odds, picks):
    return np.zeros(len(taken_odds))

@@solution
import numpy as np

def closing_line_value(taken_odds, closing_odds, picks):
    implied = 1 / np.asarray(closing_odds, dtype=float)
    fair = implied / implied.sum(axis=1, keepdims=True)
    picks = np.asarray(picks)
    fair_odds = 1 / fair[np.arange(len(picks)), picks]
    return np.asarray(taken_odds, dtype=float) / fair_odds - 1

@@tests
import math
import numpy as np

def test_one_bet():
    """Worked example"""
    clv = closing_line_value([2.10], [[2.00, 3.50, 4.00]], [0])
    implied = np.array([1 / 2.00, 1 / 3.50, 1 / 4.00])
    fair_odds = 1 / (implied[0] / implied.sum())
    assert clv.shape == (1,) and math.isclose(clv[0], 2.10 / fair_odds - 1)
    assert 0.013 < clv[0] < 0.014

def test_several_bets():
    """Positive when you beat the fair closing price, negative when you don't"""
    taken = [2.10, 3.20, 5.50]
    closing = [[2.00, 3.50, 4.00], [2.50, 3.40, 2.90], [1.60, 4.00, 6.50]]
    clv = closing_line_value(taken, closing, [0, 1, 2])
    assert clv[0] > 0 and clv[1] < 0 and clv[2] < 0
    implied = 1 / np.array(closing[2])
    assert math.isclose(clv[2], 5.50 * (implied[2] / implied.sum()) - 1)
:::

## Phase 6 complete

You can now build models on time-ordered data without fooling yourself: walk-forward validation, leak-free features, goal models, calibration, blending with the market, staking, backtests with costs, luck tests and monitoring. These are the skills that separate a model that works in a notebook from one that works with real money. Phase 7 moves to deep learning: neural networks from scratch, then PyTorch.
