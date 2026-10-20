---
title: "Responsible ML: fairness, privacy and harm"
summary: How models end up treating groups of people differently even when they never see the group, how to measure it with selection rates and equal opportunity, why removing a column doesn't fix it, how quasi-identifiers break anonymisation, and what responsible practice looks like for betting and trading models.
minutes: 60
kind: lesson
---

Every model in this course makes decisions, or helps someone make them. When those decisions affect people (who gets a loan, which job applications a recruiter reads, which customers a betting company sends offers to), getting the average right isn't enough. A model can be accurate overall and still be systematically unfair to one group, leak private information, or be used in ways that cause harm.

This isn't a separate subject from engineering. It's part of evaluating a model honestly, like walk-forward validation and leakage checks. And it's increasingly a legal requirement: the EU's AI Act, for example, classifies uses such as credit scoring and recruitment as *high-risk*, with obligations around data quality, documentation, human oversight and monitoring.

## How bias gets into a model

A model learns patterns in its training data. If the data reflects unfairness, so will the model:

- **Historical bias.** The labels record past decisions or past outcomes shaped by unequal treatment. A hiring model trained on who was hired before learns who was hired before.
- **Representation bias.** Some groups are under-represented, so the model is less accurate for them. Face recognition systems trained mostly on lighter-skinned faces made more errors on darker-skinned ones.
- **Measurement bias.** A feature or label means different things for different groups, such as "arrests" used as a stand-in for "crimes committed".
- **Proxies.** Even if you remove a sensitive attribute, other features (postcode, school, shopping habits) can encode it.

## Measuring it: a loan model

Here's a simulated lending dataset. Applicants belong to group A or B. Whether someone repays depends only on income, debt and credit history, but two things from the real world are built in: group B's incomes are lower on average, and in the historical records some group-B borrowers who repaid were wrongly recorded as defaults (biased collection practices, say). The model never sees the group column.

Because it's a simulation, we can also see what *really* happened (`truly_repaid`). With real data you usually can't, which is exactly why biased labels are hard to detect.

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

rng = np.random.default_rng(42)
n = 8000
group = rng.choice(["A", "B"], size=n, p=[0.7, 0.3])
is_b = group == "B"
income = np.exp(rng.normal(np.where(is_b, 10.2, 10.5), 0.4))
debt_ratio = rng.beta(2, 5, n)
credit_years = rng.gamma(2, 3, n)
postcode_score = rng.normal(np.where(is_b, -0.8, 0.3), 1)    # varies by neighbourhood, so by group
logit = 2.2 + 1.6 * (np.log(income) - 10.4) - 3.0 * debt_ratio + 0.08 * credit_years
truly_repaid = rng.random(n) < 1 / (1 + np.exp(-logit))
recorded = truly_repaid & ~(is_b & (rng.random(n) < 0.25))   # biased historical records

df = pd.DataFrame({"group": group, "log_income": np.log(income), "debt_ratio": debt_ratio,
                   "credit_years": credit_years, "postcode_score": postcode_score,
                   "repaid": recorded, "truly_repaid": truly_repaid})
features = ["log_income", "debt_ratio", "credit_years", "postcode_score"]
train, test = train_test_split(df, test_size=0.5, random_state=0)
model = LogisticRegression(max_iter=1000).fit(train[features], train["repaid"])
test = test.assign(p=model.predict_proba(test[features])[:, 1])
test = test.assign(approved=test["p"] >= 0.75)

report = pd.DataFrame({
    name: {
        "applicants": len(g),
        "approval rate": g["approved"].mean(),
        "approved | would repay": g.loc[g["truly_repaid"], "approved"].mean(),
        "predicted repay rate": g["p"].mean(),
        "true repay rate": g["truly_repaid"].mean(),
    }
    for name, g in test.groupby("group")
})
print(report.round(3))
print(f"\naccuracy against the recorded labels: {(test['approved'] == test['repaid']).mean():.3f}")
```

Three different fairness measures, and the model fails all of them:

- **Demographic parity** compares **selection rates**: what share of each group is approved. Group B's rate is only a little over half of group A's. Some of that gap is explained by income differences, which is why parity alone isn't always the right test.
- **Equal opportunity** compares approval rates **among people who would repay**: the true positive rate per group. This is the sharpest test here: creditworthy applicants from group B are approved far less often than creditworthy applicants from group A.
- **Calibration by group** compares predicted and actual rates. The model underestimates group B's true repayment rate, because it learned from labels that understated it.

A common rule of thumb, from US employment guidance, is the **four-fifths rule**: a selection rate for one group below 80% of the highest group's rate is a red flag that needs explaining. Here it's far below.

## Removing the column isn't enough

The model never saw `group`, but the other features carry it. You can check directly: try to predict the group from the features. If you can, so can the model.

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import cross_val_predict

rng = np.random.default_rng(42)
n = 8000
group = rng.choice(["A", "B"], size=n, p=[0.7, 0.3])
is_b = group == "B"
df = pd.DataFrame({
    "log_income": rng.normal(np.where(is_b, 10.2, 10.5), 0.4),
    "debt_ratio": rng.beta(2, 5, n),
    "credit_years": rng.gamma(2, 3, n),
    "postcode_score": rng.normal(np.where(is_b, -0.8, 0.3), 1),
})

for cols in [["log_income", "debt_ratio", "credit_years"], list(df.columns)]:
    p = cross_val_predict(LogisticRegression(max_iter=1000), df[cols], is_b, cv=5, method="predict_proba")[:, 1]
    print(f"predicting the group from {cols}: AUC {roc_auc_score(is_b, p):.2f}")
```

