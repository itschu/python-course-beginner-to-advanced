# PyPath: Python to Machine Learning

A Next.js site that teaches Python from zero to professional machine learning, with a backend track
(FastAPI) for serving models. Every lesson has runnable code, exercises checked by automatic tests,
and quizzes. Each phase ends with a project and a checkpoint test.

Python runs **in the browser** with [Pyodide](https://pyodide.org/) (NumPy, pandas, scikit-learn,
Matplotlib, SciPy, statsmodels, Pydantic, FastAPI and more), so there's no server to run code on and
nothing for learners to install.

## The course

| Phase | Topic | Lessons | Exercises |
| --- | --- | --- | --- |
| 1 | Python Foundations | 14 | 47 |
| 2 | Professional Python (OOP, testing, tooling) | 10 | 25 |
| 3 | Data Analysis with NumPy, pandas & Matplotlib | 10 | 32 |
| 4 | Math & Statistics for ML | 9 | 28 |
| 5 | Machine Learning with scikit-learn | 13 | 30 |
| 6 | Applied ML: Time Series, Betting & Trading | 10 | 28 |
| 7 | Deep Learning with PyTorch (Colab) | 12 | 29 |
| 8 | Python for the Backend (FastAPI) | 10 | 26 |
| 9 | Capstone & Career | 8 | 23 |

96 lessons and 268 auto-graded exercises in total. The running example throughout the applied phases
is a football prediction and value-betting system, with an EUR/USD dataset for trading; general
examples are used everywhere else. Phase 9 puts it all together: system design, a data pipeline, a
season-long simulation with weekly retraining, champion/challenger evaluation and monitoring, then
portfolio, Kaggle, research papers, interviews and a final exam.

Resources for every phase (courses, books, videos, docs, tools) are listed on the site's
**Resources** page and in [`content/curriculum.ts`](content/curriculum.ts).

## Run it locally

Requires Node.js 20.9+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Progress is saved in your browser; see below to add accounts.

## Checking the content

Every code example and exercise is executed by a validator that uses the same grading harness as the
browser. For each exercise, the solution must pass all tests and the starter code must fail at least
one. Code that prints a warning (including deprecation warnings) also fails, because learners would see it.

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/validate_content.py           # everything
.venv/bin/python scripts/validate_content.py --phase python-foundations
```

The validator runs in CPython with browser-like restrictions (no threads, no network, no OpenSSL
functions). To check the content in real Pyodide too, including how long each cell takes in
WebAssembly, download the full Pyodide release matching `public/pyodide-worker.js` from
[GitHub](https://github.com/pyodide/pyodide/releases), extract it, and run:

```bash
.venv/bin/python scripts/validate_content.py --export-jobs jobs.json
PYODIDE_DIR=/path/to/pyodide node scripts/check_pyodide.mjs jobs.json
```

The datasets in `public/data/` are synthetic and reproducible: `npm run data` runs
`scripts/generate_datasets.py` and then `scripts/generate_model_predictions.py` (the Phase 6 goal-model
predictions, which depend on `matches.csv`).

## Project structure

```text
app/                    Next.js routes (home, course, lessons, playground, resources, progress)
components/python/      Code editor, runnable cells, exercises, output panel
components/lesson/      Lesson renderer, quizzes, completion
components/progress/    Progress store (browser storage, synced to the database when signed in)
content/                Lessons (Markdown) and curriculum.ts (phases and resources)
lib/                    Lesson parser, Markdown rendering, Python runner client, progress model
public/pyodide-worker.js   Web worker that runs Python
public/pyodide-harness.py  Grading harness (runs code, captures output and charts, runs tests)
public/data/            Datasets lessons can open as "data/<file>"
notebooks/              Colab notebooks for the PyTorch lessons (built from notebooks/src/)
backend/                Companion FastAPI project for Phase 8 (its own README, tests and Dockerfile)
scripts/                Content validator, dataset generators, notebook builder
```

Lesson format: see [`content/README.md`](content/README.md).

## Companion backend project

Phase 8 teaches FastAPI in the browser; [`backend/`](backend/README.md) is the same match-prediction
service laid out as a real project, with settings from environment variables, a database, API keys,
a pytest suite and a Dockerfile:

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python -m training.train_model
pytest -q && uvicorn app.main:app --reload
```

