---
title: How the web works, and what an API is
summary: Clients and servers, URLs, HTTP methods, status codes, headers and JSON, REST design, and what a web framework actually does, ending with your first FastAPI endpoint running in the browser.
minutes: 45
kind: lesson
---

A model in a notebook helps one person. Put it behind a **web API** and any app can use it: a website, a phone app, a spreadsheet, a trading bot. That's what this phase is about: building backend services in Python with **FastAPI**, the most popular modern Python web framework.

FastAPI runs right here in your browser, so every example is live. A companion project in the course repository (`backend/`) runs the same ideas on your own machine.

## Clients, servers and HTTP

When your browser loads a page or an app fetches data, a **client** sends a **request** to a **server**, which sends back a **response**. They speak **HTTP**. A request has:

- a **method**: what you want to do,
- a **URL**: what you want to do it to,
- **headers**: extra information (who you are, what format you want),
- optionally a **body**: data you're sending, usually JSON.

A response has a **status code**, headers and usually a body.

```text
GET /teams/7/matches?season=2024-25 HTTP/1.1          <- method, path and query, protocol
Host: api.example.com                                  <- headers
Authorization: Bearer eyJhbGciOi...
Accept: application/json

HTTP/1.1 200 OK                                        <- status code
Content-Type: application/json

[{"date": "2024-08-17", "opponent": "Lakeside Rangers", "goals_for": 2, "goals_against": 1}]
```

## URLs

```python
from urllib.parse import parse_qs, urlencode, urlparse

url = "https://api.example.com:8443/teams/7/matches?season=2024-25&venue=home"
parts = urlparse(url)
print("scheme:", parts.scheme)       # https
print("host:  ", parts.hostname)     # api.example.com
print("port:  ", parts.port)         # 8443
print("path:  ", parts.path)         # /teams/7/matches
print("query: ", parse_qs(parts.query))

# Building a query string safely (spaces and symbols get encoded)
print("https://api.example.com/search?" + urlencode({"team": "Fairhaven FC", "limit": 5}))
```

- The **path** identifies a resource (`/teams/7/matches`).
- The **query string** after `?` holds optional parameters: filters, sorting, pagination.

## Methods

| Method | Meaning | Example |
| --- | --- | --- |
| `GET` | Read; must not change anything | `GET /matches?season=2024-25` |
| `POST` | Create something, or run an action | `POST /predictions` with a JSON body |
| `PUT` | Replace a resource completely | `PUT /teams/7` |
| `PATCH` | Change part of a resource | `PATCH /teams/7` with `{"stadium": "New Park"}` |
| `DELETE` | Delete | `DELETE /bets/42` |

`GET`, `PUT` and `DELETE` are meant to be **idempotent**: doing them twice has the same effect as once. `POST` isn't: posting a bet twice places two bets.

## Status codes

| Range | Meaning | Common ones |
| --- | --- | --- |
| 2xx | Success | `200 OK`, `201 Created`, `204 No Content` |
| 3xx | Redirect | `301 Moved Permanently`, `304 Not Modified` |
| 4xx | **The client** made a mistake | `400 Bad Request`, `401 Unauthorized` (not logged in), `403 Forbidden` (logged in, not allowed), `404 Not Found`, `422 Unprocessable Content` (invalid data), `429 Too Many Requests` |
| 5xx | **The server** failed | `500 Internal Server Error`, `503 Service Unavailable` |

Good APIs use these precisely: clients rely on them to decide what to do next.

## JSON

APIs almost always exchange **JSON**, which maps neatly onto Python's dicts, lists, strings, numbers, booleans and `None`:

```python
import json

prediction = {"home": "Fairhaven FC", "away": "Lakeside Rangers", "probs": {"H": 0.48, "D": 0.27, "A": 0.25}, "value_bet": None}
text = json.dumps(prediction)
print(text)                          # what travels over the network: a string
print(type(text).__name__, "->", type(json.loads(text)).__name__)
print(json.loads(text)["probs"]["H"])
```

## REST design

**REST** is a set of conventions for designing APIs around **resources** (nouns) rather than actions (verbs):

| Good (resources) | Avoid (verbs in URLs) |
| --- | --- |
| `GET /teams` | `GET /getAllTeams` |
| `GET /teams/7` | `GET /getTeam?id=7` |
| `POST /teams/7/ratings` | `POST /updateTeamRating` |
| `GET /matches?season=2024-25&team=7` | `GET /matchesForTeamInSeason/7/2024-25` |

Use plural nouns, nest related resources (`/teams/7/matches`), put filters in the query string, and let the method say what's happening.

## What a web framework does

Underneath, a Python web server calls your application as a function, using a standard called **ASGI**. Here's a complete web app with no framework at all:

```python
import json

import httpx

async def app(scope, receive, send):
    """A raw ASGI application: one function that handles every request."""
    if scope["type"] != "http":
        return
    if scope["method"] == "GET" and scope["path"] == "/hello":
        status, body = 200, {"message": "hello"}
    else:
        status, body = 404, {"detail": "Not Found"}
    await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": json.dumps(body).encode()})

# httpx can call an ASGI app directly, with no network involved
async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    for path in ["/hello", "/nope"]:
        response = await client.get(path)
        print(path, response.status_code, response.json())
```

Everything else is up to you: matching URLs, reading query parameters, parsing and validating JSON, turning errors into status codes, documenting the API. A framework does all of that for you.

