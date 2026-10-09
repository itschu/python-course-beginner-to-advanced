"""Public endpoints: health check and the list of teams."""

from fastapi import APIRouter, Request

from app.schemas import Health

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=Health)
def health(request: Request) -> Health:
    model = request.app.state.model
    return Health(status="ok", model_version=model.version, trained_through=model.trained_through)


@router.get("/teams", response_model=list[str])
def list_teams(request: Request) -> list[str]:
    return request.app.state.model.teams
