---
title: Configuration, logging and deployment
summary: Configure apps from environment variables, add request IDs, timing and structured logs with middleware, set up CORS correctly, run with uvicorn and Docker, and deploy to a hosting platform with a managed database.
minutes: 55
kind: lesson
---

Code that works on your laptop isn't a service yet. To run it for real you need configuration that changes between environments, logs you can search when something breaks, the right security headers, and a repeatable way to package and ship it. The companion project in `backend/` puts all of this together; this lesson explains each piece.

## Configuration from the environment

The same code runs in development, testing and production with different databases, keys and limits. The standard approach (the "twelve-factor app"): read configuration from **environment variables**, validate it at startup, and never hard-code secrets.

In the companion project, `pydantic-settings` does this in a few lines:

```python static
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")    # also reads a local .env file

    database_url: str = "sqlite:///./predictions.db"      # from DATABASE_URL
    api_key_hashes: str                                    # required: startup fails if it's missing
    max_batch_size: int = 100                              # "250" in the environment becomes 250
```

The same idea in plain Pydantic, which runs here (the browser has no environment variables, so we pass a dict):

```python
from pydantic import BaseModel, Field, ValidationError, field_validator

class Settings(BaseModel):
    database_url: str
    debug: bool = False
    max_batch_size: int = Field(100, ge=1, le=1000)
    allowed_origins: list[str] = []

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_commas(cls, value):
        return [v.strip() for v in value.split(",") if v.strip()] if isinstance(value, str) else value

def load_settings(env: dict[str, str]) -> Settings:
    return Settings(**{key.lower(): value for key, value in env.items()})

production = {"DATABASE_URL": "postgresql+psycopg://app@db/matches", "DEBUG": "false",
              "MAX_BATCH_SIZE": "250", "ALLOWED_ORIGINS": "https://pypath.app, https://admin.pypath.app"}
print(load_settings(production))

try:
    load_settings({"MAX_BATCH_SIZE": "lots"})
except ValidationError as e:
    print("refusing to start:", [(err["loc"][0], err["msg"]) for err in e.errors()])
```

Failing at startup with a clear message is far better than failing on the first request. Keep a `.env.example` in git listing every variable, and the real `.env` out of it (`.gitignore`).

## Logging, request IDs and timing

When a user reports "it failed at 14:03", logs are how you find out why. Two habits make logs useful:

- **Log every request** with its method, path, status and duration.
- Give each request a **request ID**, return it in a response header, and include it in every log line, so you can follow one request through the logs (and across services).

**Middleware** wraps every request, which makes it the right place for this:

```python
import logging
import time
import uuid

import httpx
from fastapi import FastAPI, Request

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s", force=True)
logging.getLogger("httpx").setLevel(logging.WARNING)     # keep the client library quiet
log = logging.getLogger("api")

app = FastAPI()

@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)                    # run the endpoint
    elapsed_ms = 1000 * (time.perf_counter() - start)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-ms"] = f"{elapsed_ms:.1f}"
    log.info("%s %s -> %s in %.1fms [%s]", request.method, request.url.path, response.status_code, elapsed_ms, request_id)
    return response

@app.get("/teams/{team_id}")
async def team(team_id: int):
    return {"id": team_id}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    r = await client.get("/teams/3")
    print("headers:", r.headers["x-request-id"], r.headers["x-response-time-ms"])
    r = await client.get("/teams/3", headers={"X-Request-ID": "from-the-front-end"})
    print("passed through:", r.headers["x-request-id"])
    await client.get("/teams/abc")
```

In production, log in **JSON** (one object per line) so log platforms can search by field, send logs to standard output (the platform collects them), and never log secrets: passwords, tokens, full API keys.

## CORS: letting your front end call your API

Browsers stop a web page from reading responses from a *different* origin (domain, protocol or port) unless the API says it's allowed. That's **CORS** (cross-origin resource sharing). If your front end at `https://pypath.app` calls an API at `https://api.pypath.app`, the API must allow that origin:

```python
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://pypath.app"],         # exact origins; never "*" together with credentials
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)

@app.get("/teams")
async def teams():
    return ["Ashford City", "Bramley Rovers"]

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    for origin in ["https://pypath.app", "https://evil.example"]:
        # Browsers send this "preflight" request before cross-origin calls with custom headers
        pre = await client.options("/teams", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
        get = await client.get("/teams", headers={"Origin": origin})
        print(f"{origin}: preflight {pre.status_code}, GET {get.status_code}, "
              f"allow-origin header: {get.headers.get('access-control-allow-origin')}")
```

Notice that the GET from the disallowed origin still returns 200: the server answers, but without the `access-control-allow-origin` header the **browser** refuses to let the page read it. CORS protects users' browsers from malicious pages; it is **not** access control. Scripts, curl and other servers ignore it entirely, so protected endpoints still need authentication.

## Running in production

`uvicorn app.main:app --reload` is for development. In production:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

- `--host 0.0.0.0` listens on all network interfaces (needed inside a container).
- `--workers` runs several processes, so CPU-heavy requests don't block each other. A common starting point is one or two per CPU core. On container platforms, many people run one worker per container and scale the number of containers instead.
- Put the app behind HTTPS. Hosting platforms terminate TLS for you; on your own server, use a reverse proxy such as Caddy or nginx.

## Docker

A container image packages the code, the Python version and every dependency, so it runs the same everywhere. This is the companion project's `Dockerfile`:

```dockerfile
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Dependencies first: this layer is cached until requirements.txt changes
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY training ./training
COPY data ./data
RUN python -m training.train_model             # the model is trained into the image

RUN useradd --create-home appuser && chown -R appuser /app
USER appuser                                   # don't run as root

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

```bash
docker build -t match-api .
docker run -p 8000:8000 -e API_KEY_HASHES=<hash of your key> match-api
```

To run the API together with PostgreSQL locally, **Docker Compose** describes both services:

```yaml
# compose.yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql+psycopg://app:secret@db:5432/matches
      API_KEY_HASHES: ${API_KEY_HASHES}
    depends_on: [db]
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: matches
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

`docker compose up` starts both; the API reaches the database at the hostname `db`. (Add `psycopg[binary]` to the requirements for PostgreSQL.)

## Deploying

Most platforms deploy straight from a GitHub repository or a Docker image:

| Platform | Good for |
| --- | --- |
| Render, Railway | Simplest: connect the repo, set environment variables, get an HTTPS URL. Managed PostgreSQL available. |
| Fly.io | Containers close to users, with a generous free allowance for small apps. |
| Google Cloud Run, AWS App Runner, Azure Container Apps | Serverless containers that scale to zero; pay per request. |
| A virtual server (Hetzner, DigitalOcean) | Full control and lowest cost; you manage updates, TLS and backups. |

Whichever you choose:

1. **Use a managed database** (Neon, Supabase, or the platform's own). A SQLite file inside a container disappears when the container is replaced.
2. **Set secrets as environment variables** in the platform's dashboard, never in the repository.
3. **Point the platform's health check at `/health`**, so broken deployments are caught and restarted.
4. **Run tests in CI** before every deploy (lesson 6), and deploy automatically only when they pass.
5. **Watch it**: logs, error tracking (Sentry has a free tier and a FastAPI integration), and the model monitoring from Phase 6.

## Practice

:::exercise dep-settings Validated settings
Write a Pydantic model `Settings` with `database_url` (str, required), `debug` (bool, default `False`), `max_batch_size` (int, default 100, between 1 and 1000) and `api_keys` (list of str, default empty), where a comma-separated string like `"a, b"` becomes `["a", "b"]`. Then write `load_settings(env)` that builds it from a dict of environment variables with upper-case names (`DATABASE_URL`, `DEBUG`, …).

@@starter
from pydantic import BaseModel, Field, field_validator

class Settings(BaseModel):
    pass

def load_settings(env):
    return Settings()

@@solution
from pydantic import BaseModel, Field, field_validator

class Settings(BaseModel):
    database_url: str
    debug: bool = False
    max_batch_size: int = Field(100, ge=1, le=1000)
    api_keys: list[str] = []

    @field_validator("api_keys", mode="before")
    @classmethod
    def split_commas(cls, value):
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

def load_settings(env):
    return Settings(**{key.lower(): value for key, value in env.items()})

@@tests
from pydantic import ValidationError

def test_parses_strings():
    """Environment values are strings; they're converted"""
    s = load_settings({"DATABASE_URL": "sqlite://", "DEBUG": "true", "MAX_BATCH_SIZE": "250", "API_KEYS": "k1, k2,,k3"})
    assert s.database_url == "sqlite://" and s.debug is True and s.max_batch_size == 250
    assert s.api_keys == ["k1", "k2", "k3"]

def test_defaults():
    """Only DATABASE_URL is required"""
    s = load_settings({"DATABASE_URL": "sqlite://"})
    assert s.debug is False and s.max_batch_size == 100 and s.api_keys == []

def test_rejects_bad_config():
    """Missing or invalid values fail at startup"""
    for env in [{}, {"DATABASE_URL": "x", "MAX_BATCH_SIZE": "0"}, {"DATABASE_URL": "x", "DEBUG": "maybe"}]:
        try:
            load_settings(env)
        except ValidationError:
            continue
        raise AssertionError(f"{env} should be rejected")
:::

:::exercise dep-middleware Request IDs
Add an HTTP middleware to the starter `app` that sets an `X-Request-ID` response header on **every** response: the value of the incoming `X-Request-ID` header if there is one, otherwise a new random hex string of at least 8 characters (`uuid.uuid4().hex` works).

@@starter
import uuid

from fastapi import FastAPI, Request

app = FastAPI()

@app.get("/ping")
async def ping():
    return {"pong": True}

@@solution
import uuid

from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

@app.get("/ping")
async def ping():
    return {"pong": True}

@@tests
import httpx

async def get(path, headers=None):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path, headers=headers or {})

async def test_generated():
    """A new ID when none is sent, different each time"""
    a, b = await get("/ping"), await get("/ping")
    assert len(a.headers["x-request-id"]) >= 8 and a.headers["x-request-id"] != b.headers["x-request-id"]

async def test_passed_through_and_on_errors():
    """Incoming IDs are kept, and 404s get one too"""
    assert (await get("/ping", {"X-Request-ID": "abc123"})).headers["x-request-id"] == "abc123"
    missing = await get("/nope")
    assert missing.status_code == 404 and "x-request-id" in missing.headers
:::

:::quiz dep-quiz Quick check
? Where should an API's database password live?
- [x] In an environment variable (or the platform's secret store), read at startup
- [ ] In `config.py`, committed to git
- [ ] In the README so the team can find it
> Secrets in a repository leak: through forks, history and accidental pushes.

? Your API allows only `https://pypath.app` in its CORS settings. A script on someone's laptop calls it with curl. What happens?
- [x] The request works as normal: CORS is enforced by browsers, not servers
- [ ] The server rejects it with a CORS error
- [ ] The script needs to send an Origin header to get in
> CORS protects users' browsers; protected endpoints still need authentication.

? Why give each request an ID and include it in logs and the response?
- [x] So one request can be traced through all the log lines it produced
- [ ] It makes requests faster
- [ ] HTTP requires it
> When a user reports an error, the ID takes you straight to the right logs.

? Why is a SQLite file inside a container a bad production database on most hosting platforms?
- [x] The file is lost when the container is replaced, for example on every deploy
- [ ] SQLite can't store numbers
- [ ] Containers can't open files
> Use a managed database, or at least a persistent volume.
:::