Income and debt already reveal the group better than chance, because group B's incomes are lower; adding postcode makes it much easier. A model that's rewarded for matching biased labels will use any proxy it's given to do so, and deleting the obvious proxy doesn't help if income, shopping habits or other features combine into another one. What does help:

- **Measure** outcomes per group, as above, before and after deployment. You can't fix what you don't measure, so where it's lawful, keep sensitive attributes for auditing even though they aren't model inputs.
- **Fix the data** where you can: correct biased labels, collect more data from under-represented groups, drop features that only act as proxies.
- **Choose the fairness criterion deliberately**, with the people affected. When groups' base rates differ, it's mathematically impossible to satisfy calibration, equal opportunity and equal false-positive rates all at once, so there's always a choice to make and document.
- **Keep people in the loop** for consequential decisions, with the ability to see why a decision was made and to override it, and give the people affected a way to appeal.

Be careful with fixes that use the sensitive attribute directly, such as different thresholds per group: depending on the application and the jurisdiction, that can itself be unlawful. Fairness work in regulated areas is done with legal advice, not just code.

## Privacy

Models are trained on data about people, and both the data and the model can leak it.

- **Data minimisation.** Collect and keep only what the model needs. Every extra column is something that can leak.
- **"Anonymised" data often isn't.** Removing names doesn't anonymise a table. Combinations of ordinary attributes, called **quasi-identifiers**, can single people out: a well-known study estimated that most Americans could be uniquely identified by their postcode, birth date and sex. A table is **k-anonymous** if every combination of quasi-identifiers is shared by at least *k* rows; you'll measure this in the exercises.
- **Models remember.** Large models can memorise rare training examples and repeat them. Don't train on personal data you wouldn't want to see in an output, and test for it.
- **Laws apply.** Regulations such as the GDPR give people rights over their data and require a lawful basis for processing it. Know which rules apply before collecting anything.

## Betting, trading and harm

This course uses betting and trading as its running examples, so it's worth being direct about them.

- **Gambling harm is real.** For some people, gambling becomes an addiction with severe financial and personal consequences. The same models that predict match outcomes can predict which customers will lose the most, and be used to target them with offers. Using ML to identify at-risk gamblers so they can be *protected* (spending limits, cooling-off periods, ending promotions) is a legitimate and valuable application; using it to maximise their losses is not.
- **Selling predictions or bots.** If you publish a model's tips or a trading bot, its backtest is a promise to other people. Show honest results, with costs and out-of-sample tests, as this course has, and say clearly that past results don't guarantee future ones.
- **Your own risk.** Everything in Phase 6 and the trading elective about costs, luck and drawdowns applies to your own money first.

## Documenting it

Lesson 8's **model cards** are where this work is recorded: who the model is for and not for, the data it was trained on, the fairness and performance measures per group, known limitations, and how it's monitored. For datasets, **datasheets** record where the data came from, who's represented, and how it was labelled. Write them as you go; reconstructing them later is much harder.

## Practice

:::exercise rml-group-metrics Fairness metrics by group
Write `group_metrics(df)` for a DataFrame with boolean columns `approved` and `qualified` and a column `group`. Return a DataFrame indexed by group, sorted by group name, with columns:

- `selection_rate`: the fraction of the group approved
- `tpr`: the fraction of **qualified** members approved (NaN if the group has no qualified members)
- `fpr`: the fraction of **unqualified** members approved (NaN if none)

Then write `four_fifths_ok(metrics)`: `True` if every group's `selection_rate` is at least 80% of the highest group's.

@@starter
import pandas as pd

def group_metrics(df):
    return pd.DataFrame()

def four_fifths_ok(metrics):
    return True

@@solution
import numpy as np
import pandas as pd

def group_metrics(df):
    rows = {}
    for name, g in df.groupby("group"):
        qualified = g[g["qualified"]]
        unqualified = g[~g["qualified"]]
        rows[name] = {
            "selection_rate": g["approved"].mean(),
            "tpr": qualified["approved"].mean() if len(qualified) else np.nan,
            "fpr": unqualified["approved"].mean() if len(unqualified) else np.nan,
        }
    return pd.DataFrame.from_dict(rows, orient="index").sort_index()

