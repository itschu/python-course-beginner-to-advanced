import math

import pytest

pytestmark = pytest.mark.anyio


async def test_health_is_public(client, goal_model):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model_version": goal_model.version, "trained_through": goal_model.trained_through}


async def test_teams(client):
    teams = (await client.get("/teams")).json()
    assert len(teams) == 20 and "Fairhaven FC" in teams and teams == sorted(teams)


@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}])
async def test_predictions_need_a_valid_key(client, headers):
    r = await client.get("/predictions", params={"home": "Fairhaven FC", "away": "Lakeside Rangers"}, headers=headers)
    assert r.status_code == 401


async def test_prediction(client, auth, goal_model):
    r = await client.get("/predictions", params={"home": "Fairhaven FC", "away": "Lakeside Rangers"}, headers=auth)
    assert r.status_code == 200
    body = r.json()
    probs = body["probabilities"]
    assert math.isclose(probs["home"] + probs["draw"] + probs["away"], 1, abs_tol=1e-3)
    assert body["model_version"] == goal_model.version
    assert math.isclose(body["fair_odds"]["home"], 1 / probs["home"], rel_tol=0.01)
    assert r.headers["X-Request-ID"]


async def test_home_advantage(client, auth):
    """The same two teams: each is more likely to win at home."""
    a = (await client.get("/predictions", params={"home": "Ashford City", "away": "Bramley Rovers"}, headers=auth)).json()
    b = (await client.get("/predictions", params={"home": "Bramley Rovers", "away": "Ashford City"}, headers=auth)).json()
    assert a["probabilities"]["home"] > b["probabilities"]["away"]
    assert b["probabilities"]["home"] > a["probabilities"]["away"]


async def test_unknown_team(client, auth):
    r = await client.get("/predictions", params={"home": "Fairhaven FC", "away": "Real Madrid"}, headers=auth)
    assert r.status_code == 404 and "Real Madrid" in r.json()["detail"]


async def test_same_team(client, auth):
    r = await client.get("/predictions", params={"home": "Fairhaven FC", "away": "Fairhaven FC"}, headers=auth)
    assert r.status_code == 422


async def test_batch_and_log(client, auth):
    fixtures = [{"home": "Ashford City", "away": "Bramley Rovers"}, {"home": "Oakvale Rovers", "away": "Kingsport United"}]
    r = await client.post("/predictions/batch", json={"fixtures": fixtures}, headers=auth)
    assert r.status_code == 200 and [p["home"] for p in r.json()] == ["Ashford City", "Oakvale Rovers"]

    log = (await client.get("/predictions/log", headers=auth)).json()
    assert [entry["home"] for entry in log] == ["Oakvale Rovers", "Ashford City"]      # newest first


async def test_batch_limits(client, auth):
    too_many = [{"home": "Ashford City", "away": "Bramley Rovers"}] * 6                # test settings allow 5
    assert (await client.post("/predictions/batch", json={"fixtures": too_many}, headers=auth)).status_code == 422
    assert (await client.post("/predictions/batch", json={"fixtures": []}, headers=auth)).status_code == 422
    same = [{"home": "Ashford City", "away": "Ashford City"}]
    assert (await client.post("/predictions/batch", json={"fixtures": same}, headers=auth)).status_code == 422


async def test_each_test_gets_a_fresh_database(client, auth):
    assert (await client.get("/predictions/log", headers=auth)).json() == []
