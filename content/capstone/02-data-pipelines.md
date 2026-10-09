---
title: Data pipelines and data quality
summary: Build a pipeline that ingests new data on a schedule, validates every batch before it can poison the model, loads it idempotently, and keeps a run log - plus the scheduling and orchestration tools used in production.
minutes: 50
kind: lesson
---

A model is only as good as the data flowing into it, and in production that data keeps arriving: new results every weekend, new odds every day. A **data pipeline** turns that stream into clean, trustworthy tables, automatically. The three properties that matter most:

- **Validated**: bad data is caught at the door, not discovered weeks later in a strange model result.
- **Idempotent**: running the same step twice gives the same result as running it once, so retries and re-runs are safe.
- **Observable**: every run leaves a record of what it did.

## The shape of a pipeline

```text
extract  ->  validate  ->  transform  ->  load  ->  (features, retraining, predictions)
fetch the     reject or      clean,       write to
new batch     quarantine     standardise  the database
              bad data
```

We'll build one around the course's match data, simulating the real situation: results arrive as a weekly file.

## Validating a batch

Write checks for everything you rely on: the columns exist, values are in range, related fields agree with each other, keys are unique, and the batch is plausible (dates in the expected window, teams you know).

```python
import pandas as pd

REQUIRED = ["Season", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "AvgH", "AvgD", "AvgA"]
KNOWN_TEAMS = set(pd.read_csv("data/matches.csv")["HomeTeam"])

def validate(batch: pd.DataFrame) -> list[str]:
    """Return a list of problems; an empty list means the batch is fine."""
    missing = [c for c in REQUIRED if c not in batch.columns]
    if missing:
        return [f"missing columns: {missing}"]
    problems = []
    if batch[REQUIRED].isna().any().any():
        problems.append(f"missing values in: {batch[REQUIRED].columns[batch[REQUIRED].isna().any()].tolist()}")
    if ((batch["FTHG"] < 0) | (batch["FTAG"] < 0)).any():
        problems.append("negative goals")
    if (batch[["AvgH", "AvgD", "AvgA"]] <= 1).any().any():
        problems.append("odds must be greater than 1")
    expected = pd.Series("D", index=batch.index).mask(batch["FTHG"] > batch["FTAG"], "H").mask(batch["FTHG"] < batch["FTAG"], "A")
    if (expected != batch["FTR"]).any():
        problems.append(f"FTR disagrees with the score in {(expected != batch['FTR']).sum()} row(s)")
    unknown = (set(batch["HomeTeam"]) | set(batch["AwayTeam"])) - KNOWN_TEAMS
    if unknown:
        problems.append(f"unknown teams: {sorted(unknown)}")
    if batch.duplicated(["Date", "HomeTeam", "AwayTeam"]).any():
        problems.append("duplicate matches in the batch")
    return problems

matches = pd.read_csv("data/matches.csv")
good = matches.iloc[:10].copy()
bad = good.copy()
bad.loc[bad.index[0], "FTHG"] = -1
bad.loc[bad.index[1], "FTR"] = "H" if bad.loc[bad.index[1], "FTR"] != "H" else "A"
bad.loc[bad.index[2], "AwayTeam"] = "Fairhaven F.C."          # a typo in the feed
bad = pd.concat([bad, bad.iloc[[3]]])                         # a duplicated row

print("good batch:", validate(good))
print("bad batch:")
for problem in validate(bad):
    print("  -", problem)
```

That team-name typo is the kind of change that happens when a data provider "improves" their feed. Without the check it would silently create a 21st team with no history.

## An idempotent pipeline with a run log

The load step uses the match's natural key `(Date, HomeTeam, AwayTeam)` as the table's primary key, and **upserts**: insert new rows, update existing ones. Re-running a batch then changes nothing, and a corrected file simply overwrites the wrong rows. Bad batches are **quarantined** (kept for inspection, never loaded), and every run is logged.

