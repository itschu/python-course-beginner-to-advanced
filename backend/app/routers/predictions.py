"""Prediction endpoints. All require an API key, and every prediction is logged.

These endpoints are plain `def`: they do CPU and database work, so FastAPI runs them in a thread
pool and the event loop stays free for other requests. (The course's browser runner has no threads,
which is why the lessons use `async def` throughout.)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import PredictionLog, get_session
from app.ml import GoalModel, MatchPrediction
from app.schemas import BatchRequest, Fixture, LoggedPrediction, Prediction, Probabilities
from app.security import require_api_key

router = APIRouter(prefix="/predictions", tags=["predictions"], dependencies=[Depends(require_api_key)])


def to_response(p: MatchPrediction, version: str) -> Prediction:
    probs = Probabilities(home=round(p.p_home, 4), draw=round(p.p_draw, 4), away=round(p.p_away, 4))
    return Prediction(
        home=p.home,
        away=p.away,
        expected_goals={"home": round(p.expected_home_goals, 3), "away": round(p.expected_away_goals, 3)},
        probabilities=probs,
        fair_odds=Probabilities(home=round(1 / p.p_home, 2), draw=round(1 / p.p_draw, 2), away=round(1 / p.p_away, 2)),
        model_version=version,
    )


def predict_and_log(fixtures: list[Fixture], model: GoalModel, session: Session, client: str) -> list[Prediction]:
    unknown = sorted({t for f in fixtures for t in (f.home, f.away) if not model.knows(t)})
    if unknown:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown team(s): {', '.join(unknown)}")
    predictions = model.predict([(f.home, f.away) for f in fixtures])
    session.add_all([
        PredictionLog(home=p.home, away=p.away, p_home=p.p_home, p_draw=p.p_draw, p_away=p.p_away,
                      model_version=model.version, client=client)
        for p in predictions
    ])
    session.commit()
    return [to_response(p, model.version) for p in predictions]


@router.get("", response_model=Prediction)
def predict(
    request: Request,
    home: str = Query(min_length=1, max_length=60),
    away: str = Query(min_length=1, max_length=60),
    session: Session = Depends(get_session),
    client: str = Depends(require_api_key),
) -> Prediction:
    if home == away:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="A team can't play itself")
    return predict_and_log([Fixture(home=home, away=away)], request.app.state.model, session, client)[0]


@router.post("/batch", response_model=list[Prediction])
def predict_batch(
    body: BatchRequest,
    request: Request,
    session: Session = Depends(get_session),
    client: str = Depends(require_api_key),
    settings: Settings = Depends(get_settings),
) -> list[Prediction]:
    if len(body.fixtures) > settings.max_batch_size:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail=f"At most {settings.max_batch_size} fixtures per request")
    return predict_and_log(body.fixtures, request.app.state.model, session, client)


@router.get("/log", response_model=list[LoggedPrediction])
def recent_predictions(
    limit: int = Query(20, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[PredictionLog]:
    return list(session.scalars(select(PredictionLog).order_by(PredictionLog.id.desc()).limit(limit)))
