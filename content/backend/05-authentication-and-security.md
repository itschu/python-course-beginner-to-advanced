---
title: Authentication and security
summary: Hash passwords properly, protect endpoints with API keys, issue and verify signed bearer tokens (the JWT format, built from the standard library), restrict access by role, and the security checklist every API needs.
minutes: 60
kind: lesson
---

An API that changes data or reveals anything private must know **who** is calling (**authentication**) and **what they're allowed to do** (**authorisation**). Getting this wrong is how data leaks happen, so this lesson builds each piece from first principles, then shows the standard libraries to use in production.

## Storing passwords: hash, salt, and slow down

Never store passwords as plain text, and never with a fast hash like plain SHA-256: attackers who steal the database can test billions of guesses per second. Use a **slow, salted** password hash such as **bcrypt**:

- A **salt** (random bytes stored with the hash) makes identical passwords hash differently, which defeats precomputed tables.
- A **cost factor** makes each guess deliberately expensive, and can be raised as computers get faster.

```python
import time

import bcrypt

def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=rounds)).decode()

def verify_password(password: str, stored: str) -> bool:
    return bcrypt.checkpw(password.encode(), stored.encode())

stored = hash_password("correct horse battery staple")
print(stored)
print("same password, different hash:", hash_password("correct horse battery staple") != stored)
print("right password:", verify_password("correct horse battery staple", stored))
print("wrong password:", verify_password("Tr0ub4dor&3", stored))

start = time.perf_counter()
verify_password("guess", stored)
print(f"one check takes {1000 * (time.perf_counter() - start):.0f} ms: fine for a login, painful for an attacker")
```

A bcrypt hash is self-describing: `$2b$` is the algorithm version, `12` is the cost (2¹² rounds of work), and the rest is the 22-character salt followed by the hash itself. So `checkpw` needs nothing but the password and the stored string. (bcrypt only uses a password's first 72 bytes; recent versions raise an error for longer ones, so cap the length in your input model.)

:::tip In production
bcrypt is a solid choice. **Argon2** is the newer standard; FastAPI's documentation recommends the `pwdlib` package with Argon2: `PasswordHash.recommended().hash(password)` and `.verify(password, hash)`. Whatever you use, compare secrets with `hmac.compare_digest` (or the library's own check), which takes the same time whether the first or the last character differs, so response times leak nothing.
:::

## API keys

For machine-to-machine access (a trading bot calling your prediction API), an **API key** is simplest: a long random secret the client sends in a header with every request. FastAPI's `APIKeyHeader` reads it, and a dependency checks it:

```python
import hashlib
import secrets

import httpx
from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader

# Store only hashes of keys, like passwords (keys are long and random, so a fast hash is fine here)
new_key = "pp_" + secrets.token_urlsafe(24)
KEY_HASHES = {hashlib.sha256(new_key.encode()).hexdigest(): "trading-bot"}

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def require_api_key(key: str | None = Security(api_key_header)) -> str:
    client = KEY_HASHES.get(hashlib.sha256(key.encode()).hexdigest()) if key else None
    if client is None:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return client

app = FastAPI()

@app.get("/predictions/today")
async def todays_predictions(client: str = Depends(require_api_key)):
    return {"client": client, "predictions": [{"match": "Fairhaven v Lakeside", "H": 0.48}]}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:
    print((await http.get("/predictions/today")).status_code)
    print((await http.get("/predictions/today", headers={"X-API-Key": "wrong"})).status_code)
    r = await http.get("/predictions/today", headers={"X-API-Key": new_key})
    print(r.status_code, r.json())
```

Because the check is a dependency, protecting another endpoint is one extra parameter. You can also protect a whole router: `APIRouter(dependencies=[Depends(require_api_key)])`.

## Bearer tokens for users

For people, the usual flow is:

1. The user logs in once with email and password.
2. The server returns a **token**: a signed message saying "this is user 42, valid until 15:30".
3. The client sends it with every request in the header `Authorization: Bearer <token>`.
4. The server checks the **signature** and expiry. It doesn't need to look anything up, because only the server knows the secret key that makes a valid signature.

