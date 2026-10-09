"""Train the Poisson goal model and save it for the API.

    python -m training.train_model                      # uses data/matches.csv
    python -m training.train_model --data path/to.csv --out models/match_model.joblib

The features come from app.ml.design_rows, the same function the API uses, so training and
serving can't drift apart.
"""

import argparse
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor

from app.ml import design_rows

XI = 0.004        # time decay per day: recent matches count more
ALPHA = 1e-3      # light L2 regularisation


def train(matches: pd.DataFrame) -> dict:
    teams = sorted(set(matches["HomeTeam"]) | set(matches["AwayTeam"]))
    index = {team: i for i, team in enumerate(teams)}
    x_home, x_away = design_rows(matches["HomeTeam"].map(index).to_numpy(), matches["AwayTeam"].map(index).to_numpy(), len(teams))
    age_days = (matches["Date"].max() - matches["Date"]).dt.days.to_numpy()
    weights = np.exp(-XI * age_days)
    model = PoissonRegressor(alpha=ALPHA, max_iter=1000).fit(
        np.vstack([x_home, x_away]),
        np.concatenate([matches["FTHG"], matches["FTAG"]]),
        sample_weight=np.concatenate([weights, weights]),
    )
    trained_through = matches["Date"].max().date()
    return {
        "model": model,
        "teams": teams,
        "version": f"poisson-{trained_through:%Y%m%d}",
        "trained_through": trained_through.isoformat(),
        "trained_on": date.today().isoformat(),
        "params": {"xi": XI, "alpha": ALPHA, "matches": len(matches)},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default="data/matches.csv")
    parser.add_argument("--out", default="models/match_model.joblib")
    args = parser.parse_args()

    matches = pd.read_csv(args.data, parse_dates=["Date"])
    bundle = train(matches)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.out)
    print(f"saved {bundle['version']} ({len(bundle['teams'])} teams, {len(matches)} matches) to {args.out}")


if __name__ == "__main__":
    main()