```python
import sqlite3
from datetime import datetime, timezone

import pandas as pd

REQUIRED = ["Season", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "AvgH", "AvgD", "AvgA"]

def validate(batch):
    problems = [f"missing column {c}" for c in REQUIRED if c not in batch.columns]
    if problems:
        return problems
    if ((batch["FTHG"] < 0) | (batch["FTAG"] < 0)).any():
        problems.append("negative goals")
    if batch.duplicated(["Date", "HomeTeam", "AwayTeam"]).any():
        problems.append("duplicate matches in the batch")
    return problems

def setup(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS matches (
            Season TEXT, Date TEXT, HomeTeam TEXT, AwayTeam TEXT,
            FTHG INTEGER, FTAG INTEGER, FTR TEXT, AvgH REAL, AvgD REAL, AvgA REAL,
            PRIMARY KEY (Date, HomeTeam, AwayTeam)
        );
        CREATE TABLE IF NOT EXISTS runs (
            run_at TEXT, batch TEXT, status TEXT, rows_in INTEGER, new_rows INTEGER, problems TEXT
        );
    """)

def run_pipeline(conn, batch, name):
    problems = validate(batch)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if problems:
        conn.execute("INSERT INTO runs VALUES (?, ?, 'quarantined', ?, 0, ?)", (now, name, len(batch), "; ".join(problems)))
        conn.commit()
        return "quarantined"
    before = conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
    conn.executemany(f"""
        INSERT INTO matches ({", ".join(REQUIRED)}) VALUES ({", ".join("?" * len(REQUIRED))})
        ON CONFLICT (Date, HomeTeam, AwayTeam) DO UPDATE SET
            FTHG = excluded.FTHG, FTAG = excluded.FTAG, FTR = excluded.FTR,
            AvgH = excluded.AvgH, AvgD = excluded.AvgD, AvgA = excluded.AvgA
    """, batch[REQUIRED].itertuples(index=False, name=None))
    new_rows = conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0] - before
    conn.execute("INSERT INTO runs VALUES (?, ?, 'loaded', ?, ?, '')", (now, name, len(batch), new_rows))
    conn.commit()
    return "loaded"

# Simulate weekly files for the first five weeks of 2024-25
matches = pd.read_csv("data/matches.csv", parse_dates=["Date"])
season = matches[matches["Season"] == "2024-25"].copy()
season["Week"] = season["Date"].dt.to_period("W").astype(str)
season["Date"] = season["Date"].dt.date.astype(str)
weeks = [group.drop(columns="Week") for _, group in season.groupby("Week")][:5]

conn = sqlite3.connect(":memory:")
setup(conn)
for i, batch in enumerate(weeks):
    print(f"week {i + 1}:", run_pipeline(conn, batch, f"week-{i + 1}"))
print("re-run week 3:", run_pipeline(conn, weeks[2], "week-3-retry"))           # idempotent: no new rows
broken = weeks[4].copy()
broken.loc[broken.index[0], "FTAG"] = -2
print("broken file:", run_pipeline(conn, broken, "week-5-broken"))

print(pd.read_sql_query("SELECT batch, status, rows_in, new_rows, problems FROM runs", conn).to_string(index=False))
print("matches stored:", conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0])
```

Re-running week 3 loaded nothing new, and the broken file never touched the table. In production, a quarantined batch would also send an alert, and the next steps (retraining, predictions) would refuse to run on stale data.

## Scheduling and orchestration

The pipeline needs to run by itself. In increasing order of power:

- **cron** on a server: `0 6 * * 1 python pipeline.py` runs every Monday at 06:00.
- **GitHub Actions** on a schedule: free for small jobs, with logs and secrets built in.
- **Orchestrators** (Prefect, Dagster, Airflow) when you have many steps with dependencies, retries, backfills and a dashboard.

