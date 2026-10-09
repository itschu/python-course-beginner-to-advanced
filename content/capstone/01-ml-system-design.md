---
title: Designing an ML system
summary: Turn a question into a system - the decision it supports, the metric that matters, what's known at prediction time, baselines, batch versus online serving, monitoring and failure modes - and write it down in a design doc before writing code.
minutes: 45
kind: lesson
---

You can now build every part of a machine learning product. This final phase is about putting the parts together **deliberately**. Most ML projects that fail don't fail because of the model: they fail because they solved the wrong problem, used data that wouldn't exist at prediction time, or broke quietly in production. A few hours of design up front prevents that.

We'll use the system you've been building all course as the running example: **a service that predicts football matches and flags value bets**.

## 1. Start from the decision

A model is only useful if it changes a decision. Write down:

- **Who uses the output, and for what?** A bettor deciding which bets to place and how much to stake.
- **When is the decision made?** The evening before matchday, when odds are available.
- **What's a good outcome?** Profit over many bets, but that's very noisy (Phase 6), so also closing line value.
- **What does a mistake cost?** Overconfident probabilities lead to overbetting, which loses money fast.

Then choose metrics at two levels:

| Level | Metric | Why |
| --- | --- | --- |
| Business | ROI, closing line value, drawdown | What the user actually cares about |
| Model | Log loss, calibration, compared with the market | Sensitive, less noisy, available sooner |

Optimise the model metric, but check that improvements show up in the business metric before you celebrate.

## 2. Ask what is known at prediction time

Every feature must be computable **at the moment the prediction is made**, from data that existed then. This sounds obvious and is violated constantly: closing odds used for a prediction made the night before, a team's season average that includes later matches, a "last updated" table that's been overwritten since.

The defence is **point-in-time correctness**: store data with timestamps, and when building training rows, join each one to the latest data available *before* its prediction time. pandas does this with `merge_asof`:

```python
import pandas as pd

# Team rating snapshots, each with the time it was computed
ratings = pd.DataFrame({
    "team": ["Ashford City", "Ashford City", "Ashford City", "Bramley Rovers", "Bramley Rovers"],
    "as_of": pd.to_datetime(["2024-08-01", "2024-08-20", "2024-09-01", "2024-08-10", "2024-08-25"]),
    "rating": [1500, 1520, 1510, 1480, 1490],
})
fixtures = pd.DataFrame({
    "home": ["Ashford City", "Bramley Rovers", "Ashford City"],
    "kickoff": pd.to_datetime(["2024-08-20", "2024-08-26", "2024-09-15"]),
})

# Naive: the latest rating overall (leaks future information into early fixtures)
latest = ratings.sort_values("as_of").groupby("team")["rating"].last()
print("naive:\n", fixtures.assign(rating=fixtures["home"].map(latest)), "\n")

# Point-in-time: the latest rating strictly before each kickoff
correct = pd.merge_asof(
    fixtures.sort_values("kickoff"), ratings.sort_values("as_of"),
    left_on="kickoff", right_on="as_of", left_by="home", right_by="team",
    allow_exact_matches=False, direction="backward",
)
print("point-in-time:\n", correct[["home", "kickoff", "as_of", "rating"]])
```

The naive join gives the August fixtures a rating computed in September. A model trained like that looks better in testing than it can ever be live. `allow_exact_matches=False` also excludes a snapshot taken at the same moment as the kickoff, which in practice usually includes the match itself.

## 3. Baselines and a target to beat

Before any model, compute what you'd get without one: base rates, a simple rule, and the best available outside forecast (here, the market). Phase 6 showed the market is very hard to beat; knowing that up front sets realistic expectations and stops you from mistaking a bug for a breakthrough.

## 4. Batch or online predictions?

| | Batch | Online (real time) |
| --- | --- | --- |
| How | A scheduled job predicts everything at once and stores the results | An API computes each prediction on request |
| When it fits | Inputs are known in advance (fixtures are published days ahead) | Inputs arrive at request time (live odds, user input) |
| Pros | Simple, cheap, easy to check before anyone sees it | Always uses the latest data |
| Cons | Predictions can go stale | Must be fast and always available |

Many real systems mix the two: precompute what you can, compute the rest on request. The match service could run a nightly batch job for the weekend's fixtures and offer an API (Phase 8) for ad-hoc requests.

## 5. Plan for failure

List what can go wrong, how you'd notice, and what happens then:

| Failure | How you'd notice | Response |
| --- | --- | --- |
| Data feed late or broken | Pipeline data-quality checks (lesson 2) | Don't publish predictions; alert |
| Team renamed or promoted | Unknown-team errors, missing features | Mapping table; cold-start rating for new teams |
| Model quietly worse | Rolling log loss vs the market (Phase 6) | Roll back to the previous model version |
| A bug in a new release | Tests and a shadow run against the old version | Deploy only when both agree |
| Distribution shift (new season) | PSI on key features | Retrain; widen uncertainty |

## 6. Write a design doc

Put it on one or two pages before writing code. It forces clarity, and it's what experienced engineers ask to see first.

```text
# Design: Value-bet finder

Problem       Flag bets with positive expected value for next weekend's matches.
Users         One bettor (me), via a web page and an API.
Decision      Which bets to place, at what stake, the evening before matchday.
Metrics       Model: walk-forward log loss vs market. Business: CLV, ROI, max drawdown.
Data          Results and odds (CSV, weekly). Fixtures (weekly). Timestamps on everything.
Features      Pre-match only: ratings as of 24h before kickoff, market probabilities.
Baselines     Base rates; the market's margin-free probabilities.
Model         Time-weighted Poisson goal model, blended with the market; refit weekly.
Evaluation    Walk-forward over two seasons; bootstrap CIs; no tuning on the test season.
Serving       Nightly batch job writes predictions; FastAPI serves them; models versioned.
Monitoring    Rolling log loss vs market, PSI on features, data checks; alerts by email.
Risks         Market sharper than expected; small samples; account limits.
Out of scope  In-play betting, other sports.
```

