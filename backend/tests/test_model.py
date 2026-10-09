import numpy as np

from app.ml import design_rows


def test_design_rows():
    x_home, x_away = design_rows(np.array([0, 2]), np.array([1, 0]), n_teams=3)
    # columns: attack of teams 0-2, defence of teams 0-2, home advantage
    assert x_home.tolist() == [[1, 0, 0, 0, 1, 0, 1], [0, 0, 1, 1, 0, 0, 1]]
    assert x_away.tolist() == [[0, 1, 0, 1, 0, 0, 0], [1, 0, 0, 0, 0, 1, 0]]


def test_probabilities_sum_to_one(goal_model):
    teams = goal_model.teams
    fixtures = [(teams[i], teams[(i + 3) % len(teams)]) for i in range(len(teams))]
    for p in goal_model.predict(fixtures):
        assert abs(p.p_home + p.p_draw + p.p_away - 1) < 1e-9
        assert 0.3 < p.expected_home_goals < 4 and 0.3 < p.expected_away_goals < 4
