---
title: "Presenting your work: portfolio, README and model card"
summary: Turn projects into evidence - pick portfolio projects that show judgment, write a README that leads with results, report numbers with baselines and uncertainty, document models with model cards, and make your work reproducible.
minutes: 60
kind: lesson
---

Nobody can see the skills in your head. They see your **GitHub**, your **write-ups** and what you say about them. A portfolio is evidence that you can do the job. It doesn't need many projects, but each one needs to show good judgment.

## What makes a strong portfolio project

Two or three deep projects beat ten tutorial copies. Reviewers look for signs of someone who has done real work:

| Weak signal | Strong signal |
| --- | --- |
| A famous dataset (Titanic, MNIST) with default settings | A question you cared about, ideally with data you collected or cleaned yourself |
| "Accuracy 97%" | A baseline, the right metric, and an honest comparison |
| One big notebook | A small package with functions, tests and a single command to run it |
| Results on the training data, or tuned on the test set | Walk-forward or held-out evaluation, the test set used once |
| Only successes | What didn't work, and why |
| Runs on your laptop | A live demo or an API |

This course has given you several projects that already fit:

- **Value-bet finder** (Phase 6 and this capstone): pipeline, goal model, blend, walk-forward backtest, luck test, monitoring.
- **FX direction classifier** (Phase 6): an honest *negative* result is impressive. "I tested it properly and found no edge" shows more maturity than a suspicious win.
- **Prediction API** (Phase 8, `backend/`): FastAPI, a database, authentication, tests and Docker.
- **Image classifier** (Phase 7): transfer learning, with an error analysis.

One original project on a topic you know well (a sport, a market, your job) is worth more than all the generic ones. Your own interest shows, and you'll ask better questions of the data.

## The README

A reviewer spends about thirty seconds on your README before deciding whether to look further. Put the **result first**, then show how to reproduce it:

```markdown
# Value-bet finder for football

Predicts match outcomes with a time-weighted Poisson goal model blended with
the betting market, and flags bets with positive expected value.

## Results (2024-25 season, walk-forward, rules fixed in advance)

| Model | Log loss | vs market (95% CI) |
| --- | --- | --- |
| Blend 0.4/0.6 | 1.0380 | -0.0014 (-0.0097 to +0.0071) |
| Market | 1.0394 | baseline |
| Goal model | 1.0507 | +0.0112 (-0.0102 to +0.0333) |

![Log loss compared with the market](docs/results.png)

The blend is slightly better than the market, but one season can't confirm it.
Value bets: 179 bets, ROI +4%; about 1 in 6 no-edge bettors would do as well.

## Quick start

    uv sync
    uv run python -m pipeline.run --season 2024-25
    uv run pytest

## How it works
Data → validation → weekly refit → blend → value-bet rules → report. (Diagram.)

## Evaluation
Walk-forward with weekly refits; no tuning on the test season; paired bootstrap CIs.

## Limitations
One synthetic league; two seasons; average odds, not the best available prices.

## Project structure
pipeline/  model/  api/  tests/  notebooks/  docs/
```

Notice what it does: says what the project is in two lines, shows the numbers with a baseline and uncertainty, admits what isn't proven, and tells the reader how to run it in three commands.

## Report results honestly

How you phrase a result matters as much as the number itself:

| Instead of | Write |
| --- | --- |
| "The model is 97% accurate" | "97% accurate, against 96% for always predicting the majority class" |
| "My model beats the bookies" | "Log loss 1.0380 vs the market's 1.0394; the 95% interval for the difference includes zero" |
| "+4% ROI" | "+4% ROI over 179 bets; a luck test says 1 in 6 no-edge bettors would do as well" |
| "Tuned to 0.81 AUC" | "0.81 AUC on a test set used once, after tuning on a separate validation set" |
| (silence about failures) | "Adding xG features didn't help (log loss unchanged), so they were dropped" |

Always give three things: a **baseline**, the **uncertainty**, and **how the test data was used**.

## One honest chart

A results chart should show uncertainty and a reference line. This cell compares three forecasts for 2024-25 with the market, using the paired bootstrap from the last lesson. To keep it fast, it uses the stored predictions from Phase 6, which were refit monthly, so the numbers differ a little from the weekly refits in part 1:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

preds = pd.read_csv("data/poisson_predictions.csv")
test = preds[preds["Season"] == "2024-25"].reset_index(drop=True)
matches = pd.read_csv("data/matches.csv")
train = matches[matches["Season"] < "2024-25"]

