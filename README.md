# PyPath: Python, Rust, Machine Learning and Embedded Systems

A Next.js site that teaches Python and Rust from zero to advanced, machine learning from first principles to
deployed models, and embedded systems, ending with your own models running inside microcontroller firmware. Every
lesson has runnable code, exercises checked by automatic tests, and quizzes. Each phase ends with a project and a
checkpoint test.

Nothing needs installing to follow along:

- **Python** runs **in the browser** with [Pyodide](https://pyodide.org/) (NumPy, pandas, scikit-learn, Matplotlib,
  SciPy, statsmodels, Pydantic, FastAPI and more).
- A **simulated Raspberry Pi Pico** runs MicroPython-style code in the browser too: the standard `machine` module
  (pins, PWM, ADC, I2C sensors, UART, timers, watchdog) plus a `pico_sim` module to press buttons, set sensor
  readings and inspect pin history.
- **Rust** compiles and runs on the official [Rust Playground](https://play.rust-lang.org/); Rust exercises are
  graded with `cargo test`.

## The course

| Phase | Topic | Lessons | Exercises |
| --- | --- | --- | --- |
| 1 | Python Foundations | 14 | 47 |
| 2 | Professional Python (OOP, testing, tooling) | 10 | 25 |
| 3 | Data Analysis with NumPy, pandas & Matplotlib | 10 | 32 |
| 4 | Math & Statistics for ML | 9 | 28 |
| 5 | Machine Learning with scikit-learn | 13 | 30 |
| 6 | Applied ML: Time Series, Betting & Trading, Responsible ML | 11 | 30 |
| 7 | Deep Learning with PyTorch (Colab), computer vision, embeddings and RAG | 14 | 33 |
| 8 | Python for the Backend (FastAPI) | 10 | 26 |
| 9 | Rust Foundations | 12 | 34 |
| 10 | Professional Rust (traits, generics, lifetimes, concurrency, async, unsafe) | 12 | 24 |
| 11 | Rust for Machine Learning (models from scratch, PyO3, deployment) | 10 | 16 |
| 12 | Embedded Systems (electronics, MicroPython, embedded Rust, Embassy) | 12 | 27 |
| 13 | Edge AI & TinyML (int8 models on microcontrollers) | 9 | 14 |
| 14 | Capstone & Career (server or device capstone, two-part final exam) | 10 | 27 |

156 lessons and 393 auto-graded exercises in total, plus an optional elective:

| Elective | Topic | Lessons | Exercises |
| --- | --- | --- | --- |
| E1 | Meme Coin Trading Bots in Rust (after Phase 11, Rust only) | 10 | 21 |

Electives sit outside the main path and don't count towards course progress. Signed-out visitors see a locked
preview (the lesson list and summaries); signed-in learners choose to take an elective, and can leave it again
(their progress is kept). Choices are stored in the `elective_enrollment` table. When accounts aren't configured
(no database), there's nobody to sign in, so electives are open to everyone.

- **Phases 1–8** take you from your first line of Python to training, evaluating and serving ML models. The running
  example in the applied phases is a football prediction and value-betting system, with an EUR/USD dataset for
  trading.
- **Phases 9–10** teach Rust from zero, always compared with the Python you already know, up to professional
  topics: traits and generics, lifetimes, iterators, smart pointers, threads, how async compiles, unsafe and FFI.
- **Phase 11** puts Rust to work on ML: matrices, linear and logistic regression and a backpropagation network in
  plain Rust, the Rust ML ecosystem (ndarray, Polars, linfa, Candle, Burn), PyO3 extensions, and porting the
  Phase 5 match model to Rust with bit-for-bit checks against Python.
- **Phase 12** covers embedded systems: electronics essentials; MicroPython on a (simulated) Pico with GPIO,
  debouncing, interrupts, timers, state machines, ADC, PWM, I2C, SPI and UART; and embedded Rust: `no_std`, PACs,
  HALs, `embedded-hal` drivers, typestate, Embassy and reliable firmware. The project is a weather station.
- **Phase 13** joins the two halves: integer-only features from accelerometer data, a tiny neural network, int8
  quantization with fixed-point requantization, export to Rust source, bit-exact integer inference in Rust, and an
  Embassy deployment plan. The project is an end-to-end gesture recogniser.
- **Phase 14** is the capstone (a live-season ML system, or a model shipped on a device), careers in ML,
  embedded and Rust, and a two-part final exam.
- **Elective E1** builds a meme coin trading bot in Rust, honestly: constant-product pool maths in integers, a
  seeded launch simulator with rug pulls and survivorship bias, fees, slippage and sandwich attacks, on-chain risk
  signals, a rug-pull classifier evaluated walk-forward, an event-driven bot with a risk manager, a realistic
  backtester, and how to go live safely (key handling, paper trading). Every runnable example uses simulated data.

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

Rust cells and exercises are compiled locally with `rustc` (edition 2024, debug mode, like the Rust Playground),
so you need [Rust](https://rustup.rs/) installed. They may only use the standard library; anything needing crates or
hardware is marked `rust static`. Runnable Rust must compile without warnings.

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
app/                    Next.js routes (home, course, lessons, electives, playground, resources, progress)
components/python/      Code editor, runnable cells, exercises, output panel
components/lesson/      Lesson renderer, quizzes, completion
components/progress/    Progress store (browser storage, synced to the database when signed in)
content/                Lessons (Markdown) and curriculum.ts (phases and resources)
lib/                    Lesson parser, Markdown rendering, Python runner client, progress model
public/pyodide-worker.js   Web worker that runs Python
public/pyodide-harness.py  Grading harness (runs code, captures output and charts, runs tests)
public/micropython-sim.py  Simulated Raspberry Pi Pico: machine, micropython and pico_sim modules
public/sw.js               Service worker that caches Pyodide's files, so Python downloads once per version
lib/rust-runner.ts      Runs Rust on the Rust Playground and grades exercises with cargo test
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

PyTorch doesn't run in the browser, so most deep learning lessons from Phase 7 lesson 6 onwards come
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

1. Import this repository in Vercel. `vercel.json` declares two Vercel Services: the Next.js site and the
   FastAPI backend (served under `/match-api`), so set the project's Framework Preset to "Services". It deploys and works
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
| `NEXT_PUBLIC_PYODIDE_INDEX_URL` | Optional. Where to load Pyodide from (defaults to the jsDelivr CDN, v314.0.7). The service worker only caches files from jsDelivr. |
| `NEXT_PUBLIC_RUST_PLAYGROUND_URL` | Optional. Where Rust code is compiled (defaults to `https://play.rust-lang.org`). Any server with the Playground's `/execute` API works. |
| `NEXT_PUBLIC_REPO`, `NEXT_PUBLIC_REPO_BRANCH` | Optional. Used for "Open in Colab" and GitHub links (defaults: `itschu/python-course-beginner-to-advanced`, `main`). |

See [`.env.example`](.env.example).
