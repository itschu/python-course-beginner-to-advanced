---
title: Databases with SQL and SQLAlchemy
summary: Store and query data with SQL in SQLite - tables, filters, aggregates and joins - avoid SQL injection with parameters, then use SQLAlchemy's ORM to work with tables as Python classes and plug a database session into FastAPI.
minutes: 60
kind: lesson
---

An API needs somewhere to keep data that outlives a single request: users, bets, predictions, results. That's a **database**. Relational databases (PostgreSQL, MySQL, SQLite) store data in tables and are queried with **SQL**, a language every backend and data job expects you to know.

Python ships with **SQLite**, a complete database in a single file (or in memory), which is what this lesson uses. The same SQL works on PostgreSQL, which you'd use in production.

## Tables and queries

```python
import sqlite3

conn = sqlite3.connect(":memory:")          # a database in memory; use a filename to keep it
conn.execute("""
    CREATE TABLE teams (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        city TEXT
    )
""")
conn.executemany("INSERT INTO teams (name, city) VALUES (?, ?)", [
    ("Fairhaven FC", "Fairhaven"), ("Lakeside Rangers", "Lakeside"), ("Ashford City", "Ashford"),
])
conn.commit()

for row in conn.execute("SELECT id, name FROM teams WHERE city LIKE 'A%' OR id = 2 ORDER BY name"):
    print(row)
print(conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0], "teams")
```

- `CREATE TABLE` defines columns and their types. `PRIMARY KEY` gives each row a unique id; `NOT NULL` and `UNIQUE` are **constraints** the database enforces for you.
- `INSERT` adds rows, `SELECT … WHERE … ORDER BY` reads them, `UPDATE` and `DELETE` change and remove them.
- `commit()` makes changes permanent. Until then they're part of a **transaction** that can be rolled back.

## Real data: aggregates and joins

pandas can load a DataFrame into a table and run a query back into a DataFrame. Here are three seasons of matches, plus a teams table:

```python
import sqlite3

import pandas as pd

conn = sqlite3.connect(":memory:")
pd.read_csv("data/matches.csv").to_sql("matches", conn, index=False)
teams = pd.DataFrame({"name": sorted(pd.read_csv("data/matches.csv")["HomeTeam"].unique())})
teams["founded"] = [1880 + 7 * i for i in range(len(teams))]
teams.to_sql("teams", conn, index_label="id")

# Aggregates: home record per team in 2024-25
print(pd.read_sql_query("""
    SELECT HomeTeam AS team,
           COUNT(*) AS played,
           SUM(FTR = 'H') AS won,
           ROUND(AVG(FTHG), 2) AS avg_goals
    FROM matches
    WHERE Season = '2024-25'
    GROUP BY HomeTeam
    HAVING won >= 10
    ORDER BY won DESC, avg_goals DESC
""", conn))

# A join: combine rows from two tables on a matching column
print(pd.read_sql_query("""
    SELECT m.Date, m.HomeTeam, t.founded, m.FTHG, m.FTAG
    FROM matches AS m
    JOIN teams AS t ON t.name = m.HomeTeam
    WHERE m.Season = '2024-25' AND t.founded < 1900
    ORDER BY m.Date
    LIMIT 5
""", conn))
```

| SQL | pandas equivalent |
| --- | --- |
| `WHERE` | boolean filtering `df[df.col == x]` |
| `GROUP BY … COUNT/SUM/AVG` | `df.groupby(...).agg(...)` |
| `HAVING` | filtering after `groupby` |
| `JOIN … ON` | `df.merge(other, on=...)` |
| `ORDER BY … LIMIT` | `df.sort_values(...).head(n)` |

## SQL injection: always use parameters

Never build SQL by pasting user input into a string. Watch what a crafted "team name" does:

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE bets (id INTEGER PRIMARY KEY, user TEXT, stake REAL)")
conn.executemany("INSERT INTO bets (user, stake) VALUES (?, ?)", [("ada", 10), ("bob", 25), ("cy", 5)])

user_input = "nobody' OR '1'='1"

unsafe = f"SELECT * FROM bets WHERE user = '{user_input}'"          # DON'T do this
print("unsafe query:", unsafe)
print("returned:", conn.execute(unsafe).fetchall())                 # every user's bets!

safe = conn.execute("SELECT * FROM bets WHERE user = ?", (user_input,)).fetchall()
print("parameterised query returned:", safe)                         # nothing: no such user
```

With a `?` placeholder, the database treats the input purely as a value, never as SQL. SQL injection has caused some of the largest data breaches ever; parameters (or an ORM, which uses them for you) prevent it completely.

## SQLAlchemy: tables as Python classes

Writing SQL strings everywhere gets repetitive and error-prone in a large application. **SQLAlchemy**, Python's standard database toolkit, lets you define tables as classes (the **ORM**, object-relational mapper) and build queries in Python. It works with SQLite, PostgreSQL, MySQL and others with the same code.

```python
from datetime import date

from sqlalchemy import ForeignKey, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    home_matches: Mapped[list["Match"]] = relationship(back_populates="home_team", foreign_keys="Match.home_id")

