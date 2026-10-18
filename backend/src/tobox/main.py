from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tobox.api import days, initiatives, metrics
from tobox.config import get_settings


def create_app() -> FastAPI:
    app = FastAPI(title="Tobox", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    api = APIRouter(prefix="/api")

    @api.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    api.include_router(initiatives.router)
    api.include_router(days.router)
    api.include_router(metrics.router)
    app.include_router(api)
    return app


app = create_app()