odds = test[["AvgA", "AvgD", "AvgH"]].to_numpy()
market = (1 / odds) / (1 / odds).sum(axis=1, keepdims=True)
model = test[["pA", "pD", "pH"]].to_numpy()
rates = train["FTR"].value_counts(normalize=True).reindex(["A", "D", "H"]).to_numpy()
forecasts = {
    "base rates": np.tile(rates, (len(test), 1)),
    "goal model": model,
    "blend 0.4/0.6": 0.4 * model + 0.6 * market,
}
outcome = test["FTR"].map({"A": 0, "D": 1, "H": 2}).to_numpy()
rows = np.arange(len(test))
market_loss = -np.log(market[rows, outcome])

rng = np.random.default_rng(0)
resample = rng.integers(0, len(test), (5000, len(test)))
names, centres, lows, highs = [], [], [], []
print(f"{'market':>14}: log loss {market_loss.mean():.4f}")
for name, p in forecasts.items():
    diff = -np.log(p[rows, outcome]) - market_loss
    low, high = np.percentile(diff[resample].mean(axis=1), [2.5, 97.5])
    names.append(name); centres.append(diff.mean()); lows.append(low); highs.append(high)
    print(f"{name:>14}: log loss {-np.log(p[rows, outcome]).mean():.4f}, "
          f"vs market {diff.mean():+.4f} (95% CI {low:+.4f} to {high:+.4f})")

centres, lows, highs = map(np.array, (centres, lows, highs))
fig, ax = plt.subplots(figsize=(7, 2.8))
ax.errorbar(centres, range(len(names)), xerr=[centres - lows, highs - centres], fmt="o", capsize=4)
ax.axvline(0, color="grey", ls="--")
ax.set_yticks(range(len(names)), names)
ax.set_xlabel("log loss minus the market's (negative = better than the market)")
ax.set_title("2024-25, 380 matches, 95% bootstrap intervals")
fig.tight_layout()
plt.show()
```

Look at the base rates. A forecast that knows nothing about the teams is 0.015 worse than the market, and even that interval includes zero. **One season is not much evidence.** That's why serious claims pool many seasons or leagues, and why the README above says "can't confirm" rather than "beats the market".

## Model cards

A **model card** (Mitchell et al., 2019) is a short document that travels with a model. It says what the model is for, what it was trained on, how well it works and where it fails. Hugging Face shows one on every model page, and many companies require them.

```markdown
# Model card: match-outcome goal model v3

## Intended use
Pre-match probabilities of home win, draw and away win, for research and as an
input to a value-bet finder. Predictions are made the evening before matchday.

## Out of scope
- In-play prediction
- Other leagues or sports without retraining and re-evaluation

## Training data
Results from the course's synthetic league, 2022-23 onwards, refit weekly with
time decay (half-life about 170 days).

## Evaluation
Walk-forward on 2024-25: log loss 1.0507 alone, 1.0380 blended with the market
(market 1.0394). Calibration plot in docs/calibration.png.

## Limitations
- Knows nothing about injuries, transfers or managers
- New teams have no history until they've played a few matches
- One season of test data; differences from the market are within noise
```

Write one for every model you publish, even a small one. It's quick, and it shows you know where your model shouldn't be trusted.

## Make it reproducible

Someone else (including you, six months from now) should get the same numbers with one or two commands:

- **Pin dependencies**: `uv.lock` or a `requirements.txt` with exact versions.
- **Fix random seeds** and say where they're set.
- **Version the data**: a download script with checksums, or a dated snapshot. Never "whatever the API returns today".
- **One entry point** for the main result, such as `python -m pipeline.run`.
- **Tests and CI**: run them on every push with GitHub Actions.
- **No secrets in the repo**: commit a `.env.example`, keep the real `.env` out with `.gitignore` (Phase 8).

A minimal CI workflow, saved as `.github/workflows/tests.yml`:

```yaml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync
      - run: uv run pytest
