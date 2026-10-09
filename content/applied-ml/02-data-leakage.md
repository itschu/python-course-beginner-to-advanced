---
title: Data leakage, the silent killer
summary: The types of leakage (target, temporal, preprocessing, group and selection leakage), how each one fakes a great model, and a checklist for catching them.
minutes: 50
kind: lesson
---

**Data leakage** is when information that wouldn't be available at prediction time sneaks into training. It doesn't crash anything. It just makes a worthless model look excellent, until it meets reality. In betting and trading, that moment costs money.

The first sign is usually a result that's **too good to be true**. Treat any model that beats a liquid market by a wide margin as leaking until proven otherwise.

## 1. Target leakage: features that contain the answer

A feature that's recorded *after* (or because of) the outcome. Shots on target are a classic for football: they're only known after the match, and they strongly predict the result:

```python
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

df = pd.read_csv("data/matches.csv")
y = (df["FTR"] == "H").astype(int)
leaky = df[["HST", "AST", "HS", "AS"]]                         # in-match statistics
honest = (1 / df[["AvgH", "AvgA"]])                            # pre-match odds

print(f"with in-match stats: {cross_val_score(LogisticRegression(max_iter=1000), leaky, y, cv=5).mean():.1%} accuracy")
print(f"with pre-match odds: {cross_val_score(LogisticRegression(max_iter=1000), honest, y, cv=5).mean():.1%} accuracy")
```

The first model "predicts" results it could only know after the final whistle. Real examples are subtler: a customer's "account closed reason" column when predicting churn, a "treatment given" column when predicting diagnosis, or **closing odds** when your bets would actually be placed days earlier at the opening odds.

**Fix:** for every feature, ask "at exactly what moment is this value known?" and drop anything recorded after the prediction time.

## 2. Temporal leakage: using the future

Features computed with data from after the prediction time. You've seen it: a season-average feature that includes future matches, a centred rolling window, a random train/test split on time-ordered data.

```python
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values("Date")
df["HomeWin"] = (df["FTR"] == "H").astype(int)

# Leaky: each team's home win rate over the WHOLE dataset, including the match itself and the future
df["LeakyRate"] = df.groupby("HomeTeam")["HomeWin"].transform("mean")
# Honest: each team's home win rate over its PREVIOUS home matches only
df["HonestRate"] = df.groupby("HomeTeam")["HomeWin"].transform(lambda s: s.shift(1).expanding().mean())

train, test = df[df["Season"] < "2024-25"].dropna(), df[df["Season"] == "2024-25"].dropna()
for feature in ["LeakyRate", "HonestRate"]:
    model = LogisticRegression().fit(train[[feature]], train["HomeWin"])
    print(f"{feature:>10}: test log loss {log_loss(test['HomeWin'], model.predict_proba(test[[feature]])[:, 1]):.4f}")
```

The leaky version looks clearly better, because its "rate" partly *is* the test-season results.

## 3. Preprocessing leakage

Fitting scalers, imputers, feature selectors or encoders on all the data before splitting. Phase 5 showed how feature selection on pure noise can report 80%+ accuracy. **Fix:** put every learned preprocessing step inside a `Pipeline`, so it's refitted within each training fold.

## 4. Group leakage: the same entity on both sides

If the same customer, patient, team-season or match appears in both training and test sets, the model can memorise the entity rather than learn the pattern. For example, two rows for each match (one per team) split randomly put half of each match in each set. **Fix:** split by group with `GroupKFold`:

```python
import numpy as np
from sklearn.model_selection import GroupKFold

match_ids = np.repeat(np.arange(6), 2)          # each match appears twice (home and away views)
for train_idx, test_idx in GroupKFold(n_splits=3).split(match_ids, groups=match_ids):
    print("test matches:", sorted(set(match_ids[test_idx])), "| overlap with train:", set(match_ids[test_idx]) & set(match_ids[train_idx]))
```

## 5. Selection leakage and survivorship bias

