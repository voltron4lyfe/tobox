import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from tobox import agents, auth
from tobox.api import agents as agents_api
from tobox.api import days, initiatives, metrics, notifications, preferences, session
from tobox.config import Settings, get_settings
from tobox.db import SessionLocal
from tobox.errors import DomainError
from tobox.notify import scheduler

IMMUTABLE = "public, max-age=31536000, immutable"


def create_app(
    settings: Settings | None = None, session_factory: Callable[[], Session] | None = None
) -> FastAPI:
    """`session_factory` serves the MCP server and scheduler; REST routes use `get_session`."""
    settings = settings or get_settings()
    sessions = session_factory or SessionLocal
    background: list[Callable[[], AbstractAsyncContextManager[None]]] = []

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        task = asyncio.create_task(scheduler.run(sessions)) if settings.scheduler_enabled else None
        try:
            if background:
                async with background[0]():
                    yield
            else:
                yield
        finally:
            if task:
                task.cancel()

    app = FastAPI(title="Tobox", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.password_guard = auth.PasswordGuard()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    # Added last so it runs first: nothing is served for a foreign Host header.
    app.add_middleware(auth.RequestGuard, settings=settings)

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    api = APIRouter(prefix="/api")

    @api.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "version": settings.version}

    api.include_router(session.router)
    owner = [Depends(auth.require_owner)]
    for router in (initiatives, days, metrics, preferences, notifications, agents_api):
        api.include_router(router.router, dependencies=owner)
    app.include_router(api)
    background.append(agents.mount(app, sessions, settings))
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