```

A green "tests passing" badge on a README tells a reviewer a lot in one glance.

## A one-page report template

Use this for the capstone write-up, and for any analysis you hand to someone else:

```text
Title           One line: what you found, not what you did.
Question        The decision this supports, in one or two sentences.
Data            Source, period, size, known problems.
Method          Model, features, how it was evaluated (walk-forward? test set used once?).
Results         A table with baselines and 95% intervals. One or two charts.
What it means   The honest conclusion, including "not proven" if that's the truth.
Limitations     What could make this wrong.
Next steps      The two or three things you'd try next, in priority order.
```

## Make it visible

- **Pin** your best two or three repositories on your GitHub profile, and write a short profile README.
- **Deploy a demo**: the API from Phase 8, or a small Gradio or Streamlit app on Hugging Face Spaces.
- **Write about it**: a blog post or LinkedIn article explaining one project, including what went wrong. Writing is the most underrated career skill in ML.

## Practice

:::exercise port-table A results table
Write `results_table(losses, baseline, n_resamples=2000, seed=0)`. `losses` is a dict mapping model names to arrays of per-match log losses (all the same length), and `baseline` is one of its keys. Return a Markdown table as a single string, lines joined with `"\n"`:

- Header line `| Model | Log loss | vs <baseline> (95% CI) |`, then `| --- | --- | --- |`.
- One row per model, sorted by mean loss (lowest first): `| <name> | <mean> | <cell> |`, with the mean to 4 decimal places.
- For the baseline, the cell is `baseline`. For every other model, let `d = losses[name] - losses[baseline]`, create a fresh `rng = np.random.default_rng(seed)`, and record the mean of `d[rng.integers(0, len(d), len(d))]` for each of `n_resamples` resamples. The cell is `<mean of d> (<low> to <high>)`, where low and high are the 2.5th and 97.5th percentiles of the resampled means, all formatted with `:+.4f`.

@@starter
import numpy as np

def results_table(losses, baseline, n_resamples=2000, seed=0):
    lines = ["| Model | Log loss |", "| --- | --- |"]
    for name, values in losses.items():
        lines.append(f"| {name} | {np.mean(values):.4f} |")
    return "\n".join(lines)

@@solution
import numpy as np

def results_table(losses, baseline, n_resamples=2000, seed=0):
    lines = [f"| Model | Log loss | vs {baseline} (95% CI) |", "| --- | --- | --- |"]
    base = np.asarray(losses[baseline], dtype=float)
    for name in sorted(losses, key=lambda k: np.mean(losses[k])):
        values = np.asarray(losses[name], dtype=float)
        if name == baseline:
            cell = "baseline"
        else:
            d = values - base
            rng = np.random.default_rng(seed)
            means = np.array([d[rng.integers(0, len(d), len(d))].mean() for _ in range(n_resamples)])
            low, high = np.percentile(means, [2.5, 97.5])
            cell = f"{d.mean():+.4f} ({low:+.4f} to {high:+.4f})"
        lines.append(f"| {name} | {values.mean():.4f} | {cell} |")
    return "\n".join(lines)

@@tests
import numpy as np

rng = np.random.default_rng(3)
market = rng.gamma(4, 0.26, 380)
LOSSES = {
    "model": market + rng.normal(0.01, 0.15, 380),
    "market": market,
    "blend": market + rng.normal(-0.004, 0.05, 380),
}

def reference_cell(d, n=2000, seed=0):
    r = np.random.default_rng(seed)
    means = np.array([d[r.integers(0, len(d), len(d))].mean() for _ in range(n)])
    low, high = np.percentile(means, [2.5, 97.5])
    return f"{d.mean():+.4f} ({low:+.4f} to {high:+.4f})"

def test_header_and_order():
    """Header first, rows sorted by mean loss"""
    lines = results_table(LOSSES, "market").split("\n")
    assert lines[0] == "| Model | Log loss | vs market (95% CI) |"
    assert lines[1] == "| --- | --- | --- |"
    order = sorted(LOSSES, key=lambda k: LOSSES[k].mean())
    assert [line.split(" | ")[0].strip("| ") for line in lines[2:]] == order

def test_cells():
    """Means, the baseline row and the bootstrap intervals"""
    lines = results_table(LOSSES, "market").split("\n")
    rows = {line.split(" | ")[0].strip("| "): line for line in lines[2:]}
    assert rows["market"] == f"| market | {LOSSES['market'].mean():.4f} | baseline |"
    for name in ["model", "blend"]:
        expected = f"| {name} | {LOSSES[name].mean():.4f} | {reference_cell(LOSSES[name] - LOSSES['market'])} |"
        assert rows[name] == expected

def test_options():
    """n_resamples, seed and the baseline name are respected"""
    out = results_table({"a": LOSSES["model"], "b": LOSSES["market"]}, "a", n_resamples=500, seed=7)
    assert out.split("\n")[0] == "| Model | Log loss | vs a (95% CI) |"
    assert reference_cell(LOSSES["market"] - LOSSES["model"], 500, 7) in out
:::

:::exercise port-card A model card generator
Write `model_card(meta)`, which turns a dict into a Markdown model card. `meta` must contain non-empty values for `"name"`, `"version"`, `"intended_use"`, `"training_data"`, `"evaluation"` and `"limitations"` (a list of strings). If any are missing or empty, raise `ValueError` with the message `"missing: "` followed by the missing keys in alphabetical order, separated by `", "`.

Otherwise return a string (lines joined with `"\n"`) that starts with the line `# Model card: <name> v<version>`, followed by these sections, each a `## ` heading line followed by its content: `## Intended use`, then `## Out of scope` only if `meta` has a non-empty `"out_of_scope"` list, then `## Training data`, `## Evaluation` and `## Limitations`. List items (out of scope and limitations) are written one per line as `- <item>`.

