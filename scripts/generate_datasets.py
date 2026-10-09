"""Generate the synthetic datasets in public/data.

All data is simulated with fixed seeds so lessons and tests are reproducible.
Run from the repo root:  python scripts/generate_datasets.py

The football file mirrors the layout of Football-Data.co.uk CSVs (FTHG, FTAG,
FTR, HS, AS, HST, AST, AvgH, AvgD, AvgA) so code written against it also works
on the real data after a download.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "public" / "data"

TEAMS = [
    "Ashford City", "Bramley Rovers", "Castleton United", "Dunmore Athletic", "Eastbrook Town",
    "Fairhaven FC", "Glenwood Wanderers", "Harrowgate Albion", "Ironbridge Town", "Kingsport United",
    "Lakeside Rangers", "Millbrook City", "Northgate Athletic", "Oakvale Rovers", "Portwell Town",
    "Queensbury FC", "Riverside United", "Stonebridge City", "Thornbury Athletic", "Westfield Wanderers",
]


def poisson_outcome_probs(lam_h: float, lam_a: float, max_goals: int = 10) -> tuple[float, float, float]:
    goals = np.arange(max_goals + 1)
    fact = np.array([math.factorial(int(k)) for k in goals], dtype=float)
    ph = np.exp(-lam_h) * lam_h**goals / fact
    pa = np.exp(-lam_a) * lam_a**goals / fact
    grid = np.outer(ph, pa)
    home = np.tril(grid, -1).sum()
    draw = np.trace(grid)
    away = np.triu(grid, 1).sum()
    total = home + draw + away
    return home / total, draw / total, away / total


def round_robin(teams: list[str], rng: np.random.Generator) -> list[list[tuple[str, str]]]:
    """Double round robin: 38 rounds of 10 matches, home and away."""
    t = teams.copy()
    rng.shuffle(t)
    n = len(t)
    rounds = []
    for r in range(n - 1):
        pairs = []
        for i in range(n // 2):
            a, b = t[i], t[n - 1 - i]
            pairs.append((a, b) if (r + i) % 2 == 0 else (b, a))
        rounds.append(pairs)
        t = [t[0]] + [t[-1]] + t[1:-1]
    second = [[(b, a) for a, b in rnd] for rnd in rounds]
    return rounds + second


def make_matches() -> pd.DataFrame:
    rng = np.random.default_rng(2024)
    attack = dict(zip(TEAMS, rng.normal(0, 0.22, len(TEAMS))))
    defence = dict(zip(TEAMS, rng.normal(0, 0.18, len(TEAMS))))
    base, home_adv = math.log(1.28), 0.21
    rows = []
    for season, start in [("2022-23", "2022-08-06"), ("2023-24", "2023-08-12"), ("2024-25", "2024-08-17")]:
        # Strengths drift between seasons (transfers, managers) ...
        for team in TEAMS:
            attack[team] = 0.75 * attack[team] + rng.normal(0, 0.1)
            defence[team] = 0.75 * defence[team] + rng.normal(0, 0.08)
        rounds = round_robin(TEAMS, rng)
        first_saturday = pd.Timestamp(start)
        for r, matches in enumerate(rounds):
            # ... and a little within a season (form, injuries).
            for team in TEAMS:
                attack[team] += rng.normal(0, 0.015)
                defence[team] += rng.normal(0, 0.012)
            round_date = first_saturday + pd.Timedelta(weeks=r)
            for k, (home, away) in enumerate(matches):
                day = round_date + pd.Timedelta(days=int(k >= 8))  # two games on Sunday
                lam_h = math.exp(base + home_adv + attack[home] - defence[away])
                lam_a = math.exp(base + attack[away] - defence[home])
                hg, ag = int(rng.poisson(lam_h)), int(rng.poisson(lam_a))
                hs = int(rng.poisson(lam_h * 8.5 + 2)) + hg
                as_ = int(rng.poisson(lam_a * 8.5 + 2)) + ag
                hst = hg + int(rng.binomial(max(hs - hg, 0), 0.25))
                ast = ag + int(rng.binomial(max(as_ - ag, 0), 0.25))
                # The bookmaker sees the true strengths with a little noise ...
                bh = lam_h * math.exp(rng.normal(0, 0.07))
                ba = lam_a * math.exp(rng.normal(0, 0.07))
                probs = np.array(poisson_outcome_probs(bh, ba))
                # ... and adds a margin, loaded onto longshots (favourite-longshot bias).
                margin = rng.uniform(0.045, 0.065)
                weights = (1 - probs) ** 1.5
                implied = probs + margin * weights / weights.sum()
                odds = np.round(1 / implied, 2)
                result = "H" if hg > ag else "A" if ag > hg else "D"
                rows.append(
                    [season, day.date().isoformat(), home, away, hg, ag, result, hs, as_, hst, ast, *odds]
                )
    cols = ["Season", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "HS", "AS", "HST", "AST",
            "AvgH", "AvgD", "AvgA"]
    return pd.DataFrame(rows, columns=cols).sort_values(["Date", "HomeTeam"], kind="stable").reset_index(drop=True)


def make_fx() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    dates = pd.bdate_range("2015-01-01", "2024-12-31")
    n = len(dates)
    vol = np.empty(n)
    v = 0.005
    for i in range(n):
        v = 0.97 * v + 0.03 * 0.0055 + rng.normal(0, 0.00025)  # slowly changing volatility
        if rng.random() < 0.004:
            v += 0.003  # occasional shock
        v = min(max(v, 0.0025), 0.014)
        vol[i] = v
    returns = rng.normal(0, 1, n) * vol
    close = 1.12 * np.exp(np.cumsum(returns))
    prev = np.concatenate([[1.12], close[:-1]])
    open_ = prev * (1 + rng.normal(0, 0.0004, n))
    spread_hi = np.abs(rng.normal(0, 1, n)) * vol * 0.6
    spread_lo = np.abs(rng.normal(0, 1, n)) * vol * 0.6
    high = np.maximum(open_, close) * (1 + spread_hi)
    low = np.minimum(open_, close) * (1 - spread_lo)
    return pd.DataFrame(
        {"Date": dates.date, "Open": open_.round(5), "High": high.round(5), "Low": low.round(5), "Close": close.round(5)}
    )


def make_sales() -> pd.DataFrame:
    rng = np.random.default_rng(11)
    products = [
        ("Espresso beans", "Coffee", 9.50, 14),
        ("Filter coffee", "Coffee", 7.00, 18),
        ("Green tea", "Tea", 4.50, 9),
        ("Earl Grey", "Tea", 4.00, 11),
        ("Flapjack", "Snacks", 2.20, 25),
        ("Almond croissant", "Snacks", 2.80, 21),
    ]
    stores = {"North": 1.0, "Centre": 1.45, "South": 0.8}
    weekday_effect = [0.9, 0.9, 0.95, 1.0, 1.15, 1.35, 1.1]
    rows = []
    for day in pd.date_range("2024-01-01", "2024-12-31"):
        season = 1 + 0.15 * math.cos((day.dayofyear - 15) / 366 * 2 * math.pi)  # busier in winter
        for store, s_eff in stores.items():
            for name, cat, price, base_units in products:
                promo = rng.random() < 0.05
                lam = base_units * s_eff * weekday_effect[day.dayofweek] * season * (1.6 if promo else 1)
                units = int(rng.poisson(lam))
                unit_price = round(price * (0.8 if promo else 1), 2)
                rows.append([day.date().isoformat(), store, name, cat, units, unit_price])
    return pd.DataFrame(rows, columns=["Date", "Store", "Product", "Category", "Units", "UnitPrice"])


def make_customers() -> pd.DataFrame:
    rng = np.random.default_rng(5)
    first = ["Ada", "Grace", "Alan", "Linus", "Margaret", "Guido", "Katherine", "Dennis", "Barbara", "Ken",
             "Frances", "Tim", "Radia", "Edsger", "Hedy"]
    last = ["Lovelace", "Hopper", "Turing", "Torvalds", "Hamilton", "van Rossum", "Johnson", "Ritchie", "Liskov",
            "Thompson", "Allen", "Berners-Lee", "Perlman", "Dijkstra", "Lamarr"]
    city_variants = {
        "London": ["London", "london", "LONDON", " London "],
        "Manchester": ["Manchester", "manchester", "Manchster"],
        "Leeds": ["Leeds", "leeds "],
        "Bristol": ["Bristol", "BRISTOL"],
    }
    plans = {"basic": ["basic", "Basic", "BASIC "], "premium": ["premium", "Premium", "PREMIUM"], "pro": ["pro", "Pro"]}
    spend = {"basic": 9.99, "premium": 19.99, "pro": 49.0}
    rows = []
    for i in range(1, 121):
        name = f"{first[rng.integers(len(first))]} {last[rng.integers(len(last))]}"
        if rng.random() < 0.15:
            name = "  " + name.lower() + " "
        city_key = list(city_variants)[rng.integers(len(city_variants))]
        city = city_variants[city_key][rng.integers(len(city_variants[city_key]))] if rng.random() > 0.06 else ""
        date = pd.Timestamp("2022-01-01") + pd.Timedelta(days=int(rng.integers(0, 900)))
        fmt = rng.random()
        if fmt < 0.6:
            signup = date.strftime("%Y-%m-%d")
        elif fmt < 0.85:
            signup = date.strftime("%d/%m/%Y")
        elif fmt < 0.97:
            signup = date.strftime("%b %d %Y")
        else:
            signup = "unknown"
        age_val = int(rng.integers(18, 75))
        r = rng.random()
        age = "" if r < 0.07 else ("-1" if r < 0.09 else ("230" if r < 0.1 else str(age_val)))
        plan_key = list(plans)[rng.choice(3, p=[0.55, 0.35, 0.10])]
        plan = plans[plan_key][rng.integers(len(plans[plan_key]))]
        amount = spend[plan_key] + (rng.choice([0, 0, 0, 5, 10]))
        r = rng.random()
        if r < 0.5:
            monthly = f"{amount:.2f}"
        elif r < 0.8:
            monthly = f"£{amount:.2f}"
        elif r < 0.93:
            monthly = f"{amount:g}"
        else:
            monthly = "N/A"
        rows.append([i, name, city, signup, age, plan, monthly])
    # A few exact duplicate rows, as if exported twice.
    for idx in [3, 17, 42, 88, 101]:
        rows.append(rows[idx - 1].copy())
    df = pd.DataFrame(rows, columns=["customer_id", "name", "city", "signup_date", "age", "plan", "monthly_spend"])
    return df.sample(frac=1, random_state=1).reset_index(drop=True)


def make_houses() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    n = 800
    neighbourhoods = {"Central": 1.45, "Riverside": 1.25, "Hillside": 1.1, "Suburbs": 0.95, "Industrial": 0.75}
    names = rng.choice(list(neighbourhoods), size=n, p=[0.15, 0.2, 0.2, 0.35, 0.1])
    size = np.clip(rng.normal(95, 32, n), 28, 320).round(0)
    bedrooms = np.clip(np.round(size / 32 + rng.normal(0, 0.6, n)), 1, 7).astype(int)
    bathrooms = np.clip(np.round(bedrooms / 2 + rng.normal(0, 0.4, n)), 1, 4).astype(int)
    age = np.clip(rng.exponential(30, n), 0, 120).round(0).astype(int)
    distance = np.clip(rng.gamma(2.2, 3.2, n), 0.3, 35).round(1)
    garden = (rng.random(n) < np.where(distance > 6, 0.75, 0.3)).astype(int)
    factor = np.array([neighbourhoods[x] for x in names])
    price = (
        3100 * size**0.95 * factor * np.exp(-0.018 * distance) * (1 - 0.0018 * age)
        + 14000 * bathrooms
        + 18000 * garden
    )
    price *= np.exp(rng.normal(0, 0.09, n))
    return pd.DataFrame(
        {
            "size_sqm": size.astype(int),
            "bedrooms": bedrooms,
            "bathrooms": bathrooms,
            "age_years": age,
            "distance_km": distance,
            "neighbourhood": names,
            "has_garden": garden,
            "price": (np.round(price / 1000) * 1000).astype(int),
        }
    )


def make_reviews() -> pd.DataFrame:
    rng = np.random.default_rng(3)
    products = ["kettle", "pair of headphones", "backpack", "phone case", "desk lamp", "blender", "keyboard", "water bottle",
                "pair of running shoes", "coffee grinder"]
    pos = ["works perfectly", "is great value for money", "is really well made", "is exactly as described",
           "is a joy to use", "arrived quickly and works great", "is excellent quality", "is one I'd buy again",
           "is not bad at all", "is better than I expected", "is super easy to use", "is my favourite purchase this year"]
    neg = ["stopped working after a week", "is a complete waste of money", "is cheap and flimsy", "is not as described",
           "left me really disappointed", "broke on the first day", "is terrible quality", "is one I would not recommend",
           "is not great", "is worse than I expected", "is far too noisy", "went straight back to the shop"]
    openers = ["", "Honestly, ", "Well, ", "So, ", "Overall ", "To be fair, "]
    closers = ["", ".", "!", ". Five stars.", ". One star.", " for the price."]
    rows = []
    for _ in range(400):
        sentiment = "positive" if rng.random() < 0.5 else "negative"
        phrase = (pos if sentiment == "positive" else neg)[rng.integers(12)]
        closer = closers[rng.integers(len(closers))]
        if (closer == ". Five stars." and sentiment == "negative") or (closer == ". One star." and sentiment == "positive"):
            closer = "."
        product = products[rng.integers(len(products))]
        text = f"{openers[rng.integers(len(openers))]}this {product} {phrase}{closer}".strip()
        rows.append([text[0].upper() + text[1:], sentiment])
    return pd.DataFrame(rows, columns=["review", "sentiment"])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "matches.csv": make_matches(),
        "eurusd_daily.csv": make_fx(),
        "sales.csv": make_sales(),
        "customers_messy.csv": make_customers(),
        "houses.csv": make_houses(),
        "reviews.csv": make_reviews(),
    }
    for name, df in outputs.items():
        df.to_csv(OUT / name, index=False)
        print(f"{name}: {len(df)} rows")


if __name__ == "__main__":
    main()