```yaml
# .github/workflows/pipeline.yml
name: weekly pipeline
on:
  schedule:
    - cron: "0 6 * * 1"          # Mondays 06:00 UTC
  workflow_dispatch: {}           # plus a manual "Run" button
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - run: pip install -r requirements.txt
      - run: python -m pipeline.ingest && python -m pipeline.retrain && python -m pipeline.predict
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Whatever runs it, keep each step idempotent and separately runnable, so a failed step can be retried without redoing everything.

## Practice

:::exercise pipe-validate Validate a batch
Write `validate_batch(df)` returning a list of problem strings (empty if the batch is fine). Check, in this order, and include each problem at most once:

1. Any of the columns `Date`, `HomeTeam`, `AwayTeam`, `FTHG`, `FTAG`, `FTR` missing → return `["missing columns"]` immediately.
2. Negative goals → `"negative goals"`.
3. `FTR` doesn't match the score (`"H"` if home goals are higher, `"A"` if away, `"D"` if equal) → `"FTR mismatch"`.
4. A team playing itself → `"team plays itself"`.
5. The same `(Date, HomeTeam, AwayTeam)` appearing twice → `"duplicates"`.

@@starter
import pandas as pd

def validate_batch(df):
    return []

@@solution
import numpy as np
import pandas as pd

def validate_batch(df):
    required = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
    if any(c not in df.columns for c in required):
        return ["missing columns"]
    problems = []
    if ((df["FTHG"] < 0) | (df["FTAG"] < 0)).any():
        problems.append("negative goals")
    expected = np.where(df["FTHG"] > df["FTAG"], "H", np.where(df["FTHG"] < df["FTAG"], "A", "D"))
    if (expected != df["FTR"].to_numpy()).any():
        problems.append("FTR mismatch")
    if (df["HomeTeam"] == df["AwayTeam"]).any():
        problems.append("team plays itself")
    if df.duplicated(["Date", "HomeTeam", "AwayTeam"]).any():
        problems.append("duplicates")
    return problems

@@tests
import pandas as pd

def batch(**changes):
    df = pd.DataFrame({
        "Date": ["2024-08-17", "2024-08-17", "2024-08-18"],
        "HomeTeam": ["Ashford City", "Castleton United", "Eastbrook Town"],
        "AwayTeam": ["Bramley Rovers", "Dunmore Athletic", "Fairhaven FC"],
        "FTHG": [2, 0, 1], "FTAG": [1, 0, 3], "FTR": ["H", "D", "A"],
    })
    for col, (row, value) in changes.items():
        df.loc[row, col] = value
    return df

def test_clean_batch():
    """A good batch has no problems"""
    assert validate_batch(batch()) == []

def test_each_problem():
    """Each rule is detected"""
    assert validate_batch(batch().drop(columns="FTR")) == ["missing columns"]
    assert validate_batch(batch(FTAG=(0, -1))) == ["negative goals"]
    assert validate_batch(batch(FTHG=(1, -1))) == ["negative goals", "FTR mismatch"]
    assert validate_batch(batch(FTR=(1, "H"))) == ["FTR mismatch"]
    assert validate_batch(batch(AwayTeam=(2, "Eastbrook Town"))) == ["team plays itself"]
    assert validate_batch(pd.concat([batch(), batch().iloc[[0]]], ignore_index=True)) == ["duplicates"]
:::

:::exercise pipe-upsert An idempotent load
Write `load(conn, rows)` for a SQLite table created by the provided `setup(conn)`: `results(date TEXT, home TEXT, away TEXT, home_goals INTEGER, away_goals INTEGER, PRIMARY KEY (date, home, away))`. `rows` is a list of `(date, home, away, home_goals, away_goals)` tuples. Insert new rows and **update** the goals of rows that already exist (use `INSERT ... ON CONFLICT (date, home, away) DO UPDATE SET ...`), commit, and return the number of rows that were new.

@@starter
import sqlite3

def setup(conn):
    conn.execute("""CREATE TABLE results (
        date TEXT, home TEXT, away TEXT, home_goals INTEGER, away_goals INTEGER,
        PRIMARY KEY (date, home, away))""")

def load(conn, rows):
    conn.executemany("INSERT INTO results VALUES (?, ?, ?, ?, ?)", rows)
    conn.commit()
    return len(rows)

@@solution
import sqlite3

def setup(conn):
    conn.execute("""CREATE TABLE results (
        date TEXT, home TEXT, away TEXT, home_goals INTEGER, away_goals INTEGER,
        PRIMARY KEY (date, home, away))""")

def load(conn, rows):
    before = conn.execute("SELECT COUNT(*) FROM results").fetchone()[0]
    conn.executemany("""
        INSERT INTO results (date, home, away, home_goals, away_goals) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (date, home, away) DO UPDATE SET
            home_goals = excluded.home_goals, away_goals = excluded.away_goals
    """, rows)
    conn.commit()
    return conn.execute("SELECT COUNT(*) FROM results").fetchone()[0] - before

@@tests
import sqlite3

def fresh():
    conn = sqlite3.connect(":memory:")
    setup(conn)
    return conn

WEEK1 = [("2024-08-17", "Ashford City", "Bramley Rovers", 2, 1), ("2024-08-17", "Castleton United", "Dunmore Athletic", 0, 0)]

def test_idempotent():
    """Loading the same rows twice adds nothing the second time"""
    conn = fresh()
    assert load(conn, WEEK1) == 2
    assert load(conn, WEEK1) == 0
    assert conn.execute("SELECT COUNT(*) FROM results").fetchone()[0] == 2

def test_corrections_update():
    """A corrected score replaces the old one; new rows are counted"""
    conn = fresh()
    load(conn, WEEK1)
    corrected = [("2024-08-17", "Ashford City", "Bramley Rovers", 3, 1), ("2024-08-18", "Eastbrook Town", "Fairhaven FC", 1, 2)]
    assert load(conn, corrected) == 1
    row = conn.execute("SELECT home_goals FROM results WHERE home = 'Ashford City'").fetchone()
    assert row == (3,)
:::

:::quiz pipe-quiz Quick check
? What does it mean for a pipeline step to be idempotent?
- [x] Running it twice gives the same result as running it once
- [ ] It runs in a single transaction
- [ ] It never fails
> Idempotent steps can be retried safely after a failure.

? A new batch contains "Fairhaven F.C." instead of "Fairhaven FC". What should the pipeline do?
- [x] Reject (quarantine) the batch and alert, or map the name explicitly; never load it silently
- [ ] Load it; the model will cope
- [ ] Drop those rows without telling anyone
> Silently creating a new "team" corrupts features and predictions.

? Why use the match's natural key as the primary key and upsert?
- [x] Re-runs don't duplicate rows, and corrected data overwrites mistakes
- [ ] It makes queries faster than any other design
- [ ] SQLite requires it
> The key defines what "the same match" means.

? When is an orchestrator such as Prefect, Dagster or Airflow worth it over a cron job?
- [x] When there are many dependent steps that need retries, backfills and monitoring
- [ ] Always, even for one small script
- [ ] Never; cron can do everything
> Start simple; add an orchestrator when the pipeline grows.
:::
