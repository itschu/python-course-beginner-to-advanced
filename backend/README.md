# Match Predictions API

The companion project for **Phase 8** of the PyPath course. It's a small but production-shaped
FastAPI service that serves the Poisson goal model from Phase 6:

- `GET /health` and `GET /teams` (public)
- `GET /predictions?home=…&away=…`, `POST /predictions/batch` and `GET /predictions/log`
  (need an API key in the `X-API-Key` header)
- every prediction is logged to a database, with the model version, for later evaluation
- configuration from environment variables, request IDs and timing logs, CORS, tests, and a Dockerfile

The lessons build each piece in the browser; this folder puts them together the way you'd lay out
a real project.

## Run it locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python -m training.train_model       # trains on data/matches.csv, writes models/match_model.joblib
uvicorn app.main:app --reload        # http://localhost:8000
```

Open <http://localhost:8000/docs> for interactive documentation. Click **Authorize** and enter the
development key `dev-key` to try the protected endpoints, or use curl:

```bash
curl http://localhost:8000/health
curl -H "X-API-Key: dev-key" "http://localhost:8000/predictions?home=Fairhaven%20FC&away=Lakeside%20Rangers"
curl -H "X-API-Key: dev-key" -H "Content-Type: application/json" \
     -d '{"fixtures": [{"home": "Ashford City", "away": "Bramley Rovers"}]}' \
     http://localhost:8000/predictions/batch
curl -H "X-API-Key: dev-key" "http://localhost:8000/predictions/log?limit=5"
```

## Tests

```bash
pytest -q
```

The tests train the model once, give every test a fresh in-memory database and a test API key
through `app.dependency_overrides`, and call the app in memory with `httpx.AsyncClient`. Warnings are
treated as errors (see `pyproject.toml`), so deprecated calls fail the build.

## Configuration

Settings are read from environment variables, or from a `.env` file (copy `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./predictions.db` | Any SQLAlchemy URL, e.g. `postgresql+psycopg://user:pass@host/db` (add `psycopg[binary]` to the requirements) |
| `MODEL_FILE` | `models/match_model.joblib` | The trained model bundle |
| `API_KEY_HASHES` | the hash of `dev-key` | Comma-separated SHA-256 hashes of valid keys |
| `MAX_BATCH_SIZE` | `100` | Largest batch accepted by `/predictions/batch` |

Create a real key and its hash:

```bash
python -c "import secrets; print('pp_' + secrets.token_urlsafe(24))"     # give this to the client
python -m app.security pp_the-key-you-just-made                          # put this in API_KEY_HASHES
```

**Change the key before deploying anywhere public**: `dev-key` is in this README.

## Docker

```bash
docker build -t match-api .
docker run -p 8000:8000 -e API_KEY_HASHES=<your hash> match-api
```

The image installs the dependencies, trains the model at build time, runs as a non-root user, and has
a health check. For anything beyond a demo, point `DATABASE_URL` at a managed PostgreSQL database
(Neon, Supabase, or your cloud provider's): a SQLite file inside a container disappears when the
container is replaced.

## Layout

```text
app/
  main.py            create_app(): lifespan (loads the model), middleware, routers
  config.py          Settings from environment variables (pydantic-settings)
  db.py              SQLAlchemy engine, PredictionLog table, get_session dependency
  ml.py              GoalModel: load the bundle, vectorised predictions; design_rows shared with training
  schemas.py         Pydantic request and response models
  security.py        API-key dependency (and a helper to hash new keys)
  routers/meta.py    /health, /teams
  routers/predictions.py   /predictions, /predictions/batch, /predictions/log
training/train_model.py    fits the model and saves the bundle
tests/               pytest suite with fixtures in conftest.py
data/matches.csv     the course's synthetic league (a copy of public/data/matches.csv)
```

The prediction endpoints are plain `def` functions, so FastAPI runs them in a thread pool and the
event loop stays free while they do CPU and database work. The browser runner used in the lessons
has no threads, which is why the lessons write `async def` everywhere.

## Ideas to extend it

1. Add `POST /results` to record final scores, and `GET /metrics` that computes the log loss of
   logged predictions against results (Phase 6, lesson 8).
2. Add a value-bet endpoint that takes bookmaker odds and returns bets with positive expected value.
3. Move to PostgreSQL with Docker Compose, and manage the schema with Alembic migrations.
4. Retrain on a schedule and serve the new version alongside the old one, comparing them on live data.