The standard format is **JWT** (JSON Web Token): three base64url-encoded parts, `header.payload.signature`. Here's a complete HS256 JWT implementation in the standard library, so nothing is hidden:

```python
import base64
import hashlib
import hmac
import json
import time

SECRET = b"change-me: load this from an environment variable"

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))

def create_token(user_id: int, role: str, minutes: int = 30) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({"sub": str(user_id), "role": role, "exp": int(time.time()) + 60 * minutes}).encode())
    signature = hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{b64url(signature)}"

def decode_token(token: str) -> dict:
    try:
        header, payload, signature = token.split(".")
    except ValueError:
        raise ValueError("malformed token")
    expected = hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(b64url(expected), signature):
        raise ValueError("bad signature")
    claims = json.loads(b64url_decode(payload))
    if claims["exp"] < time.time():
        raise ValueError("token expired")
    return claims

token = create_token(42, "user")
print(token[:50] + "...")
print(decode_token(token))

# Anyone can READ a JWT (it's only encoded, not encrypted)...
print(json.loads(b64url_decode(token.split(".")[1])))
# ...but changing it breaks the signature
h, p, s = token.split(".")
forged = b64url(json.dumps({"sub": "42", "role": "admin", "exp": 9999999999}).encode())
try:
    decode_token(f"{h}.{forged}.{s}")
except ValueError as e:
    print("forged token rejected:", e)
```

Two consequences: never put secrets in a token's payload (anyone can read it), and keep the signing key secret (anyone with it can forge tokens). In production use the `PyJWT` library, which also handles other algorithms and edge cases: `jwt.encode(claims, SECRET, algorithm="HS256")` and `jwt.decode(token, SECRET, algorithms=["HS256"])`.

## Putting it together: login, current user, roles

```python
import base64
import hashlib
import hmac
import json
import secrets
import time

import bcrypt
import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

SECRET = secrets.token_bytes(32)

def b64url(data): return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
def b64url_decode(text): return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))

def create_token(claims, minutes=30):
    head = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64url(json.dumps({**claims, "exp": int(time.time()) + 60 * minutes}).encode())
    sig = b64url(hmac.new(SECRET, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"

def decode_token(token):
    head, body, sig = token.split(".")
    if not hmac.compare_digest(b64url(hmac.new(SECRET, f"{head}.{body}".encode(), hashlib.sha256).digest()), sig):
        raise ValueError("bad signature")
    claims = json.loads(b64url_decode(body))
    if claims["exp"] < time.time():
        raise ValueError("expired")
    return claims

def hash_password(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()

def verify_password(pw, stored):
    return bcrypt.checkpw(pw.encode(), stored.encode())

USERS = {
    "ada@example.com": {"id": 1, "role": "admin", "password_hash": hash_password("lovelace-1815")},
    "bob@example.com": {"id": 2, "role": "user", "password_hash": hash_password("builder-2024")},
}

class Login(BaseModel):
    email: str
    password: str

bearer = HTTPBearer(auto_error=False)

async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    try:
        return decode_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})

async def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return user

app = FastAPI()

@app.post("/auth/login")
async def login(body: Login):
    user = USERS.get(body.email)
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")   # same message either way
    return {"access_token": create_token({"sub": str(user["id"]), "role": user["role"]}), "token_type": "bearer"}

@app.get("/me")
async def me(user: dict = Depends(current_user)):
    return {"user_id": user["sub"], "role": user["role"]}

@app.post("/admin/recalculate-ratings")
async def recalculate(admin: dict = Depends(require_admin)):
    return {"status": "started", "by": admin["sub"]}

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    print("wrong password:", (await client.post("/auth/login", json={"email": "bob@example.com", "password": "x"})).status_code)
    bob = (await client.post("/auth/login", json={"email": "bob@example.com", "password": "builder-2024"})).json()["access_token"]
    ada = (await client.post("/auth/login", json={"email": "ada@example.com", "password": "lovelace-1815"})).json()["access_token"]
    print("no token:", (await client.get("/me")).status_code)
    print("bob /me:", (await client.get("/me", headers={"Authorization": f"Bearer {bob}"})).json())
    print("bob admin:", (await client.post("/admin/recalculate-ratings", headers={"Authorization": f"Bearer {bob}"})).status_code)
    print("ada admin:", (await client.post("/admin/recalculate-ratings", headers={"Authorization": f"Bearer {ada}"})).json())
```

