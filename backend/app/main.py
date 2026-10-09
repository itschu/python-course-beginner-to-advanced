"""Application factory. Run with:  uvicorn app.main:app --reload"""

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import get_engine, init_db
from app.ml import GoalModel
from app.routers import meta, predictions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("match_api")


def create_app(model: GoalModel | None = None, create_tables: bool = True) -> FastAPI:
    """Build the app. Tests pass in a model directly instead of loading one from disk."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings = get_settings()
        app.state.model = model or GoalModel.load(settings.model_file)
        if create_tables:
            init_db(get_engine())
        logger.info("loaded model %s (trained through %s)", app.state.model.version, app.state.model.trained_through)
        yield
        logger.info("shutting down")

    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],      # your front end's origin; never "*" with credentials
        allow_methods=["GET", "POST"],
        allow_headers=["X-API-Key", "Content-Type"],
    )

    @app.middleware("http")
    async def request_id_and_timing(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = 1000 * (time.perf_counter() - start)
        response.headers["X-Request-ID"] = request_id
        logger.info("%s %s %s %.1fms id=%s", request.method, request.url.path, response.status_code, elapsed_ms, request_id)
        return response

    app.include_router(meta.router)
    app.include_router(predictions.router)
    return app


app = create_app()