## Colab notebooks

PyTorch doesn't run in the browser, so the deep learning lessons from Phase 7 lesson 6 onwards come
with Google Colab notebooks. Each lesson's **Open in Colab** button opens
`notebooks/<name>.ipynb` from GitHub (the `main` branch by default; set `NEXT_PUBLIC_REPO_BRANCH` to
change it). The notebooks load the course datasets from the `main` branch on GitHub (`DATA_URL` at the
top of each notebook).

Notebooks are generated from plain Python sources in `notebooks/src/` ("percent" format: `# %%`
starts a code cell, `# %% [markdown]` a Markdown cell). Edit the source, then rebuild:

```bash
npm run notebooks                       # rebuilds notebooks/*.ipynb
python notebooks/src/07-06-pytorch-basics.py   # run a source directly (needs PyTorch)
```

## Accounts and cloud progress (optional)

Without a database the site works fully and saves progress in the browser (with export/import on the
**My progress** page). Add a Postgres database to let learners create accounts and sync progress and
saved code across devices. Accounts use [Better Auth](https://www.better-auth.com/) with
email/password, plus optional "Continue with GitHub".

### Deploy to Vercel

1. Import this repository in Vercel (framework: Next.js, default settings). It deploys and works
   straight away with browser-only progress.
2. In the Vercel project, open **Storage** and add a **Neon** Postgres database (free tier). This sets
   `DATABASE_URL` for you.
3. In **Settings → Environment Variables**, add:
   - `BETTER_AUTH_SECRET`: a long random string (`openssl rand -base64 32`)
   - `BETTER_AUTH_URL`: your site's URL, e.g. `https://your-app.vercel.app`
4. Redeploy. The build runs `scripts/migrate.mjs`, which creates the tables automatically, and a
   **Sign in** button appears in the header.
5. Optional, GitHub sign-in: create an OAuth app at https://github.com/settings/developers with the
   callback URL `https://your-app.vercel.app/api/auth/callback/github`, then set `GITHUB_CLIENT_ID`
   and `GITHUB_CLIENT_SECRET` and redeploy.

### Locally

Copy `.env.example` to `.env.local`, fill in `DATABASE_URL` and `BETTER_AUTH_SECRET` (any Postgres
works, e.g. `vercel env pull` to reuse the Neon database, or a local Postgres), then:

```bash
npm run db:migrate   # create the tables
npm run dev
```

### How sync works

- Progress is always saved in the browser first, so the site keeps working offline.
- Signing in merges the browser's guest progress into the account. Changes are sent to
  `/api/progress` a moment later.
- Merging never loses work: a passed exercise stays passed, the best quiz score wins, and saved code
  comes from the most recent edit. The server merges too, so two devices can't overwrite each other.
- Signing out removes the account's progress from that browser, and progress from one account is
  never merged into another.

Tables: Better Auth's `user`, `session`, `account` and `verification`, plus `lesson_progress`
([`db/schema.sql`](db/schema.sql)).

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | Postgres connection string. Enables accounts and sync. |
| `BETTER_AUTH_SECRET` | Secret for signing sessions. Required for accounts. |
| `BETTER_AUTH_URL` | Public URL of the site. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Optional. Enables "Continue with GitHub". |
| `NEXT_PUBLIC_PYODIDE_INDEX_URL` | Optional. Where to load Pyodide from (defaults to the jsDelivr CDN, v314.0.7). |
| `NEXT_PUBLIC_REPO`, `NEXT_PUBLIC_REPO_BRANCH` | Optional. Used for "Open in Colab" and GitHub links (defaults: `itschu/python-course-beginner-to-advanced`, `main`). |

See [`.env.example`](.env.example).