@@starter
def model_card(meta):
    return f"# {meta['name']}"

@@solution
REQUIRED = ["name", "version", "intended_use", "training_data", "evaluation", "limitations"]

def model_card(meta):
    missing = sorted(key for key in REQUIRED if not meta.get(key))
    if missing:
        raise ValueError("missing: " + ", ".join(missing))
    lines = [f"# Model card: {meta['name']} v{meta['version']}", "", "## Intended use", meta["intended_use"]]
    if meta.get("out_of_scope"):
        lines += ["", "## Out of scope"] + [f"- {item}" for item in meta["out_of_scope"]]
    lines += ["", "## Training data", meta["training_data"], "", "## Evaluation", meta["evaluation"],
              "", "## Limitations"] + [f"- {item}" for item in meta["limitations"]]
    return "\n".join(lines)

@@tests
import pytest

META = {
    "name": "goal-model", "version": 3,
    "intended_use": "Pre-match outcome probabilities.",
    "training_data": "Synthetic league, 2022-23 onwards.",
    "evaluation": "Walk-forward log loss 1.0507 on 2024-25.",
    "limitations": ["No injury data", "One test season"],
}

def headings(card):
    return [line for line in card.split("\n") if line.startswith("#")]

def test_structure():
    """Title and sections, in order"""
    card = model_card(META)
    assert headings(card) == ["# Model card: goal-model v3", "## Intended use", "## Training data", "## Evaluation", "## Limitations"]
    assert "Walk-forward log loss 1.0507 on 2024-25." in card.split("\n")
    assert card.split("\n")[-2:] == ["- No injury data", "- One test season"]

def test_out_of_scope():
    """Optional section goes after intended use, only when given"""
    card = model_card({**META, "out_of_scope": ["In-play betting"]})
    assert headings(card)[1:3] == ["## Intended use", "## Out of scope"]
    assert "- In-play betting" in card.split("\n")
    assert "## Out of scope" not in model_card({**META, "out_of_scope": []})

def test_missing_fields():
    """Missing or empty required fields are reported together, alphabetically"""
    bad = {k: v for k, v in META.items() if k not in ("limitations", "evaluation")}
    with pytest.raises(ValueError, match="missing: evaluation, limitations"):
        model_card(bad)
    with pytest.raises(ValueError, match="missing: intended_use"):
        model_card({**META, "intended_use": ""})
:::

:::quiz port-quiz Quick check
? What should come first in a project README?
- [x] What the project does and its main result, with a baseline
- [ ] The full installation history
- [ ] A list of every library used
> Reviewers skim. Lead with the result; then show how to reproduce it.

? Your model's log loss is 0.0014 better than the market's, with a 95% interval of −0.0097 to +0.0071. How should you describe it?
- [x] Slightly better on this season, but within noise: not yet evidence of an edge
- [ ] "Beats the bookmakers"
- [ ] Don't mention the market at all
> Give the baseline, the uncertainty, and how the test data was used.

? Which project is likely to impress a reviewer most?
- [x] A well-tested walk-forward study on data you collected, including what didn't work
- [ ] A notebook reaching 99% accuracy on MNIST with default settings
- [ ] Ten short tutorial notebooks
> Judgment and honesty are what reviewers look for.

? What is a model card for?
- [x] Documenting a model's intended use, training data, evaluation and limitations
- [ ] Storing the model's weights
- [ ] Speeding up inference
> It tells users where the model can and can't be trusted.
:::