## Practice

:::exercise sys-asof Point-in-time features
Write `ratings_at_kickoff(fixtures, ratings)`. `fixtures` has columns `match_id`, `team` and `kickoff` (datetimes); `ratings` has `team`, `as_of` (datetimes) and `rating`. Return a copy of `fixtures` with a `rating` column holding each team's latest rating from **strictly before** its kickoff (`NaN` if there isn't one), in the original row order of `fixtures`.

@@starter
import pandas as pd

def ratings_at_kickoff(fixtures, ratings):
    latest = ratings.groupby("team")["rating"].last()
    return fixtures.assign(rating=fixtures["team"].map(latest))

@@solution
import pandas as pd

def ratings_at_kickoff(fixtures, ratings):
    merged = pd.merge_asof(
        fixtures.reset_index().sort_values("kickoff"),
        ratings.sort_values("as_of")[["team", "as_of", "rating"]],
        left_on="kickoff", right_on="as_of", by="team",
        allow_exact_matches=False, direction="backward",
    )
    merged = merged.set_index("index").sort_index()
    out = fixtures.copy()
    out["rating"] = merged["rating"]
    return out

@@tests
import numpy as np
import pandas as pd

ratings = pd.DataFrame({
    "team": ["A", "A", "A", "B", "B"],
    "as_of": pd.to_datetime(["2024-08-01", "2024-08-20", "2024-09-01", "2024-08-10", "2024-08-25"]),
    "rating": [1500, 1520, 1510, 1480, 1490],
})
fixtures = pd.DataFrame({
    "match_id": [10, 11, 12, 13, 14],
    "team": ["A", "B", "A", "B", "A"],
    "kickoff": pd.to_datetime(["2024-09-15", "2024-08-26", "2024-08-20", "2024-08-05", "2024-08-21"]),
})

def test_values_and_order():
    """Latest rating strictly before kickoff, original order kept"""
    out = ratings_at_kickoff(fixtures, ratings)
    assert out["match_id"].tolist() == [10, 11, 12, 13, 14]
    assert out["rating"].iloc[[0, 1, 2, 4]].tolist() == [1510, 1490, 1500, 1520]
    assert np.isnan(out["rating"].iloc[3])          # no B rating before 5 August

def test_does_not_modify_input():
    """Returns a copy"""
    before = fixtures.copy()
    ratings_at_kickoff(fixtures, ratings)
    assert fixtures.equals(before)
:::

:::exercise sys-baseline Know your baselines
Write `baselines(train_results, test_results, test_market_probs)`. `train_results` and `test_results` are lists of outcomes (`"H"`, `"D"` or `"A"`); `test_market_probs` is an array of shape `(n_test, 3)` with columns A, D, H. Return a dict with the test log loss (`sklearn.metrics.log_loss`, `labels=["A", "D", "H"]`) of two baselines: `"base_rates"` (predict the training frequencies of A, D and H for every test match) and `"market"`.

@@starter
import numpy as np
from sklearn.metrics import log_loss

def baselines(train_results, test_results, test_market_probs):
    return {}

@@solution
import numpy as np
from sklearn.metrics import log_loss

def baselines(train_results, test_results, test_market_probs):
    train = np.asarray(train_results)
    rates = np.array([(train == label).mean() for label in ["A", "D", "H"]])
    base = np.tile(rates, (len(test_results), 1))
    return {
        "base_rates": float(log_loss(test_results, base, labels=["A", "D", "H"])),
        "market": float(log_loss(test_results, test_market_probs, labels=["A", "D", "H"])),
    }

@@tests
import math
import numpy as np
import pandas as pd

def test_on_course_data():
    """Base rates from 2022-24, tested on 2024-25"""
    m = pd.read_csv("data/matches.csv")
    train, test = m[m["Season"] < "2024-25"], m[m["Season"] == "2024-25"]
    implied = 1 / test[["AvgA", "AvgD", "AvgH"]].to_numpy()
    out = baselines(train["FTR"].tolist(), test["FTR"].tolist(), implied / implied.sum(axis=1, keepdims=True))
    assert set(out) == {"base_rates", "market"}
    assert math.isclose(out["market"], 1.0394, abs_tol=1e-4)
    assert math.isclose(out["base_rates"], 1.0547, abs_tol=1e-4)
:::

:::quiz sys-quiz Quick check
? Why define a business metric as well as a model metric?
- [x] Model metrics are sensitive and quick, but only business metrics show whether the system helps its users
- [ ] Business metrics are easier to compute
- [ ] Model metrics can't be used for football
> Optimise log loss; confirm it moves ROI or CLV.

? A training row for a match on 20 August uses a team rating computed on 1 September. What's wrong?
- [x] It leaks future information, so offline results will be better than live ones
- [ ] Nothing, as long as the rating is accurate
- [ ] It makes training slower
> Join features point-in-time: the latest value from strictly before prediction time.

? Fixtures are published days in advance and odds the evening before. Which serving pattern fits best?
- [x] A scheduled batch job the evening before, with an API for ad-hoc requests
- [ ] Only real-time predictions, recomputed for every page view
- [ ] Predictions made by hand
> Precompute what you can; batch is simpler and easier to check.

? What's the main reason to write a design doc before coding?
- [x] It forces decisions about the problem, data, metrics and risks while changing them is still cheap
- [ ] Companies require paperwork
- [ ] It replaces testing
> Most ML failures are design failures, not modelling failures.
:::
