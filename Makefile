# Single entry point for humans and agents. `make help` lists targets.
.DEFAULT_GOAL := help
SHELL := /bin/bash

BACKEND := backend
FRONTEND := frontend
UV := cd $(BACKEND) && uv run
NPM := cd $(FRONTEND) && npm run --silent

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- Setup -------------------------------------------------------------------------------------

.PHONY: setup
setup: ## Install all dependencies (backend, frontend, Playwright browser)
	cd $(BACKEND) && uv sync
	cd $(FRONTEND) && npm ci
	cd $(FRONTEND) && npx playwright install chromium
	git config core.hooksPath .githooks

# --- Dev ---------------------------------------------------------------------------------------

.PHONY: dev dev-api dev-web
dev: migrate ## Run API (:8000) and web (:5173) with reload
	@$(MAKE) -j2 dev-api dev-web

dev-api:
	$(UV) uvicorn tobox.main:app --reload --port 8000

dev-web:
	$(NPM) dev -- --port 5173

.PHONY: migrate migration seed
migrate: ## Apply DB migrations
	$(UV) alembic upgrade head

migration: ## Autogenerate a migration: make migration m="add foo"
	@test -n "$(m)" || (echo 'usage: make migration m="message"' && exit 1)
	$(UV) alembic revision --autogenerate -m "$(m)"

seed: migrate ## Load ~60 days of demo data into an empty dev DB
	$(UV) python -m tobox.seed

# --- API contract ------------------------------------------------------------------------------

.PHONY: api-types api-check
api-types: ## Regenerate frontend/openapi.json and TS types from the backend schemas
	$(UV) python -m tobox.openapi > ../$(FRONTEND)/openapi.json
	$(NPM) gen:api

api-check: ## Fail if generated API types are stale
	@$(MAKE) --no-print-directory api-types >/dev/null
	@git diff --exit-code -- $(FRONTEND)/openapi.json $(FRONTEND)/src/api/schema.d.ts \
		|| (echo "API types are stale: run 'make api-types' and commit." && exit 1)

# --- Quality -----------------------------------------------------------------------------------

.PHONY: fmt lint typecheck test test-backend test-frontend e2e check
fmt: ## Auto-format everything
	$(UV) ruff format .
	$(UV) ruff check --fix .
	$(NPM) format

lint: ## Lint (ruff, oxlint, prettier --check)
	$(UV) ruff format --check .
	$(UV) ruff check .
	$(NPM) lint
	$(NPM) format:check

typecheck: ## Type-check (mypy --strict, tsc)
	$(UV) mypy
	$(NPM) typecheck

test-backend: ## Backend tests (pytest)
	$(UV) pytest

test-frontend: ## Frontend unit tests (vitest)
	$(NPM) test

test: test-backend test-frontend ## All unit/integration tests

e2e: ## End-to-end tests (Playwright; boots isolated servers)
	$(NPM) test:e2e

check: lint typecheck test ## Everything CI runs except e2e — run before every commit

# --- Visual ------------------------------------------------------------------------------------

.PHONY: shoot
shoot: ## Screenshot pages from the running dev server: make shoot p="/plan /today" [f="--mobile --dark"]
	cd $(FRONTEND) && node scripts/shoot.mjs $(f) $(or $(p),/plan /today /review /history /initiatives)

# --- Docker ------------------------------------------------------------------------------------

.PHONY: image up down logs
image: ## Build the Docker image locally and smoke-test it (same check CI runs)
	docker build -t tobox:local --build-arg VERSION=local .
	scripts/smoke-image.sh tobox:local local

up: ## Build from source and start the app on :8080
	docker compose up -d --build

down: ## Stop the stack (data volume is kept)
	docker compose down

logs: ## Tail stack logs
	docker compose logs -f
