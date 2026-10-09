"""Request and response models: the API's public contract."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Fixture(BaseModel):
    home: str = Field(min_length=1, max_length=60, examples=["Fairhaven FC"])
    away: str = Field(min_length=1, max_length=60, examples=["Lakeside Rangers"])

    @model_validator(mode="after")
    def different_teams(self):
        if self.home == self.away:
            raise ValueError("a team can't play itself")
        return self


class BatchRequest(BaseModel):
    fixtures: list[Fixture] = Field(min_length=1)


class Probabilities(BaseModel):
    home: float
    draw: float
    away: float


class Prediction(BaseModel):
    home: str
    away: str
    expected_goals: dict[str, float]
    probabilities: Probabilities
    fair_odds: Probabilities
    model_version: str


class LoggedPrediction(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    home: str
    away: str
    p_home: float
    p_draw: float
    p_away: float
    model_version: str


class Health(BaseModel):
    status: str
    model_version: str
    trained_through: str