Your choices can leak too. Testing 200 strategies and reporting the best one (Phase 4's multiple-testing trap). Building a stock model only from companies that still exist today (survivorship bias: the ones that went bust are missing, so history looks rosier than it was). Removing "outliers" after seeing that they hurt your score. **Fix:** decide on your procedure before looking at the results, keep a final test set untouched, and count every experiment you ran.

## Detecting leakage

- **Too good to be true?** Compare against the market or a strong baseline. A huge improvement usually means leakage.
- **Inspect feature importance.** If one feature dominates suspiciously, check when it's recorded.
- **Audit timestamps.** For every feature, write down when it becomes available, and confirm it's before the prediction time.
- **Time-shift test.** Shift a feature one period forward or back. If performance collapses when it's moved to strictly-past data, it was leaking.
- **Re-run the pipeline as of a past date**, using only data that existed then, and check you get the same features.

## Practice

:::exercise leak-spot Spot the leaky features
A churn dataset has these columns. Set `leaky` to a **sorted list** of the columns that would leak if you're predicting, at the start of each month, whether a customer cancels during that month.

| Column | Meaning |
| --- | --- |
| `tenure_months` | months since the customer joined (as of the start of the month) |
| `logins_last_30d` | logins in the 30 days before the start of the month |
| `cancellation_reason` | the reason given when they cancelled (empty if they didn't) |
| `refund_issued_this_month` | whether a refund was paid during the month |
| `plan` | current subscription plan at the start of the month |
| `support_tickets_last_90d` | support tickets in the 90 days before the start of the month |
| `final_invoice_amount` | amount on the customer's final invoice |

@@starter
leaky = []

@@solution
leaky = sorted(["cancellation_reason", "refund_issued_this_month", "final_invoice_amount"])

@@tests
def test_leaky():
    """Identifies columns that are only known after the prediction time"""
    assert sorted(leaky) == ["cancellation_reason", "final_invoice_amount", "refund_issued_this_month"], sorted(leaky)
:::

:::exercise leak-fix Make a feature honest
Write `previous_home_win_rate(df)`. `df` is sorted by date. Return a Series aligned with `df` giving, for each match, the home team's win rate in its **previous home matches** (not counting the current one). It should be `NaN` for a team's first home match.

@@starter
import pandas as pd

def previous_home_win_rate(df):
    wins = (df["FTR"] == "H").astype(int)
    return wins.groupby(df["HomeTeam"]).transform("mean")

@@solution
import pandas as pd

def previous_home_win_rate(df):
    wins = (df["FTR"] == "H").astype(int)
    return wins.groupby(df["HomeTeam"]).transform(lambda s: s.shift(1).expanding().mean())

@@tests
import numpy as np
import pandas as pd

def test_small_example():
    """Uses only previous home matches"""
    df = pd.DataFrame({"HomeTeam": ["A", "B", "A", "A", "B"], "FTR": ["H", "A", "D", "H", "H"]})
    got = previous_home_win_rate(df)
    assert np.isnan(got[0]) and np.isnan(got[1])
    assert got[2] == 1.0 and got[3] == 0.5 and got[4] == 0.0

def test_future_does_not_matter():
    """Changing later results doesn't change earlier values"""
    df = pd.read_csv("data/matches.csv", parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
    a = previous_home_win_rate(df)
    df2 = df.copy()
    df2.loc[df2.index[-100:], "FTR"] = "H"
    b = previous_home_win_rate(df2)
    assert np.allclose(a.iloc[:900].fillna(-1), b.iloc[:900].fillna(-1))
:::

:::quiz leak-quiz Quick check
? You predict match results using the average of the closing odds. Your bets would be placed the day before at earlier prices. What's the problem?
- [x] Closing odds aren't known when you'd place the bet, so they leak late information
- [ ] Nothing
- [ ] Closing odds are always worse
> Use the prices available at your decision time.

? A model's accuracy collapses when you replace a feature with its previous-day value. This suggests:
- [x] The original feature was leaking same-day or future information
- [ ] The model is fine
- [ ] The feature is irrelevant
> That's the time-shift test.

? Which split prevents the same customer appearing in both train and test?
- [x] GroupKFold with the customer ID as the group
- [ ] Shuffled KFold
- [ ] TimeSeriesSplit without groups
> Group-aware splitting prevents memorising entities.

? Your new betting model beats the closing market by 10% ROI in a backtest. Your first reaction should be:
- [x] Hunt for leakage and overfitting before believing it
- [ ] Bet heavily
- [ ] Publish the results
> Too good to be true usually is.
:::