class Match(Base):
    __tablename__ = "matches"
    id: Mapped[int] = mapped_column(primary_key=True)
    kickoff: Mapped[date]
    home_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    away_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    home_goals: Mapped[int | None]
    away_goals: Mapped[int | None]
    home_team: Mapped[Team] = relationship(back_populates="home_matches", foreign_keys=[home_id])
    away_team: Mapped[Team] = relationship(foreign_keys=[away_id])

engine = create_engine("sqlite://")              # in-memory SQLite; "postgresql+psycopg://..." in production
Base.metadata.create_all(engine)                 # creates the tables

with Session(engine) as session:
    fair, lake, ash = Team(name="Fairhaven FC"), Team(name="Lakeside Rangers"), Team(name="Ashford City")
    session.add_all([
        Match(kickoff=date(2024, 8, 17), home_team=fair, away_team=lake, home_goals=2, away_goals=1),
        Match(kickoff=date(2024, 8, 24), home_team=ash, away_team=fair, home_goals=0, away_goals=0),
        Match(kickoff=date(2024, 8, 31), home_team=fair, away_team=ash, home_goals=None, away_goals=None),
    ])
    session.commit()

    # Queries are built with select(); session.scalars() returns model objects
    upcoming = session.scalars(select(Match).where(Match.home_goals.is_(None))).all()
    for m in upcoming:
        print("upcoming:", m.kickoff, m.home_team.name, "v", m.away_team.name)

    # Relationships let you navigate between tables
    print("Fairhaven home fixtures:", [str(m.kickoff) for m in fair.home_matches])

    # Aggregates and joins
    stmt = (select(Team.name, func.sum(Match.home_goals).label("goals"))
            .join(Match, Match.home_id == Team.id)
            .group_by(Team.name)
            .order_by(Team.name))
    print(session.execute(stmt).all())
    print(stmt)                                  # the SQL SQLAlchemy generates
```

- `Mapped[int]` and `mapped_column(...)` declare columns with type hints; `Mapped[int | None]` means the column can be NULL.
- `relationship()` links objects through foreign keys, so `match.home_team.name` just works.
- A **session** tracks the objects you load and change, and writes everything to the database in one transaction when you `commit()`.

## A database session in FastAPI

Each request should get its own session, closed afterwards even if something fails. That's what FastAPI's **dependencies** are for: a function that `yield`s a resource, declared with `Depends`.

```python
import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

class Base(DeclarativeBase):
    pass

class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)

# StaticPool shares one connection, so every session sees the same in-memory database
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)

async def get_session():
    with Session(engine) as session:     # opened for this request...
        yield session                    # ...handed to the endpoint...
                                         # ...and closed afterwards, whatever happens

class TeamIn(BaseModel):
    name: str

class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)    # read fields from ORM objects
    id: int
    name: str

app = FastAPI()

@app.post("/teams", response_model=TeamOut, status_code=201)
async def create_team(team: TeamIn, session: Session = Depends(get_session)):
    if session.scalar(select(Team).where(Team.name == team.name)):
        raise HTTPException(status_code=409, detail="Team already exists")
    row = Team(name=team.name)
    session.add(row)
    session.commit()
    session.refresh(row)                 # load the id the database assigned
    return row

@app.get("/teams", response_model=list[TeamOut])
async def list_teams(session: Session = Depends(get_session)):
    return session.scalars(select(Team).order_by(Team.name)).all()

async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    for name in ["Lakeside Rangers", "Fairhaven FC", "Fairhaven FC"]:
        r = await client.post("/teams", json={"name": name})
        print(r.status_code, r.json())
    print((await client.get("/teams")).json())
