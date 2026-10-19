# syntax=docker/dockerfile:1
# One image = the whole app: FastAPI serves the API under /api and the built SPA everywhere else.

# The frontend build is architecture-independent, so run it natively even for arm64 images.
FROM --platform=$BUILDPLATFORM node:25-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build

FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies first for layer caching.
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project

COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

COPY --from=web /web/dist ./static

RUN useradd --create-home --uid 1000 tobox && mkdir -p /data && chown tobox /data
USER tobox

ARG VERSION=dev
ENV PATH="/app/.venv/bin:$PATH" \
    TOBOX_DATABASE_URL=sqlite:////data/tobox.db \
    TOBOX_STATIC_DIR=/app/static \
    TOBOX_CORS_ORIGINS='[]' \
    TOBOX_VERSION=$VERSION
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn tobox.main:app --host 0.0.0.0 --port 8000"]
