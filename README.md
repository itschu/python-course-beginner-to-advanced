# PyPath: Python to Machine Learning

A Next.js site that teaches Python from zero to professional machine learning, with a backend track
(FastAPI) for serving models. Every lesson has runnable code, exercises checked by automatic tests,
and quizzes. Each phase ends with a project and a checkpoint test.

Python runs **in the browser** with [Pyodide](https://pyodide.org/) (NumPy, pandas, scikit-learn,
Matplotlib, SciPy, statsmodels, Pydantic, FastAPI and more), so there's no server to run code on and
nothing for learners to install.

## The course

| Phase | Topic |
| --- | --- |
| 1 | Python Foundations |
| 2 | Professional Python (OOP, testing, tooling) |
| 3 | Data Analysis with NumPy, pandas & Matplotlib |
| 4 | Math & Statistics for ML |
| 5 | Machine Learning with scikit-learn |
| 6 | Applied ML: Time Series, Betting & Trading |
| 7 | Deep Learning with PyTorch (Colab) |
| 8 | Python for the Backend (FastAPI) |
| 9 | Capstone & Career |

Resources for every phase (courses, books, videos, docs, tools) are listed on the site's
**Resources** page and in [`content/curriculum.ts`](content/curriculum.ts).

## Run it locally

Requires Node.js 20.9+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Progress is saved in your browser.

## Checking the content

Every code example and exercise is executed by a validator that uses the same grading harness as the
browser. For each exercise, the solution must pass all tests and the starter code must fail at least
one.

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/validate_content.py           # everything
.venv/bin/python scripts/validate_content.py --phase python-foundations
```

The datasets in `public/data/` are synthetic and reproducible: `python scripts/generate_datasets.py`.

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
scripts/                Content validator and dataset generator
```

Lesson format: see [`content/README.md`](content/README.md).

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PYODIDE_INDEX_URL` | Optional. Where to load Pyodide from (defaults to the jsDelivr CDN, v314.0.7). |
| `NEXT_PUBLIC_REPO`, `NEXT_PUBLIC_REPO_BRANCH` | Optional. Used for "Open in Colab" and GitHub links (defaults: `itschu/python-course-beginner-to-advanced`, `main`). |