```

- `ConfigDict(from_attributes=True)` lets a Pydantic model read an ORM object's attributes, so endpoints can return database rows directly.
- **409 Conflict** is the right status for "that already exists".
- On a real server the database would be a file or a PostgreSQL server, not memory, and schema changes would be managed with **migrations** (the Alembic tool), never by editing tables by hand.

## Practice

:::exercise sql-query Write the SQL
The tests load the course's matches into a SQLite table called `matches` (with the same columns as `matches.csv`). Set `QUERY` to a SQL string that returns, for the **2024-25** season, each **away** team's name (as `team`) and its number of away wins (as `wins`), ordered by wins descending, then team name ascending, keeping only the top 5.

@@starter
QUERY = """
SELECT ...
"""

@@solution
QUERY = """
SELECT AwayTeam AS team, SUM(FTR = 'A') AS wins
FROM matches
WHERE Season = '2024-25'
GROUP BY AwayTeam
ORDER BY wins DESC, team ASC
LIMIT 5
"""

@@tests
import sqlite3
import pandas as pd

def run():
    conn = sqlite3.connect(":memory:")
    df = pd.read_csv("data/matches.csv")
    df.to_sql("matches", conn, index=False)
    return pd.read_sql_query(QUERY, conn), df

def test_columns_and_rows():
    """Columns team and wins, five rows"""
    result, _ = run()
    assert list(result.columns) == ["team", "wins"] and len(result) == 5

def test_values():
    """Matches the same calculation in pandas"""
    result, df = run()
    season = df[df["Season"] == "2024-25"]
    expected = (season.assign(win=season["FTR"] == "A").groupby("AwayTeam")["win"].sum()
                .reset_index().sort_values(["win", "AwayTeam"], ascending=[False, True]).head(5))
    assert result["team"].tolist() == expected["AwayTeam"].tolist()
    assert result["wins"].tolist() == expected["win"].astype(int).tolist()
:::

:::exercise sql-safe A safe query function
Write `bets_for_user(conn, user, min_stake=0)` that returns a list of `(id, stake)` tuples for that user's bets with stake of at least `min_stake`, ordered by `id`, from a table `bets(id, user, stake)`. Use `?` placeholders: the tests include an injection attempt.

@@starter
def bets_for_user(conn, user, min_stake=0):
    return conn.execute(f"SELECT id, stake FROM bets WHERE user = '{user}' AND stake >= {min_stake} ORDER BY id").fetchall()

@@solution
def bets_for_user(conn, user, min_stake=0):
    return conn.execute(
        "SELECT id, stake FROM bets WHERE user = ? AND stake >= ? ORDER BY id", (user, min_stake)
    ).fetchall()

@@tests
import sqlite3

def make_db():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE bets (id INTEGER PRIMARY KEY, user TEXT, stake REAL)")
    conn.executemany("INSERT INTO bets (user, stake) VALUES (?, ?)",
                     [("ada", 10), ("bob", 25), ("ada", 2.5), ("cy", 5), ("ada", 40)])
    return conn

def test_filters():
    """User and minimum stake"""
    conn = make_db()
    assert bets_for_user(conn, "ada") == [(1, 10.0), (3, 2.5), (5, 40.0)]
    assert bets_for_user(conn, "ada", min_stake=10) == [(1, 10.0), (5, 40.0)]

def test_injection_attempt():
    """A crafted name returns nothing, not everyone's bets"""
    conn = make_db()
    assert bets_for_user(conn, "x' OR '1'='1") == []

def test_quotes_in_names():
    """Names with apostrophes work"""
    conn = make_db()
    conn.execute("INSERT INTO bets (user, stake) VALUES (?, ?)", ("o'neil", 7))
    assert bets_for_user(conn, "o'neil") == [(6, 7.0)]
:::

:::exercise sql-orm An ORM model and queries
Using SQLAlchemy, define a model `Bet` (table name `"bets"`) with columns `id` (integer primary key), `user` (string), `stake` (float) and `settled` (bool, default `False`). Then write `total_staked(session, user)`, returning the sum of that user's stakes as a float (0.0 if none), and `unsettled_count(session)`, returning how many bets have `settled == False`.

@@starter
from sqlalchemy import String, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

class Base(DeclarativeBase):
    pass

def total_staked(session, user):
    return 0.0

def unsettled_count(session):
    return 0

@@solution
from sqlalchemy import String, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

class Base(DeclarativeBase):
    pass

class Bet(Base):
    __tablename__ = "bets"
    id: Mapped[int] = mapped_column(primary_key=True)
    user: Mapped[str] = mapped_column(String(50))
    stake: Mapped[float]
    settled: Mapped[bool] = mapped_column(default=False)

def total_staked(session, user):
    return float(session.scalar(select(func.coalesce(func.sum(Bet.stake), 0.0)).where(Bet.user == user)))

def unsettled_count(session):
    return session.scalar(select(func.count()).select_from(Bet).where(Bet.settled.is_(False)))

@@tests
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

def make_session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = Session(engine)
    session.add_all([Bet(user="ada", stake=10), Bet(user="ada", stake=2.5, settled=True),
                     Bet(user="bob", stake=25), Bet(user="cy", stake=5, settled=True)])
    session.commit()
    return session

def test_model():
    """Columns and default"""
    session = make_session()
    bet = session.get(Bet, 1)
    assert bet.user == "ada" and bet.stake == 10 and bet.settled is False

def test_queries():
    """Totals and counts"""
    session = make_session()
    assert total_staked(session, "ada") == 12.5
    assert total_staked(session, "nobody") == 0.0
    assert unsettled_count(session) == 2
:::

:::quiz sql-quiz Quick check
? Why must user input never be pasted directly into a SQL string?
- [x] Crafted input can change the query itself (SQL injection)
- [ ] It makes queries slower
- [ ] SQL can't contain text
> Use `?` placeholders or an ORM, which treat input purely as values.

? Which SQL clause filters groups *after* aggregation?
- [ ] WHERE
- [x] HAVING
- [ ] ORDER BY
> WHERE filters rows before grouping; HAVING filters the grouped results.

? What does a FastAPI dependency that `yield`s a database session give you?
- [x] One session per request, reliably closed afterwards even if the endpoint fails
- [ ] A single session shared by all users forever
- [ ] Automatic caching of every query
> Code after the `yield` runs when the request is finished.

? Which status code fits "a team with that name already exists"?
- [ ] 404
- [x] 409
- [ ] 500
> 409 Conflict: the request clashes with the current state.
:::
