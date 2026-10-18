from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from tobox.api import days, initiatives, metrics
from tobox.config import Settings, get_settings
from tobox.errors import DomainError

IMMUTABLE = "public, max-age=31536000, immutable"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Tobox", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    api = APIRouter(prefix="/api")

    @api.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "version": settings.version}

    api.include_router(initiatives.router)
    api.include_router(days.router)
    api.include_router(metrics.router)
    app.include_router(api)
    if settings.static_dir is not None:
        mount_spa(app, settings.static_dir)
    return app


def mount_spa(app: FastAPI, static_dir: Path) -> None:
    """Serve the built frontend. Registered after the API so /api routes always win."""
    root = static_dir.resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"TOBOX_STATIC_DIR has no index.html: {root}")

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404)
        file = (root / path).resolve()
        if path and file.is_file() and file.is_relative_to(root):
            # Vite content-hashes everything under assets/, so it can be cached forever.
            cache = IMMUTABLE if path.startswith("assets/") else "no-cache"
            return FileResponse(file, headers={"Cache-Control": cache})
        # Client-side routes (/plan, /history, …) fall back to the never-cached shell.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


app = create_app()