Notice the layering: `require_admin` depends on `current_user`, which depends on the bearer header. Each endpoint just declares what it needs. The login returns the same error for an unknown email and a wrong password, so attackers can't use it to discover which emails have accounts.

FastAPI also provides `OAuth2PasswordBearer`, which plugs the standard OAuth2 password flow into the `/docs` page's **Authorize** button (it needs the `python-multipart` package for form data). The logic is the same as above.

## A security checklist

- **HTTPS everywhere.** Tokens and passwords travel in headers and bodies; without TLS anyone on the network can read them. Hosting platforms provide HTTPS automatically.
- **Secrets in environment variables**, never in code or git (lesson 8).
- **Short-lived access tokens** (minutes to an hour), with refresh tokens or re-login for longer sessions.
- **Rate-limit** login and expensive endpoints (`429 Too Many Requests`), to slow down guessing and abuse.
- **Validate all input** (Pydantic) and **return only what's needed** (response models).
- **CORS**: browsers block web pages from calling APIs on other domains unless the API allows it. Allow only your own front-end's origin with FastAPI's `CORSMiddleware`, never `"*"` together with credentials.
- **Log security events** (failed logins, permission denials), but never log passwords or tokens.
- **Don't roll your own crypto in production.** Building it here shows how it works; real systems use maintained libraries (pwdlib, PyJWT) or a managed identity service.

## Practice

:::exercise auth-hash Password hashing with bcrypt
Write three functions:

- `hash_password(password, rounds=12)`: hash with `bcrypt.hashpw` and `bcrypt.gensalt(rounds=rounds)`, returning a `str`.
- `verify_password(password, stored)`: check with `bcrypt.checkpw`, returning a bool.
- `cost_of(stored)`: the cost factor recorded in a bcrypt hash (the number between the second and third `$`), as an int. Apps use this to spot old hashes that should be re-hashed with a higher cost at the user's next login.

@@starter
import bcrypt

def hash_password(password, rounds=12):
    return password

def verify_password(password, stored):
    return password == stored

def cost_of(stored):
    return 0

@@solution
import bcrypt

def hash_password(password, rounds=12):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=rounds)).decode()

def verify_password(password, stored):
    return bcrypt.checkpw(password.encode(), stored.encode())

def cost_of(stored):
    return int(stored.split("$")[2])

@@tests
def test_format():
    """A bcrypt string with the requested cost, and no plain text"""
    stored = hash_password("secret123", rounds=4)
    assert isinstance(stored, str) and stored.startswith("$2b$04$") and "secret123" not in stored
    assert len(stored) == 60

def test_salted():
    """Same password, different hashes"""
    assert hash_password("secret123", rounds=4) != hash_password("secret123", rounds=4)

def test_verify_and_cost():
    """Right password passes, wrong fails; cost is read from the hash"""
    stored = hash_password("correct horse", rounds=5)
    assert verify_password("correct horse", stored) is True
    assert verify_password("correct hors", stored) is False
    assert cost_of(stored) == 5 and cost_of("$2b$12$" + "a" * 53) == 12
:::

:::exercise auth-key Protect a router with an API key
The starter has an app with two endpoints. Write a dependency `require_key` that reads the `X-API-Key` header (use `APIKeyHeader(name="X-API-Key", auto_error=False)`) and raises a **401** unless the key is in `VALID_KEYS`. Apply it to `GET /odds` only, leaving `GET /health` public.

@@starter
from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader

VALID_KEYS = {"pp_live_7f3a9c", "pp_test_51b2e0"}
app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/odds")
async def odds():
    return {"match": "Fairhaven v Lakeside", "home": 2.1}

@@solution
from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader

