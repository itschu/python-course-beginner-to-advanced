"""Loading the trained goal model and turning it into match probabilities."""

from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
from scipy import stats

MAX_GOALS = 10


def design_rows(home_ids: np.ndarray, away_ids: np.ndarray, n_teams: int) -> tuple[np.ndarray, np.ndarray]:
    """Feature rows for home goals (home attack vs away defence, plus home advantage) and away goals.

    Shared by training and serving, so the two can never disagree about the features.
    """
    n = len(home_ids)
    rows = np.arange(n)
    x_home = np.zeros((n, 2 * n_teams + 1))
    x_away = np.zeros((n, 2 * n_teams + 1))
    x_home[rows, home_ids] = 1
    x_home[rows, n_teams + away_ids] = 1
    x_home[:, -1] = 1
    x_away[rows, away_ids] = 1
    x_away[rows, n_teams + home_ids] = 1
    return x_home, x_away


@dataclass(frozen=True)
class MatchPrediction:
    home: str
    away: str
    expected_home_goals: float
    expected_away_goals: float
    p_home: float
    p_draw: float
    p_away: float


class GoalModel:
    """A fitted Poisson team-strength model plus the metadata needed to use it."""

    def __init__(self, bundle: dict):
        self.model = bundle["model"]
        self.teams: list[str] = bundle["teams"]
        self.version: str = bundle["version"]
        self.trained_through: str = bundle["trained_through"]
        self._index = {team: i for i, team in enumerate(self.teams)}

    @classmethod
    def load(cls, path: str | Path) -> "GoalModel":
        return cls(joblib.load(path))

    def knows(self, team: str) -> bool:
        return team in self._index

    def predict(self, fixtures: list[tuple[str, str]]) -> list[MatchPrediction]:
        """Vectorised: one model call for the whole batch."""
        home_ids = np.array([self._index[h] for h, _ in fixtures])
        away_ids = np.array([self._index[a] for _, a in fixtures])
        x_home, x_away = design_rows(home_ids, away_ids, len(self.teams))
        lam_home, lam_away = self.model.predict(x_home), self.model.predict(x_away)
        goals = np.arange(MAX_GOALS + 1)
        results = []
        for (home, away), lh, la in zip(fixtures, lam_home, lam_away):
            grid = np.outer(stats.poisson(lh).pmf(goals), stats.poisson(la).pmf(goals))
            grid /= grid.sum()
            results.append(MatchPrediction(
                home=home, away=away,
                expected_home_goals=float(lh), expected_away_goals=float(la),
                p_home=float(np.tril(grid, -1).sum()), p_draw=float(np.trace(grid)), p_away=float(np.triu(grid, 1).sum()),
            ))
        return results