## Your first FastAPI app

```python
import httpx
from fastapi import FastAPI

app = FastAPI(title="Match API")

@app.get("/hello")
async def hello(name: str = "world"):
    return {"message": f"Hello, {name}!"}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    print((await client.get("/hello")).json())
    print((await client.get("/hello", params={"name": "Ada"})).json())
    print((await client.get("/nope")).status_code)
```

The decorator `@app.get("/hello")` says "call this function for GET requests to `/hello`". The function's parameter `name: str = "world"` automatically becomes an optional query parameter, and the returned dict is converted to JSON. That's the FastAPI style: plain Python functions with type hints, and the framework does the HTTP work.

:::note Running FastAPI in the browser
In this course's browser runner there are no threads, so two rules apply to every example:

1. Write endpoints and dependencies as **`async def`**. (On a real server, plain `def` works too: FastAPI runs those in a thread pool.)
2. Call the app with **`httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")`** and `await`, as above. On a real server you'd run `uvicorn main:app` and visit `http://localhost:8000`.
:::

## Practice

:::exercise web-status Classify status codes
Write `status_category(code)` that returns `"success"` for 200–299, `"redirect"` for 300–399, `"client error"` for 400–499 and `"server error"` for 500–599. Raise `ValueError` for anything else.

@@starter
def status_category(code):
    pass

@@solution
def status_category(code):
    if 200 <= code <= 299:
        return "success"
    if 300 <= code <= 399:
        return "redirect"
    if 400 <= code <= 499:
        return "client error"
    if 500 <= code <= 599:
        return "server error"
    raise ValueError(f"not an HTTP status code: {code}")

@@tests
def test_categories():
    """Common codes"""
    assert status_category(200) == "success" and status_category(201) == "success"
    assert status_category(304) == "redirect"
    assert status_category(404) == "client error" and status_category(422) == "client error"
    assert status_category(503) == "server error"

def test_invalid():
    """Out-of-range codes raise ValueError"""
    for bad in (99, 600, 1000):
        try:
            status_category(bad)
        except ValueError:
            continue
        raise AssertionError(f"{bad} should raise ValueError")
:::

:::exercise web-url Build an API URL
Write `api_url(base, path, params=None)` that joins `base` (like `"https://api.example.com/"` or without the trailing slash) and `path` (like `"/teams/7"` or `"teams/7"`) with exactly one slash between them, and appends `params` (a dict) as an encoded query string with `urllib.parse.urlencode`, if it's given and not empty.

@@starter
from urllib.parse import urlencode

def api_url(base, path, params=None):
    return base + path

@@solution
from urllib.parse import urlencode

def api_url(base, path, params=None):
    url = base.rstrip("/") + "/" + path.lstrip("/")
    if params:
        url += "?" + urlencode(params)
    return url

@@tests
def test_slashes():
    """Exactly one slash between base and path"""
    for base in ["https://api.example.com", "https://api.example.com/"]:
        for path in ["teams/7", "/teams/7"]:
            assert api_url(base, path) == "https://api.example.com/teams/7"

def test_params():
    """Query strings are encoded"""
    assert api_url("https://x.io", "/search", {"team": "Fairhaven FC", "limit": 5}) == "https://x.io/search?team=Fairhaven+FC&limit=5"
    assert api_url("https://x.io", "/teams", {}) == "https://x.io/teams"
:::

:::exercise web-first A first endpoint
Create a FastAPI `app` with an endpoint `GET /odds/implied` that takes a query parameter `odds` (a float) and returns `{"odds": odds, "implied_probability": p}`, where `p` is `1 / odds` rounded to 4 decimal places. Remember: `async def`.

@@starter
from fastapi import FastAPI

app = FastAPI()

@@solution
from fastapi import FastAPI

app = FastAPI()

@app.get("/odds/implied")
async def implied(odds: float):
    return {"odds": odds, "implied_probability": round(1 / odds, 4)}

@@tests
import httpx

async def test_endpoint():
    """GET /odds/implied?odds=2.5"""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/odds/implied", params={"odds": 2.5})
        assert r.status_code == 200
        assert r.json() == {"odds": 2.5, "implied_probability": 0.4}

async def test_missing_parameter():
    """A missing or invalid odds parameter is a 422 error"""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/odds/implied")).status_code == 422
        assert (await client.get("/odds/implied", params={"odds": "evens"})).status_code == 422
:::

:::quiz web-quiz Quick check
? A client sends invalid JSON fields to your API. Which status range should the response use?
- [ ] 2xx
- [x] 4xx
- [ ] 5xx
> The client made the mistake. FastAPI uses 422 for validation errors.

? Which is the best REST-style URL for fetching one team's matches in a season?
- [x] `GET /teams/7/matches?season=2024-25`
- [ ] `GET /getTeamMatches?team=7&season=2024-25`
- [ ] `POST /teams/7/matches/get`
> Resources as nouns, filters in the query string, and the method says what's happening.

? Why should `GET` requests never change data?
- [x] Clients, caches and crawlers assume GETs are safe to repeat or prefetch
- [ ] GET requests can't carry data
- [ ] It's faster
> Use POST, PUT, PATCH or DELETE for changes.

? What's the difference between 401 and 403?
- [x] 401: you're not authenticated; 403: you're authenticated but not allowed
- [ ] They mean the same thing
- [ ] 401 is a server error
> Who are you? versus You can't do that.
:::