VALID_KEYS = {"pp_live_7f3a9c", "pp_test_51b2e0"}
app = FastAPI()
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def require_key(key: str | None = Security(api_key_header)):
    if key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return key

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/odds")
async def odds(key: str = Depends(require_key)):
    return {"match": "Fairhaven v Lakeside", "home": 2.1}

@@tests
import httpx

async def call(path, key=None):
    headers = {"X-API-Key": key} if key else {}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path, headers=headers)

async def test_health_public():
    """No key needed for /health"""
    assert (await call("/health")).status_code == 200

async def test_odds_protected():
    """Missing or wrong keys get 401; valid keys work"""
    assert (await call("/odds")).status_code == 401
    assert (await call("/odds", "pp_wrong")).status_code == 401
    r = await call("/odds", "pp_test_51b2e0")
    assert r.status_code == 200 and r.json()["home"] == 2.1
:::

:::exercise auth-token Verify a signed token
Tokens here have the form `"<payload>.<signature>"`, where `payload` is base64url-encoded JSON (no padding) and `signature` is the base64url-encoded (no padding) HMAC-SHA256 of the payload text with `SECRET`. Write `verify_token(token)` that returns the decoded claims dict if the signature is valid (compare with `hmac.compare_digest`) and `claims["exp"]` is in the future, and raises `ValueError` otherwise (including for malformed tokens). A `make_token` helper is provided.

@@starter
import base64
import hashlib
import hmac
import json
import time

SECRET = b"test-secret"

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def make_token(claims):
    payload = b64url(json.dumps(claims).encode())
    signature = b64url(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"

def verify_token(token):
    pass

@@solution
import base64
import hashlib
import hmac
import json
import time

SECRET = b"test-secret"

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def make_token(claims):
    payload = b64url(json.dumps(claims).encode())
    signature = b64url(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"

def verify_token(token):
    parts = token.split(".")
    if len(parts) != 2:
        raise ValueError("malformed token")
    payload, signature = parts
    expected = b64url(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, signature):
        raise ValueError("bad signature")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    if claims["exp"] <= time.time():
        raise ValueError("expired")
    return claims

@@tests
import base64
import json
import time

def raises(token):
    try:
        verify_token(token)
    except ValueError:
        return True
    return False

def test_valid():
    """A fresh token decodes to its claims"""
    claims = {"sub": "42", "role": "user", "exp": int(time.time()) + 600}
    assert verify_token(make_token(claims)) == claims

def test_tampered_and_expired():
    """Changed payloads, expired tokens and junk are rejected"""
    good = make_token({"sub": "42", "role": "user", "exp": int(time.time()) + 600})
    forged_payload = base64.urlsafe_b64encode(json.dumps({"sub": "42", "role": "admin", "exp": int(time.time()) + 600}).encode()).rstrip(b"=").decode()
    assert raises(forged_payload + "." + good.split(".")[1])
    assert raises(make_token({"sub": "42", "exp": int(time.time()) - 1}))
    assert raises("not-a-token")
:::

:::quiz auth-quiz Quick check
? Why use a slow, salted hash such as bcrypt for passwords, rather than plain SHA-256?
- [x] It makes guessing stolen hashes far more expensive, and identical passwords hash differently
- [ ] SHA-256 can't hash text
- [ ] Slow hashes are easier to reverse
> Salts defeat precomputed tables; iterations slow down brute force.

? A JWT's payload says `"role": "user"`. Can the client change it to `"admin"`?
- [x] They can edit it, but the signature will no longer match, so the server rejects it
- [ ] No, the payload is encrypted
- [ ] Yes, and the server will accept it
> JWTs are signed, not encrypted: readable by anyone, unforgeable without the key.

? A logged-in user calls an admin-only endpoint. Which status code should they get?
- [ ] 401
- [x] 403
- [ ] 404
> They're authenticated (we know who they are) but not authorised.

? Why should the login endpoint give the same error for "unknown email" and "wrong password"?
- [x] Different messages would let attackers find out which emails have accounts
- [ ] It's faster
- [ ] HTTP requires it
> Account enumeration is a real attack.
:::