def four_fifths_ok(metrics):
    rates = metrics["selection_rate"]
    return bool((rates >= 0.8 * rates.max()).all())

@@tests
import math
import pandas as pd

def sample():
    return pd.DataFrame({
        "group":     ["A", "A", "A", "A", "B", "B", "B", "B"],
        "qualified": [True, True, False, False, True, True, True, False],
        "approved":  [True, True, True, False, True, False, False, False],
    })

def test_rates():
    """Selection rate, TPR and FPR per group"""
    m = group_metrics(sample())
    assert list(m.index) == ["A", "B"]
    assert math.isclose(m.loc["A", "selection_rate"], 0.75) and math.isclose(m.loc["B", "selection_rate"], 0.25)
    assert math.isclose(m.loc["A", "tpr"], 1.0) and math.isclose(m.loc["B", "tpr"], 1 / 3)
    assert math.isclose(m.loc["A", "fpr"], 0.5) and math.isclose(m.loc["B", "fpr"], 0.0)

def test_missing_qualified():
    """A group with no qualified members has NaN TPR"""
    df = pd.DataFrame({"group": ["A", "B"], "qualified": [True, False], "approved": [True, True]})
    m = group_metrics(df)
    assert math.isnan(m.loc["B", "tpr"]) and math.isnan(m.loc["A", "fpr"])

def test_four_fifths():
    """The four-fifths rule"""
    assert not four_fifths_ok(group_metrics(sample()))
    ok = pd.DataFrame({"selection_rate": [0.5, 0.41]}, index=["A", "B"])
    assert four_fifths_ok(ok) is True

@@hint
Loop over `df.groupby("group")`, and within each group split rows with `g[g["qualified"]]` and `g[~g["qualified"]]`.
:::

:::exercise rml-k-anonymity k-anonymity
Write `k_anonymity(df, quasi_identifiers)`: the size of the smallest group of rows that share the same values in all the `quasi_identifiers` columns. A table where some combination appears only once is 1-anonymous: that row's person can be singled out.

Then write `generalise_age(df, width)`, returning a copy of `df` in which the `age` column is replaced by the start of its band, e.g. with `width=10`, ages 30–39 all become 30. Generalising quasi-identifiers like this is one way to raise k.

@@starter
import pandas as pd

def k_anonymity(df, quasi_identifiers):
    return 0

def generalise_age(df, width):
    return df

@@solution
import pandas as pd

def k_anonymity(df, quasi_identifiers):
    return int(df.groupby(quasi_identifiers).size().min())

def generalise_age(df, width):
    out = df.copy()
    out["age"] = out["age"] // width * width
    return out

@@tests
import pandas as pd

def people():
    return pd.DataFrame({
        "age":      [31, 34, 38, 52, 55, 57],
        "postcode": ["M1", "M1", "M1", "M2", "M2", "M2"],
        "sex":      ["F", "F", "F", "M", "M", "M"],
    })

def test_unique_rows():
    """Exact ages make every row unique"""
    assert k_anonymity(people(), ["age", "postcode", "sex"]) == 1

def test_generalised():
    """Age bands of 10 make each band 3 people"""
    banded = generalise_age(people(), 10)
    assert banded["age"].tolist() == [30, 30, 30, 50, 50, 50]
    assert k_anonymity(banded, ["age", "postcode", "sex"]) == 3

def test_copy():
    """The original isn't changed"""
    df = people()
    generalise_age(df, 10)
    assert df["age"].tolist() == [31, 34, 38, 52, 55, 57]

@@hint
`df.groupby(columns).size()` counts the rows for each combination; the smallest count is k.
:::

:::quiz rml-ethics-check Quick check
? A model doesn't use race or sex as inputs. Can it still discriminate by them?
- [ ] No, it can't see them
- [x] Yes, other features can act as proxies, and biased labels teach it to use them
- [ ] Only if it's a neural network
> Check whether the sensitive attribute can be predicted from the features, and measure outcomes per group.

? Among applicants who would repay, 60% of group A and 30% of group B are approved. Which criterion does this violate?
- [ ] Calibration
- [x] Equal opportunity
- [ ] Data minimisation
> Equal opportunity asks for equal true positive rates across groups.

? A dataset has names removed but keeps postcode, full birth date and sex. Is it anonymous?
- [ ] Yes, there are no names
- [x] Probably not: that combination identifies many people uniquely
- [ ] Only if it has more than 1,000 rows
> Quasi-identifiers combine to single people out. Measure k-anonymity before sharing data.

? Which is a responsible use of ML at a betting company?
- [ ] Targeting the customers predicted to lose the most with extra offers
- [x] Identifying customers showing signs of harmful gambling so they can be offered limits and support
- [ ] Hiding a model's out-of-sample results from tipsters' customers
> The same predictions can protect people or exploit them. Which one you build is a choice.
:::
