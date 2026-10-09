"""Generate public/data/poisson_predictions.csv.

Walk-forward predictions from the time-weighted Poisson goal model taught in
Phase 6 ("Goal models"), so later lessons can use them without waiting for the
model to be refitted in the browser. For each month of the 2023-24 and 2024-25
seasons, the model is fitted on all earlier matches only (no leakage).

Run from the repo root:  python scripts/generate_model_predictions.py
"""

from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import PoissonRegressor

DATA = Path(__file__).resolve().parent.parent / "public" / "data"
XI = 0.004          # time decay per day (half-life about 173 days)
ALPHA = 1e-3        # light L2 regularisation


def team_design(df, teams):
    index = {t: i for i, t in enumerate(teams)}
    n, T = len(df), len(teams)
    h, a, r = df["HomeTeam"].map(index).to_numpy(), df["AwayTeam"].map(index).to_numpy(), np.arange(n)
    Xh, Xa = np.zeros((n, 2 * T + 1)), np.zeros((n, 2 * T + 1))
    Xh[r, h], Xh[r, T + a], Xh[:, 2 * T] = 1, 1, 1
    Xa[r, a], Xa[r, T + h] = 1, 1
    return Xh, Xa


def outcome_probs(lam_home, lam_away, max_goals=10):
    g = np.arange(max_goals + 1)
    rows = []
    for lh, la in zip(lam_home, lam_away):
        m = np.outer(stats.poisson(lh).pmf(g), stats.poisson(la).pmf(g))
        m /= m.sum()
        rows.append((np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()))
    return np.array(rows)


def main() -> None:
    df = pd.read_csv(DATA / "matches.csv", parse_dates=["Date"])
    teams = sorted(df["HomeTeam"].unique())
    parts = []
    for season in ["2023-24", "2024-25"]:
        test = df[df["Season"] == season]
        for _, chunk in test.groupby(test["Date"].dt.to_period("M")):
            start = chunk["Date"].min()
            train = df[df["Date"] < start]
            Xh, Xa = team_design(train, teams)
            w = np.exp(-XI * (start - train["Date"]).dt.days.to_numpy())
            model = PoissonRegressor(alpha=ALPHA, max_iter=1000).fit(
                np.vstack([Xh, Xa]), np.concatenate([train["FTHG"], train["FTAG"]]), sample_weight=np.concatenate([w, w])
            )
            ch, ca = team_design(chunk, teams)
            lam_h, lam_a = model.predict(ch), model.predict(ca)
            probs = outcome_probs(lam_h, lam_a)
            out = chunk[["Season", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "AvgH", "AvgD", "AvgA"]].copy()
            out["LamH"], out["LamA"] = lam_h.round(4), lam_a.round(4)
            out["pH"], out["pD"], out["pA"] = probs[:, 0].round(10), probs[:, 1].round(10), probs[:, 2].round(10)  # sums to 1 within 1e-9
            parts.append(out)
    result = pd.concat(parts).sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
    result["Date"] = result["Date"].dt.date
    result.to_csv(DATA / "poisson_predictions.csv", index=False)
    print(f"poisson_predictions.csv: {len(result)} rows")


if __name__ == "__main__":
    main()
